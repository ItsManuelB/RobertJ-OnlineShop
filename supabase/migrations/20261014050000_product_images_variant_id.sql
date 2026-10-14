-- =============================================================================
-- Product Images — optional variant tag (variant-specific photos).
--
-- Until now every product photo was shared across all of a product's
-- variants: selecting "Blue" on the PDP changed price/stock text but never the
-- picture (the "variant-specific images" gap documented in MODULES.md →
-- Products → Future Work).
--
-- Adds a nullable `variant_id` to `product_images`. NULL = today's exact
-- behavior (the photo is shared and shown regardless of which variant is
-- selected), so every existing row — and every product that never tags a
-- photo — is completely unaffected. A seller may optionally tag a photo to one
-- variant; the PDP then filters its gallery by the selected color (falling
-- back to the full gallery when nothing is tagged for that color).
--
-- ON DELETE SET NULL: deleting a variant must never delete a photo, only
-- untag it (it reverts to a shared photo). Same-product integrity (the
-- tagged variant must belong to the image's own product) is enforced in the
-- service layer (`setProductImageVariant`), not here — a cross-table rule a
-- CHECK constraint can't express, and the existing update RLS policy already
-- limits who may tag to the product's own seller/shop members/admin.
--
-- No policy changes: the existing "sellers update images for their products"
-- policy already covers writing this column.
--
-- LIVE-DATA CHECK (run BEFORE applying; both must return 0 rows/errors — the
-- migration only adds a nullable column, so no existing row can violate it):
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'product_images'
--     and column_name = 'variant_id';          -- expect: no rows
--
-- DEPLOY ORDER: apply this migration BEFORE deploying the app code that
-- selects `product_images.variant_id`, otherwise every product query errors
-- on the unknown column.
--
-- ROLLBACK:
--   drop index public.product_images_variant_id_idx;
--   alter table public.product_images drop column variant_id;
-- =============================================================================

begin;

alter table public.product_images
  add column variant_id uuid references public.product_variants (id) on delete set null;

comment on column public.product_images.variant_id is
  'Optional: ties this photo to one product variant. NULL = shared photo shown for every variant (the pre-existing behavior). Deleting the variant sets this back to NULL.';

create index product_images_variant_id_idx
  on public.product_images (variant_id)
  where variant_id is not null;

commit;
