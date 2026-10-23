# Changelog

All notable changes to RoberJ Online Shop are documented here, newest first. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

> [!NOTE]
> The project has not reached a versioned `1.0` release, so entries are grouped by date rather than semantic version. Historical entries below are reconstructed from migration timestamps and existing planning docs — they mark when work **landed**, not when this changelog was created. Going forward, every PR that ships a module milestone, a schema change, or a business-facing behavior change should add an entry here in the same PR (see [CONTRIBUTING.md → Documentation update requirements](./CONTRIBUTING.md#documentation-update-requirements)).

## [Unreleased]

### Changed (Seller Reports)
- **Seller Reports redesigned to match the Dashboard.** Same date button, the same four clickable tiles (Gross sales, Confirmed refunds, Net sales, Orders placed with previous-period changes and definitions) plus paid orders, refunds in progress and an "Open returns" prompt; the Dashboard's single trend chart with an Auto/Daily/Weekly/Monthly switch; then Payment source and Orders by status (each status opens Orders for the same dates), Sales by category and Repeat customers, and Top products (By units / By sales) with Restock priority. The separate Low stock panel is merged into Restock priority on this page. Payment source and category sales show a check that they add up to Gross sales.
- **Accuracy fixes** (`20261024000400_seller_report_accuracy.sql`, to be pasted into the Supabase SQL editor): `report_top_products` now counts units and sales from ever-paid orders only (it counted unpaid and cancelled orders in units, so the Dashboard card, Reports and admin pages overstated units); `report_payment_source_summary` now includes later (partly) refunded orders so its total equals Gross sales; new `report_revenue_by_category` replaces a client-side read that was not shop-scoped, used UTC day bounds and dropped refunded orders. Restock priority uses the same paid basis for units and sales and passes the shop explicitly.
- **CSV export** now has Gross, Confirmed refunds and Net (the old single "Revenue" column is now "Net sales"), refunded orders, refunds in progress, orders by status, sales by category (with shipping and fees), top products, and net sales per interval. Product and category names that start with `=`, `+`, `-` or `@` are escaped so spreadsheets don't run them as formulas.

### Added (cancellation and automatic refunds)
- **Cancelling a paid order now refunds it automatically, and a payment that arrives after cancellation is refunded too.** Before, cancelling a paid order left the money where it was (the buyer had to file a return and wait for an admin) and a payment that succeeded *after* the order was cancelled was only logged, never refunded. Now a trigger (`orders_open_refund_on_cancel`) opens the refund whenever a pending/confirmed/processing order with a paid payment becomes cancelled, whoever cancelled it (buyer, seller, admin, bulk, approved request). It reuses the existing refund pipeline: a system-approved `return_requests` row (new reason `order_cancelled`) plus a `xendit_refunds` attempt that the server sends to Xendit with the attempt id as the Idempotency-Key. COD / non-Xendit payments become `refund_due` for the existing staff payout. A shipped order that is later cancelled (failed delivery) is deliberately **not** auto-refunded and stays under the return policy.
- **Instant cancel for pending/confirmed orders (`cancel_order_with_refund`)**: one transaction (cancel + restock + open refund), idempotent for a double click. Buyer copy: unpaid "Order cancelled. You won't be charged."; paid e-wallet "Order cancelled. Your ₱X refund is processing. No further action is needed."
- **Request cancellation once the seller marks the order Ready for Pickup (processing)** (`cancellation_requests`, `request_order_cancellation`, `respond_to_cancellation_request`): the seller/shop member/admin approves (order cancelled, stock restored once, paid order refunded automatically) or declines with a reason the buyer sees (order stays active). A request that arrives after the order shipped expires instead of cancelling. Shipped orders keep the existing return/refund policy.
- **Refund status for buyers, sellers and admins**: a refund card on the order page (amount, where it goes — GCash, Maya or card —, status, and a provider-based timeframe: e-wallets usually within 1 business day, cards usually 7-14 business days depending on the bank, per Xendit's help centre). "Completed" shows only after Xendit confirms it. A failed refund shows as "needs attention" to everyone and gives the seller/admin a Retry button (the database refuses a retry while one is pending or already succeeded). The cancelled order keeps `order_status = cancelled`; the refund is tracked separately (`payment_status`, refund attempts).
- **Reliability**: the 15-minute sweep now also sends refunds that never reached Xendit and re-opens up to 4 attempts when our own call to Xendit failed; the webhook and the sweep record a SUCCEEDED payment on an already-cancelled order and refund it (idempotent; amount, currency and payment-request id must match).
- **Reports**: a "Refunds pending" figure (refunds still in flight, plus those needing attention) beside the existing Gross / Refunds / Net, so payments received, pending refunds, completed refunds and net revenue can be told apart. Buyer activity feed gains cancellation-requested, cancellation-declined, refund-completed and refund-needs-attention events.
- Migrations (applied live): `20261024000000_return_reason_order_cancelled`, `20261024000100_order_cancellation_refunds`, `20261024000200_cancellation_activity_events` (rollback steps are in the header of the second). Tests: `supabase/tests/order_cancellation_refunds.test.sql` (26 scenarios in a rolled-back transaction: COD cancel, paid cancel, double click, refund confirmed, duplicate webhook, failed refund and retry, request/approve/decline, request going stale, late payment, report), `scripts/test-cancellation-refund.mjs` (in `npm run test:unit`) and `scripts/e2e-cancellation-refund.mjs` (Xendit test mode; creates and removes labelled records). See `docs/cancellation-refunds.md`.

### Changed (Seller Dashboard)
- **Seller Dashboard redesigned around tasks, shop performance and quick actions.** The page is now: header with four quick actions (Add product → the new-product form, Process orders, Update stock, Full reports with the dashboard's dates); a collapsible **Needs your attention** card (closed by default, arrow toggle, live counts incl. prepare/ship and return deadlines); **Shop performance** for the selected dates (Gross sales, Confirmed refunds, Net sales, Orders placed, each with a previous-period change and a "how is this calculated" panel, plus average order value, units sold, awaiting payment and cancelled, and the sales trend); then **Recent orders** (tabs: All, To confirm, To prepare & ship, Delivered) and a merged **Low stock** card sorted by paid units sold in the last 30 days. Default range is now 30 days (matches Reports). A seller without a shop sees an explanation instead of zeros. Removed from the dashboard (still on Reports/Products/Payments): Order status, Repeat customers, Total Products, Online Payments. `SellerKpiRow` and `SellerQuickAccess` were retired.
- **Fix: a promoted buyer's own purchases could appear on the Seller Dashboard.** RLS also returns orders the signed-in user placed as a buyer; dashboard counts, recent orders, receipt notifications, restock priority and repeat-customer stats now use the same shop owner filter as the Orders page (`getCurrentSellerOwner`). The topbar bell and the attention card share one task list (`getSellerTaskList`) so they cannot disagree. `getOrderAttentionCounts` gained `returnsDueSoon`, `toPrepare`, `inProcessing`; it and `getLowStockReport` are `cache()`-wrapped.
- Topbar order search now works (submits to `/seller/orders?search=`); bell/profile menus expose `aria-expanded` and close on Escape; the shared Drawer returns focus to its trigger.
- **Units sold counts paid orders only** (`20261023120000_units_sold_paid_orders_only.sql`, applied live): it previously included unpaid and cancelled orders while revenue did not. Changes the figure on Reports and its CSV.

### Added (Seller Dashboard)
- **Top products** card under the sales trend: the shop's five best sellers for the selected dates (ranked by units, paid orders, sales before refunds), each linking to the product editor. **COD cash to collect** now shows the peso total on the "Mark COD cash collected" task (new `codAwaitingCents` in `getOrderAttentionCounts`). **Orders overdue to ship**: confirmed/processing orders confirmed more than 2 days ago (`SHIP_OVERDUE_DAYS`) turn "Prepare and ship" red with a warning line (new `overdueToShip`).

### Added (returns)
- **Replacement/Exchange now takes stock off the shelf and ends in a confirmed state.** Shipping a replacement used to store only a tracking number: inventory was never reduced and the request never finished. Now `record_return_replacement_shipment` checks every line has enough stock (plain error "Not enough stock to ship the replacement… Restock first" and nothing is shipped or deducted when short), deducts it through a shared helper with a new ledger reason `replacement_shipment` (so replacements are counted separately from sales and shown as "Replacement shipped" in stock history), and moves the request to **Replacement shipped**. The buyer confirms with "I received my replacement" (`confirm_replacement_received`) → **Replacement completed**; if they don't, the 15-minute sweep completes it 7 days after shipping (`complete_overdue_replacements`). A replacement stays a non-sale: no payment, order status or revenue change; both in-progress replacement states count as open requests (no duplicate for the same item); `adjust_stock` reserves the new reason for system use. Migrations (applied live): `20261023010000_replacement_status_and_stock_reason` (enum values, committed first), `20261023010100_replacement_shipping_and_completion`. Verified with a rolled-back test on live data: zero stock blocked the shipment, a valid shipment moved stock 19 → 18 with one ledger row, `adjust_stock` rejected the reserved reason, a seller could not confirm for the buyer, the buyer's confirmation completed it, and an 8-day-old shipped replacement auto-completed. Not included: requiring the original item back before a replacement ships (size/fit cases), and a separate replacements figure on the Reports page (the stock ledger already separates them).
- **"Return and Refund" now has a real ship-back step; the refund waits for the item.** Before, approving a Return and Refund refunded immediately, so a buyer was paid without ever sending anything back. Now: seller accepts → admin approves as Return and Refund → **Awaiting return** (buyer has 5 days; the panel switches to a "Ship soon" warning with 2 days left) → buyer enters courier + tracking → **Return shipped** → seller (or admin) confirms it arrived and records whether it is sellable (a sellable item goes back into stock at that moment, a not-sellable one never does) → **Return received** → admin confirms the refund (COD → `refund_due` payout, Xendit → provider refund) → **Refunded**. A buyer who never ships is closed automatically (**Return expired**, nothing refunded) by a new pass of the 15-minute sweep. The admin can always step in: reject while awaiting/shipped/received, retry a failed Xendit refund (status stays "Return received"). Every status shows a plain "What happens next" line; sellers get an Action Center row ("N returned items shipped back") and admins a bell notification and quick-access count for received items. Money Refund and Replacement/Exchange are unchanged. Migrations (all applied live): `20261023000000_return_status_return_shipping_steps` (enum values, committed first), `20261023000100_return_shipping_columns_and_rpcs` (columns, one-open-request index now includes the new open states, `_restock_return_items` helper, `record_return_shipment` buyer RPC, `record_return_received` seller RPC, service-role `expire_overdue_return_requests`), `20261023000200_decide_return_return_shipping`; `record_return_item_condition` now uses the same restock helper (no second restock path). Verified with rolled-back tests on live data: approve → awaiting_return (5-day deadline); seller can't receive before shipping, a non-buyer can't ship, admin can't refund before receipt; buyer ship → seller receive restocked stock 19 → 20 → COD refund_due → payout → refunded; an overdue request expires once and a second sweep does nothing. Not included yet: partial refunds after a damaged return (admin can refund in full or reject), refunding shipping only when the seller is at fault, and email reminders (the day-3 reminder is in-app).

### Changed
- **COD refunds are no longer marked refunded without proof of payout.** Cash can't be returned through the app, yet approving a COD return used to flip the payment, order and return to "refunded" instantly. Now `decide_return` (COD branch) moves the request to a new `refund_due` status ("Refund approved — payout pending") and reserves the amount; payments/orders are untouched. A new admin form (`RecordCodRefundPayoutPanel`, in the admin returns queue and on the admin order page) records how the buyer was paid (GCash, bank transfer or cash) and a reference, via the admin-only `record_cod_refund_payout` RPC, which then finalises the refund exactly as before (payment/order status, return `refunded`) and writes an audit-log entry. The buyer sees the approved amount while pending and the payout method/reference afterwards. `refund_due` counts as an open request (the one-open-request-per-item index now includes it), shows in the seller queue under "Waiting on admin", and adds an admin bell notification and quick-access count. Migrations: `20261022180000_return_status_refund_due.sql` (enum value, committed first) and `20261022180100_cod_refund_payout.sql` (columns, index, both RPCs; applied live in four smaller steps). Online (Xendit) refunds are unchanged. Verified under RLS with a rolled-back test: approve → `refund_due` with the order still `paid`; blank reference, invalid method, a second payout and a buyer attempt were all rejected; a valid payout moved the payment, order and return to refunded.
- **Sales reports are now refund-aware (Gross, Refunds, Net).** Revenue used to count only orders whose payment was still `paid`, so a fully or partly refunded order silently disappeared and no refund figure existed (and refunded orders fell back to "COD" in the payment-method counts). `report_sales_summary` and `report_sales_timeseries` (`20261022170000_refund_aware_sales_reports.sql`, applied live) now count every order that was ever paid, subtract confirmed refunds on those orders (cohort basis: orders placed in the range) and expose `gross_revenue_cents`, `refunds_cents` and `refunded_orders`; `revenue_cents` is net, so every revenue KPI and the trend chart become net automatically and agree with each other. The Reports page shows Net revenue (with gross − refunds) and a Refunds card. Original orders and payment rows are never modified. Checked live against the real data: 110 paid orders, gross ₱133,702.00, refunds ₱299.00, net ₱133,403.00, and the summary equals the trend-chart total.
- **Unpaid online orders are released after 60 minutes instead of 24 hours** (GCash, Maya and Card; COD is never expired). An abandoned checkout no longer holds its stock for a day: `expire_unpaid_xendit_order` now uses a 60-minute threshold (`20261022150000_shorten_unpaid_order_expiry.sql`, applied to the live database), the sweep runs every 15 minutes instead of daily, and Xendit's real status is still re-checked before any cancellation so a payment that is still resolvable is never discarded. Settings and docs updated.

### Added
- **Refunds no longer depend only on a webhook.** Xendit had already refunded two returns (one 24 days ago, one minutes before this change) while our database still showed them `pending`, because no `refund.*` webhook arrived. New `getRefundStatus` (`GET /refunds/{id}`) plus `reconcileXenditRefund` ask Xendit for the real status and apply it through the same `process_xendit_refund_webhook` RPC the webhook uses (idempotent, so a late webhook is harmless). It runs right after an admin approves a refund and as a third pass of the 15-minute sweep (refunds older than 5 minutes, up to 20 per run). It never creates or retries a refund. Setup note: also tick the refund events for the webhook URL in the Xendit dashboard.
- **"Waiting for payment" notice on the Orders page** (`UnpaidOrdersNotice`): shows how many unpaid online orders the buyer has and that they auto-cancel after 60 minutes, linking to the To Pay tab where each order already has Complete Payment and Cancel.

### Fixed
- **"Submit report" failed with "Failed to upload evidence photo" on refund/return requests.** Root cause: the QR-payment removal (`20260905155806`) dropped the only INSERT policy on the `payment-receipts` bucket, but return requests reuse that private bucket for evidence photos, so Storage RLS rejected every upload. New migration `20261022160000_restore_return_evidence_upload_policy.sql` (applied to the live database) lets an order's own buyer insert only objects named `<order id>/return-*` (QR-style receipt uploads stay closed; bucket limits of 5 MB jpeg/png/webp still apply). Verified under RLS: buyer return file allowed, buyer receipt-named file denied, another user denied. The upload path's file extension now comes from the validated MIME type instead of the client filename.
- **Abandoned card form no longer blocks "Pay with Card" for up to 30 minutes.** The card session is created when the form opens, so leaving without paying left an unpaid session that made every retry fail with "A card payment is already in progress". New `releaseAbandonedCardAttempt` (single order and group): within 2 minutes of the form opening the guard still applies; after that it asks Xendit first, applies a completed/expired/cancelled session as usual (a real payment is never overwritten), and only marks the attempt abandoned when Xendit still reports it `ACTIVE` (unpaid) so a fresh form can start. If Xendit can't be reached it stays blocked. Switching from an abandoned card form to GCash/Maya uses the same release (`findBlockingOtherChannelAttempt`); an unfinished e-wallet attempt is never released early.
- **Paid card orders stayed "Unpaid" until a webhook arrived; now confirmed in real time.** Xendit reported the card session `COMPLETED`, but the database only learned of payments from the webhook (none had arrived), and the card form left the page as soon as it was submitted. New `confirmXenditPaymentAction` asks Xendit for the attempt's real status and applies it through the same `process_xendit_webhook` RPC (RLS-scoped lookups, rate-limited, never trusts the client). A new `PaymentStatusWatcher` polls it every ~2.5 s (up to 2 min, with a "Check again" button): the card form now waits for confirmation before moving on, and the order page and the payment page show "Confirming your payment..." and update by themselves, which also heals orders that were already stuck. The webhook remains the primary path; this is the safety net. The payment page also now uses the payment's own checkout-group id when reconciling.
- **Netlify deploy blocked by the secret scan.** Turbopack's build cache (`.next/cache/turbopack`) records the values of env vars the build reads, so Netlify found `CRON_SECRET` and `XENDIT_WEBHOOK_TOKEN` in it and failed an otherwise successful build. The build cache is now off (`turbopackFileSystemCacheForBuild: false`); scanning stays on.
- **Paid e-wallet orders stayed "Payment Pending" when the webhook was late or unreachable.** Coming back from Xendit (`?xendit_return=1`), the payment page now asks Xendit for the real status and applies it through the same `process_xendit_webhook` RPC the webhook uses, then moves a paid order to its order page. Xendit stays the only source of truth.
- **Card form stuck on "Loading card form..." in development.** React Strict Mode's mount/cleanup/mount cancelled the one auto-started card session; cleanup now only tracks whether the component is on screen. A rejected session request now shows an error instead of spinning.
- **Card payments need HTTPS.** Xendit's card Sessions API rejects `http://` return URLs and origins (confirmed live), so card can't start on `http://localhost:3000`. The app now says so plainly, and `npm run dev:https` serves local HTTPS (set `NEXT_PUBLIC_SITE_URL=https://localhost:3000`). GCash and Maya are unaffected.

### Added (deployment)
- **Netlify setup.** `netlify.toml` (build + Node 22), a scheduled function `netlify/functions/xendit-reconciliation.mts` that replaces the Vercel Cron job (daily 03:00 UTC, calls the existing sweep route with `CRON_SECRET`), and a step-by-step guide in `docs/deployment-netlify.md` (environment variables, Supabase redirect URLs, Xendit webhook, smoke test). No application code changed; `vercel.json` is kept.

### Changed
- **Shops are mixed on the Products page.** In the default "Recommended" order, products from different shops now alternate (Shop One, Shop Two, ...) instead of one shop's block after the other. Products with size/color options still come first; order within each shop is still newest first. Not random, so a page looks the same every time.

### Added
- **Clearer stock limit and Undo when buying.** The quantity stepper (product page, options sheet, cart) now says "Maximum available: N" when "+" is greyed out, and a typed quantity above stock is cut to the maximum instead of failing later. The "Added to cart" toast has an **Undo** button that puts the cart back to what it held before that tap. Front-end only; server stock checks are unchanged.
- **Add every color and size in one step.** When a product's category offers both color and size, the Options section now has "Add colors and sizes together": enter the colors and sizes (or tick the category's size list) and it creates every missing color x size option. Each starts with **0 stock** - nothing is invented - and pairs that already exist are skipped. At most 60 options per batch.
- **Options of one product must use the same choices.** A product can no longer get a color-only option next to size-only options (no buyer could pick both on the product page). Enforced when options are added, in the editor and on the server.
- **Move unassigned stock into options.** Inventory marks a product's own stock row as **Unassigned stock** once the product has options (it is not sold, and no longer counts as low stock) and offers **Move to options**. The move is one transaction that takes exactly what it adds to the options off the unassigned count, so the total never changes; it refuses to move more than is unassigned. Migration `20261022040000_variant_stock_allocation.sql` (new `allocate_stock_to_variants` RPC).
- **Guided Selection no longer drops products with no size or color data.** When a buyer asks for a size or color a product has no data for, it is shown last as "Size not confirmed - check with the seller" instead of disappearing or being claimed as a match. It must still be in stock, in budget and match every other answer. See ADR-024.

### Changed
- **Set stock right after adding colors and sizes.** The generator now follows up with a box listing the new options with a number field each, so they are not left at 0 (sold out) by accident. Only the numbers entered are saved, as a Restock through the normal stock-adjustment path; blanks stay at 0.
- **Products page: options first, 20 per page.** The shop's Products listing now shows 5 rows of the 4-column grid (20 products) instead of 12, and its new default sort, **Recommended**, puts products with size/color options first (newest first within each group). **Newest** is still available in the sort menu. Dashboards keep their own page size.
- **A product's sold/active status follows its option stock.** A product with options now flips to sold only when all its options are out of stock, and a base-row change no longer flips it (previously option stock was ignored, so a product with stock in its options could be marked sold). Same migration as above. For those products `products.quantity` is now the combined option stock. Products without options are unchanged.
- **Existing products given color options.** 34 listings whose title states the color (e.g. "Plain short blue") now have that color as an option, with their whole stock moved into it (586 units before and after). "men's textured semi formal wear" and "Slim fit chino shorts" had color-only and size-only options mixed; their sizes are now Blue x size and the color-only row is archived. Each keeps 13 unassigned units for the seller to move into sizes. Sizes were not added to any other product - none are confirmed. Proposal and product list: `docs/plans/product-variants-data-proposal.md`.

- **Bulk order actions for sellers (and admins) on the Orders list.** Each stage now has a review-then-confirm bulk action in the selection bar, all reusing the single-order status path and its checks (ownership, allowed transition, unpaid-online guard), capped at 100 per batch and reporting failures per order instead of stopping: **Confirm N eligible** on Pending (skips unpaid online orders and says so, instead of greying out when one selected order is ineligible); **Mark N ready for pickup** on To Pack (review panel listing every order's items plus an "I've checked these items" tick; the per-order checklist/scan on the order page is unchanged); **Mark N shipped** on Ready for Pickup (one courier for the batch, one tracking number per order, duplicate numbers in a batch are blocked — tracking stays required); **Mark N delivered** on Shipped (review panel with courier, tracking and days in transit; delivery is final, so it needs an acknowledgement). The header checkbox on each of those tabs selects only orders the bulk action can move. COD cash collection stays a separate step, and "Report failed delivery" stays one order at a time. No schema change. New actions: `bulkMarkReadyForPickupAction`, `bulkMarkShippedAction`, `bulkMarkDeliveredAction`.
- **Scan a To Pack label to confirm packing.** Scanning from the Orders list now opens a popup (order number, buyer, items) with **Mark ready for pickup** / **Open order** / **Close** instead of just navigating away. Scanning alone never changes an order. The order-page checklist flow is untouched; Ready for Pickup scans still jump to the courier/tracking form.
- **Orders list shows status-specific details.** Shipped tab: courier, tracking number and days in transit. Delivered tab: days since delivery and days left in the buyer's return window, plus a pointer to Payments for COD collection. Cancelled tab: who cancelled, when, and why. Read-only; new `listOrderShipments` query loads the Shipped page's shipments in one request.
- **Seller Returns queue tabs and pagination.** `/seller/returns` now opens on **Needs my action** (respond, record item condition, ship a replacement) with **Waiting on admin**, **Closed** and **All** tabs, counts, and 10 per page. The admin queue is unchanged.
- **More on Admin Settings.** "Sign out of other devices" under Security; a "Recent settings changes" list (who, when, and which fields changed, from the audit log); and optional business address and hours, shown in the storefront footer under Help. New migration `20261022030000_platform_settings_business_details.sql` adds the two columns and replaces `admin_update_platform_settings` with a 4-argument version. **Apply the migration before deploying this code** — until then the footer falls back to the default contact details and saving the Store contact form fails. Connecting/disconnecting Google or Facebook is intentionally not offered to admins yet: that flow returns to the buyer `/privacy` page.
- **Admin Settings page.** `/admin/settings` replaces "Coming soon" with: My account (name, phone, photo) and Security (password) — the account form moved from the seller feature to a shared `PortalAccountForm`, so seller and admin use the same one; Store contact (support email + phone), shown in the storefront footer under Help; a read-only reference of the fixed platform policies (return window, unpaid-order expiry, guest cart expiry, low-stock threshold); and a link to the audit log. Contact changes go through the new admin-only `admin_update_platform_settings` RPC and are recorded in the audit log ("Updated platform settings"). New additive migration `20261022020000_platform_settings.sql` (singleton `platform_settings` table, public read, RPC-only writes). **Apply the migration before deploying this code**; until then the footer falls back to the built-in contact details and the settings page shows a load error for that card. **Known limitation:** the policy values are not editable — they are hardcoded in several SQL RPCs (see TD-8).
- **Bulk shipping-label printing uses one scoped order lookup.** Selected orders are loaded together, in their selection order, instead of launching a separate database request for every label. Lookup errors now surface as errors instead of being mistaken for an empty label set, and opening the bulk page without selected orders explains how to start.

### Fixed
- **Seller orders stay within the seller's shop.** The seller order list and CSV export now apply the same owner scope as label printing, so purchases from other shops no longer appear as seller orders. Admin order views remain global.
- **Seller order warnings.** ZXing's browser package now has its required library peer as a direct dependency, and the shared bulk-selection cap no longer comes from a client component. The theme toggle waits until hydration before marking the saved theme active, avoiding the reported server/client mismatch.
- **Order date/time, everywhere buyer and seller look for it.** The buyer's "My Orders" list cards showed no date at all before — they now show "Placed {date, time}". Every place that already showed a date (order detail header, seller/admin order tables + CSV export, the printable receipt and shipping label, the shipment tracking card, return/refund request cards) now shows the time too, not just the date. The order status timeline (Pending → Confirmed → Processing → Shipped → Delivered, shown to buyer, seller, and admin) now shows a timestamp under each step that has actually happened, instead of only highlighting the current step with no times at all. New additive columns `orders.confirmed_at`/`orders.processing_at` (migration `20261022000000_order_confirmed_processing_timestamps.sql`), stamped by the existing `track_order_status_timestamps` trigger the same way `shipped_at`/`delivered_at`/`cancelled_at` already are. **Known limitation:** orders that were already past Confirmed/Processing before this migration have no real historical timestamp to show for those two steps — there is nothing to backfill, so the timeline simply omits the time for those older orders rather than inventing one.
- **Buyer Privacy & Settings: download your data and sign out of other devices.** A new "Your data" section lets a buyer download a JSON file with their profile, addresses, preferences, order history (items, totals, delivery address, dates) and wishlist size; the file is built from an explicit allow-list so internal ids never leave the system, and exports are rate-limited. Security now has "Sign out of other devices", which ends every other login on the account (current device stays signed in) after a confirmation. No database change.
- **Add to Cart tells you what is in the cart, and can't be raced past stock.** Every add now says the new total ("Added to cart…", or "Already in your cart (2). Added 1 more — you now have 3."), adds "That's all we have." when the last unit goes in, and the product page shows "N in your cart" with a "View cart" link; the button becomes "Add another", and "All in your cart" (disabled) once all the stock is in the cart. For signed-in carts the add is now a single atomic database step (`add_cart_item`, migration `20261015000000_add_cart_item_atomic.sql`): concurrent adds for one cart — two tabs or devices — are serialised and can no longer push the cart past stock. **Apply the migration before deploying this code.** It adds a function only (SECURITY INVOKER, no grants on tables). The guest-cart merge on sign-in is unchanged.
- **Choose-your-options sheet and a reliable Add to Cart / Buy Now.** On a product with options (color, size, …), Add to Cart and Buy Now are no longer dead buttons: pressing one before everything is chosen opens a responsive sheet (bottom sheet on phones, dialog on larger screens) pre-filled with what is already picked, with live price (a range until fully chosen), stock, a quantity stepper capped at stock, color swatches with photos, and plain-language messages for what is missing. Options that don't exist or are out of stock are disabled; picking the chosen value again clears it. The sheet is keyboard- and screen-reader-friendly (focus trap, Escape, labelled groups).
- **Add to Cart** adds the exact option and quantity, shows a success notice with a "View cart" link, and leaves the buyer on the product page. Stock is checked including what is already in the cart (on the server too, for signed-in carts — previously an over-add was accepted and only flagged at checkout), and a second click while the first is in flight, or right after, is ignored.
- **Buy Now** now goes straight to checkout for just that product, option and quantity (`/checkout?buyNow=…`) without changing the cart; price and stock are re-read on the server, and a bad or stale link says why. After the order, Back doesn't return to the same checkout. ADR-023.
- Product tiles (catalog and homepage) send a product that has options to its page instead of quick-adding a plain line, and report stock problems in a notice. "Buy again" keeps the option a line was bought with.

### Fixed
- **Orders list filters (Status, Payment method, Date placed) now actually refresh.** Same root cause as the Dashboard/Reports date-filter fix above, just a different screen: re-selecting an already-active filter resolved to the exact same URL, which Next.js treats as a no-op (no refetch) — so a seller whose orders table had gone stale (an order's status changed elsewhere since the page loaded) saw no change from re-clicking a filter, including "Print labels" looking available for an order that, by print time, no longer qualified. `OrderStatusFilter`, `OrderMethodFilter`, and `OrderDateFilter` (shared by buyer, seller, and admin order lists) now call `router.refresh()` in that case. No database or query change.
- **Guest cart no longer outlives the guest.** On a shared/public device, items a signed-out visitor added could sit in the browser's local storage indefinitely — days or weeks later, the next person to use that device would see a stranger's cart. The guest cart now carries a `savedAt` timestamp and is cleared the next time the site loads if it's gone 24h with no activity (add/remove/quantity change resets the clock, so an actively-shopping guest is never cut off mid-session). Signed-in carts are unaffected (server-sourced, not local storage). No schema change; carts saved before this fix (no `savedAt` yet) are treated as freshly saved rather than wiped on sight.
- **Dashboard/Reports "Today" (and any already-active date range) now actually refreshes.** Re-clicking a preset — or picking a date that resolves to the same range already shown — built the exact same URL, and Next.js treats navigating to an unchanged URL as a no-op: no new request, no refetch, so a just-placed order wouldn't appear until some other click happened to change the URL (e.g. switching to 7D and back), which looked like the dashboard "wasn't real-time." `DashboardDateFilter` (Overview KPIs) and `ReportsFilters` (`/dashboard/reports`) now detect that case and call `router.refresh()` instead, forcing a real server round-trip. The Overview's date filter also now states "Dates use the Asia/Manila day boundary," matching the Reports page, since near a day boundary — or testing from outside Manila — "Today" looking short is expected behavior, not a bug. No database or query change; `report_sales_summary`'s Manila-day bucketing was verified correct against live data.
- **Google/Facebook sign-in now lets you pick a different account.** After signing out, clicking "Continue with Google" (or Facebook) silently re-signed in to whichever account was still active in the provider's own browser session, with no account picker shown — our sign-out only ends this app's session and never touched Google/Facebook's. The OAuth request now asks the provider to show its account chooser (`prompt=select_account` for Google, `auth_type=reauthenticate` for Facebook), for both sign-in and linking a new identity from Connected Accounts. No database or permission change.
- **Orders list shows what was bought.** The seller/admin orders table (and its mobile cards) now shows the purchased products' photos (up to three, plus "+N") and a line such as "Vintage Jacket Demin ×2 (Blue / M) +1 more", instead of an initials avatar and "N items". When the buyer's profile can't be read (a shop co-member's order), the delivery name on the order is shown instead of "Unknown buyer"; the same name is used on the order detail pages. No database or permission change.
- **Change password (buyer and seller).** The current-password check signs in through Supabase Auth, which enforces captcha, but sent no captcha token — so with captcha on, every attempt failed and was reported as "Your current password is incorrect". The form now carries a Turnstile token, and only a genuine bad-credentials error says "incorrect password" (captcha and other failures have their own messages). Accounts that only sign in with Google/Facebook have no password to change, so they see guidance instead of a form that can never succeed. Fields clear after a successful change. The buyer and seller pages now share one `ChangePasswordForm` (seller uses the themed variant); the separate seller form was removed.
- **Profile photo upload.** A rejected photo now shows the real reason (for example "Image must be 1MB or smaller.") instead of only "Please correct the highlighted fields.", and a JPEG/PNG over 1MB is shrunk in the browser to a JPEG under the limit before uploading, so ordinary phone photos work. Applies to the buyer and seller profile photo (`AvatarUploader`); the server-side 1MB/JPEG/PNG checks are unchanged.
- **Seller "Profile Settings" no longer bounces to the homepage.** The seller top-bar menu and sidebar profile card linked to the buyer-only `/profile`, whose layout redirects sellers and admins. They now open a new **Seller Settings** page at `/seller/settings` with Account (photo, name, phone; email read-only), Security (change password) and a read-only My shop summary linking to branding. Buyer account pages are unchanged and still buyer-only. Fields the form does not show (username, bio, gender, date of birth) are carried as hidden inputs so saving never blanks them.

### Changed
- **Notifications settings shows only what works.** The four "Coming soon" switches (promotions, push, email, SMS) are hidden, leaving Order Updates and a short note; the database columns are unchanged.
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
