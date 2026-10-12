-- =============================================================================
-- Close the same class of gap as 20261012015154 for `orders.cancelled_at`.
--
-- `cancelled_at` is in the `authenticated` column-level UPDATE grant on
-- `orders`, same as `cancelled_by`/`cancellation_reason` were, and the
-- previous fix only covered those two. `cancelled_at` had no guard at all:
--
--  * Rewrite on an already-cancelled order: since the order_status check in
--    this function only fires when `new.order_status is distinct from
--    old.order_status`, a buyer/seller/shop-member re-touching
--    `cancelled_at` on a row that's ALREADY 'cancelled' (order_status
--    unchanged) sailed through untouched. This directly undermines the F-09
--    return-window fix (`request_return`'s cancelled+paid path checks `now()
--    > cancelled_at + interval '7 days'`) -- a buyer could bump
--    `cancelled_at` forward indefinitely, long after the real cancellation,
--    to keep the return window artificially open.
--  * Forward-dating at the moment of a real, correctly-attributed
--    cancellation: nothing required `cancelled_at` to actually be "now" --
--    a buyer cancelling their own order could set it a day or a week into
--    the future to buy themselves extra return-eligibility time beyond
--    what F-09 intends.
--
-- Fix: extend the existing cancellation-attribution guard (rather than add a
-- second, duplicate block) so `cancelled_at` is validated by the exact same
-- condition as `cancelled_by`/`cancellation_reason` -- only settable as part
-- of the same update that actually transitions order_status to 'cancelled',
-- by the correctly-attributed actor -- plus one additional constraint specific
-- to this column: the new value must be within a short tolerance of the
-- database's own `now()` at the moment of that transition. A 1-minute window
-- comfortably covers normal request latency (the app always writes `new
-- Date().toISOString()` at request time) without allowing meaningful
-- backdating or forward-dating.
--
-- Everything else in this function is UNCHANGED: F-01's financial/identity
-- immutability and fulfilment-status rule, the two guarded payment_status
-- flows, and the buyer_confirmed_received_at rule. No signature/grant
-- change. Idempotent.
--
-- ROLLBACK: re-apply 20261012015154_enforce_cancellation_attribution_
-- integrity.sql's function body (removes the cancelled_at constraint only;
-- the cancelled_by/cancellation_reason guard it introduced is unaffected
-- either way).
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
  -- Active online-payment cancellation block -- applies to every caller,
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

  -- Cancellation attribution/reason/timestamp integrity. Only settable as
  -- part of THIS SAME update actually cancelling the order, only to the
  -- attribution matching the real actor, and -- for cancelled_at -- only to
  -- a value within a short tolerance of "now" (never trust the client to
  -- self-report when the cancellation happened, same as who performed it).
  if new.cancelled_by is distinct from old.cancelled_by
     or new.cancellation_reason is distinct from old.cancellation_reason
     or new.cancelled_at is distinct from old.cancelled_at
  then
    if not (
      old.order_status <> 'cancelled'
      and new.order_status = 'cancelled'
      and new.cancelled_at is not null
      and new.cancelled_at between now() - interval '1 minute' and now() + interval '1 minute'
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
        'Cancellation attribution, reason, and timestamp can only be set when actually cancelling an order, must match the actor performing the cancellation, and must reflect the actual time of cancellation'
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
