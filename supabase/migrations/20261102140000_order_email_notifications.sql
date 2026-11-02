-- =============================================================================
-- Order emails: buyer receipt / shipped / delivered, and a seller "new order".
--
-- Same outbox shape as the return emails (20261102120000): the server asks what
-- is due, CLAIMS each message before sending (so two overlapping runs, or the
-- immediate send after checkout racing the sweep, cannot both send it), and
-- releases the claim if the send fails. Nothing here sends anything itself.
--
-- Messages (kind):
--   buyer_order_placed     the order was placed (sent right after checkout; the
--                          sweep is the backstop if that send failed)
--   buyer_order_shipped    the seller marked it shipped
--   buyer_order_delivered  it was marked delivered
--   seller_new_order       a new order for the seller's shop. For online payment
--                          this waits until the payment is confirmed, so a seller
--                          is not told to prepare an order that may never be paid.
--
-- Only recent events are eligible, so switching this on does not mail the history:
-- 2 hours for the receipt and the seller notice (checkout sends them at once, the
-- sweep only catches a failed send, and a receipt a day late is worse than none),
-- 1 day for shipped and delivered. `p_order_ids` limits the list to specific
-- orders: that is how the immediate send after checkout reuses exactly the same
-- eligibility rules.
--
-- Service-role only. No policies and no grants on the table.
-- ROLLBACK: drop the three functions and the table (nothing else depends on them).
-- =============================================================================

begin;

create table if not exists public.order_notification_log (
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null
    check (kind in (
      'buyer_order_placed',
      'buyer_order_shipped',
      'buyer_order_delivered',
      'seller_new_order'
    )),
  claimed_at timestamptz not null default now(),
  primary key (order_id, kind)
);

alter table public.order_notification_log enable row level security;
revoke all on table public.order_notification_log from public, anon, authenticated;

create or replace function public.list_due_order_notifications(
  p_limit integer default 25,
  p_order_ids uuid[] default null
)
returns table(
  order_id uuid,
  kind text,
  order_number text,
  recipient_id uuid,
  total_cents bigint,
  currency text,
  payment_method text,
  payment_status text,
  item_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.order_id, d.kind, d.order_number, d.recipient_id, d.total_cents,
         d.currency, d.payment_method, d.payment_status, d.item_count
  from (
    select o.id as order_id, 'buyer_order_placed'::text as kind, o.order_number,
           o.buyer_id as recipient_id, o.total_cents::bigint as total_cents, o.currency,
           o.payment_method::text as payment_method, o.payment_status::text as payment_status,
           (select count(*)::integer from public.order_items i where i.order_id = o.id) as item_count,
           o.placed_at as due_at
    from public.orders o
    where o.order_status <> 'cancelled'
      and o.placed_at > now() - interval '2 hours'

    union all

    select o.id, 'buyer_order_shipped'::text, o.order_number,
           o.buyer_id, o.total_cents::bigint, o.currency,
           o.payment_method::text, o.payment_status::text,
           (select count(*)::integer from public.order_items i where i.order_id = o.id),
           o.shipped_at
    from public.orders o
    where o.order_status in ('shipped', 'delivered')
      and o.shipped_at > now() - interval '1 day'

    union all

    select o.id, 'buyer_order_delivered'::text, o.order_number,
           o.buyer_id, o.total_cents::bigint, o.currency,
           o.payment_method::text, o.payment_status::text,
           (select count(*)::integer from public.order_items i where i.order_id = o.id),
           o.delivered_at
    from public.orders o
    where o.order_status = 'delivered'
      and o.delivered_at > now() - interval '1 day'

    union all

    select o.id, 'seller_new_order'::text, o.order_number,
           o.seller_id, o.total_cents::bigint, o.currency,
           o.payment_method::text, o.payment_status::text,
           (select count(*)::integer from public.order_items i where i.order_id = o.id),
           case when o.payment_method = 'cod' then o.placed_at else o.paid_at end
    from public.orders o
    where o.seller_id is not null
      and o.order_status <> 'cancelled'
      and (o.payment_method = 'cod' or o.payment_status = 'paid')
      and case when o.payment_method = 'cod' then o.placed_at else o.paid_at end
            > now() - interval '2 hours'
  ) d
  where (p_order_ids is null or d.order_id = any (p_order_ids))
    and not exists (
      select 1
      from public.order_notification_log l
      where l.order_id = d.order_id
        and l.kind = d.kind
    )
  order by d.due_at
  limit greatest(p_limit, 0);
$$;

create or replace function public.claim_order_notification(p_order_id uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.order_notification_log (order_id, kind)
  values (p_order_id, p_kind)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.release_order_notification(p_order_id uuid, p_kind text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.order_notification_log
  where order_id = p_order_id and kind = p_kind;
$$;

revoke all on function public.list_due_order_notifications(integer, uuid[]) from public, anon, authenticated;
revoke all on function public.claim_order_notification(uuid, text) from public, anon, authenticated;
revoke all on function public.release_order_notification(uuid, text) from public, anon, authenticated;

grant execute on function public.list_due_order_notifications(integer, uuid[]) to service_role;
grant execute on function public.claim_order_notification(uuid, text) to service_role;
grant execute on function public.release_order_notification(uuid, text) to service_role;

commit;
