-- =============================================================================
-- Audit finding F-01 (High): close the blanket admin bypass in
-- enforce_order_update_rules.
--
-- Before: `if v_uid is null or public.is_admin() then ... return new; end if;`
-- gave an *admin session* (a logged-in human with a JWT) the same unconditional
-- bypass as the service_role/webhook/cron path. Combined with the orders UPDATE
-- RLS policy's `or public.is_admin()` clause, an admin could raw-edit order
-- financial/identity columns (buyer_id, seller_id, order_number, the *_cents
-- totals, currency) and jump order_status/payment_status arbitrarily via a
-- direct PostgREST update — with no dedicated RPC, transition check, or
-- admin_action_log entry (unlike mark_cod_payment_collected / decide_return).
--
-- After:
--  * The null-uid branch (service_role / Xendit webhooks / reconciliation &
--    expiry cron — no end-user JWT) keeps full trust, still gated so refunds
--    only land via the app.refund_in_progress flow. process_xendit_webhook,
--    process_xendit_refund_webhook and expire_unpaid_xendit_order all run here.
--  * Admins are now subject to the SAME column-level rules as sellers/buyers:
--      - financial/identity columns are immutable for EVERYONE, incl. admin;
--      - order_status: seller, shop member, OR admin may set it (buyer may only
--        cancel) — so admin intervention via advanceOrderStatus still works, and
--        decide_return's order_status='refunded' write still works;
--      - payment_status: provider-only, except the two guarded internal flows —
--        COD collection (pending->paid under app.cod_collection_in_progress, by
--        seller/shop member/admin) and the return/refund flow
--        (refunded/partially_refunded under app.refund_in_progress). Both flags
--        are transaction-local and only ever set inside the SECURITY DEFINER
--        RPCs that own those flows, so a buyer/seller cannot forge them.
--      - buyer_confirmed_received_at: unchanged (buyer-only, once, on delivered).
--
-- This CREATE OR REPLACE also re-asserts the full current (live) body — which
-- includes the `is_shop_member` widening from 20260927135317 that the repo copy
-- of 20260930020000_buyer_confirm_received.sql had drifted away from — so a
-- fresh replay converges on the correct definition regardless of that drift.
--
-- No signature/grant change (CREATE OR REPLACE preserves the trigger function's
-- revoked EXECUTE). Idempotent. Nothing else in this trigger's behavior changes.
--
-- ROLLBACK: re-apply 20260930020000_buyer_confirm_received.sql's function body
-- (restores the `or public.is_admin()` bypass).
-- =============================================================================

begin;

create or replace function public.enforce_order_update_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Active online-payment cancellation block — applies to every caller,
  -- including admin and service_role (unchanged).
  if new.order_status = 'cancelled' and old.order_status <> 'cancelled' then
    if exists (
      select 1 from public.payments p
      where p.payment_method_type = 'xendit'
        and p.status = 'pending'
        and (
          (p.xendit_payment_request_id is null and p.created_at > now() - interval '2 minutes')
          or (p.xendit_payment_request_id is not null and p.expires_at is not null and p.expires_at > now())
          or (
            p.xendit_payment_request_id is not null and p.expires_at is null
            and p.payment_channel in ('GCASH', 'PAYMAYA')
            and p.created_at > now() - interval '20 minutes'
          )
          or (
            p.xendit_payment_request_id is not null and p.expires_at is null
            and p.payment_channel = 'CARD'
            and p.created_at > now() - interval '30 minutes'
          )
        )
        and (
          p.order_id = old.id
          or p.checkout_group_id in (
            select checkout_group_id from public.payments
            where order_id = old.id and checkout_group_id is not null
          )
        )
    ) then
      raise exception 'This order has an active online payment in progress and cannot be cancelled right now'
        using errcode = '22023';
    end if;
  end if;

  -- Service role / webhooks / reconciliation & expiry cron: no end-user JWT.
  -- Full trust, but a refund may still only be applied through the
  -- return/refund decision flow (app.refund_in_progress). Admins no longer
  -- take this branch.
  if v_uid is null then
    if new.payment_status is distinct from old.payment_status
       and new.payment_status in ('refunded', 'partially_refunded')
       and coalesce(current_setting('app.refund_in_progress', true), 'false') <> 'true'
    then
      raise exception 'Refunds must go through the return/refund decision flow'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Financial / identity columns are immutable for every end-user, admins
  -- included. (F-01: previously admins bypassed this entirely.)
  if new.buyer_id     is distinct from old.buyer_id
     or new.seller_id is distinct from old.seller_id
     or new.order_number is distinct from old.order_number
     or new.subtotal_cents is distinct from old.subtotal_cents
     or new.shipping_fee_cents is distinct from old.shipping_fee_cents
     or new.total_cents is distinct from old.total_cents
     or new.currency is distinct from old.currency
  then
    raise exception 'Order financial details cannot be modified'
      using errcode = '42501';
  end if;

  -- Fulfilment status: the seller, a shop member, or an admin may advance it;
  -- the buyer may only cancel their own order.
  if new.order_status is distinct from old.order_status
     and v_uid <> old.seller_id
     and not public.is_shop_member(old.shop_id)
     and not public.is_admin()
     and not (v_uid = old.buyer_id and new.order_status = 'cancelled')
  then
    raise exception 'Only the seller can change fulfilment status'
      using errcode = '42501';
  end if;

  -- Payment status is provider-controlled, with two guarded internal flows.
  if new.payment_status is distinct from old.payment_status then
    if (v_uid = old.seller_id or public.is_shop_member(old.shop_id) or public.is_admin())
       and old.payment_status = 'pending'
       and new.payment_status = 'paid'
       and coalesce(current_setting('app.cod_collection_in_progress', true), 'false') = 'true'
    then
      null; -- COD cash collected (mark_cod_payment_collected)
    elsif new.payment_status in ('refunded', 'partially_refunded')
       and coalesce(current_setting('app.refund_in_progress', true), 'false') = 'true'
    then
      null; -- return/refund decision flow (decide_return / process_xendit_refund_webhook)
    else
      raise exception 'Payment status is set by the payment provider only'
        using errcode = '42501';
    end if;
  end if;

  -- Buyer confirms receipt of their own delivered order, exactly once.
  if new.buyer_confirmed_received_at is distinct from old.buyer_confirmed_received_at then
    if v_uid = old.buyer_id
       and old.buyer_confirmed_received_at is null
       and new.buyer_confirmed_received_at is not null
       and old.order_status = 'delivered'
    then
      null;
    else
      raise exception 'Receipt can only be confirmed once, by the buyer, on a delivered order'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- Trigger functions are never meant to be called directly over the API
-- (see 20260904000000_revoke_trigger_function_execute.sql). Re-assert it.
revoke all on function public.enforce_order_update_rules() from public, anon, authenticated;

commit;
