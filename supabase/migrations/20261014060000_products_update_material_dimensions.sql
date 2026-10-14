-- =============================================================================
-- Products — let sellers/admins update the material and dimensions spec columns.
--
-- 20261014010000_category_attributes.sql added products.material and
-- products.dimensions. `authenticated` holds UPDATE on `public.products` only
-- per column (the table-level UPDATE was revoked by the Inventory migration so
-- `quantity` could be locked down), so the two new columns got no UPDATE
-- privilege: INSERT worked (table-level), but any UPDATE that set either
-- column failed with "permission denied for table products". The product edit
-- page hit this whenever it saved those columns, even with a blank value
-- (PostgREST error 42501).
--
-- This grants UPDATE on exactly those two columns — the same privilege their
-- sibling spec columns (title, description, price_cents, ...) already have.
-- Row access is unchanged: the existing "sellers update their own products"
-- policy (own product, shop member, or admin) still decides which rows can be
-- updated. Nothing else is granted; `quantity` stays locked.
--
-- LIVE-DATA CHECK (run BEFORE applying; expect both rows to show false):
--   select column_name, has_column_privilege('authenticated', 'public.products', column_name, 'UPDATE') as can_update
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'products'
--     and column_name in ('material', 'dimensions');
--
-- ROLLBACK:
--   revoke update (material, dimensions) on public.products from authenticated;
-- =============================================================================

begin;

grant update (material, dimensions) on public.products to authenticated;

commit;
