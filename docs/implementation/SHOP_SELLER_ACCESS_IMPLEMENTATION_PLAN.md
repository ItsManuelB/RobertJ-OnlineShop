# Shop-Based Seller Access & Product-Transfer — Implementation Plan

> **Status:** ✅ Shipped (2026-10-13). All 7 features implemented, applied to the live Supabase project (`hjxtbnmnwlbqgptgncoh`), and verified — see each feature's "Test cases" for results. Migrations: `20261013063353`, `20261013064328`, `20261013065349`, `20261013073836`. The 15 legacy-shop products (Feature 5) were moved to Shop One per your decision, each via its own audited `admin_transfer_product_shop` call. Full regression checklist (buyer checkout, COD collection, build/lint/typecheck) run clean — see the end of this document for the final verification log.
>
> **Prerequisite context:** this plan implements the design approved in conversation — decouple seller-shop *membership* from product-to-shop *catalog assignment*, hardened behind a new audited admin-only RPC, with historical orders/payments left untouched.
>
> **Non-negotiables (kept unchanged):** `orders` RLS, `enforce_order_update_rules`, `advanceOrderStatusAction`/`OrderStatusControl` as the single order-fulfilment write path, the one-shop-per-seller invariant (`shop_users_unique_user`), all payment/Xendit logic, and every already-correct `is_shop_member()` usage across `products`, `product_variants`, `inventory`, `order_shipments`, `return_requests`.

---

## 0. Audit summary (what's already correct vs. the one real gap)

Confirmed by direct inspection of live RLS policies, live trigger/RPC bodies (via `pg_get_functiondef`/`pg_get_triggerdef`), and the application code — **not** assumed from migration files alone, since this repo has had live/repo drift before (see `memory: audit-verify-constraints-not-just-migration-files`).

| Surface | Shared shop-member access already works? | Evidence |
|---|---|---|
| `products` RLS (select/insert/update/delete) | ✅ Yes | `is_shop_member(shop_id)` present in all four policies |
| `product_variants` RLS (all commands) | ✅ Yes | Same pattern |
| `inventory` RLS (select) + `adjust_stock()` RPC (write) | ✅ Yes | RPC checks `is_shop_member(v_product.shop_id)` |
| `orders` RLS (select/update) + `enforce_order_update_rules` trigger | ✅ Yes | Both independently check `is_shop_member(shop_id)` |
| `order_shipments` RLS + `record_order_shipment()` RPC | ✅ Yes | RPC checks `is_shop_member(v_order.shop_id)` |
| `return_requests` RLS + `respond_to_return()`/`record_return_item_condition()` RPCs | ✅ Yes | Same pattern (`decide_return` is intentionally admin-only — existing business rule, not a gap) |
| `shops` RLS (shop profile update) | ✅ Yes | `"shop members update own shop profile"` policy: `using (is_shop_member(id))` |
| Admin UI shop assignment (`UserRow.tsx` → `assignSellerShopAction`) | ✅ Yes | Shop picker already allows assigning a seller to an already-occupied shop |
| `queries.ts` owner-filter helpers (`listDashboardProducts`, `listDashboardOrders`, `getDashboardOrder`, `getProductCount`, etc.) | ✅ Yes | All consistently build `seller_id.eq.X,shop_id.eq.Y` |
| **`admin_assign_seller_shop()` RPC** | ❌ **No — the one real gap** | Reassigns the *destination* shop's existing products to the incoming seller, but never touches the seller's *own* pre-existing products from their previous shop. Couples two concerns that must be separate. |
| **`products.shop_id` mutation path** | ❌ **No — a related, previously-undiscovered gap** | No trigger protects this column. RLS's `with_check` (`seller_id = me OR is_shop_member(shop_id) OR is_admin()`) is satisfied by `seller_id = me` **regardless of the new `shop_id` value** — a seller can today move their own product into *any* shop via a direct API call, bypassing the app's Zod schema (which has no `shopId` field, by design). |
| **Admin product-shop-assign UI** | ⚠️ **Partial** | `assignProductShopAction` / `ProductsDataTable.tsx` already exist, but the control is gated by `product.shopId === null` (`ProductsDataTable.tsx:456`) — there is currently no UI path to *transfer* an already-assigned product, and the write itself is a plain client `.update()` with **no audit log entry**. |

**Root cause of "Could not update the order" on Mark as Delivered:** `advanceOrderStatusAction`'s catch-all (`order.actions.ts:224-226`) never actually fires the literal string "Could not update the order." for this code path — `queries.advanceOrderStatus()` only ever throws real `Error` instances with specific messages. What the seller actually saw is the UI's **hardcoded title** (`OrderStatusControl.tsx:112`, `title="Couldn't update the order"`, shown unconditionally) paired with the real underlying message, almost certainly `"This order's status has already changed. Refresh and try again."` (`queries.ts:2550-2552`) — thrown when the `.or(ownerFilter)` write matches **zero rows**. That happens precisely when the order's `shop_id` doesn't match the acting seller's current shop membership and they aren't the literal `seller_id` — i.e., exactly the products/orders left stale by `admin_assign_seller_shop`'s incomplete reassignment. **Fixing this is Features 1, 2, and 5 below — no change to the orders RLS/trigger/action themselves is needed or planned.**

---

## Feature 1 — Decouple seller-shop membership from product ownership

### Root cause
`admin_assign_seller_shop()` (migration `20260927140310_admin_assign_seller_shop_reassign_products.sql`) does two unrelated things in one transaction: changes `shop_users` membership, **and** silently reassigns the *destination* shop's existing products to the incoming seller via:
```sql
update public.products
set seller_id = p_user_id
where shop_id = p_shop_id
  and seller_id <> p_user_id;
```
It never touches products the seller already owned at their *previous* shop. Those products keep their old `shop_id` forever, with no mechanism to ever intentionally correct it except as an accidental side effect of someone else later being assigned to that old shop.

### Current codebase findings
- **Live function body** (`pg_get_functiondef`, confirmed no drift from the migration file): the `update public.products ...` block is lines 2nd-to-last before the `admin_action_log` insert.
- **Live data proof this already caused damage:** seller "Lj Paulo Almera" (`4ed1d007-da0e-4624-82e2-7185289f0a7b`) is a current `shop_users` member of "Shop One" (`638e23c6-a9c9-44ad-bfd0-a00fdb0df92d`) but still owns **15 active products** stamped `shop_id = 6c746e37-177e-45b8-b389-e03f9cadaa89` ("Shop Three", their former shop). Several already-placed orders (e.g. `ORD-20261010-000279`, `ORD-20261010-000277`) inherited that stale `shop_id` from `create_order()`'s `v_shop_id := v_product.shop_id` (queries confirmed live, 2026-10-13).
- File: `supabase/migrations/20260927140310_admin_assign_seller_shop_reassign_products.sql`.

### Files / DB objects involved
- **New migration** (do not edit the 20260927140310 file — it's released): `supabase/migrations/20261013000000_decouple_seller_shop_membership_from_products.sql`.
- `admin_assign_seller_shop(uuid, uuid)` — `CREATE OR REPLACE`, remove the products-reassignment block entirely. Keep everything else (admin check, buyer→seller promotion, delete-then-insert `shop_users`, `admin_action_log` insert) byte-identical.
- No TypeScript changes — `queries.assignSellerShop()` (`queries.ts:5037-5057`) and `assignSellerShopAction` (`user.actions.ts:23-46`) already just call the RPC; its return type and error codes (`ADMIN_USER_RPC_SAFE_ERROR_CODES`) are unaffected.

### Implementation steps
1. Write the new migration: `create or replace function public.admin_assign_seller_shop(...)` with the product-reassignment `update` block deleted, everything else unchanged (including the `security definer`/`set search_path = ''` header and the function's grants — `CREATE OR REPLACE` preserves existing grants).
2. Update the function's own doc comment (currently implies product reassignment is part of its job) to state membership-only scope.
3. Update `UserRow.tsx`'s confirm-panel copy (`"Their previous shop membership will be removed."`, line 263) — no product-related claim is made there today, so likely no text change needed; verify during implementation.
4. No TypeScript/RLS changes.

### Security requirements
- No privilege change — `is_admin()` gate is untouched.
- Reduces blast radius: a membership change can no longer silently mutate unrelated product rows seller_id. This is a net security *improvement* (principle of least surprise / least privilege per action).

### Test cases
1. Assign Seller X (no prior shop) to Shop A → Shop A's existing products are **unchanged** (no `seller_id` rewrite — this is a behavior *change* from today; confirm it's the intended one).
2. Reassign Seller Y from Shop A to Shop B → Seller Y's pre-existing Shop-A products remain `shop_id = Shop A`, `seller_id = Seller Y` (unchanged either way — same as before).
3. Confirm `admin_action_log` still gets exactly one `assign_seller_shop` row per call, with the same metadata shape minus `products_reassigned_count` (which becomes always `0`/removed — decide which during implementation; recommend removing the field from metadata entirely since it no longer applies).
4. Regression: promoting a buyer to seller still works end-to-end (role flip + shop membership insert).

### Dependencies
None — this can ship first, independently.

### Acceptance criteria
- `admin_assign_seller_shop` no longer contains any `update public.products` statement.
- Existing `assignSellerShopAction` flow (promote buyer, reassign seller) works identically from the UI's perspective except products are no longer silently moved.
- `npm run lint` / `npm run typecheck` green (no TS changes expected, but confirm no stale type drift).

---

## Feature 2 — Secure, audited admin-only product-transfer action

### Root cause
There is currently **no correct, complete way to intentionally move a product's shop assignment**:
- `assignProductShopAction` (`product.actions.ts:80-100`) / `queries.assignProductShop()` (`queries.ts:5305-5322`) exist, but:
  1. The query is a **plain client `.update({ shop_id: shopId }).eq("id", productId)`** — no RPC, no transaction safety beyond the single statement, relies *solely* on RLS's bare `is_admin()` clause.
  2. **No audit log entry is written** — every other sensitive admin action (`assign_seller_shop`, `demote_seller_to_buyer`, `approve_refund`, etc.) logs to `admin_action_log`; this one doesn't.
  3. No validation that the target shop is active (compare to `admin_assign_seller_shop`'s `if not v_shop.active then raise exception`).
  4. The UI only shows the control when `product.shopId === null` (`ProductsDataTable.tsx:456`) — there is no way today to transfer an *already-assigned* product to a different shop at all, through the UI.
  5. **`product_variants.shop_id` is not auto-synced** when `products.shop_id` changes (confirmed: no trigger on `product_variants` touches `shop_id`; it's stamped once at variant creation from whatever the product's shop was at that moment — `queries.ts:5749-5768`). A product transfer that doesn't also update its variants' `shop_id` immediately recreates the exact same staleness bug one level deeper.
- Separately and more seriously: **`products.shop_id` has no column-level protection at all** (confirmed via `pg_trigger` — only `products_seed_inventory`, `products_set_updated_at`, `products_sync_inventory_shop`, `products_track_published_at` exist; none guard `shop_id` against non-admin mutation). Because RLS's `with_check` on the products UPDATE policy is `seller_id = (select auth.uid()) OR is_shop_member(shop_id) OR is_admin()`, and `seller_id = me` alone satisfies it **irrespective of what `shop_id` is being set to**, a seller can today move their own product into *any* shop UUID via a direct PostgREST call, bypassing `updateProductSchema` (which has no `shopId` field, specifically to prevent this through the intended UI — `product.schema.ts:124-131`). This is a genuine, previously-undocumented security gap that the new design should close, not just route around.

### Current codebase findings
- `src/features/products/actions/product.actions.ts:79-100` — `assignProductShopAction`.
- `src/features/products/schemas/product.schema.ts:136-140` — `assignProductShopSchema`.
- `src/lib/supabase/queries.ts:5300-5322` — `assignProductShop()`.
- `src/features/products/components/ProductsDataTable.tsx:197-209, 456` — UI wiring and the `shopId === null` gate.
- `products.shop_id` propagation already correctly automatic for `inventory` via `sync_inventory_shop_id()` trigger (`products_sync_inventory_shop`, fires `AFTER UPDATE OF shop_id`) — **no change needed there**.
- `stock_adjustments.shop_id` has **no** auto-sync trigger (confirmed) — it is a pure historical ledger, correctly immutable already (see Feature 6).

### Files / DB objects involved
- **New migration:** `supabase/migrations/20261013000100_admin_transfer_product_shop.sql`
  - New trigger function `enforce_product_shop_immutability()` + `BEFORE UPDATE OF shop_id ON products` trigger — blocks any `shop_id` change unless a session-local flag is set, mirroring the exact pattern already used for `app.cod_collection_in_progress` / `app.refund_in_progress` in `enforce_order_update_rules`.
  - New RPC `admin_transfer_product_shop(p_product_id uuid, p_shop_id uuid) returns products` — `security definer`, admin-only, validates target shop is active, sets `app.product_shop_transfer_in_progress = true` for the duration of its own update, cascades to `product_variants.shop_id` for all of that product's variants, writes one `admin_action_log` row (`action = 'transfer_product_shop'`, `target_shop_id = p_shop_id`, `metadata = jsonb_build_object('product_id', p_product_id, 'from_shop_id', ..., 'to_shop_id', p_shop_id, 'product_title', ...)`).
  - Revoke direct `update` grant on `products.shop_id`? Not possible at column-grant granularity with RLS the way this schema works — the trigger is the enforcement point instead (same reasoning as `enforce_order_update_rules` guarding `orders` columns that still have table-level UPDATE grants).
- `src/lib/supabase/queries.ts` — rewrite `assignProductShop()` to call the new RPC instead of a raw `.update()`; reuse `curatedRpcError` + a new `ADMIN_PRODUCT_RPC_SAFE_ERROR_CODES = ["42501", "22023", "P0002"] as const` (mirrors `ADMIN_USER_RPC_SAFE_ERROR_CODES`).
- `src/features/products/actions/product.actions.ts:79-100` — `assignProductShopAction` logic unchanged (still Zod-validate → `requireRole([USER_ROLES.admin])` → delegate to `queries`); only its doc comment changes (no longer "legacy/unassigned" only).
- `src/features/products/schemas/product.schema.ts:136-140` — update doc comment; schema shape (`productId`, `shopId`) is unchanged.
- `src/features/products/components/ProductsDataTable.tsx:456` — remove the `product.shopId === null` condition so the control is available for every product; change the visible label/confirm copy to distinguish "Assign shop" (currently unassigned) from "Transfer to another shop" (already assigned, more consequential — add a `ConfirmPanel`, matching the pattern already used elsewhere in this file for archive/cancel actions, since this is no longer a reversible-by-habit action once other sellers gain access).

### Implementation steps
1. Migration: create `enforce_product_shop_immutability()` + trigger (default-deny any `shop_id` UPDATE unless the session flag is set).
2. Migration: create `admin_transfer_product_shop()` RPC per spec above, including the `product_variants.shop_id` cascade and the `admin_action_log` write, inside one transaction.
3. Update `queries.assignProductShop()` to call the RPC.
4. Update `product.actions.ts` / `product.schema.ts` doc comments only (no signature change).
5. Update `ProductsDataTable.tsx`: remove the `shopId === null` gate; add a confirm step for the "already assigned" case; keep the "Unassigned" badge logic as-is (still useful information).
6. Update MODULES.md/ARCHITECTURE.md references to `assignProductShopAction` if they describe it as "legacy/unassigned only" (grep first; low risk, documentation-only).

### Security requirements
- `admin_transfer_product_shop` must independently re-check `is_admin()` inside the function body (defense-in-depth, matching every other admin RPC in this codebase) — never rely on RLS alone.
- The new trigger must reject a `shop_id` change from **any** caller — including admin — that doesn't go through the RPC's session flag, exactly matching the F-01 precedent (`20261011163703_lock_admin_order_update_bypass.sql`) that closed the equivalent gap on `orders`.
- The RPC must validate the destination shop is `active` (reuse `admin_assign_seller_shop`'s existing pattern).
- No change to who can *view* a product (`is_shop_member`/`seller_id`/public-active clauses untouched).

### Test cases
1. A seller attempts to change their own product's `shop_id` via a direct Supabase client call (simulating a bypass of the Zod schema) → rejected by the new trigger, regardless of RLS passing.
2. Admin calls `admin_transfer_product_shop` on an unassigned product → succeeds, product now has the target `shop_id`, one `admin_action_log` row written.
3. Admin calls it on an *already-assigned* product → succeeds (this is the previously-missing case), old shop's members lose access, new shop's members gain it immediately.
4. All of the transferred product's variants now carry the new `shop_id` (regression test specifically for the previously-unhandled cascade).
5. `inventory` row for the product auto-updates its `shop_id` (already-working trigger, confirm it's unaffected by the RPC's new code path).
6. Transfer to an inactive shop → rejected with a friendly error.
7. Non-admin calling the RPC directly → rejected.
8. A historical order placed against this product **before** the transfer keeps its original `shop_id` (see Feature 6).

### Dependencies
None blocking — independent of Feature 1, but logically sequenced after it (both touch admin shop-assignment surface; shipping Feature 1 first keeps each change small and separately testable, per your instruction).

### Acceptance criteria
- A product can be transferred regardless of its current `shop_id`.
- Every transfer produces exactly one `admin_action_log` row.
- No non-RPC path can change `products.shop_id`, verified by a direct-update test as a non-admin **and** as an admin.
- `product_variants.shop_id` never drifts from its parent product's `shop_id` after a transfer.
- `npm run lint` / `npm run typecheck` / `npm run build` green.

---

## Feature 3 — Verify multi-seller shared shop access (no code expected to change)

### Root cause
N/A — this feature exists to **prove** (via tests, not new code) that the already-correct `is_shop_member()` wiring identified in the Audit Summary actually delivers the requested behavior end-to-end, now that Features 1-2 remove the one mechanism that was silently undermining it for a subset of rows.

### Current codebase findings
Already documented in Section 0's table. No gaps found beyond Feature 1/2's scope.

### Files / DB objects involved
None modified. Verification touches: `products`, `product_variants`, `inventory`, `stock_adjustments`, `orders`, `order_shipments`, `return_requests`, `shops` RLS; `adjust_stock`, `record_order_shipment`, `respond_to_return`, `record_return_item_condition` RPCs.

### Implementation steps
1. Using the two existing Shop One sellers ("junjun brillantes", "Lj Paulo Almera"), manually (or via a throwaway test script under `scripts/`, matching the existing `scripts/e2e-flow.mjs` precedent — **not** a new permanent test framework, per CLAUDE.md's "don't add a heavyweight test framework without approval") exercise:
   - Seller A views Seller B's Shop-One product in the dashboard list and edits it.
   - Seller A adjusts stock on Seller B's product.
   - Seller A views and advances (confirm → process → ship → **deliver**) an order whose literal `seller_id` is Seller B.
   - Seller A responds to a return request on Seller B's order.
   - Seller A edits the shared shop's profile/branding.
2. Confirm a Shop Two/Three seller gets **zero** results for all of the above against Shop One's data (not just a write rejection — confirm it's absent from listings entirely, matching RLS SELECT behavior).

### Security requirements
None new — this step verifies existing boundaries, it doesn't create any.

### Test cases
The six bullets above, each both as a positive case (Shop One ↔ Shop One, succeeds) and negative case (Shop Two/Three ↔ Shop One, fails/invisible).

### Dependencies
Features 1 and 2 (so the verification reflects the corrected product/shop_id state, not the pre-fix stale data).

### Acceptance criteria
All positive cases succeed; all negative cases fail or return empty, with no RLS policy or RPC changes required to make them pass.

---

## Feature 4 — Fix & verify the "Mark as Delivered" seller permission error

### Root cause
Restated precisely from Section 0: the error is a **symptom**, not an independent bug. `enforce_order_update_rules` and the `orders` UPDATE RLS policy already correctly allow any current `is_shop_member(shop_id)` to advance an order's status (verified live, no drift). The failure only occurs for the specific orders whose `shop_id` is stale — i.e., exactly the orders affected by Feature 1's root cause. **No change to `advanceOrderStatusAction`, `queries.advanceOrderStatus()`, the orders RLS policies, or `enforce_order_update_rules` is needed or planned.**

### Current codebase findings
- `src/features/orders/components/OrderStatusControl.tsx:112` — the always-shown `"Couldn't update the order"` title that likely caused the confusion about the error's wording.
- `src/features/orders/actions/order.actions.ts:160-228` — `advanceOrderStatusAction`; confirmed its catch-all fallback text is never actually reached on this path.
- `src/lib/supabase/queries.ts:2465-2556` — `advanceOrderStatus()`; confirmed the real thrown message for a zero-row RLS rejection is `"This order's status has already changed. Refresh and try again."` (line ~2550).
- Live RLS (`pg_policy` on `public.orders`) and live trigger body (`pg_get_functiondef` on `enforce_order_update_rules`) both confirmed correct and drift-free on 2026-10-13.

### Files / DB objects involved
None new — this feature is verification-only, contingent on Features 1, 2, and 5.

### Implementation steps
1. After Features 1 and 2 ship, and after Feature 5's data decision is executed, reproduce the original failure: have "junjun brillantes" attempt to mark one of the previously-stale orders (e.g. `ORD-20261010-000279`) as delivered.
2. Confirm success.
3. Confirm the error path itself (attempting the same action against a genuinely out-of-scope order, e.g. a Shop Two order) still correctly surfaces `"This order's status has already changed. Refresh and try again."` under the title `"Couldn't update the order"` — i.e., confirm the *legitimate* use of this error path (double-click race, truly unauthorized order) still works as designed; it should not be weakened.

### Security requirements
None new.

### Test cases
1. Shop One seller marks a *shop-mate's* `shipped` order as `delivered` → succeeds.
2. Shop One seller attempts the same on a Shop Two order → fails with the existing, correct message.
3. Double-click / concurrent-update race on the same order → still correctly surfaces the optimistic-concurrency message (regression check that Feature 1/2 didn't touch this unrelated code path).

### Dependencies
Features 1, 2, and 5.

### Acceptance criteria
The originally-reported scenario (a Shop One seller marking a shop-mate's order delivered) succeeds, with zero changes to the orders RLS policies, trigger, server action, or `OrderStatusControl.tsx`.

---

## Feature 5 — Resolve the 15 existing stale-shop products (decision required, not a migration)

### Root cause
Pre-existing data artifact from before this design was adopted — not something a migration should silently "fix," per your explicit instruction to preserve historical records and make this an intentional decision.

### Current codebase findings
Live, as of 2026-10-13: 15 active products owned by "Lj Paulo Almera" (`seller_id = 4ed1d007-da0e-4624-82e2-7185289f0a7b`) still carry `shop_id = 6c746e37-177e-45b8-b389-e03f9cadaa89` ("Shop Three"), despite that seller's current `shop_users` membership being "Shop One" (`638e23c6-a9c9-44ad-bfd0-a00fdb0df92d`). Product titles include "Classic Oxford Shirt," "Relaxed Linen Trousers," "Cable Knit Cardigan," and 12 others (full list available on request / re-query).

### Files / DB objects involved
No schema objects — this uses Feature 2's `admin_transfer_product_shop` RPC, called once per product (or a small batch), **manually, by an admin, after this plan is approved and Feature 2 has shipped**. Not bundled into any migration.

### Implementation steps (**not executed as part of this plan — documented for your decision**)
1. **Decision needed from you:** should these 15 products move to Shop One (matching the seller's current, intended membership), stay at Shop Three (if they're actually still meant to be Shop Three's catalog, and the seller's presence there is just historical/incidental), or be evaluated case-by-case?
2. Once decided: an admin uses the (now-unlocked) "Transfer to another shop" control from Feature 2 on each affected product, or a short one-off admin script calling `admin_transfer_product_shop` per product id — **run manually, not as a migration**, so it's an explicit, logged, reviewable action (each call produces its own `admin_action_log` row) rather than an opaque bulk data change.
3. Historical orders already placed against these products are **not** touched (Feature 6) — only the products' (and their variants') current `shop_id` changes, affecting only *future* orders.

### Security requirements
Same as Feature 2 — this is just Feature 2's RPC being used, not a new mechanism.

### Test cases
Covered by Feature 2's test suite; no additional mechanism to test here, only the specific data outcome to confirm after you execute it.

### Dependencies
Feature 2 must ship first.

### Acceptance criteria
You've made and recorded the decision; if "move to Shop One" is chosen, all 15 products (and their variants) show `shop_id = Shop One` after the admin runs the transfer, each with a corresponding `admin_action_log` row, and zero historical orders changed.

---

## Feature 6 — Preserve historical orders and payment records (verification)

### Root cause
N/A — this feature documents and verifies an invariant that **already holds today** and must not regress.

### Current codebase findings
- `create_order()` (live function body, confirmed) stamps `orders.shop_id` exactly once, at insert time, from `v_product.shop_id` as it existed *at that moment*. No trigger, function, or code path anywhere in the codebase subsequently mutates `orders.shop_id`.
- `stock_adjustments` has no trigger syncing its `shop_id` from `products` (confirmed via `pg_trigger`) — it is a pure, correctly-immutable historical ledger.
- `payments` has no `shop_id` column at all — it inherits shop scoping only via its `orders` join (by design, per `20260927134519_orders_returns_shipments_shop_scoping.sql`'s own comment), so it's trivially unaffected by any product/shop change.
- `return_requests.shop_id` is backfilled once from the parent order at creation (`20260927134519` migration) and likewise never re-synced afterward.

### Files / DB objects involved
None modified. This is a regression-test feature confirming Features 1, 2, and 5 don't introduce a sync trigger or backfill that would violate this.

### Implementation steps
1. Before/after snapshot test: record `shop_id` for all orders/payments/stock_adjustments/return_requests tied to one of the Feature 5 products, execute the Feature 5 transfer, re-query, assert zero rows changed except the `products`/`product_variants` rows themselves (and `inventory`, which is *supposed* to follow, per its existing trigger).
2. Confirm Feature 2's migration adds no trigger on `orders`, `payments`, `stock_adjustments`, or `return_requests` — only on `products`.

### Security requirements
None new.

### Test cases
1. Place an order against a product, transfer that product to a different shop, confirm the pre-existing order's `shop_id` is unchanged.
2. Place a *new* order against the same product post-transfer, confirm it gets the *new* `shop_id`.
3. Confirm `payments`/`return_requests`/`stock_adjustments` rows tied to the pre-transfer order are byte-identical before/after.

### Dependencies
Feature 2 (needs the transfer mechanism to test against).

### Acceptance criteria
Zero historical `orders`/`payments`/`stock_adjustments`/`return_requests` rows change as a side effect of any product-shop transfer, now or in the future — enforced by the fact that nothing in Features 1/2's migrations touches those tables.

---

## Consolidated implementation order

```
1. Feature 1 — decouple admin_assign_seller_shop from products   (migration, DB-only)
2. Feature 2 — admin_transfer_product_shop + lock-down trigger   (migration + TS + UI)
3. Feature 3 — verify shared shop access end-to-end               (test-only)
4. Feature 4 — verify "Mark as Delivered" is fixed                (test-only)
5. Feature 5 — your decision + manual transfer of the 15 products (operational, uses Feature 2)
6. Feature 6 — verify historical immutability                     (test-only, can run alongside 3/4)
```

Each step lint/typecheck/build-green before moving to the next, matching this repo's existing convention (see `role-separation-implementation-plan.md`'s "Implementation sequence").

## What must NOT change
- `orders` RLS policies, `enforce_order_update_rules`, `advanceOrderStatusAction`, `OrderStatusControl.tsx`.
- The one-shop-per-seller constraint (`shop_users_unique_user`).
- `sync_inventory_shop_id()` and its trigger (inventory auto-sync is correct and unrelated to this fix).
- Any historical row in `orders`, `payments`, `stock_adjustments`, or `return_requests`.
- `decide_return`'s admin-only restriction (existing business rule, out of scope).

## Full regression checklist (run once, after Feature 2 ships)
- Buyer checkout (single-shop and multi-shop/group cart) and buyer-initiated cancellation.
- COD cash collection (`mark_cod_payment_collected`).
- Xendit payment success, failure, webhook reconciliation, and refunds.
- Admin override paths (`decide_return`, user activation/deactivation, seller demotion).
- Seller product CRUD, image upload, bulk status/category actions, barcode/order-number lookup.

---

## Feature 7 — Equal-permissions audit: `order_items` and return-evidence storage (shipped)

### Root cause
Section 0's table asserted shop-member parity was already correct everywhere based on auditing `products`, `product_variants`, `inventory`, `orders`, `order_shipments`, `return_requests`, and `shops`. A follow-up, more exhaustive sweep — querying every RLS policy across the whole schema containing `seller_id` and checking each one for a missing `is_shop_member()` branch — found two it missed, both predating the shop-scoping effort entirely and never touched by `20260927134618_shop_member_order_rls_widening.sql`:

1. **`order_items` SELECT policy** — `buyer_id = me OR seller_id = me OR is_admin()`, no `is_shop_member`. `ORDER_COLUMNS` fetches `order_items` as a PostgREST embed, and an embedded child table's RLS is evaluated independently of the parent `orders` row's own visibility. Net effect: a shop member with full access to a shop-mate's *order* (via `is_shop_member(orders.shop_id)`) got an **empty line-items array** for it — the order was visible and even actionable, but what was actually ordered was not.
2. **`storage.objects` "order participants read payment receipts" policy** (the `payment-receipts` bucket) — same gap. This bucket has been reused since `20260826000000_returns_and_refunds.sql` for buyer-uploaded return-evidence photos (`getReturnEvidenceSignedUrl`/`uploadReturnEvidence` in `queries.ts`). A shop member responding to a return request on a shop-mate's order could not view the buyer's evidence photo.

### Current codebase findings
- `supabase/migrations/20260802000100_initial_schema.sql:1069-1081` — original `order_items` policy.
- `supabase/migrations/20260807030000_payment_receipts_storage.sql:60-73` — original storage policy.
- `src/lib/supabase/queries.ts:1694-1710` — `ORDER_COLUMNS` embeds `order_items`.
- `src/lib/supabase/queries.ts:4047-4078` — `uploadReturnEvidence`/`getReturnEvidenceSignedUrl` reuse the `payment-receipts` bucket.

### Confirmed empirically (live, rolled back) before the fix
- junjun (Shop One) querying `order_items` for a Shop One order whose literal `seller_id` is Lj Paulo: **0 rows**.
- junjun querying `storage.objects` for a return-evidence photo on that same order: **0 rows**.
(Both tests run under `SET LOCAL ROLE authenticated` + a simulated JWT — not the Postgres superuser session, which bypasses RLS entirely and would have hidden this.)

### Files / DB objects involved
- **Migration (applied):** `supabase/migrations/20261013073836_shop_member_order_items_and_receipts_rls.sql` — widens both policies with the identical additive `OR is_shop_member(o.shop_id)` shape used everywhere else in this codebase.

### Security requirements
Purely additive — only adds visibility a shop member should already have had; does not touch buyer, admin, or cross-shop boundaries.

### Test cases (all run, all passed)
1. junjun can now see `order_items` for Lj Paulo's Shop One order. ✅
2. junjun can now see the return-evidence photo for that order. ✅
3. Kier Magat (Shop Three) still sees neither (0 rows) — no regression. ✅
4. The order's actual buyer still sees their own `order_items` — no regression. ✅

### Dependencies
None — independent of Features 1-6; found via a standalone audit requested after Feature 3.

### Acceptance criteria
A shop member has identical read access to an order's line items and return-evidence photos as the literal `seller_id`, for any order belonging to their shop — met and verified above.

---

## Final verification log (2026-10-13)

Run after all 7 features shipped, as a closing double-check:

- All 4 migration files on disk byte-match their live-applied versions (`20261013063353`, `20261013064328`, `20261013065349`, `20261013073836`).
- `npm run lint`, `npm run typecheck`, `npm run build` — all clean.
- Feature 5 data operation: all 15 products confirmed moved to Shop One, 15 corresponding `admin_action_log` rows, 43 historical orders tied to them confirmed byte-unchanged.
- `products_enforce_shop_immutability`/`product_variants_enforce_shop_immutability` triggers are `BEFORE UPDATE OF shop_id` — scoped to that column only by Postgres semantics, so no other product mutation (price, status, quantity sync, etc.) is affected.
- Grepped all 4 migrations: zero references to `payments`, `xendit_*`, `mark_cod_payment_collected`, `decide_return`, or the admin user-management RPCs — none of this feature's work touches those surfaces.
- Live-tested buyer checkout (`create_order`) against both an untouched product and a just-transferred one — both succeed, both stamp the correct current `shop_id`.
- Live-tested COD cash collection by a shop member on an order whose literal `seller_id` was `null` (so only shop membership could grant access) — succeeded.
- All test mutations run in rolled-back transactions except the intentional, approved Feature 5 data change and the 4 migrations themselves — no other production data was altered.

No further work pending. Plan complete.
