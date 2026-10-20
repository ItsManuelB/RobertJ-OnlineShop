-- =============================================================================
-- Fulfillment/returns audit, finding A1 (Critical): a buyer could only click
-- "Order Received" once `orders.order_status = 'delivered'` — and only the
-- seller/shop-member/admin could ever set that status. A seller who forgot
-- (or went inactive) left the buyer with zero recourse: no confirm, no
-- return/refund request (same `delivered`-only gate), no cancel (`shipped`
-- isn't in `CANCELLABLE_ORDER_STATUSES`).
--
-- Fix: let the buyer's own "I received it" action supply the missing
-- delivery signal. `confirm_order_received` now accepts a `shipped` order
-- too, and atomically stamps BOTH `order_status = 'delivered'` AND
-- `buyer_confirmed_received_at = now()` in the same UPDATE — the buyer's
-- confirmation IS the delivery event in this path, there is no separate
-- "mark delivered" step. `track_order_status_timestamps` (unchanged) stamps
-- `delivered_at` the same way it would for the seller-initiated path, since
-- it only reacts to the enum value, not who set it.
--
-- This deliberately does NOT add any time-based auto-confirmation — per
-- the implementation brief, an order is never marked received just because
-- time has passed. The buyer must explicitly click confirm.
--
-- `enforce_order_update_rules` gets a narrow, tied-together carve-out so a
-- buyer can only ever flip `shipped -> delivered` in the exact same
-- statement that legitimately sets `buyer_confirmed_received_at` (not as an
-- isolated status write) -- closing the raw-PostgREST path a buyer could
-- otherwise reach via the existing `orders` UPDATE RLS policy (buyer_id =
-- auth.uid()), per the project's own "any orders column is buyer-writable
-- unless the trigger says otherwise" precedent.
--
-- Two incidental hardenings, in the exact branch being touched (not
-- weakening anything -- strictly tightening):
--  1. `buyer_confirmed_received_at` must land within a tight tolerance of
--     `now()`, same anti-backdating pattern already used for
--     `cancelled_at`. Previously unconstrained (any non-null value was
--     accepted once the order was already `delivered`).
--  2. The trigger now also refuses the confirmation while an open
--     (`pending`/`seller_accepted`) return request exists -- previously
--     only `confirm_order_received` itself checked this (F-08); the trigger
--     is defense-in-depth for every caller, not just the RPC.
--
-- ROLLBACK:
--   -- restore the previous CREATE OR REPLACE bodies from
--   -- 20261011174223_confirm_received_blocks_open_return.sql (confirm_order_received)
--   -- and 20260930020000_buyer_confirm_received.sql (enforce_order_update_rules)
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

  -- Fulfilment status: the seller, a shop member, or an admin may advance
  -- it; the buyer may only cancel their own order, OR -- new -- confirm
  -- their own shipped order as received, which moves it straight to
  -- `delivered`. That second carve-out only fires when this SAME UPDATE is
  -- also legitimately setting `buyer_confirmed_received_at` (checked
  -- below) -- never for an isolated `order_status` write.
  if new.order_status is distinct from old.order_status
     and v_uid <> old.seller_id
     and not public.is_shop_member(old.shop_id)
     and not public.is_admin()
     and not (v_uid = old.buyer_id and new.order_status = 'cancelled')
     and not (
       v_uid = old.buyer_id
       and old.order_status = 'shipped'
       and new.order_status = 'delivered'
       and old.buyer_confirmed_received_at is null
       and new.buyer_confirmed_received_at is not null
     )
  then
    raise exception 'Only the seller can change fulfilment status'
      using errcode = '42501';
  end if;

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

  if new.payment_status is distinct from old.payment_status then
    if (v_uid = old.seller_id or public.is_shop_member(old.shop_id) or public.is_admin())
       and old.payment_status = 'pending'
       and new.payment_status = 'paid'
       and coalesce(current_setting('app.cod_collection_in_progress', true), 'false') = 'true'
    then
      null;
    elsif new.payment_status in ('refunded', 'partially_refunded')
       and coalesce(current_setting('app.refund_in_progress', true), 'false') = 'true'
    then
      null;
    else
      raise exception 'Payment status is set by the payment provider only'
        using errcode = '42501';
    end if;
  end if;

  -- Buyer confirms receipt of their own order, exactly once, from either
  -- `shipped` (self-reported delivery, new.order_status must land on
  -- `delivered` in this same statement) or `delivered` (seller already
  -- marked it). Tight `now()` tolerance -- same anti-backdating pattern as
  -- `cancelled_at` above -- and refused outright while an open return
  -- request exists on this order (defense-in-depth alongside
  -- `confirm_order_received`'s own check).
  if new.buyer_confirmed_received_at is distinct from old.buyer_confirmed_received_at then
    if v_uid = old.buyer_id
       and old.buyer_confirmed_received_at is null
       and new.buyer_confirmed_received_at is not null
       and new.buyer_confirmed_received_at between now() - interval '1 minute' and now() + interval '1 minute'
       and old.order_status in ('shipped', 'delivered')
       and new.order_status = 'delivered'
       and not exists (
         select 1 from public.return_requests
         where order_id = old.id and status in ('pending', 'seller_accepted')
       )
    then
      null;
    else
      raise exception 'Receipt can only be confirmed once, by the buyer, on a shipped or delivered order with no open return request'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- confirm_order_received: now accepts `shipped` as well as `delivered`.
-- From `shipped`, this call IS the delivery event -- it stamps
-- `order_status = 'delivered'` in the same UPDATE that sets
-- `buyer_confirmed_received_at`. From `delivered`, behavior is unchanged
-- (the `order_status = 'delivered'` write is then a no-op).
-- -----------------------------------------------------------------------------
create or replace function public.confirm_order_received(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if v_order.buyer_id <> v_uid then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if v_order.order_status not in ('shipped', 'delivered') then
    raise exception 'Only a shipped or delivered order can be confirmed received.' using errcode = '22023';
  end if;
  if v_order.buyer_confirmed_received_at is not null then
    raise exception 'This order has already been confirmed received.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.return_requests
    where order_id = p_order_id and status in ('pending', 'seller_accepted')
  ) then
    raise exception 'This order has an open return request — it must be resolved before confirming receipt.'
      using errcode = '22023';
  end if;

  update public.orders
    set buyer_confirmed_received_at = now(),
        order_status = 'delivered'
    where id = p_order_id
    returning * into v_order;

  return v_order;
end;
$$;

commit;
