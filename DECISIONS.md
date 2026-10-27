# DECISIONS.md — Architecture Decision Records

> [!IMPORTANT]
> **Read this first.** This is the permanent decision log for RoberJ Online Shop. Each record captures a choice that shaped the architecture: why it was made, what alternatives were rejected, and what would justify revisiting it. Decisions here **implement** the business spec in the **Software Architecture Document (SAD)** — they never override it.
>
> See also: [README.md](./README.md) (business context) · [ARCHITECTURE.md](./ARCHITECTURE.md) (resulting design) · [CLAUDE.md → Decision Priority](./CLAUDE.md#decision-priority) (how to weigh new choices).

## How to read this log

Every decision is a numbered ADR with a fixed shape: **Context → Problem → Options Considered → Decision → Consequences → Future Revisit**. Status is one of:

| Status | Meaning |
|--------|---------|
| ✅ **Accepted** | In force; assume it holds unless a newer ADR supersedes it. |
| 🔁 **Superseded** | Replaced by a later ADR (linked). Kept for history. |
| 🧪 **Provisional** | In force but explicitly flagged as a spike/experiment, not committed scope. |

**When to add a new ADR:** whenever a change matches [Definition of Breaking Change](./CLAUDE.md#definition-of-breaking-change), or reverses a principle in [ARCHITECTURE.md → System Design](./ARCHITECTURE.md#system-design). Append — never edit history out of an accepted record; supersede it instead.

## Index

| ID | Decision | Status |
|----|----------|--------|
| [ADR-001](#adr-001-marketplace-scoped-to-three-sibling-shops) | Marketplace scoped to three sibling shops | ✅ Accepted |
| [ADR-002](#adr-002-supabase-as-the-backend-platform) | Supabase as the backend platform | ✅ Accepted |
| [ADR-003](#adr-003-nextjs-app-router-as-the-frontend-framework) | Next.js App Router as the frontend framework | ✅ Accepted |
| [ADR-004](#adr-004-server-actions-instead-of-a-rest-api-layer) | Server Actions instead of a REST API layer | ✅ Accepted |
| [ADR-005](#adr-005-typescript-in-strict-mode-everywhere) | TypeScript in strict mode everywhere | ✅ Accepted |
| [ADR-006](#adr-006-centralized-service-layer-for-all-database-access) | Centralized service layer for all database access | ✅ Accepted |
| [ADR-007](#adr-007-row-level-security-as-the-primary-authorization-boundary) | Row-Level Security as the primary authorization boundary | ✅ Accepted |
| [ADR-008](#adr-008-manual-payment-verification-cod--qr-receipt-no-gateway) | Manual payment verification (COD + QR receipt), no gateway | ✅ Accepted |
| [ADR-009](#adr-009-rule-based-guided-product-selection-not-ai) | Rule-based Guided Product Selection, not AI | ✅ Accepted |
| [ADR-022](#adr-022-guided-selection-matches-straight-from-the-catalog) | Guided Selection matches straight from the catalog (refines ADR-009) | ✅ Accepted |
| [ADR-023](#adr-023-buy-now-checks-out-one-product-directly-add-to-cart-is-validated-and-confirmed) | Buy Now checks out one product directly; Add to Cart is validated and confirmed | ✅ Accepted |
| [ADR-010](#adr-010-feature-first-repository-structure) | Feature-first repository structure | ✅ Accepted |
| [ADR-011](#adr-011-money-stored-as-integer-cents) | Money stored as integer cents | ✅ Accepted |
| [ADR-012](#adr-012-one-order-per-seller-cart-split-at-checkout) | One order per seller; cart split at checkout | ✅ Accepted |
| [ADR-013](#adr-013-guest-cart-is-client-side-only) | Guest cart is client-side only | ✅ Accepted |
| [ADR-014](#adr-014-stripe-integration-is-a-provisional-spike) | Stripe integration is a provisional spike | ⛔ Retired |
| [ADR-015](#adr-015-no-automated-test-runner-yet) | No automated test runner yet | ✅ Accepted (deferred) |
| [ADR-016](#adr-016-reports-as-security-definer-rpcs-over-existing-orders) | Reports as SECURITY DEFINER RPCs over existing orders | ✅ Accepted |
| [ADR-017](#adr-017-oauth-account-linking-trusts-supabases-verified-email-matching-only) | OAuth account linking trusts Supabase's verified-email matching only | ✅ Accepted |
| [ADR-018](#adr-018-wishlist-reviews-and-a-derived-buyer-activity-feed) | Wishlist, Reviews, and a Derived Buyer Activity Feed | ✅ Accepted |
| [ADR-020](#adr-020-authenticated-cart-becomes-database-backed-with-guest-cart-merge-on-sign-in) | Authenticated cart becomes database-backed, with guest-cart merge on sign-in | ✅ Accepted |

---

## ADR-001: Marketplace scoped to three sibling shops

**Status:** ✅ Accepted

**Context:** Three family-run sibling shops each sell finished garments through separate, disconnected channels.

**Problem:** Customers cannot shop across the three businesses in one transaction; owners cannot see a unified view of sales or stock.

**Options Considered:**
1. Build three independent storefronts with shared code (a "shared component library, separate apps" approach).
2. Build an **open, general-purpose multi-vendor marketplace** any shop could join.
3. Build **one marketplace scoped exclusively to the three sibling shops**.

**Decision:** Option 3. The system is a closed, three-shop marketplace — not a general multi-vendor platform.

**Consequences:**
- Simpler onboarding/authorization model: shop membership is fixed and known, not self-service vendor signup.
- No vendor-approval workflow, marketplace fees, or multi-tenant billing needed.
- Explicitly ruled out of scope in the SAD and reiterated in [README.md → Out of Scope](./README.md#out-of-scope).

**Future Revisit:** If the business expands beyond the three shops, this decision must be revisited before onboarding a fourth seller — it affects RBAC, the (target) `shops`/`shop_users` model, and reporting.

---

## ADR-002: Supabase as the backend platform

**Status:** ✅ Accepted

**Context:** The system needs authentication, a relational database, row-level authorization, and file storage, built by a small team on a capstone timeline.

**Problem:** Hand-rolling auth, an API server, and storage would consume the majority of the project's time budget and its own attack surface.

**Options Considered:**
1. Custom Node/Express API + a managed Postgres instance + a separate auth provider (e.g. NextAuth) + S3-compatible storage.
2. **Supabase** (Auth + PostgreSQL + Storage + RLS) as a single, integrated backend.
3. A headless CMS / low-code backend (Firebase, Xano).

**Decision:** Option 2 — Supabase. It gives Postgres (not a proprietary document store), native Row-Level Security enforced at the database, first-class Next.js SSR support (`@supabase/ssr`), and Storage in one platform.

**Consequences:**
- Authorization can be enforced **in the database**, not only in application code (see [ARCHITECTURE.md → RBAC Model](./ARCHITECTURE.md#rbac-model)).
- The team writes SQL migrations and `SECURITY DEFINER` functions directly — real Postgres skills, not a vendor-specific query language.
- Vendor dependency on Supabase's managed platform; self-hosting Supabase is possible but not currently planned.

**Future Revisit:** If self-hosting or a different cloud vendor becomes a requirement, migration cost centers on Auth (user store) and Storage (file URLs), not the relational schema itself (plain Postgres).

---

## ADR-003: Next.js App Router as the frontend framework

**Status:** ✅ Accepted

**Context:** The team needs server-rendered pages, layouts shared across route groups, and a natural home for server-side data fetching.

**Problem:** A client-only SPA would push all data fetching and auth checks to the browser, hurting both performance and security (RLS alone is not a substitute for not shipping data the client shouldn't see).

**Options Considered:**
1. Client-rendered SPA (Vite + React Router) calling a separate API.
2. Next.js **Pages Router**.
3. Next.js **App Router** (Server Components, layouts, route groups, Server Actions).

**Decision:** Option 3 — Next.js 16 App Router.

**Consequences:**
- Route groups (`(marketing)`, `(auth)`, `(shop)`, `(account)`) give each area its own layout without affecting the URL.
- Server Components fetch data server-side by default, keeping secrets and heavy queries off the client.
- The project inherits Next.js 16's renamed conventions (e.g. `proxy.ts` instead of `middleware.ts`) — see [AGENTS.md](./AGENTS.md); contributors must not assume older Next.js knowledge applies unchecked.

**Future Revisit:** Re-evaluate only on a major Next.js version bump with breaking App Router changes; see [CLAUDE.md → Migration Policy](./CLAUDE.md#migration-policy) for the general upgrade discipline.

---

## ADR-004: Server Actions instead of a REST API layer

**Status:** ✅ Accepted

**Context:** The app needs mutations (place order, update profile, sign in) and some protected reads, callable from forms and client components.

**Problem:** Standing up and versioning a separate REST/GraphQL API layer duplicates validation and auth logic that Server Actions can colocate with the UI.

**Options Considered:**
1. A separate REST API (Next.js Route Handlers under `/api/*` or an external service).
2. GraphQL with a resolver layer.
3. **Server Actions** (`"use server"` functions) called directly from forms/components.

**Decision:** Option 3. Server Actions are RoberJ's API layer. Every action follows one shape: Zod validation → `requireSessionUser`/`requireRole` → delegate to the service layer → `revalidatePath` → return `ActionResult<T>`. See [ARCHITECTURE.md → API Conventions](./ARCHITECTURE.md#api-conventions).

**Consequences:**
- No separate API versioning or client-generated SDK to maintain.
- Actions are not directly callable by third parties — acceptable, since the SAD defines no external API consumers.
- The PKCE auth callback (`src/app/auth/callback/route.ts`) is the one necessary **Route Handler**, because OAuth/email-link redirects require a plain HTTP endpoint.

**Future Revisit:** If a future requirement needs a public/partner API (e.g. a mobile app or third-party integration), introduce versioned Route Handlers alongside Server Actions rather than replacing them.

---

## ADR-005: TypeScript in strict mode everywhere

**Status:** ✅ Accepted

**Context:** The system spans database rows, domain models, form input, and UI props — many opportunities for silent type mismatches (e.g. cents vs. dollars, snake_case vs. camelCase).

**Problem:** A dynamically typed codebase would push these mismatches to runtime, in a system that handles orders and money.

**Options Considered:**
1. JavaScript with JSDoc typing.
2. TypeScript in default/loose mode.
3. **TypeScript in `strict` mode**, with generated/hand-maintained Supabase types.

**Decision:** Option 3. `tsconfig.json` is strict; `database.types.ts` types every table; domain types in each feature keep camelCase models distinct from snake_case rows.

**Consequences:**
- Row→domain mapping (`toProduct`, `toOrder`, `toProfile` in `queries.ts`) is mandatory, not optional — it's where the type boundary is crossed deliberately.
- `npm run typecheck` (`tsc --noEmit`) is a required gate before any change is considered done (see [CLAUDE.md → Definition of Done](./CLAUDE.md#definition-of-done)).
- No `any` escapes or ignored errors are permitted (see [CLAUDE.md → AI Non-Negotiable Rules](./CLAUDE.md#ai-non-negotiable-rules)).

**Future Revisit:** N/A — this is a permanent standard, not a phase-specific choice.

---

## ADR-006: Centralized service layer for all database access

**Status:** ✅ Accepted

**Context:** Multiple features (products, orders, checkout, account) all need overlapping reads (e.g. "current user", "product by slug") and consistent error handling.

**Problem:** If every feature queries Supabase directly, query patterns, column selections, and error mapping drift and duplicate across the codebase.

**Options Considered:**
1. Each feature calls Supabase directly from its own `actions/` file.
2. A repository-per-table pattern with many small service files.
3. **One centralized service module**, `src/lib/supabase/queries.ts`, that owns every `.from()`/`.rpc()` call.

**Decision:** Option 3. `queries.ts` is the single data-access layer: literal column-select strings (for type inference), row→domain mappers, `cache()`-wrapped shared reads, and the auth helper functions.

**Consequences:**
- Easy to audit "everywhere the database is touched" — one file, one search.
- The file is large by design; it is deliberately organized into clearly commented sections (Products, Categories, Orders, Profile, Auth) rather than split prematurely.
- Features never import a Supabase client directly — enforced by convention and code review (see [CLAUDE.md → Folder Responsibilities](./CLAUDE.md#folder-responsibilities)).

**Future Revisit:** If `queries.ts` grows unmanageable, split by domain (e.g. `queries/products.ts`, `queries/orders.ts`) re-exported from a barrel — a mechanical refactor, not an architecture change. Track as debt first (see [ARCHITECTURE.md → Technical Debt Register](./ARCHITECTURE.md#technical-debt-register)) rather than doing it speculatively.

---

## ADR-007: Row-Level Security as the primary authorization boundary

**Status:** ✅ Accepted

**Context:** Four roles (Guest, Customer, Shop Owner, Administrator) need different read/write access to the same tables, and application-layer checks alone can be bypassed by a bug or a direct API call.

**Problem:** Relying solely on `requireRole()` checks in Server Actions means a single missed check anywhere leaks data or allows an unauthorized write.

**Options Considered:**
1. Application-layer checks only (guards in Server Actions).
2. Application-layer checks **plus** database-level **Row-Level Security (RLS)** policies as the backstop.
3. A separate authorization microservice.

**Decision:** Option 2 — defense in depth, with **RLS as the primary boundary** and everything else (route guards, layout checks, service-layer guards) as additional layers. See [ARCHITECTURE.md → RBAC Model](./ARCHITECTURE.md#rbac-model).

**Consequences:**
- Even a missed `requireRole()` call cannot leak data the database itself won't return.
- `SECURITY DEFINER` helper functions (`current_user_role()`, `is_admin()`) are required to avoid infinite recursion when RLS policies need to read `profiles.role`.
- Every new table **must** ship RLS policies in the same migration that creates it — never left open "temporarily."

**Future Revisit:** N/A — this is a permanent security principle. Any table without RLS is a defect, not a shortcut.

---

## ADR-008: Manual payment verification (COD + QR receipt), no gateway

**Status:** ⛔ Superseded by **ADR-019** (Xendit Online Payment). QR/manual-verification is removed from the active checkout flow; every historical `qr_upload` payment row and receipt is preserved for audit — see ADR-019.

**Context:** The SAD explicitly scopes payments to **Cash on Delivery** and **QR receipt upload**, verified manually — no payment gateway or courier API.

**Problem:** Payment gateways (Stripe, PayPal, etc.) add compliance surface, transaction fees, and integration complexity disproportionate to a three-shop capstone marketplace whose customers largely pay COD or via local bank/e-wallet QR transfer.

**Options Considered:**
1. Integrate a payment gateway (Stripe) for card payments.
2. **Manual verification**: buyer chooses COD, or uploads a QR-transfer receipt image; an admin/shop owner manually confirms payment.
3. No payment tracking at all (trust-based).

**Decision:** Option 2, per the SAD. This is the **official, committed payment path** for the capstone. **Implemented**: `submit_qr_payment`/`verify_payment` RPCs (see [ARCHITECTURE.md → Payments RPCs](./ARCHITECTURE.md#payments-rpcs-qr-receipt-upload-manual-verification)), the private `payment-receipts` Storage bucket, and the verification queue at `/admin/payments` (Admin) and `/seller/payments` (Shop Owner).

**Consequences:**
- No PCI compliance burden; no gateway fees; no external payment API dependency.
- Payment confirmation has a human-in-the-loop step and corresponding `pending → paid` transition, owned by staff (seller of the order, or admin — not automated).
- Receipt images live in Supabase Storage with the access policy this ADR specified: buyer can upload/view own; shop owner/admin can view; no public access.

**Future Revisit:** If transaction volume outgrows manual verification, revisit — but this is explicitly **out of scope** for the current capstone (see [README.md → Future Enhancements](./README.md#future-enhancements)). See also **ADR-014** for the (now-retired) Stripe spike, which was never this decision.

---

## ADR-009: Rule-based Guided Product Selection, not AI

**Status:** ✅ Accepted

**Context:** Customers currently ask shop staff for manual recommendations, slowing the ordering process.

**Problem:** An AI/LLM-based recommendation engine would add nondeterminism, hosting cost, and a much larger testing/maintenance surface than a small capstone marketplace needs — and the SAD explicitly does not call for it.

**Options Considered:**
1. An AI/ML-based recommendation system (embeddings, LLM prompting).
2. **A rule-based engine**: explicit, human-authored conditions (category, price range, tags, stated preferences) mapped to product suggestions.
3. No guided selection; keep it fully manual.

**Decision:** Option 2, per the SAD. Guided Product Selection is **rule-based**, full stop.

**Consequences:**
- Rules are deterministic, explainable, and testable without a model-evaluation harness.
- The `recommendation_rules` table (see [ARCHITECTURE.md → Target Database Schema](./ARCHITECTURE.md#target-database-schema)) is implemented with explicit typed columns (`occasion`, `size`, optional `variant_id`), not the SAD's indicative `jsonb conditions` blob — same rationale as `products`/`orders` already preferring real columns. `features/assistant` now has admin/seller rule authoring and a buyer-facing quiz (`GuidedSelectorQuiz`); the landing page's `SmartAssistantPreview` opens the real quiz instead of showing a cosmetic chat demo. *(Update, 27 Oct 2026: the quiz dialog became the step-by-step `/assistant` page; matching itself moved to the catalog under ADR-022.)*
- Any AI/LLM approach is explicitly **out of scope** and must not be introduced without a new ADR superseding this one.

**Future Revisit:** Only via explicit SAD amendment — this is a business-scope decision, not a technical preference.

---

## ADR-010: Feature-first repository structure

**Status:** ✅ Accepted

**Context:** The system has many business domains (auth, products, cart, checkout, orders, account, …) that each need their own components, actions, schemas, and types.

**Problem:** A purely technical layering (`components/`, `actions/`, `types/` each holding everything, regardless of domain) makes it hard to find or reason about "everything related to checkout."

**Options Considered:**
1. Technical layering: top-level `components/`, `hooks/`, `actions/` folders shared across all domains.
2. **Feature-first**: each domain owns a self-contained folder (`src/features/<name>/{actions,components,hooks,schemas,types,constants}`), with a thin shared layer (`src/components`, `src/lib`) for cross-cutting UI and utilities.
3. A monorepo with separate packages per domain.

**Decision:** Option 2. See the full anatomy in [README.md → Folder Structure](./README.md#folder-structure) and boundary rules in [ARCHITECTURE.md → Folder Architecture](./ARCHITECTURE.md#folder-architecture).

**Consequences:**
- New contributors (and AI assistants) can scope a task to one `features/<name>/` folder with high confidence.
- Reserved-but-unbuilt modules (`assistant`, `dashboard`, `inventory`, `notifications`, `reports`) are scaffolded consistently, signaling committed future shape rather than ad hoc placeholders.
- Requires discipline to avoid one feature reaching into another's internals — enforced by convention (see [CLAUDE.md → Module Boundaries](./CLAUDE.md#module-boundaries)), not by a build-time boundary tool.

**Future Revisit:** If cross-feature coupling becomes a recurring problem, consider adding an import-boundary lint rule (e.g. `eslint-plugin-boundaries`) — a tooling addition, not a structural change.

---

## ADR-011: Money stored as integer cents

**Status:** ✅ Accepted

**Context:** Orders, products, and payments all involve currency amounts that must never silently lose precision.

**Problem:** Floating-point currency math (`price: 19.99`) accumulates rounding errors and is a well-known source of financial bugs.

**Options Considered:**
1. Floating-point decimal columns (`numeric`/`float`).
2. **Integer minor units** (`price_cents`, `total_cents`), converted to display currency only at the UI edge.
3. A dedicated money/decimal library type throughout.

**Decision:** Option 2. Every monetary column is suffixed `_cents` and stored as an integer; `src/lib/utils/currency.ts` handles formatting for display.

**Consequences:**
- No floating-point rounding bugs in totals, subtotals, or refunds.
- Every new monetary field must follow the same convention — deviation is a code-review blocker.
- Multi-currency support (`currency` column, default PHP) is possible without changing the storage strategy.

**Future Revisit:** N/A — permanent convention.

---

## ADR-012: One order per seller; cart split at checkout

**Status:** ✅ Accepted

**Context:** A single cart can hold products from multiple shops (per [ADR-001](#adr-001-marketplace-scoped-to-three-sibling-shops) and the SAD's unified-cart requirement).

**Problem:** A single order row spanning multiple shops complicates fulfillment (each shop ships independently), payment reconciliation, and RLS (which shop's staff can see which line?).

**Options Considered:**
1. One order row containing line items from multiple shops.
2. **One order per seller**: checkout groups the cart by seller/shop and creates one order per group, each with its own status and payment record.
3. Separate carts per shop from the start (rejected — breaks the "one cart" requirement).

**Decision:** Option 2. `groupCartBySeller` (in `features/checkout/utils`) partitions the cart before order creation; the `create_order` RPC enforces **single-seller, single-currency** per call.

**Consequences:**
- Each shop owner sees and manages exactly their own orders — a natural fit for RLS.
- A customer's single checkout can produce multiple order records (one per shop involved) — this must be surfaced clearly in the UI (e.g. "3 orders placed"), not hidden.
- Order-level reporting/analytics must aggregate across the customer's related orders when a "purchase session" view is needed.

**Future Revisit:** If a "parent order" / "cart session" grouping entity is later needed for customer-facing UX, add it as a thin view over existing per-seller orders rather than merging them.

---

## ADR-013: Guest cart is client-side only

**Status:** ✅ Accepted

**Context:** Guests (SAD role) can browse and are expected to be able to build a cart before registering/logging in.

**Problem:** A server-persisted cart for anonymous users requires either session-tied anonymous accounts or device fingerprinting — both add complexity for a capability that's inherently ephemeral until checkout.

**Options Considered:**
1. Server-side cart tied to an anonymous session cookie.
2. **Client-side cart**: React `useReducer` + Context, persisted to `localStorage`, committed to the database only at checkout (which requires authentication).
3. No guest cart; require login before adding to cart.

**Decision:** Option 2. `/cart` is intentionally **excluded** from `PROTECTED_ROUTE_PREFIXES` — it's public by design.

**Consequences:**
- Zero server storage cost for abandoned carts.
- Cart contents are lost if the user clears browser storage or switches devices before checkout — an accepted tradeoff, not a bug.
- Checkout is the enforcement point: `PROTECTED_ROUTE_PREFIXES` includes `/checkout`, so committing a cart to an order always requires an authenticated Customer.

**Future Revisit:** ~~If cross-device cart persistence becomes a requirement, add a server-synced cart for authenticated users only, without changing the guest experience.~~ **Acted on — see [ADR-020](#adr-020-authenticated-cart-becomes-database-backed-with-guest-cart-merge-on-sign-in).** The decision above still holds exactly as written for guests — nothing about the guest experience changed; ADR-020 only adds a database-backed cart for *authenticated* users.

---

## ADR-014: Stripe integration is a provisional spike

**Status:** ⛔ Retired — spike removed, not adopted

**Context:** The SAD's official payment path is COD + QR receipt upload with manual verification ([ADR-008](#adr-008-manual-payment-verification-cod--qr-receipt-no-gateway)). The codebase previously contained a working Stripe integration (`stripe.actions.ts`, `StripePaymentFlow.tsx`, `lib/stripe.ts`, `scripts/e2e-stripe.mjs`), gated behind optional env keys.

**Problem:** Document this honestly: is Stripe the payment system, or an experiment that happened to get committed?

**Options Considered:**
1. Treat Stripe as the real, sanctioned payment path (would require amending the SAD).
2. Treat Stripe as a provisional spike — useful exploration, not official scope — and keep building the target COD/QR path.
3. **Delete the Stripe code once its absence stops being a regression.**

**Decision:** Option 3 (superseding the original Option 2 decision below, kept for history). The spike surfaced a real gap during audit: it had no webhook/callback to ever move `payment_status` out of `pending`, so a "successful" card payment never recorded as paid in the DB — worse than merely provisional, it was silently misleading. Rather than build the missing webhook for code that was never sanctioned scope, the Stripe code (`stripe.actions.ts`, `StripePaymentFlow.tsx`, `lib/stripe.ts`, `scripts/e2e-stripe.mjs`, the Stripe npm packages, and the Stripe env vars) was removed. Checkout now offers COD only. The `payments` table's Stripe-specific columns (`provider_transaction_id`, `stripe_event_id`, `charge_id`, …) remain in the schema — a DB migration to drop them is a separate, deliberate decision, not bundled into this removal (see [ARCHITECTURE.md → Technical Debt Register (TD-3)](./ARCHITECTURE.md#technical-debt-register)).

<details>
<summary>Original decision (superseded, kept for history)</summary>

Original decision: Option 2. The Stripe code stayed in the repo (real, working code; removing it would destroy information), explicitly labeled **not the official capstone path** everywhere it was referenced.

**Consequences (at the time):**
- `src/config/env.ts` made Stripe keys optional; `getStripe()` failed clearly instead of booting broken; Checkout's Card option was hidden automatically via `isStripeConfigured` when unset.
- New payments work was directed to build the **target** COD/QR flow, not extend the Stripe branch.

</details>

**Future Revisit:** A new ADR would be required to formally adopt a payment gateway (requires SAD amendment / stakeholder sign-off) — this ADR does not preclude that, it only closes the unsanctioned spike.

---

## ADR-015: No automated test runner yet

**Status:** ✅ Accepted (deferred, not rejected)

**Context:** The project has no Jest/Vitest/Playwright/RTL installed. The only automated verification is a Node script (`scripts/e2e-flow.mjs`; the former `scripts/e2e-stripe.mjs` was removed with the Stripe spike, ADR-014) plus `lint`/`typecheck`.

**Problem:** Should the team invest in a test framework now, mid-capstone, or continue relying on manual verification plus typecheck/lint/build?

**Options Considered:**
1. Adopt a full test framework (Vitest + Testing Library + Playwright) immediately.
2. **Defer**: rely on strict TypeScript, ESLint, `tsc --noEmit`, and scripted E2E flows, and require every change to be manually exercised (see [CLAUDE.md → Testing Expectations](./CLAUDE.md#testing-expectations)); revisit once core modules stabilize.
3. Skip automated testing indefinitely.

**Decision:** Option 2. This is a **deliberate, temporary** choice, not an oversight — recorded here specifically so it isn't silently "fixed" by introducing a framework without discussion (which [CLAUDE.md → AI Non-Negotiable Rules](./CLAUDE.md#ai-non-negotiable-rules) already flags: no new libraries without clear value and approval).

**Consequences:**
- Regression risk is currently mitigated by strict typing + RLS (data-integrity bugs are often caught at the database layer) + manual flow verification, not by a regression suite.
- Tracked as technical debt (TD-6 in [ARCHITECTURE.md](./ARCHITECTURE.md#technical-debt-register)).

**Future Revisit:** Once Checkout (current phase) and Payments (target) stabilize, introduce Vitest for the service layer (`queries.ts` mappers, pure utils) and Playwright for the checkout/order critical path — the highest-value, lowest-effort starting point. Requires a new ADR before adding the dependency.

---

## ADR-016: Reports as SECURITY DEFINER RPCs over existing orders

**Status:** ✅ Accepted

**Context:** The SAD lists a `reports` entity and requires sales/operational analytics for Shop Owners (own shop) and the Administrator (platform-wide). The data needed already lives in `orders`/`order_items`/`payments`. Reporting requires GROUP BY / date bucketing / SUM that PostgREST does not express well, and must be computed server/DB-side, correctly scoped per shop.

**Problem:** Where do report aggregates live and run — a physical/materialized `reports` table, plain PostgREST aggregate reads relying on RLS, or SQL functions?

**Options Considered:**
1. A stored `reports` table (or materialized views) populated by triggers/jobs — duplicates derivable data and adds write paths + staleness to keep in sync.
2. Plain PostgREST aggregate queries under RLS — but Supabase aggregate functions are limited/often disabled, GROUP BY + timezone bucketing is awkward, and the per-row `EXISTS` in `order_items`/`payments` RLS is costly at scale.
3. **Read-only `SECURITY DEFINER` RPCs** that aggregate over the existing tables and re-enforce seller/admin scoping internally (the same chokepoint pattern as `create_order`/`verify_payment`/`adjust_stock`).

**Decision:** Option 3. Four RPCs — `report_sales_summary`/`report_sales_timeseries`/`report_order_status_breakdown`/`report_top_products` (`20260818000000_reports_analytics_rpcs.sql`). No physical `reports` table. Consequential sub-decisions:
- **Single date axis:** every metric buckets on `placed_at` in **`Asia/Manila`** (the PHP business timezone) for consistent date handling across all metrics.
- **Revenue = `payment_status = 'paid'`** (the confirmed-revenue source of truth covering both COD and QR); count/volume metrics include all placed orders. Never sum `payments.amount_cents` directly (COD orders have no payment row; an order may have several).
- **Charts are hand-rolled SVG/CSS** in `src/components/charts` — no charting dependency added (honours [CLAUDE.md → AI Non-Negotiable Rules](./CLAUDE.md#ai-non-negotiable-rules)).

**Consequences:**
- Zero schema duplication and no aggregate staleness — numbers are always live. Scoping is defence-in-depth: the RPC re-checks `seller_id = auth.uid() OR is_admin()` (DEFINER bypasses RLS), `EXECUTE` is `authenticated`-only, and a seller's `p_shop_id` is ignored so scope can't be widened.
- Admin per-shop filtering maps shop→seller via `shop_users` because `orders` has no `shop_id` yet (TD-1); an `orders.shop_id` bridge would simplify this later.
- Two additive `orders` indexes back the date-range scans. Verified against seeded data (in rolled-back transactions) that seller/admin numbers match independent ground-truth aggregates. Resolves [ARCHITECTURE.md TD-5](./ARCHITECTURE.md#technical-debt-register).

---

## ADR-017: OAuth account linking trusts Supabase's verified-email matching only

**Status:** ✅ Accepted

**Context:** Adding Google/Facebook sign-in (Module 1, Authentication) requires deciding when a Google/Facebook sign-in should land in an existing email/password account versus create a new one. The obvious-looking approach — "if the email string matches, it's the same person" — is exactly the mistake Supabase Auth's own documentation warns against: an OAuth provider that doesn't verify email ownership could let an attacker claim someone else's email and get folded into their real account (a pre-account-takeover attack). Facebook, specifically, does not reliably mark its email claim as verified, and can omit email entirely depending on the user's Facebook settings and the permissions granted.

**Problem:** Where does "same person, different sign-in method" get decided, and on what evidence?

**Options Considered:**
1. Implement our own matching in `handle_new_user()` or a Server Action: look up `profiles`/`auth.users` by email and attach the new identity if found.
2. **Trust Supabase Auth's (GoTrue's) built-in automatic identity linking**, which only links a new OAuth identity to an existing user when that identity's email is provider-verified, and never touches `handle_new_user()`'s job (GoTrue decides account identity before our trigger's `AFTER INSERT ON auth.users` even fires) — plus Supabase's manual-linking API (`linkIdentity()`), gated on the user already being authenticated, as the safe fallback for cases automatic linking can't cover.
3. Always create a new account per provider and never link anything, leaving merging entirely to the user's memory of which method they used.

**Decision:** Option 2. `handle_new_user()` (`20260819000200_oauth_profile_metadata_coalesce.sql`) only widens which `raw_user_meta_data` keys it reads (Facebook uses `name`/`picture` instead of Google's `full_name`/`avatar_url`) — it adds no email-matching logic. Google reliably auto-links (its email is always provider-verified). Facebook auto-links only when Facebook itself confirms the email; when it can't, sign-in still succeeds but creates a separate account, by design — the user recovers via **Connected Accounts** (`/profile`, `features/account/components/ConnectedAccounts.tsx`), which uses `linkIdentity()` while the user is already signed into their primary account, the only point at which "same person" is actually proven rather than guessed.

**Consequences:**
- No app code anywhere performs email-based account matching — the entire trust decision lives in Supabase Auth, upstream of every layer this app controls, so there is nothing here to audit for that specific vulnerability class.
- A user whose Facebook sign-in didn't qualify for auto-linking gets a second account until they manually connect it. This is a real, user-visible rough edge, not swept under the rug — the sign-in UI captions this expectation, and the callback/error mapping (`mapOAuthCallbackError`) gives Facebook-specific failures a distinct message.
- Manual linking does not retroactively merge an already-created duplicate account's order history into the primary account — that would require a manual admin data migration, out of scope here (see MODULES.md → Authentication → Future Work).
- Requires **Authentication → Enable Manual Linking** turned on in the Supabase dashboard (off by default) for Connected Accounts to function at all.

**Future Revisit:** If report volume grows enough to matter, revisit materialized aggregates or an `orders.shop_id` column — neither is needed at current scale.

---

## ADR-018: Wishlist, Reviews, and a Derived Buyer Activity Feed

**Status:** ✅ Accepted

**Context:** The original capstone scope ([README.md → Future Enhancements](./README.md#future-enhancements)) explicitly deferred product reviews/ratings, wishlists, and realtime notifications, pending explicit approval — kept out to keep the initial build focused on the core three-shop purchase journey. A subsequent buyer/guest UX audit (browse → cart → checkout → COD/QR → fulfilment) found that journey complete, and identified these three specific buyer-trust and convenience features as high-value, low-complexity additions that require none of the infrastructure the SAD actually excludes (no payment gateway, no courier API, no messaging system, no realtime subsystem).

**Problem:** Should RoberJ add wishlist, reviews/ratings, and a notification mechanism — and if so, in a form that doesn't compromise the project's curated three-shop scope or the hardened invariants in `create_order`, `verify_payment`, `submit_qr_payment`, and the order-status trigger chain?

**Options Considered:**
1. Adopt full-featured versions of each (photo/video reviews, Q&A, wishlist sharing, realtime push notifications), matching a general-marketplace reference implementation.
2. Defer all three indefinitely, per the original Future Enhancements list.
3. Adopt deliberately minimal versions: wishlist as a plain user-owned join table; reviews gated by verified purchase through a `SECURITY DEFINER` RPC, one review per order item, a dynamically computed rating aggregate; notifications as a read-only feed derived from existing order/payment timestamps, with no new table, no triggers, and no realtime infrastructure.

**Decision:** Option 3.
- **Wishlist** — `wishlists(user_id, product_id)`, RLS-scoped directly to `auth.uid()` on INSERT/SELECT/DELETE, no RPC. This is the first plain user-owned CRUD table in this schema (every other user-owned write goes through a `SECURITY DEFINER` RPC); justified because, unlike orders/inventory/payments, there is no cross-entity invariant to protect — RLS alone gives the same guarantee an RPC would.
- **Reviews** — `reviews` table, one row per `order_item_id` (`unique`), publicly readable, but writes go only through a new `submit_review` `SECURITY DEFINER` RPC that re-verifies `buyer_id = auth.uid()` and `order_status = 'delivered'` inside the function — never trusts RLS alone, mirroring `submit_qr_payment`/`verify_payment`. Reviewer display name is snapshotted into the row at submission time (`profiles` RLS does not allow buyer-to-buyer visibility, so a live join is not available — this mirrors how `order_items` already snapshots `product_title`/`unit_price_cents`). The rating average/count is computed on read; it is never denormalized onto `products`.
- **Notifications** — a `get_buyer_activity_feed` read-only `SECURITY DEFINER` RPC, structurally identical to the existing `report_*` RPCs, unioning `orders.placed_at/paid_at/shipped_at/delivered_at/cancelled_at` and `payments.created_at/verified_at`, scoped to the caller. No new table. No triggers added anywhere. `create_order`, `verify_payment`, `submit_qr_payment`, `enforce_order_update_rules`, and `track_order_status_timestamps` are unmodified. No Supabase Realtime, no push/email/SMS infrastructure.
- **Shop identity** — as part of the same improvement phase, `shops` gains one additive public-read RLS policy (active shops readable by `anon`/`authenticated`) so buyer-facing surfaces (PDP "Sold by," shop filter, Featured Shops) can resolve a real shop name via `products.seller_id → shop_users.user_id → shop_id → shops.name`, since `products.shop_id` itself is not populated on any live row yet (TD-1 is still open).

**Consequences:**
- Buyer trust/convenience features land without expanding the payment, courier, or messaging surface the SAD explicitly excludes.
- Reviews require verified purchase — no anonymous or unverifiable review is possible, without needing a moderation subsystem.
- *(Update, 29 Oct 2026, migration `20261029000000_reviews_replies_moderation_demo.sql`.)* Real reviews still require a delivered purchase. Added: one seller reply per review (`reply_to_review`, shop members only), buyer edits within 30 days (`update_review`), admin hide/show with a reason (`admin_set_review_hidden`, audit-logged), a `variant_label` snapshot of what was bought, and first-name-plus-initial display. Demo reviews (`is_demo`) exist only for presentations: no order or buyer behind them (enforced by a check constraint), never "verified", never sent to search engines, shown only while `platform_settings.demo_content_enabled` is on, each tagged "Sample", and removable in one admin call. A presenter-only, untagged variant (`20261029010000`) was tried and reverted by `20261029020000` at the client's request: the tag stays. They never touch sales, stock or sold counts.
- The activity feed cannot represent "confirmed" or "processing" as discrete events, because no column captures those transitions (`orders` only stamps `paid_at`/`shipped_at`/`delivered_at`/`cancelled_at`). This is an accepted, documented limitation, not an oversight.
- Wishlist introduces the first plain-RLS (non-RPC-gated) user-owned write path in this schema. Future user-owned-data features should default to this lighter pattern only when no cross-entity invariant is at stake, and to the RPC pattern otherwise.
- The new `shops` public-read policy is additive only; existing `is_shop_member(id) OR is_admin()` read/write policies on `shops` are untouched, and inactive shops remain invisible to `anon`/`authenticated`.
- [README.md → Future Enhancements](./README.md#future-enhancements) is updated accordingly — "Product reviews and ratings" and "wishlists" are removed from the deferred list; "Realtime notifications" remains deferred, since what's built here is explicitly not that.

**Future Revisit:** If review volume or spam becomes a problem, revisit rate-limiting `submit_review` via the existing `check_rate_limit` RPC/`rate_limit_hits` table (already used elsewhere), or a lightweight moderation flag — deliberately not built now. If buyers need an unread badge or push delivery for the activity feed, revisit the optional `profiles.activity_last_seen_at` column path raised during the improvement-phase audit — deliberately deferred to keep v1 a zero-schema-change feature. If `products.shop_id` is later fully backfilled (closing TD-1), the shop-identity joins added here should switch from the `shop_users` bridge to `products.shop_id` directly.

---

## ADR-019: Xendit Online Payment (GCash, Maya, Card), superseding ADR-008's "no gateway" stance

**Status:** ✅ Accepted (sandbox/test-mode implementation)

**Context:** ADR-008 committed to COD + manual QR-receipt verification, explicitly ruling out a payment gateway for the capstone. That decision is being revisited: the platform now needs real-time online payment (GCash, Maya, Card) alongside COD, with payment confirmation that isn't dependent on a human checking a receipt image.

**Problem:** How to add a payment gateway without violating this codebase's existing non-negotiables — `orders.payment_status` must never be settable by the client or the frontend redirect alone; historical payment data must not be destroyed; the existing `payments`-table chokepoint pattern (`create_order`, `submit_qr_payment`/`verify_payment` before it) must be preserved; and the change must not introduce seller payouts, platform commission, or real-money settlement, since this is a sandbox/test-mode implementation.

**Options Considered:**
1. Xendit's hosted Invoices page (one redirect covering all channels) — simplest, but a full-page redirect to Xendit's own domain for every method, including Card.
2. **Direct Xendit APIs**: `v3/payment_requests` for GCash/Maya (redirect-based, channel-specific), and a Xendit Payment Session (`mode=COMPONENTS`) + the `xendit-components-web` client package for Card (embedded, PCI-safe — raw card data never reaches this server).
3. Full PCI-DSS Level 1 "raw PAN" integration (card details posted directly to our server) — rejected outright; disproportionate compliance burden for a sandbox capstone.

**Decision:** Option 2. Confirmed against Xendit's own documentation across multiple verification passes (not assumed from training data) — see the implementation's own audit trail for the specific corrections made along the way (e.g., Card genuinely needs the Components/Session flow, not a plain tokenized `payment_requests` call).

**Non-negotiables, enforced structurally, not just by convention:**
- **The Xendit webhook (`POST /api/webhooks/xendit`) is the only path by which a payment can become `paid`.** It verifies `x-callback-token` before any DB write, then delegates to `process_xendit_webhook` — a `SECURITY DEFINER` RPC whose `EXECUTE` grant is `service_role`-only (confirmed absent from the `anon`/`authenticated`-executable advisor list after implementation). No Server Action, redirect handler, or return page ever writes `paid`.
- **Idempotent by construction, not by convention**: `begin_xendit_payment_attempt` reuses an in-flight/still-valid attempt instead of creating a duplicate (double-click/retry safe at the DB layer, independent of Xendit's own `Idempotency-Key` header, also sent). `process_xendit_webhook` is a no-op once a payment is already `paid`/`failed` — this also correctly handles out-of-order webhook delivery. Every webhook delivery is logged to a new, RLS-locked-down `payment_webhook_events` audit table regardless of outcome.
- **Every webhook is validated against our own database**, never trusted blindly: the resolved `payments` row's stored `xendit_payment_request_id` must match what the webhook claims to confirm; amount and currency must match what was recorded when the attempt was created (a mismatch marks the attempt `failed`, never `paid`).
- **COD is unaffected by Xendit and still never auto-marks paid.** A new `mark_cod_payment_collected` RPC (seller of the order, or admin) is the only way a COD order's `payment_status` becomes `paid` — gated by the same transaction-local-flag pattern already used for refunds (`app.refund_in_progress` → new `app.cod_collection_in_progress`), closing the exact self-declare loophole that removing `verify_payment`'s seller carve-out would otherwise have reopened.
- **No commission, no payouts, no xenPlatform.** `create_order` was not touched — there was never commission logic to add or remove. Shop attribution (`orders.seller_id` → `shop_users` → `shops`, one seller per shop) was already sufficient for the three-sibling-shop model (ADR-001) and needed no schema change.

**Removed (Bank Transfer / QR manual verification), historical data preserved:**
- `submit_qr_payment`/`verify_payment` RPCs dropped (guarded by a pre-flight check confirming zero `pending`+`qr_upload` payments existed before dropping). The buyer-facing checkout option and the seller/admin "verification queue" UI are gone — replaced by a read-only `PaymentsList` (no manual actions; Xendit settles itself, COD is settled via the RPC above).
- The `payment-receipts` Storage bucket's buyer-INSERT policy is dropped (no new receipts); its SELECT policy, the bucket, and every existing object are untouched — historical receipts remain viewable.
- Every historical `payments` row (`payment_method_type IN ('qr_upload', 'card')`) and `profiles.payment_qr_url` value is untouched. `qr_upload`/`card` join `payment_method_type`'s permanent-but-unused values (Postgres enum values cannot be cheaply dropped) — same accepted limitation ADR-014 already established for `card`.
- `report_sales_summary`'s COD/QR revenue split was previously binary ("not QR = COD") — fixed to a proper three-way split (`cod_paid_orders`/`qr_paid_orders`/`xendit_paid_orders`) as part of this change, since the binary logic would have silently miscounted Xendit revenue as COD otherwise.

**Consequences:**
- New client-side dependency: `xendit-components-web` (Card only) — unavoidable for PCI-safe card collection without becoming a PCI-DSS Level 1 merchant.
- New server-only env vars: `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`.
- New Route Handler: `/api/webhooks/xendit` (the second Route Handler in this codebase, after the PKCE `auth/callback` — anticipated by ADR-004's "introduce versioned Route Handlers alongside Server Actions" note). `src/proxy.ts` skips the Supabase session-cookie refresh for `/api/webhooks/*`, since it's an unauthenticated-by-cookie, server-to-server path.
- Xendit-dashboard-initiated refunds are **not** automatically reflected back into this app (no `/refunds` webhook handler built) — existing order refunds still go through the pre-existing `decide_return` admin flow, which is payment-method-agnostic and required no changes.
- This is a **sandbox/test-mode implementation only**. Going live would additionally require: real Xendit business verification, a publicly reachable webhook URL, and a security review of the webhook endpoint's exposure (rate limiting) before production traffic — none of that is in scope here.

**Future Revisit:** If this goes into production, revisit: automatic refund-webhook handling, seller payout/settlement (explicitly out of scope for this sandbox change), and confirming the exact amount-unit convention (`request_amount`'s decimal-vs-minor-unit format) and the Card session's webhook event family against a real sandbox account, both of which were resolved by best-evidence reasoning rather than a live API call during this implementation.

---

## ADR-020: Authenticated cart becomes database-backed, with guest-cart merge on sign-in

**Status:** ✅ Accepted

**Context:** ADR-013 established a client-side-only cart for both guests and authenticated buyers, explicitly flagging cross-device persistence as a **Future Revisit** — "if cross-device cart persistence becomes a requirement, add a server-synced cart for authenticated users only, without changing the guest experience." That requirement arrived: the same authenticated account needs to see the same cart on a second browser or device, not just the one it was built on.

**Problem:** `localStorage` is inherently per-browser. Scoping its key by user id (an interim fix, shipped first) stops one account's cart from leaking into another's on a *shared* browser, but cannot make a cart visible on a genuinely *different* browser or device at all — that requires a server-side store for authenticated users.

**Options Considered:**
1. Keep `localStorage` for everyone, accept no cross-device sync (status quo).
2. **Database-backed cart for authenticated users only; guest cart stays exactly as ADR-013 decided.**
3. Server-side cart for *all* users, including guests (session-tied anonymous accounts or device fingerprinting) — rejected for the same complexity-vs-value reasons ADR-013 already rejected it for.

**Decision:** Option 2, per the revisit condition ADR-013 itself set out.

- New, purely additive tables: `carts` (one row per authenticated user) and `cart_items` (`product_id`, nullable `variant_id`, `quantity`). No existing table changed.
- Plain RLS, `user_id = auth.uid()` ownership, **no admin or seller override** — a cart is private to its owner, the same precedent already established for `addresses`/`wishlists`, not the staff-visible pattern used for `orders`/`products`.
- `productId + variantId` is the cart-line identity, enforced by partial unique indexes — the same pattern already used by `order_items`/`inventory` for a nullable `variant_id` — so the same product in two different variants is always two distinct lines, and the same product+variant always merges into one.
- `CartProvider` forks on the resolved identity: guest → unchanged `localStorage` + `useReducer`; authenticated → new Server Actions (`features/cart/actions/cart.actions.ts`), reconciled by a full refetch after every mutation rather than optimistic client-side patching, so the client never has to re-implement the server's merge/increment logic.
- **Guest→account merge on sign-in:** a non-empty guest cart is folded into the account cart the moment an identity resolves as authenticated — covering both "signs in this session" and "already-signed-in visitor whose browser still has a leftover guest cart from a past anonymous visit." Matching lines sum; new lines are added. A line that's gone stale (archived product, insufficient stock) is not specially filtered at merge time — it surfaces through the *existing* "no longer available" / "only N left" cart banners the same way any other stale line already does, so merge needed no new stock-validation logic of its own. The guest bucket is cleared only after a confirmed successful merge, so a network failure can't lose the guest's cart — a later page load naturally retries.

**Consequences:**
- The same account now sees the same cart on any browser or device — the exact gap ADR-013's Future Revisit flagged.
- No change to the guest experience, checkout, order creation, or product/variant logic.
- Cart price/stock are still never stored on a cart line — always resolved live via join, same as the pre-existing client cart already did before checkout.
- A known, accepted residual gap: two browser tabs signing in at the same moment could both attempt to merge the same guest bucket before either clears it, double-counting the affected lines' quantities. Low severity (the buyer can just adjust the quantity, same as any other cart line) and not worth a distributed lock for the value it would add.

**Future Revisit:** None currently planned — the cross-device gap this ADR closes was the only open item ADR-013 left on the table.

---

## ADR-021: One product editor for add and edit; a client-generated product id makes saving retry-safe

**Context:** Adding a product opened a small inline form above the products table, editing opened a side drawer, and options (variants), photo color tags and Guided Selection rules only existed in the drawer — so a seller had to save, close, reopen and scroll to add sizes. The two surfaces also had different save behaviour: a Save button for details, instant saves for options and photo tags.

**Problem:** Putting options and photos on the add page means saving a product, its photos and its options as several separate requests. Any of them can fail, and a retry must never create a second product, upload a photo twice or duplicate an option — with no schema change available.

**Options Considered:**
1. Keep two surfaces; add options to create by saving the product first and redirecting to the edit page.
2. Server-side "draft product" row created on page open, then edited as normal.
3. **One full-page editor for both modes. In create mode, photos and options are held in the browser and saved after the product, as a resumable sequence. The product's primary key is generated by the client and sent with the request, so a repeat of the same request returns the existing product.**

**Decision:** Option 3.

- `products.id` accepts the client-generated UUID (`clientId`) on create. A repeat hits the primary key (`23505` on `products_pkey`) and returns the caller's own existing row; a key that belongs to someone else, or a slug clash, is still an error. `clientId` lives on a create-only request schema, never on the update schema, whose fields are written straight to the row.
- Options are saved with `ensureProductVariantAction`: the same color/size/material/dimensions combination always resolves to the one existing variant (looked up first, then created, with the existing unique index covering races).
- The sequence (`features/products/lib/product-save-flow.ts`, no framework imports so it is unit-tested): product first; photos in order, **stopping at the first failure** so the cover photo never lands behind a later one; options independently; color tags last. Completed steps are never repeated, a throwing step becomes a failed step, and the seller sees exactly what is saved and what is not, with a retry that only does the rest.
- Once the product exists, a new product's fields lock, so a retry can never diverge from what was already saved.
- The option editor takes injected operations (`liveVariantOps` saves to the server; `draftVariantOps` keeps changes in memory), so one UI serves both modes.
- `/seller/products/new`, `/seller/products/[id]` and `/admin/products/[id]` replace the inline box and the drawer. There is no admin "new" page: admin still never creates products.

**Consequences:**
- A seller adds a product with photos, options and color tags in one place, in one pass.
- No migration, no change to roles, RLS, stock or pricing. Stock for options is still set from Inventory.
- Known, accepted gaps: photos that were retried after a later one succeeded can only happen after a failure, and a failed photo leaves later ones waiting rather than uploading out of order. A browser closed mid-save leaves the product saved (as whatever status was chosen) with the remaining photos/options unsaved; it can be finished from the edit page.

**Follow-up (step 2):** the add page ends in Save as draft / Publish (which set `status` to `draft` / `active`), a preview and checklist share the left panel, instant saves show a "Saved" note, and in-app navigation with unsaved details is confirmed first. No business rule or stock path changed.

**Future Revisit:** Setting initial stock per option on the add page (would add an audited stock adjustment per option to the sequence).

---

## ADR-022: Guided Selection matches straight from the catalog

**Context:** Guided Selection (ADR-009) recommended only products a seller had written a `recommendation_rules` row for. A product with no rule never appeared, rule `size` was free of any link to the product's real options, and stock was never checked — so the quiz could miss good matches and recommend sold-out or wrong-size items.

**Problem:** Buyers' answers (category, occasion, size, color, material, dimensions, budget) should be checked against what is actually for sale, without sellers maintaining a second data set.

**Options Considered:**
1. Keep rules as the only source (status quo).
2. Keep rules as optional pins on top of automatic matching.
3. Match automatically from products, options and stock; retire seller rule authoring.

**Decision:** Option 3. `listGuidedSelectionMatches` reads active products (active shops, optional category), their active options and live per-option stock, and `features/assistant/lib/guided-match.ts` (pure, unit-tested) ranks them: only buyable items; size/color/material/dimensions satisfied by one option; budget against the matched option's live price; products just outside the budget returned as "close" matches with a note; Occasion read from product tags (new "Good for" field in the product editor; untagged products still qualify but rank lower; products tagged only for other occasions are excluded). It is still deterministic and explainable — rule-based in the ADR-009 sense, never AI/ML.

**Consequences:**
- The Guided selection section is removed from the product editor and `rule.actions.ts` is deleted. The `recommendation_rules` table and its rows are kept untouched (no data loss) but are no longer read or written; dropping it is a later, separate migration. The rule CRUD helpers in `queries.ts` remain as unreferenced code (Technical Debt Register).
- A product with no options matches only when no size/color is asked (it has no such data).
- The candidate pool is the newest 300 active products per query.
- Matching on material/dimensions on existing products relies on the products.material/dimensions values being set (see the pending update-grant migration).

**Future Revisit:** Drop `recommendation_rules`; a first-class occasion column instead of tags if tags prove too loose.

---

## ADR-025: A cancelled paid order is refunded by the existing refund pipeline, opened by a trigger

**Context:** Cancelling a paid order restocked it but left the money in place: the buyer had to file a return and wait for an admin, and a payment that succeeded after cancellation was only logged. The buyer-facing rule is "cancel before preparation -> automatic full refund; cancel during preparation -> the shop reviews".

**Options:** (1) a new refund table and flow for cancellations; (2) reuse `return_requests` + `xendit_refunds` and the Xendit refund webhook; (3) have each cancel path call a refund function.

**Decision:** Option 2, with the refund opened by the trigger `orders_open_refund_on_cancel` (not by each caller), so buyer, seller, admin, bulk and approved-request cancellations all behave the same. The refund is a system-approved `return_requests` row (`reason_code = order_cancelled`, `restocked_at` set so stock can't be restored twice) plus a pending `xendit_refunds` attempt; the attempt id is the Xendit Idempotency-Key. COD / non-Xendit payments become `refund_due` for the existing staff payout. Cancelling from `shipped` is excluded (failed delivery stays under the return policy). The order stays `cancelled`; refund progress lives in `payment_status` and the refund attempts, and "completed" is only set from Xendit's confirmation. Cancelling a `processing` order is a request (`cancellation_requests`) the shop approves or declines; approval runs the same cancel. Late payments are refunded by `refund_late_payment_on_cancelled_order` (webhook + reconciliation).

**Consequences:** No new payment code path or table for refunds; a double click, duplicate webhook or racing seller step is absorbed by the database (unique pending request, row locks, pending/succeeded checks). A failed call to Xendit is retried by the 15-minute sweep up to 4 times, then needs a person (Retry refund). Rollback steps are in the header of `20261024000100_order_cancellation_refunds.sql`. See `docs/cancellation-refunds.md`.

---

## ADR-024: Variant stock is allocated, not duplicated; options share one shape; Guided Selection flags what it can't confirm

**Context:** Almost no product had size/color options, and the two that did had rows that mixed color-only and size-only options (no buyer could pick both) while keeping leftover stock on the product's own inventory row, so stock appeared twice. Guided Selection (ADR-022) dropped every product without size/color data whenever a size or color was asked, hiding most of the catalog.

**Decision:**
1. A product's options must all use the same choices (checked on create, in the editor and server-side). A color x size generator creates all missing combinations at 0 stock.
2. Stock only ever moves: `allocate_stock_to_variants` transfers units from the product-level row to option rows in one transaction, total preserved, refused if it exceeds the unassigned count. Nothing is invented or copied.
3. For a product with options, the product-level row is "unassigned stock": excluded from low-stock reports and shown as not sold; `active <-> sold` follows the combined option stock (`sync_products_quantity_from_inventory`).
4. Guided Selection never claims an unconfirmed attribute: a product with no size (or color) data is returned as `fit: "unconfirmed"` with a note, ranked after exact and close matches, and must satisfy every other answer. Supersedes ADR-022's "a product with no options matches only when no size/color is asked".

**Consequences:** Existing mixed-axis options are not rewritten automatically - fixing them is a reviewed data change. Sizes are never inferred; sellers confirm them. Applying the migration is required for Move to options and the new status rule.

---

## ADR-023: Buy Now checks out one product directly; Add to Cart is validated and confirmed

**Context:** "Buy Now" added the product to the cart (merging into any existing line) and then opened checkout, which places whatever lines are selected in the cart — so it could include other items and the wrong quantity. Add to Cart was fire-and-forget: no confirmation, no error for a signed-in failure, a silent clamp for guests, and the server accepted adds beyond stock. A product with options also left both buttons disabled until everything was picked, with no way to see why.

**Decision:**
1. A shared selection hook (`useVariantSelection`) and an options sheet (`ProductPurchaseSheet`) let the buyer choose options and quantity before proceeding; the product page's buttons open it when something is missing.
2. `CartProvider.addItemChecked` returns the outcome. Guests are checked in the browser; signed-in adds are checked on the server (`addCartItem` → live stock plus what is already in the cart). The guest-cart merge on sign-in is exempt (`enforceStock: false`) so it still keeps every line as before.
3. Buy Now navigates to `/checkout?buyNow=<product>&variant=<option>&qty=<n>`. The checkout page resolves it with `getBuyNowLine` — price, stock, seller and photo come from the database, the quantity is validated against stock, and the cart is neither read nor changed. The URL survives the sign-in redirect for guests.
4. One in-flight lock is shared by every purchase button, with a short cooldown after a successful add.

**Amendment (atomic add):** signed-in adds now call `public.add_cart_item` — one SECURITY INVOKER function that takes a per-cart advisory lock, checks the product/option is active and that existing quantity plus the add fits live stock, writes the line and returns the new total. The earlier read-check-write in the app could be raced by two concurrent adds (nothing could be oversold — `create_order` locks stock — but the cart could exceed it). Messages are prefixed `CART: ` and shown to the buyer as they are. Add-to-cart feedback always states the cart's new total.

**Consequences:** `create_order` and the cart tables are untouched; the only database change is the added function. A bought-now checkout is not saved anywhere, so reopening its link starts a new checkout for the same item (`router.replace` keeps the post-order Back button from doing that by accident). Adding a quantity beyond stock to a signed-in cart is now refused instead of accepted-and-flagged.
