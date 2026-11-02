-- =============================================================================
-- Contact Seller: order_messages — one shared buyer<->shop conversation per
-- order. Any member of the order's shop (is_shop_member(shop_id)) can read and
-- reply; the buyer sees one continuous thread. Each row keeps the individual
-- sender_id for accountability, while the buyer-facing UI shows the shop name
-- (not individual staff) for seller/admin messages.
--
-- Design, deliberately narrow (capstone scope — refresh-based only; no
-- realtime, push, email, SMS, attachments, typing indicators, or read
-- receipts):
--  * Separate table with its OWN RLS — a child table's RLS is evaluated
--    independently of the parent order's visibility (see
--    20261013073836_shop_member_order_items_and_receipts_rls.sql), so the
--    SELECT policy guards on the message's own shop_id + the parent order.
--  * shop_id is denormalized from the order (stamped in the RPC) so shop-wide
--    read RLS can use is_shop_member(shop_id) without a join — same pattern as
--    order_shipments.
--  * Append-only: no UPDATE/DELETE policy or grant — message history is
--    immutable (matches the orders/payments financial-immutability convention).
--  * Single write path: the send_order_message RPC (SECURITY DEFINER), which
--    derives sender_id/sender_role from the session — never from the client.
--    No INSERT policy or grant is needed (the DEFINER RPC bypasses RLS).
--  * Legacy orders with NULL shop_id (a handful predate shop scoping): the
--    SELECT policy's buyer/seller/admin branch still applies; shop-mates who
--    are not the literal seller_id simply can't see those threads — no
--    backfill, no guessing.
--
-- ROLLBACK:
--   revoke execute on function public.send_order_message(uuid, text) from authenticated;
--   drop function if exists public.send_order_message(uuid, text);
--   drop table if exists public.order_messages;
-- =============================================================================

begin;

create table if not exists public.order_messages (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id),
  shop_id     uuid references public.shops (id),
  sender_id   uuid not null references public.profiles (id),
  sender_role public.user_role not null,
  body        text not null,
  created_at  timestamptz not null default now(),

  constraint order_messages_body_length check (char_length(body) between 1 and 2000)
);

comment on table public.order_messages is
  'One shared buyer<->shop conversation per order. Shop-wide read via is_shop_member(shop_id); append-only; all writes go through send_order_message (SECURITY DEFINER).';

create index if not exists order_messages_order_id_created_at_idx
  on public.order_messages (order_id, created_at);
create index if not exists order_messages_sender_id_idx
  on public.order_messages (sender_id);
create index if not exists order_messages_shop_id_idx
  on public.order_messages (shop_id);

-- -----------------------------------------------------------------------------
-- RLS — order participants + shop members + admin read; nobody writes directly.
-- -----------------------------------------------------------------------------
alter table public.order_messages enable row level security;

create policy "participants read order messages"
  on public.order_messages for select
  to authenticated
  using (
    public.is_shop_member(shop_id)
    or exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.buyer_id = (select auth.uid())
          or o.seller_id = (select auth.uid())
          or public.is_admin()
        )
    )
  );

-- No INSERT/UPDATE/DELETE policy: append-only; all writes via the RPC below.

revoke all on public.order_messages from anon, authenticated;
grant select on public.order_messages to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: send_order_message — the sole write path. Authorizes the caller as an
-- order participant (buyer, the order's seller, a shop member, or admin),
-- derives sender identity/role server-side, and absorbs accidental
-- double-submits (same author + body within 10s returns the existing row).
-- -----------------------------------------------------------------------------
create or replace function public.send_order_message(
  p_order_id uuid,
  p_body     text
)
returns public.order_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_body  text := trim(p_body);
  v_order public.orders;
  v_role  public.user_role;
  v_msg   public.order_messages;
begin
  if v_uid is null then
    raise exception 'You must be signed in to send a message' using errcode = '42501';
  end if;
  if v_body is null or char_length(v_body) = 0 then
    raise exception 'Message cannot be empty' using errcode = '22023';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Message is too long' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if not (
    v_order.buyer_id = v_uid
    or v_order.seller_id = v_uid
    or public.is_shop_member(v_order.shop_id)
    or public.is_admin()
  ) then
    raise exception 'You do not have access to this conversation' using errcode = '42501';
  end if;

  v_role := public.current_user_role();

  -- Idempotency: absorb an accidental double-submit (same author + identical
  -- body within a short window) by returning the existing row instead of
  -- inserting a duplicate.
  select * into v_msg
  from public.order_messages
  where order_id = p_order_id
    and sender_id = v_uid
    and body = v_body
    and created_at > now() - interval '10 seconds'
  order by created_at desc
  limit 1;
  if found then
    return v_msg;
  end if;

  insert into public.order_messages (order_id, shop_id, sender_id, sender_role, body)
  values (p_order_id, v_order.shop_id, v_uid, v_role, v_body)
  returning * into v_msg;

  return v_msg;
end;
$$;

comment on function public.send_order_message is
  'Sole write path for order_messages. Authorizes the caller as an order participant (buyer, seller, shop member, or admin), derives sender_id/sender_role from the session, and dedups double-submits.';

revoke all on function public.send_order_message(uuid, text) from public, anon;
grant execute on function public.send_order_message(uuid, text) to authenticated;

commit;
