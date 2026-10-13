-- =============================================================================
-- Shop-seller access, Feature 1 follow-up: `CREATE OR REPLACE FUNCTION` in
-- 20261013063353_decouple_seller_shop_membership_from_products.sql updated
-- the function body but not its catalog `COMMENT` (comments are separate
-- pg_description objects, not replaced by CREATE OR REPLACE) — leaving a
-- stale, now-incorrect comment live claiming the function still reassigns
-- products.seller_id. This migration only corrects that comment; no
-- behavior change.
-- =============================================================================

begin;

comment on function public.admin_assign_seller_shop is
  'Sole write path for promoting a buyer to seller and/or (re)assigning their shop_users membership. Deliberately does NOT touch products — product-to-shop catalog assignment is a separate, explicit action (admin_transfer_product_shop). Never leaves a seller without a shop.';

commit;
