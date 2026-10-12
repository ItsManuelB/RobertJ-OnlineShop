"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Package } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RJ_CARD } from "@/components/ui/card";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ROUTES } from "@/constants/routes";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import {
  checkCartAvailabilityAction,
  getSimilarProductsAction,
} from "@/features/cart/actions/cart.actions";
import { useCart } from "@/features/cart/hooks/useCart";
import {
  getCartLineKey,
  getCartTotals,
  getSelectedItems,
} from "@/features/cart/utils/cart-reducer";
import { toggleWishlistAction } from "@/features/wishlist/actions/wishlist.actions";
import { groupCartBySeller } from "@/features/checkout/utils/groupCartBySeller";
import { getCoverImage, type Product } from "@/features/products/types/product.types";
import type { CartAvailabilityEntry } from "@/lib/supabase/queries";

const ROW_GRID = "md:grid md:grid-cols-[1fr_120px_150px_120px_150px] md:items-center md:gap-3";

export interface CartSummaryProps {
  /** Guests can build a cart (ADR-013), but "Move to Wishlist" requires an
   * account — mirrors `WishlistButton`'s guest-redirect, not a silent no-op. */
  isAuthenticated: boolean;
}

/** Line items, per-shop and per-item selection, and totals — the cart page. */
export function CartSummary({ isAuthenticated }: CartSummaryProps) {
  const router = useRouter();
  const {
    items,
    setQuantity,
    removeItem,
    removeMany,
    updateItem,
    selectedIds,
    toggleSelected,
    setSelected,
    mergeNotice,
    dismissMergeNotice,
  } = useCart();
  // Keyed by the exact id set it was fetched for, so a newly-added item isn't
  // momentarily flagged "unavailable" using a stale response from before it
  // existed in the cart — see the `checked` derivation below.
  const [availability, setAvailability] = useState<{
    key: string;
    data: Map<string, CartAvailabilityEntry>;
  } | null>(null);
  const [, startChecking] = useTransition();
  const [isMovingToWishlist, startMovingToWishlist] = useTransition();

  // "Find Similar" — expands inline below the row instead of navigating
  // away (Shopee-style). One row open at a time; results are cached per
  // product id so re-toggling the same row doesn't refetch.
  const [expandedSimilarId, setExpandedSimilarId] = useState<string | null>(null);
  const [similarCache, setSimilarCache] = useState<Map<string, Product[]>>(new Map());
  const [isLoadingSimilar, startLoadingSimilar] = useTransition();

  // Stable key so the availability check only re-fires when the actual set of
  // cart lines changes (e.g. after localStorage hydration), not on every
  // unrelated cart re-render.
  const idsKey = useMemo(
    () =>
      [...new Set(items.map((item) => getCartLineKey(item)))].sort().join(","),
    [items],
  );

  // One order is placed per seller at checkout (ADR-012) — grouping the cart
  // the same way here means the buyer never sees a surprise split later.
  const groups = useMemo(() => groupCartBySeller(items), [items]);

  // Keyed by idsKey (not a bare boolean) so a duplicate call for the SAME
  // content (the visibilitychange+focus double-fire on tab-return below) is
  // skipped, while a call for genuinely NEW content (the cart changed while
  // a previous check was still in flight) is never blocked by it.
  const inFlightKeyRef = useRef<string | null>(null);

  const runAvailabilityCheck = useCallback(() => {
    if (!idsKey || items.length === 0) return;
    if (inFlightKeyRef.current === idsKey) return;
    inFlightKeyRef.current = idsKey;
    startChecking(async () => {
      try {
        const lines = items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
        }));
        const result = await checkCartAvailabilityAction(lines);
        if (result.success) {
          setAvailability({
            key: idsKey,
            data: new Map(
              result.data.map((entry) => [
                getCartLineKey({
                  productId: entry.productId,
                  variantId: entry.variantId ?? undefined,
                }),
                entry,
              ]),
            ),
          });
        }
      } finally {
        if (inFlightKeyRef.current === idsKey) inFlightKeyRef.current = null;
      }
    });
    // `items` (not just idsKey) is read for each line's variantId, which idsKey
    // alone (a sorted string) doesn't expose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    runAvailabilityCheck();
  }, [runAvailabilityCheck]);

  // Re-verify when the buyer returns to the tab after idling on the cart page,
  // so stock/price staleness surfaces here rather than only at order placement
  // after the whole address form is filled. `create_order` remains the
  // authoritative re-check regardless; this is a UX early warning.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") runAvailabilityCheck();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [runAvailabilityCheck]);

  const checked = availability?.key === idsKey;

  if (items.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Browse the marketplace to find something you like."
        action={
          <Link
            href={ROUTES.products}
            className={cn(
              buttonVariants({ variant: "rjOutline", size: "rjSm" }),
            )}
          >
            Browse products
          </Link>
        }
      />
    );
  }

  const allIds = items.map((item) => getCartLineKey(item));
  const selectedItems = getSelectedItems(items, selectedIds);
  const selectedCount = selectedItems.length;
  const allSelected = selectedCount === items.length;
  const selectAllChecked: boolean | "indeterminate" = allSelected
    ? true
    : selectedCount > 0
      ? "indeterminate"
      : false;
  const { subtotalCents: selectedSubtotalCents } = getCartTotals({
    items: selectedItems,
  });

  // "unavailable" still flags every affected row regardless of selection
  // (so the buyer always sees it), but only a *selected* unavailable item
  // blocks Checkout — a deselected one shouldn't stop the rest of the order.
  const isRowUnavailable = (item: { productId: string; variantId?: string }) => {
    if (!checked) return false;
    const live = availability?.data.get(getCartLineKey(item));
    return !live || live.status !== "active" || live.quantity <= 0;
  };
  const hasUnavailableSelectedItem = selectedItems.some((item) =>
    isRowUnavailable(item),
  );

  // A selected line can carry more quantity than is actually in stock (the
  // cart itself never enforces a ceiling — see the F-05 audit finding) and
  // previously only surfaced an informational "Only N left" banner, letting
  // the buyer reach checkout anyway and fail at the very last step. Blocking
  // here instead routes them to the existing "Reduce to N" control first.
  const isRowLowStock = (item: { productId: string; variantId?: string; quantity: number }) => {
    if (!checked || isRowUnavailable(item)) return false;
    const live = availability?.data.get(getCartLineKey(item));
    return Boolean(live && live.quantity < item.quantity);
  };
  const hasLowStockSelectedItem = selectedItems.some((item) => isRowLowStock(item));
  const blockCheckout = hasUnavailableSelectedItem || hasLowStockSelectedItem;

  function handleDeleteSelected() {
    if (selectedCount === 0) return;
    removeMany(selectedItems);
  }

  function handleToggleFindSimilar(productId: string) {
    if (expandedSimilarId === productId) {
      setExpandedSimilarId(null);
      return;
    }
    setExpandedSimilarId(productId);
    if (!similarCache.has(productId)) {
      startLoadingSimilar(async () => {
        const result = await getSimilarProductsAction(productId);
        if (result.success) {
          setSimilarCache((prev) => new Map(prev).set(productId, result.data));
        }
      });
    }
  }

  function handleMoveSelectedToWishlist() {
    if (selectedCount === 0) return;
    if (!isAuthenticated) {
      router.push(`${ROUTES.signIn}?redirectTo=${encodeURIComponent(ROUTES.cart)}`);
      return;
    }
    startMovingToWishlist(async () => {
      const results = await Promise.all(
        selectedItems.map((item) => toggleWishlistAction(item.productId, true)),
      );
      const moved = selectedItems.filter((_, index) => results[index]?.success);
      if (moved.length > 0) removeMany(moved);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {mergeNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rj-green/10 px-4 py-2.5 text-xs font-semibold text-rj-black"
        >
          <span>{mergeNotice}</span>
          <button
            type="button"
            onClick={dismissMergeNotice}
            className="underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <div className={cn(RJ_CARD, "overflow-hidden")}>
        {/* Column header — desktop only; mobile rows are self-describing cards. */}
        <div
          className={cn(
            "hidden border-b border-rj-gray-100 bg-rj-gray-50 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-rj-gray-500",
            ROW_GRID,
          )}
        >
          <div className="flex items-center gap-3">
            <Checkbox
              checked={selectAllChecked}
              onChange={() => setSelected(allIds, !allSelected)}
              aria-label="Select all items"
            />
            <span>Product</span>
          </div>
          <span>Unit Price</span>
          <span>Quantity</span>
          <span>Total Price</span>
          <span>Actions</span>
        </div>

        <div className="flex flex-col divide-y divide-rj-gray-100">
          {groups.map((group) => {
            const groupIds = group.items.map((item) => getCartLineKey(item));
            const groupSelectedCount = group.items.filter((item) =>
              selectedIds.has(getCartLineKey(item)),
            ).length;
            const groupAllSelected = groupSelectedCount === group.items.length;
            const groupChecked: boolean | "indeterminate" = groupAllSelected
              ? true
              : groupSelectedCount > 0
                ? "indeterminate"
                : false;

            return (
              <section key={group.sellerId} className="flex flex-col gap-3 p-4">
                <h3 className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wide text-rj-gray-600">
                  <Checkbox
                    checked={groupChecked}
                    onChange={() => setSelected(groupIds, !groupAllSelected)}
                    aria-label={`Select all items from ${group.sellerName ?? "this shop"}`}
                  />
                  <span aria-hidden="true">🏪</span>
                  {group.sellerName ?? "Shop"}
                </h3>

                <ul className="flex flex-col gap-3">
                  {group.items.map((item) => {
                    const lineKey = getCartLineKey(item);
                    const live = availability?.data.get(lineKey);
                    const isUnavailable = isRowUnavailable(item);
                    const priceChanged =
                      !isUnavailable && live && live.priceCents !== item.unitPriceCents;
                    const lowStock =
                      !isUnavailable && live && live.quantity < item.quantity;
                    const lineTotalCents = item.unitPriceCents * item.quantity;
                    const isSelected = selectedIds.has(lineKey);

                    return (
                      <li
                        key={lineKey}
                        className={cn(RJ_CARD, "flex flex-col gap-3 p-4 shadow-sm", ROW_GRID)}
                      >
                        {/* Product cell: checkbox + thumbnail + name (all breakpoints) */}
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={isSelected}
                            onChange={() => toggleSelected(lineKey)}
                            aria-label={`Select ${item.title}`}
                          />
                          {item.imageUrl ? (
                            <Image
                              src={item.imageUrl}
                              alt={item.title}
                              width={64}
                              height={64}
                              className="h-16 w-16 shrink-0 rounded-xl object-cover"
                            />
                          ) : (
                            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-rj-gray-100">
                              <Package className="h-6 w-6 text-rj-gray-400" aria-hidden="true" />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <Link
                              href={ROUTES.productDetail(item.slug)}
                              className="line-clamp-2 text-sm font-semibold text-rj-black hover:underline"
                            >
                              {item.title}
                            </Link>
                            {item.variantLabel ? (
                              <p className="mt-0.5 text-xs text-rj-gray-500">
                                {item.variantLabel}
                              </p>
                            ) : null}
                            {/* Mobile-only: unit price/qty/total collapse under the name. */}
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 md:hidden">
                              <span className="text-xs text-rj-gray-600">
                                {formatCurrency(item.unitPriceCents, item.currency)} each
                              </span>
                              {isUnavailable ? null : (
                                <QuantityStepper
                                  id={`qty-${lineKey}`}
                                  value={item.quantity}
                                  max={item.maxQuantity}
                                  onChange={(quantity) => setQuantity(item, quantity)}
                                  aria-label={`Quantity for ${item.title}`}
                                />
                              )}
                              <span className="text-xs font-bold text-rj-black">
                                {formatCurrency(lineTotalCents, item.currency)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Desktop-only table columns */}
                        <span className="hidden text-sm text-rj-gray-700 md:block">
                          {formatCurrency(item.unitPriceCents, item.currency)}
                        </span>
                        <div className="hidden md:block">
                          {isUnavailable ? (
                            <span className="text-xs text-rj-gray-400">—</span>
                          ) : (
                            <QuantityStepper
                              id={`qty-desktop-${lineKey}`}
                              value={item.quantity}
                              max={item.maxQuantity}
                              onChange={(quantity) => setQuantity(item, quantity)}
                              aria-label={`Quantity for ${item.title}`}
                            />
                          )}
                        </div>
                        <span className="hidden text-sm font-bold text-rj-black md:block">
                          {formatCurrency(lineTotalCents, item.currency)}
                        </span>

                        {/* Actions — Delete / Find Similar, all breakpoints */}
                        <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-1">
                          <button
                            type="button"
                            onClick={() => removeItem(item)}
                            className="text-xs font-semibold text-rj-red-dark underline-offset-2 hover:underline"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleFindSimilar(item.productId)}
                            aria-expanded={expandedSimilarId === item.productId}
                            className="flex items-center gap-0.5 text-xs font-semibold text-rj-gray-600 underline-offset-2 hover:text-rj-black hover:underline"
                          >
                            Find Similar
                            <ChevronDown
                              className={cn(
                                "h-3 w-3 transition-transform",
                                expandedSimilarId === item.productId && "rotate-180",
                              )}
                              aria-hidden="true"
                            />
                          </button>
                        </div>

                        {isUnavailable ? (
                          <div
                            role="status"
                            aria-live="polite"
                            className="flex flex-wrap items-center gap-2 rounded-xl bg-danger/5 px-3 py-2 text-xs font-semibold text-rj-red-dark md:col-span-5"
                          >
                            <span>This item is no longer available.</span>
                            <button
                              type="button"
                              onClick={() => removeItem(item)}
                              className="underline underline-offset-2"
                            >
                              Remove from cart
                            </button>
                          </div>
                        ) : null}

                        {priceChanged && live ? (
                          <div
                            role="status"
                            aria-live="polite"
                            className="flex flex-wrap items-center gap-2 rounded-xl bg-rj-gold/10 px-3 py-2 text-xs font-semibold text-rj-black md:col-span-5"
                          >
                            <span>
                              Price changed: was{" "}
                              {formatCurrency(item.unitPriceCents, item.currency)}, now{" "}
                              {formatCurrency(live.priceCents, item.currency)}.
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateItem(item, { unitPriceCents: live.priceCents })
                              }
                              className="underline underline-offset-2"
                            >
                              Update price
                            </button>
                          </div>
                        ) : null}

                        {lowStock && live ? (
                          <div
                            role="status"
                            aria-live="polite"
                            className="flex flex-wrap items-center gap-2 rounded-xl bg-rj-gold/10 px-3 py-2 text-xs font-semibold text-rj-black md:col-span-5"
                          >
                            <span>Only {live.quantity} left in stock.</span>
                            <button
                              type="button"
                              onClick={() => {
                                updateItem(item, { maxQuantity: live.quantity });
                                setQuantity(item, live.quantity);
                              }}
                              className="underline underline-offset-2"
                            >
                              Reduce to {live.quantity}
                            </button>
                          </div>
                        ) : null}

                        {expandedSimilarId === item.productId ? (
                          <div className="rounded-xl border border-rj-gray-100 bg-rj-gray-50 p-3 md:col-span-5">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-rj-gray-500">
                              Similar Products
                            </p>
                            {isLoadingSimilar && !similarCache.has(item.productId) ? (
                              <p className="py-2 text-xs text-rj-gray-500">Loading…</p>
                            ) : (similarCache.get(item.productId)?.length ?? 0) === 0 ? (
                              <p className="py-2 text-xs text-rj-gray-500">
                                No similar products found.
                              </p>
                            ) : (
                              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                                {similarCache.get(item.productId)!.map((product) => {
                                  const cover = getCoverImage(product);
                                  return (
                                    <li key={product.id}>
                                      <Link
                                        href={ROUTES.productDetail(product.slug)}
                                        className="flex flex-col gap-1.5 rounded-lg p-1.5 transition-colors hover:bg-rj-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
                                      >
                                        <span className="relative block aspect-square w-full overflow-hidden rounded-lg bg-rj-gray-100">
                                          {cover ? (
                                            <Image
                                              src={cover.url}
                                              alt={cover.altText ?? product.title}
                                              fill
                                              sizes="120px"
                                              className="object-cover"
                                            />
                                          ) : (
                                            <span className="flex h-full w-full items-center justify-center">
                                              <Package
                                                className="h-5 w-5 text-rj-gray-400"
                                                aria-hidden="true"
                                              />
                                            </span>
                                          )}
                                        </span>
                                        <span className="line-clamp-2 text-[11px] font-medium text-rj-black">
                                          {product.title}
                                        </span>
                                        <span className="text-xs font-bold text-rj-red-dark">
                                          {formatCurrency(product.priceCents, product.currency)}
                                        </span>
                                      </Link>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      {/* Bulk-selection bar + checkout — sticks to the viewport bottom while
          scrolling a long cart, mirroring the header's own sticky treatment. */}
      <div className="sticky bottom-0 z-40 flex flex-col gap-3 rounded-2xl border border-rj-gray-100 bg-rj-white/96 p-5 shadow-[0_-1px_0_var(--color-rj-gray-100),0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-rj-black">
              <Checkbox
                checked={selectAllChecked}
                onChange={() => setSelected(allIds, !allSelected)}
                aria-label="Select all items"
              />
              Select All ({items.length})
            </label>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={selectedCount === 0}
              className="text-xs font-semibold text-rj-red-dark underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-40"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={handleMoveSelectedToWishlist}
              disabled={selectedCount === 0 || isMovingToWishlist}
              className="text-xs font-semibold text-rj-gray-600 underline-offset-2 hover:text-rj-black hover:underline disabled:pointer-events-none disabled:opacity-40"
            >
              {isMovingToWishlist ? "Moving…" : "Move to Wishlist"}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-rj-black">
              Total ({selectedCount} item{selectedCount === 1 ? "" : "s"}):{" "}
              {formatCurrency(selectedSubtotalCents, items[0]?.currency)}
            </span>
          </div>
        </div>

        {hasUnavailableSelectedItem ? (
          <p className="text-xs font-semibold text-rj-red-dark">
            One of your selected items is no longer available — deselect or remove it to check
            out the rest.
          </p>
        ) : hasLowStockSelectedItem ? (
          <p className="text-xs font-semibold text-rj-red-dark">
            One of your selected items has less stock than you&apos;ve selected — use
            &quot;Reduce to N&quot; above to check out the rest.
          </p>
        ) : null}

        <Link
          href={ROUTES.checkout}
          aria-disabled={selectedCount === 0 || blockCheckout}
          onClick={(event) => {
            if (selectedCount === 0 || blockCheckout) event.preventDefault();
          }}
        >
          <Button
            variant="rj"
            size="rj"
            className="w-full"
            disabled={selectedCount === 0 || blockCheckout}
          >
            Checkout
          </Button>
        </Link>
        <Link
          href={ROUTES.products}
          className="text-center text-xs font-semibold text-rj-gray-600 hover:text-rj-black hover:underline"
        >
          ← Continue shopping
        </Link>
      </div>
    </div>
  );
}
