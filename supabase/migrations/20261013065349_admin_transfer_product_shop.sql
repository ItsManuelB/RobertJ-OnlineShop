-- =============================================================================
-- Shop-seller access, Feature 2: secure, audited admin-only product-transfer
-- action (docs/implementation/SHOP_SELLER_ACCESS_IMPLEMENTATION_PLAN.md).
--
-- Two problems closed here:
--
-- 1. `products.shop_id` (and, same class of gap, `product_variants.shop_id`)
--    had NO column-level protection. The products UPDATE policy's
--    `with_check` is `seller_id = auth.uid() OR is_shop_member(shop_id) OR
--    is_admin()` — satisfied by `seller_id = auth.uid()` alone, regardless of
--    what `shop_id` is being set to. A seller could move their own product
--    (or variant) into *any* shop via a direct PostgREST call, bypassing
--    `updateProductSchema` (which has no `shopId` field, by design, for
--    exactly this reason — see product.schema.ts). This migration adds a
--    `BEFORE UPDATE OF shop_id` trigger on both tables that rejects the
--    change unless a session-local flag is set — mirroring the exact
--    `app.cod_collection_in_progress` / `app.refund_in_progress` pattern
--    already used in `enforce_order_update_rules`. The flag is set only
--    inside `admin_transfer_product_shop` below, for every caller including
--    admin (same F-01 "no bypass, not even for admin" posture as
--    20261011163703_lock_admin_order_update_bypass.sql).
--
-- 2. There was no correct, complete way to *intentionally* move a product's
--    shop assignment: `assignProductShopAction`/`queries.assignProductShop`
--    did a plain client `.update()` relying solely on RLS's bare
--    `is_admin()`, wrote no audit log entry, didn't validate the target shop
--    was active, and the UI only exposed it for `shop_id IS NULL` products
--    (no way to transfer an already-assigned one at all). This migration
--    adds `admin_transfer_product_shop`, which fixes all four: re-checks
--    `is_admin()` internally, validates the destination shop is active,
--    writes one `admin_action_log` row per transfer, and works for any
--    product regardless of its current `shop_id`.
--
-- `product_variants.shop_id` is explicitly cascaded inside the RPC because,
-- unlike `inventory` (which already auto-syncs via `sync_inventory_shop_id`),
-- variants are stamped once at creation and never re-synced — confirmed via
-- pg_trigger before writing this migration.
--
-- Preserves history: no trigger here touches `orders`, `payments`,
-- `stock_adjustments`, or `return_requests`. A product transfer only affects
-- the product/variant rows themselves (and `inventory`, via its existing,
-- unrelated trigger) — every historical record keeps the `shop_id` it was
-- stamped with at the time, exactly as before.
--
-- ROLLBACK:
--   drop trigger products_enforce_shop_immutability on public.products;
--   drop trigger product_variants_enforce_shop_immutability on public.product_variants;
--   drop function public.enforce_product_shop_immutability();
--   drop function public.admin_transfer_product_shop(uuid, uuid);
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Lock-down trigger: shop_id on products/product_variants can only change
-- inside admin_transfer_product_shop's own transaction.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_product_shop_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shop_id is distinct from old.shop_id
     and coalesce(current_setting('app.product_shop_transfer_in_progress', true), 'false') <> 'true'
  then
    raise exception 'A product''s shop assignment can only be changed via the admin transfer action'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Trigger functions are never meant to be called directly over the API
-- (see 20260904000000_revoke_trigger_function_execute.sql). Match that posture.
revoke all on function public.enforce_product_shop_immutability() from public, anon, authenticated;

drop trigger if exists products_enforce_shop_immutability on public.products;
create trigger products_enforce_shop_immutability
  before update of shop_id on public.products
  for each row execute function public.enforce_product_shop_immutability();

drop trigger if exists product_variants_enforce_shop_immutability on public.product_variants;
create trigger product_variants_enforce_shop_immutability
  before update of shop_id on public.product_variants
  for each row execute function public.enforce_product_shop_immutability();

-- ---------------------------------------------------------------------------
-- admin_transfer_product_shop: the sole path that may change shop_id.
-- ---------------------------------------------------------------------------
create or replace function public.admin_transfer_product_shop(p_product_id uuid, p_shop_id uuid)
returns products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_product      public.products;
  v_shop         public.shops;
  v_from_shop_id uuid;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to transfer a product to another shop'
      using errcode = '42501';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  select * into v_shop from public.shops where id = p_shop_id for update;
  if not found then
    raise exception 'Shop not found' using errcode = 'P0002';
  end if;
  if not v_shop.active then
    raise exception 'Cannot transfer a product to an inactive shop' using errcode = '22023';
  end if;

  v_from_shop_id := v_product.shop_id;

  if v_from_shop_id = p_shop_id then
    raise exception 'This product is already assigned to that shop' using errcode = '22023';
  end if;

  perform set_config('app.product_shop_transfer_in_progress', 'true', true);

  update public.products
  set shop_id = p_shop_id
  where id = p_product_id
  returning * into v_product;

  -- Cascade to variants — not auto-synced, unlike inventory (see header note).
  update public.product_variants
  set shop_id = p_shop_id
  where product_id = p_product_id;

  insert into public.admin_action_log (
    actor_id, action, target_shop_id, metadata
  )
  values (
    v_uid, 'transfer_product_shop', p_shop_id,
    jsonb_build_object(
      'product_id', p_product_id,
      'product_title', v_product.title,
      'from_shop_id', v_from_shop_id,
      'to_shop_id', p_shop_id
    )
  );

  return v_product;
end;
$$;

comment on function public.admin_transfer_product_shop is
  'Sole write path for changing a product''s shop assignment (and cascading to its variants). Admin-only, validates the destination shop is active, and logs to admin_action_log. Never touches orders/payments/stock_adjustments/return_requests — historical records keep whatever shop_id they were stamped with at the time.';

revoke all on function public.admin_transfer_product_shop(uuid, uuid) from public, anon;
grant execute on function public.admin_transfer_product_shop(uuid, uuid) to authenticated;

commit;
