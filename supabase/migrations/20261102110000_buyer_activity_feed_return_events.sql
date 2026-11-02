-- =============================================================================
-- get_buyer_activity_feed: return/refund events the buyer was never told about
-- (refund process audit, 2026-11-02, gap 1).
--
-- New events, all derived from columns that already exist (ADR-018: no table,
-- no triggers, no realtime, no new column):
--   return_approved_ship_back     admin approved a Return and Refund; the buyer
--                                 has RETURN_SHIPBACK_DAYS to ship it back
--   return_received               the seller confirmed the parcel arrived
--   return_expired                the buyer did not ship in time; nothing refunded
--   return_payout_pending         a COD refund was approved; the payout is still to come
--   return_replacement_shipped    the seller shipped the replacement
--   return_replacement_completed  the replacement was confirmed (or auto-completed)
--
-- Two existing branches are corrected:
--   return_refunded               COD refunds are timed by the real payout
--                                 (cod_refunded_at), not by the approval
--   return_replacement_approved   no longer vanishes once the replacement ships
--                                 or completes (it filtered on the one status)
--
-- "Seller accepted" is NOT added: once the request moves on, an accepted
-- response cannot be told apart from a rejected one without a new column.
--
-- Same signature as 20261102100000, so CREATE OR REPLACE is enough and the
-- existing grants stay; they are restated below for safety.
-- ROLLBACK: restore the function body from 20261102100000_buyer_activity_feed_pagination.sql.
-- =============================================================================

begin;

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

    select 'return_refunded'::text, r.order_id, o.order_number, coalesce(r.cod_refunded_at, r.admin_decided_at)
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
      and r.status in ('replacement_approved', 'replacement_shipped', 'replacement_completed')
      and r.admin_decided_at is not null

    union all

    select 'return_approved_ship_back'::text, r.order_id, o.order_number, r.admin_decided_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.buyer_id = (select auth.uid())
      and r.return_deadline_at is not null
      and r.admin_decided_at is not null

    union all

    select 'return_received'::text, r.order_id, o.order_number, r.return_received_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.buyer_id = (select auth.uid())
      and r.return_received_at is not null

    union all

    select 'return_expired'::text, r.order_id, o.order_number, r.return_deadline_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.buyer_id = (select auth.uid())
      and r.status = 'return_expired'
      and r.return_deadline_at is not null

    union all

    select 'return_payout_pending'::text, r.order_id, o.order_number, r.admin_decided_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.buyer_id = (select auth.uid())
      and r.status = 'refund_due'
      and r.admin_decided_at is not null

    union all

    select 'return_replacement_shipped'::text, r.order_id, o.order_number, r.replacement_shipped_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.buyer_id = (select auth.uid())
      and r.replacement_shipped_at is not null

    union all

    select 'return_replacement_completed'::text, r.order_id, o.order_number, r.replacement_completed_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.buyer_id = (select auth.uid())
      and r.replacement_completed_at is not null

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
