-- =============================================================================
-- Global Messages Inbox — per-user conversation state (unread + pin) and the
-- read-side RPCs that power a Shopee-style inbox across all of a user's
-- order-scoped conversations (buyer + seller/admin).
--
-- Deliberately additive and isolated — it does NOT touch order_messages or any
-- existing table/policy:
--  * A conversation is still ONE order (ADR-026). This only adds per-viewer
--    state (last_read_at high-water mark for unread counts; pinned_at) and
--    read-only summary RPCs. Messages themselves stay in order_messages, still
--    written only through send_order_message.
--  * order_conversation_state is locked down: RLS own-row policies as
--    defense-in-depth AND no direct grants — every read/write goes through the
--    SECURITY DEFINER RPCs below, which authorize the caller as a participant
--    (buyer, the order's seller, a shop member, or admin) exactly like
--    send_order_message does.
--  * Visibility of the inbox mirrors order_messages' own SELECT policy, so the
--    inbox can never surface a conversation the user couldn't already read.
--
-- ROLLBACK:
--   revoke execute on function public.list_my_conversations() from authenticated;
--   revoke execute on function public.get_conversation_context(uuid) from authenticated;
--   revoke execute on function public.mark_conversation_read(uuid) from authenticated;
--   revoke execute on function public.set_conversation_pinned(uuid, boolean) from authenticated;
--   drop function if exists public.list_my_conversations();
--   drop function if exists public.get_conversation_context(uuid);
--   drop function if exists public.mark_conversation_read(uuid);
--   drop function if exists public.set_conversation_pinned(uuid, boolean);
--   drop table if exists public.order_conversation_state;
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Per-user, per-order inbox state: unread high-water mark + pin.
-- -----------------------------------------------------------------------------
create table if not exists public.order_conversation_state (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  order_id     uuid not null references public.orders (id) on delete cascade,
  last_read_at timestamptz,
  pinned_at    timestamptz,
  updated_at   timestamptz not null default now(),

  primary key (user_id, order_id)
);

comment on table public.order_conversation_state is
  'Per-user, per-order inbox state for the global messages inbox: last_read_at (unread high-water mark) and pinned_at. Each user sees/writes only their own rows; all access via the SECURITY DEFINER conversation RPCs.';

create index if not exists order_conversation_state_user_pinned_idx
  on public.order_conversation_state (user_id, pinned_at);

-- -----------------------------------------------------------------------------
-- RLS — own rows only (defense-in-depth). No direct grants: the RPCs below are
-- the only access path, matching order_messages' single-write-path philosophy.
-- -----------------------------------------------------------------------------
alter table public.order_conversation_state enable row level security;

create policy "own conversation state read"
  on public.order_conversation_state for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own conversation state insert"
  on public.order_conversation_state for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "own conversation state update"
  on public.order_conversation_state for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.order_conversation_state from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Shared guard: is the current user a participant in this order's conversation?
-- Same four-way check as send_order_message (buyer, seller, shop member, admin).
-- -----------------------------------------------------------------------------
create or replace function public.can_access_order_conversation(p_order_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (
        o.buyer_id = (select auth.uid())
        or o.seller_id = (select auth.uid())
        or public.is_shop_member(o.shop_id)
        or public.is_admin()
      )
  );
$$;

revoke all on function public.can_access_order_conversation(uuid) from public, anon;
grant execute on function public.can_access_order_conversation(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- list_my_conversations — one row per order the caller can see that already has
-- at least one message, with the counterpart's display name (shop name for the
-- buyer, buyer name for seller/admin), last-message preview, unread count and
-- pin flag. Pinned first, then most-recent activity.
-- -----------------------------------------------------------------------------
create or replace function public.list_my_conversations()
returns table (
  order_id        uuid,
  order_number    text,
  title           text,
  viewer_is_buyer boolean,
  last_body       text,
  last_created_at timestamptz,
  last_sender_id  uuid,
  unread_count    integer,
  pinned          boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  with me as (select (select auth.uid()) as id),
  visible as (
    select o.id, o.order_number, o.buyer_id, o.seller_id, o.shop_id
    from public.orders o
    where exists (select 1 from public.order_messages m where m.order_id = o.id)
      and (
        o.buyer_id = (select id from me)
        or o.seller_id = (select id from me)
        or public.is_shop_member(o.shop_id)
        or public.is_admin()
      )
  )
  select
    v.id as order_id,
    v.order_number,
    case
      when v.buyer_id = (select id from me)
        then coalesce(s.name, ps.full_name, ps.username, 'Seller')
        else coalesce(pb.full_name, pb.username, 'Customer')
    end as title,
    (v.buyer_id = (select id from me)) as viewer_is_buyer,
    lm.body as last_body,
    lm.created_at as last_created_at,
    lm.sender_id as last_sender_id,
    coalesce((
      select count(*)
      from public.order_messages m
      where m.order_id = v.id
        and m.sender_id <> (select id from me)
        and m.created_at > coalesce(st.last_read_at, '-infinity'::timestamptz)
    ), 0)::int as unread_count,
    (st.pinned_at is not null) as pinned
  from visible v
  left join public.shops s on s.id = v.shop_id
  left join public.profiles ps on ps.id = v.seller_id
  left join public.profiles pb on pb.id = v.buyer_id
  left join public.order_conversation_state st
    on st.user_id = (select id from me) and st.order_id = v.id
  left join lateral (
    select body, created_at, sender_id
    from public.order_messages m
    where m.order_id = v.id
    order by m.created_at desc
    limit 1
  ) lm on true
  order by (st.pinned_at is not null) desc, lm.created_at desc nulls last;
$$;

revoke all on function public.list_my_conversations() from public, anon;
grant execute on function public.list_my_conversations() to authenticated;

-- -----------------------------------------------------------------------------
-- get_conversation_context — the header data for one conversation (also works
-- for an order with zero messages yet, e.g. deep-linked "Message" from an order
-- page). Authorizes the caller; returns the names needed to label authors.
-- -----------------------------------------------------------------------------
create or replace function public.get_conversation_context(p_order_id uuid)
returns table (
  order_id        uuid,
  order_number    text,
  viewer_is_buyer boolean,
  shop_name       text,
  buyer_name      text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    o.id as order_id,
    o.order_number,
    (o.buyer_id = (select auth.uid())) as viewer_is_buyer,
    coalesce(s.name, ps.full_name, ps.username, 'Seller') as shop_name,
    coalesce(pb.full_name, pb.username, 'Customer') as buyer_name
  from public.orders o
  left join public.shops s on s.id = o.shop_id
  left join public.profiles ps on ps.id = o.seller_id
  left join public.profiles pb on pb.id = o.buyer_id
  where o.id = p_order_id
    and public.can_access_order_conversation(p_order_id);
$$;

revoke all on function public.get_conversation_context(uuid) from public, anon;
grant execute on function public.get_conversation_context(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- mark_conversation_read — upsert the caller's last_read_at for an order.
-- -----------------------------------------------------------------------------
create or replace function public.mark_conversation_read(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;
  if not public.can_access_order_conversation(p_order_id) then
    raise exception 'You do not have access to this conversation' using errcode = '42501';
  end if;

  insert into public.order_conversation_state (user_id, order_id, last_read_at, updated_at)
  values (v_uid, p_order_id, now(), now())
  on conflict (user_id, order_id)
  do update set last_read_at = now(), updated_at = now();
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- set_conversation_pinned — pin/unpin an order's conversation for the caller.
-- -----------------------------------------------------------------------------
create or replace function public.set_conversation_pinned(
  p_order_id uuid,
  p_pinned   boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;
  if not public.can_access_order_conversation(p_order_id) then
    raise exception 'You do not have access to this conversation' using errcode = '42501';
  end if;

  insert into public.order_conversation_state (user_id, order_id, pinned_at, updated_at)
  values (v_uid, p_order_id, case when p_pinned then now() else null end, now())
  on conflict (user_id, order_id)
  do update set pinned_at = case when p_pinned then now() else null end, updated_at = now();
end;
$$;

revoke all on function public.set_conversation_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_conversation_pinned(uuid, boolean) to authenticated;

commit;
