-- =============================================================================
-- Variant stock: allocation RPC + status that follows option stock
--
-- 1. allocate_stock_to_variants — moves stock that sits on a product's base
--    inventory row ("unassigned") onto its option rows in ONE transaction.
--    Total stock is preserved by construction: base is decremented by exactly
--    what the options gain, and a move larger than the base row is refused.
--    Nothing is created or duplicated. Each leg is logged in stock_adjustments
--    (reason 'correction') so the audit trail shows where the units went.
--
-- 2. sync_products_quantity_from_inventory — a product WITH options is only
--    sellable through its options, so products.quantity and its active<->sold
--    status now follow the combined option stock (the products_active_requires_stock
--    check needs quantity > 0 while active). Before, option stock was ignored and
--    base stock hitting 0 marked a product with plenty of option stock as sold. Products without options behave exactly
--    as before (base quantity mirrored into products.quantity + status).
--
-- Additive: no schema change. Rollback = restore the previous function bodies
-- (20260912010000_product_variants.sql) and drop allocate_stock_to_variants.
-- =============================================================================

begin;

create or replace function public.sync_products_quantity_from_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock integer;
begin
  if new.quantity is not distinct from old.quantity then
    return new;
  end if;

  if exists (select 1 from public.product_variants where product_id = new.product_id) then
    -- Sold through its options: stock is the combined option stock.
    select coalesce(sum(quantity), 0) into v_stock
    from public.inventory
    where product_id = new.product_id and variant_id is not null;
  elsif new.variant_id is null then
    v_stock := new.quantity;
  else
    return new;
  end if;

  update public.products
  set quantity = v_stock,
      status = case
        when v_stock = 0 and status = 'active' then 'sold'::public.product_status
        when v_stock > 0 and status = 'sold' then 'active'::public.product_status
        else status
      end
  where id = new.product_id;
  return new;
end;
$$;

revoke execute on function public.sync_products_quantity_from_inventory() from public, anon, authenticated;


-- p_allocations: [{"variant_id": "<uuid>", "quantity": <int > 0>}, ...]
create or replace function public.allocate_stock_to_variants(
  p_product_id  uuid,
  p_allocations jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_product    public.products;
  v_base       public.inventory;
  v_row        public.inventory;
  v_entry      jsonb;
  v_variant_id uuid;
  v_qty        integer;
  v_total      integer := 0;
begin
  if v_uid is null then
    raise exception 'You must be signed in to move stock' using errcode = '42501';
  end if;

  if public.current_user_role() not in ('seller', 'admin') then
    raise exception 'You do not have permission to move stock' using errcode = '42501';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Nothing to move' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id;
  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  if v_product.seller_id <> v_uid
     and not public.is_shop_member(v_product.shop_id)
     and not public.is_admin()
  then
    raise exception 'You do not have permission to move stock for this product'
      using errcode = '42501';
  end if;

  select * into v_base
  from public.inventory
  where product_id = p_product_id and variant_id is null
  for update;
  if not found then
    raise exception 'Inventory record not found for this product' using errcode = 'P0002';
  end if;

  for v_entry in select * from jsonb_array_elements(p_allocations)
  loop
    v_variant_id := (v_entry ->> 'variant_id')::uuid;
    v_qty := (v_entry ->> 'quantity')::integer;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Each quantity must be a whole number above zero' using errcode = '22023';
    end if;

    select * into v_row
    from public.inventory
    where variant_id = v_variant_id and product_id = p_product_id
    for update;
    if not found then
      raise exception 'Option not found for this product' using errcode = 'P0002';
    end if;

    update public.inventory set quantity = v_row.quantity + v_qty where id = v_row.id;

    insert into public.stock_adjustments (
      product_id, variant_id, shop_id, delta, previous_quantity, new_quantity,
      reason, note, created_by
    )
    values (
      p_product_id, v_variant_id, v_row.shop_id, v_qty, v_row.quantity,
      v_row.quantity + v_qty, 'correction', 'Moved from unassigned stock', v_uid
    );

    v_total := v_total + v_qty;
  end loop;

  if v_total > v_base.quantity then
    raise exception 'Only % unassigned units are available to move (tried to move %)',
      v_base.quantity, v_total using errcode = '23514';
  end if;

  update public.inventory set quantity = v_base.quantity - v_total where id = v_base.id;

  insert into public.stock_adjustments (
    product_id, variant_id, shop_id, delta, previous_quantity, new_quantity,
    reason, note, created_by
  )
  values (
    p_product_id, null, v_base.shop_id, -v_total, v_base.quantity,
    v_base.quantity - v_total, 'correction', 'Moved to options', v_uid
  );

  return v_total;
end;
$$;

revoke execute on function public.allocate_stock_to_variants(uuid, jsonb) from public, anon;
grant execute on function public.allocate_stock_to_variants(uuid, jsonb) to authenticated;

commit;
