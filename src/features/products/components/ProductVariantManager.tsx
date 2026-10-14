"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/feedback/ErrorState";
import { FormField } from "@/components/forms/FormField";
import { draftVariantOps, liveVariantOps } from "@/features/products/lib/product-variant-ops";
import { ProductVariantChecklist } from "@/features/products/components/ProductVariantChecklist";
import { ProductVariantRow } from "@/features/products/components/ProductVariantRow";
import {
  productVariantSchema,
  type ProductVariantFormInput,
} from "@/features/products/schemas/product-variant.schema";
import type { CategoryAttribute, ProductAttributeKey } from "@/features/categories/types/category.types";
import type { ProductVariant } from "@/features/products/types/product.types";
import { formatCurrency } from "@/lib/utils/currency";

type FieldErrors = Record<string, string[] | undefined>;

const ATTRIBUTE_LABELS: Record<ProductAttributeKey, string> = {
  color: "colors",
  size: "sizes",
  material: "materials",
  dimensions: "dimensions",
};

/** Legacy, category-config-free fallback — exactly today's two-axis behavior, unchanged for any product whose category has no `category_attributes` rows. */
const LEGACY_AXES: ProductAttributeKey[] = ["color", "size"];

function emptyInput(productId: string): ProductVariantFormInput {
  return { productId, sku: "", color: "", size: "", material: "", dimensions: "", price: undefined };
}

function axisInUse(variants: ProductVariant[], key: ProductAttributeKey): boolean {
  return variants.some((variant) => Boolean(variant[key]));
}

/** The slice of a product the option editor needs — a full `Product` satisfies it, and so does the in-progress form of a product that is not saved yet. */
export interface VariantProductContext {
  id: string;
  categoryId: string | null;
  priceCents: number;
  currency: string;
}

export interface ProductVariantManagerProps {
  product: VariantProductContext;
  variants: ProductVariant[];
  /**
   * `live` (default): every change is saved immediately — an existing product.
   * `draft`: changes stay in memory and are reported through
   * `onVariantsChange`; the caller saves them once the product exists.
   */
  mode?: "live" | "draft";
  /** Called with the full list after every change (and once on mount). */
  onVariantsChange?: (variants: ProductVariant[]) => void;
  /** Every category's attribute config — filtered internally to `product.categoryId`. */
  categoryAttributes: CategoryAttribute[];
}

/**
 * Optional variant management for one product. Mirrors the Addresses
 * feature's list/add/edit/delete shape. It is a section of
 * the product editor (`ProductEditor`), used in both modes: `live` saves each
 * change immediately (existing product), `draft` keeps changes in memory until
 * the new product is saved.
 *
 * Generalized per docs/plans/product-specifications-and-variants-
 * implementation.md §8.3: which attributes are offered as variant axes is
 * driven by the product's category — color/size are no longer hardcoded.
 * A category with no `category_attributes` configured at all falls back to
 * exactly today's Color+Size fields, unconditionally (no checkbox, no
 * behavior change). A configured category instead shows one seller opt-in
 * checkbox per variant-eligible attribute — unchecked by default on a new
 * product, derived from existing variant data on an already-populated one —
 * never auto-applied, and never blocking a product from shipping with zero
 * variants.
 */
export function ProductVariantManager({
  product,
  variants: initialVariants,
  mode = "live",
  onVariantsChange,
  categoryAttributes,
}: ProductVariantManagerProps) {
  const [variants, setVariants] = useState<ProductVariant[]>(initialVariants);

  // Reports the list to the parent after every change (and once on mount).
  const onChangeRef = useRef(onVariantsChange);
  useEffect(() => {
    onChangeRef.current = onVariantsChange;
    onChangeRef.current?.(variants);
  }, [variants, onVariantsChange]);
  const ops = mode === "draft" ? draftVariantOps : liveVariantOps;

  const categoryConfig = categoryAttributes.filter((a) => a.categoryId === product.categoryId);
  const hasConfig = categoryConfig.length > 0;
  const variantEligible = categoryConfig
    .filter((a) => a.isVariantEligible)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const axisKeys: ProductAttributeKey[] = hasConfig
    ? variantEligible.map((a) => a.attributeKey)
    : LEGACY_AXES;
  const recommendedKeys = new Set(variantEligible.filter((a) => a.isRecommended).map((a) => a.attributeKey));

  const [enabledAxes, setEnabledAxes] = useState<Set<ProductAttributeKey>>(() =>
    hasConfig
      ? new Set(axisKeys.filter((key) => axisInUse(variants, key)))
      : new Set(LEGACY_AXES),
  );
  // Checklist mode: exactly ONE active axis whose category config carries a
  // picklist. Two or more active axes (would need a combination matrix) and
  // free-text axes (`allowedValues` null) keep the manual "Add variant" flow.
  const activeAxisKeys = axisKeys.filter((key) => enabledAxes.has(key));
  const checklistAttribute =
    activeAxisKeys.length === 1
      ? variantEligible.find((a) => a.attributeKey === activeAxisKeys[0])
      : undefined;
  const checklistValues =
    checklistAttribute?.allowedValues && checklistAttribute.allowedValues.length > 0
      ? checklistAttribute.allowedValues
      : null;

  const [axisError, setAxisError] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [values, setValues] = useState<ProductVariantFormInput>(() => emptyInput(product.id));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleAxis(key: ProductAttributeKey, checked: boolean) {
    setAxisError(null);
    if (!checked && axisInUse(variants, key)) {
      setAxisError(
        `Remove the ${key}-based variants first before turning this off.`,
      );
      return;
    }
    setEnabledAxes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function handleChange(field: ProductAttributeKey | "sku", value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  function handleAdd() {
    setFormError(null);
    const parsed = productVariantSchema.safeParse({
      ...values,
      price: values.price === undefined || Number.isNaN(values.price) ? undefined : values.price,
    });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
      return;
    }
    startTransition(async () => {
      const result = await ops.create(parsed.data, variants);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      setVariants((prev) => [...prev, result.data]);
      setValues(emptyInput(product.id));
      setFieldErrors({});
      setIsAdding(false);
    });
  }

  function handleCancelAdd() {
    setValues(emptyInput(product.id));
    setFieldErrors({});
    setFormError(null);
    setIsAdding(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-foreground">Variants (optional)</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Add options, each with their own stock (managed from Inventory). Leave price blank to use
          this product&apos;s price ({formatCurrency(product.priceCents, product.currency)}).
        </p>
      </div>

      {hasConfig ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Which options does this item come in?
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {axisKeys.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={enabledAxes.has(key)}
                  onChange={(event) => toggleAxis(key, event.target.checked)}
                />
                This item comes in multiple {ATTRIBUTE_LABELS[key]}
                {recommendedKeys.has(key) && !enabledAxes.has(key) ? (
                  <span className="text-xs text-muted-foreground">(recommended)</span>
                ) : null}
              </label>
            ))}
          </div>
          {axisError ? <p className="text-xs text-danger">{axisError}</p> : null}
        </div>
      ) : null}

      {variants.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No variants yet — this product sells as a single item.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {variants.map((variant) => (
            <ProductVariantRow
              key={variant.id}
              variant={variant}
              product={product}
              ops={ops}
              siblings={variants}
              activeAxes={axisKeys.filter((key) => enabledAxes.has(key))}
              onChange={(updated) =>
                setVariants((prev) => prev.map((v) => (v.id === updated.id ? updated : v)))
              }
              onDelete={(id) => setVariants((prev) => prev.filter((v) => v.id !== id))}
            />
          ))}
        </ul>
      )}

      {checklistAttribute && checklistValues ? (
        <ProductVariantChecklist
          product={product}
          ops={ops}
          attributeKey={checklistAttribute.attributeKey}
          label={ATTRIBUTE_LABELS[checklistAttribute.attributeKey]}
          allowedValues={checklistValues}
          variants={variants}
          onCreated={(created) => setVariants((prev) => [...prev, created])}
          onDeleted={(id) => setVariants((prev) => prev.filter((v) => v.id !== id))}
        />
      ) : isAdding ? (
        <div className="rounded-xl border border-border p-4">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              {axisKeys
                .filter((key) => enabledAxes.has(key))
                .map((key) => (
                  <FormField
                    key={key}
                    label={key === "color" ? "Color" : key === "size" ? "Size" : key === "material" ? "Material" : "Dimensions"}
                    value={values[key] ?? ""}
                    onChange={(event) => handleChange(key, event.target.value)}
                    placeholder={key === "color" ? "e.g. Blue" : key === "size" ? "e.g. Medium" : undefined}
                    errors={fieldErrors[key]}
                    themed
                  />
                ))}
              {axisKeys.filter((key) => enabledAxes.has(key)).length === 0 ? (
                <p className="col-span-2 text-xs text-muted-foreground">
                  Check at least one option above to add a variant.
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="SKU (optional)"
                value={values.sku ?? ""}
                onChange={(event) => handleChange("sku", event.target.value)}
                errors={fieldErrors.sku}
                themed
              />
              <FormField
                label="Price override (optional)"
                type="number"
                step="0.01"
                min="0.01"
                placeholder={`Inherits ${formatCurrency(product.priceCents, product.currency)}`}
                value={values.price ?? ""}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    price: event.target.value === "" ? undefined : Number(event.target.value),
                  }))
                }
                errors={fieldErrors.price}
                themed
              />
            </div>
            {formError ? <ErrorState title="Couldn't add variant" message={formError} /> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                size="rjSm"
                isLoading={isPending}
                disabled={axisKeys.filter((key) => enabledAxes.has(key)).length === 0}
                onClick={handleAdd}
              >
                Add variant
              </Button>
              <Button
                type="button"
                variant="outline"
                size="rjSm"
                disabled={isPending}
                onClick={handleCancelAdd}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="rjSm"
          className="self-start"
          onClick={() => setIsAdding(true)}
        >
          + Add variant
        </Button>
      )}
    </div>
  );
}
