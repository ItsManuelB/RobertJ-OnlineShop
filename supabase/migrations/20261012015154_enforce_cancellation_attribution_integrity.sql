-- =============================================================================
-- Close a live gap in enforce_order_update_rules: `orders.cancelled_by` and
-- `orders.cancellation_reason` have no trigger-level guard at all today.
--
-- Found while auditing migration-history drift: an earlier, never-applied
-- migration (20260925000000_guard_order_cancellation_attribution.sql,
-- local-only, never pushed live) had identified and attempted to close this
-- exact gap, but its fix was written against a PRE-F-01 version of this
-- function (it still carries the old, removed `v_uid is null or
-- public.is_admin()` blanket bypass) and was superseded away by later
-- rewrites (the 2026-09-27 shop-member widening, the 2026-09-30
-- buyer_confirm_received addition, and this project's own F-01 fix on
-- 2026-10-11) without anyone carrying its guard forward. That file is
-- intentionally NOT replayed here — this migration re-derives the same
-- protection on top of the CURRENT, F-01-corrected function body instead.
--
-- The gap, concretely: `cancelled_by` (enum: buyer/seller/admin) and
-- `cancellation_reason` (free text) are both in the `authenticated` column-
-- level UPDATE grant on `orders`, and the UPDATE RLS policy's `with_check`
-- only verifies ROW ownership (buyer_id/seller_id/is_shop_member/is_admin) —
-- it says nothing about which COLUMNS an owner may touch. Today, any buyer
-- can PATCH their own order via PostgREST and set `cancelled_by = 'admin'`
-- or `'seller'`, or write an arbitrary `cancellation_reason`, without ever
-- actually cancelling the order. The same is true in reverse for a seller
-- or admin setting `cancelled_by = 'buyer'`.
--
-- Fix: `cancelled_by`/`cancellation_reason` may only change as part of THE
-- SAME update that transitions `order_status` from non-cancelled to
-- 'cancelled' (matching exactly how `cancelBuyerOrder` and
-- `advanceOrderStatus` in queries.ts already write them — always paired,
-- never standalone), and only to the attribution that actually matches who
-- is performing it:
--   * buyer cancelling their own order  -> cancelled_by must be 'buyer'
--   * seller, or any member of the order's shop, cancelling -> 'seller'
--   * admin cancelling -> 'admin'
-- This also incidentally blocks rewriting these fields on an
-- already-cancelled order (old.order_status is already 'cancelled'), which
-- is consistent with this codebase's append-mostly financial/history rows.
--
-- Everything else in this function is UNCHANGED from the live, F-01-fixed
-- body: financial/identity immutability, the seller/shop-member/admin-only
-- fulfilment-status rule (buyer may only cancel), the two guarded
-- payment_status flows (COD collection, refund), and the
-- buyer_confirmed_received_at rule. No signature/grant change (CREATE OR
-- REPLACE preserves the trigger function's revoked EXECUTE). Idempotent.
--
-- ROLLBACK: re-apply 20261011163703_lock_admin_order_update_bypass.sql's
-- function body (removes the cancellation-attribution guard only; every
-- other F-01 protection is defined there and unaffected either way).
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
  -- take this branch (F-01).
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
  -- included (F-01).
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

  -- NEW: cancellation attribution/reason integrity. Only settable as part
  -- of THIS SAME update actually cancelling the order, and only to the
  -- attribution matching the real actor -- never trust the client (or a
  -- same-row RLS pass) to self-report which role performed the cancellation.
  if new.cancelled_by is distinct from old.cancelled_by
     or new.cancellation_reason is distinct from old.cancellation_reason
  then
    if not (
      old.order_status <> 'cancelled'
      and new.order_status = 'cancelled'
      and (
        (v_uid = old.buyer_id and new.cancelled_by = 'buyer')
        or (
          (v_uid = old.seller_id or public.is_shop_member(old.shop_id))
          and new.cancelled_by = 'seller'
        )
        or (public.is_admin() and new.cancelled_by = 'admin')
      )
    ) then
      raise exception
        'Cancellation attribution and reason can only be set when actually cancelling an order, and must match the actor performing the cancellation'
        using errcode = '42501';
    end if;
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
