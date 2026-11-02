-- =============================================================================
-- Seller "My Shop": the shop name was previously admin-only (see
-- 20261005050000_admin_update_shop_and_column_scope.sql, which deliberately
-- excluded `name` from the authenticated column grant). By explicit request,
-- any member of a shop may now rename it themselves — the same permission
-- tier `updateOwnShopDescription`/logo/banner already use (RLS already lets
-- any shop member write those columns; this just extends that same "shared
-- shop, any member edits branding" model to the name).
--
-- Deliberately a new SECURITY DEFINER RPC, not a widened column grant:
--  * Keeps `shops.name` locked out of direct PostgREST writes (defense in
--    depth — same reasoning as send_order_message/admin_update_shop), so a
--    rename always goes through this validated, single path.
--  * Resolves the caller's own shop server-side via shop_users (one shop per
--    user — shop_users_unique_user), never a client-submitted shop id.
--  * Re-validates the 1-80 length bound inline (mirrors the table's own
--    `shops_name_length` CHECK) for a friendly error instead of a raw
--    constraint-violation message.
--  * `slug` and `active` are untouched — renaming never changes the shop's
--    public URL (ROUTES.shopCatalog keys off `shops.id`, not slug) or status;
--    those stay admin-only via `admin_update_shop`.
--
-- ROLLBACK:
--   revoke execute on function public.update_own_shop_name(text) from authenticated;
--   drop function if exists public.update_own_shop_name(text);
-- =============================================================================

create or replace function public.update_own_shop_name(p_name text)
returns public.shops
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_shop_id uuid;
  v_name    text := trim(p_name);
  v_shop    public.shops;
begin
  if v_uid is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) = 0 then
    raise exception 'Shop name is required' using errcode = '22023';
  end if;
  if char_length(v_name) > 80 then
    raise exception 'Shop name must be 80 characters or fewer' using errcode = '22023';
  end if;

  select shop_id into v_shop_id from public.shop_users where user_id = v_uid;
  if v_shop_id is null then
    raise exception 'Your account isn''t linked to a shop yet' using errcode = '42501';
  end if;

  update public.shops
  set name = v_name
  where id = v_shop_id
  returning * into v_shop;

  return v_shop;
end;
$$;

comment on function public.update_own_shop_name is
  'Seller-side shop rename: resolves the caller''s own shop via shop_users, validates the 1-80 char bound, updates shops.name. slug/active are untouched and stay admin-only (admin_update_shop).';

revoke all on function public.update_own_shop_name(text) from public, anon;
grant execute on function public.update_own_shop_name(text) to authenticated;
