"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { usePurchaseActions } from "@/features/cart/hooks/usePurchaseActions";
import { VariantOptionGroups } from "@/features/products/components/VariantOptionGroups";
import { LOW_STOCK_THRESHOLD } from "@/features/products/constants/product.constants";
import type { VariantSelection } from "@/features/products/hooks/useVariantSelection";
import type { Product } from "@/features/products/types/product.types";
import { useScrollLock } from "@/hooks/useScrollLock";
import { formatCurrency } from "@/lib/utils/currency";

export type PurchaseMode = "cart" | "buy";

export interface ProductPurchaseSheetProps {
  open: boolean;
  mode: PurchaseMode;
  onClose: () => void;
  product: Product;
  selection: VariantSelection;
  sellerName?: string | null;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * "Choose your options" — a bottom sheet on phones and a centered dialog on
 * larger screens. The buyer picks every required option and the quantity with
 * live price and stock, then confirms: "Add to cart" keeps them on the page
 * with a success notice; "Buy now" goes straight to checkout for this one
 * product. Nothing proceeds until every option is chosen and the quantity fits
 * stock, and what's missing or wrong is said in words next to the choice.
 *
 * It shares its selection with the inline pickers on the product page, so
 * whatever the buyer already picked there is already here.
 */
export function ProductPurchaseSheet({ open, mode, onClose, product, selection, sellerName }: ProductPurchaseSheetProps) {
  const { addToCart, buyNow, pending, isBusy } = usePurchaseActions(product, sellerName);
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    // Start clean each time it opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setFlagged(false);
    const previouslyFocused = returnFocusRef.current;
    return () => previouslyFocused?.focus();
  }, [open]);

  // The "please select…" notice has done its job once every option is chosen.
  const stillNeedsSelection = selection.needsSelection;
  useEffect(() => {
    if (stillNeedsSelection) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlagged(false);
    setError((current) => (current?.startsWith("Please select") ? null : current));
  }, [stillNeedsSelection]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, isBusy, onClose]);

  if (!open) return null;

  const missingKeys = new Set(selection.missingAxes.map((axis) => axis.key));
  const flaggedKeys = flagged ? missingKeys : undefined;
  const confirmLabel = mode === "cart" ? "Add to cart" : "Buy now";

  const price =
    selection.selectedVariant || selection.minPriceCents === selection.maxPriceCents
      ? formatCurrency(selection.effectivePriceCents, product.currency)
      : `${formatCurrency(selection.minPriceCents, product.currency)} – ${formatCurrency(selection.maxPriceCents, product.currency)}`;

  const stockText = selection.needsSelection
    ? `${selection.matchingStockTotal} in stock`
    : selection.effectiveStock > LOW_STOCK_THRESHOLD
      ? `${selection.effectiveStock} in stock`
      : selection.effectiveStock > 0
        ? `Only ${selection.effectiveStock} left`
        : "Out of stock";

  async function confirm() {
    setError(null);
    if (selection.needsSelection) {
      setFlagged(true);
      const names = selection.missingAxes.map((axis) => axis.label.toLowerCase());
      setError(`Please select ${names.join(" and ")}.`);
      const first = selection.missingAxes[0];
      panelRef.current
        ?.querySelector<HTMLElement>(`[data-axis="${first.key}"] button:not([disabled])`)
        ?.focus();
      return;
    }
    if (mode === "cart") {
      const result = await addToCart(selection.variantInfo, selection.quantity);
      if (result.success) onClose();
      else setError(result.error);
    } else {
      const result = buyNow(selection.variantInfo, selection.quantity);
      if (!result.success) setError(result.error);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-rj-black/60 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Choose options for ${product.title}`}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-rj-white text-rj-black shadow-2xl sm:max-h-[85dvh] sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-start gap-4 border-b border-rj-gray-100 p-4 sm:p-5">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-rj-gray-100">
            {selection.previewImageUrl ? (
              <Image src={selection.previewImageUrl} alt="" fill sizes="96px" className="object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <p className="line-clamp-2 text-sm font-medium text-rj-gray-600">{product.title}</p>
            <p className="mt-1 text-2xl font-bold text-rj-red-dark" aria-live="polite">
              {price}
            </p>
            <p className="mt-1 text-xs text-rj-gray-600" aria-live="polite">
              {stockText}
              {selection.inCartQuantity > 0 ? ` · ${selection.inCartQuantity} in your cart` : ""}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close"
            className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-rj-gray-500 hover:bg-rj-gray-100 hover:text-rj-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/40 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <VariantOptionGroups selection={selection} flaggedKeys={flaggedKeys} showColorThumbnails />

          <div className="mt-5 flex items-center justify-between gap-4 border-t border-rj-gray-100 pt-4">
            <p className="text-sm font-semibold">Quantity</p>
            {selection.needsSelection || selection.isOutOfStock ? (
              <p className="text-xs text-rj-gray-500">
                {selection.isOutOfStock ? "Sold out" : "Choose options first"}
              </p>
            ) : (
              <QuantityStepper
                value={selection.quantity}
                max={selection.effectiveStock}
                onChange={selection.setQuantity}
                aria-label={`Quantity for ${product.title}`}
              />
            )}
          </div>
        </div>

        <div className="border-t border-rj-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
          {error ? (
            <p role="alert" className="mb-3 rounded-lg bg-rj-red/5 px-3 py-2 text-sm font-medium text-rj-red-dark">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            variant={mode === "cart" ? "rj" : "rjOutline"}
            size="rj"
            className="w-full"
            disabled={isBusy || (selection.isOutOfStock && !selection.needsSelection) || (mode === "cart" && selection.atCartLimit)}
            isLoading={pending === (mode === "cart" ? "cart" : "buy")}
            onClick={() => void confirm()}
          >
            {mode === "cart" && selection.atCartLimit ? "All in your cart" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
