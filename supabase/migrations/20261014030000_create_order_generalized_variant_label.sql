-- =============================================================================
-- create_order — generalize the order_items.variant_label snapshot to
-- include material/dimensions (Phase 1 continued, see
-- 20261014010000_category_attributes.sql's header for full rationale).
--
-- Same signature as the current live definition (confirmed via
-- list_migrations before writing this — 20261005040000_create_order_shop_
-- active_guard.sql is the latest redefinition) — replaced in place, no
-- drop/recreate, so grants are untouched. Only the insert-phase
-- v_variant_label computation changes: it now resolves material/dimensions
-- via the same variant-overrides-product pattern price already uses
-- (coalesce(v_variant.material, v_product.material), ditto dimensions), and
-- concat_ws already skips NULL arguments — a color/size-only product still
-- renders "Red / M" exactly as before; a Decors product with only
-- dimensions renders "30 x 20 x 5 cm" alone. No change to validation,
-- pricing, or stock-locking logic.
--
-- ROLLBACK: re-apply 20261005040000_create_order_shop_active_guard.sql's
-- create_order body (the immediately prior version, before this change).
-- =============================================================================

begin;

create or replace function public.create_order(
  p_seller_id uuid,
  p_items jsonb,
  p_shipping_address jsonb,
  p_shipping_fee_cents integer default 0,
  p_notes text default null,
  p_checkout_group_id uuid default null,
  p_payment_method text default 'cod',
  p_idempotency_key uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_buyer_id      uuid := (select auth.uid());
  v_order         public.orders;
  v_item          jsonb;
  v_product       public.products;
  v_variant       public.product_variants;
  v_variant_id    uuid;
  v_variant_label text;
  v_inventory     public.inventory;
  v_quantity      integer;
  v_unit_price    integer;
  v_subtotal      integer := 0;
  v_currency      char(3);
  v_shop_id       uuid;
begin
  if v_buyer_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_buyer_id = p_seller_id then
    raise exception 'You cannot buy your own listing' using errcode = '22023';
  end if;

  if public.current_user_role() <> 'buyer' then
    raise exception 'Only buyers can place orders' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    insert into public.order_idempotency_keys (buyer_id, idempotency_key, scope)
    values (v_buyer_id, p_idempotency_key, p_seller_id)
    on conflict (buyer_id, idempotency_key, scope) do nothing;

    if not found then
      select o.* into v_order
      from public.orders o
      join public.order_idempotency_keys k
        on k.buyer_id = v_buyer_id
       and k.idempotency_key = p_idempotency_key
       and k.scope = p_seller_id
      where o.id = any (k.order_ids)
      limit 1;

      if found then
        return v_order;
      end if;
      raise exception 'Duplicate order submission' using errcode = '23505';
    end if;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required' using errcode = '22023';
  end if;

  if p_shipping_fee_cents < 0 then
    raise exception 'Shipping fee cannot be negative' using errcode = '22023';
  end if;

  if p_payment_method not in ('cod', 'xendit') then
    raise exception 'Unsupported payment method' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_seller_id and is_active
  ) then
    raise exception 'This seller is not currently accepting orders'
      using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item ->> 'quantity')::integer;
    v_variant_id := nullif(v_item ->> 'variant_id', '')::uuid;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Item quantity must be a positive integer'
        using errcode = '22023';
    end if;

    v_variant := null;
    if v_variant_id is not null then
      select * into v_variant
      from public.product_variants
      where id = v_variant_id;

      if not found or v_variant.product_id <> (v_item ->> 'product_id')::uuid then
        raise exception 'Selected option is no longer available' using errcode = '23503';
      end if;
    end if;

    if v_variant_id is not null then
      select * into v_inventory
      from public.inventory
      where variant_id = v_variant_id
      for update;
    else
      select * into v_inventory
      from public.inventory
      where product_id = (v_item ->> 'product_id')::uuid and variant_id is null
      for update;
    end if;

    if not found then
      raise exception 'Product % not found', v_item ->> 'product_id'
        using errcode = '23503';
    end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
    for update;

    if not found then
      raise exception 'Product % not found', v_item ->> 'product_id'
        using errcode = '23503';
    end if;

    if v_product.status <> 'active' then
      raise exception 'Product % is not available', v_product.title
        using errcode = '22023';
    end if;

    if v_variant_id is not null and v_variant.status <> 'active' then
      raise exception '% is not available', v_product.title
        using errcode = '22023';
    end if;

    if v_product.seller_id <> p_seller_id then
      raise exception 'All items in an order must belong to one seller'
        using errcode = '22023';
    end if;

    if v_product.shop_id is not null and not exists (
      select 1 from public.shops where id = v_product.shop_id and active
    ) then
      raise exception 'This shop is not currently accepting orders'
        using errcode = '22023';
    end if;

    if v_inventory.quantity < v_quantity then
      raise exception 'Only % left of %', v_inventory.quantity, v_product.title
        using errcode = '23514';
    end if;

    if v_currency is null then
      v_currency := v_product.currency;
    elsif v_currency <> v_product.currency then
      raise exception 'All items in an order must share one currency'
        using errcode = '22023';
    end if;

    if v_shop_id is null then
      v_shop_id := v_product.shop_id;
    end if;

    v_unit_price := v_product.price_cents;
    if v_variant_id is not null and v_variant.price_cents is not null then
      v_unit_price := v_variant.price_cents;
    end if;

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
  end loop;

  insert into public.orders (
    buyer_id, seller_id, shop_id, subtotal_cents, shipping_fee_cents, total_cents,
    currency, shipping_address, notes, checkout_group_id, payment_method
  )
  values (
    v_buyer_id, p_seller_id, v_shop_id, v_subtotal, p_shipping_fee_cents,
    v_subtotal + p_shipping_fee_cents, v_currency, p_shipping_address, p_notes,
    p_checkout_group_id, p_payment_method::public.order_payment_method
  )
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item ->> 'quantity')::integer;
    v_variant_id := nullif(v_item ->> 'variant_id', '')::uuid;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid;

    v_unit_price := v_product.price_cents;
    v_variant_label := null;
    v_variant := null;
    if v_variant_id is not null then
      select * into v_variant
      from public.product_variants
      where id = v_variant_id;

      if v_variant.price_cents is not null then
        v_unit_price := v_variant.price_cents;
      end if;

      -- Generalized: material/dimensions resolve via the same
      -- variant-overrides-product pattern price_cents already uses.
      -- concat_ws skips NULLs, so this degrades cleanly for every existing
      -- color/size-only product (unchanged output) and composes cleanly for
      -- a Decors-style product with only dimensions set.
      v_variant_label := nullif(trim(concat_ws(' / ',
        v_variant.color,
        v_variant.size,
        coalesce(v_variant.material, v_product.material),
        coalesce(v_variant.dimensions, v_product.dimensions)
      )), '');
    end if;

    insert into public.order_items (
      order_id, product_id, product_title, quantity,
      unit_price_cents, subtotal_cents, variant_id, variant_label
    )
    values (
      v_order.id, v_product.id, v_product.title, v_quantity,
      v_unit_price, v_unit_price * v_quantity, v_variant_id, v_variant_label
    );

    if v_variant_id is not null then
      select * into v_inventory
      from public.inventory
      where variant_id = v_variant_id;
    else
      select * into v_inventory
      from public.inventory
      where product_id = v_product.id and variant_id is null;
    end if;

    update public.inventory
    set quantity = v_inventory.quantity - v_quantity
    where id = v_inventory.id;

    insert into public.stock_adjustments (
      product_id, variant_id, shop_id, delta, previous_quantity, new_quantity,
      reason, note, related_order_id, created_by
    )
    values (
      v_product.id, v_variant_id, v_product.shop_id, -v_quantity, v_inventory.quantity,
      v_inventory.quantity - v_quantity, 'sale', 'Order ' || v_order.order_number,
      v_order.id, null
    );
  end loop;

  if p_idempotency_key is not null then
    update public.order_idempotency_keys
    set order_ids = array[v_order.id]
    where buyer_id = v_buyer_id
      and idempotency_key = p_idempotency_key
      and scope = p_seller_id;
  end if;

  return v_order;
end;
$fn$;

comment on function public.create_order is
  'Atomically validates stock, creates an order with its items, and decrements inventory (products.quantity syncs via trigger for non-variant lines). Each item may optionally carry a variant_id; price falls back to the product price when the variant has none of its own; variant_label resolves color/size/material/dimensions, variant overriding product, skipping whichever are null.';

commit;
