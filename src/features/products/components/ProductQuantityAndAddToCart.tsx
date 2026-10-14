"use client";

import { useState } from "react";

import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { AddToCartButton } from "@/features/cart/components/AddToCartButton";
import { BuyNowButton } from "@/features/cart/components/BuyNowButton";
import { useProductSelection } from "@/features/products/components/ProductSelectionProvider";
import { LOW_STOCK_THRESHOLD } from "@/features/products/constants/product.constants";
import { WishlistButton } from "@/features/wishlist/components/WishlistButton";
import type { WishlistState } from "@/features/wishlist/types/wishlist.types";
import type { CategoryAttribute, ProductAttributeKey } from "@/features/categories/types/category.types";
import type { Product, ProductVariant } from "@/features/products/types/product.types";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

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

function uniqueInOrder(values: (string | null)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

const OPTION_BUTTON =
  "rounded-full border-[1.5px] px-3 py-1.5 text-xs font-semibold transition-colors disabled:pointer-events-none";

const AXIS_LABELS: Record<ProductAttributeKey, string> = {
  color: "Color",
  size: "Size",
  material: "Material",
  dimensions: "Dimensions",
};

/** Legacy, category-config-free fallback — exactly today's two-axis behavior, unchanged for any product whose category has no `category_attributes` rows. */
const LEGACY_AXES: ProductAttributeKey[] = ["color", "size"];

/**
 * PDP quantity selector + Add to cart + wishlist, kept together since the
 * cart button needs the live quantity. When the product has variants, this
 * also owns the variant-axis selectors and the reactive price/stock display
 * — the plain (`variants.length === 0`) path renders exactly as before.
 *
 * Generalized per docs/plans/product-specifications-and-variants-
 * implementation.md §9.1 from a hardcoded two-axis (Color/Size) picker to N
 * axes, driven by the product's category: a category with no
 * `category_attributes` configured falls back to exactly today's Color/Size
 * behavior; a configured category instead offers one pill group per
 * variant-eligible attribute that at least one of this product's variants
 * actually varies by (an axis with zero distinct values never renders,
 * same as today's `colors.length > 0` / `sizes.length > 0` guards).
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
  const hasVariants = variants.length > 0;

  const categoryConfig = categoryAttributes.filter((a) => a.categoryId === product.categoryId);
  const hasConfig = categoryConfig.length > 0;
  const axisKeys: ProductAttributeKey[] = hasConfig
    ? categoryConfig
        .filter((a) => a.isVariantEligible)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((a) => a.attributeKey)
    : LEGACY_AXES;

  // Cheap enough (at most 4 axes, each a single pass over `variants`) to
  // recompute on every render rather than memoize — `axisKeys` is itself
  // freshly derived from props each render, so there'd be nothing stable to
  // key a `useMemo` on anyway.
  const axisValues = new Map<ProductAttributeKey, string[]>();
  for (const key of axisKeys) {
    axisValues.set(key, uniqueInOrder(variants.map((v) => v[key])));
  }
  const activeAxisKeys = axisKeys.filter((key) => (axisValues.get(key)?.length ?? 0) > 0);

  const [selected, setSelected] = useState<Partial<Record<ProductAttributeKey, string>>>({});
  // Publishes the picked color so the sibling gallery can show that color's photos.
  const productSelection = useProductSelection();
  const [quantity, setQuantity] = useState(1);

  const selectedVariant = hasVariants
    ? (variants.find((v) =>
        activeAxisKeys.every((key) => selected[key] === undefined || v[key] === selected[key]),
      ) ?? null)
    : null;

  const needsSelection =
    hasVariants && activeAxisKeys.some((key) => selected[key] === undefined);

  const effectiveStock = hasVariants
    ? needsSelection || !selectedVariant
      ? 0
      : (variantStock[selectedVariant.id] ?? 0)
    : product.quantity;
  const effectivePriceCents = selectedVariant?.priceCents ?? product.priceCents;
  const isOutOfStock = hasVariants
    ? needsSelection || effectiveStock <= 0
    : product.quantity <= 0;

  // Derived, not stored: reclamps automatically whenever effectiveStock
  // shrinks (e.g. switching to a lower-stock variant), no effect needed.
  const clampedQuantity = Math.min(quantity, Math.max(1, effectiveStock));

  const variantInfo = !hasVariants
    ? undefined
    : needsSelection || !selectedVariant
      ? null
      : {
          id: selectedVariant.id,
          label: [selectedVariant.color, selectedVariant.size, selectedVariant.material, selectedVariant.dimensions]
            .filter(Boolean)
            .join(" / "),
          priceCents: effectivePriceCents,
          stock: effectiveStock,
        };

  /** An option at `axisIndex` is available if some in-stock variant matches it AND every earlier-axis selection already made — same sequential-dependency chain the old Color→Size pairing used, generalized to N axes. */
  function isOptionAvailable(axisIndex: number, key: ProductAttributeKey, value: string): boolean {
    return variants.some((v) => {
      if (v[key] !== value) return false;
      for (let j = 0; j < axisIndex; j++) {
        const priorKey = activeAxisKeys[j];
        const priorSelected = selected[priorKey];
        if (priorSelected !== undefined && v[priorKey] !== priorSelected) return false;
      }
      return (variantStock[v.id] ?? 0) > 0;
    });
  }

  return (
    <div className={className}>
      {hasVariants ? (
        <div className="mb-4 flex flex-col gap-4">
          <p className="text-2xl font-bold text-rj-black">
            {formatCurrency(effectivePriceCents, product.currency)}
          </p>

          {activeAxisKeys.map((key, axisIndex) => {
            const values = axisValues.get(key) ?? [];
            const priorKey = axisIndex > 0 ? activeAxisKeys[axisIndex - 1] : null;
            const waitingOnPrior = priorKey !== null && selected[priorKey] === undefined;
            return (
              <div key={key}>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-rj-gray-600">
                  {AXIS_LABELS[key]}
                  {selected[key] ? (
                    <span className="ml-1.5 normal-case tracking-normal text-rj-black">
                      : {selected[key]}
                    </span>
                  ) : null}
                  {waitingOnPrior ? (
                    <span className="ml-1.5 normal-case tracking-normal text-rj-gray-400">
                      (select {AXIS_LABELS[priorKey as ProductAttributeKey].toLowerCase()} first)
                    </span>
                  ) : null}
                </p>
                <div className="flex flex-wrap gap-2">
                  {values.map((value) => {
                    const available = isOptionAvailable(axisIndex, key, value);
                    const isSelected = selected[key] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!available}
                        onClick={() => {
                          setSelected((prev) => ({ ...prev, [key]: value }));
                          if (key === "color") productSelection?.setSelectedColor(value);
                        }}
                        aria-pressed={isSelected}
                        className={cn(
                          OPTION_BUTTON,
                          isSelected
                            ? "border-rj-black bg-rj-black text-rj-white"
                            : available
                              ? "border-rj-gray-200 text-rj-black hover:border-rj-black"
                              : "border-rj-gray-100 text-rj-gray-300 line-through",
                        )}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Stock status sits right beside Quantity — the buyer has just
          finished picking variant options above, so the number that matters
          is read next to the stepper it governs, not back up near the price. */}
      <div className="mb-3">
        {hasVariants ? (
          <div className="mb-1.5">
            {needsSelection ? (
              <span className="text-xs font-semibold text-rj-gray-500">
                Select options to see stock
              </span>
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

        {isOutOfStock ? null : (
          <>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-rj-gray-600">
              Quantity
            </p>
            <QuantityStepper
              value={clampedQuantity}
              max={effectiveStock}
              onChange={setQuantity}
              aria-label={`Quantity for ${product.title}`}
            />
          </>
        )}
      </div>
      {canPurchase ? (
        <div className="flex flex-wrap items-center gap-3">
          <AddToCartButton
            product={product}
            quantity={clampedQuantity}
            buttonVariant="rj"
            className="w-full sm:w-auto"
            sellerName={shopName}
            variant={variantInfo}
          />
          <BuyNowButton
            product={product}
            quantity={clampedQuantity}
            className="w-full sm:w-auto"
            sellerName={shopName}
            variant={variantInfo}
          />
          <WishlistButton
            productId={wishlist.productId}
            initialSaved={wishlist.initialSaved}
            isAuthenticated={wishlist.isAuthenticated}
            variant="pdp"
          />
        </div>
      ) : null}
    </div>
  );
}
