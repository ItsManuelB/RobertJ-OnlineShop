-- =============================================================================
-- Order Received audit: `get_buyer_activity_feed()` unions every order/payment
-- timestamp except `buyer_confirmed_received_at` — a buyer who confirms
-- receipt gets no record of it in their own notification feed. Adds a
-- `receipt_confirmed` branch, same shape as every other branch (no new
-- table, no triggers — see 20260823000000_buyer_activity_feed_rpc.sql).
--
-- Same signature, CREATE OR REPLACE — no grant reset needed.
--
-- ROLLBACK:
--   (redeploy the previous CREATE OR REPLACE from
--   20260823000000_buyer_activity_feed_rpc.sql)
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
  ) events
  order by occurred_at desc
  limit greatest(p_limit, 0);
$$;

commit;
