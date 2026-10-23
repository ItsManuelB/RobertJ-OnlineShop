-- =============================================================================
-- Return and Refund: the buyer ships the item back BEFORE the refund.
--
-- Flow (request_type / admin resolution = return_and_refund):
--   seller accepts -> admin approves -> awaiting_return (buyer has 5 days)
--   -> buyer enters courier + tracking -> return_shipped
--   -> seller marks received + inspects (sellable / not sellable) -> return_received
--   -> admin confirms the refund (decide_return, next migration) -> refunded
-- A buyer who never ships is closed automatically (return_expired).
--
-- This migration adds the columns, the one-open-request index, a shared restock
-- helper, and the three new write paths. decide_return changes in
-- 20261023000200_decide_return_return_shipping.sql. The enum values it uses were
-- committed in 20261023000000.
-- Restock happens when the seller records a SELLABLE item as received (the item
-- is physically back); a not-sellable item is recorded and never restocked.
-- ROLLBACK: drop the three functions + helper, drop the return_* columns,
-- recreate the index with only pending/seller_accepted/refund_due.
-- =============================================================================

begin;

alter table public.return_requests
  add column if not exists return_deadline_at timestamptz,
  add column if not exists return_courier text,
  add column if not exists return_tracking_number text,
  add column if not exists return_shipped_at timestamptz,
  add column if not exists return_received_at timestamptz,
  add column if not exists return_received_by uuid references public.profiles (id) on delete set null,
  add column if not exists return_inspection text;

do $$ begin
  alter table public.return_requests
    add constraint return_requests_return_inspection_check
    check (return_inspection is null or return_inspection in ('sellable', 'not_sellable'));
exception when duplicate_object then null; end $$;

create index if not exists return_requests_return_received_by_idx
  on public.return_requests (return_received_by);

-- Still-in-progress return-shipping states are OPEN: a buyer can't file a
-- duplicate while the item is on its way back.
drop index if exists public.return_requests_one_open_per_order_item;
create unique index return_requests_one_open_per_order_item
  on public.return_requests (order_id, coalesce(order_item_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in (
    'pending', 'seller_accepted', 'refund_due',
    'awaiting_return', 'return_shipped', 'return_received'
  );

-- -----------------------------------------------------------------------------
-- Shared restock helper: the single place a returned item goes back into
-- inventory (same lock order and stock_adjustments shape as
-- restock_on_order_cancel). Internal only — not callable by API roles.
-- -----------------------------------------------------------------------------
create or replace function public._restock_return_items(p_return_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request   public.return_requests;
  v_order     public.orders;
  v_item      record;
  v_inventory public.inventory;
begin
  select * into v_request from public.return_requests where id = p_return_id;
  select * into v_order from public.orders where id = v_request.order_id;

  if v_request.order_item_id is null then
    for v_item in
      select product_id, variant_id, quantity
      from public.order_items
      where order_id = v_request.order_id
    loop
      if v_item.variant_id is not null then
        select * into v_inventory from public.inventory where variant_id = v_item.variant_id for update;
      else
        select * into v_inventory from public.inventory
          where product_id = v_item.product_id and variant_id is null for update;
      end if;

      if not found then
        continue;
      end if;

      update public.inventory
      set quantity = v_inventory.quantity + v_item.quantity
      where id = v_inventory.id;

      insert into public.stock_adjustments (
        product_id, variant_id, shop_id, delta, previous_quantity, new_quantity,
        reason, note, related_order_id, created_by
      ) values (
        v_item.product_id, v_item.variant_id, v_inventory.shop_id, v_item.quantity,
        v_inventory.quantity, v_inventory.quantity + v_item.quantity,
        'return_restock', 'Restocked from approved return on order ' || v_order.order_number,
        v_order.id, p_actor
      );
    end loop;
  else
    select product_id, variant_id, quantity into v_item
    from public.order_items
    where id = v_request.order_item_id;

    if v_item.variant_id is not null then
      select * into v_inventory from public.inventory where variant_id = v_item.variant_id for update;
    else
      select * into v_inventory from public.inventory
        where product_id = v_item.product_id and variant_id is null for update;
    end if;

    if found then
      update public.inventory
      set quantity = v_inventory.quantity + v_item.quantity
      where id = v_inventory.id;

      insert into public.stock_adjustments (
        product_id, variant_id, shop_id, delta, previous_quantity, new_quantity,
        reason, note, related_order_id, created_by
      ) values (
        v_item.product_id, v_item.variant_id, v_inventory.shop_id, v_item.quantity,
        v_inventory.quantity, v_inventory.quantity + v_item.quantity,
        'return_restock', 'Restocked from approved return on order ' || v_order.order_number,
        v_order.id, p_actor
      );
    end if;
  end if;
end;
$$;

revoke all on function public._restock_return_items(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- record_return_shipment: the BUYER enters the courier + tracking number of the
-- parcel they are sending back. Only while awaiting_return and before the
-- deadline.
-- -----------------------------------------------------------------------------
create or replace function public.record_return_shipment(
  p_return_id uuid,
  p_courier text,
  p_tracking_number text
)
returns public.return_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_request  public.return_requests;
  v_courier  text := nullif(trim(p_courier), '');
  v_tracking text := nullif(trim(p_tracking_number), '');
begin
  if v_uid is null then
    raise exception 'You must be signed in to record a return shipment' using errcode = '42501';
  end if;

  if v_courier is null then
    raise exception 'Courier is required' using errcode = '22023';
  end if;
  if char_length(v_courier) > 80 then
    raise exception 'Courier name is too long' using errcode = '22023';
  end if;
  if v_tracking is null then
    raise exception 'Tracking number is required' using errcode = '22023';
  end if;
  if char_length(v_tracking) > 120 then
    raise exception 'Tracking number is too long' using errcode = '22023';
  end if;

  select * into v_request from public.return_requests where id = p_return_id for update;
  if not found then
    raise exception 'Return request not found' using errcode = 'P0002';
  end if;

  if v_request.buyer_id <> v_uid then
    raise exception 'You do not have permission to ship this return' using errcode = '42501';
  end if;

  if v_request.status <> 'awaiting_return' then
    raise exception 'This return is not waiting for you to ship the item back'
      using errcode = '23514';
  end if;

  if v_request.return_deadline_at is not null and v_request.return_deadline_at < now() then
    raise exception 'The time to ship this item back has passed' using errcode = '23514';
  end if;

  update public.return_requests
  set status = 'return_shipped',
      return_courier = v_courier,
      return_tracking_number = v_tracking,
      return_shipped_at = now()
  where id = p_return_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.record_return_shipment(uuid, text, text) from public, anon;
grant execute on function public.record_return_shipment(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- record_return_received: the seller (or shop member / admin) confirms the
-- parcel arrived and records its condition. 'sellable' restocks through the
-- shared helper; 'not_sellable' is recorded only. Moves to return_received,
-- which is what the admin's refund confirmation waits for.
-- -----------------------------------------------------------------------------
create or replace function public.record_return_received(
  p_return_id uuid,
  p_condition text,
  p_note      text default null
)
returns public.return_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_request public.return_requests;
  v_order   public.orders;
  v_note    text := nullif(trim(p_note), '');
begin
  if v_uid is null then
    raise exception 'You must be signed in to record a received return' using errcode = '42501';
  end if;

  if p_condition is null or p_condition not in ('sellable', 'not_sellable') then
    raise exception 'Invalid condition' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Note is too long' using errcode = '22023';
  end if;

  select * into v_request from public.return_requests where id = p_return_id for update;
  if not found then
    raise exception 'Return request not found' using errcode = 'P0002';
  end if;

  if v_request.status <> 'return_shipped' then
    raise exception 'This return has not been shipped back yet' using errcode = '23514';
  end if;

  select * into v_order from public.orders where id = v_request.order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_uid <> v_order.seller_id
     and not public.is_admin()
     and not public.is_shop_member(v_order.shop_id)
  then
    raise exception 'You do not have permission to receive this return' using errcode = '42501';
  end if;

  if p_condition = 'sellable' then
    perform public._restock_return_items(p_return_id, v_uid);
  end if;

  update public.return_requests
  set status = 'return_received',
      return_received_at = now(),
      return_received_by = v_uid,
      return_inspection = p_condition,
      restocked_at = case when p_condition = 'sellable' then now() else restocked_at end,
      marked_unsellable_at = case when p_condition = 'not_sellable' then now() else marked_unsellable_at end,
      condition_note = v_note,
      condition_recorded_by = v_uid
  where id = p_return_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.record_return_received(uuid, text, text) from public, anon;
grant execute on function public.record_return_received(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- expire_overdue_return_requests: closes awaiting_return requests whose ship-back
-- deadline passed. Service-role only (called by the 15-minute sweep). Returns
-- how many were closed. Nothing was refunded, so there is nothing to undo.
-- -----------------------------------------------------------------------------
create or replace function public.expire_overdue_return_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.return_requests
  set status = 'return_expired'
  where status = 'awaiting_return'
    and return_deadline_at is not null
    and return_deadline_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_overdue_return_requests() from public, anon, authenticated;
grant execute on function public.expire_overdue_return_requests() to service_role;

commit;
