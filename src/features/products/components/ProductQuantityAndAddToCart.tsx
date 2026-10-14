"use client";

import { useState } from "react";

import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { AddToCartButton } from "@/features/cart/components/AddToCartButton";
import { BuyNowButton } from "@/features/cart/components/BuyNowButton";
import {
  ProductPurchaseSheet,
  type PurchaseMode,
} from "@/features/products/components/ProductPurchaseSheet";
import { VariantOptionGroups } from "@/features/products/components/VariantOptionGroups";
import { LOW_STOCK_THRESHOLD } from "@/features/products/constants/product.constants";
import { useVariantSelection } from "@/features/products/hooks/useVariantSelection";
import { WishlistButton } from "@/features/wishlist/components/WishlistButton";
import type { WishlistState } from "@/features/wishlist/types/wishlist.types";
import type { CategoryAttribute } from "@/features/categories/types/category.types";
import type { Product, ProductVariant } from "@/features/products/types/product.types";
import { formatCurrency } from "@/lib/utils/currency";

export interface ProductQuantityAndAddToCartProps {
  product: Product;
  wishlist: WishlistState;
  className?: string;
  /** The same resolved "Sold by" label already shown on this page — passed
   * through so the cart line never disagrees with it. */
  shopName?: string | null;
  /** Active variants of this product — empty for a plain single-SKU listing. */
  variants: ProductVariant[];
  /** variantId -> live stock, from `getVariantStock`. A missing id has 0 stock. */
  variantStock: Record<string, number>;
  /** This product's category's attribute config — decides which axes beyond legacy color/size are offered. See §9.1 of the implementation plan. */
  categoryAttributes: CategoryAttribute[];
  /**
   * Whether the viewer may transact. Defaults to `true` (guests + buyers).
   * `false` for seller/admin — the variant selectors and stock still render
   * (read-only browsing), but Add to Cart / Buy Now / Wishlist are hidden,
   * mirroring the server/RLS purchase block.
   */
  canPurchase?: boolean;
}

/**
 * PDP option pickers + quantity + Add to cart / Buy now + wishlist. The
 * selection logic lives in `useVariantSelection` (shared with the options
 * sheet); the plain (`variants.length === 0`) path renders as it always did.
 *
 * Add to cart / Buy now stay enabled for a product with options: pressing one
 * before everything is chosen opens the options sheet, pre-filled with what
 * the buyer already picked here, instead of leaving a dead button.
 */
export function ProductQuantityAndAddToCart({
  product,
  wishlist,
  className,
  shopName,
  variants,
  variantStock,
  categoryAttributes,
  canPurchase = true,
}: ProductQuantityAndAddToCartProps) {
  const selection = useVariantSelection({ product, variants, variantStock, categoryAttributes });
  const [sheetMode, setSheetMode] = useState<PurchaseMode | null>(null);
  const { hasVariants, needsSelection, effectiveStock, isOutOfStock } = selection;

  const priceText =
    selection.selectedVariant || selection.minPriceCents === selection.maxPriceCents
      ? formatCurrency(selection.effectivePriceCents, product.currency)
      : `${formatCurrency(selection.minPriceCents, product.currency)} – ${formatCurrency(selection.maxPriceCents, product.currency)}`;

  return (
    <div className={className}>
      {hasVariants ? (
        <div className="mb-4 flex flex-col gap-4">
          <p className="text-2xl font-bold text-rj-black">{priceText}</p>
          <VariantOptionGroups selection={selection} />
        </div>
      ) : null}

      {/* Stock status sits right beside Quantity — the buyer has just
          finished picking options above, so the number that matters is read
          next to the stepper it governs, not back up near the price. */}
      <div className="mb-3">
        {hasVariants ? (
          <div className="mb-1.5">
            {needsSelection ? (
              <span className="text-xs font-semibold text-rj-gray-500">Select options to see stock</span>
            ) : effectiveStock > LOW_STOCK_THRESHOLD ? (
              <span className="rounded-full bg-rj-green/10 px-3 py-1 text-[11px] font-bold text-rj-green">
                {effectiveStock} in stock
              </span>
            ) : effectiveStock > 0 ? (
              <span className="rounded-full bg-rj-gold/10 px-3 py-1 text-[11px] font-bold text-rj-gold">
                Only {effectiveStock} left
              </span>
            ) : (
              <span className="rounded-full bg-rj-black px-3 py-1 text-[11px] font-bold text-rj-white">
                Out of stock
              </span>
            )}
          </div>
        ) : null}

        {isOutOfStock || needsSelection ? null : (
          <>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-rj-gray-600">Quantity</p>
            <QuantityStepper
              value={selection.quantity}
              max={effectiveStock}
              onChange={selection.setQuantity}
              aria-label={`Quantity for ${product.title}`}
            />
          </>
        )}
      </div>

      {canPurchase ? (
        <div className="flex flex-wrap items-center gap-3">
          <AddToCartButton
            product={product}
            quantity={selection.quantity}
            buttonVariant="rj"
            className="w-full sm:w-auto"
            sellerName={shopName}
            variant={selection.variantInfo}
            onNeedSelection={() => setSheetMode("cart")}
          />
          <BuyNowButton
            product={product}
            quantity={selection.quantity}
            className="w-full sm:w-auto"
            sellerName={shopName}
            variant={selection.variantInfo}
            onNeedSelection={() => setSheetMode("buy")}
          />
          <WishlistButton
            productId={wishlist.productId}
            initialSaved={wishlist.initialSaved}
            isAuthenticated={wishlist.isAuthenticated}
            variant="pdp"
          />
        </div>
      ) : null}

      {canPurchase && hasVariants ? (
        <ProductPurchaseSheet
          open={sheetMode !== null}
          mode={sheetMode ?? "cart"}
          onClose={() => setSheetMode(null)}
          product={product}
          selection={selection}
          sellerName={shopName}
        />
      ) : null}
    </div>
  );
}
