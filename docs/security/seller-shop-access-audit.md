# Seller Shop Access Security Audit

**Reviewed:** 2026-10-22
**Scope:** seller/shop membership, seller and admin role checks, RLS and column grants, privileged database functions, seller-facing server actions/pages, object-storage policies, and direct Supabase Data API access. The live Supabase project was inspected read-only; no production data or policies were changed.

## Executive summary

### Corrected scope and implementation update

The access boundary under review is **shop-to-shop isolation**. A shop can have multiple assigned sellers; each active member should manage the data assigned to that shop. The concern is whether Shop A personnel can read or change Shop B's private products, variants, inventory, orders, customer details, media, or related records through the app or direct Supabase APIs.

The original audit's membership-chain framing was not the relevant risk. Direct membership is not recursive. The concrete risk was that many policies and privileged RPCs treated `seller_id = auth.uid()` as an alternative authorization path even when `shop_id` pointed to another shop. A stale seller attribution after a transfer, or an editable attribution field, could therefore bypass the shop boundary. The same pattern could expose buyer profiles through seller-attributed orders.

The local implementation now makes active direct shop membership authoritative for rows with a `shop_id`; `seller_id` is a fallback for a NULL-shop legacy row only while the seller has no current shop assignment. It hardens table/storage policies, stock and order RPC guards, report RPC active-state checks, seller attribution grants, app query filters, and catalog transfer cascades. Multi-seller CRUD within one shop remains supported. A pgTAP regression file covers direct cross-shop access, transfers, seller reassignment/deactivation, storage and RPC paths. **These changes are local only: no migration has been applied to the live Supabase project.** The findings below describe the pre-fix risks; the implementation status is local and still requires database migration rollout.

The shop membership check itself does **not** inherit permissions transitively. `is_shop_member(shop_id)` checks for a membership row matching both the current `auth.uid()` and that exact shop. It does not inspect other members or follow seller-to-seller links. The live `shop_users` table also has a unique constraint on `user_id`, so one account cannot be a direct member of multiple shops at once. Membership creation and removal are RLS restricted to admins, and the admin assignment RPC checks the database-backed admin role.

That does not make all seller isolation complete. Two separate authorization weaknesses can grant or preserve access across the intended shop boundary:

1. `seller_id` is used as an authorization alternative to `shop_id`, but authenticated clients can update `seller_id` on products and variants. A shop member can therefore attach another seller's identity to rows in the member's shop; that identity then satisfies the `seller_id = auth.uid()` branch in RLS and application queries.
2. Shop reassignment and account demotion/deactivation do not consistently invalidate the old `seller_id` authorization path. Deactivation also leaves the membership row in place, while the RLS membership helper does not check the profile's active state or seller role.

The chained-membership example is blocked by the direct membership lookup, but the two findings above can produce similar cross-shop access without a membership chain.

## Findings

### Medium — Mutable `seller_id` can grant another account access to a shop's product rows

**Evidence:** The live `products` UPDATE policy accepts `seller_id = auth.uid() OR is_shop_member(shop_id) OR is_admin()` in both `USING` and `WITH CHECK`. The live `product_variants` policy uses the same seller-or-shop-member pattern and checks that the variant's seller matches its parent product. Authenticated has column-level UPDATE rights to `products.seller_id` even though it has no table-wide UPDATE grant; authenticated also has table UPDATE rights on `product_variants`, including `seller_id`. The live product triggers protect changes to `shop_id`, but none of the product/variant triggers protect `seller_id`.

**Impact/root cause:** A member of Shop B can send a direct Data API update for a Shop B product and set `seller_id` to Seller A. The old-row check passes because the caller is a Shop B member; the new-row check still passes for the same reason. Seller A can then pass the `seller_id = auth.uid()` branch for that product even without Shop B membership. Variants and recommendation rules use similar ownership columns and should be treated as part of the same boundary. This is not transitive membership, but it is a direct cross-seller authorization grant through mutable row data.

**Status:** Addressed locally by `20261022010000_shop_to_shop_access_isolation.sql` and shop-only owner filters in `src/lib/supabase/queries.ts`. Authenticated seller attribution updates are revoked; shop-assigned rows use direct membership; NULL-shop legacy seller access stops once an admin assigns that seller to a shop. The database migration has not been applied to production.

### High — Deactivated or demoted sellers can retain direct Data API access

**Evidence:** `admin_set_user_active` only updates `profiles.is_active`; it does not revoke sessions or remove membership. `is_shop_member` only checks `shop_users` and `auth.uid()`, not `profiles.is_active` or `profiles.role`. The seller app's `requireSessionUser` checks active state, but direct Supabase requests do not pass through that Next.js guard. `admin_demote_seller_to_buyer` removes the `shop_users` row, but policies on seller-owned products, variants, and related rows still contain direct `seller_id = auth.uid()` alternatives that do not require the caller's role to remain `seller`.

**Impact/root cause:** A seller whose account is deactivated can keep using an unexpired access token against RLS-protected tables while their membership remains. A demoted seller can continue to read or mutate some records through direct seller-ID branches, even though the app routes reject them. Application guards are not a substitute for database authorization.

**Status:** Addressed locally for seller/shop management through `is_active_seller()`, active-shop-aware `is_shop_member()`, and `can_manage_shop_resource()`. The database checks the current profile state on each request, so an old JWT does not preserve seller management access. Buyer access to their own orders remains separate. The database migration has not been applied to production.

### Medium — Shop transfer leaves the original seller as an authorization principal

**Evidence:** The admin-only `admin_transfer_product_shop` RPC changes `products.shop_id` and cascades the new `shop_id` to variants, but it intentionally preserves `seller_id`. Current RLS and application owner filters allow either `seller_id = caller` or `shop_id = caller's shop`. Thus the original seller still matches the seller-ID branch after transfer, even after their membership changes.

**Impact/root cause:** If transfer is meant to move the product's management boundary, the source seller can retain read/write/delete access to that transferred product and related rows. The data model uses `seller_id` both as historical attribution and as current authorization, so changing shop assignment alone does not revoke the old access.

**Status:** Addressed locally. The updated transfer RPC moves products, variants, and recommendation rules to the destination shop; inventory follows its existing sync trigger. Non-null shop rows no longer grant access through the old seller ID. Historical order, payment, return, and stock-adjustment attribution remains preserved and follows its own policy. The database migration has not been applied to production.

### Low — Seller order list previously mixed buyer-owned orders into seller operations

**Evidence:** The orders SELECT RLS policy correctly allows a buyer to read their own orders as well as a seller/shop member to read fulfillment orders. The seller dashboard's original generic list relied on that broad RLS result, so a seller who had bought from other shops could see those buyer orders in the seller table and select them for seller actions. The label page had a stricter owner scope, which is why it skipped those rows.

**Status:** The current local checkout passes seller/shop owner scope to dashboard lists and exports. This is separate from shop isolation; buyers retain access to their own orders. It has not been verified as deployed.

### Informational — Public membership resolver exposes a narrow seller-to-shop mapping

`resolve_shop_membership` is a `SECURITY DEFINER` function executable by `anon` and `authenticated`; callers can provide arbitrary seller/shop ID arrays, and the function returns active shop membership pairs and shop names. The migration intentionally introduced it for public product-card/shop attribution while keeping `shop_users` itself private. It does not grant access to the returned shops' private rows and does not provide a transitive membership check. Confirm that public seller-to-shop association is intended; if it is not, replace it with a public-safe listing projection and constrain it to sellers with active public listings.

## Access controls reviewed

- **Membership graph:** `is_shop_member` is a direct `shop_users` existence check. There is no recursive CTE, join through other sellers, or inherited-membership traversal. Live constraint `shop_users_unique_user` enforces at most one shop membership per user.
- **Membership writes:** `shop_users` insert/delete policies require `is_admin()`. The app has no seller invite/join endpoint. Assignment and demotion RPCs check `auth.uid()` and database-backed `is_admin()`; assignment is serialized and the unique-user constraint prevents two-shop assignment.
- **Role hierarchy:** role comes from `profiles.role`, not user-editable JWT metadata. Profile role self-escalation is blocked by profile RLS/column grants and the role-change trigger. Admin role changes use protected RPCs.
- **Admin/shop/product transfer endpoints:** admin shop assignment and product transfer RPCs re-check `is_admin()` in SQL. Product and variant `shop_id` changes are guarded by a trigger-controlled transaction flag; sellers cannot move rows to an arbitrary shop by changing `shop_id` directly. The new transfer definition also moves recommendation rules with the product.
- **Seller actions:** server actions generally call `requireRole` and derive seller/shop identity from the authenticated profile/membership rather than trusting submitted owner IDs. Reports RPCs derive the caller's shop from `shop_users` for seller callers and apply a requested shop filter only for admins. Continue treating RLS and column grants as the final boundary because clients can bypass these actions and call the Data API directly.
- **Storage:** local policy replacements require shop-aware authorization for product and shop image writes, and for payment receipts tied to orders. Public product and shop image reads remain intentional marketplace surfaces.
- **Security Advisor:** the live advisor reports 13 `SECURITY DEFINER` functions callable by `anon` and 44 callable by `authenticated`. This is not by itself proof of a bypass: admin functions inspected check `is_admin()` internally, report functions derive a seller's shop server-side, and helper functions are designed for policy use. `resolve_shop_membership` is the notable intentionally public narrow read. Each new definer function should continue to have a fixed empty `search_path`, explicit identity/role checks where appropriate, and least-privilege EXECUTE grants.

**Primary source files reviewed:** `supabase/migrations/20260813000000_shops_and_shop_users.sql` (membership helper/RLS), `20260816000000_admin_user_shop_management.sql` and `20260927140310_admin_assign_seller_shop_reassign_products.sql` (admin assignment), `20260930010000_admin_demote_seller_to_buyer.sql`, `20261013065349_admin_transfer_product_shop.sql`, `20260927134618_shop_member_order_rls_widening.sql`, `20260912010000_product_variants.sql`, `20260914000000_recommendation_rules.sql`, `20260821020000_resolve_shop_membership_rpc.sql`, `20261022010000_shop_to_shop_access_isolation.sql`, `src/lib/supabase/queries.ts`, and the seller product, variant, shop, inventory, order, report, and return server-action modules. Live policy expressions, constraints, column privileges, trigger definitions, selected function bodies, and Supabase Security Advisor findings were checked against project `RobertJShop`.

## Regression test plan

Implemented as two local-only suites with disposable sellers, shops, a buyer, and an admin. `supabase/tests/shop_to_shop_access_isolation.test.sql` contains 46 pgTAP assertions for grants, RLS, storage policies, and protected RPCs; `scripts/test-shop-access-postgrest.mjs` exercises the REST and Storage HTTP APIs with separate signed seller tokens, including reads, updates, cross-shop inserts/uploads, admin reassignment, and deactivation. Both `npx supabase test db` (46 assertions) and `npm run test:security:api` (9 API scenarios) passed. No mutation tests were run against production.

| Scenario | Expected result |
| --- | --- |
| Seller A is a member of Shop B; Seller B is a member of Shop C; A selects C's products/orders/inventory/returns/storage by known IDs | No rows; update/delete affect zero rows; insert/update into C fails RLS |
| A is a member of B and B also has a separate membership in C | A's `is_shop_member(C)` remains false; membership is not inherited |
| Seller attempts `INSERT`, `UPDATE`, or `DELETE` on `shop_users` to add/remove itself or another seller | RLS denial; admin path succeeds and uniqueness permits one user membership only |
| Shop B member changes a product/variant/recommendation rule's `seller_id` to A through PostgREST | Permission denied after column-grant fix; related image/storage access remains unavailable to A |
| Admin transfers a product from B to C | B members lose current-row management access; C members gain it; old seller ID does not restore B or source-seller access |
| Admin reassigns a seller, demotes them, or deactivates them while an old access token is still valid | Previous shop and seller-owned mutation paths are denied immediately by RLS; buyer paths follow the explicitly chosen account-state rule |
| Seller invokes report, inventory, order, return, and product server actions with another shop's IDs | Generic not-found/denied result; no foreign data or mutation |
| Seller invokes relevant `SECURITY DEFINER` RPCs directly with foreign seller/shop/order IDs | Denied or scoped to the caller's shop; caller-supplied shop IDs cannot widen scope |
| Seller accesses another shop's product images, shop images, shipment, payment, order item, or return by guessed object/row ID | Denied unless the user is a legitimate participant/member under that object's explicit policy |
| Buyer/guest reads active public listings and public seller/shop presentation | Continues to work; public membership resolver reveals only the approved public association fields |

These suites test database-level grants, RLS, storage policies, and `SECURITY DEFINER` RPC guards without using production data. Next.js server-action integration tests remain a follow-up; these API tests do not exercise the application server-action layer.

## Remaining rollout steps

1. Apply the reviewed migration through the normal deployment process; this audit task did not modify production.
2. Decide whether anonymous seller-to-shop mapping is an accepted public surface; it does not grant private shop-row access.
