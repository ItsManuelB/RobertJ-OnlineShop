-- =============================================================================
-- Product Variants — generalize beyond color/size (Phase 1 continued, see
-- 20261014010000_category_attributes.sql's header for full rationale).
--
-- Adds `material`/`dimensions` to product_variants as a per-variant OVERRIDE
-- of the new products.material/dimensions default — same nullable-inherits
-- pattern already established by price_cents (`variant.price_cents ??
-- product.price_cents`), just applied to two more fields.
--
-- Generalizes product_variants_has_attribute so a variant can be identified
-- purely by material or dimensions (e.g. a Decors variant distinguished only
-- by Wood vs. Ceramic, with no meaningful color/size) without requiring a
-- placeholder color/size value.
--
-- Also fixes a latent uniqueness hole (found auditing this exact constraint
-- for the change above, not separate scope): `unique (product_id, color,
-- size)` uses standard SQL NULL semantics, where NULL <> NULL for uniqueness
-- purposes — two variants both having color = 'Red' and size = NULL would
-- NOT violate the old constraint. Replaced with a NULLS NOT DISTINCT unique
-- index (live Postgres is 17.6 — confirmed via list_projects before writing
-- this — so NULLS NOT DISTINCT, available since PG15, is used directly
-- rather than a coalesce-to-sentinel expression index).
--
-- ROLLBACK:
--   drop index public.product_variants_unique_combo_idx;
--   alter table public.product_variants add constraint product_variants_unique_combo unique (product_id, color, size);
--   alter table public.product_variants drop constraint product_variants_has_attribute;
--   alter table public.product_variants add constraint product_variants_has_attribute check (color is not null or size is not null);
--   alter table public.product_variants drop constraint product_variants_material_length;
--   alter table public.product_variants drop constraint product_variants_dimensions_length;
--   alter table public.product_variants drop column material, drop column dimensions;
-- =============================================================================

begin;

alter table public.product_variants
  add column material text,
  add column dimensions text;

alter table public.product_variants
  add constraint product_variants_material_length check (material is null or char_length(material) <= 60),
  add constraint product_variants_dimensions_length check (dimensions is null or char_length(dimensions) <= 80);

comment on column public.product_variants.material is
  'Per-variant override of products.material. Null = inherit the parent product''s material.';
comment on column public.product_variants.dimensions is
  'Per-variant override of products.dimensions. Null = inherit the parent product''s dimensions.';

-- Drop and regeneralize product_variants_has_attribute to admit material-
-- or dimensions-only variants.
alter table public.product_variants drop constraint product_variants_has_attribute;
alter table public.product_variants
  add constraint product_variants_has_attribute
  check (color is not null or size is not null or material is not null or dimensions is not null);

-- Drop the old 2-column unique constraint and replace with a 4-column,
-- NULLS NOT DISTINCT unique index (see header note on the NULL-uniqueness
-- fix this also delivers).
alter table public.product_variants drop constraint product_variants_unique_combo;
create unique index product_variants_unique_combo_idx
  on public.product_variants (product_id, color, size, material, dimensions)
  nulls not distinct;

comment on index public.product_variants_unique_combo_idx is
  'Generalized from the old unique(product_id, color, size): NULLS NOT DISTINCT closes the pre-existing gap where two variants differing only by an all-NULL column were not treated as duplicates.';

commit;
