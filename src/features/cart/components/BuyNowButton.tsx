"use client";

import { Button } from "@/components/ui/button";
import type { SelectedVariantInfo } from "@/features/cart/components/AddToCartButton";
import { usePurchaseActions } from "@/features/cart/hooks/usePurchaseActions";
import type { Product } from "@/features/products/types/product.types";

export interface BuyNowButtonProps {
  product: Product;
  quantity?: number;
  className?: string;
  /** See `AddToCartButton`'s prop of the same name. */
  sellerName?: string | null;
  /** See `AddToCartButton`'s prop of the same name. */
  variant?: SelectedVariantInfo | null;
  /** See `AddToCartButton`'s prop of the same name. */
  onNeedSelection?: () => void;
}

/**
 * Goes straight to checkout for this one product, option and quantity
 * (`/checkout?buyNow=…`). The cart is not touched, and checkout re-reads price
 * and stock from the server, so nothing here can change what is charged.
 * `/checkout` is proxy-protected, so a guest lands on sign-in with the
 * checkout link preserved and continues there afterwards.
 */
export function BuyNowButton({
  product,
  quantity = 1,
  className,
  sellerName,
  variant,
  onNeedSelection,
}: BuyNowButtonProps) {
  const { buyNow, isBusy, pending } = usePurchaseActions(product, sellerName);
  const hasVariants = variant !== undefined;
  const needsSelection = hasVariants && variant === null;
  const isOutOfStock = hasVariants ? variant !== null && variant.stock <= 0 : product.quantity <= 0;
  const hasNoSeller = product.sellerId === null;
  const blocked = isOutOfStock || hasNoSeller || (needsSelection && !onNeedSelection);

  function handleClick() {
    if (needsSelection) {
      onNeedSelection?.();
      return;
    }
    buyNow(variant, quantity, { notifyErrors: true });
  }

  return (
    <Button
      type="button"
      variant="rjOutline"
      size="rj"
      className={className}
      disabled={blocked || isBusy}
      isLoading={pending === "buy"}
      onClick={handleClick}
    >
      Buy Now
    </Button>
  );
}
