# MODULES.md — Module Reference

> [!IMPORTANT]
> **Read this first.** This is the authoritative map of module ownership: what each module is for, what it owns, and exactly how built it is. Use it to answer *"where does X live?"* and *"is Y already built?"* before writing code.
>
> Business purpose → [README.md → Core Modules](./README.md#core-modules) · Technical design → [ARCHITECTURE.md](./ARCHITECTURE.md) · Why each module is shaped this way → [DECISIONS.md](./DECISIONS.md) · Standards for touching a module → [CLAUDE.md](./CLAUDE.md).
>
> For the canonical **Target vs Current** mapping (roles, tables, payments, cart) referenced throughout the rows below, see [README.md → Implementation Status](./README.md#implementation-status-target-vs-current) — it is not repeated per-module here.

**Status legend:** ✅ Completed · 🚧 In Progress · ⏳ Upcoming (stub only)

---

## 1. Authentication

| Field | Detail |
|---|---|
| **Purpose** | Let Guests become Customers (and staff sign in) securely: registration, login, logout, email verification, password reset. |
| **Responsibilities** | Session issuance/refresh; credential validation; safe error messaging (no account enumeration); redirect-after-auth handling. |
| **Features** | Sign up, sign in, sign out, forgot password, reset password, email verification (PKCE), role-aware post-login redirect, Google/Facebook OAuth sign-in, manual account linking. |
| **Pages** | `src/app/(auth)/{sign-in,sign-up,forgot-password,reset-password}/page.tsx`; `src/app/auth/callback/route.ts` (PKCE exchange for email links, OAuth sign-in, and OAuth account linking — not a page). |
| **Components** | `features/auth/components/forms/{LoginForm,RegisterForm,ForgotPasswordForm,ResetPasswordForm}`; `fields/{EmailInput,PasswordInput}`; `layout/{AuthCard,AuthHeader,AuthFooter,AuthLayout,EditorialPanel}`; `feedback/{VerificationPending,AuthSuccessState}`; `social/{SocialLoginButtons,SocialButton,Divider,icons}`; `AuthButton`. Account linking UI lives in the Customer Account module: `features/account/components/{ConnectedAccounts,UnlinkIdentityButton}`. |
| **Server Actions** | `features/auth/actions/auth.actions.ts` — `signInAction`, `signUpAction`, `signOutAction`, `signInWithOAuthAction`, `requestPasswordResetAction`, `updatePasswordAction`, `resendVerificationAction`. Linking lives with the Account module: `features/account/actions/account.actions.ts` — `linkIdentityAction`, `unlinkIdentityAction`. |
| **Services** | `lib/supabase/queries.ts` (auth section) — `signInWithPassword`, `signUpWithPassword`, `signInWithOAuth`, `signOut`, `sendPasswordResetEmail`, `updatePassword`, `resendVerificationEmail`, `getSessionUser`, `listUserIdentities`, `linkOAuthIdentity`, `unlinkOAuthIdentity`. |
| **Database Tables** | `auth.users`/`auth.identities` (Supabase-managed) · `profiles` (via `handle_new_user` trigger, auto-creates a `buyer` profile row; reads Google's and Facebook's differently-named metadata keys). |
| **Dependencies** | `src/proxy.ts` (session refresh + route gating), `src/constants/routes.ts` (`AUTH_ROUTES`, `PROTECTED_ROUTE_PREFIXES`), `auth-errors.ts` (error mapping, incl. OAuth callback codes). |
| **Current Status** | ✅ Completed, including Google/Facebook OAuth. Account-matching for OAuth is entirely Supabase Auth's (GoTrue's) own verified-email identity linking — this app never implements its own email-based account matching (see [DECISIONS.md](./DECISIONS.md) for the rationale). Manual linking (Connected Accounts on `/profile`) is the sanctioned fallback for cases automatic linking can't safely cover, e.g. Facebook without a provider-verified email. |
| **Future Work** | Seller self-upgrade flow — explicitly out of scope today (see [README.md → Out of Scope](./README.md#out-of-scope)). Retroactively merging an already-separate duplicate account's order history into a primary account (created when Facebook auto-linking didn't apply) is a manual admin data-migration operation, not built. |

---

## 2. Marketplace

| Field | Detail |
|---|---|
| **Purpose** | The unified storefront experience across all three shops: the landing page and category browsing that make three shops feel like one marketplace. |
| **Responsibilities** | First-impression storefront (hero, featured products/shops, marketplace value props); category-based discovery; entry point into Products. |
| **Features** | Landing hero, featured products/shops, marketplace features section, animated stats, category grid, guided-selection preview teaser. |
| **Pages** | `src/app/(marketing)/page.tsx` (home); `src/app/(shop)/categories/page.tsx`, `categories/[slug]/page.tsx`. |
| **Components** | `features/landing/components/*` (Hero, FeaturedProducts, FeaturedProductsGrid, FeaturedShops, MarketplaceFeatures, SmartAssistantPreview, LandingNavbar, LandingFooter, AboutSection, AnimatedCounter, AnnouncementBar, BackToTop, EditorialBanner, MarqueeBand, ProductCategories, Reveal); `features/categories/components/{CategoryCard,CategoryGrid}`. |
| **Server Actions** | None (read-only, presentational). |
| **Services** | `lib/supabase/queries.ts` (landing stats + categories sections) — `getMarketplaceStats`, category listing queries. |
| **Database Tables** | `categories`, `products` (aggregated), `profiles` (featured-shop placeholder data — see caveat below). |
| **Dependencies** | Products module (links into product listing/detail); no direct dependency on Cart/Checkout. |
| **Current Status** | ✅ Completed (`landing-page-implementation-plan.md` marked Implemented 2026-08-03). |
| **Future Work** | "Featured Shops" is currently a **documented placeholder** — there is no `shops` entity yet (see [DECISIONS.md → ADR-001](./DECISIONS.md#adr-001-marketplace-scoped-to-three-sibling-shops)); wire it to real shop data once the target schema lands. |

---

## 3. Products

| Field | Detail |
|---|---|
| **Purpose** | The product catalog: listing, search, filtering, and detail pages for finished-garment inventory across the three shops. |
| **Responsibilities** | Catalog browsing UX; search/filter/pagination; product detail presentation; related-product suggestions; optional per-product color/size variants. |
| **Features** | Catalog grid with pagination, filters, search input, breadcrumbs, product detail gallery, related products. Optional variants: a product may have zero or more color/size variant rows (SKU, optional price override — inherits the parent product's price when unset); a buyer selects a variant on the PDP before adding to cart; stock is tracked independently per variant through the existing Inventory module (no separate variant-stock system). When exactly one variant axis is active and its category picklist (`allowed_values`) is set, the seller ticks values from a checklist (`ProductVariantChecklist`) instead of typing them; multi-axis and free-text axes keep the manual form (no combination matrix). A seller may tag a photo to a color (`product_images.variant_id`, nullable = shared); the PDP gallery then shows that color's photos (`ProductSelectionProvider` shares the selected color between the selector and the gallery), falling back to the shared photos when none are tagged. |
| **Pages** | `src/app/(shop)/products/page.tsx`; `products/[slug]/{page,loading,not-found}.tsx`. |
| **Components** | `features/products/components/{Breadcrumbs,CatalogHeader,PaginationControls,ProductCard,ProductFilters,ProductGallery,ProductGrid,ProductGridSkeleton,ProductListSection,ProductSearchInput,RelatedProducts,ProductQuantityAndAddToCart,ProductSelectionProvider,ProductVariantManager,ProductVariantChecklist,ProductVariantRow}`; pure helper `lib/utils/variant-images.ts`. |
| **Server Actions** | `features/products/actions/product.actions.ts` — create (seller-only)/update/archive (guarded by `requireRole`); `features/products/actions/product-variant.actions.ts` — create/update/delete a variant, same role guard; `product.actions.ts` also holds `setProductImageVariantAction` (tag/untag a photo), consumed by the Shop Owner Portal (`/seller/*`) and Admin Portal (`/admin/*`). |
| **Services** | `lib/supabase/queries.ts` (products section) — `getProductBySlug` (React `cache()`), listing/search/filter queries, `toProduct` mapper; (product variants section) — `listProductVariants`, `listDashboardProductVariants`, `createProductVariant`, `updateProductVariant`, `deleteProductVariant`, `setProductImageVariant`, `getVariantStock` (public-safe stock lookup for the PDP, since `inventory` itself isn't publicly readable). |
| **Database Tables** | `products`, `product_images` (optional `variant_id` tag), `categories` (FK), `product_variants` (nullable per-product; a variant's stock lives in the existing `inventory` table, keyed by `variant_id`, not a separate table). |
| **Dependencies** | Marketplace (entry point), Cart (add-to-cart, variant-aware), Inventory (owns stock, including per-variant stock; `products.quantity` is a synced mirror — see [Inventory](#4-inventory)). |
| **Current Status** | ✅ Completed for browsing/detail and for Shop Owner/Admin management (see [Admin](#11-admin) and [Shop Owner](#12-shop-owner)), including variants. |
| **Future Work** | Variant-specific photos are tagged per color only (a photo tagged to one variant covers every variant of that color; deleting that variant re-points the tag to another variant of the same color, and only clears it when none is left). A full N-axis combination matrix / bulk price-stock grid is deliberately not built. |

---

## 4. Inventory

| Field | Detail |
|---|---|
| **Purpose** | Track and adjust stock levels per shop so updates happen once, centrally — solving the SAD's "inventory updates are repetitive and slow" problem. |
| **Responsibilities** | Stock level tracking per product; low/out-of-stock visibility; manual stock adjustment (restock/correction/shrinkage/other) by shop owners/admin; append-only stock movement history; keeping `products.quantity` accurate for every other module without those modules changing. |
| **Features** | Dashboard stock list (cross-shop for admin, own-shop for a seller — same page, role-branched, per the Admin/Shop Owner "role-scoped view" convention below); manual stock adjustment with a required reason and optional note; per-product stock history panel; in-stock/low-stock/out-of-stock status derived from `quantity` vs. a per-product `low_stock_threshold`; automatic restock on order cancellation; automatic `sold ⇄ active` status sync. |
| **Pages** | `src/app/admin/inventory/page.tsx` and `src/app/seller/inventory/page.tsx` — same shared `InventoryTable` and query, role-scoped by owner (`null` for admin, `{sellerId, shopId}` for seller); `src/app/dashboard/inventory/page.tsx` is a legacy redirect to whichever applies. |
| **Components** | `features/inventory/components/{InventoryTable,InventoryRow,StockStatusBadge,StockAdjustmentForm,StockHistoryPanel}`. |
| **Server Actions** | `features/inventory/actions/inventory.actions.ts` — `adjustStockAction` (guarded by `requireRole(DASHBOARD_ROLES)` + rate limiting), `getStockHistoryAction`. |
| **Services** | `lib/supabase/queries.ts` (inventory section) — `listDashboardInventory`, `getInventoryForProduct`, `adjustStock` (wraps the `adjust_stock` RPC), `listStockAdjustments`. `updateProduct()` (Products module) reroutes any submitted `quantity` through `adjustStock()` first, so the generic product-edit form still works but every stock write funnels through one audited path. |
| **Database Tables** | Dedicated `inventory` (one row per product, or one row per product **variant** when the product has variants — `variant_id` is nullable and keys the variant-level row; `quantity`, `low_stock_threshold`) and append-only `stock_adjustments` (audit log — delta, previous/new quantity, reason, note, related order, actor, same optional `variant_id`). `products.quantity` remains as a trigger-synced, read-only-by-convention mirror for the non-variant case (column-level `REVOKE UPDATE` for `authenticated`) so every buyer-facing read path (PDP, catalog tiles, cart, `getProductsPriceAndStock`) is unaffected; it is intentionally **not** kept in sync once a product has variants (see [ARCHITECTURE.md → Current Database Mapping](./ARCHITECTURE.md#current-database-mapping-target-vs-current)). |
| **Dependencies** | Products (`products_seed_inventory`/`products_sync_inventory_shop` triggers keep an inventory row in lockstep with every product); Orders (`create_order` locks/decrements `inventory`; an `orders_restock_on_cancel` trigger restocks automatically on cancellation — no change needed in `order.actions.ts`). |
| **Current Status** | ✅ Completed. Resolves ARCHITECTURE.md TD-2. |
| **Future Work** | A failed/rejected QR payment does not restock today — deliberately deferred as ARCHITECTURE.md TD-9 pending a Payments-module business-rule decision. Multi-location stock (the `inventory` schema's 1:1 product:row shape leaves room for this without a breaking change) is unplanned/speculative — do not build ahead of a stated need. |

---

## 5. Cart

| Field | Detail |
|---|---|
| **Purpose** | Hold products from any of the three shops in one place before checkout — the "unified cart" the SAD calls for. For a guest, ephemeral and browser-local; for a signed-in account, the same cart follows them across browsers/devices. |
| **Responsibilities** | Add/remove/update line items (product- or variant-level); expose totals to Checkout; for guests, persist across page loads on the same browser only; for authenticated users, persist server-side, isolated per account. |
| **Features** | Add to cart, quantity update, remove item, cart summary, selective (per-line) checkout, variant-aware line identity (`productId`+`variantId`). Guest cart persists to `localStorage`. Authenticated cart persists to the database and is folded together with any leftover guest cart the moment the buyer signs in (matching lines sum, new lines are added — see [DECISIONS.md → ADR-020](./DECISIONS.md#adr-020-authenticated-cart-becomes-database-backed-with-guest-cart-merge-on-sign-in)). |
| **Pages** | `src/app/(shop)/cart/page.tsx` (intentionally **public** — see [DECISIONS.md → ADR-013](./DECISIONS.md#adr-013-guest-cart-is-client-side-only); the page itself doesn't change based on guest vs. authenticated, only where `CartProvider` reads/writes). |
| **Components** | `features/cart/components/{AddToCartButton,BuyNowButton,CartSummary,CartPreview,CartRecommendations}`. |
| **Server Actions** | `features/cart/actions/cart.actions.ts` — authenticated-cart CRUD (`getMyCartAction`, `addToCartAction`, `updateCartItemQuantityAction`, `removeCartItemAction`, `removeManyCartItemsAction`, `clearCartAction`, `mergeGuestCartAction`), each resolving the caller via `requireSessionUser()` — never a client-supplied id; plus public reads usable by guests (`checkCartAvailabilityAction`, `getCartRecommendationsAction`, `getSimilarProductsAction`). Guest-only cart mutations stay entirely client-side (no action involved). |
| **Services** | `features/cart/providers/CartProvider` (Context) — forks on the resolved identity: guest reads/writes `localStorage` via a `useReducer` exactly as before; an authenticated identity reads/writes through the Server Actions above, reconciled by refetching the full cart after every mutation. `features/cart/hooks/useCart`, `features/cart/utils/cart-reducer` (the guest-path reducer; also defines the shared `productId`+`variantId` line-identity helpers). `lib/supabase/queries.ts` (cart section) — `getOrCreateCart`, `listCartItems`, `addCartItem`, `updateCartItemQuantity`, `removeCartItem`, `removeManyCartItems`, `clearCart`, `mergeGuestCart`. |
| **Database Tables** | `carts` (one row per authenticated user) and `cart_items` (`product_id`, nullable `variant_id`, `quantity` — no price/stock stored, always resolved live). Plain RLS, `user_id = auth.uid()`, **no admin or seller override** — same precedent as `addresses`/`wishlists`. Guest carts still have no server-side table, by design. |
| **Dependencies** | Products (source of line items, including variants); Checkout (consumes cart state, groups by seller); Authentication (resolves the signed-in identity that selects guest vs. database-backed storage). |
| **Current Status** | ✅ Completed — guest cart (client-side, unchanged) and authenticated cart (database-backed, RLS-isolated, cross-device) with guest→account merge on sign-in. |
| **Future Work** | None outstanding for the core sync/merge capability. A known, low-severity, accepted gap: two browser tabs signing in at the same moment could both attempt to merge the same guest cart before either clears it, double-counting the affected lines — not solved with a distributed lock, since the buyer can just adjust the quantity like any other line. See ADR-020. |

---

## 6. Checkout

| Field | Detail |
|---|---|
| **Purpose** | Convert a cart spanning multiple shops into one order per shop, capturing shipping details and a payment method. |
| **Responsibilities** | Group cart by seller; collect shipping address; select payment method; invoke order creation; surface per-shop totals. |
| **Features** | Shipping address form (country locked to Philippines — domestic-only, no courier API), per-shop order grouping, payment method selection (COD or QR Transfer — QR is informational only at this step, see Payments), order totals, empty-cart handling. |
| **Pages** | `src/app/(shop)/checkout/page.tsx` (protected route). Checkout no longer hands off to a dedicated confirmation page — placing an order redirects straight to `/orders` (see Orders module), landing on the tab matching the order's actual state. |
| **Components** | `features/checkout/components/{CheckoutEmptyState,CheckoutForm,CheckoutGroupCard,CheckoutItemsList,CheckoutTotals,PaymentMethodCard,ShippingAddressForm}`. |
| **Server Actions** | `features/checkout/actions/checkout.actions.ts` — `placeOrderAction`. |
| **Services** | `lib/supabase/queries.ts` — `createOrder` (wraps the `create_order` RPC); `features/checkout/utils/groupCartBySeller`. |
| **Database Tables** | Writes `orders`, `order_items` via `create_order`; reads `products` for price/stock validation. |
| **Dependencies** | Cart (source), Orders (target of creation), Payments (method selection + the actual receipt-upload/verification flow, which lives entirely in the Payments module, not here). |
| **Current Status** | ✅ Completed (the Stripe/card spike, ADR-014, was removed — see [DECISIONS.md → ADR-014](./DECISIONS.md#adr-014-stripe-integration-is-a-provisional-spike)). |
| **Future Work** | None outstanding — `create_order` is deliberately unchanged by the QR payment work; payment method is not persisted at order-placement time (see Payments module). Assumes a single currency (PHP) across a cart — documented assumption, not a supported multi-currency checkout. |

---

## 7. Orders

| Field | Detail |
|---|---|
| **Purpose** | The single, centralized order pipeline — creation through fulfillment through history — shared by Customers, Shop Owners, and Admin. |
| **Responsibilities** | Order lifecycle state machine; order history and detail views; cancellation; fulfilment status advancement; status/timeline presentation. |
| **Features** | Buyer: order list with search/status filter, order detail with timeline, shipping address display, payment-status badge, cancel-order action (`pending`/`confirmed` only). Shop Owner/Admin: dashboard order list (RLS-scoped to own shop, or every shop for admin), order detail with fulfilment controls, forward status advancement (`pending → confirmed → processing → shipped → delivered`) and cancellation (`pending`/`confirmed`/`processing`), one unified transition map governing both. |
| **Pages** | `src/app/(account)/orders/page.tsx`, `orders/[id]/{page,loading,not-found}.tsx` (buyer); `src/app/admin/orders/**` and `src/app/seller/orders/**` (Shop Owner/Admin), including `src/app/seller/orders/[id]/label/page.tsx` (seller-only printable shipping label); `src/app/dashboard/orders/**` is a legacy redirect. |
| **Components** | `features/orders/components/{OrderCard,OrderHeader,OrderItemsList,OrderListSection,DashboardOrdersPanel,OrderSearchInput,OrderSkeletons,OrderStatusBadge,OrderStatusFilter,OrderSummary,OrderTimeline,PaymentStatusBadge,ShippingAddressCard,CancelOrderButton,OrderStatusControl,ItemVerificationChecklist,ShipmentCaptureForm,ShippingLabel,PrintLabelButton,ShipmentTrackingCard,Barcode128,BarcodeScannerModal,ScanBarcodeButton}`. `OrderStatusControl` is the dashboard's fulfilment/cancel control (driven by `ORDER_STATUS_TRANSITIONS`) — it now hosts the To Pack `ItemVerificationChecklist` gate and the Shipped `ShipmentCaptureForm` in-place, still one button per step. `ShippingLabel`/`PrintLabelButton` render the seller print label (`/seller/orders/[id]/label`, print-isolated via `@media print` — no dashboard chrome), and `ShippingLabel` now embeds a dependency-free Code 128 `Barcode128` (SVG) of the `order_number`; `ScanBarcodeButton`/`BarcodeScannerModal` (beside the seller order search) are the camera scanner (see Barcode below); `ShipmentTrackingCard` is the buyer's read-only tracking on the order detail (To Receive/Delivered). Every other component is shared as-is between the buyer and dashboard views. |
| **Server Actions** | `features/orders/actions/order.actions.ts` — `cancelOrderAction` (buyer-side); `advanceOrderStatusAction` (Shop Owner/Admin — the **single** status write path: forward advancement, dashboard-initiated cancellation, **and** the Shipped transition with courier/tracking, guarded by `requireRole(DASHBOARD_ROLES)` + `ORDER_STATUS_TRANSITIONS`, not just the DB trigger). No parallel shipment action exists. `resolveSellerOrderByNumberAction` (read-only barcode-scan resolver — Zod format gate + `requireRole([seller])` + rate limit + seller-scoped lookup; returns an order id to navigate to, writes nothing). |
| **Services** | `lib/supabase/queries.ts` — `getBuyerOrder`/`listBuyerOrders`/`getBuyerOrderSummary`/`cancelBuyerOrder` (buyer-scoped, hardcode `buyer_id`); `getDashboardOrder`/`listDashboardOrders` (RLS-only, no manual filter — same "RLS is the primary boundary" pattern as `listDashboardProducts`/`listDashboardInventory`); `advanceOrderStatus` (validates the transition, then an optimistic-concurrency-guarded update); `getOrderShipment`/`markOrderPacked` (RLS-scoped)/`recordOrderShipment` (wraps the `record_order_shipment` RPC — atomic tracking + `shipped`); `getDashboardOrderByNumber` (read-only, seller-scoped exact `order_number` → id lookup for the barcode scanner); `toOrder` mapper (now also carries `buyerId`/`buyerName`, needed for the dashboard view). |
| **Database Tables** | `orders`, `order_items`, `order_shipments` (one per order — seller fulfillment tracking, see below); reads `payments` for status. No `shop_id` column and no new migration for this phase — `seller_id = auth.uid()` already scopes a Shop Owner to their own orders correctly under today's one-member-per-shop reality (see ARCHITECTURE.md's Orders RLS note). |
| **Fulfillment (seller)** | Item-verification gate before To Pack → Ready for Pickup, manual courier + tracking capture at Ready for Pickup → Shipped, a printable RobertJ shipping label, and buyer-visible read-only tracking. Built on the **unchanged** status enum (see ARCHITECTURE.md → "Seller fulfillment: `order_shipments`"). `order_shipments` RLS: participants read; seller/admin write; **buyer never writes**. No courier API/role, no ETA/GPS. |
| **Barcode (seller)** | The shipping label carries a dependency-free **Code 128** barcode of the internal `order_number` (`Barcode128` inline SVG + `utils/code128.ts` encoder — round-trip-verified against ZXing's `Code128Reader`). A **camera scanner** (`ScanBarcodeButton` → `BarcodeScannerModal`, beside the seller order search) decodes the barcode on mobile (rear camera) and desktop (webcam) via **`@zxing/browser`** (dynamically imported, Code 128-restricted), then resolves it seller-scoped and opens the existing `/seller/orders/[id]`. **Read-only identification only** — no status/inventory/payment/shipment writes, no new fulfilment path; manual search remains the fallback (denied/unsupported/no-camera). Encodes `order_number`, never the courier tracking number. |
| **Dependencies** | Checkout (creates orders); Payments (status; a `payment_status = 'failed'` order has no automatic effect — see TD-9 — but can now be manually cancelled from the dashboard, which restocks via the existing `orders_restock_on_cancel` trigger); Inventory (restock on cancellation, actor-agnostic — buyer, seller, or admin initiated); Customer module (surfaces orders in account); Shop Owner/Admin (this module **is** their order-management surface, not a fork of it). |
| **Current Status** | ✅ Completed for both the Customer-facing history/detail experience and Shop Owner/Admin order management. |
| **Future Work** | An admin refund flow (`refunded` status is defined in the DB enum but unreachable from any UI today) — out of scope until requested. Multi-staff-per-shop order visibility, if that ever becomes real (see ARCHITECTURE.md TD-1) — deliberately not built speculatively. |

---

## 8. Payments

| Field | Detail |
|---|---|
| **Purpose** | Payment confirmation via **Cash on Delivery** and **Xendit Online Payment** (GCash, Maya, Card) — sandbox/test-mode; see [DECISIONS.md → ADR-019](./DECISIONS.md#adr-019-xendit-online-payment-gcash-maya-card-superseding-adr-008s-no-gateway-stance). |
| **Responsibilities** | Capture payment method at checkout (informational); create/track Xendit payment attempts; process Xendit webhooks idempotently as the sole `paid`/`failed` authority; let a seller/admin mark a COD order's cash collected; keep `payment_status` server-controlled at every step. |
| **Features** | COD: `payment_status` stays `pending` until the order's seller or an admin explicitly marks it collected (`MarkCodCollectedButton`, on the order detail page). Xendit: buyer picks GCash/Maya (redirect to Xendit's hosted checkout) or Card (embedded `xendit-components-web` widget) from the order detail page; only the webhook (`/api/webhooks/xendit`) ever marks a Xendit payment `paid`/`failed`, never the return-page redirect. `PaymentsList` is a read-only history — no manual verification action exists anymore. |
| **Pages** | `src/app/admin/payments/page.tsx` and `src/app/seller/payments/page.tsx` — read-only payment history (`PaymentsList`); `/dashboard/payments` is a legacy redirect to whichever applies. Payment actions themselves live on the order detail page (Orders module), not a dedicated Payments page. |
| **Components** | `features/payments/components/{XenditPaymentOptions,XenditCardPaymentButton,MarkCodCollectedButton,PaymentsList}`; `features/checkout/components/PaymentMethodCard` (method selection, informational only). |
| **Server Actions** | `features/payments/actions/payment.actions.ts` — `markCodPaymentCollectedAction`; `features/payments/actions/xendit.actions.ts` — `createXenditEwalletPaymentAction`, `createXenditCardSessionAction`. |
| **Services** | `lib/supabase/queries.ts` — `beginXenditPaymentAttempt`, `finalizeXenditPaymentRequest`, `markCodPaymentCollected`, `getPaymentReceiptSignedUrl` (legacy receipts, read-only), `listPaymentHistory`, `getActivePaymentForOrder`; `lib/xendit/client.ts` — the Xendit HTTP client. All writes go through `begin_xendit_payment_attempt`/`finalize_xendit_payment_request`/`process_xendit_webhook`/`mark_cod_payment_collected` `SECURITY DEFINER` RPCs — no direct table grant exists, and `process_xendit_webhook`'s `EXECUTE` grant is `service_role`-only. |
| **Database Tables** | `payments` (`xendit_payment_request_id`, `xendit_payment_id`, `payment_channel`, `checkout_url`, `expires_at`, `provider_response` added); new `payment_webhook_events` audit table (insert-only, no app-facing grants). Historical `qr_upload`/`card` `payment_method_type` rows and `profiles.payment_qr_url` values are preserved, read-only. |
| **Dependencies** | Checkout (method selection UI only — no data dependency, `create_order` is unchanged), Orders (`payment_status` surfaced there; payment actions live on the order detail page), Xendit (external API). |
| **Current Status** | ✅ Completed (sandbox/test-mode). The QR/manual-verification path (formerly ADR-008) and the Stripe/card spike (ADR-014) are both retired — see [DECISIONS.md → ADR-019](./DECISIONS.md#adr-019-xendit-online-payment-gcash-maya-card-superseding-adr-008s-no-gateway-stance). |
| **Future Work** | Seller payouts, platform commission, and real-money settlement are explicitly out of scope. Xendit-dashboard-initiated refunds are not automatically reflected back (existing `decide_return` admin flow handles refunds manually, payment-method-agnostic). Going live would need real business verification and a publicly reachable webhook URL. |

---

## 9. Reports

| Field | Detail |
|---|---|
| **Purpose** | Sales and operational analytics for Shop Owners (their own shop) and Administrator (platform-wide, filterable by shop). |
| **Responsibilities** | Aggregate order/sales data DB-side; present KPIs, trends, and breakdowns; support the SAD's "orders and sales are not centralized" problem. |
| **Features** | KPI cards (revenue, orders, paid orders, avg order value, units, cancelled); sales-over-time trend (day/week/month); order-status breakdown; COD-vs-QR paid-payment split; top products; low/out-of-stock report; date-range + preset + granularity filters; admin shop filter; CSV export. |
| **Pages** | `src/app/admin/reports/page.tsx` and `src/app/seller/reports/page.tsx` — role-branched copy (`isAdmin`), Zod-coerced `searchParams` filters, per-panel `Suspense`; `src/app/dashboard/reports/page.tsx` is a legacy redirect. |
| **Components** | `features/reports/components/{ReportsFilters,ExportReportButton,SalesSummaryPanel,SalesTrendPanel,OrderStatusPanel,TopProductsPanel,LowStockPanel,ReportSkeletons}`; shared charts `src/components/charts/{TrendChart,BarChart}` (hand-rolled SVG/CSS, no charting dependency). |
| **Server Actions** | `features/reports/actions/report.actions.ts` — `exportSalesReportAction` (CSV; reuses the same RLS-scoped reads, `requireRole(DASHBOARD_ROLES)`). Reads need no action — panels are async Server Components. |
| **Services** | `lib/supabase/queries.ts` (Reports section) — `getSalesSummary`/`getSalesTimeseries`/`getOrderStatusBreakdown`/`getTopProducts` (wrap the `report_*` RPCs, `cache()`-wrapped), `getLowStockReport` (reuses `listDashboardInventory`, no new SQL). |
| **Database Tables** | **None new.** Four read-only `SECURITY DEFINER` RPCs aggregate over existing `orders`/`order_items`/`payments`; a physical `reports` table was deliberately not modelled (derivable data). See [ARCHITECTURE.md → Reporting RPCs](./ARCHITECTURE.md#reporting-rpcs-analytics-over-existing-orders). Two additive `orders` indexes (`orders_seller_placed_idx`, `orders_placed_at_idx`). |
| **Dependencies** | Orders (primary data source), Payments (`payment_status = 'paid'` is the revenue source of truth; COD-vs-QR split), Inventory (low-stock report, reused), Shops (admin shop filter via `shop_users`). |
| **Current Status** | ✅ Completed. Resolves ARCHITECTURE.md TD-5. |
| **Future Work** | An `orders.shop_id` bridge (TD-1) would let admin shop-filtering skip the `shop_users` map; richer/scheduled exports and materialized aggregates are future scaling, not current scope. |

---

## 10. Guided Product Selection

| Field | Detail |
|---|---|
| **Purpose** | Reduce manual "what do you recommend?" requests with a **rule-based** (not AI) recommendation assistant, per the SAD. |
| **Responsibilities** | Let a seller/admin author explicit occasion/size rules per product (optionally naming one specific variant); let a buyer answer occasion/size/budget and see matching, in-stock products. Budget is always checked against the **live** product/variant price — never a value stored on the rule. |
| **Features** | Admin/seller rule authoring (`RecommendationRuleManager`/`RecommendationRuleRow`) mounted in the existing `/admin/products`/`/seller/products` edit flow; buyer-facing `GuidedSelectorQuiz` modal (occasion/size/budget → matches), reachable from the landing page. |
| **Pages** | No dedicated page — the quiz is a modal launched from the landing page; rule authoring lives on the existing product-management pages. `ROUTES.assistant` (`/assistant`) remains reserved and unused. |
| **Components** | `features/assistant/components/{RecommendationRuleManager,RecommendationRuleRow,GuidedSelectorQuiz}`; `features/landing/components/SmartAssistantPreview` (a real preview of the occasion/size/budget mechanism that opens the actual quiz — no longer a cosmetic AI-styled chat demo). |
| **Server Actions** | `features/assistant/actions/rule.actions.ts` — `createRecommendationRuleAction`/`updateRecommendationRuleAction`/`deleteRecommendationRuleAction`, seller/shop-co-member/admin gated (`DASHBOARD_ROLES`). `features/assistant/actions/quiz.actions.ts` — `getGuidedSelectionMatchesAction`, public/rate-limited, no session required (same guest-accessible precedent as the cart's public reads). |
| **Services** | `lib/supabase/queries.ts` — `listProductRecommendationRules`, `listDashboardRecommendationRules`, `createRecommendationRule`, `updateRecommendationRule`, `deleteRecommendationRule`, `listGuidedSelectionMatches`. |
| **Database Tables** | `recommendation_rules` (`product_id`, optional `variant_id`, `seller_id`, `shop_id`, `occasion` enum, `size` text, `active`) — see `20260914000000_recommendation_rules.sql` (RLS/trigger fix in `20260914010000_fix_recommendation_rules_insert_rls.sql`). |
| **Dependencies** | Products / Product Variants (recommendation targets and live pricing); Shops (co-member authorship via `is_shop_member`). |
| **Current Status** | ✅ Schema, admin/seller rule authoring, and the buyer-facing quiz are implemented and live-DB verified. Not yet in scope: matching by category/tags/price-range presets (the SAD's original, more speculative rule shape), and a dedicated `/assistant` page. |
| **Future Work** | Consider surfacing Guided Selection matches elsewhere (e.g. category pages), and whether `ROUTES.assistant` should become a real page instead of a landing-page modal. **Must remain rule-based** — see [DECISIONS.md → ADR-009](./DECISIONS.md#adr-009-rule-based-guided-product-selection-not-ai); do not introduce AI/ML without a superseding ADR. |

---

## 11. Admin

| Field | Detail |
|---|---|
| **Purpose** | Full platform administration: users, shops, products, inventory, payments, reports, settings — the Administrator's SAD scope. |
| **Responsibilities** | Cross-shop oversight; user/role management and seller onboarding; shop creation/management; COD-collection and payment-history authority (Xendit settles itself via webhook). Platform settings still unbuilt. |
| **Pages** | `/admin/{dashboard,products,inventory,orders,payments,returns-refunds,reports,users,shops,audit-log,settings}` — the full Admin Portal, gated by `requireRole(ADMIN_ONLY_ROLES)` at `src/app/admin/layout.tsx` (not the coarse seller-or-admin gate the old `/dashboard` tree used). Reports adds an admin-only shop filter. The legacy `/dashboard/*` tree is kept only as redirect stubs to their `/admin/*` or `/seller/*` equivalent (`redirectToPortal`), for old bookmarks. |
| **Components** | `src/app/admin/layout.tsx` + `features/admin/components/{AdminLayout,AdminSidebar,AdminTopbar,AdminKpiRow,AdminQuickAccess}` — the Admin Portal's own chrome (no Buyer `SiteHeader`/`SiteFooter`, scoped Light/Dark/System theme via `[data-theme-scope="admin"]`). `features/users/components/{UsersTable,UserRow}` and `features/shops/components/{AdminShopsPanel,ShopRow,ShopForm}` are the admin-only screens — two separate feature folders (Users is a distinct business domain from Shops, not shoehorned into either `dashboard/` or `shops/`). |
| **Server Actions** | `features/payments/actions/payment.actions.ts` — `markCodPaymentCollectedAction`; `features/products/actions/product.actions.ts` — create/update/archive/assign-shop; `features/inventory/actions/inventory.actions.ts` — `adjustStockAction`; `features/orders/actions/order.actions.ts` — `advanceOrderStatusAction`, all usable by admin across every shop (role-branched, not admin-forked). New admin-only actions: `features/shops/actions/shop.actions.ts` — `createShopAction`/`updateShopAction`/`toggleShopActiveAction` (RLS-gated, no RPC needed — `shops` already has `is_admin()` in its policies); `features/users/actions/user.actions.ts` — `assignSellerShopAction` (wraps the `admin_assign_seller_shop` RPC — the one privileged, cross-user write in this module). |
| **Services** | `lib/supabase/queries.ts` — `listAdminUsers()`/`assignSellerShop()` (wrap the `admin_list_users`/`admin_assign_seller_shop` RPCs — see the Seller Onboarding note below); `createShop()`/`updateShop()`/`listShopsWithMembers()` (plain RLS-gated reads/writes, no RPC). `listShops()` itself (used by the Products/Inventory admin shop-picker) is unchanged. |
| **Database Tables** | Cross-cutting: `profiles` (users), `products`, `orders`, `payments`, `inventory`/`stock_adjustments`, `shops`/`shop_users` (admin has full read/write via `is_admin()`); new `admin_action_log` (append-only, admin-only-readable, RPC-only-writable — logs `admin_assign_seller_shop` calls only, deliberately not every admin action). |
| **Dependencies** | Every other module — Admin is an oversight layer, not a data owner of its own. |
| **Current Status** | ✅ Seller onboarding (Users + Shops management) is built — see the Seller Onboarding note below. ⏳ Upcoming: user disabling/banning (no such column exists on `profiles` today — not requested), platform Settings. |
| **Future Work** | Platform settings page. Seller demotion/reversal was explicitly scoped out of the onboarding work — promotion is one-directional; what happens to a demoted seller's shop/active products/pending orders is a real design question, not yet addressed. |

> [!NOTE]
> **Seller Onboarding (Admin-only, no self-service).** `profiles` UPDATE RLS is self-only (`id = auth.uid()`) with no `is_admin()` widening — an admin cannot promote another user via a plain client call, so `admin_assign_seller_shop(p_user_id, p_shop_id)` (`SECURITY DEFINER`, explicit `is_admin()` check inside, mirrors `create_order`/`adjust_stock`'s chokepoint shape) is the sole write path: it flips `profiles.role` from `buyer` to `seller` *and* creates/replaces the `shop_users` membership in one transaction, so there is never a window where a seller exists without a shop. A new `shop_users` `unique (user_id)` constraint (verified safe against live data before adding) backs this up at the schema level — a user can never be in two shops. `admin_list_users()` (a second new `SECURITY DEFINER` RPC, mirroring `get_my_profile()`'s shape but admin- rather than self-scoped) is the only place `auth.users.email` is ever joined into a query, so the admin Users screen can show who's who. Public signup remains Buyer-only and unmodified — `handle_new_user()`, the `profiles` INSERT policy, and `prevent_role_self_escalation` were not touched.

---

## 12. Shop Owner

| Field | Detail |
|---|---|
| **Purpose** | Let each sibling shop manage its own products, inventory, orders, and reports — the Shop Owner's SAD scope. |
| **Responsibilities** (target) | Manage **own** products/inventory only (RLS-scoped); fulfil own orders; view own sales reports. |
| **Pages** | `/seller/{dashboard,products,inventory,orders,payments,reports}` — the Shop Owner Portal, gated by `requireRole([USER_ROLES.seller])` at `src/app/seller/layout.tsx`, scoped to their own shop via RLS (`seller_id = auth.uid()` / `is_shop_member()`) and, for Reports, the `report_*` RPCs' internal seller scoping. The legacy `/dashboard/*` tree is kept only as redirect stubs to `/seller/*` (or `/admin/*` for an admin), for old bookmarks. |
| **Components** | `src/app/seller/layout.tsx` + `features/seller/components/{SellerLayout,SellerSidebar,SellerTopbar,SellerKpiRow,SellerQuickAccess}` — the Seller Portal's own chrome, structurally mirroring Admin's (no Buyer `SiteHeader`/`SiteFooter`, scoped theme via `[data-theme-scope="seller"]`). |
| **Server Actions** | `features/payments/actions/payment.actions.ts` — `markCodPaymentCollectedAction`; `features/products/actions/product.actions.ts` — create/update/archive; `features/inventory/actions/inventory.actions.ts` — `adjustStockAction`; `features/orders/actions/order.actions.ts` — `advanceOrderStatusAction`, all scoped to the seller's own shop for their own orders/payments/inventory. |
| **Services** | Same centralized `queries.ts` functions as Products/Orders/Inventory/Payments — **no separate seller-only service layer**. |
| **Database Tables** | `products` (own, via `seller_id` and/or `shop_id`), `inventory`/`stock_adjustments` (own shop's products, via `is_shop_member()`), `orders` (own, via seller-scoped RLS), `payments` (own orders' payments, via `mark_cod_payment_collected`/Xendit webhook), `shops`/`shop_users` (own shop, via `is_shop_member()`). |
| **Dependencies** | Products, Inventory, Orders, Payments, Reports — Shop Owner is a **role-scoped view** over those modules, not a new data domain. |
| **Current Status** | ✅ Products, Inventory, Orders, payment verification, and Reports are all built and scoped to the seller's own shop — proof the underlying RLS/role guards (`current_user_role() in ('seller','admin')`, `is_shop_member()`, and the `report_*` RPCs' internal `seller_id = auth.uid()` scoping) are correctly scoped. |
| **Future Work** | None outstanding for the SAD scope. Richer/scheduled report exports are future scaling, not current scope. |

---

## 13. Customer

| Field | Detail |
|---|---|
| **Purpose** | The buyer-facing account experience: profile, order history, and an account hub — the Customer's SAD scope. |
| **Responsibilities** | Present the authenticated shopper's identity and history; let them update their profile; surface recent orders. |
| **Features** | Account overview, profile edit, recent-orders summary, navigation to full order history (owned by the Orders module), Connected Accounts (manual Google/Facebook identity linking). |
| **Pages** | `src/app/(account)/account/page.tsx`, `profile/page.tsx` (plus `orders/*`, owned by the Orders module and linked from here). |
| **Components** | `features/account/components/{AccountMenu,AccountShell,AccountSidebar,OverviewSummary,ProfileForm,RecentOrdersList,ConnectedAccounts,UnlinkIdentityButton}`. |
| **Server Actions** | `features/account/actions/account.actions.ts` — `updateProfileAction`, `linkIdentityAction`, `unlinkIdentityAction`. |
| **Services** | `lib/supabase/queries.ts` — `getMyProfile` (via `get_my_profile()` RPC, the only path to `phone`), `toProfile` mapper, `listUserIdentities`/`linkOAuthIdentity`/`unlinkOAuthIdentity` (owned by Authentication, consumed here). |
| **Database Tables** | `profiles`; reads `orders` (via the Orders module, not duplicated here); `auth.identities` (via Authentication's Supabase Auth wrappers). |
| **Dependencies** | Authentication (identity, and the OAuth linking primitives Connected Accounts is built on), Orders (`RecentOrdersList` composes the Orders module — does not reimplement it). |
| **Current Status** | ✅ Completed. |
| **Future Work** | Saved shipping addresses, wishlists — both explicitly out of scope per `customer-account-architecture-plan.md` and [README.md → Out of Scope](./README.md#out-of-scope) precedent. |

---

## Cross-Module Dependency Map

```mermaid
flowchart LR
    Auth["Authentication"] --> Customer
    Auth --> ShopOwner["Shop Owner"]
    Auth --> Admin

    Marketplace --> Products
    Products --> Cart
    Cart --> Checkout
    Checkout --> Orders
    Checkout --> Payments
    Orders --> Payments
    Orders --> Reports
    Products --> Inventory
    Inventory --> Reports

    Products --> Assistant["Guided Product Selection"]

    Customer --> Orders
    ShopOwner --> Products
    ShopOwner --> Inventory
    ShopOwner --> Orders
    ShopOwner --> Reports
    Admin --> Products
    Admin --> Inventory
    Admin --> Orders
    Admin --> Payments
    Admin --> Reports
```

> [!NOTE]
> **Admin and Shop Owner do not own separate data models.** Both are role-scoped **views** over Products, Inventory, Orders, Payments, and Reports, differentiated entirely by RLS/role guards. Do not fork parallel components or services for these roles — extend the existing module and gate by role, per [CLAUDE.md → AI Non-Negotiable Rules](./CLAUDE.md#ai-non-negotiable-rules).

---

### Related documents

- 🧭 **[README.md](./README.md)** — business overview, scope, roadmap.
- 📐 **[ARCHITECTURE.md](./ARCHITECTURE.md)** — technical design, schema, RBAC.
- 📜 **[DECISIONS.md](./DECISIONS.md)** — why each module is shaped the way it is.
- 🤖 **[CLAUDE.md](./CLAUDE.md)** — standards for touching any module.
