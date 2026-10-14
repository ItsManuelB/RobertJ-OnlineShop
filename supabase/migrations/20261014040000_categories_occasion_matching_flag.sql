-- =============================================================================
-- Categories — occasion-matching flag (Phase 7 of the Specifications &
-- Variants plan, docs/plans/product-specifications-and-variants-
-- implementation.md §6.2).
--
-- Lets the Guided Selection quiz skip the Occasion question for categories
-- where it doesn't make sense (Decors — "wedding/sportswear/party" has no
-- meaning for a wall clock), without touching the recommendation_occasion
-- enum or any existing rule.
--
-- Defaults to true so every existing category (and any future one with no
-- explicit opt-out) keeps today's exact behavior — the quiz always asked
-- Occasion before this migration, so "ask by default" is the non-breaking
-- choice. Decors is flipped to false right after.
--
-- ROLLBACK:
--   alter table public.categories drop column supports_occasion_matching;
-- =============================================================================

begin;

alter table public.categories
  add column supports_occasion_matching boolean not null default true;

comment on column public.categories.supports_occasion_matching is
  'Whether the Guided Selection quiz asks the Occasion question for products in this category. Default true preserves pre-Phase-7 behavior; set false for categories (e.g. Decors) where occasion has no meaning.';

update public.categories
set supports_occasion_matching = false
where slug = 'decors';

commit;
