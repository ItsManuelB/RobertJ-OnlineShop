# Category-Specific Specifications & Generalized Variants — Implementation Plan

> Status: **Proposed — not implemented.** No code or migrations have been applied. This document is for review and approval before any implementation work starts, per the request that created it.

> [!NOTE]
> No reference image was actually attached to the request that produced this plan — only the four category names (**Shirts & Tops, Bottoms, Outerwear, Decors**) came through as text. Everything below is grounded in the live codebase; the category-attribute *recommendations* (§4) are informed e-commerce conventions for those category names, not anything read from an image. If an image exists and shows specific fields (e.g. a particular size chart, a "fit" field, specific decor attributes), flag it and §4 can be revised before implementation.

---

## 1. Executive Summary

RoberJ already has a working, narrower version of this feature: `product_variants` supports exactly **two** buyer-selectable attributes — `color` and `size` — each variant independently tracked for price override, SKU, and stock (via `inventory.variant_id`). This plan generalizes that system to also support **material** and **dimensions**, makes attribute *requiredness/selectability* **configurable per category** (so Decors and Shirts & Tops don't share one hardcoded shape), and brings **Guided Product Selection** and the **catalog filters** into alignment with whatever a category actually defines — instead of their current hardcoded, apparel-only vocabulary.

The design deliberately **extends the existing explicit-column pattern** (`price_cents` override on variants, `color`/`size` columns) rather than introducing a generic EAV/jsonb attribute system. The codebase has already rejected that approach twice — `product_variants`' own migration comment states it's "not a generic EAV system," and `recommendation_rules` uses "explicit typed columns, not jsonb, same rationale as products/orders." This plan follows that precedent rather than overriding it, per [CLAUDE.md → AI Decision Rules](../../CLAUDE.md#ai-decision-rules) ("preserve the architecture... prefer maintainability over cleverness").

**What's genuinely new, not just extended:**
- A `category_attributes` config table — the one piece of real flexibility this needs, since "which attributes matter, are they required, are they buyer-selectable" must vary by category and currently has nowhere to live.
- `material` and `dimensions` as a nullable pair of columns on **both** `products` (the default/spec value) and `product_variants` (an optional per-variant override) — mirroring exactly how `price_cents` already works today (`variant.price_cents ?? product.price_cents`).
- A missing admin **Category Management UI** (categories currently have zero application-level CRUD — see Finding F-1) — needed as a prerequisite, since there's no way to manage category-attribute config without first being able to manage categories.
- A generalized, category-aware `ProductFilters` and `GuidedSelectorQuiz` that read the same `category_attributes` config instead of their current hardcoded shapes.
- **A two-layer requiredness model, added after review** (see §3.5): the category config decides which attributes exist for a category and whether a *spec* is hard-required, but whether an attribute becomes a *buyer-selectable variant* is always an explicit, per-product seller checkbox — never auto-applied, even when the category allows it. This mirrors how Shopify, Etsy, WooCommerce, and Shopee/Lazada (the project's own stated UX inspiration) all actually work, and is detailed with precedent in §3.5.

**What's deliberately *not* changing:** `color`/`size` semantics, the cart/checkout data flow (already attribute-agnostic — see Finding F-7), the inventory locking model, payments, order lifecycle, RBAC/RLS patterns, and the `recommendation_occasion` enum. Variant creation itself also stays optional for every product in every category, exactly as it is today — this plan never introduces a hard requirement to create variants, only a hard requirement on required *spec* fields (§3.5).

---

## 2. Verified Findings (current codebase state)

Everything in this section was confirmed by reading the actual migrations, `database.types.ts`, and source files — not inferred from docs.

| # | Finding | Evidence |
|---|---|---|
| **F-1** | **Categories have zero application-level CRUD today.** `src/features/categories/{actions,schemas,services,hooks,utils}/` contain only `.gitkeep` files. The only category code is read-only (`listActiveCategories`, `getCategoryBySlug`) plus a category *filter* in `/admin/products`. The `categories` table's `is_admin()`-gated INSERT/UPDATE/DELETE RLS policies exist in SQL but nothing in the app calls them — categories today must be managed by direct SQL/Supabase Studio. | `src/features/categories/**`, `src/app/admin/products/page.tsx`, `supabase/migrations/20260802000100_initial_schema.sql` |
| **F-2** | **No seed data and no category-name constants exist in the repo.** The four category names in the request (Shirts & Tops, Bottoms, Outerwear, Decors) are not present anywhere in migrations or source. They exist, if at all, only as live rows in the Supabase database, created outside the committed codebase. | repo-wide search, confirmed no hits |
| **F-3** | **`product_variants` is explicitly, deliberately limited to `color`/`size`.** `CHECK (color is not null or size is not null)`, `UNIQUE (product_id, color, size)`. No `material`, no `dimensions`, no generic attribute table anywhere. | `supabase/migrations/20260912010000_product_variants.sql` |
| **F-4** | **`products` has no material/dimension columns.** The only "attribute-like" surface on `products` is a free-form `tags text[]` (max 20, unvalidated against anything) and the `condition` enum (`new/like_new/good/fair/poor`) — neither is a substitute for category-specific specs. | same migration as F-3's base, `20260802000100_initial_schema.sql` |
| **F-5** | **The PDP variant picker is hardcoded to exactly two axes.** `ProductQuantityAndAddToCart.tsx` derives `colors`/`sizes` arrays and resolves the selected variant by exact match on both — there is no third axis anywhere in this component's logic. | `src/features/products/components/ProductQuantityAndAddToCart.tsx` |
| **F-6** | **`ProductFilters` has no size/color/material filter at all today**, and the filter set is not category-aware — the same fixed control set (On Sale / price / shop / sort) renders regardless of which category is selected. | `src/features/products/components/ProductFilters.tsx` |
| **F-7** | **The cart and checkout layers are already attribute-agnostic** — `cart_items`/`CartItem` key purely off `variantId` (no color/size-specific fields), `groupCartBySeller` never inspects variant internals, and `placeOrderAction`'s payload to `create_order` is just `{product_id, variant_id, quantity}`. **This layer needs no change** to support new attributes. | `src/features/cart/utils/cart-reducer.ts`, `src/features/checkout/actions/checkout.actions.ts` |
| **F-8** | **`create_order`'s variant snapshot is the one checkout-side place that *is* hardcoded to two attributes** — it builds `order_items.variant_label` via `concat_ws(' / ', v_variant.color, v_variant.size)`. This is the only SQL change checkout/order-creation needs. | `supabase/migrations/20261005040000_create_order_shop_active_guard.sql` (latest `create_order` definition) |
| **F-9** | **Guided Selection's vocabulary is hardcoded and apparel-only**, and structurally can't fit Decors: `OCCASIONS` is a fixed 7-value Postgres enum (`casual/formal/work/sportswear/party/wedding/everyday`) and `GUIDED_SELECTION_SIZES` is a hardcoded Zod list (`XS,S,M,L,XL,XXL,One Size`) — neither is derived from a category. | `src/features/assistant/schemas/rule.schema.ts`, `supabase/migrations/20260914000000_recommendation_rules.sql` |
| **F-10** | **An existing, unrelated bug**: Guided Selection's size matching compares the buyer's answer against `recommendation_rules.size` (the rule's own free-text column) — **never** against the linked variant's actual `size`, even when the rule names a specific `variant_id`. A rule's stated size and its linked variant's real size can silently diverge; there's no trigger or constraint catching it. This plan's generalization (§6.4) removes the redundant column entirely rather than adding two more copies (`material`, `dimensions`) with the same bug. | `listGuidedSelectionMatches` in `src/lib/supabase/queries.ts` |
| **F-11** | **`database.types.ts` has one pre-existing, unrelated drift**: `product_variants.seller_id` is typed `string` (non-null) but the live schema dropped `NOT NULL` in `20261005030000_product_variants_seller_set_null.sql`. Worth fixing opportunistically during the type regen this plan requires anyway, not otherwise in scope. | `src/lib/supabase/database.types.ts` vs. the cited migration |
| **F-12** | **Inventory's locking/uniqueness model already generalizes for free.** `inventory`/`stock_adjustments` key stock to `variant_id` (nullable) with partial unique indexes (`variant_id is null` vs. `is not null`); this doesn't care how many attributes define a variant. **No inventory schema change needed.** | `supabase/migrations/20260912010000_product_variants.sql` |
| **F-13** | **A real latent bug in the current unique constraint**, found while designing the fix for F-3: `UNIQUE (product_id, color, size)` uses standard SQL NULL semantics, where `NULL <> NULL` for uniqueness purposes. A product with two variants that both have `color = 'Red'` and `size = NULL` would **not** violate this constraint — true duplicate variants are possible today whenever `size` (or `color`) is left blank. This plan's generalized constraint (§6.1) fixes this as a side effect of the change already being made to accommodate more attributes — it is not separate scope. | `product_variants_unique_combo` constraint, same migration as F-3 |

---

## 3. Recommended Architecture

### 3.1 The core decision: config-driven requiredness, not a generic attribute-value store

Three options were considered:

| Option | Verdict |
|---|---|
| **Full EAV** (`category_attributes` + `product_attribute_values` + `variant_attribute_values`, arbitrary keys) | **Rejected.** Maximally flexible but contradicts the codebase's explicit, twice-stated preference for typed columns over jsonb/EAV (`product_variants`'s own migration comment; `recommendation_rules`'s migration comment). Over-engineered for four known categories and four known attribute types. |
| **Pure jsonb spec blob** on `products`/`product_variants` | **Rejected.** Same reason — loses type safety, can't be validated by a `CHECK` constraint, can't be indexed/filtered cheaply, breaks the "literal column lists" convention `queries.ts` relies on throughout. |
| **Explicit nullable columns for the known attribute set, with a small config table governing per-category requiredness/selectability** | **Chosen.** Matches the existing `price_cents`-override precedent exactly; the only new "flexible" surface is which attributes apply to which category and whether they're required/variant-eligible — not the attribute values themselves. |

### 3.2 Schema shape

```text
categories
  └─ category_attributes (NEW)        — per category: is color/size/material/dimensions
                                         eligible at all? is a spec hard-required? is a
                                         variant axis recommended? what picklist values
                                         are allowed? (requiredness semantics in §3.5)
products
  ├─ material        (NEW, nullable)  — default/spec value
  └─ dimensions       (NEW, nullable) — default/spec value, free-text ("30 × 20 × 5 cm")

product_variants
  ├─ material        (NEW, nullable)  — per-variant OVERRIDE, same pattern as price_cents
  └─ dimensions       (NEW, nullable) — per-variant OVERRIDE
```

**Resolution rule everywhere a value is read (PDP, cart line display, order snapshot):**
```
effective_material   = variant?.material   ?? product.material
effective_dimensions = variant?.dimensions ?? product.dimensions
```
This is the *same* rule already used for `price_cents` — no new resolution concept, just applied to two more fields.

**Why material/dimensions get columns on *both* tables but color/size don't change:** `color`/`size` already work and are the common case (every apparel variant needs them); touching their semantics is unnecessary risk for zero benefit. Material/dimensions are the two genuinely new attributes the request asks for, and they naturally need a "most products don't vary by this, but some do" story — which the override pattern gives for free.

**Why `is_variant_axis` is a per-category flag, not a fixed rule:** the same attribute plays different roles by category. For Shirts & Tops, size/color are variant axes (buyer picks one to buy) and material is usually a spec (fixed per listing). For Decors, dimensions might be the variant axis (Small/Medium/Large are literally different physical products) while color is just a spec. Hardcoding either shape would misfit the other category — this is exactly why `category_attributes` exists.

### 3.3 Recommended per-category configuration (recommendation, not verified)

This is a proposal to seed into `category_attributes`, informed by standard apparel/home-goods retail conventions — adjust freely before implementation, especially if a reference image surfaces with different fields. Terminology follows §3.5's two-layer model: **"Required spec"** is hard-enforced at publish with no seller opt-out; **"Variant-eligible"** means the attribute is *offered* as a seller checkbox in the Variant Manager, never auto-applied; **"Recommended"** is a soft, non-blocking nudge shown only when a variant-eligible checkbox is left unchecked.

| Category | `size` | `color` | `material` | `dimensions` |
|---|---|---|---|---|
| **Shirts & Tops** | Variant-eligible, recommended (allowed values: XS–XXL) | Variant-eligible, recommended | Optional spec (checkbox) | N/A (omit the row) |
| **Bottoms** | Variant-eligible, recommended (allowed values: 28–40 waist, or XS–XXL) | Variant-eligible, recommended | Optional spec (checkbox) | Optional spec (checkbox — inseam) |
| **Outerwear** | Variant-eligible, recommended (XS–XXL) | Variant-eligible, recommended | Optional spec (checkbox, e.g. "Shell: Nylon") | N/A |
| **Decors** | Variant-eligible, not recommended by default (only if the shop sells size tiers) | Variant-eligible, not recommended by default | Variant-eligible, not recommended by default (e.g. Wood vs. Ceramic) | **Required spec** — always shown, no checkbox, blocks publish if empty (buyers need exact physical size to judge fit in a room) |

A category with no row for a given attribute key simply never shows that field/checkbox/question — the absence of a row is the "N/A" signal, no extra "applicable" flag needed. Note that nothing in this table says "required variant axis" — per §3.5, that combination is no longer possible by design.

### 3.4 Variant identity generalization

Current: `CHECK (color is not null or size is not null)` + `UNIQUE (product_id, color, size)`.

New: `CHECK (color is not null or size is not null or material is not null or dimensions is not null)` — a Decors variant identified purely by material (Wood vs. Ceramic) or dimensions (Small vs. Large) becomes valid, without requiring a meaningless color/size.

New uniqueness (also fixes F-13): a `NULLS NOT DISTINCT` unique index (Postgres 15+) or, if the project's Postgres version predates that, an expression index coalescing each column to a sentinel:
```sql
create unique index product_variants_unique_combo_idx on public.product_variants (
  product_id,
  coalesce(color, ''), coalesce(size, ''), coalesce(material, ''), coalesce(dimensions, '')
);
```
(Confirm the live Postgres version before choosing between these two — Supabase projects are commonly on 15+, in which case `NULLS NOT DISTINCT` is simpler and should be preferred.)

### 3.5 The two-layer requiredness model (added after review — grounded in real-platform precedent)

An early draft of this plan let the category alone decide everything, including forcing a variant axis into existence (e.g. "Shirts & Tops *requires* Color and Size variants"). That's wrong, for a concrete reason: `product_variants` is already optional for every product today — a seller can sell a single-SKU shirt with no variants at all — and silently reintroducing a hard requirement through the category config would be an undocumented behavior change, not a pure extension.

The fix is to split "required" into two independent concepts, matching how actual marketplaces handle this (checked against Shopify, Etsy, Amazon Seller Central, WooCommerce, Magento, and Shopee/Lazada — the latter two being this project's own stated UX inspiration per README):

| Layer | Who decides | Enforcement | Platform precedent |
|---|---|---|---|
| **Required spec** | Category config (admin), fixed per category | **Hard** — blocks publish if empty, no seller opt-out | Amazon's category-required attributes; Etsy's mandatory item specifics; Shopee/Lazada's asterisked category specification fields |
| **Variant-eligible** | Category config says it's *allowed*; the **seller checks a box per product** to actually use it | **Never hard** — a product can always ship with zero variants | WooCommerce's per-attribute "Used for variations" checkbox; Shopify's manually-added Options; Etsy's "turn on Variations, then pick which types"; Shopee/Lazada's "Add variation" toggle |
| **Recommended** (variant-eligible only) | Category config, soft flag | **Non-blocking** — a hint banner if the seller leaves it unchecked (e.g. "Shirts & Tops listings typically offer Color and Size options") | Closest to Shopify's newer category-metafield suggestions, which are skippable |

This is why `category_attributes` (§4) carries **three** independent booleans — `is_required`, `is_variant_eligible`, `is_recommended` — with `CHECK (not (is_required and is_variant_eligible))` enforcing that a variant axis can never also be hard-required, and `CHECK (not (is_recommended and not is_variant_eligible))` keeping "recommended" meaningless outside the variant-eligible case. The UI consequence (seller-facing checkboxes, not auto-revealed fields) is detailed in §8.2–8.3.

**No new column is needed to track "did the seller enable this axis for this product"** — that state is always derivable from whether the product currently has any variant row with that attribute populated (edit mode) or from in-progress form state (create mode). Treating "enabled" as derived rather than stored avoids a second source of truth that could drift from the actual variant rows.

---

## 4. Database Changes (migration plan)

All migrations are additive/nullable-first, per [CLAUDE.md → Migration Policy](../../CLAUDE.md#migration-policy) and [ARCHITECTURE.md → Architecture Evolution Strategy](../../ARCHITECTURE.md#architecture-evolution-strategy) guardrails ("every intermediate state keeps building"). None requires backfilling existing rows with non-null data — everything defaults to `NULL`/inapplicable, so **every existing product, variant, order, and order_item is untouched and keeps working exactly as today.**

### Migration 1 — `category_attributes` + category spec columns
- `create type public.product_attribute_key as enum ('color','size','material','dimensions');`
- `create table public.category_attributes (...)` per §3.2/§3.5:
  ```sql
  create table public.category_attributes (
    id uuid primary key default gen_random_uuid(),
    category_id uuid not null references public.categories (id) on delete cascade,
    attribute_key public.product_attribute_key not null,
    is_required boolean not null default false,          -- hard-required SPEC; never true alongside is_variant_eligible
    is_variant_eligible boolean not null default false,   -- offered as a seller opt-in checkbox in the Variant Manager
    is_recommended boolean not null default false,        -- soft nudge; only meaningful when is_variant_eligible
    allowed_values text[],                                 -- optional admin-curated picklist; null = free text
    display_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint category_attributes_unique unique (category_id, attribute_key),
    constraint category_attributes_required_not_variant check (not (is_required and is_variant_eligible)),
    constraint category_attributes_recommended_needs_variant check (not (is_recommended and not is_variant_eligible))
  );
  ```
- RLS: `select` to `anon, authenticated` (needed by the seller product form, buyer filters, and the quiz); `insert/update/delete` to `authenticated` gated by `is_admin()` — identical shape to the existing `categories` policies.
- Add `material text`, `dimensions text` to `products` (nullable, length-capped, e.g. `check (material is null or char_length(material) <= 160)`).

### Migration 2 — `product_variants` generalization
- Add `material text`, `dimensions text` (same length caps as `color`/`size`'s existing 60-char cap, or a slightly larger cap for `dimensions` free text — e.g. 80).
- Drop `product_variants_has_attribute`, re-add generalized version (§3.4).
- Drop `product_variants_unique_combo`, replace with the generalized index (§3.4).
- **No RLS change needed** — the existing `product_variants` policies already gate on `seller_id`/`shop_id`/`is_admin()`, not on which columns are populated.

### Migration 3 — `create_order` RPC update (F-8)
`CREATE OR REPLACE FUNCTION public.create_order` (same signature — no breaking change to the function's callers), updating only the `variant_label` composition in the insert phase:
```sql
v_variant_label := nullif(trim(concat_ws(' / ',
  v_variant.color,
  v_variant.size,
  coalesce(v_variant.material, v_product.material),
  coalesce(v_variant.dimensions, v_product.dimensions)
)), '');
```
`concat_ws` already skips `NULL` arguments, so a Shirts & Tops order line still renders as `"Red / M"` (material/dimensions blank → omitted) and a Decors line can render as `"30 × 20 × 5 cm"` alone. No change to stock-locking, pricing, or validation logic — confirmed those clauses don't reference `color`/`size` structurally (F-8's audit).

### Type regeneration
Regenerate `database.types.ts` per the Migration Policy after all three migrations land, and fix the pre-existing `product_variants.seller_id` drift (F-11) in the same pass since it's touched anyway.

---

## 5. Service Layer Changes (`src/lib/supabase/queries.ts`)

All changes are additive to existing functions' return shapes (new optional fields), not signature-breaking, per [CLAUDE.md → Definition of Breaking Change](../../CLAUDE.md#definition-of-breaking-change).

| Function | Change |
|---|---|
| `PRODUCT_VARIANT_COLUMNS` | Add `material, dimensions` to the literal column list. |
| `createProductVariant` / `updateProductVariant` | Accept `material?`, `dimensions?` in their input object; pass through to insert/update. |
| `getProductBySlug` | Select the new `products.material`/`dimensions` columns (already a literal column list — add two entries). |
| `toProduct` mapper | Map `material`, `dimensions` to the domain `Product` type. |
| `toCartLineItem` / `CartItemRowWithJoins` | Extend the variant join to also select `material, dimensions`; extend the variant-label composition to match `create_order`'s new logic (so a cart line and its eventual order line render identically — same `concat_ws` order). |
| `getVariantsPriceAndStock` | No change needed (price/stock only — F-7 confirmed this layer doesn't carry attribute display data). |
| **New:** `listCategoryAttributes(categoryId)` | Public read, RLS-backed, no extra filter needed (mirrors `listActiveCategories`'s plain-RLS pattern). |
| **New:** `createCategory` / `updateCategory` / `archiveCategory` (or `setCategoryActive`) | Admin-only writes — net-new, since F-1 confirmed none exist. `requireRole([admin])` at the action layer, RLS as the backstop underneath. |
| **New:** `upsertCategoryAttribute` / `deleteCategoryAttribute` | Admin-only writes for the config table. |
| `listGuidedSelectionMatches` | Rework per §6.4 below — the one real logic change, not just a column addition. |

---

## 6. Guided Selection Alignment (the request's explicit priority)

### 6.1 Problem recap (from F-9/F-10)
Today the quiz always asks the same three apparel-flavored questions (Occasion / Size from a fixed 7-value list / Budget) regardless of category — which is actively wrong for Decors (no apparel sizes, no "wedding/sportswear" occasion makes sense for a wall clock) — and the size-matching logic has a latent bug (F-10) comparing against the wrong column.

### 6.2 Category becomes the first axis
The quiz gains a **category selection step** (or, when launched from a category page in the future, is pre-scoped to that category — not required for this phase, just left open per `CategoryTile`'s existing link pattern). Once a category is known, every subsequent question is driven by that category's `category_attributes` rows:

- **Occasion** — only asked if the category is flagged apparel-like. Simplest implementation: add `categories.supports_occasion_matching boolean not null default false` (a category-level flag, separate from `category_attributes` since occasion is a recommendation-targeting concept, not a product spec) — seed `true` for Shirts & Tops / Bottoms / Outerwear, `false` for Decors.
- **Size / Color / Material / Dimensions** — one question per `category_attributes` row where `is_variant_eligible = true` **and** at least one real product/variant in that category actually has a non-null value for it (asking about an axis no seller ever enabled would be a dead-end question) — using `allowed_values` as the chip options, falling back to deriving distinct values from the category's actual variants if `allowed_values` is null (same `uniqueInOrder` pattern `ProductQuantityAndAddToCart` already uses, generalized).
- **Budget** — unchanged, always asked.

### 6.3 `recommendation_rules` simplification (fixes F-10, not scope creep)
Rather than adding `material`/`dimensions` text columns to `recommendation_rules` (which would triple the existing size-divergence bug), **drop the redundant `size` column** and resolve size/color/material/dimensions matching directly from the rule's linked data:
- If `recommendation_rules.variant_id` is set → match against that exact variant's resolved attributes (variant override `??` product default, §3.2's resolution rule).
- If `variant_id` is null (rule targets the whole product) → match if **any** of the product's variants satisfies the buyer's answers (or, if the product has no variants, against the product's own `material`/`dimensions` spec columns).

This is a one-column migration (`alter table recommendation_rules drop column size`) plus a rewrite of `listGuidedSelectionMatches`'s in-app filtering loop (same KISS in-memory-filter approach already justified in the existing code comment — the rule table stays small) to compare against resolved variant/product attributes instead of the rule's own stale copy. `occasion` and the `variant_id`-targeting mechanism are unchanged.

### 6.4 `RecommendationRuleManager` / `RecommendationRuleRow`
Drop the `size` dropdown (now implicit via `variant_id` selection). No other UI change needed — `variant_id` selection already exists and already disambiguates size/color today; it will also disambiguate material/dimensions once those columns exist on `product_variants`.

---

## 7. Catalog Filter Alignment (`ProductFilters`)

When exactly one category is selected (not "All"), fetch that category's `category_attributes` (server-side, alongside the existing `listActiveCategories` call on the catalog page) and render one filter control per row where `is_variant_eligible = true` **and** it's actually in use by at least one product (same "don't offer a dead-end filter" rule as §6.2), using `allowed_values` for the option list (or derived distinct values as a fallback). When no single category is selected, show only today's category-agnostic filters (price/shop/sort/on-sale) — attribute filters are ambiguous across categories, so omitting them rather than unioning every category's attributes is the correct, simpler default.

This requires: `ProductFilters` accepting a new optional `attributeFilters: CategoryAttribute[]` prop, new URL search params (e.g. `size`, `material`) wired through the existing debounced-URL-param pattern already used for `minPrice`/`maxPrice`, and `listProducts`'s query gaining the corresponding `.eq()`/variant-join filters — scoped carefully since a product can have multiple variants, so filtering by (e.g.) size must match if *any* variant of that product satisfies it, not the product row itself.

---

## 8. Seller / Admin UI Changes

### 8.1 New: Category Management (prerequisite, closes F-1)
A new `/admin/categories` page (admin-only, matching the `/admin/{users,shops}` precedent) — `CategoriesTable`/`CategoryForm` for name/slug/description/image/active/sort_order (the columns that already exist in the DB but have no UI), plus a nested `CategoryAttributesPanel` for configuring the `category_attributes` rows per category (attribute key, required, variant axis, allowed values). New feature files: `src/features/categories/{actions/category.actions.ts, schemas/category.schema.ts}` (currently empty per F-1).

### 8.2 `ProductForm` — spec fields, split by §3.5's two layers
Once a category is selected, fetch its `category_attributes` and render, for each row where `is_variant_eligible = false` (i.e. the spec-only attributes — never the variant-eligible ones, those live exclusively in the Variant Manager per §8.3):
- **`is_required = true`** → the field (e.g. Decors' **Dimensions**) is always visible, plain, marked required, no checkbox — Zod rejects an empty submit the same way any other required field does today.
- **`is_required = false`** → the field (e.g. Shirts & Tops' **Material**) renders behind an unchecked-by-default checkbox — *"Add material details"* — that reveals the text input inline only once checked. Unchecking simply clears the field's value before submit (nothing persisted, nothing to migrate).

No change to existing Title/Description/Price/Quantity/Condition/Status/Featured/Location fields.

### 8.3 `ProductVariantManager` / `ProductVariantRow` — the seller opt-in layer for variant axes
This is where §3.5's "variant-eligible ≠ auto-applied" rule actually lives in the UI. At the top of the Variant Manager, render one checkbox per `category_attributes` row where `is_variant_eligible = true` for the product's category — e.g. *"☐ This item comes in multiple colors," "☐ This item comes in multiple sizes."* All start **unchecked** on a new product, matching WooCommerce's per-attribute "Used for variations" checkbox and Shopee/Lazada's "Add variation" toggle (see §3.5's precedent table) — never pre-checked from the category alone.

- Checking a box reveals that attribute's column in the variant grid below, so the seller can start adding Color/Size/Material/Dimensions values for actual variant rows.
- If `is_recommended = true` for an unchecked box, show a quiet inline hint, not a blocking error — e.g. "Shirts & Tops listings typically offer Color and Size options." The seller can ignore it and save a single-SKU product with zero variants, exactly as is possible today.
- **Unchecking** a box is only allowed if no existing variant row still has that attribute populated — if it does, block the uncheck with an explicit message ("Remove the Material-based variants first") rather than silently orphaning data, mirroring the existing "can't delete an ordered variant" FK-restrict precedent.
- **On edit**, checkbox state is *derived*, not read from a stored flag: a box starts checked if any of the product's current variant rows has that column non-null (per §3.5 — no new column is needed to remember "enabled").

The actual **Material**/**Dimensions** *input fields* on each variant row behave exactly like the existing Color/Size/SKU/Price-override fields once their checkbox is on — same optional-override semantics as §3.2.

### 8.4 Schemas
`productSchema` gains optional `material`/`dimensions` fields (mirroring the new `products` columns), with Zod enforcing the category's `is_required` spec list server-side (the checkbox is a client-side convenience, not a trust boundary — per [CLAUDE.md → Security Standards](../../CLAUDE.md#security-standards), "never trust the client," the action re-validates required specs against `category_attributes` regardless of what the form happened to show). `productVariantSchema` gains optional `material`/`dimensions` fields; the existing `.refine(color || size required)` becomes `.refine(color || size || material || dimensions required)`. No Zod field represents "is this axis enabled" — that's UI-only state, per §3.5.

---

## 9. Buyer-Facing UI Changes

### 9.1 Product Detail Page
- **Specifications panel** (new): renders `effective_material`/`effective_dimensions` (§3.2's resolution rule) alongside the existing `condition`/`location` block — always shown when a value resolves, regardless of category, same as today's `condition` display.
- **`ProductQuantityAndAddToCart`**: generalize the two-axis (`colors`/`sizes`) derivation into an N-axis loop over whichever of `color/size/material/dimensions` actually vary across the product's variants (a category might only use one or two of the four) — this is the one meaningfully new piece of UI logic (currently hardcoded to exactly two `useState` pill groups; becomes a small loop over an array of active attribute keys). `variantInfo` passed to `AddToCartButton`/`BuyNowButton` is unchanged in shape (`{id, label, priceCents, stock}`) — only the resolution of `selectedVariant` and the composed `label` generalize.

### 9.2 Cart / Checkout
No change required beyond §5's `toCartLineItem` label-composition update (F-7) — the cart line identity, checkout grouping, and `create_order` payload are already attribute-agnostic.

### 9.3 Order history / detail
No schema change beyond §4 Migration 3 — `order_items.variant_label` already carries whatever `create_order` composes; existing `OrderItemsList`/`OrderSummary` components that render `variant_label` as opaque text need no change.

---

## 10. Files Affected (comprehensive)

**New files:**
- `supabase/migrations/<ts>_category_attributes.sql`
- `supabase/migrations/<ts>_product_variants_material_dimensions.sql`
- `supabase/migrations/<ts>_create_order_generalized_variant_label.sql`
- `supabase/migrations/<ts>_recommendation_rules_drop_size.sql`
- `src/features/categories/actions/category.actions.ts`
- `src/features/categories/schemas/category.schema.ts`
- `src/features/categories/components/{CategoriesTable,CategoryForm,CategoryAttributesPanel}.tsx`
- `src/app/admin/categories/page.tsx`

**Modified files (schema/types):**
- `src/lib/supabase/database.types.ts` (regenerated + F-11 fix)
- `src/features/products/schemas/{product.schema.ts,product-variant.schema.ts}`
- `src/features/categories/types/category.types.ts`
- `src/features/assistant/schemas/rule.schema.ts`

**Modified files (service layer):**
- `src/lib/supabase/queries.ts` — product/variant column lists + mappers, new category/category-attribute functions, `listGuidedSelectionMatches` rework, `toCartLineItem` label composition.

**Modified files (actions):**
- `src/features/products/actions/{product.actions.ts,product-variant.actions.ts}`
- `src/features/assistant/actions/rule.actions.ts`

**Modified files (UI):**
- `src/features/products/components/{ProductForm,ProductVariantManager,ProductVariantRow,ProductQuantityAndAddToCart,ProductFilters}.tsx`
- `src/app/(shop)/products/[slug]/page.tsx` (pass new spec fields down)
- `src/app/(shop)/products/page.tsx` (fetch + pass `category_attributes` to `ProductFilters`)
- `src/features/assistant/components/{GuidedSelectorQuiz,RecommendationRuleManager,RecommendationRuleRow}.tsx`
- `src/lib/supabase/queries.ts`'s cart section (display only — see above)

**Unaffected (explicitly verified, listed to show what was checked and ruled out):**
- `src/features/cart/**` (F-7)
- `src/features/checkout/**` beyond nothing (F-7)
- `inventory`/`stock_adjustments` schema and RLS (F-12)
- Payments, Xendit, order lifecycle/status, RBAC/RLS helper functions (`is_admin`, `is_shop_member`, `current_user_role`)

---

## 11. Implementation Phases

Backend/data-first, each phase lint/typecheck/build-green before the next, per [CLAUDE.md → AI Development Workflow](../../CLAUDE.md#ai-development-workflow) and the existing roadmap's cadence.

1. **Schema foundation** — Migrations 1–2 (§4), regenerate types, fix F-11 drift.
2. **Category Management UI** — closes F-1; needed before anyone can configure `category_attributes` through the app rather than SQL. Seed the four named categories' `category_attributes` rows (per §3.3, adjustable) through this new UI once built, as the first real usage/validation of the feature — not as a migration-embedded seed (categories themselves aren't seeded by migration either, per F-2's finding; stay consistent).
3. **Seller product/variant forms** — §8.2–8.4, including the generalized Zod refine rule.
4. **`create_order` + cart/order display** — Migration 3, §5's `toCartLineItem` update, §9.3 (verify order history renders new labels correctly for both old and new orders — old orders must keep rendering their frozen `variant_label` text unchanged).
5. **Buyer PDP** — §9.1, generalizing `ProductQuantityAndAddToCart`.
6. **Catalog filters** — §7.
7. **Guided Selection** — §6, including the `recommendation_rules.size` column drop and `listGuidedSelectionMatches` rework (F-10 fix). Last, since it depends on `category_attributes` (phase 1) and the variant resolution helper (phase 1/3) already existing.

---

## 12. Testing Strategy

Per [CLAUDE.md → Testing Expectations](../../CLAUDE.md#testing-expectations) — no test runner exists; verification is lint + typecheck + build, plus exercising real flows.

- **Regression (must not break):** place an order for an existing color/size-only product end-to-end (cart → checkout → COD and Xendit paths); confirm `variant_label` still renders `"Red / M"` shaped text; confirm existing Guided Selection rules with an `occasion` but no `variant_id` still match correctly after the `size` column drop (re-verify any rule that relied on the dropped column is migrated or re-authored, not silently broken — audit live `recommendation_rules` rows for non-null `size` before dropping the column).
- **New — category config:** create a category, define `category_attributes` rows, confirm RLS blocks non-admin writes.
- **New — Decors-shaped product:** create a product with only `dimensions` set (no color/size on any variant), confirm it passes the generalized CHECK constraint, adds to cart, checks out, and appears correctly in an order.
- **New — duplicate-variant fix (F-13):** attempt to insert two variants with identical `color` and `NULL` `size` for the same product; confirm the new constraint now rejects it (previously would have silently succeeded).
- **New — Guided Selection, category-scoped:** verify the quiz does not ask "Occasion" for a Decors-scoped flow, and does ask a Dimensions/Material question where configured; verify budget/variant matching still resolves live prices correctly.
- Run `npm run lint`, `npm run typecheck`, and `npm run build` after each phase per CLAUDE.md, and manually exercise: seller product+variant creation across at least two categories, buyer PDP variant selection, cart, checkout (COD), and the Guided Selection quiz for both an apparel and a Decors category.

---

## 13. Risks, Open Questions, and Explicit Non-Goals

- **Resolved during review:** whether a category could ever hard-require a *variant axis* (not just a spec). Settled as **no** — §3.5 makes variant-axis enablement an always-optional, per-product seller checkbox (`is_variant_eligible`), with only a soft `is_recommended` nudge, never a hard block; hard requirement (`is_required`) applies exclusively to spec fields. This matches how Shopify/Etsy/WooCommerce/Shopee/Lazada all separate the two concerns (precedent table in §3.5) and avoids silently changing `product_variants`' existing "always optional" behavior.
- **Open question (needs your decision before Phase 2):** the exact `category_attributes` seed values in §3.3 are a recommendation, not a spec — please confirm or adjust before any category is configured, especially for Decors where "required dimensions, optional variant size" is a judgment call.
- **Open question:** should `categories.supports_occasion_matching` (§6.2) be a simple boolean flag, or should "which questions does Guided Selection ask" eventually become its own config row per category alongside `category_attributes`? Proposed as the simpler flag for now; flag if you'd rather generalize further immediately.
- **Risk:** dropping `recommendation_rules.size` (§6.3) is a schema change to a column that may hold live data — Phase 7 must audit existing rows first (see §12) rather than assuming it's empty.
- **Explicit non-goals (future enhancements, not this plan):** structured numeric dimensions (separate `width_cm`/`height_cm`/`depth_cm`/`weight_grams` columns for sortable/filterable physical size) — free-text `dimensions` is the MVP; variant-specific images (already a known, documented gap per MODULES.md's Products section, unrelated to this plan); a fully generic attribute system for categories beyond the four named ones — if a fifth category needs an attribute outside `{color,size,material,dimensions}`, that's a deliberate future migration adding a new enum value, not a reason to switch to EAV now.

---

## 14. Summary

The plan generalizes RoberJ's existing, working two-attribute variant system to four attributes (adding `material`, `dimensions`) using the same explicit-column, override-inherits-from-parent pattern already proven by `price_cents`, gated per-category by a new lightweight `category_attributes` config table rather than a generic EAV store — consistent with the codebase's stated architectural preferences. Requiredness is deliberately split into two independent layers (§3.5): a category can hard-require a *spec* field, but a *variant axis* is always an explicit, per-product seller checkbox — never auto-applied — matching how Shopify, Etsy, WooCommerce, and Shopee/Lazada all actually separate these two concerns. It also closes a real gap (no category management UI exists at all today, F-1) and fixes two latent bugs found during the audit (F-10's rule/variant size divergence, F-13's duplicate-variant uniqueness hole) as low-risk side effects of touching the same constraints anyway. Cart, checkout, inventory, payments, and order lifecycle need no structural change — confirmed attribute-agnostic by direct code reading. Guided Selection and the catalog filters both become category-aware by reading the same new config table, rather than each maintaining their own hardcoded, apparel-only vocabulary.

**Waiting for your approval before writing any code or migrations.** Please confirm:
1. The §3.3 per-category attribute recommendations (or provide corrections/the reference image).
2. The `category_attributes`/`products`/`product_variants` schema shape in §3–4, including the `is_required`/`is_variant_eligible`/`is_recommended` split in §3.5.
3. The seller-facing checkbox UX in §8.2–8.3 (opt-in per product, derived state on edit, blocked uncheck when variants exist).
4. The `recommendation_rules.size` column drop in §6.3 (a real schema change, flagged as needing a live-data audit first).
5. The phase order in §11, or whether Category Management (closing F-1) should be split into its own, separately-approved piece of work before the rest proceeds.
