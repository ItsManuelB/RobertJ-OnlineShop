"use client";

import { useState, useTransition } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/feedback/ErrorState";
import {
  createProductVariantAction,
  deleteProductVariantAction,
} from "@/features/products/actions/product-variant.actions";
import type { ProductAttributeKey } from "@/features/categories/types/category.types";
import type { Product, ProductVariant } from "@/features/products/types/product.types";

export interface ProductVariantChecklistProps {
  product: Product;
  /** The single active variant axis this checklist covers. */
  attributeKey: ProductAttributeKey;
  /** Plural, lowercase noun for copy — e.g. "sizes". */
  label: string;
  /** The category's admin-curated picklist for this axis (non-empty). */
  allowedValues: string[];
  variants: ProductVariant[];
  onCreated: (variant: ProductVariant) => void;
  onDeleted: (variantId: string) => void;
}

/**
 * Tick-a-value alternative to `ProductVariantManager`'s free-text "Add
 * variant" form, used only when exactly ONE variant axis is active and its
 * category config has a picklist (`allowedValues`). Ticking creates that
 * value's variant via `createProductVariantAction`; unticking deletes the
 * saved one via `deleteProductVariantAction`, so the "can't delete an
 * ordered variant" error surfaces exactly as it does from the row's Delete
 * button. State only changes on success — a failed untick leaves the box
 * ticked. Price/SKU stay editable per row in the list above.
 */
export function ProductVariantChecklist({
  product,
  attributeKey,
  label,
  allowedValues,
  variants,
  onCreated,
  onDeleted,
}: ProductVariantChecklistProps) {
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle(value: string, checked: boolean) {
    setError(null);
    setPendingValue(value);
    startTransition(async () => {
      if (checked) {
        const result = await createProductVariantAction({ productId: product.id, [attributeKey]: value });
        if (result.success) onCreated(result.data);
        else setError({ title: `Couldn't add ${value}`, message: result.error });
      } else {
        const existing = variants.find((variant) => variant[attributeKey] === value);
        if (existing) {
          const result = await deleteProductVariantAction({ id: existing.id });
          if (result.success) onDeleted(existing.id);
          else setError({ title: `Couldn't remove ${value}`, message: result.error });
        }
      }
      setPendingValue(null);
    });
  }

  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border border-border p-4" disabled={isPending}>
      <legend className="px-1 text-xs font-medium text-muted-foreground">
        Tick the {label} you offer
      </legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {allowedValues.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={variants.some((variant) => variant[attributeKey] === value)}
              onChange={(event) => handleToggle(value, event.target.checked)}
            />
            {value}
            {pendingValue === value ? <span className="text-xs text-muted-foreground">…</span> : null}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Unticking a saved option removes it. Options that have already been ordered can&apos;t be
        removed.
      </p>
      {error ? <ErrorState title={error.title} message={error.message} /> : null}
    </fieldset>
  );
}
