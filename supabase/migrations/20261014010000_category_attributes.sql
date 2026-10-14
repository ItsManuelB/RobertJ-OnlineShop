-- =============================================================================
-- Category Attributes — Phase 1 of the Specifications & Variants plan
-- (docs/plans/product-specifications-and-variants-implementation.md).
--
-- Generalizes product_variants beyond its current color/size-only shape by
-- adding `material`/`dimensions` as a nullable pair of columns on `products`
-- (the default/spec value) — the matching pair on `product_variants` itself
-- (the per-variant override) is added separately in
-- 20261014020000_product_variants_material_dimensions.sql, kept apart so
-- each migration touches exactly one table's shape.
--
-- `category_attributes` is the one new piece of real flexibility: which of
-- color/size/material/dimensions applies to a given category, and under
-- which of two independent regimes —
--   * is_required      — a hard-required SPEC field, enforced at publish,
--                         no seller opt-out (e.g. Decors' Dimensions).
--   * is_variant_eligible — offered as a seller opt-in checkbox in the
--                         Variant Manager; never auto-applied, and never
--                         combined with is_required (see the CHECK below) —
--                         product_variants stays optional for every product
--                         in every category, exactly as it is today.
--   * is_recommended   — soft, non-blocking nudge; only meaningful when
--                         is_variant_eligible is true.
-- Full rationale and the cross-platform precedent (Shopify/Etsy/WooCommerce/
-- Shopee/Lazada) backing this split is in the plan's §3.5.
--
-- Deliberately NOT a generic EAV/jsonb attribute-value store — explicit
-- typed columns on products/product_variants, same rationale already
-- established by product_variants' own "not a generic EAV system" comment
-- and recommendation_rules' "explicit typed columns, not jsonb" comment.
--
-- ROLLBACK:
--   alter table public.products drop column material, drop column dimensions;
--   drop table public.category_attributes;
--   drop type public.product_attribute_key;
-- =============================================================================

begin;

create type public.product_attribute_key as enum ('color', 'size', 'material', 'dimensions');

create table public.category_attributes (
  id                   uuid primary key default gen_random_uuid(),
  category_id          uuid not null references public.categories (id) on delete cascade,
  attribute_key         public.product_attribute_key not null,

  is_required          boolean not null default false,
  is_variant_eligible   boolean not null default false,
  is_recommended       boolean not null default false,

  -- optional admin-curated picklist (e.g. size: XS,S,M,L,XL); null = free text
  allowed_values        text[],
  display_order         integer not null default 0,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint category_attributes_unique unique (category_id, attribute_key),
  constraint category_attributes_required_not_variant
    check (not (is_required and is_variant_eligible)),
  constraint category_attributes_recommended_needs_variant
    check (not (is_recommended and not is_variant_eligible))
);

comment on table public.category_attributes is
  'Per-category config for which of color/size/material/dimensions apply, whether a spec is hard-required, and whether a variant axis is offered (seller opt-in checkbox) and/or recommended. See docs/plans/product-specifications-and-variants-implementation.md §3.5.';

create index category_attributes_category_id_idx on public.category_attributes (category_id);

create trigger category_attributes_set_updated_at
  before update on public.category_attributes
  for each row execute function public.set_updated_at();

-- Public read (seller product form, buyer filters, Guided Selection quiz all
-- need this); admin-only write — identical shape to categories' own policies.
grant select on public.category_attributes to anon, authenticated;
grant insert, update, delete on public.category_attributes to authenticated;

alter table public.category_attributes enable row level security;

create policy "category attributes are publicly readable"
  on public.category_attributes for select
  to anon, authenticated
  using (true);

create policy "admins manage category attributes"
  on public.category_attributes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- products: material/dimensions spec columns (default value; overridable per
-- variant — see the next migration). Nullable, additive — every existing row
-- gets NULL and every existing read path is unaffected until the columns are
-- selected explicitly.
-- -----------------------------------------------------------------------------
alter table public.products
  add column material text,
  add column dimensions text;

alter table public.products
  add constraint products_material_length check (material is null or char_length(material) <= 160),
  add constraint products_dimensions_length check (dimensions is null or char_length(dimensions) <= 160);

comment on column public.products.material is
  'Default/spec material value (e.g. "100% Combed Cotton"). Overridable per variant via product_variants.material — null there inherits this.';
comment on column public.products.dimensions is
  'Default/spec physical dimensions as free text (e.g. "30 x 20 x 5 cm"). Overridable per variant via product_variants.dimensions — null there inherits this.';

commit;
