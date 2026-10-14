# Changelog

All notable changes to RoberJ Online Shop are documented here, newest first. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

> [!NOTE]
> The project has not reached a versioned `1.0` release, so entries are grouped by date rather than semantic version. Historical entries below are reconstructed from migration timestamps and existing planning docs — they mark when work **landed**, not when this changelog was created. Going forward, every PR that ships a module milestone, a schema change, or a business-facing behavior change should add an entry here in the same PR (see [CONTRIBUTING.md → Documentation update requirements](./CONTRIBUTING.md#documentation-update-requirements)).

## [Unreleased]

### Added
- **Add to Cart tells you what is in the cart, and can't be raced past stock.** Every add now says the new total ("Added to cart…", or "Already in your cart (2). Added 1 more — you now have 3."), adds "That's all we have." when the last unit goes in, and the product page shows "N in your cart" with a "View cart" link; the button becomes "Add another", and "All in your cart" (disabled) once all the stock is in the cart. For signed-in carts the add is now a single atomic database step (`add_cart_item`, migration `20261015000000_add_cart_item_atomic.sql`): concurrent adds for one cart — two tabs or devices — are serialised and can no longer push the cart past stock. **Apply the migration before deploying this code.** It adds a function only (SECURITY INVOKER, no grants on tables). The guest-cart merge on sign-in is unchanged.
- **Choose-your-options sheet and a reliable Add to Cart / Buy Now.** On a product with options (color, size, …), Add to Cart and Buy Now are no longer dead buttons: pressing one before everything is chosen opens a responsive sheet (bottom sheet on phones, dialog on larger screens) pre-filled with what is already picked, with live price (a range until fully chosen), stock, a quantity stepper capped at stock, color swatches with photos, and plain-language messages for what is missing. Options that don't exist or are out of stock are disabled; picking the chosen value again clears it. The sheet is keyboard- and screen-reader-friendly (focus trap, Escape, labelled groups).
- **Add to Cart** adds the exact option and quantity, shows a success notice with a "View cart" link, and leaves the buyer on the product page. Stock is checked including what is already in the cart (on the server too, for signed-in carts — previously an over-add was accepted and only flagged at checkout), and a second click while the first is in flight, or right after, is ignored.
- **Buy Now** now goes straight to checkout for just that product, option and quantity (`/checkout?buyNow=…`) without changing the cart; price and stock are re-read on the server, and a bad or stale link says why. After the order, Back doesn't return to the same checkout. ADR-023.
- Product tiles (catalog and homepage) send a product that has options to its page instead of quick-adding a plain line, and report stock problems in a notice. "Buy again" keeps the option a line was bought with.

### Fixed
- **Orders list shows what was bought.** The seller/admin orders table (and its mobile cards) now shows the purchased products' photos (up to three, plus "+N") and a line such as "Vintage Jacket Demin ×2 (Blue / M) +1 more", instead of an initials avatar and "N items". When the buyer's profile can't be read (a shop co-member's order), the delivery name on the order is shown instead of "Unknown buyer"; the same name is used on the order detail pages. No database or permission change.
- **Change password (buyer and seller).** The current-password check signs in through Supabase Auth, which enforces captcha, but sent no captcha token — so with captcha on, every attempt failed and was reported as "Your current password is incorrect". The form now carries a Turnstile token, and only a genuine bad-credentials error says "incorrect password" (captcha and other failures have their own messages). Accounts that only sign in with Google/Facebook have no password to change, so they see guidance instead of a form that can never succeed. Fields clear after a successful change. The buyer and seller pages now share one `ChangePasswordForm` (seller uses the themed variant); the separate seller form was removed.
- **Profile photo upload.** A rejected photo now shows the real reason (for example "Image must be 1MB or smaller.") instead of only "Please correct the highlighted fields.", and a JPEG/PNG over 1MB is shrunk in the browser to a JPEG under the limit before uploading, so ordinary phone photos work. Applies to the buyer and seller profile photo (`AvatarUploader`); the server-side 1MB/JPEG/PNG checks are unchanged.
- **Seller "Profile Settings" no longer bounces to the homepage.** The seller top-bar menu and sidebar profile card linked to the buyer-only `/profile`, whose layout redirects sellers and admins. They now open a new **Seller Settings** page at `/seller/settings` with Account (photo, name, phone; email read-only), Security (change password) and a read-only My shop summary linking to branding. Buyer account pages are unchanged and still buyer-only. Fields the form does not show (username, bio, gender, date of birth) are carried as hidden inputs so saving never blanks them.

### Changed
- **Zero-stock options warning.** The product editor now shows a notice when a product's options all have 0 stock (options start at 0 until stock is set in Inventory), so a live product is not left unbuyable by accident. It is a warning only; saving and publishing are unchanged.
- **Guided Selection now matches from the catalog automatically** (ADR-022). Sellers no longer write rules: the quiz checks active products, their options and live stock. Only in-stock items are recommended; size/color/material/dimensions must be satisfied by the same option; budget uses the matched option's live price, and products just over/under budget show as "close" matches with a note. Occasion comes from a new **Good for** field in the product editor (stored as product tags; untagged products still match, tagged-for-other-occasions ones don't). The Guided selection section and rule actions were removed; the `recommendation_rules` table is kept, unused.
- **Category photos on `/categories`.** The Shop by Category cards now show the same photos as the homepage's "Shop Every Style" section instead of empty tiles. Both use one shared `resolveCategoryImage` helper (`src/constants/category-images.ts`): the category's own image if it has one, else the bundled photo for its slug, else a position-based fallback.
- **Editing no longer fails on untouched specs.** Saving an edit now sends Material/Dimensions only when you changed them. The database does not yet allow sellers to update those two columns (`20261014060000_products_update_material_dimensions.sql` adds the grant; apply it before changing material or dimensions on an existing product).
- **Publishing needs a quantity.** The existing rule that an Active product must have a quantity above 0 (`products_active_requires_stock`) now has a clear message instead of "Failed to create product". Publish stays disabled until a quantity above 0 is entered (Save as draft never needs one), and the same check runs before saving an Active product in the editor.
- **Product editor, step 2.** Plain wording: Variants are now Options, SKU is Product code, Price override is Different price. Adding a product ends in **Save as draft** or **Publish** (Publish needs a category, name and price; the status values underneath are unchanged), while editing keeps a Status choice with a one-line explanation of each. A live "How buyers will see it" preview and a "Before you publish" checklist sit in the left panel. Photos and options now show a "Saved" confirmation when they save instantly, and leaving the page with unsaved details asks first (not covered: the browser's Back button). The products list drops the Category and Updated columns (category moves under the name), shows each product's total stock across its options with sold-out options called out, and groups search, category and status filters together; the category filter is now chips instead of a dropdown.
- **One product editor for add and edit** (ADR-021). `/seller/products/new`, `/seller/products/[id]` and `/admin/products/[id]` replace the inline "New product" box and the edit drawer. Sections are the same in both modes (Basics, Photos, Price & stock, Options, Details, Visibility, and Guided selection when editing) with a left-hand section panel. All dropdowns in the editor (category, condition, status, photo color tag, Guided Selection rule fields) are now visible choices.
- Adding a product now takes its photos, options and photo color tags in the same pass. They are saved after the product, resumably: the product id is generated by the browser so a repeat request can never create a second product, options are idempotent per combination, completed steps are never repeated, and a partial failure shows exactly what is saved with a retry for the rest.
- `npm run test:unit` runs the new unit tests for that sequence.

### Added
- **Seller: tick-a-value variant checklist.** When a product has exactly one active variant axis and its category config carries a picklist (`category_attributes.allowed_values`, e.g. Shirts & Tops sizes), the Variant Manager shows a checklist instead of the free-text "Add variant" form — ticking creates the variant, unticking deletes it (the existing "already ordered" error is shown unchanged). Two or more active axes, and free-text axes (`allowed_values` null), keep the existing manual flow.
- **Variant-specific photos.** New nullable `product_images.variant_id` (`20261014050000_product_images_variant_id.sql`; `ON DELETE SET NULL`). Sellers can tag a photo "Shows for" a color in the product form; the PDP gallery then follows the selected color. Deleting a tagged variant re-points its photos to another variant of the same color (cleared only if none remains). Untagged products behave exactly as before. **Apply the migration before deploying this code.**

### Known gaps (tracked, not resolved)
- `recommendation_rules` table not yet implemented (Guided Product Selection — Phase 9).
- No automated test runner (see `DECISIONS.md` → ADR-015).

Full current-vs-target status: [README.md → Implementation Status](./README.md#implementation-status-target-vs-current) · [ARCHITECTURE.md → Technical Debt Register](./ARCHITECTURE.md#technical-debt-register).

---

## 2026-09-06 — Xendit Online Payment (GCash, Maya, Card); QR manual verification retired

See [DECISIONS.md → ADR-019](./DECISIONS.md#adr-019-xendit-online-payment-gcash-maya-card-superseding-adr-008s-no-gateway-stance) for full rationale. Sandbox/test-mode implementation — no seller payouts, commission, or real-money settlement.

### Added
- Payment methods are now **COD** and **Xendit Online Payment** (GCash, Maya, Card) only.
- New RPCs: `begin_xendit_payment_attempt`, `finalize_xendit_payment_request` (buyer-authenticated, idempotent attempt reservation), `process_xendit_webhook` (`service_role`-only — the sole path to `paid`), `mark_cod_payment_collected` (seller/admin, replaces auto-paid-at-creation for COD).
- New `payment_webhook_events` audit table — every webhook delivery logged regardless of outcome, making duplicate/out-of-order handling forensically auditable.
- New `payments` columns: `xendit_payment_request_id`, `xendit_payment_id`, `payment_channel`, `checkout_url`, `expires_at`, `provider_response`. New `payment_method_type` value: `xendit`.
- New webhook receiver: `POST /api/webhooks/xendit` (token-verified, `proxy.ts` skips session refresh for it).
- New env vars: `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`.
- New UI: `XenditPaymentOptions` (GCash/Maya redirect + embedded Card via `xendit-components-web`), `MarkCodCollectedButton`, read-only `PaymentsList` (replaces the verification queue).
- `report_sales_summary` gains a third `xendit_paid_orders` bucket (fixes a latent bug where the old binary COD/QR split would have silently miscounted Xendit revenue as COD).

### Removed
- `submit_qr_payment`/`verify_payment` RPCs and the seller-self-verification trigger carve-out (closed in favor of a `mark_cod_payment_collected`-specific, flag-gated one — a bare "seller can flip payment_status" condition would have reopened a self-declare gap).
- Buyer-facing QR checkout option, `ReceiptUpload`, `VerificationQueue`/`VerificationCard`, and the four dashboard "Pending Payments" surfaces (Xendit settles via webhook; nothing left to queue).
- Seller-editable "Payment QR code URL" profile field (`ProfileForm`) — no new Bank Transfer/QR setup is possible.

### Preserved (not touched)
- Every historical `payments` row (`qr_upload`/`card` `payment_method_type`), every uploaded receipt, and every `profiles.payment_qr_url` value — read-only, for audit. `create_order`, `placeOrderAction`, order-status transitions, COD-order-placement flow, and the `decide_return` refund flow are all unchanged.

---

## 2026-08-13 — Reports & analytics (Phase 8)

### Added
- Reports module: `/dashboard/reports` for Shop Owners (own shop) and the Administrator
  (platform-wide, with an admin-only shop filter). KPI cards (revenue, orders, paid orders, avg
  order value, units, cancelled), a sales-over-time trend (day/week/month), an order-status
  breakdown, a COD-vs-QR paid-payment split, top products, and a low/out-of-stock report. Date-range
  presets + explicit range + granularity, plus CSV export.
- Four read-only `SECURITY DEFINER` aggregation RPCs — `report_sales_summary`,
  `report_sales_timeseries`, `report_order_status_breakdown`, `report_top_products` —
  (`20260818000000_reports_analytics_rpcs.sql`). Each re-enforces scoping internally (seller →
  own orders; admin → all, or one shop via `p_shop_id`; a seller's `p_shop_id` is ignored), with
  `EXECUTE` granted to `authenticated` only. **No `reports` table** was modelled — resolves TD-5.
- Reports service section in `queries.ts` (`getSalesSummary`/`getSalesTimeseries`/
  `getOrderStatusBreakdown`/`getTopProducts`, plus `getLowStockReport` reusing the existing
  RLS-scoped inventory read), a new `features/reports/` module, and hand-rolled dependency-free
  charts in `src/components/charts` (`TrendChart`, `BarChart`).
- Two additive `orders` indexes (`orders_seller_placed_idx`, `orders_placed_at_idx`) for
  date-range scans. `scripts/e2e-reports.mjs` asserts the RPCs reject anonymous callers.

### Design notes
- **Single date axis:** every metric buckets on `placed_at` in `Asia/Manila`. Revenue counts only
  orders with `payment_status = 'paid'` (the confirmed-revenue source of truth for both COD and QR);
  `payments.amount_cents` is never summed directly. See `DECISIONS.md` → ADR-016.
- No existing Orders/Payments/Products/Inventory/RLS behaviour was changed — the migration is purely
  additive (new functions + indexes).

---

## 2026-08-07 — Payments: QR receipt upload + manual verification (Phase 7)

### Added
- The SAD's target payment path is now fully implemented: COD (unchanged) and QR Transfer (new).
  A buyer selects QR at checkout (informational only — `create_order` is deliberately unchanged),
  then uploads a receipt from their order detail page (`submitQrPaymentAction`) once they've sent
  payment via the seller's own receiving QR code (new `profiles.payment_qr_url`, seller-editable
  via the existing `ProfileForm`). The order's seller (or an admin) verifies or rejects it from a
  new minimal `/dashboard/payments` page — the **first real page** under `/dashboard`.
- `submit_qr_payment`/`verify_payment` `SECURITY DEFINER` RPCs — the sole write path into
  `payments`, mirroring `create_order`'s chokepoint pattern (no direct INSERT/UPDATE grant on the
  table). A narrow, in-place fix to `enforce_order_update_rules` lets a seller move their own
  order's `payment_status` from `pending` to `paid`/`failed` (previously admin-only), matching the
  SAD's "Administrator **or** Shop Owner" language.
- The `payment-receipts` Supabase Storage bucket — the **first Storage feature in this repo**.
  Private, RLS-gated via a subquery against `orders` (buyer/seller/admin of that order), path
  convention `{order_id}/{uuid}.{ext}` (deliberately not buyer-id-in-path, to avoid a spoofable
  policy).
- New `features/payments/` module (actions, schemas, types, components) and
  `PAYMENTS: "payments"` added to `DATABASE_TABLES`.

### Changed
- `payments` table evolved: Stripe-only columns (`provider`, `provider_transaction_id`,
  `stripe_event_id`, `charge_id`, `customer_id`, `customer_email`) dropped — **resolves TD-3**.
  `receipt_url` renamed to `receipt_path` (a private Storage object path, not a public URL).
  Added `verified_by`/`verified_at` (manual-verification audit trail). `payment_method_type` gains
  `qr_upload` (`card` stays as inert legacy).
- `database.types.ts` (hand-written — TD-8) updated to match.

### Migrations
- `20260807010000_evolve_payments_for_qr.sql`, `20260807020000_qr_payment_rpcs.sql`,
  `20260807030000_payment_receipts_storage.sql`, `20260807040000_profiles_payment_qr_url.sql`.

---

## 2026-08-07 — Checkout audit fixes & Stripe spike retirement

### Fixed
- `checkout.schema.ts`: the optional `phone` field rejected the empty string it defaults to (regex validation ran on `""` since the field is never actually `undefined`), blocking checkout for anyone who left it blank. Now matches `account.schema.ts`'s `.or(z.literal(""))` pattern.

### Added
- Order-confirmation page (`/checkout/confirmation`) — full checkout success now hands off to a summary of the order(s) just placed instead of the raw order-history list.
- Shipping address "Country" is now locked to Philippines (domestic-only marketplace, no courier/shipping API), enforced both in the UI and server-side (`z.literal(...)`).

### Removed
- The Stripe/card payment spike (`DECISIONS.md` → ADR-014, now retired): `stripe.actions.ts`, `StripePaymentFlow.tsx`, `lib/stripe.ts`, `scripts/e2e-stripe.mjs`, the `stripe`/`@stripe/*` npm packages, and the Stripe env vars. Audit found it had no webhook to ever move `payment_status` out of `pending` — a "successful" card payment never actually recorded as paid — so retiring it outright was safer than building the missing webhook for unsanctioned scope. Checkout is COD-only until the target QR-upload path (ADR-008) ships. The `payments` table's Stripe-specific columns remain in the schema pending a dedicated cleanup migration (TD-3).

### Changed
- Documented the checkout total's single-currency (PHP-only) assumption inline (`CheckoutForm.tsx`) rather than implementing multi-currency conversion — this marketplace is domestic/single-market by design.

---

## 2026-08-06 — Documentation baseline

### Added
- `README.md` rewritten as the AI-optimized business front door (vision, scope, roles, roadmap, folder map).
- `ARCHITECTURE.md` — technical specification, target/current schema mapping, RBAC and flow diagrams.
- `CLAUDE.md` extended with AI/developer working agreement, standards, and non-negotiables (preserving the existing `@AGENTS.md` import).
- `.env.example` added, matching `src/config/env.ts`.

---

## 2026-08-04 — Payments spike & security hardening

### Added
- `payments` table + `payment_method_type` enum (migration `20260804000200_add_payments.sql`).
- Stripe integration (`stripe.actions.ts`, `lib/stripe.ts`, `scripts/e2e-stripe.mjs`) — **provisional spike**, not the SAD's official payment path (see `DECISIONS.md` → ADR-014).
- `get_my_profile()` `SECURITY DEFINER` RPC (migration `20260804000100_add_get_my_profile.sql`).

### Fixed
- Restored correct column-level grants on `profiles` after a prior migration re-leaked `phone` via full-row SELECT (migration `20260804000000_restore_profiles_column_grants.sql`).
- Restricted `create_order` RPC execution to `authenticated` only, revoking anonymous execute (migration `20260804000300_revoke_create_order_anon_execute.sql`).

---

## 2026-08-03 — Landing page & storefront

### Added
- Landing page implementation completed per `landing-page-implementation-plan.md` — Hero, Featured Products, Featured Shops (placeholder), Marketplace Features, category browsing.
- `(marketing)` / `(shop)` route-group split.
- `features/landing` and `features/categories` service layers.

---

## 2026-08-02 — Foundation

### Added
- Initial database schema: `profiles`, `categories`, `products`, `product_images`, `orders`, `order_items` (migration `20260802000100_initial_schema.sql`), with full RLS from day one.
- `create_order` atomic checkout RPC, `handle_new_user` auto-provisioning trigger, order lifecycle triggers.
- Supabase client layer (`client.ts`, `server.ts`, `session.ts`) and centralized service layer (`queries.ts`).
- `src/proxy.ts` — Next.js 16 session refresh + route protection.
- Authentication module (sign up/in/out, password reset, email verification via PKCE).
- RLS audit remediation pass (migrations `20260802160000_security_hardening.sql`, `20260803000100_rls_hardening.sql`).

---

### Related documents

- 🧭 **[README.md](./README.md)** — current status and roadmap.
- 📐 **[ARCHITECTURE.md](./ARCHITECTURE.md)** — migration notes and technical debt register.
- 📜 **[DECISIONS.md](./DECISIONS.md)** — the reasoning behind what shipped.
