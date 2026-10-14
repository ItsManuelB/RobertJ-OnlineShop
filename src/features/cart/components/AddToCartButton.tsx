"use client";

import { Button } from "@/components/ui/button";
import { usePurchaseActions } from "@/features/cart/hooks/usePurchaseActions";
import type { Product } from "@/features/products/types/product.types";

/** The buyer's fully-resolved variant selection, ready to add to the cart. */
export interface SelectedVariantInfo {
  id: string;
  label: string;
  priceCents: number;
  stock: number;
}

export interface AddToCartButtonProps {
  product: Product;
  quantity?: number;
  className?: string;
  /** Visual treatment: default semantic primary, or the rj editorial pill. */
  buttonVariant?: "primary" | "rj";
  /**
   * Resolved shop/seller label for the cart line — pass the same value
   * already shown as "Sold by" on the page (see the PDP), so cart/checkout
   * never disagrees with what the buyer just saw. Falls back to the
   * product's own role-gated name if the caller has nothing better.
   */
  sellerName?: string | null;
  /**
   * Omit entirely for a plain product. When the product has variants, pass the
   * buyer's current selection — `null` while required options are still
   * unpicked, or the resolved variant once complete.
   */
  variant?: SelectedVariantInfo | null;
  /**
   * Called instead of adding when the product needs options chosen first
   * (`variant === null`) — the page opens its options sheet. Without it the
   * button stays disabled in that state, as it always has.
   */
  onNeedSelection?: () => void;
}

/**
 * Adds the chosen product/option/quantity to the cart and shows a success
 * toast, leaving the buyer on the page. Stock is validated (including what is
 * already in the cart), a second click while the first is in flight is
 * ignored, and any problem is reported in a toast.
 */
export function AddToCartButton({
  product,
  quantity = 1,
  className,
  buttonVariant = "primary",
  sellerName,
  variant,
  onNeedSelection,
}: AddToCartButtonProps) {
  const { addToCart, isBusy, pending } = usePurchaseActions(product, sellerName);
  const hasVariants = variant !== undefined;
  const needsSelection = hasVariants && variant === null;
  const isOutOfStock = hasVariants ? variant !== null && variant.stock <= 0 : product.quantity <= 0;
  // A product whose seller account has since been permanently deleted has no
  // one to check out with — create_order's is_active guard already refuses
  // it server-side, so this button is disabled up front.
  const hasNoSeller = product.sellerId === null;
  const blocked = isOutOfStock || hasNoSeller || (needsSelection && !onNeedSelection);

  function handleClick() {
    if (needsSelection) {
      onNeedSelection?.();
      return;
    }
    void addToCart(variant, quantity, { notifyErrors: true });
  }

  const rj = buttonVariant === "rj";
  const label = hasNoSeller
    ? "Unavailable"
    : isOutOfStock
      ? "Sold out"
      : pending === "cart"
        ? "Adding…"
        : pending === "added"
          ? "Added to cart"
          : needsSelection && !onNeedSelection
          ? "Select options"
          : "Add to cart";

  return (
    <Button
      type="button"
      variant={isOutOfStock || hasNoSeller ? "outline" : rj ? "rj" : "primary"}
      size={rj ? "rj" : "md"}
      className={className}
      disabled={blocked || isBusy}
      aria-busy={pending === "cart"}
      onClick={handleClick}
    >
      {label}
    </Button>
  );
}
