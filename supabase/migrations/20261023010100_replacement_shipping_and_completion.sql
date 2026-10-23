-- =============================================================================
-- Replacement/Exchange: a replacement is real stock leaving the shelf, and the
-- buyer closes the loop.
--
--   replacement_approved --(seller ships; stock is checked + deducted)-->
--   replacement_shipped  --(buyer confirms, or 7 days pass)-->
--   replacement_completed
--
-- Before: shipping a replacement only stored a tracking number — inventory was
-- never reduced, so the shop's stock was silently wrong, and the request never
-- reached an end state. Now:
--   * record_return_replacement_shipment checks every line has enough stock,
--     deducts it through the shared helper (ledger reason replacement_shipment,
--     so replacements are counted separately from sales) and fails with a plain
--     message when stock is short — nothing is shipped or deducted then.
--   * confirm_replacement_received (buyer) completes it; the 15-minute sweep
--     auto-completes one still unconfirmed 7 days after shipping
--     (complete_overdue_replacements, service-role only).
--   * adjust_stock reserves the new reason for system use only.
-- A replacement is never a sale: no payment, order status or revenue change.
-- ROLLBACK: restore record_return_replacement_shipment from
-- 20261020050000_return_replacement_resolution.sql, drop the new functions and
-- column, recreate the index without the two replacement states.
-- =============================================================================

begin;

alter table public.return_requests
  add column if not exists replacement_completed_at timestamptz;

-- A replacement in progress is OPEN: no duplicate request for the same item.
drop index if exists public.return_requests_one_open_per_order_item;
create unique index return_requests_one_open_per_order_item
  on public.return_requests (order_id, coalesce(order_item_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in (
    'pending', 'seller_accepted', 'refund_due',
    'awaiting_return', 'return_shipped', 'return_received',
    'replacement_approved', 'replacement_shipped'
  );

-- Only the system may write the new ledger reason (same rule as sale/restock):
-- patch the live adjust_stock definition instead of re-pasting the whole body.
do $patch$
declare
  v_def text := pg_get_functiondef('public.adjust_stock(uuid,integer,public.stock_adjustment_reason,text,uuid)'::regprocedure);
begin
  if position('''replacement_shipment''' in v_def) = 0 then
    v_def := replace(
      v_def,
      '''cancellation_restock'', ''return_restock'')',
      '''cancellation_restock'', ''return_restock'', ''replacement_shipment'')'
    );
    execute v_def;
  end if;
end
$patch$;

-- -----------------------------------------------------------------------------
-- Internal: take the replacement's quantity out of inventory. Locks each line,
-- raises if any is short or missing (the whole transaction rolls back, so
-- nothing is partly deducted). Not callable by API roles.
-- -----------------------------------------------------------------------------
create or replace function public._deduct_replacement_stock(p_return_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_request   public.return_requests;
  v_order     public.orders;
  v_item      record;
  v_inventory public.inventory;
begin
  select * into v_request from public.return_requests where id = p_return_id;
  select * into v_order from public.orders where id = v_request.order_id;

  for v_item in
    select product_id, variant_id, quantity
    from public.order_items
    where order_id = v_request.order_id
      and (v_request.order_item_id is null or id = v_request.order_item_id)
  loop
    if v_item.variant_id is not null then
      select * into v_inventory from public.inventory where variant_id = v_item.variant_id for update;
    else
      select * into v_inventory from public.inventory
        where product_id = v_item.product_id and variant_id is null for update;
    end if;

    if not found then
      raise exception 'Cannot ship the replacement: no inventory record for this item'
        using errcode = '23514';
    end if;
    if v_inventory.quantity < v_item.quantity then
      raise exception 'Not enough stock to ship the replacement (need %, have %). Restock first.',
        v_item.quantity, v_inventory.quantity
        using errcode = '23514';
    end if;

    update public.inventory
    set quantity = v_inventory.quantity - v_item.quantity
    where id = v_inventory.id;

    insert into public.stock_adjustments (
      product_id, variant_id, shop_id, delta, previous_quantity, new_quantity,
      reason, note, related_order_id, created_by
    ) values (
      v_item.product_id, v_item.variant_id, v_inventory.shop_id, -v_item.quantity,
      v_inventory.quantity, v_inventory.quantity - v_item.quantity,
      'replacement_shipment', 'Replacement shipped for order ' || v_order.order_number,
      v_order.id, p_actor
    );
  end loop;
end;
$fn$;

revoke all on function public._deduct_replacement_stock(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- record_return_replacement_shipment: same authorization/validation as before,
-- now deducts stock and moves to replacement_shipped.
-- -----------------------------------------------------------------------------
create or replace function public.record_return_replacement_shipment(
  p_return_id uuid,
  p_courier text,
  p_tracking_number text
)
returns public.return_requests
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid      uuid := (select auth.uid());
  v_request  public.return_requests;
  v_order    public.orders;
  v_courier  text := nullif(trim(p_courier), '');
  v_tracking text := nullif(trim(p_tracking_number), '');
begin
  if v_uid is null then
    raise exception 'You must be signed in to record a shipment' using errcode = '42501';
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

  if v_request.status <> 'replacement_approved' then
    raise exception 'Only an approved replacement can have its shipment recorded'
      using errcode = '23514';
  end if;
  if v_request.replacement_shipped_at is not null then
    raise exception 'This replacement has already been shipped' using errcode = '23514';
  end if;

  select * into v_order from public.orders where id = v_request.order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_uid <> v_order.seller_id
     and not public.is_admin()
     and not public.is_shop_member(v_order.shop_id)
  then
    raise exception 'You do not have permission to record this replacement shipment'
      using errcode = '42501';
  end if;

  perform public._deduct_replacement_stock(p_return_id, v_uid);

  update public.return_requests
  set status = 'replacement_shipped',
      replacement_courier = v_courier,
      replacement_tracking_number = v_tracking,
      replacement_shipped_at = now()
  where id = p_return_id
  returning * into v_request;

  return v_request;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- confirm_replacement_received: the BUYER confirms the replacement arrived.
-- -----------------------------------------------------------------------------
create or replace function public.confirm_replacement_received(p_return_id uuid)
returns public.return_requests
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid     uuid := (select auth.uid());
  v_request public.return_requests;
begin
  if v_uid is null then
    raise exception 'You must be signed in to confirm a replacement' using errcode = '42501';
  end if;

  select * into v_request from public.return_requests where id = p_return_id for update;
  if not found then
    raise exception 'Return request not found' using errcode = 'P0002';
  end if;
  if v_request.buyer_id <> v_uid then
    raise exception 'You do not have permission to confirm this replacement' using errcode = '42501';
  end if;
  if v_request.status <> 'replacement_shipped' then
    raise exception 'This replacement has not been shipped yet' using errcode = '23514';
  end if;

  update public.return_requests
  set status = 'replacement_completed',
      replacement_completed_at = now()
  where id = p_return_id
  returning * into v_request;

  return v_request;
end;
$fn$;

revoke all on function public.confirm_replacement_received(uuid) from public, anon;
grant execute on function public.confirm_replacement_received(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- complete_overdue_replacements: replacements still unconfirmed 7 days after
-- shipping are completed automatically (sweep, service role only).
-- -----------------------------------------------------------------------------
create or replace function public.complete_overdue_replacements()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_count integer;
begin
  update public.return_requests
  set status = 'replacement_completed',
      replacement_completed_at = now()
  where status = 'replacement_shipped'
    and replacement_shipped_at is not null
    and replacement_shipped_at < now() - interval '7 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

revoke all on function public.complete_overdue_replacements() from public, anon, authenticated;
grant execute on function public.complete_overdue_replacements() to service_role;

commit;
