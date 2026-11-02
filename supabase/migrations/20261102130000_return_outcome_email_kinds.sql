-- =============================================================================
-- Return/refund outcome emails (follow-up to 20261102120000).
--
-- Three more messages the buyer gets when a return reaches an outcome:
--   buyer_return_refunded  the refund was issued (Xendit refund confirmed, or the
--                          COD payout recorded by the admin)
--   buyer_return_rejected  the admin rejected the request. A SELLER rejection is
--                          not listed: the admin can still decide after it, so
--                          telling the buyer "rejected" could be reversed.
--   buyer_return_expired   the ship-back deadline passed; nothing is refunded
--
-- Same rules as the first four: only recent outcomes are eligible (< 2 days), so
-- switching this on does not mail the history; the server claims each message
-- before sending; opt-outs are the server's job. Existing grants survive
-- `create or replace`; they are repeated so this file is self-contained.
--
-- Safe order: apply this BEFORE the code that sends the new kinds. Code that
-- predates it ignores kinds it does not know, so an early apply changes nothing.
-- ROLLBACK: re-run 20261102120000's function and constraint (the three new kinds
-- must have no rows in return_notification_log first).
-- =============================================================================

begin;

alter table public.return_notification_log
  drop constraint if exists return_notification_log_kind_check;

alter table public.return_notification_log
  add constraint return_notification_log_kind_check
  check (kind in (
    'seller_new_request',
    'seller_response_reminder',
    'buyer_return_approved',
    'buyer_ship_back_reminder',
    'buyer_return_refunded',
    'buyer_return_rejected',
    'buyer_return_expired'
  ));

create or replace function public.list_due_return_notifications(p_limit integer default 25)
returns table(
  return_request_id uuid,
  kind text,
  order_id uuid,
  order_number text,
  recipient_id uuid,
  deadline_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.return_request_id, d.kind, d.order_id, d.order_number, d.recipient_id, d.deadline_at
  from (
    select r.id as return_request_id, 'seller_new_request'::text as kind, r.order_id,
           o.order_number, r.seller_id as recipient_id,
           r.created_at + interval '3 days' as deadline_at, r.created_at as due_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.status = 'pending'
      and r.reason_code <> 'order_cancelled'
      and r.seller_id is not null
      and r.created_at > now() - interval '2 days'

    union all

    select r.id, 'seller_response_reminder'::text, r.order_id,
           o.order_number, r.seller_id,
           r.created_at + interval '3 days', r.created_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.status = 'pending'
      and r.reason_code <> 'order_cancelled'
      and r.seller_id is not null
      and r.created_at <= now() - interval '2 days'
      and r.created_at > now() - interval '5 days'

    union all

    select r.id, 'buyer_return_approved'::text, r.order_id,
           o.order_number, r.buyer_id,
           r.return_deadline_at, r.admin_decided_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.status = 'awaiting_return'
      and r.return_deadline_at is not null
      and r.return_deadline_at > now()
      and r.admin_decided_at > now() - interval '2 days'

    union all

    select r.id, 'buyer_ship_back_reminder'::text, r.order_id,
           o.order_number, r.buyer_id,
           r.return_deadline_at, r.return_deadline_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.status = 'awaiting_return'
      and r.return_deadline_at is not null
      and r.return_deadline_at > now()
      and r.return_deadline_at <= now() + interval '48 hours'

    union all

    select r.id, 'buyer_return_refunded'::text, r.order_id,
           o.order_number, r.buyer_id,
           null::timestamptz, coalesce(r.cod_refunded_at, r.admin_decided_at)
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.status = 'refunded'
      and coalesce(r.cod_refunded_at, r.admin_decided_at) > now() - interval '2 days'

    union all

    select r.id, 'buyer_return_rejected'::text, r.order_id,
           o.order_number, r.buyer_id,
           null::timestamptz, r.admin_decided_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.status = 'admin_rejected'
      and r.admin_decided_at > now() - interval '2 days'

    union all

    select r.id, 'buyer_return_expired'::text, r.order_id,
           o.order_number, r.buyer_id,
           r.return_deadline_at, r.return_deadline_at
    from public.return_requests r
    join public.orders o on o.id = r.order_id
    where r.status = 'return_expired'
      and r.return_deadline_at <= now()
      and r.return_deadline_at > now() - interval '2 days'
  ) d
  where not exists (
    select 1
    from public.return_notification_log l
    where l.return_request_id = d.return_request_id
      and l.kind = d.kind
  )
  order by d.due_at
  limit greatest(p_limit, 0);
$$;

revoke all on function public.list_due_return_notifications(integer) from public, anon, authenticated;
grant execute on function public.list_due_return_notifications(integer) to service_role;

commit;
