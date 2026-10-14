"use client";

import { useState, useTransition } from "react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { ErrorState } from "@/components/feedback/ErrorState";
import { FormField } from "@/components/forms/FormField";
import type { VariantOps } from "@/features/products/lib/product-variant-ops";
import {
  updateProductVariantSchema,
  type UpdateProductVariantInput,
} from "@/features/products/schemas/product-variant.schema";
import type { ProductAttributeKey } from "@/features/categories/types/category.types";
import type { ProductVariant } from "@/features/products/types/product.types";
import { fromCents } from "@/lib/utils/currency";
import { formatCurrency } from "@/lib/utils/currency";

type FieldErrors = Record<string, string[] | undefined>;
type Mode = "view" | "edit" | "delete";

const ATTRIBUTE_FIELD_LABELS: Record<ProductAttributeKey, string> = {
  color: "Color",
  size: "Size",
  material: "Material",
  dimensions: "Dimensions",
};

function toInput(variant: ProductVariant): UpdateProductVariantInput {
  return {
    id: variant.id,
    sku: variant.sku ?? "",
    color: variant.color ?? "",
    size: variant.size ?? "",
    material: variant.material ?? "",
    dimensions: variant.dimensions ?? "",
    price: variant.priceCents !== null ? fromCents(variant.priceCents) : undefined,
    status: variant.status,
  };
}

export interface ProductVariantRowProps {
  variant: ProductVariant;
  /** Only the parent product's price and currency are used (to show what a blank price override inherits). */
  product: { priceCents: number; currency: string };
  ops: VariantOps;
  /** Every option of the product (this one included), for the draft duplicate check. */
  siblings: ProductVariant[];
  /** The product's currently-enabled variant axes (from `ProductVariantManager`'s checkboxes) — determines which fields this row's edit form shows. */
  activeAxes: ProductAttributeKey[];
  onChange: (variant: ProductVariant) => void;
  onDelete: (variantId: string) => void;
}

/** One variant in `ProductVariantManager`: view, edit-in-place, delete-confirm. */
export function ProductVariantRow({
  variant,
  product,
  ops,
  siblings,
  activeAxes,
  onChange,
  onDelete,
}: ProductVariantRowProps) {
  const [mode, setMode] = useState<Mode>("view");
  const [values, setValues] = useState<UpdateProductVariantInput>(() => toInput(variant));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  function handleChange(field: ProductAttributeKey, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  function handleSave() {
    setFormError(null);
    const parsed = updateProductVariantSchema.safeParse({
      ...values,
      price: values.price === undefined || Number.isNaN(values.price) ? undefined : values.price,
    });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
      return;
    }
    startSaving(async () => {
      const result = await ops.update(parsed.data, siblings);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      onChange(result.data);
      setMode("view");
    });
  }

  function handleCancelEdit() {
    setValues(toInput(variant));
    setFieldErrors({});
    setFormError(null);
    setMode("view");
  }

  function handleDelete() {
    startDeleting(async () => {
      const result = await ops.remove(variant.id);
      if (!result.success) {
        setFormError(result.error);
        setMode("view");
        return;
      }
      onDelete(variant.id);
    });
  }

  const label =
    [variant.color, variant.size, variant.material, variant.dimensions].filter(Boolean).join(" / ") ||
    "—";

  if (mode === "edit") {
    return (
      <li className="rounded-xl border border-border p-4">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {activeAxes.map((key) => (
              <FormField
                key={key}
                label={ATTRIBUTE_FIELD_LABELS[key]}
                value={values[key] ?? ""}
                onChange={(event) => handleChange(key, event.target.value)}
                errors={fieldErrors[key]}
                themed
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Product code (optional)"
              value={values.sku ?? ""}
              onChange={(event) => setValues((prev) => ({ ...prev, sku: event.target.value }))}
              errors={fieldErrors.sku}
              themed
            />
            <FormField
              label={`Different price (optional, otherwise ${formatCurrency(product.priceCents, product.currency)})`}
              type="number"
              step="0.01"
              min="0.01"
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
          {formError ? <ErrorState title="Couldn't save option" message={formError} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" size="rjSm" isLoading={isSaving} onClick={handleSave}>
              Save
            </Button>
            <Button type="button" variant="outline" size="rjSm" disabled={isSaving} onClick={handleCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      </li>
    );
  }

  if (mode === "delete") {
    return (
      <li className="rounded-xl border border-border p-4">
        <ConfirmPanel
          label={`Delete ${label} option`}
          title={`Delete "${label}"?`}
          description="This can't be undone. Options that have already been ordered can't be deleted."
          tone="danger"
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          isPending={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setMode("view")}
        />
        {formError ? (
          <div className="mt-2">
            <ErrorState title="Couldn't delete option" message={formError} />
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {variant.status !== "active" ? <Badge tone="warning">{variant.status}</Badge> : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {variant.sku ? `Code ${variant.sku} · ` : ""}
          {variant.priceCents !== null
            ? formatCurrency(variant.priceCents, product.currency)
            : `Same as ${formatCurrency(product.priceCents, product.currency)}`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="rjSm" onClick={() => setMode("edit")}>
          Edit
        </Button>
        <Button type="button" variant="outline" size="rjSm" onClick={() => setMode("delete")}>
          Delete
        </Button>
      </div>
    </li>
  );
}
