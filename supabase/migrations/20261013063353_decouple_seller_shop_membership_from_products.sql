-- =============================================================================
-- Shop-seller access, Feature 1: decouple shop *membership* changes from
-- product *catalog* reassignment.
--
-- `admin_assign_seller_shop` previously reassigned the destination shop's
-- existing products (seller_id) to the incoming seller as a side effect of
-- the membership change. That coupling is wrong: it silently mutates
-- unrelated product rows whenever an admin's only intent was to move a
-- person's shop membership, and it does nothing for the seller's own
-- pre-existing products from their *previous* shop — those are left behind
-- with a stale `shop_id`, which is what breaks shared shop access for any
-- order/inventory/return tied to them (see
-- docs/implementation/SHOP_SELLER_ACCESS_IMPLEMENTATION_PLAN.md, Feature 1).
--
-- After this migration, `admin_assign_seller_shop` only ever touches
-- `profiles.role` and `shop_users`. Product-to-shop assignment becomes the
-- sole responsibility of the new `admin_transfer_product_shop` RPC
-- (Feature 2, separate migration) — a deliberate, explicit, audited action,
-- never an implicit side effect of a membership change.
--
-- `products_reassigned_count` is removed from the `admin_action_log`
-- metadata shape since this function no longer reassigns any products.
--
-- No RLS change. No change to `shop_users`' existing invariants
-- (delete-then-insert, one-shop-per-seller). No historical data touched —
-- products already reassigned by the old behavior keep whatever seller_id
-- they were given; this migration only changes behavior going forward.
--
-- ROLLBACK: re-apply 20260927140310_admin_assign_seller_shop_reassign_products.sql's
-- function body (restores the products-reassignment side effect).
-- =============================================================================

begin;

create or replace function public.admin_assign_seller_shop(p_user_id uuid, p_shop_id uuid)
returns profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid            uuid := (select auth.uid());
  v_profile        public.profiles;
  v_shop           public.shops;
  v_previous_role  public.user_role;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to assign a seller to a shop'
      using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if v_profile.role = 'admin' then
    raise exception 'Cannot assign a shop to an administrator' using errcode = '22023';
  end if;

  select * into v_shop from public.shops where id = p_shop_id for update;
  if not found then
    raise exception 'Shop not found' using errcode = 'P0002';
  end if;
  if not v_shop.active then
    raise exception 'Cannot assign a seller to an inactive shop' using errcode = '22023';
  end if;

  v_previous_role := v_profile.role;

  if v_profile.role = 'buyer' then
    update public.profiles set role = 'seller' where id = p_user_id;
  end if;

  -- Delete-then-insert: never a window with zero or two memberships, and
  -- makes this the sole path for both promotion and later reassignment.
  delete from public.shop_users where user_id = p_user_id;
  insert into public.shop_users (shop_id, user_id) values (p_shop_id, p_user_id);

  -- Deliberately does NOT touch public.products. Membership changes and
  -- product-to-shop catalog assignment are separate concerns — see
  -- admin_transfer_product_shop for the latter.

  insert into public.admin_action_log (
    actor_id, action, target_user_id, target_shop_id, metadata
  )
  values (
    v_uid, 'assign_seller_shop', p_user_id, p_shop_id,
    jsonb_build_object(
      'previous_role', v_previous_role,
      'new_role', 'seller',
      'shop_name', v_shop.name
    )
  );

  select * into v_profile from public.profiles where id = p_user_id;
  return v_profile;
end;
$function$;

commit;
