"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/feedback/ErrorState";
import type { VariantOps } from "@/features/products/lib/product-variant-ops";
import {
  MAX_GENERATED_VARIANTS,
  parseValueList,
  planColorSizeCombinations,
} from "@/features/products/lib/variant-combinations";
import type { ProductVariant } from "@/features/products/types/product.types";

const textareaClasses =
  "min-h-16 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export interface ProductVariantMatrixGeneratorProps {
  product: { id: string };
  ops: VariantOps;
  variants: ProductVariant[];
  /** The category's picklist per axis, or null when the seller types free text. */
  colorValues: string[] | null;
  sizeValues: string[] | null;
  onCreated: (variants: ProductVariant[]) => void;
}

interface ValuePickerProps {
  id: string;
  label: string;
  hint: string;
  picklist: string[] | null;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

/** A picklist as tick boxes, or a comma-separated text box when the category has none. */
function ValuePicker({ id, label, hint, picklist, value, onChange, disabled }: ValuePickerProps) {
  if (picklist && picklist.length > 0) {
    const picked = new Set(parseValueList(value).map((v) => v.toLowerCase()));
    return (
      <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
        <legend className="text-xs font-medium text-muted-foreground">{label}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {picklist.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={picked.has(option.toLowerCase())}
                onChange={(event) => {
                  const next = parseValueList(value).filter((v) => v.toLowerCase() !== option.toLowerCase());
                  if (event.target.checked) next.push(option);
                  onChange(next.join(", "));
                }}
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={hint}
        disabled={disabled}
        className={textareaClasses}
      />
    </div>
  );
}

/**
 * Builds every color × size option for a product in one go. Each new option
 * starts at 0 stock (nothing is invented) — stock is set afterwards from
 * Inventory, or moved in from the product's unassigned stock. Pairs the
 * product already has are skipped, so running it twice is harmless.
 */
export function ProductVariantMatrixGenerator({
  product,
  ops,
  variants,
  colorValues,
  sizeValues,
  onCreated,
}: ProductVariantMatrixGeneratorProps) {
  const [colors, setColors] = useState("");
  const [sizes, setSizes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const plan = planColorSizeCombinations(parseValueList(colors), parseValueList(sizes), variants);
  const tooMany = plan.toCreate.length > MAX_GENERATED_VARIANTS;

  function handleGenerate() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const created: ProductVariant[] = [];
      let working = variants;
      for (const pair of plan.toCreate) {
        const result = await ops.create({ productId: product.id, color: pair.color, size: pair.size }, working);
        if (!result.success) {
          if (created.length > 0) onCreated(created);
          setError(
            `Created ${created.length} of ${plan.toCreate.length}. Stopped at ${pair.color} / ${pair.size}: ${result.error}`,
          );
          return;
        }
        created.push(result.data);
        working = [...working, result.data];
      }
      onCreated(created);
      setColors("");
      setSizes("");
      setNotice(`Added ${created.length} option${created.length === 1 ? "" : "s"} with 0 stock.`);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <p className="text-sm font-medium text-foreground">Add colors and sizes together</p>
      <ValuePicker
        id="matrix-colors"
        label="Colors"
        hint="e.g. Black, Navy, Olive"
        picklist={colorValues}
        value={colors}
        onChange={setColors}
        disabled={isPending}
      />
      <ValuePicker
        id="matrix-sizes"
        label="Sizes"
        hint="e.g. S, M, L"
        picklist={sizeValues}
        value={sizes}
        onChange={setSizes}
        disabled={isPending}
      />
      <p className="text-xs text-muted-foreground">
        {plan.toCreate.length === 0
          ? "Enter at least one color and one size."
          : `Will add ${plan.toCreate.length} option${plan.toCreate.length === 1 ? "" : "s"}` +
            (plan.alreadyExist > 0 ? ` (${plan.alreadyExist} already exist and are skipped)` : "") +
            ". Each starts with 0 stock."}
      </p>
      {tooMany ? (
        <p className="text-xs text-danger">
          That is more than {MAX_GENERATED_VARIANTS} options at once. Add fewer colors or sizes.
        </p>
      ) : null}
      {error ? <ErrorState title="Couldn't add every option" message={error} /> : null}
      {notice ? <p className="text-xs text-success">{notice}</p> : null}
      <Button
        type="button"
        variant="primary"
        size="rjSm"
        className="self-start"
        isLoading={isPending}
        disabled={plan.toCreate.length === 0 || tooMany}
        onClick={handleGenerate}
      >
        Add {plan.toCreate.length > 0 ? plan.toCreate.length : ""} option
        {plan.toCreate.length === 1 ? "" : "s"}
      </Button>
    </div>
  );
}
