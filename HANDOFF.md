# Handoff — RoberJ Online Shop (RobertJShop.store)

Written by Claude Sonnet 5 at the end of a work session, because the user is switching AI
code assistants (token budget ran out) and needs a different assistant to continue cold.
Delete this file once the next assistant has absorbed it and the work is reconciled —
it's a one-time handoff note, not permanent project documentation.

## What this project is

A Next.js 16 (App Router, Supabase backend) marketplace capstone project. Three roles:
Guest/Customer (buyer), Shop Owner (seller), Administrator (admin). **Read `CLAUDE.md`,
`README.md`, and `ARCHITECTURE.md` before touching anything** — this repo has unusually
strict conventions (service-layer-only DB access via `src/lib/supabase/queries.ts`,
`ActionResult<T>` everywhere, RLS as the real authorization boundary, no hardcoding, etc.)
and an AI Startup Checklist at the top of `CLAUDE.md` that is not optional.

- **Supabase project**: `hjxtbnmnwlbqgptgncoh` ("RobertJShop", org `xlphneqrwgmwplgjwout`).
  The Supabase MCP tools (`mcp__claude_ai_Supabase__*`) are connected and were used heavily
  this session for live verification — `execute_sql` only returns the **last** statement's
  result when given multiple statements, learned the hard way.
- **Repo root**: `C:\Users\USER\.vscode\roberj-onlineshop`. Branch: `claude/stoic-tesla-w3tlc7`.
- **Never commit without the user explicitly asking.** This was emphasized repeatedly and
  followed all session — implement + verify, then ask before `git commit`.

## Git state as of this handoff

```
0fc97fe Re-validate category-required specs server-side; add purchase-flow E2E scripts  (NOT mine — a concurrent/other agent's work, already committed by the user)
a8bd505 Show order date/time to buyer and seller, everywhere they look for it
7fbe2cc Expire abandoned guest carts after 24h of inactivity
2dea67d Fix dashboard/reports date filter never refreshing on same-URL clicks
878987c Force Google/Facebook account chooser instead of silent re-login
```

**Uncommitted right now** (implemented + typecheck/lint/build all verified green, just
waiting on a go-ahead to commit):
```
 M CHANGELOG.md
 M src/features/orders/components/OrderDateFilter.tsx
 M src/features/orders/components/OrderMethodFilter.tsx
 M src/features/orders/components/OrderStatusFilter.tsx
```
This is one cohesive fix (see below) — commit it as one commit once approved.

Important: **another AI agent/session was working in this same repo concurrently** earlier
(touched `src/lib/supabase/queries.ts` category-spec validation + added
`scripts/e2e-purchase-flow.mjs`/`scripts/seed-demo-orders.mjs`). That work is now safely
committed as `0fc97fe` — no longer a live-concurrency hazard, but good to know it happened
(the demo order data across "Shop One"/"Shop Two"/"Shop Three" used for verification this
session came from `scripts/seed-demo-orders.mjs`).

## What was shipped this session (chronological)

1. **`878987c`** — Google/Facebook sign-in always re-logged into whichever account was
   still active in the browser's own provider session, with no account picker, after our
   own sign-out (which can't touch Google/Facebook's session). Fixed by passing
   `prompt=select_account` (Google) / `auth_type=reauthenticate` (Facebook) in
   `queries.ts`'s `signInWithOAuth`/`linkOAuthIdentity`.

2. **`2dea67d`** — Dashboard "Today" (and Reports' date filters) never refreshed when
   re-clicking an already-active preset, because Next.js treats navigating to an unchanged
   URL as a no-op (no refetch). Fixed in `DashboardDateFilter.tsx`/`ReportsFilters.tsx`:
   detect when the resolved URL equals the current one and call `router.refresh()` instead.

3. **`7fbe2cc`** — Guest cart (`localStorage`, `CartProvider.tsx`) never expired, so a
   stranger's cart could sit on a shared/public device for weeks. Added a rolling 24h
   `savedAt` timestamp; expired carts clear themselves on next read.

4. **`a8bd505`** — Client asked for "Date and Time" on orders (vague ask, audited to find
   concrete gaps): buyer's order-list cards had no date at all; everywhere else showed
   date-only, never time; the status timeline showed no per-step timestamps. Added
   `orders.confirmed_at`/`processing_at` columns (migration
   `supabase/migrations/20261022000000_order_confirmed_processing_timestamps.sql`, applied
   live via Supabase MCP, trigger extended, `database.types.ts` hand-edited — **this repo's
   established pattern: apply via MCP, then hand-edit `database.types.ts`'s relevant table
   block rather than regenerating the whole ~100KB file**), swapped `formatDate`→
   `formatDateTime` across 7 surfaces, added timestamps to `OrderTimeline`.

5. **Uncommitted** — Seller/buyer/admin Orders-list filters (`OrderStatusFilter`,
   `OrderMethodFilter`, `OrderDateFilter`) had the *exact same* no-op-on-unchanged-URL bug
   as #2, just not yet fixed there. Same fix applied. **This came out of a live bug report
   from the user** (see next section) — it's a real, verified, legitimate fix regardless of
   that specific bug report's actual root cause (which turned out to be something else —
   see below). Not yet committed.

## Active investigation: bulk shipping-label printing (NOT finished — read carefully)

The user asked for an audit of "select multiple items, print labels together" for sellers.
**Finding: this feature already existed**, shipped in prior commits `f4dfa02`/`932a539`
(before this session) — checkboxes, select-all, bulk print via
`/seller/orders/labels?ids=a,b,c`, correct barcode/data, no duplicates, individual printing
preserved. Verified directly against live DB data, not just by reading code. **No rebuild
needed or done.**

The user then reported a real bug via screenshot + server logs: selecting orders and
clicking "Print labels (12)" produced "No labels to show — only To Pack orders onward do"
even though all 12 orders genuinely were `confirmed` ("To Pack") status.

**Root cause, confirmed with certainty via live DB queries + the user's own dev-server
logs:** the user was testing with their **admin** account ("Manuel Brillantes", user id
`63d1cf20-5a4a-44c6-b74c-158228ee69fe`), which has **zero shop membership**
(`shop_users` has no row for this user_id — confirmed by direct query). As an admin, RLS's
`is_admin()` clause lets them see/select *every* order platform-wide in `/seller/orders`
(confirmed: `/admin/reports` appeared in the same session's server log, proving it really
was the admin account). But the label pages
(`getDashboardOrder` in `queries.ts:3008`, called from
`src/app/seller/orders/[id]/label/page.tsx` and `src/app/seller/orders/labels/page.tsx`)
always scope the caller to `{sellerId: callerId, shopId: getOwnShopId(callerId)}` regardless
of role. With no shop, `shopId` resolves to `null`, and the filter collapses to
`seller_id = <admin's own id>` — matching none of the 12 orders, since an admin is never
literally the seller-of-record. No errors thrown anywhere (confirmed via the absence of
`[seller-labels]` console.error lines in the user's pasted log) — every lookup just
silently returned "not yours."

**This matches the app's own existing, apparently-intentional design**: `/admin/orders`
already deliberately *hides* the print-label actions for admins (`!isAdmin` gates in
`OrdersDataTable.tsx`) — sellers print their own labels, admins don't. The bug is that
the seller-only label pages have zero awareness of this boundary and produce a **misleading
error message** when it's violated (an admin, or any account with no shop, hits them
directly): *"None of the selected orders have a shipping label yet — only To Pack orders
onward do"* — implying the orders aren't ready, when actually they are and the real problem
is the *caller* has no shop.

**Proposed but NOT YET IMPLEMENTED** (was offered to the user, they hadn't confirmed before
this handoff was requested): fix the empty-state copy in
`src/app/seller/orders/labels/page.tsx` (and probably the single-label page's `notFound()`
path too, `src/app/seller/orders/[id]/label/page.tsx`) to distinguish "these aren't your
orders" from "these aren't packed yet" — low-risk copy/logic fix, no schema change.

**Recommended immediate next step for whoever picks this up**: ask the user whether they
still want that message fix, implement it if so, then **re-verify the original feature
report by testing with an actual seller account** — "Brillantes Manuel" (user id
`70623d0e-bcb6-4600-9911-ce9739ef6088`, sole member of shop `638e23c6-a9c9-44ad-bfd0-a00fdb0df92d`
"Shop One") was mathematically confirmed (via direct SQL simulation of the owner filter) to
have 6 of those exact 12 orders eligible and owned — the bulk-print feature should work
correctly for them. The user has not yet confirmed it works end-to-end with a real seller
account; that's the one remaining unverified claim.

## Useful test-account map (from this session's live-DB digging)

| Name | user_id | role | shop |
|---|---|---|---|
| Manuel Brillantes | `63d1cf20-5a4a-44c6-b74c-158228ee69fe` | admin | **none** — this is the gotcha |
| Brillantes Manuel | `70623d0e-bcb6-4600-9911-ce9739ef6088` | seller | Shop One (`638e23c6-a9c9-44ad-bfd0-a00fdb0df92d`) |
| Lj Paulo Almera | `4ed1d007-da0e-4624-82e2-7185289f0a7b` | seller | Shop One (`638e23c6-a9c9-44ad-bfd0-a00fdb0df92d`) |
| Kier Magat | `b55b5b49-114f-4005-9211-74e6df595536` | seller | Shop Three (`6c746e37-177e-45b8-b389-e03f9cadaa89`) |
| Ken Kaneki | `7636a3b7-6d99-44c1-bff9-9917ed5c40fc` | seller | Shop Two (`d4c7af4e-7486-4b0e-8642-cf28c68e38cf`) |
| justinebermejo | `1ddfc0c1-afaf-46dd-9c8d-847a6cf8977c` | admin | Shop One (`638e23c6-...`, oddly — an admin who IS also a registered shop member) |

**"Manuel Brillantes" (admin, no shop) vs. "Brillantes Manuel" (seller, Shop One) are
easy to confuse — same two words reversed, different accounts, different roles.** This
confusion is literally what caused the bug report above. Double-check which one is logged
in before trusting any "seller portal" test result.

## Conventions this session leaned on (useful going forward)

- **Hand-edit `database.types.ts`** for additive migrations rather than regenerating the
  whole file (it's ~100KB, blows past tool output limits) — find the table's `Row`/
  `Insert`/`Update` blocks, add the new column alphabetically, matching existing style.
- **Apply migrations live via `mcp__claude_ai_Supabase__apply_migration`**, and also write
  the `.sql` file into `supabase/migrations/` with a sortable timestamp prefix, so the repo
  and live DB stay in sync.
- **Verify against live data, not just code reading** — this session repeatedly caught
  things (or ruled out false leads) only by running real `execute_sql` queries against
  actual rows, not by trusting source code or a sub-agent's paraphrase alone ("trust but
  verify").
- When splitting unrelated concurrent changes in the same file into separate commits,
  `git apply --cached` with a hand-built patch (containing only the intended hunks) works
  well for precise partial-file staging — used successfully to separate this session's
  OAuth fix from another agent's in-progress code in `queries.ts` without touching their work.
