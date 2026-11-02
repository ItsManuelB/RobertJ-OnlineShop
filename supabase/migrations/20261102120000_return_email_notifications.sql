-- =============================================================================
-- Return/refund emails (refund process audit, 2026-11-02, gaps 1 and 2).
--
-- An outbox the 15-minute sweep reads: it asks `list_due_return_notifications`
-- what is due, claims each message in `return_notification_log` BEFORE sending
-- (so two overlapping runs can never send the same email twice), and releases
-- the claim if the send fails so the next run retries. Nothing here sends
-- anything itself; the server does, and only for an address the server looked
-- up with the service role.
--
-- Messages (kind):
--   seller_new_request        a return request is waiting for the seller (< 2 days old)
--   seller_response_reminder  still unanswered after 2 of the 3 response days
--   buyer_return_approved     admin approved a Return and Refund; ship back by the deadline
--   buyer_ship_back_reminder  under 48 hours left to ship the item back
--
-- Only recent items are eligible (new request < 2 days, approval < 2 days,
-- response reminder 2-5 days), so switching this on does not mail the whole
-- history. Opt-outs are the server's job: it claims a message and then skips
-- it, so an opted-out recipient is not re-listed on every run.
--
-- Service-role only. No policies and no grants on the table: RLS stays on and
-- authenticated users cannot read or write it.
-- ROLLBACK: drop the three functions and the table (nothing else depends on them).
-- =============================================================================

begin;

create table if not exists public.return_notification_log (
  return_request_id uuid not null references public.return_requests (id) on delete cascade,
  kind text not null
    check (kind in (
      'seller_new_request',
      'seller_response_reminder',
      'buyer_return_approved',
      'buyer_ship_back_reminder'
    )),
  claimed_at timestamptz not null default now(),
  primary key (return_request_id, kind)
);

alter table public.return_notification_log enable row level security;
revoke all on table public.return_notification_log from public, anon, authenticated;

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

create or replace function public.claim_return_notification(p_return_id uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.return_notification_log (return_request_id, kind)
  values (p_return_id, p_kind)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.release_return_notification(p_return_id uuid, p_kind text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.return_notification_log
  where return_request_id = p_return_id and kind = p_kind;
$$;

revoke all on function public.list_due_return_notifications(integer) from public, anon, authenticated;
revoke all on function public.claim_return_notification(uuid, text) from public, anon, authenticated;
revoke all on function public.release_return_notification(uuid, text) from public, anon, authenticated;

grant execute on function public.list_due_return_notifications(integer) to service_role;
grant execute on function public.claim_return_notification(uuid, text) to service_role;
grant execute on function public.release_return_notification(uuid, text) to service_role;

commit;
