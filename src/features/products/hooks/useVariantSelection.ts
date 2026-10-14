"use client";

import { useEffect, useMemo, useState } from "react";

import type { SelectedVariantInfo } from "@/features/cart/components/AddToCartButton";
import { useCart } from "@/features/cart/hooks/useCart";
import { useProductSelection } from "@/features/products/components/ProductSelectionProvider";
import type { CategoryAttribute, ProductAttributeKey } from "@/features/categories/types/category.types";
import type { Product, ProductVariant } from "@/features/products/types/product.types";
import { filterImagesForColor } from "@/lib/utils/variant-images";

export const AXIS_LABELS: Record<ProductAttributeKey, string> = {
  color: "Color",
  size: "Size",
  material: "Material",
  dimensions: "Dimensions",
};

/** Legacy, category-config-free fallback — exactly today's two-axis behavior for any product whose category has no `category_attributes` rows. */
const LEGACY_AXES: ProductAttributeKey[] = ["color", "size"];

type Selection = Partial<Record<ProductAttributeKey, string>>;

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

export interface UseVariantSelectionInput {
  product: Product;
  variants: ProductVariant[];
  /** variantId -> live stock. A missing id has 0 stock. */
  variantStock: Record<string, number>;
  categoryAttributes: CategoryAttribute[];
}

/**
 * Everything the buyer's option picking needs, in one place, so the product
 * page's inline pickers and the "choose options" sheet share one selection:
 * which axes are offered, which values are in stock *given what is already
 * picked on the other axes*, the resolved option, live price and stock, and
 * the quantity clamped to that stock.
 *
 * Choosing a value that no longer fits an earlier pick drops that earlier
 * pick (rather than leaving the buyer on a combination that does not exist),
 * and picking the selected value again clears it.
 *
 * Generalized per docs/plans/product-specifications-and-variants-
 * implementation.md §9.1: axes follow the product's category; a category with
 * no `category_attributes` falls back to Color/Size; an axis none of this
 * product's variants varies by never renders.
 */
export function useVariantSelection({
  product,
  variants,
  variantStock,
  categoryAttributes,
}: UseVariantSelectionInput) {
  const hasVariants = variants.length > 0;

  const categoryConfig = categoryAttributes.filter((a) => a.categoryId === product.categoryId);
  const axisKeys: ProductAttributeKey[] =
    categoryConfig.length > 0
      ? categoryConfig
          .filter((a) => a.isVariantEligible)
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((a) => a.attributeKey)
      : LEGACY_AXES;

  const axes = axisKeys
    .map((key) => ({ key, label: AXIS_LABELS[key], values: uniqueInOrder(variants.map((v) => v[key])) }))
    .filter((axis) => axis.values.length > 0);
  const activeAxisKeys = axes.map((axis) => axis.key);

  const [selected, setSelected] = useState<Selection>({});
  const [quantity, setQuantity] = useState(1);
  const productSelection = useProductSelection();
  const { items: cartItems } = useCart();

  // Tell the sibling photo gallery which color is picked (or none).
  const selectedColor = selected.color ?? null;
  useEffect(() => {
    productSelection?.setSelectedColor(selectedColor);
  }, [productSelection, selectedColor]);

  function inStock(variant: ProductVariant): boolean {
    return (variantStock[variant.id] ?? 0) > 0;
  }

  function matches(variant: ProductVariant, picks: Selection): boolean {
    return activeAxisKeys.every((key) => picks[key] === undefined || variant[key] === picks[key]);
  }

  /** A value is available when some in-stock option has it AND fits every pick made on the *other* axes. */
  function isOptionAvailable(key: ProductAttributeKey, value: string): boolean {
    return variants.some(
      (variant) =>
        variant[key] === value &&
        inStock(variant) &&
        activeAxisKeys.every((other) => other === key || selected[other] === undefined || variant[other] === selected[other]),
    );
  }

  function select(key: ProductAttributeKey, value: string) {
    setSelected((previous) => {
      const next: Selection = { ...previous };
      if (previous[key] === value) {
        delete next[key];
        return next;
      }
      next[key] = value;
      // Drop any other pick that no longer fits an in-stock option.
      for (const other of activeAxisKeys) {
        if (other === key || next[other] === undefined) continue;
        if (!variants.some((variant) => inStock(variant) && matches(variant, next))) delete next[other];
      }
      return next;
    });
  }

  const missingAxes = axes.filter((axis) => selected[axis.key] === undefined);
  const needsSelection = hasVariants && missingAxes.length > 0;

  const candidates = hasVariants ? variants.filter((variant) => matches(variant, selected)) : [];
  const selectedVariant = hasVariants && !needsSelection ? (candidates[0] ?? null) : null;

  const priceOf = (variant: ProductVariant) => variant.priceCents ?? product.priceCents;
  const candidatePrices = candidates.map(priceOf);
  const minPriceCents = candidatePrices.length > 0 ? Math.min(...candidatePrices) : product.priceCents;
  const maxPriceCents = candidatePrices.length > 0 ? Math.max(...candidatePrices) : product.priceCents;
  const effectivePriceCents = selectedVariant ? priceOf(selectedVariant) : minPriceCents;

  const effectiveStock = hasVariants
    ? selectedVariant
      ? (variantStock[selectedVariant.id] ?? 0)
      : 0
    : product.quantity;
  const matchingStockTotal = candidates.reduce((sum, variant) => sum + (variantStock[variant.id] ?? 0), 0);
  const isOutOfStock = hasVariants ? !needsSelection && effectiveStock <= 0 : product.quantity <= 0;

  // What the buyer already has in their cart for this choice: the chosen
  // option's line, or — before an option is chosen — every option of this product.
  const inCartQuantity = cartItems
    .filter(
      (line) =>
        line.productId === product.id &&
        (!hasVariants || !selectedVariant || line.variantId === selectedVariant.id),
    )
    .reduce((sum, line) => sum + line.quantity, 0);
  // Everything in stock is already in the cart: another add can only fail.
  const atCartLimit = !needsSelection && effectiveStock > 0 && inCartQuantity >= effectiveStock;

  // Derived, not stored: reclamps automatically when the stock ceiling shrinks.
  const clampedQuantity = Math.min(quantity, Math.max(1, effectiveStock));

  const variantInfo: SelectedVariantInfo | null | undefined = !hasVariants
    ? undefined
    : !selectedVariant
      ? null
      : {
          id: selectedVariant.id,
          label: [selectedVariant.color, selectedVariant.size, selectedVariant.material, selectedVariant.dimensions]
            .filter(Boolean)
            .join(" / "),
          priceCents: effectivePriceCents,
          stock: effectiveStock,
        };

  /** The photo for the current color (first photo tagged to it, else the cover). */
  const previewImageUrl = useMemo(
    () => filterImagesForColor(product.images, variants, selectedColor)[0]?.url ?? product.images[0]?.url ?? null,
    [product.images, variants, selectedColor],
  );

  /** One small photo per color value, for the color swatches. */
  const colorThumbnails = useMemo(() => {
    const thumbs: Record<string, string | null> = {};
    for (const color of uniqueInOrder(variants.map((variant) => variant.color))) {
      const tagged = filterImagesForColor(product.images, variants, color);
      // Only a real, color-specific photo makes a useful swatch.
      thumbs[color] = tagged.length > 0 && tagged.length < product.images.length ? tagged[0].url : null;
    }
    return thumbs;
  }, [product.images, variants]);

  return {
    hasVariants,
    axes,
    selected,
    select,
    isOptionAvailable,
    missingAxes,
    needsSelection,
    selectedVariant,
    variantInfo,
    effectivePriceCents,
    minPriceCents,
    maxPriceCents,
    effectiveStock,
    matchingStockTotal,
    inCartQuantity,
    atCartLimit,
    isOutOfStock,
    quantity: clampedQuantity,
    setQuantity,
    previewImageUrl,
    colorThumbnails,
  };
}

export type VariantSelection = ReturnType<typeof useVariantSelection>;
