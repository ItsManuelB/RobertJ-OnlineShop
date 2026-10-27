# RoberJ Online Shop — Architecture

> [!IMPORTANT]
> **Read this first.** This is the technical specification for RoberJ Online Shop. It describes the **target architecture** (per the Software Architecture Document, the authoritative business spec) and honestly documents where the **current code** differs.
>
> - Business context & scope → **[README.md](./README.md)**
> - AI/developer working agreement → **[CLAUDE.md](./CLAUDE.md)**
> - *Why* each choice below was made → **[DECISIONS.md](./DECISIONS.md)** (ADR log)
> - Per-module ownership (pages/components/actions/tables) → **[MODULES.md](./MODULES.md)**
> - Next.js 16 framework conventions → **[AGENTS.md](./AGENTS.md)** (read `node_modules/next/dist/docs/` before writing framework code)
>
> When the code and the SAD disagree on a **business** rule, the SAD is the target and the code is behind. See [Current Database Mapping](#current-database-mapping-target-vs-current).

---

## Table of Contents

1. [System Design](#system-design)
2. [System Architecture](#system-architecture)
3. [Target Database Schema](#target-database-schema)
4. [Current Database Mapping (Target vs Current)](#current-database-mapping-target-vs-current)
5. [Authentication Flow](#authentication-flow)
6. [RBAC Model](#rbac-model)
7. [API Conventions](#api-conventions)
8. [Module Interactions](#module-interactions)
9. [Folder Architecture](#folder-architecture)
10. [Architecture Evolution Strategy](#architecture-evolution-strategy)
11. [Migration Notes](#migration-notes)
12. [Technical Debt Register](#technical-debt-register)

---

## System Design

RoberJ is a **server-first, service-oriented** web application. Its design rests on a small set of permanent principles:

| Principle | Meaning |
|-----------|---------|
| **Marketplace-first** | One unified catalog over the three sibling shops; the shopper never juggles three storefronts. |
| **Server-first** | Prefer Server Components and Server Actions; ship the minimum client JavaScript. |
| **Role-based** | Every capability is gated by role (Guest / Customer / Shop Owner / Administrator). |
| **Supabase-first** | Auth, PostgreSQL, and Storage are Supabase; RLS is the primary authorization boundary. |
| **Service layer** | All database access flows through one centralized service module — never from pages or components. |
| **Reusable components** | UI is composed from a shared, business-agnostic component library. |
| **Rule-based recommendation** | Guided Product Selection uses explicit rules, never AI/ML. |
| **Payments** | COD (seller/admin marks collected) + Xendit Online Payment (GCash, Maya, Card) — sandbox/test-mode; webhook-confirmed only, never the client. See [DECISIONS.md → ADR-019](./DECISIONS.md#adr-019-xendit-online-payment-gcash-maya-card-superseding-adr-008s-no-gateway-stance). |
| **Responsive by default** | Mobile-first; every surface handles loading / error / empty / success. |

### Technology Stack (as implemented)

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | `16.2.12` |
| UI runtime | React / React DOM | `19.2.4` |
| Language | TypeScript | `^5` |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) | `^4` |
| Data platform | Supabase (`@supabase/ssr`, `@supabase/supabase-js`) | `^0.12.4` / `^2.111.0` |
| Server state | TanStack React Query | `^5.101.4` |
| Validation | Zod | `^4.4.3` |
| Motion / icons | framer-motion / lucide-react | `^12` / `^1.28` |
| Styling utils | class-variance-authority, clsx, tailwind-merge | — |
| Barcode scanning | `@zxing/browser` (camera Code 128 decode; **dynamically imported**, client-only) | `^0.2.1` |

> [!NOTE]
> There is **no dedicated test runner** installed (no Jest/Vitest/Playwright). The only automated flow is the Node script in `scripts/` (`e2e-flow.mjs`). See [Testing Expectations in CLAUDE.md](./CLAUDE.md#testing-expectations).
>
> The Stripe payments spike (ADR-014) has been **retired and removed** — Checkout is COD-only until the target QR-upload path (ADR-008) ships.

---

## System Architecture

Requests flow from the browser through Next.js (with a session-refreshing proxy), into Server Actions, down to a single service layer, and finally to Supabase. **Pages orchestrate. Components present. The service layer owns data.**

```mermaid
flowchart TD
    subgraph Browser["Browser"]
        RSC["Server Components<br/>(render on server)"]
        RCC["Client Components<br/>(forms, cart, interactivity)"]
    end

    subgraph NextApp["Next.js 16 App Router"]
        direction TB
        Proxy["proxy.ts<br/>session refresh + route guards"]
        Layouts["Layouts & Pages<br/>(orchestrate only)"]
        SA["Server Actions<br/>ActionResult&lt;T&gt; + Zod"]
    end

    Service["Service Layer<br/>src/lib/supabase/queries.ts<br/>(all DB reads/writes, mappers, cache)"]

    subgraph SB["Supabase"]
        Auth["Auth (PKCE)"]
        PG[("PostgreSQL<br/>+ Row-Level Security")]
        Store["Storage<br/>(product images, QR receipts)"]
    end

    RCC -->|invoke| SA
    RSC -->|read| Layouts
    Browser -. every request .-> Proxy
    Layouts --> Service
    SA --> Service
    Service --> Auth
    Service --> PG
    Service --> Store
```

**The canonical data-flow rule:**

```text
Page → Server Action → Service (queries.ts) → Supabase client → PostgreSQL
```

- **Pages never import a Supabase client directly.** They call Server Actions or read through the service layer.
- **Components never contain business logic.** They receive data and callbacks as props.
- **The service layer is the only place `.from()` / `.rpc()` is called.**

Key files:

| Concern | File |
|---------|------|
| Browser Supabase client | `src/lib/supabase/client.ts` |
| Server Supabase client (+ admin) | `src/lib/supabase/server.ts` |
| Session refresh helper | `src/lib/supabase/session.ts` |
| Centralized service/query layer | `src/lib/supabase/queries.ts` |
| Generated/hand-written DB types | `src/lib/supabase/database.types.ts` |
| Middleware (session + guards) | `src/proxy.ts` |
| Action result envelope | `src/types/action.types.ts` |
| Routes / roles / statuses | `src/constants/*` |

---

## Target Database Schema

Per the SAD **Database Architecture**, the target model is shop-centric: shops list products, products carry inventory, customers place orders, orders carry payments, and rules drive recommendations.

**Target tables:** `profiles`, `roles`, `shops`, `shop_users`, `products`, `inventory`, `orders`, `payments`, `recommendation_rules`, `reports`.

```mermaid
erDiagram
    roles ||--o{ profiles : assigns
    profiles ||--o{ shop_users : "member of"
    shops ||--o{ shop_users : "staffed by"
    shops ||--o{ products : lists
    products ||--o{ inventory : "stocked as"
    profiles ||--o{ orders : places
    shops ||--o{ orders : fulfils
    orders ||--o{ payments : "paid by"
    products ||--o{ recommendation_rules : "recommended by"
    orders ||--o{ reports : "aggregated into"

    roles {
        uuid id PK
        text name "guest|customer|shop_owner|admin"
    }
    profiles {
        uuid id PK
        uuid role_id FK
        text full_name
    }
    shops {
        uuid id PK
        text name
        text slug
    }
    shop_users {
        uuid id PK
        uuid shop_id FK
        uuid profile_id FK
    }
    products {
        uuid id PK
        uuid shop_id FK
        text title
        integer price_cents
    }
    inventory {
        uuid id PK
        uuid product_id FK
        integer quantity
    }
    orders {
        uuid id PK
        uuid buyer_id FK
        uuid shop_id FK
        text order_status
        text payment_status
    }
    payments {
        uuid id PK
        uuid order_id FK
        text method "cod|qr_upload"
        text status
    }
    recommendation_rules {
        uuid id PK
        uuid product_id FK
        jsonb conditions
    }
    reports {
        uuid id PK
        text type
        jsonb data
    }
```

> [!NOTE]
> This ERD is the **target** derived from the SAD. Column names are indicative. The authoritative money convention (below) and lifecycle rules come from the current, reviewed schema and should carry forward.

**Design invariants to preserve when building toward the target:**

- **Money is stored as integer minor units** (`*_cents`), never floats.
- **Financial and historical rows are append-mostly:** no `DELETE` policy on orders / order items / payments; price and title are **snapshotted** onto order lines so later product edits never rewrite history.
- **Order lifecycle timestamps** (`placed_at`, `confirmed_at`, `processing_at`, `paid_at`, `shipped_at`, `delivered_at`, `cancelled_at`) are set by triggers, not clients. `confirmed_at`/`processing_at` (added `20261022000000_order_confirmed_processing_timestamps.sql`) are null for any order that passed through those statuses before the column existed — there is no history to backfill.
- **Stock decrements happen atomically** inside a `SECURITY DEFINER` RPC that locks `inventory` rows `FOR UPDATE` (before `products`, on purpose — see the Inventory section below).

---

## Current Database Mapping (Target vs Current)

> [!NOTE]
> **The canonical Target-vs-Current mapping (roles, `shops`, `inventory`, `payments`, `recommendation_rules`, `reports`, cart) lives in one place: [README.md → Implementation Status](./README.md#implementation-status-target-vs-current).** This section does not restate it — it documents what the *current* schema actually contains, which the mapping table doesn't cover.

The live schema (see `supabase/migrations/*.sql` and `src/lib/supabase/database.types.ts`) implements a reviewed subset. Roles are an enum on `profiles`; "shops" are currently **seller accounts**.

**Current tables:** `profiles`, `categories`, `products`, `product_images`, `orders`, `order_items`, `order_shipments`, `payments`, `shops`, `shop_users`, `inventory`, `stock_adjustments`, `admin_action_log`.

**Current enums:** `user_role (buyer|seller|admin)`, `product_status (draft|active|sold|archived)`, `product_condition (new|like_new|good|fair|poor)`, `payment_method_type (cod|card|qr_upload — `card` is inert legacy from the retired Stripe spike)`, `payment_status (pending|paid|failed|refunded|partially_refunded)`, `order_status (pending|confirmed|processing|shipped|delivered|cancelled|refunded)`, `stock_adjustment_reason (initial_stock|restock|correction|sale|cancellation_restock|shrinkage|other)`.

**Current DB functions:** `create_order`, `is_admin`, `current_user_role`, `get_my_profile`, `slugify`, `is_shop_member`, `adjust_stock`, `admin_assign_seller_shop`, `admin_list_users`.

> [!NOTE]
> **`shops`/`shop_users` exist as of the Phase 2 migration (`20260813000000_shops_and_shop_users.sql`), but this is a foundation, not a completed cutover.** Each existing `seller` profile was backfilled into exactly one `shops` row via `shop_users` (one shop, one member, today). `products.seller_id` and `orders.seller_id` were deliberately **not** touched — they still directly reference `profiles.id`, and RLS/`create_order`/`submit_qr_payment`/`verify_payment`/`enforce_order_update_rules` all still operate on `seller_id` exactly as before. There is no `products.shop_id` or `orders.shop_id` column yet; "which shop does this seller belong to" is only resolvable via a `shop_users` join today. The `is_shop_member(shop_id)` DEFINER helper mirrors `is_admin()`'s shape specifically so a later migration can reuse it once `shop_id` lands on `products`/`orders`. See TD-1 below.

> [!NOTE]
> The SAD's payment path — **COD + QR receipt upload + manual verification** — is now implemented. The `payments` table's Stripe-only columns were dropped when QR was built (this closed TD-3); `payments` now holds `receipt_path` (a private Storage object path, not a public URL), `verified_by`/`verified_at` (the manual-verification audit trail), and the `qr_upload` payment method. `submit_qr_payment`/`verify_payment` are the sole write RPCs — see [Payments RPCs](#payments-rpcs-qr-receipt-upload-manual-verification) below.

> [!NOTE]
> **Inventory is now a dedicated `inventory` table** (`20260815000000_inventory_and_stock_history.sql`), closing TD-2. `products.quantity` is **not** dropped — it is a trigger-synced, read-only-by-convention mirror (`inventory_sync_products_quantity`), kept accurate via a column-level `REVOKE UPDATE (quantity) ON products FROM authenticated`, so every existing buyer-facing read path (PDP, catalog tiles, cart, `getProductsPriceAndStock`) keeps reading `products.quantity` unchanged. An append-only `stock_adjustments` table records every movement (sale, manual restock/correction/shrinkage, cancellation restock, the initial backfill) with who/why/when. `adjust_stock` is the sole manual-write RPC; `create_order` now locks and decrements `inventory` instead of `products` directly; a DB trigger restocks automatically when an order transitions to `cancelled`. See [Architecture Evolution Strategy](#architecture-evolution-strategy) below for the full design.
>
> **Accepted limitation:** the products↔inventory sync depends on the trigger chain staying intact — there is no cross-table CHECK constraint enforcing `products.quantity = inventory.quantity` (Postgres cannot express one declaratively). This is a documented, accepted risk, not a solved one.

> [!NOTE]
> **Seller onboarding is now Admin-controlled, no direct SQL required** (`20260816000000_admin_user_shop_management.sql`). `profiles` UPDATE RLS is self-only (`id = auth.uid()`, never widened with `is_admin()`), so a `SECURITY DEFINER` RPC — `admin_assign_seller_shop(p_user_id, p_shop_id)` — is the sole path for an admin to promote a buyer to seller and/or (re)assign their shop: it explicitly checks `is_admin()` inside (never trusts RLS alone, same as `create_order`/`adjust_stock`), flips `profiles.role` when the target is a `buyer`, deletes any existing `shop_users` row for that user and inserts the new one (atomic — no window with zero or two memberships), and logs one row to the new `admin_action_log` table. A `shop_users` `unique (user_id)` constraint backs this at the schema level. `admin_list_users()` is a second new `SECURITY DEFINER` RPC (mirrors `get_my_profile()`'s shape, admin- rather than self-scoped) — the only place `auth.users.email` is joined into any query, since email isn't otherwise reachable from `public.profiles`. Shop create/edit needed no new RPC — `shops` RLS already had `is_admin()` in it. Public signup is untouched and remains Buyer-only.

For what each gap requires to close, see [Architecture Evolution Strategy](#architecture-evolution-strategy) below.

### The `create_order` RPC (current, sanctioned checkout path)

`create_order` is the single sanctioned way to place an order today. It is `SECURITY DEFINER` and:

1. Derives `buyer_id` from `auth.uid()` — **never** a client parameter.
2. Locks the referenced `inventory` row `FOR UPDATE`, then the `products` row (in that order — see the note below on why).
3. Validates: products are `active`, single seller per order, single currency, sufficient stock (checked against `inventory.quantity`).
4. Inserts the order and its line items with **price/title snapshots**.
5. Decrements `inventory.quantity`; a sync trigger mirrors the new value onto `products.quantity` and flips `sold`/`active` at the zero-stock boundary — see the Inventory note above.
6. Raises typed errors (e.g. `Only % left of %`) that the service layer maps to friendly messages.

> [!NOTE]
> **Lock ordering is inventory-then-products, not the reverse.** `adjust_stock` (the manual-adjustment RPC) only ever takes a direct lock on `inventory`; its later write to `products.quantity` happens *inside* the sync trigger, while the `inventory` lock is still held. For `create_order` to never deadlock against a concurrent `adjust_stock` call on the same product, it must acquire its own `inventory` lock before its `products` lock too. Both RPCs are written this way — see the migration's header comment for the full reasoning.

Column-level update rules are enforced by an `enforce_order_update_rules` trigger: financial/identity fields are immutable, only the seller advances fulfilment, the buyer may only cancel, and `payment_status` is never client-driven **except** the two narrow, flag-gated cases below.

### Payments RPCs (COD collection + Xendit Online Payment)

See [DECISIONS.md → ADR-019](./DECISIONS.md#adr-019-xendit-online-payment-gcash-maya-card-superseding-adr-008s-no-gateway-stance) for the full design rationale. Four `SECURITY DEFINER` RPCs are the sole write path into `payments` — no direct INSERT/UPDATE grant exists on the table, mirroring `create_order`'s chokepoint philosophy:

- **`begin_xendit_payment_attempt(p_order_id, p_channel_code)`** — buyer-authenticated; idempotently reserves (or reuses an in-flight/still-valid) `payments` row for an order, re-pricing from `orders.total_cents`/`currency`, never a client-supplied amount. `EXECUTE` granted to `authenticated`.
- **`finalize_xendit_payment_request(p_payment_id, p_xendit_payment_request_id, p_checkout_url, p_expires_at, p_status)`** — buyer-authenticated; narrowly updates the exact row just reserved with Xendit's synchronous response. `EXECUTE` granted to `authenticated`.
- **`process_xendit_webhook(p_reference_id, p_xendit_payment_request_id, p_xendit_payment_id, p_status, p_amount_cents, p_currency, p_raw_payload, p_channel_code)`** — the **only** path by which a payment becomes `paid`. `EXECUTE` granted to **`service_role` only** (explicitly revoked from `public`/`anon`/`authenticated` — confirmed absent from the security advisor's "executable by authenticated" list). Validates the resolved row's stored `xendit_payment_request_id` and the amount/currency against what was recorded at attempt-creation time; is a no-op if the payment is already `paid`/`failed` (idempotent against retries and out-of-order delivery); logs every delivery to `payment_webhook_events` regardless of outcome.
- **`mark_cod_payment_collected(p_order_id)`** — the order's seller or an admin marks a COD order's cash collected (never automatic at order creation). Writes a real `payments` row (`payment_method_type = 'cod'`) so COD collections appear in the same ledger as Xendit payments. Rejects if the order already has an active/paid Xendit attempt. `EXECUTE` granted to `authenticated`.

The `enforce_order_update_rules` trigger has two narrow, transaction-local-flag-gated exceptions for seller-driven `payment_status` writes (mirroring the existing `app.refund_in_progress` pattern already used for refunds): the service-role webhook path needs no flag (it runs with `auth.uid() IS NULL`, already unconditionally permitted), but `mark_cod_payment_collected` sets `app.cod_collection_in_progress` immediately before its own `orders` update — a raw client-side `.update()` by the correct seller, bypassing the RPC, still cannot set `payment_status`. The former QR-verification carve-out (a seller manually flipping `payment_status` with no flag at all) has been removed entirely.

Historical QR receipt images remain in the private `payment-receipts` Supabase Storage bucket, path `{order_id}/{uuid}.{ext}` — the bucket, its objects, and its SELECT policy are untouched; only the buyer-INSERT policy was dropped, so no new receipts can be created.

### Seller fulfillment: `order_shipments` + `record_order_shipment`

Seller fulfillment enrichment (item verification, manual tracking, printable label, buyer-visible tracking) is layered onto the **unchanged** `order_status` backbone (`pending → confirmed → processing → shipped → delivered`, already labelled To Pack / Ready for Pickup in the UI). No enum, `orders`/`order_items` RLS, `enforce_order_update_rules`, or inventory/payment change was needed.

- **`order_shipments`** — one row per seller order (`unique (order_id)`), `seller_id` denormalized for RLS. Holds `packed_at` (advisory audit timestamp, set when the seller verifies items and moves To Pack → Ready for Pickup) and manually-entered `courier` / `tracking_number`. The ship date itself stays on `orders.shipped_at`. RLS: participants (buyer/seller/admin) read; **seller/admin write, buyer never writes**. Chosen over columns-on-`orders` specifically because `orders`' UPDATE policy is buyer-writable and its trigger only guards enumerated columns — a new column there would be buyer-forgeable.
- **`record_order_shipment(p_order_id, p_courier, p_tracking_number)`** (`SECURITY DEFINER`, `authenticated`) — the atomic Ready-for-Pickup → Shipped write: re-checks seller/admin ownership, requires `processing` status and (for Xendit) a completed payment, upserts courier+tracking, and flips `order_status = 'shipped'` in one transaction. Runs as the caller's `auth.uid()`, so the existing trigger's "only the seller changes fulfilment status" rule passes with no trigger change. `packed_at` is written separately via a plain RLS-scoped upsert (advisory). Both flow through the single `advanceOrderStatusAction`; no parallel shipment action exists.

**Internal order barcode (read-only identification):** the shipping label embeds a dependency-free **Code 128** barcode of the internal `order_number` (`features/orders/utils/code128.ts` encoder + `Barcode128` inline-SVG component — no library, round-trip-verified against ZXing's `Code128Reader`). A seller camera scanner (`ScanBarcodeButton` → `BarcodeScannerModal`, beside the `/seller/orders` search) decodes it on mobile (rear camera) and desktop (webcam) via **`@zxing/browser`** — **dynamically imported only when the scanner opens** (isolated async chunk; never in the main/server bundle), restricted to Code 128, with permission/unsupported/no-camera fallbacks to manual search, duplicate-scan guard, and full stream cleanup. Decoding is validated (`^ORD-\d{8}-\d{6}$`) then resolved by `resolveSellerOrderByNumberAction` → `getDashboardOrderByNumber(orderNumber, sellerId)` (seller-scoped **exact** match; identical generic error for nonexistent vs foreign) → navigate to the existing `/seller/orders/[id]`. **Read-only:** no DB migration, no status/inventory/payment/shipment writes, no new fulfilment path; the barcode encodes `order_number`, never the courier tracking number.

### Reporting RPCs (analytics over existing orders)

Reports & analytics are **computed DB-side by four read-only `SECURITY DEFINER` RPCs** over the existing `orders`/`order_items`/`payments` — there is **no `reports` table** (the SAD's `reports` entity is realised as derived aggregates, not a stored, duplicative table). Added in `20260818000000_reports_analytics_rpcs.sql`:

- **`report_sales_summary(p_from, p_to, p_shop_id)`** — one KPI row: total/paid/cancelled/pending-payment orders, paid revenue, units sold, average order value, and the COD/QR(legacy)/Xendit paid split. Always returns exactly one row (zeros for an empty range).
- **`report_sales_timeseries(p_from, p_to, p_granularity, p_shop_id)`** — order count + paid revenue per `day`/`week`/`month` bucket.
- **`report_order_status_breakdown(p_from, p_to, p_shop_id)`** — order counts per fulfilment status.
- **`report_top_products(p_from, p_to, p_limit, p_shop_id)`** — best-selling products by units (revenue over the paid subset), from the `order_items` snapshots.

Design rules baked into all four (mirroring `mark_cod_payment_collected`/`adjust_stock`):

- **Scoping is re-enforced inside each function** (DEFINER bypasses RLS): a seller sees only `seller_id = auth.uid()`; an admin sees every order, optionally narrowed to one shop via `p_shop_id` (mapped shop→seller through `shop_users`, since `orders` has no `shop_id` — see TD-1). A seller's `p_shop_id` is **ignored**, so scope can never be widened. Non-seller/non-admin callers are rejected (`42501`); `EXECUTE` is granted to `authenticated` only (never `anon`).
- **Single date axis:** every metric buckets on `placed_at`, interpreted in **`Asia/Manila`** (the PHP business timezone). Inclusive calendar range `[p_from, p_to]`.
- **Consistent metric rule:** count/volume metrics include every order *placed* in range; monetary metrics count only the `payment_status = 'paid'` subset — the confirmed-revenue source of truth that covers COD, legacy QR, and Xendit alike (payments rows are never summed directly, since a COD order may have zero payment rows and an order may accrue several).

Two additive indexes back the date-range scans: `orders (seller_id, placed_at desc)` and `orders (placed_at desc)`. The service layer (`getSalesSummary`/`getSalesTimeseries`/`getOrderStatusBreakdown`/`getTopProducts`, plus `getLowStockReport` reusing the RLS-scoped inventory read) calls these via `.rpc()`; charts are hand-rolled SVG/CSS in `src/components/charts` (no new dependency). Resolves TD-5.

---

## Authentication Flow

Authentication is **Supabase Auth** with email/password and **PKCE** email verification. Sessions are refreshed on every request in `src/proxy.ts`; the code-exchange happens in `src/app/auth/callback/route.ts`.

```mermaid
sequenceDiagram
    actor U as Visitor
    participant F as Auth Form (Client)
    participant A as Server Action<br/>(auth.actions.ts)
    participant Q as Service Layer<br/>(queries.ts)
    participant SB as Supabase Auth
    participant CB as /auth/callback
    participant P as proxy.ts

    U->>F: Submit email + password (sign up)
    F->>A: signUpAction(prevState, formData)
    A->>A: Zod validate (auth.schema.ts)
    A->>Q: signUpWithPassword(...)
    Q->>SB: auth.signUp({ emailRedirectTo: /auth/callback })
    SB-->>U: Verification email (PKCE link)
    U->>CB: Click link (?code=...)
    CB->>SB: exchangeCodeForSession(code)
    SB-->>CB: Session cookies
    CB-->>U: Redirect to validated same-origin next path
    Note over P: On every later request, proxy.ts calls<br/>updateSupabaseSession() to refresh cookies
```

**Rules baked into the flow:**

- Every auth action validates input with Zod **before** touching Supabase, and returns an `ActionResult`.
- Raw Supabase error messages are **mapped** to safe, friendly copy (`auth-errors.ts`) — internals never leak.
- Password reset **always reports success** (no account-enumeration signal).
- The callback validates that `next` is a **same-origin** path (open-redirect guard).
- `proxy.ts` redirects unauthenticated users away from protected prefixes (preserving `redirectTo`) and authenticated users away from auth routes.

Relevant files: `src/features/auth/actions/auth.actions.ts`, `src/features/auth/schemas/auth.schema.ts`, `src/features/auth/constants/auth-errors.ts`, `src/app/auth/callback/route.ts`, `src/lib/supabase/session.ts`, `src/proxy.ts`.

---

## RBAC Model

Authorization is enforced **in depth** — no single layer is trusted alone. A request must pass every applicable layer.

```mermaid
flowchart TD
    R["Incoming request"] --> L1
    L1["1 · proxy.ts route guards<br/>gate PROTECTED_ROUTE_PREFIXES"] --> L2
    L2["2 · Route/layout checks<br/>requireSessionUser() in server layouts"] --> L3
    L3["3 · Service-layer role guards<br/>requireRole(DASHBOARD_ROLES) in queries.ts"] --> L4
    L4["4 · SECURITY DEFINER helpers<br/>current_user_role(), is_admin()"] --> L5
    L5["5 · Row-Level Security (RLS)<br/>per-operation policies — PRIMARY boundary"] --> DB[("PostgreSQL")]
```

| Layer | Where | Responsibility |
|-------|-------|----------------|
| **Route guards** | `src/proxy.ts` + `src/constants/routes.ts` | Redirect unauthenticated users away from `PROTECTED_ROUTE_PREFIXES`; keep `/cart` public (client-side guest cart). |
| **Layout checks** | e.g. `src/app/(account)/layout.tsx` | Server-side `requireSessionUser()` — belt-and-suspenders. |
| **Service guards** | `src/lib/supabase/queries.ts` | `requireSessionUser()` / `requireRole(allowed)` at the top of protected operations. |
| **DEFINER helpers** | SQL functions | `current_user_role()`, `is_admin()` — called inside RLS to avoid recursion on `profiles`. |
| **RLS** | `supabase/migrations/*.sql` | **Primary** authorization boundary: per-operation, per-role policies on every table. |

**Role mapping:** for the full SAD-role ↔ code-role mapping, see [README.md → Implementation Status](./README.md#implementation-status-target-vs-current). The one RBAC-specific fact not covered there: `DASHBOARD_ROLES` (`src/constants/roles.ts`) grants dashboard access to `seller` and `admin` only — `buyer` and unauthenticated visitors never reach `/dashboard`.

**RLS highlights (current):**

- `profiles` are publicly readable, but self-insert is forced to `role = 'buyer'` and self-update **cannot** change role (backed by a `prevent_role_self_escalation` trigger — `WITH CHECK` can't see `OLD`).
- `products` insert requires `current_user_role() in ('seller','admin')`.
- `categories` writes require `is_admin()`.
- `orders` are readable by buyer/seller/admin; **insert is buyer-role-only** (`buyer_id = auth.uid() AND buyer_id <> seller_id AND current_user_role() = 'buyer'` — strict role separation, `20260929000000`); updates column-guarded; **no DELETE policy** (financial immutability).
- **Strict role separation (purchasing is buyer-only).** Only a `buyer` may place orders or persist a cart/wishlist. Enforced in depth: the `(shop)` layout redirects seller/admin to their portal (guests/buyers pass — catalog stays public); the checkout/cart/wishlist server actions assert `requireRole([buyer])`; and the DB is authoritative — `create_order` raises for a non-buyer, and the INSERT `WITH CHECK` on `orders`/`carts`/`cart_items`/`wishlists` all require `current_user_role() = 'buyer'`. Cart/wishlist SELECT & DELETE stay role-agnostic so a role-changed account can still read/clear its own rows. The inverse isolation (buyers blocked from seller/admin portals) is unchanged.
- `payments` are read-only to order participants/admin; writes only via `service_role`.
- Sensitive columns (e.g. `phone`) are withheld by column-level grants and only exposed through the `get_my_profile()` DEFINER RPC.

---

## API Conventions

RoberJ has **no REST controllers**. The "API layer" is **Next.js Server Actions**. Every mutation and protected read follows one uniform shape.

### `ActionResult<T>`

All Server Actions return a discriminated result (`src/types/action.types.ts`, helpers in `src/lib/utils/result`):

```ts
// Success
{ ok: true, data: T }
// Failure (friendly, mapped message + optional field errors)
{ ok: false, error: string, fieldErrors?: Record<string, string[]> }
```

Helpers: `ok(data)`, `fail(message)`, `fromZodError(error)`.

### Server Action pattern (canonical)

```ts
"use server";

export async function doThingAction(prevState: ActionResult, formData: FormData) {
  // 1. Validate at the boundary
  const parsed = thingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  // 2. Authorize (defense in depth — RLS still applies underneath)
  await queries.requireRole(DASHBOARD_ROLES);

  // 3. Delegate to the service layer (never touch Supabase here)
  const result = await queries.createThing(parsed.data);

  // 4. Revalidate affected routes / redirect
  revalidatePath("/things");
  return ok(result);
}
```

**Rules:**

1. **Validate with Zod first.** Never trust `formData`.
2. **Authorize before mutating.** Use `requireSessionUser` / `requireRole`; never assume the proxy already blocked it.
3. **Delegate to `queries.ts`.** Actions orchestrate; the service layer executes.
4. **Normalize errors.** Map raw provider errors to friendly copy; never surface internals.
5. **Revalidate deliberately.** Call `revalidatePath` / `revalidateTag` for exactly what changed.
6. **Return `ActionResult<T>`.** UI branches on `ok`.

### Service layer conventions (`queries.ts`)

- Column selections are **literal strings** (`PRODUCT_COLUMNS`, `ORDER_COLUMNS`) so Supabase can infer joined types.
- Row→domain **mappers** (`toProduct`, `toOrder`, `toProfile`) convert snake_case rows to camelCase domain models.
- Request-shared reads are wrapped in React `cache()` (`getProductBySlug`, `getBuyerOrder`, `getMarketplaceStats`, …).
- Domain **types** (camelCase) live in `features/<name>/types` and are kept distinct from DB row types in `database.types.ts`.

---

## Module Interactions

> For per-module ownership (which files, which tables, which status) rather than cross-module flows, see **[MODULES.md](./MODULES.md)**. This section covers only how modules talk to each other.

### Checkout Flow (current)

```mermaid
sequenceDiagram
    actor C as Customer
    participant Cart as Cart (client, localStorage)
    participant CK as Checkout Page (shop group)
    participant A as placeOrderAction<br/>(checkout.actions.ts)
    participant Q as Service Layer
    participant RPC as create_order() RPC
    participant DB as PostgreSQL

    C->>Cart: Add products (across sellers)
    C->>CK: Proceed to checkout
    CK->>CK: groupCartBySeller(items)
    C->>A: Submit shipping + payment method
    A->>A: Zod validate (checkout.schema.ts)
    A->>Q: requireSessionUser()
    A->>Q: createOrder(payload)
    Q->>RPC: rpc('create_order', ...)
    RPC->>DB: lock inventory FOR UPDATE, then products FOR UPDATE
    RPC->>DB: validate active / single-seller / stock
    RPC->>DB: insert order + items (price snapshots)
    RPC->>DB: decrement inventory.quantity (products.quantity syncs via trigger)
    RPC-->>Q: order id / order number
    Q-->>A: ActionResult
    A-->>C: redirect to order confirmation
```

> [!NOTE]
> **Target payment path — implemented:** at checkout the Customer selects **COD** or **QR Transfer** (informational only at that point — nothing is persisted until the buyer actually acts). For QR, the buyer uploads a receipt from their order detail page (`submitQrPaymentAction`), storing the image in Supabase Storage; the payment sits `pending` until the Administrator **or Shop Owner** manually verifies it (`verifyPaymentAction`, `/dashboard/payments`). The Stripe/card spike that previously sat alongside COD has been **removed** (ADR-014).

### Order Flow (lifecycle)

```mermaid
stateDiagram-v2
    [*] --> pending: buyer places order
    pending --> confirmed: seller/admin confirms
    confirmed --> processing: seller/admin prepares
    processing --> shipped: seller/admin ships
    shipped --> delivered: received
    pending --> cancelled: buyer, seller, or admin cancels
    confirmed --> cancelled: buyer, seller, or admin cancels
    processing --> cancelled: seller or admin cancels
    delivered --> refunded: admin/seller refund
    cancelled --> [*]
    delivered --> [*]
    refunded --> [*]
```

- The **seller** (or admin) advances fulfilment states and may cancel through `processing` (`ORDER_STATUS_TRANSITIONS`, app-enforced — the DB trigger itself permits the seller to set any status); the **buyer** may only cancel, and only while `pending`/`confirmed` (`CANCELLABLE_ORDER_STATUSES`, narrower and unchanged by the dashboard's wider window).
- Cancelling from any actor restocks automatically via the `orders_restock_on_cancel` trigger (see Inventory) — it's actor-agnostic by construction.
- `payment_status` transitions are **never** client-driven (server/webhook/manual-verification only), and are **independent** of `order_status` — no constraint or trigger couples them (see TD-9).
- Status changes stamp lifecycle timestamps via triggers.

---

## Folder Architecture

```text
src/
├── app/            Routes ONLY. Route groups: (marketing) (auth) (shop) (account).
│                   Pages orchestrate features; they never import a Supabase client.
├── components/     Shared, business-agnostic UI: ui/ layout/ feedback/ forms/
│                   navigation/ brand/ tables/ charts/.
├── features/       Self-contained domains. Built: auth, products, categories, cart,
│                   landing, account, orders, checkout, payments. Stubs (upcoming):
│                   assistant, dashboard, inventory, notifications, reports.
├── lib/
│   ├── supabase/   client.ts server.ts session.ts queries.ts database.types.ts
│   ├── auth/       permissions.ts
│   ├── cache/      tags.ts
│   ├── utils/      cn, currency, date, format, result
│   └── validations/ common.schema.ts
├── hooks/          useDebouncedValue
├── providers/      AppProviders, QueryProvider
├── services/       Reserved for cross-feature services (placeholder today)
├── config/         env.ts (validated), site.ts
├── constants/      routes, roles, status, query-keys, pagination, database
├── types/          action.types, common.types, pagination.types
└── proxy.ts        Next.js 16 middleware (session refresh + route protection)
```

**Boundary rules** (enforced by convention, checked in review):

- `app/` → may import from `features/`, `components/`, `lib/`, `constants/`. **Never** calls Supabase directly.
- `features/<a>/` → **should not** import from `features/<b>/` internals; share via `lib/`, `components/`, or barrels.
- `components/` → business-agnostic; no Supabase, no Server Actions.
- `lib/supabase/queries.ts` → the **only** module that calls `.from()` / `.rpc()`.

---

## Architecture Evolution Strategy

The code converges toward the SAD **without breaking the build at any step**. Recommended order (mirrors the roadmap in the README):

1. ~~**Introduce `shops` + `shop_users`.**~~ **Foundation done** (`20260813000000_shops_and_shop_users.sql`) — tables, RLS, `is_shop_member()`, and a backfill exist; each `seller` profile has exactly one `shops` row via `shop_users`. `products.shop_id` now exists too (`20260814000000_products_shop_scoping.sql`), consumed by the shop-scoped Products dashboard. **Remaining:** `orders.seller_id` still references `profiles.id` directly — no `shop_id` column on `orders` yet. Add it, update `orders` RLS/`create_order`/`enforce_order_update_rules` to use it, and migrate checkout/cart's per-seller grouping to per-shop, once an Orders dashboard actually needs shop-scoped order data — not speculatively.
2. ~~**Extract `inventory`.**~~ **Done** (`20260815000000_inventory_and_stock_history.sql`) — stock moved from `products.quantity` into a dedicated `inventory` table (`products.quantity` kept as a trigger-synced mirror for backward compatibility); `create_order` is atomic against `inventory` (locks `inventory` rows `FOR UPDATE`, before `products`); an append-only `stock_adjustments` table records every movement; manual changes go through the `adjust_stock` RPC; order cancellation auto-restocks via a trigger. See the Inventory note under [Current Database Mapping](#current-database-mapping-target-vs-current).
3. ~~**Implement Payments (target).** Add `qr_upload` method + receipt storage + manual verification workflow. Drop the now-unused Stripe columns from `payments`.~~ **Done.** See [Payments RPCs](#payments-rpcs-qr-receipt-upload-manual-verification). The Admin/Shop Owner dashboard has since grown well beyond that single page — Products, Inventory, Orders, and now Users/Shops (seller onboarding, `20260816000000_admin_user_shop_management.sql`) are all built (`/dashboard/{products,inventory,orders,users,shops}`), all following the same "RLS is the primary boundary, no manual filtering" pattern for reads, with `SECURITY DEFINER` RPCs reserved for the genuinely cross-user/no-direct-grant writes (and now cross-user **read** aggregation for Reports). Remaining: platform Settings.
4. **Add `recommendation_rules`** and build the rule-based Guided Product Selection engine behind `features/assistant`.
5. ~~**Add `reports` aggregates and build `features/reports`.**~~ **Done** (`20260818000000_reports_analytics_rpcs.sql`) — realised as four read-only `SECURITY DEFINER` aggregation RPCs over existing `orders`/`order_items`/`payments` (no physical `reports` table), a shop/admin-scoped `/dashboard/reports` page, and hand-rolled SVG/CSS charts. See [Reporting RPCs](#reporting-rpcs-analytics-over-existing-orders). Resolves TD-5.

**Guardrails during evolution:**

- Every schema change is a new, idempotent, transactional migration under `supabase/migrations/`.
- Regenerate `database.types.ts` after every schema change.
- Preserve money-as-cents, append-mostly financial rows, and the DEFINER + RLS security model.
- Land each module with `npm run lint` + `npm run typecheck` + `npm run build` green.

---

## Migration Notes

- Migrations live in `supabase/migrations/` and are **transactional** (`begin`/`commit`) and **idempotent**.
- Current migration set:
  1. `20260802000100_initial_schema.sql` — enums, tables, functions, triggers, indexes, RLS.
  2. `20260802160000_security_hardening.sql` — RLS audit remediation (F1–F5).
  3. `20260803000100_rls_hardening.sql` — revoke-all-then-regrant least-privilege pass.
  4. `20260804000000_restore_profiles_column_grants.sql` — re-scope `profiles` SELECT (fix `phone` leak).
  5. `20260804000100_add_get_my_profile.sql` — ensure `get_my_profile()` DEFINER RPC exists.
  6. `20260804000200_add_payments.sql` — `payment_method_type` enum + `payments` table + RLS.
  7. `20260804000300_revoke_create_order_anon_execute.sql` — restrict `create_order` EXECUTE to `authenticated`.
  8. `20260807000000_add_rate_limiting.sql` — `rate_limit_hits` table + `check_rate_limit()` fixed-window RPC.
  9. `20260807010000_evolve_payments_for_qr.sql` — `qr_upload` payment method; drops Stripe-only `payments` columns (resolves TD-3); adds `verified_by`/`verified_at`; renames `receipt_url` → `receipt_path`.
  10. `20260807020000_qr_payment_rpcs.sql` — `submit_qr_payment()`/`verify_payment()` RPCs; narrow `enforce_order_update_rules` fix for seller self-verification.
  11. `20260807030000_payment_receipts_storage.sql` — private `payment-receipts` Storage bucket + RLS (first Storage feature in this repo).
  12. `20260807040000_profiles_payment_qr_url.sql` — seller's receiving QR code (`profiles.payment_qr_url`).
  13. `20260813000000_shops_and_shop_users.sql` — `shops`/`shop_users` tables, `is_shop_member()`, RLS, idempotent backfill (one shop per existing `seller`). `products`/`orders`/`payments` untouched — see TD-1.
  14. `20260814000000_products_shop_scoping.sql` — adds `products.shop_id`, widens `products` RLS to accept shop membership additively; `orders`/`payments` untouched.
  15. `20260815000000_inventory_and_stock_history.sql` — `inventory`/`stock_adjustments` tables + `stock_adjustment_reason` enum, seed/sync/restock triggers, `adjust_stock` RPC, `create_order` replaced to lock/decrement `inventory` instead of `products`, idempotent backfill, column-level `REVOKE UPDATE (quantity)` on `products` for `authenticated`. Resolves TD-2.
  16. `20260816000000_admin_user_shop_management.sql` — `shop_users` gains `unique (user_id)`; new `admin_action_log` table + RLS; `admin_assign_seller_shop`/`admin_list_users` RPCs. No changes to `products`/`orders`/`inventory`/`payments`.
  17. `20260817000000_fix_profiles_payment_qr_url_select_grant.sql` — bug fix: grants `SELECT (payment_qr_url)` to `authenticated`, missing since `20260807040000` added the column with only an `UPDATE` grant. Every query using `ORDER_COLUMNS` (all buyer *and* dashboard order reads) was failing outright with "permission denied for table profiles" until this landed — column-privilege checks apply to every column referenced in a query regardless of row count, so this broke Orders unconditionally, not just QR-code display.
  18. `20260818000000_reports_analytics_rpcs.sql` — Reports & analytics: four read-only `SECURITY DEFINER` aggregation RPCs (`report_sales_summary`/`report_sales_timeseries`/`report_order_status_breakdown`/`report_top_products`) over existing `orders`/`order_items`/`payments`, `EXECUTE` to `authenticated` only, seller/admin scoping re-enforced inside; plus two additive `orders` indexes (`orders_seller_placed_idx`, `orders_placed_at_idx`). No table/enum/RLS/trigger changes to existing objects. Resolves TD-5.
  - *(Drift note: several migrations between `20260819` and `20260927` — product variants, addresses, persistent carts, reviews/wishlist, returns & refunds, the buyer activity feed, the Xendit multi-seller group-payment/recovery/refund series, and the buyer-order-lifecycle view — landed without being itemized above. Consult `supabase/migrations/` for the authoritative, complete, timestamp-ordered set; this list is being reconciled incrementally.)*
  19. `20260928000000_order_shipments.sql` — Seller fulfillment: `order_shipments` table (one per order, `unique (order_id)`, `seller_id` denormalized) + RLS (participants read; seller/admin write; buyer read-only) + `record_order_shipment` RPC (atomic courier/tracking capture + `processing → shipped`, `authenticated`). No enum change; no change to `orders`/`order_items` RLS, `enforce_order_update_rules`, or inventory/payment.
  20. `20260929000000_strict_role_separation.sql` — Strict role separation (DB backstop): only a `buyer` may purchase or persist a cart/wishlist. Adds `current_user_role() = 'buyer'` to `create_order` (covers `create_order_group`, which delegates to it) and to the INSERT `WITH CHECK` of `orders`, `carts`, `cart_items` (+ `cart_items` UPDATE) and `wishlists`. Preserves the self-purchase guard, all pricing/stock/order_items/stock_adjustments logic, and the cart/wishlist SELECT & DELETE policies (no data destroyed). No change to `orders` SELECT/UPDATE RLS, `enforce_order_update_rules`, the `order_status` enum, or inventory/payment logic.
- **Type regeneration** after any schema change:
  ```bash
  npx supabase gen types typescript --project-id <project-id> > src/lib/supabase/database.types.ts
  ```

> [!NOTE]
> `database.types.ts` is currently **hand-written** to mirror the initial migration for the tables in use (`profiles`, `categories`, `products`, `product_images`, `orders`, `order_items`, `payments`). Keep it in lockstep with migrations.

---

## Technical Debt Register

**Policy:** every intentional gap between the current code and the SAD target gets a row here — added in the same PR that introduces or discovers it (see [CONTRIBUTING.md → Documentation update requirements](./CONTRIBUTING.md#documentation-update-requirements)). A row is removed only when the gap is closed, not when it becomes inconvenient to look at. This is the honest ledger — keep it current, and prefer adding a row over silently shipping a workaround.

| # | Item | Impact | Target resolution |
|---|------|--------|-------------------|
| ~~TD-1~~ | ~~`products`, `inventory`, `product_variants`, `stock_adjustments`, `recommendation_rules`, `orders`, `return_requests`, and `order_shipments` all carry `shop_id`~~ | **Resolved** — `orders`/`return_requests`/`order_shipments` gained `shop_id` in `20260927134519_orders_returns_shipments_shop_scoping.sql`, with RLS widening and RPC stamping following in the same batch (`20260927134618`–`20260927135835`). Shop CRUD is now also complete end-to-end, including admin-only permanent delete (`20260928072046_shop_hard_delete_support.sql`). | — |
| ~~TD-2~~ | ~~Inventory is `products.quantity`~~ | **Resolved** — dedicated `inventory`/`stock_adjustments` tables landed in `20260815000000_inventory_and_stock_history.sql`. | — |
| ~~TD-3~~ | ~~Stripe columns on `payments`~~ | **Resolved** — dropped in `20260807010000_evolve_payments_for_qr.sql` when QR payments were built. | — |
| ~~TD-4~~ | ~~No `recommendation_rules` — Guided Selection is a landing preview only~~ | **Resolved** — `recommendation_rules` table + admin/seller rule-authoring UI landed in `20260914000000_recommendation_rules.sql`, and the buyer-facing flow is the `/assistant` page (step-by-step questions, grouped results), matching straight from the catalog via `getGuidedSelectionResults` (ADR-022). Rule-based only, per [ADR-009](./DECISIONS.md#adr-009-rule-based-guided-product-selection-not-ai) — no AI/ML. | — |
| ~~TD-5~~ | ~~No `reports` table / module~~ | **Resolved** — Reports & analytics shipped as four `SECURITY DEFINER` aggregation RPCs over existing `orders`/`order_items`/`payments` (`20260818000000_reports_analytics_rpcs.sql`) + `/dashboard/reports`. No physical `reports` table was modelled by design (derivable data). | — |
| TD-6 | **No test runner** (only `scripts/*.mjs`) | Limited automated regression safety | Add a runner when justified (see CLAUDE.md) |
| TD-8 | **Some platform policy windows are hardcoded** — return window (`RETURN_WINDOW_DAYS` + `interval '7 days'` in the return RPC), unpaid-online-order expiry (`interval '60 minutes'`, changed from 24 hours on 2026-10-22), and guest cart TTL (`GUEST_CART_TTL_MS`). | Admins can't tune these windows without a deploy/migration | Move into `platform_settings` columns read by the RPCs and consumers (business-rule change — needs sign-off) |
| TD-7 | **`roles` as enum**, not a table | Minor divergence from SAD DB list | Model a `roles` table if/when role metadata is needed |
| ~~TD-8~~ | ~~`database.types.ts` hand-written~~ | **Resolved** — the project is provisioned and `database.types.ts` is now regenerated directly from the live Supabase schema (last regenerated 2026-09-17 alongside the Phase 5B `xendit_refunds` migration); regenerate again after every schema change per the Migration Policy. | — |
| ~~TD-9~~ (Xendit side) | ~~A rejected/failed/abandoned Xendit payment does not restock~~ | **Resolved for Xendit, 2026-09-30** — the business-rule question ("does a failed payment also auto-cancel the order?") is decided: yes, after an abandonment threshold (24h originally; shortened to 60 minutes on 2026-10-22 by `20261022150000_shorten_unpaid_order_expiry.sql`). `expire_unpaid_xendit_order` (`20260930040000_expire_unpaid_xendit_orders.sql`) auto-cancels a still-`pending`, still-unpaid, `payment_method = 'xendit'` order once `placed_at` is past the threshold, only after re-confirming with Xendit's real status first (reusing `isStaleXenditAttempt`/`reconcileStaleXenditAttempt`) so an order Xendit still considers payable is never touched. Runs as a second pass in the existing `xendit-reconciliation` cron (now every 15 minutes, `*/15 * * * *`) — no second scheduled job. Goes through the same `order_status = 'cancelled'` transition every other cancellation uses, so `orders_restock_on_cancel` restocks it automatically. | — |
| TD-9 (COD side) | **A COD order that's never confirmed/shipped and never explicitly cancelled still holds stock indefinitely** — COD doesn't have a "failed payment" signal the way Xendit does (there's no payment attempt to reconcile against), so the Xendit auto-expiry above doesn't apply to it. Lower real-world risk than the Xendit case (no payment ambiguity, no webhook race), but the underlying "stock committed at order placement, never auto-released" architecture is the same. | A buyer who places a COD order and the seller never acts on it (or the buyer regrets it and never cancels) can hold stock indefinitely; the seller/admin can always cancel manually from `/admin/orders` or `/seller/orders`, which restocks via `orders_restock_on_cancel` — a manual remedy exists. | Deferred — needs its own business-rule decision (a COD abandonment threshold, if any) before an equivalent auto-expiry is added; not part of the 2026-09-30 Xendit fix |
| TD-10 | **`payment_method_type`'s `'qr_upload'` and `'card'` values are permanent-but-unused** — Postgres enum values cannot be cheaply dropped; both are leftovers from retired flows (QR manual verification per ADR-019, and the Stripe spike per ADR-014) | None functionally — historical `payments` rows keep these values for audit; no live code path ever writes them again | Accepted permanently; not worth a table-rebuild to remove |
| ~~TD-11~~ | ~~Xendit-dashboard-initiated refunds are not reflected back automatically — no `/refunds` webhook handler exists~~ | **Resolved** — `decide_return` now submits real Xendit refunds (GCash/Maya/Card) and a `process_xendit_refund_webhook` RPC (service_role-only, idempotent, mirrors `process_xendit_webhook`) confirms them asynchronously via the `refund.*` webhook family routed in `src/app/api/webhooks/xendit/route.ts`. Landed in `20260921000000_xendit_refunds.sql` + `20260922000000_xendit_refunds_grant_hygiene.sql`. | — |
| TD-12 | **A buyer cannot cancel a single order out of a multi-seller checkout group while it's still "To Pay"** — `OrderCardActions` deliberately hides the Cancel button when `checkoutGroupId` is set (`!isGroup` check). **Updated 2026-09-30:** this is now a UI-only choice, not a technical blocker — `begin_xendit_group_payment_attempt` (`20260927040000_xendit_stale_pending_dedup.sql`) was fixed in `20260927030000_group_payment_retry_partial.sql` to *skip* cancelled members and sum only the still-pending ones, rather than raising `'This order has been cancelled'` for the whole group the instant any one member is cancelled. So a group retry already survives one member being cancelled; only the self-service Cancel button itself is still hidden for a grouped order. | Buyers who want to drop one seller's line item from a multi-seller order have no self-service path — must be handled manually (seller/admin cancels that one order instead); the rest of the group's payment is unaffected | Deferred — the remaining work is UI-only: show the Cancel button for a grouped order and let `cancelBuyerOrder` handle it (no RPC change needed) |
| TD-13 | **`src/app/api/webhooks/xendit/route.ts`'s `referenceId`/`status` extraction doesn't recognize every Card (`payment_session.*`) webhook payload shape Xendit sends** — confirmed live at least twice (payment_session `ps-6ab2412fcdc99285e766685d` and `ps-6ab2814c3589faffa4215ef9`), full findings in `docs/production-card-payment-stuck-audit.md`. Root cause is still unconfirmed because the raw body of a rejected payload was never captured. | A successfully-paid Card order can sit in "To Pay" for hours until the nightly `xendit-reconciliation` cron or the buyer's own stale-attempt retry self-heals it via `reconcileStaleXenditAttempt` — visibility/latency only, **not** a billing-safety issue (both paths call Xendit's real status before touching anything, so no duplicate charge is possible). `log_unrecognized_xendit_webhook_payload` (`20260925015850_log_unrecognized_xendit_webhook_payload.sql`) now persists the raw payload to `payment_webhook_events` (`processing_result = 'unrecognized_payload'`) instead of only `console.error`-ing it, so the next occurrence is diagnosable. | Once a real rejected payload is captured, extend the route's extraction (or add a dedicated shape branch, mirroring `reconcileStaleXenditAttempt`'s `COMPLETED`→`SUCCEEDED` normalization) to handle it |
| TD-14 | **`recommendation_rules` is unused after ADR-022.** The table, its rows and the rule CRUD helpers in `queries.ts` (`listProductRecommendationRules`, `listDashboardRecommendationRules`, `create/update/deleteRecommendationRule`) are no longer read or written by the app. | Drop the table and helpers in a later, separate migration once the automatic matching is confirmed in production. |
| TD-15 | **A successful e-wallet cancellation refund can't be exercised automatically.** Xendit's simulate-payment API supports only VA/OTC/QR, so the test-mode script proves request acceptance, idempotency and the failure/retry path, but a completed GCash/Maya refund needs one manual hosted-page test payment (`docs/cancellation-refunds.md`). The card timeframe shown to buyers (7-14 business days) is an estimate; the issuing bank decides. | Success path verified by hand, not CI | Re-check if Xendit adds e-wallet simulation |
| TD-16 | **A paid COD order cancelled before shipping gets a `refund_due` row, not an automatic payout.** Staff pays the buyer and records it through the existing admin returns UI. | Manual step for rare cases | Out of scope (no payout rail) |

---

### Related documents

- 🧭 **[README.md](./README.md)** — business overview, scope, roadmap, repository map.
- 🤖 **[CLAUDE.md](./CLAUDE.md)** — coding standards, workflow, non-negotiables, Definition of Done.
- 📜 **[DECISIONS.md](./DECISIONS.md)** — architecture decision records (ADRs) behind this design.
- 🗂️ **[MODULES.md](./MODULES.md)** — per-module ownership, status, and files.
- 🛠️ **[CONTRIBUTING.md](./CONTRIBUTING.md)** — migration/PR workflow for changes to this architecture.
- 📋 **[AGENTS.md](./AGENTS.md)** — Next.js 16 framework ground rules.
