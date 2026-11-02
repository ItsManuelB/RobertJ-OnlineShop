-- =============================================================================
-- get_buyer_activity_feed: keyset pagination (Notifications audit follow-up,
-- 2026-11-02). Adds an optional `p_before` cursor so a buyer can page past
-- the `/notifications` page's single capped batch instead of silently losing
-- access to older history once it falls off the first `p_limit` rows.
--
-- Still the same ADR-018 shape: no new table, no triggers, no realtime, no
-- change to which events are derived or how — this only adds a keyset filter
-- (`occurred_at < p_before`) on the existing UNION ALL's output, applied
-- after the union so every branch keeps its current form unmodified.
--
-- Changing a function's parameter list via CREATE OR REPLACE does NOT
-- replace the old signature in Postgres — it adds a second, ambiguous
-- overload (see 20260914133006_xendit_phase2_fix_create_order_grants.sql for
-- the same failure mode on create_order). The old 1-arg signature must be
-- dropped first.
--
-- ROLLBACK:
--   drop function if exists public.get_buyer_activity_feed(integer, timestamptz);
--   -- then re-create the single-arg version from
--   -- 20261024000200_cancellation_activity_events.sql
-- =============================================================================

begin;

drop function if exists public.get_buyer_activity_feed(integer);

create or replace function public.get_buyer_activity_feed(
  p_limit integer default 20,
  p_before timestamptz default null
)
returns table(event_type text, order_id uuid, order_number text, occurred_at timestamptz)
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
      and r.reason_code <> 'order_cancelled'

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

    union all

    select 'cancellation_requested'::text, c.order_id, o.order_number, c.created_at
    from public.cancellation_requests c
    join public.orders o on o.id = c.order_id
    where c.buyer_id = (select auth.uid())

    union all

    select 'cancellation_declined'::text, c.order_id, o.order_number, c.decided_at
    from public.cancellation_requests c
    join public.orders o on o.id = c.order_id
    where c.buyer_id = (select auth.uid())
      and c.status = 'rejected' and c.decided_at is not null

    union all

    select 'refund_completed'::text, r.order_id, o.order_number, r.updated_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.buyer_id = (select auth.uid())
      and r.reason_code = 'order_cancelled' and r.status = 'refunded'

    union all

    select 'refund_needs_attention'::text, r.order_id, o.order_number, max(x.updated_at)
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    join public.xendit_refunds x on x.return_request_id = r.id
    where r.buyer_id = (select auth.uid())
      and r.reason_code = 'order_cancelled' and r.status = 'seller_accepted'
      and x.status = 'failed'
      and not exists (
        select 1 from public.xendit_refunds p
        where p.return_request_id = r.id and p.status in ('pending', 'succeeded')
      )
    group by r.order_id, o.order_number
  ) events
  where p_before is null or occurred_at < p_before
  order by occurred_at desc
  limit greatest(p_limit, 0);
$$;

revoke execute on function public.get_buyer_activity_feed(integer, timestamptz)
  from public, anon;

grant execute on function public.get_buyer_activity_feed(integer, timestamptz)
  to authenticated;

commit;
