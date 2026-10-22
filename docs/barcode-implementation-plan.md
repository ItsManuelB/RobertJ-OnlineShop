# Barcode Feature — Step 3 Architecture & Implementation Plan

> **Update (2026-10):** the To Pack scan from the Orders list now opens a confirmation popup (`ScanPackConfirmDialog`) showing the order's items, with **Mark ready for pickup** / **Open order** / **Close**, instead of navigating straight to the order. Scanning is still read-only — the status change happens only on the seller's click, through the same `advanceOrderStatusAction` path. `resolveSellerOrderByNumberAction` returns an items/buyer summary for To Pack orders to feed the popup. The guardrails below otherwise still apply; read them as describing the original scope.

> **Status:** Planning only. No code, DB, dependency, config, or UI changed by this document.
> **Prerequisites:** `docs/barcode-audit` findings (Step 1) + Step 2 read-only validation (PASS WITH CONDITIONS). All Step 2 conditions are **approved**:
> - `@zxing/browser` approved as the camera-scanning dependency, **dynamically imported** only when the scanner opens.
> - Dedicated seller-scoped exact-match `getDashboardOrderByNumber(orderNumber, sellerId)` resolver.
> - Code 128 generation stays **dependency-free** (in-repo inline SVG).
> - "Scan Barcode" entry sits **beside the existing order search on `/seller/orders`**.
> - Manual order search remains the fallback.
> - **No** second scanner entry on the order-detail page in this implementation.
>
> **Scope guardrails:** Barcode scanning is a **read-only order identification/verification tool**. No QR codes, HID hardware requirement, courier API, GPS, ETA, maps, WMS, multi-parcel, courier role, or automatic fulfillment actions. **No DB migration.** No change to `advanceOrderStatusAction`, `record_order_shipment`, `orders` RLS, the `order_status` enum, or any fulfillment behavior.

Target flow (barcode is the **Scan Barcode → identify → open** step only):
`Pending → Confirm → To Pack → Verify Items → Ready for Pickup → Prepare/Print Label → **Scan Barcode → camera identifies order → existing Order Details** → Enter Courier+Tracking → Mark as Shipped → Shipped → Buyer Tracking → Delivered → Completed`

---

## 1. Architecture decision

Two independent, self-contained pieces layered onto existing seller surfaces:

1. **Barcode rendering (dependency-free):** a pure in-repo Code 128 encoder + a presentational `Barcode128` SVG component, rendered on the existing shipping label, encoding `orders.order_number`.
2. **Camera scanning (one dynamically-imported dependency):** a client `BarcodeScannerModal` using `@zxing/browser` (restricted to Code 128) opened from a `ScanBarcodeButton` beside the order search. On decode → validate format → seller-scoped resolver action → navigate to the **existing** `/seller/orders/[id]`.

Rendering and scanning share nothing but the `order_number` value and the Code 128 format. Scanning writes nothing.

---

## 2. Component / file architecture

**New files**
| File | Type | Responsibility |
|---|---|---|
| `src/features/orders/utils/code128.ts` | pure util (no dep, isomorphic) | `encodeCode128(value)` → module-width pattern (start/data/checksum/stop, quiet zones). Testable, framework-free. |
| `src/features/orders/components/Barcode128.tsx` | presentational (server-renderable) | Renders the encoder output as inline `<svg>` `<rect>` bars. Props: `value`, `moduleWidth?`, `height?`. No client JS → prints cleanly. |
| `src/features/orders/components/BarcodeScannerModal.tsx` | client (`"use client"`) | Camera scanner UI + full lifecycle; **dynamically imports** `@zxing/browser`; handles permission/unsupported/no-camera; dedupes; calls the resolver action; navigates. |
| `src/features/orders/components/ScanBarcodeButton.tsx` | client | Entry button beside search; lazy-mounts `BarcodeScannerModal` on click (so zxing chunk loads only on demand). |

**Modified files**
| File | Change |
|---|---|
| `src/features/orders/components/ShippingLabel.tsx` | Render `<Barcode128 value={order.orderNumber} />` inside the existing "Order" block. |
| `src/app/seller/orders/page.tsx` | Add `<ScanBarcodeButton />` beside `OrderSearchInput`. |
| `src/lib/supabase/queries.ts` | Add `getDashboardOrderByNumber(orderNumber, sellerId)` (read-only, exact match). |
| `src/features/orders/actions/order.actions.ts` | Add `resolveSellerOrderByNumberAction(orderNumber)` (seller-scoped, read-only). |
| `src/features/orders/schemas/order.schema.ts` | Add `scanOrderNumberSchema` (format regex). |
| `package.json` (+ lockfile) | Add `@zxing/browser`. |
| `MODULES.md`, `ARCHITECTURE.md` | Document the barcode capability. |

---

## 3. Scanner modal lifecycle & camera behavior

State machine inside `BarcodeScannerModal`: `idle → checking-support → requesting-permission → scanning → resolving → (success ↦ navigate | error ↦ retry/fallback)`; plus terminal `unsupported` / `denied` / `no-camera`.

1. **Open** (button click; user-gesture, required for iOS). Render the modal.
2. **Support check:** if `!window.isSecureContext` or `!navigator.mediaDevices?.getUserMedia` → `unsupported` state + "Use manual search" fallback.
3. **Load decoder:** `const { BrowserMultiFormatReader } = await import("@zxing/browser")` + hints (`DecodeHintType.POSSIBLE_FORMATS = [BarcodeFormat.CODE_128]`, optional `TRY_HARDER`). Store the reader in a ref.
4. **Start camera:** `reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, videoEl, onResult)` → keep the returned **controls** object in a ref for cleanup.
5. **Decode loop → first hit:** in `onResult`, if `hasScannedRef.current` is already true → ignore (dedupe). On the first valid result: set `hasScannedRef = true`, **stop** the camera (controls.stop() + stop all `MediaStream` tracks), then validate + resolve.
6. **Resolve & navigate:** valid format → `resolveSellerOrderByNumberAction` → `router.push(ROUTES.sellerOrderDetail(orderId))` on success; on failure → `error` state with a generic message + "Scan again" (resets `hasScannedRef` and restarts) / "Use manual search".
7. **Cleanup (always):** a `useEffect` cleanup + explicit close handler stop the controls and every track, and null the refs — on successful scan, modal close, unmount, and route change. Guarantees the camera indicator turns off.

**Duplicate-scan protection:** `hasScannedRef` gate + immediate camera stop on first decode + disabled re-entry until an explicit "Scan again."

---

## 4. Mobile vs desktop camera handling

- **Mobile:** `facingMode: { ideal: "environment" }` selects the rear camera; falls back to any camera if environment isn't available (`ideal`, not `exact`, avoids `OverconstrainedError`).
- **Desktop/laptop:** `facingMode` is ignored by the browser → the integrated or a connected webcam is used (default device).
- **Optional (kept minimal):** if `enumerateDevices()` shows multiple cameras, a small "switch camera" control may be added later; **not required** for v1 (default/environment selection is sufficient).
- **Responsive UI:** modal with a `<video autoplay playsinline muted>` (crucial `playsinline` for iOS), `object-fit: cover`, max-width constrained; optional scan-reticle overlay. Same component for both — layout is responsive, behavior identical.

---

## 5. ZXing integration & dynamic-import strategy

- `@zxing/browser` (runtime) + its peer `@zxing/library` (hints/enums) are imported **only** inside `BarcodeScannerModal`, **only** via `await import(...)` triggered on modal open — never at module top level, never in any server file. This keeps the decoder out of the main/server bundle; it loads as a separate async chunk when the seller first taps Scan.
- `BarcodeScannerModal` itself is mounted lazily by `ScanBarcodeButton` (conditional render on open), so its code + the zxing chunk are fetched on demand.
- Format restriction via hints so only Code 128 is attempted (faster, fewer false reads).
- No web worker / wasm needed (zxing is pure JS) → no CSP/worker-src changes (the app sets no CSP today).

---

## 6. Code 128 generation architecture (shipping label)

- **`code128.ts` (pure):** implement **Code Set B** (covers `O R D`, digits `0–9`, `-`). Steps: map each char to its Set-B value (`charCode − 32`), prepend START B (104), compute checksum `((104) + Σ(value_i × i)) mod 103`, append the checksum symbol, then STOP (106) + the trailing 2-bar termination. Expand each symbol via the standard 107-entry Code 128 pattern table into module widths. Return an array of bar/space widths (or a bit pattern) + the module count. *(Set C digit-pair compression is an optional later optimization; Set B alone is correct and adequate for the ~18-char `ORD-YYYYMMDD-NNNNNN`.)*
- **`Barcode128.tsx`:** renders the pattern as inline `<svg>`: one `<rect>` per bar at `x = cumulative module offset × moduleWidth`, full height; includes **≥10-module quiet zones** on both sides; `shape-rendering="crispEdges"`. Pure/presentational (server component) → no client cost, prints via the existing `@media print` isolation. The human-readable `order_number` already appears in the label's Order block, so the barcode sits directly beneath it (optionally repeat the text under the bars).
- **Placement:** `ShippingLabel.tsx`, inside the existing "Order" `<div>` (`:36-42`), below `order.orderNumber`.

---

## 7. Seller-scoped order-number resolver design

- **Service (`queries.ts`):**
  ```ts
  export async function getDashboardOrderByNumber(
    orderNumber: string,
    sellerId: string | null,
  ): Promise<{ id: string } | null>
  ```
  `from(ORDERS).select("id").eq("order_number", orderNumber)`; if `sellerId` → `.eq("seller_id", sellerId)`; `.maybeSingle()`. **Exact** match (never `ilike`). RLS applies underneath. Returns only the id (navigation is all that's needed) or `null`. Mirrors `getDashboardOrder`'s seller-scoping shape.
- **Action (`order.actions.ts`):**
  ```ts
  export async function resolveSellerOrderByNumberAction(
    orderNumber: string,
  ): Promise<ActionResult<{ orderId: string }>>
  ```
  1. `scanOrderNumberSchema.safeParse({ orderNumber })` (format gate).
  2. `const user = await queries.requireRole([USER_ROLES.seller])`.
  3. `await queries.requireRateLimit(\`scanOrder:${user.id}\`, 30, 60)` (throttles scan-enumeration).
  4. `const order = await queries.getDashboardOrderByNumber(parsed.orderNumber, user.id)`.
  5. `order ? ok({ orderId: order.id }) : fail("Order not found or it isn't in your shop.")` — **same** message for nonexistent and foreign (no existence disclosure).
  6. **No** `revalidatePath` (read-only).
- **Schema (`order.schema.ts`):** `scanOrderNumberSchema = z.object({ orderNumber: z.string().trim().regex(/^ORD-\d{8}-\d{6}$/, "That doesn't look like a RobertJ order barcode.") })`.
- **Client:** `resolveSellerOrderByNumberAction(decoded)` → `ok` ⇒ `router.push(ROUTES.sellerOrderDetail(orderId))`; `fail` ⇒ generic error in the modal.

---

## 8. Validation & error-handling flow

| Situation | Handling | User message |
|---|---|---|
| Decoded text not `ORD-…` format | client pre-check + server Zod reject (no lookup) | "That doesn't look like a RobertJ order barcode." (rescan) |
| Valid format, order doesn't exist | resolver returns null | "Order not found or it isn't in your shop." |
| Valid format, foreign seller's order | seller-scoped filter → null (**identical** path) | same generic message (no leak) |
| Camera permission denied (`NotAllowedError`) | `denied` state | "Camera access was blocked. Use manual search or enable camera access." |
| No camera (`NotFoundError`) | `no-camera` state | "No camera found. Use manual search." |
| Unsupported / insecure context | `unsupported` state | "Camera scanning isn't available in this browser. Use manual search." |
| Successful scan | stop camera, navigate | (navigates to order detail) |

All error/fallback states surface a **"Use manual search"** action that closes the modal and returns focus to the existing `OrderSearchInput`.

---

## 9. Security / RLS considerations

- **Auth:** `requireRole([USER_ROLES.seller])` in the action; entry lives under the seller-only `/seller` layout.
- **Scoping:** `getDashboardOrderByNumber(..., user.id)` filters `seller_id = auth.uid()`, with `orders` RLS (`seller_id = auth.uid() or is_admin()`) as the backstop — cross-seller isolation already proven (Steps 5.1/5.6). No new access surface.
- **No enumeration:** format regex gate + identical generic error for nonexistent vs foreign + a rate limit on the action.
- **Read-only:** the action performs a single `select`; it writes nothing. `@zxing/browser` never touches the server (dynamic client import only).

---

## 10. Dependency change

- **Add:** `@zxing/browser` (runtime; brings `@zxing/library`). Justification: cross-browser camera Code 128 decoding cannot be met reliably by native `BarcodeDetector` (absent in Firefox / desktop Safari) — approved in Step 2.
- **Isolation:** imported only via `await import()` inside the client modal → lands in an on-demand chunk, not the main/server bundle. Verified in the build step.
- No other dependency, config, or env change.

---

## 11. Exact files/functions/routes

**Add**
- `src/features/orders/utils/code128.ts` — `encodeCode128(value)`.
- `src/features/orders/components/Barcode128.tsx` — `<Barcode128 value height moduleWidth />`.
- `src/features/orders/components/BarcodeScannerModal.tsx` — scanner + lifecycle (dynamic zxing).
- `src/features/orders/components/ScanBarcodeButton.tsx` — entry button, lazy-mounts the modal.
- `queries.ts` → `getDashboardOrderByNumber`.
- `order.actions.ts` → `resolveSellerOrderByNumberAction`.
- `order.schema.ts` → `scanOrderNumberSchema` (+ exported type).

**Modify**
- `ShippingLabel.tsx` (render barcode), `src/app/seller/orders/page.tsx` (scan button), `package.json` (+lockfile), `MODULES.md`, `ARCHITECTURE.md`.

**Routes:** none added — reuse `ROUTES.sellerOrderDetail(id)`.

---

## 12. Testing & verification plan

**Static**
- `npm run lint`, `npm run typecheck`, `npm run build` green.
- Confirm zxing is **not** in the main/server bundle (only in the on-demand scanner chunk) via build output.
- Encoder unit sanity: encode a known `order_number`, confirm the SVG scans back to the same value with both the in-app scanner and an external phone scanner app.

**Barcode render**
- Print the shipping label; scan the printed Code 128 → decodes to the exact `order_number`.

**Camera — desktop** (Chrome, Edge, Firefox, Safari): integrated webcam opens; Code 128 decodes; navigates to the correct order; permission-denied and no-camera (disabled webcam) paths fall back to manual search.

**Camera — mobile** (Android Chrome, iOS Safari): rear/environment camera opens (`playsinline`); decodes; navigates; permission-denied path; in-app-webview limitation noted.

**Behavioral**
- Duplicate-scan: rapid frames → exactly one navigation.
- Cleanup: close modal / navigate away → camera indicator turns off; reopen works.
- Security (live, rolled-back or via UI): scanning another seller's `order_number` → generic error, no leak; invalid string → format error, no lookup.
- Regression: existing search, label print, and the full fulfillment flow (`advanceOrderStatusAction` / `record_order_shipment`) unchanged.

---

## 13. HTTPS / production testing considerations

- `getUserMedia` requires a **secure context**: HTTPS or `localhost`. Vercel preview/production is HTTPS ✓; local dev on `localhost` ✓.
- **Physical-device testing:** a phone hitting a **LAN HTTP** dev URL will have the camera **blocked** — test via a Vercel **preview deployment** (HTTPS) or an HTTPS tunnel. This is the primary operational gotcha.
- Optional (not required for same-origin top-level): a `Permissions-Policy: camera=(self)` response header. Only needed if the app is ever embedded in an iframe; skip for v1.

---

## 14. Explicit confirmations

- **No database migration / table / RLS / RPC / enum change.** `orders.order_number` already exists (sequence-backed, unique); the resolver is a read-only `select`.
- **No existing fulfillment write path or status behavior changes.** `advanceOrderStatusAction`, `record_order_shipment`, `orders`/`order_items` RLS, `enforce_order_update_rules`, the `order_status` enum, inventory/restock, and payment logic are all untouched. Scanning is read-only navigation.

---

## 15. Implementation sequence

1. **Dependency:** add `@zxing/browser` (lockfile updated).
2. **Barcode render (no dep):** `code128.ts` encoder → `Barcode128.tsx` → mount on `ShippingLabel.tsx`. Verify a printed label scans.
3. **Resolver:** `getDashboardOrderByNumber` (queries) + `scanOrderNumberSchema` + `resolveSellerOrderByNumberAction`. Verify seller-scoped exact match (rolled-back live test).
4. **Scanner:** `BarcodeScannerModal` (dynamic zxing, lifecycle, dedupe, cleanup, error/fallback states) + `ScanBarcodeButton`.
5. **Wire in:** add `ScanBarcodeButton` beside `OrderSearchInput` on `/seller/orders`.
6. **Verify:** lint/typecheck/build + bundle-isolation check; desktop & mobile camera QA over HTTPS; security + regression checks.
7. **Docs:** update MODULES.md / ARCHITECTURE.md.

*(Backend/data-safe first: render + resolver are low-risk and independently verifiable before the camera UI.)*

---

## 16. Files that will be changed

**New (7):** `utils/code128.ts`, `components/Barcode128.tsx`, `components/BarcodeScannerModal.tsx`, `components/ScanBarcodeButton.tsx`, plus additions to `queries.ts`, `order.actions.ts`, `order.schema.ts`.
**Modified (6):** `ShippingLabel.tsx`, `src/app/seller/orders/page.tsx`, `package.json` (+`package-lock.json`), `MODULES.md`, `ARCHITECTURE.md`.
**Dependency (1):** `@zxing/browser` (dynamically imported).
**Database:** none.

---

### Sign-off
Scope limited to the barcode identify/open feature: dependency-free Code 128 on the label + one dynamically-imported camera scanner that resolves the seller's own order and reuses the existing detail route. No DB migration, no new fulfillment write path, no out-of-scope logistics. **No implementation performed.**
