"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { RJ_CARD } from "@/components/ui/card";
import { ErrorState } from "@/components/feedback/ErrorState";
import { ROUTES } from "@/constants/routes";
import { checkCartAvailabilityAction } from "@/features/cart/actions/cart.actions";
import { useCart } from "@/features/cart/hooks/useCart";
import { getCartLineKey, getSelectedItems } from "@/features/cart/utils/cart-reducer";
import { createAddressAction } from "@/features/addresses/actions/address.actions";
import type { Address } from "@/features/addresses/types/address.types";
import { placeOrderAction } from "@/features/checkout/actions/checkout.actions";
import { AddressPicker } from "@/features/checkout/components/AddressPicker";
import { CheckoutEmptyState } from "@/features/checkout/components/CheckoutEmptyState";
import { CheckoutGroupCard } from "@/features/checkout/components/CheckoutGroupCard";
import { CheckoutTotals } from "@/features/checkout/components/CheckoutTotals";
import { OrderNotesField } from "@/features/checkout/components/OrderNotesField";
import { PaymentMethodCard } from "@/features/checkout/components/PaymentMethodCard";
import { SelectedAddressCard } from "@/features/checkout/components/SelectedAddressCard";
import { ShippingAddressForm } from "@/features/checkout/components/ShippingAddressForm";
import { ShippingMethodCard } from "@/features/checkout/components/ShippingMethodCard";
import { CHECKOUT_CONSTANTS, CHECKOUT_COPY } from "@/features/checkout/constants/checkout.constants";
import { useCheckoutIdempotencyKey } from "@/features/checkout/hooks/useCheckoutIdempotencyKey";
import {
  shippingAddressSchema,
  type ShippingAddressInput,
  type XenditChannel,
} from "@/features/checkout/schemas/checkout.schema";
import type { PaymentMethod, PlaceOrderResult } from "@/features/checkout/types/checkout.types";
import { addressToShippingInput } from "@/features/checkout/utils/addressMapping";
import { buildCheckoutFingerprint } from "@/features/checkout/utils/idempotency";
import { groupCartBySeller } from "@/features/checkout/utils/groupCartBySeller";
import { cn } from "@/lib/utils/cn";
// Imported directly from the actions module, not the feature barrel — the
// barrel also re-exports `PaymentsList`, which pulls in `xendit-reconciliation`
// and the server-only Xendit client; bundling that into this Client Component
// via the barrel breaks the build ("server-only cannot be imported from a
// Client Component"). `XenditPaymentOptions` already imports these two the
// same way for the same reason.
import {
  createXenditEwalletPaymentAction,
  createXenditGroupEwalletPaymentAction,
} from "@/features/payments/actions/xendit.actions";
import { XenditCardPaymentButton } from "@/features/payments/components/XenditCardPaymentButton";
import type { ActionResult } from "@/types/action.types";

type FieldErrors = Record<string, string[] | undefined>;
type AddressSource = "saved" | "last-order" | "profile" | "new" | "empty";
/**
 * Set once Card orders are placed successfully — holds the target for the
 * inline "complete your card payment" step (see `handlePlaceOrder`'s Card
 * branch) and where to land once it's done, so this component can render
 * that step in place of the checkout form instead of navigating away first.
 */
type CardPaymentTarget = {
  ordersUrl: string;
} & ({ orderId: string; checkoutGroupId?: undefined } | { orderId?: undefined; checkoutGroupId: string });

const EMPTY_ADDRESS: ShippingAddressInput = {
  fullName: "",
  line1: "",
  line2: "",
  barangay: "",
  city: "",
  province: "",
  region: "",
  postalCode: "",
  country: CHECKOUT_CONSTANTS.shippingCountry,
  phone: "",
};

export interface CheckoutFormProps {
  /** The signed-in buyer's saved addresses — see `checkout/page.tsx`. Empty when they have none yet. */
  savedAddresses: Address[];
  /** Server-resolved starting values: default saved address, else last order's address, else profile name/phone. Omitted when the buyer has none of those. */
  initialAddress?: ShippingAddressInput;
  /** Which of the three prefill sources produced `initialAddress` — drives which hint (if any) is shown. */
  initialAddressSource?: AddressSource;
  /** The saved address `initialAddress` came from, when the source is "saved" — pre-selects it in the picker. */
  initialSelectedAddressId?: string | null;
  /** The buyer's saved default payment method (Privacy & Settings), if any — seeds the initial radio selection. Purely a starting value; the buyer can still change it here, same as address. */
  initialMethod?: PaymentMethod;
}

/**
 * The checkout flow: reads the guest cart, groups it by seller, collects a
 * shipping address (validated client-side then server-side), and submits to
 * `placeOrderAction`. Handles partial success explicitly — placed groups are
 * removed from the cart, failed groups stay with a clear reason. On full
 * success, hands off to the order-confirmation page rather than the raw
 * order-history list. The address field starts from `initialAddress` when
 * the page provided one, but stays fully editable — a buyer can overwrite
 * any or all of it, or use "Change" to pick a different saved address.
 */
export function CheckoutForm({
  savedAddresses,
  initialAddress,
  initialAddressSource = "empty",
  initialSelectedAddressId = null,
  initialMethod,
}: CheckoutFormProps) {
  const router = useRouter();
  const { items, removeMany, selectedIds } = useCart();

  // Checkout only ever places an order for the cart page's selected
  // items (selective checkout) — deselected lines stay in the cart
  // untouched. `placeOrderAction`/`create_order` are unchanged; this only
  // changes which items are handed to them.
  const checkoutItems = useMemo(
    () => getSelectedItems(items, selectedIds),
    [items, selectedIds],
  );
  const groups = useMemo(() => groupCartBySeller(checkoutItems), [checkoutItems]);

  // F-05: a buyer who deep-links straight to /checkout (skipping /cart) never
  // triggers CartSummary's own live-stock check, so the first stock
  // validation they'd otherwise hit is create_order itself, at the very end
  // of the flow. Mirrors CartSummary's own availability check exactly —
  // same action, same key-guard pattern — just blocking "Place order"
  // instead of the "Checkout" link.
  const checkoutIdsKey = useMemo(
    () => [...new Set(checkoutItems.map((item) => getCartLineKey(item)))].sort().join(","),
    [checkoutItems],
  );
  const [hasCheckoutStockIssue, setHasCheckoutStockIssue] = useState(false);
  const checkoutAvailabilityKeyRef = useRef<string | null>(null);

  const runCheckoutAvailabilityCheck = useCallback(() => {
    if (!checkoutIdsKey) return;
    if (checkoutAvailabilityKeyRef.current === checkoutIdsKey) return;
    checkoutAvailabilityKeyRef.current = checkoutIdsKey;
    void (async () => {
      const lines = checkoutItems.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
      }));
      const availabilityResult = await checkCartAvailabilityAction(lines);
      if (!availabilityResult.success) return;
      const byKey = new Map(
        availabilityResult.data.map((entry) => [
          getCartLineKey({ productId: entry.productId, variantId: entry.variantId ?? undefined }),
          entry,
        ]),
      );
      const issue = checkoutItems.some((item) => {
        const live = byKey.get(getCartLineKey(item));
        return !live || live.status !== "active" || live.quantity < item.quantity;
      });
      setHasCheckoutStockIssue(issue);
    })();
    // `checkoutItems` (not just checkoutIdsKey) is read for each line's
    // variantId/quantity, which the key alone doesn't expose — same
    // intentional omission as CartSummary's own availability-check effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutIdsKey]);

  useEffect(() => {
    runCheckoutAvailabilityCheck();
  }, [runCheckoutAvailabilityCheck]);

  const [address, setAddress] = useState<ShippingAddressInput>(
    initialAddress ?? EMPTY_ADDRESS,
  );
  const [addressSource, setAddressSource] = useState<AddressSource>(initialAddressSource);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    initialSelectedAddressId,
  );
  const [showPicker, setShowPicker] = useState(false);
  const [saveNewAddress, setSaveNewAddress] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<PlaceOrderResult | null>(null);
  const [method, setMethod] = useState<PaymentMethod>(initialMethod ?? "cod");
  const [xenditChannel, setXenditChannel] = useState<XenditChannel | null>(null);
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [cardPaymentTarget, setCardPaymentTarget] = useState<CardPaymentTarget | null>(null);

  // Idempotency key for this checkout attempt — see useCheckoutIdempotencyKey
  // for why this is fingerprint-keyed and sessionStorage-backed rather than a
  // bare ref.
  const { getOrCreateKey, retireKey } = useCheckoutIdempotencyKey();

  // Switching back to COD clears any channel choice so a stale selection
  // never lingers if the buyer flips to Online Payment again.
  function handleMethodChange(next: PaymentMethod) {
    setMethod(next);
    if (next === "cod") setXenditChannel(null);
    setFieldErrors((prev) => (prev.xenditChannel ? { ...prev, xenditChannel: undefined } : prev));
  }

  function handleChannelChange(next: XenditChannel) {
    setXenditChannel(next);
    setFieldErrors((prev) => (prev.xenditChannel ? { ...prev, xenditChannel: undefined } : prev));
  }

  // Checked ahead of the empty-cart states below: by the time this is set,
  // `removeMany(checkoutItems)` has already cleared the cart, so those
  // checks would otherwise show "nothing selected" instead of the payment
  // step the buyer is mid-way through.
  if (cardPaymentTarget) {
    return (
      <div className={cn(RJ_CARD, "flex flex-col gap-4 p-6")}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-600">
            Order placed
          </p>
          <h2 className="mt-1 font-serif text-xl text-rj-black">
            Complete your card payment
          </h2>
          <p className="mt-1 text-sm text-rj-gray-600">
            Enter your card details below to finish paying for this order.
          </p>
        </div>
        {cardPaymentTarget.orderId !== undefined ? (
          <XenditCardPaymentButton
            orderId={cardPaymentTarget.orderId}
            autoStart
            onComplete={() => router.push(cardPaymentTarget.ordersUrl)}
          />
        ) : (
          <XenditCardPaymentButton
            checkoutGroupId={cardPaymentTarget.checkoutGroupId}
            autoStart
            onComplete={() => router.push(cardPaymentTarget.ordersUrl)}
          />
        )}
        <Link
          href={cardPaymentTarget.ordersUrl}
          className="w-fit text-xs font-semibold text-rj-red-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
        >
          I&apos;ll pay later from My Orders
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return <CheckoutEmptyState reason="empty" />;
  }
  if (checkoutItems.length === 0) {
    return <CheckoutEmptyState reason="nothing-selected" />;
  }

  const grandSubtotalCents = groups.reduce(
    (sum, group) => sum + group.subtotalCents,
    0,
  );
  const grandShippingCents = groups.reduce(
    (sum, group) => sum + group.shippingFeeCents,
    0,
  );
  const grandTotalCents = grandSubtotalCents + grandShippingCents;
  // Assumes every group shares one currency (PHP) — this marketplace is
  // single-market/PHP-only by design (see siteConfig, README), not a
  // multi-currency checkout. A cart mixing currencies isn't a supported case.
  const currency = groups[0]?.currency;

  function handleChange(field: keyof ShippingAddressInput, value: string) {
    setAddress((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  function handleSelectAddress(selected: Address) {
    setAddress(addressToShippingInput(selected));
    setSelectedAddressId(selected.id);
    setAddressSource("saved");
    setSaveNewAddress(false);
    setFieldErrors({});
    setShowPicker(false);
  }

  function handleSelectNewAddress() {
    setAddress(EMPTY_ADDRESS);
    setSelectedAddressId(null);
    setAddressSource("new");
    setFieldErrors({});
    setShowPicker(false);
  }

  function handlePlaceOrder() {
    setFormError(null);
    setResult(null);

    if (hasCheckoutStockIssue) {
      setFormError(
        "One of your items no longer has enough stock. Go back to your cart to adjust it before placing this order.",
      );
      return;
    }

    const parsed = shippingAddressSchema.safeParse(address);
    if (!parsed.success) {
      setFieldErrors(
        z.flattenError(parsed.error).fieldErrors as FieldErrors,
      );
      return;
    }

    // Online Payment requires a channel choice made right here — mirrored
    // server-side in `placeOrderSchema`'s refine, this is just the fast,
    // no-round-trip check so Place Order never submits an ambiguous order.
    if (method === "xendit" && xenditChannel === null) {
      setFieldErrors((prev) => ({
        ...prev,
        xenditChannel: [CHECKOUT_COPY.channelRequiredError],
      }));
      return;
    }

    // Built once, used both to fingerprint this exact attempt and as the
    // payload sent below — one source of truth for "what is being submitted".
    const orderGroups = groups.map((group) => ({
      sellerId: group.sellerId,
      sellerName: group.sellerName,
      items: group.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      })),
    }));
    const trimmedNotes = notes.trim() || undefined;
    const effectiveXenditChannel = method === "xendit" ? xenditChannel ?? undefined : undefined;

    const idempotencyKey = getOrCreateKey(
      buildCheckoutFingerprint({
        address: parsed.data,
        groups: orderGroups,
        notes: trimmedNotes,
        paymentMethod: method,
        xenditChannel: effectiveXenditChannel,
      }),
    );

    startTransition(async () => {
      // Best-effort, independent of order placement — a save failure here
      // must never block checkout. Only offered when the buyer isn't
      // already using one of their saved addresses.
      if (saveNewAddress && selectedAddressId === null) {
        void createAddressAction({
          label: "Home",
          recipientName: parsed.data.fullName,
          phone: parsed.data.phone || "",
          region: parsed.data.region || "",
          province: parsed.data.province || "",
          city: parsed.data.city,
          barangay: parsed.data.barangay || "",
          streetDetails: parsed.data.line2
            ? `${parsed.data.line1}, ${parsed.data.line2}`
            : parsed.data.line1,
          postalCode: parsed.data.postalCode,
        }).catch(() => {});
      }

      const actionResult: ActionResult<PlaceOrderResult> = await placeOrderAction({
        address: parsed.data,
        groups: orderGroups,
        notes: trimmedNotes,
        paymentMethod: method,
        xenditChannel: effectiveXenditChannel,
        idempotencyKey,
      });

      if (!actionResult.success) {
        setFormError(actionResult.error);
        if (actionResult.fieldErrors) setFieldErrors(actionResult.fieldErrors);
        return;
      }

      const { created, failed, checkoutGroupId } = actionResult.data;

      // Retire the key once something was actually created, so a later, genuinely
      // new checkout gets a fresh key. On a fully-failed attempt the key is kept
      // so an immediate retry — even after a reload, now that it's persisted —
      // still dedups a possibly-created-but-lost order.
      if (created.length > 0) retireKey();
      setResult(actionResult.data);
      const placedLines = created.flatMap((order) => order.lines);

      if (failed.length === 0) {
        // Full success: remove exactly the items that were just ordered —
        // not the whole cart, since deselected lines were never part of
        // this checkout and should stay put.
        removeMany(checkoutItems);
        // Resolved server-side (`resolveRedirectTab`, reading the
        // `buyer_order_lifecycle` view) — never re-derived here, so the tab
        // mapping has exactly one source of truth. `null` means "All".
        const ordersUrl = actionResult.data.redirectTab
          ? `${ROUTES.orders}?tab=${actionResult.data.redirectTab}`
          : ROUTES.orders;

        // COD (or a channel that can't auto-continue) lands on the orders
        // list — the just-placed order already carries its bucket.
        if (method !== "xendit" || xenditChannel === null) {
          router.push(ordersUrl);
          return;
        }

        // GCash/Maya: continue straight into the existing Xendit action —
        // the same one `XenditPaymentOptions` already calls — which redirects
        // to Xendit's hosted checkout itself. A successful call throws
        // Next's redirect and never returns here at all.
        if (xenditChannel === "GCASH" || xenditChannel === "PAYMAYA") {
          const payResult = checkoutGroupId
            ? await createXenditGroupEwalletPaymentAction(checkoutGroupId, xenditChannel)
            : await createXenditEwalletPaymentAction(created[0].orderId, xenditChannel);

          if (payResult.success) {
            // Unreachable in practice — success redirects instead of
            // resolving — kept as a safe no-op if that ever changes.
            return;
          }

          // Only reached on a genuine in-app failure (Xendit unreachable,
          // misconfigured credentials, etc.) — never shown verbatim to the
          // buyer (error hygiene), but logged for diagnosis. The order was
          // already placed and already carries this channel on its payments
          // row (the eager reservation in `placeOrderAction`), so the "To
          // Pay" order card picks it up on its own — no query param needed.
          console.error("Xendit e-wallet handoff failed after checkout:", payResult.error);
          router.push(ordersUrl);
          return;
        }

        // Card can't redirect like the e-wallet channels (its embedded
        // widget must mount client-side, and can't be started from this
        // Server Action redirect chain), so it can't leave this page the
        // same way GCash/Maya do above — but for the same "completed during
        // checkout, not a separate later action" experience, render the
        // widget here instead of sending the buyer to Orders to find their
        // order and click "Pay with Card" a second time. The order already
        // carries "CARD" on its payments row from the eager reservation, so
        // if the buyer bails out (closes the tab, picks "pay later"), it's
        // still correctly in To Pay when they come back — same fallback as
        // before, just no longer the only path.
        setCardPaymentTarget(
          checkoutGroupId
            ? { checkoutGroupId, ordersUrl }
            : { orderId: created[0].orderId, ordersUrl },
        );
        return;
      }

      // Partial success: drop only placed items; keep failed ones to fix/retry.
      if (placedLines.length > 0) removeMany(placedLines);
    });
  }

  const partialFailed = result?.failed ?? [];
  const addressHint =
    addressSource === "saved"
      ? CHECKOUT_COPY.defaultAddressNote
      : addressSource === "last-order"
        ? CHECKOUT_COPY.addressPrefilledNote
        : null;
  // Offered whenever the current address isn't already one of the buyer's
  // saved ones — covers both an explicit "+ Add New Address" pick and a
  // first-time buyer with no saved addresses at all.
  const showSaveAddressOption = selectedAddressId === null;

  return (
    <form
      className="flex flex-col gap-8"
      aria-busy={isPending}
      onSubmit={(event) => {
        event.preventDefault();
        handlePlaceOrder();
      }}
    >
      {result && result.failed.length > 0 ? (
        <div className="flex flex-col gap-3">
          {result.created.length > 0 ? (
            <p
              role="status"
              aria-live="polite"
              className="text-sm font-medium text-rj-green"
            >
              Some orders were placed. The items we couldn&apos;t order are still
              in your cart.
            </p>
          ) : null}
          {partialFailed.map((failed) => (
            <ErrorState
              key={failed.sellerId}
              title={`Couldn't order from ${failed.sellerName ?? "this seller"}`}
              message={failed.reason}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            <Link
              href={ROUTES.orders}
              className="text-xs font-semibold text-rj-red-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
            >
              View my orders
            </Link>
            {partialFailed.length > 0 ? (
              <Link
                href={ROUTES.cart}
                className="text-xs font-semibold text-rj-red-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
              >
                Adjust items still in your cart
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={cn(RJ_CARD, "flex flex-col divide-y divide-rj-gray-100")}>
        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-600">
              {CHECKOUT_COPY.deliveryAddressSectionTitle}
            </p>
            {savedAddresses.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowPicker((v) => !v)}
                aria-expanded={showPicker}
                className="text-xs font-semibold text-rj-red-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
              >
                {showPicker ? "Hide" : CHECKOUT_COPY.changeAddressLabel}
              </button>
            ) : null}
          </div>

          {showPicker ? (
            <AddressPicker
              addresses={savedAddresses}
              selectedAddressId={selectedAddressId}
              onSelectAddress={handleSelectAddress}
              onSelectNew={handleSelectNewAddress}
            />
          ) : null}

          {!showPicker && selectedAddressId !== null ? (
            <SelectedAddressCard value={address} />
          ) : null}

          {selectedAddressId === null ? (
            <>
              {addressHint ? (
                <p className="text-xs text-rj-gray-600">{addressHint}</p>
              ) : null}
              <ShippingAddressForm
                values={address}
                errors={fieldErrors}
                onChange={handleChange}
              />
            </>
          ) : null}

          {showSaveAddressOption ? (
            <label className="flex items-center gap-2 text-xs font-medium text-rj-gray-600">
              <input
                type="checkbox"
                checked={saveNewAddress}
                onChange={(event) => setSaveNewAddress(event.target.checked)}
                className="h-4 w-4 shrink-0 accent-rj-red"
              />
              {CHECKOUT_COPY.saveAddressLabel}
            </label>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-600">
            {CHECKOUT_COPY.orderSectionTitle}
          </p>
          <div className="flex flex-col divide-y divide-dashed divide-rj-gray-100">
            {groups.map((group) => (
              <div key={group.sellerId} className="py-4 first:pt-0 last:pb-0">
                <CheckoutGroupCard group={group} showTotals={groups.length > 1} />
              </div>
            ))}
          </div>
        </div>

        <div className="p-5">
          <ShippingMethodCard />
        </div>

        <div className="p-5">
          <PaymentMethodCard
            method={method}
            onChange={handleMethodChange}
            channel={xenditChannel}
            onChannelChange={handleChannelChange}
            channelError={fieldErrors.xenditChannel?.[0]}
          />
        </div>

        <div className="p-5">
          <OrderNotesField
            value={notes}
            onChange={setNotes}
            errors={fieldErrors.notes}
          />
        </div>

        <div className="flex flex-col items-stretch gap-3 p-5 sm:items-end">
          <CheckoutTotals
            title="Order total"
            subtotalCents={grandSubtotalCents}
            shippingFeeCents={grandShippingCents}
            totalCents={grandTotalCents}
            currency={currency ?? "PHP"}
            align="right"
          />

          {groups.length > 1 ? (
            <p role="note" className="text-xs font-medium text-rj-gray-600 sm:text-right">
              {method === "xendit"
                ? CHECKOUT_COPY.multiShopOnlinePaymentNotice
                : `${CHECKOUT_COPY.multiShopNoticePrefix} ${groups.length} ${CHECKOUT_COPY.multiShopNoticeSuffix}`}
            </p>
          ) : null}

          {hasCheckoutStockIssue ? (
            <p role="alert" className="text-xs font-semibold text-rj-red-dark sm:text-right">
              One of your items no longer has enough stock.{" "}
              <Link href={ROUTES.cart} className="underline underline-offset-2">
                Go back to your cart
              </Link>{" "}
              to adjust it.
            </p>
          ) : null}

          <Button
            type="submit"
            variant="rj"
            size="rj"
            isLoading={isPending}
            disabled={hasCheckoutStockIssue}
            className="w-full sm:w-auto sm:min-w-55"
          >
            {isPending ? CHECKOUT_COPY.placingOrder : CHECKOUT_COPY.placeOrder}
          </Button>

          {formError ? (
            <ErrorState title="Couldn't place your order" message={formError} />
          ) : null}

          <p className="text-xs text-rj-gray-600 sm:text-right">
            {CHECKOUT_COPY.agreeNote}
          </p>
        </div>
      </div>
    </form>
  );
}
