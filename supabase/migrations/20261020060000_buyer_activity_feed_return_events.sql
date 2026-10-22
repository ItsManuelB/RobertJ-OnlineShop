-- =============================================================================
-- Fulfillment/returns audit finding B5: `get_buyer_activity_feed` covered
-- order/payment/delivery-confirmation events but nothing for a return's own
-- lifecycle — a buyer who filed a return learned the outcome only by
-- revisiting that exact order's page. Adds five branches sourced from
-- `return_requests` (which already carries its own `buyer_id`, so no join
-- back through `orders` is needed for ownership — only for `order_number`,
-- same as every existing branch).
--
-- Deliberately does NOT add a "seller accepted" event — once accepted, the
-- buyer-relevant outcome is still pending (admin review); the five events
-- below are each either the filing itself or an actual resolution, so
-- there's no ambiguous "it was accepted, but then what?" gap (see this
-- migration's audit notes on why intermediate seller decisions aren't
-- separately distinguishable once `return_requests.status` has moved on).
--
-- Same signature, CREATE OR REPLACE — no grant reset. References the new
-- `replacement_approved` value added in `20261020040000_return_replacement_
-- status.sql`, which is safe here because that migration's transaction has
-- already committed by the time this one runs (sequential migrations, not
-- the same transaction).
--
-- ROLLBACK:
--   (redeploy the previous CREATE OR REPLACE from
--   20261020000000_buyer_activity_feed_receipt_confirmed.sql)
-- =============================================================================

begin;

create or replace function public.get_buyer_activity_feed(p_limit integer default 20)
returns table (
  event_type text,
  order_id uuid,
  order_number text,
  occurred_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select event_type, order_id, order_number, occurred_at
  from (
    select 'order_placed'::text as event_type, o.id as order_id,
           o.order_number, o.placed_at as occurred_at
    from public.orders o
    where o.buyer_id = (select auth.uid())

    union all

    select 'payment_confirmed'::text, o.id, o.order_number, o.paid_at
    from public.orders o
    where o.buyer_id = (select auth.uid()) and o.paid_at is not null

    union all

    select 'order_shipped'::text, o.id, o.order_number, o.shipped_at
    from public.orders o
    where o.buyer_id = (select auth.uid()) and o.shipped_at is not null

    union all

    select 'order_delivered'::text, o.id, o.order_number, o.delivered_at
    from public.orders o
    where o.buyer_id = (select auth.uid()) and o.delivered_at is not null

    union all

    select 'receipt_confirmed'::text, o.id, o.order_number, o.buyer_confirmed_received_at
    from public.orders o
    where o.buyer_id = (select auth.uid()) and o.buyer_confirmed_received_at is not null

    union all

    select 'order_cancelled'::text, o.id, o.order_number, o.cancelled_at
    from public.orders o
    where o.buyer_id = (select auth.uid()) and o.cancelled_at is not null

    union all

    select 'receipt_submitted'::text, o.id, o.order_number, p.created_at
    from public.payments p
    join public.orders o on o.id = p.order_id
    where o.buyer_id = (select auth.uid())

    union all

    select
      case when p.status = 'paid' then 'payment_verified' else 'payment_failed' end,
      o.id, o.order_number, p.verified_at
    from public.payments p
    join public.orders o on o.id = p.order_id
    where o.buyer_id = (select auth.uid()) and p.verified_at is not null

    union all

    select 'return_filed'::text, r.order_id, o.order_number, r.created_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.buyer_id = (select auth.uid())

    union all

    select 'return_rejected_by_seller'::text, r.order_id, o.order_number, r.seller_decided_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.buyer_id = (select auth.uid())
      and r.status = 'seller_rejected'
      and r.seller_decided_at is not null

    union all

    select 'return_rejected'::text, r.order_id, o.order_number, r.admin_decided_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.buyer_id = (select auth.uid())
      and r.status = 'admin_rejected'
      and r.admin_decided_at is not null

    union all

    select 'return_refunded'::text, r.order_id, o.order_number, r.admin_decided_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.buyer_id = (select auth.uid())
      and r.status = 'refunded'
      and r.admin_decided_at is not null

    union all

    select 'return_replacement_approved'::text, r.order_id, o.order_number, r.admin_decided_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.buyer_id = (select auth.uid())
      and r.status = 'replacement_approved'
      and r.admin_decided_at is not null
  ) events
  order by occurred_at desc
  limit greatest(p_limit, 0);
$$;

commit;
