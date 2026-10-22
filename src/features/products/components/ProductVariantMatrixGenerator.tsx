"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/feedback/ErrorState";
import { setStartingStockAction } from "@/features/inventory/actions/inventory.actions";
import { DRAFT_VARIANT_PREFIX, type VariantOps } from "@/features/products/lib/product-variant-ops";
import {
  MAX_GENERATED_VARIANTS,
  parseValueList,
  planColorSizeCombinations,
} from "@/features/products/lib/variant-combinations";
import type { ProductVariant } from "@/features/products/types/product.types";

const stockInputClasses =
  "h-9 w-24 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
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
  // Options just created (saved ones only) that still sit at 0 stock — offered an opening count.
  const [justCreated, setJustCreated] = useState<ProductVariant[]>([]);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [stockError, setStockError] = useState<string | null>(null);
  const [isSavingStock, startSavingStock] = useTransition();

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
      setJustCreated(created.filter((variant) => !variant.id.startsWith(DRAFT_VARIANT_PREFIX)));
      setStockInputs({});
      setStockError(null);
    });
  }

  function handleSaveStock() {
    setStockError(null);
    const entries = justCreated
      .map((variant) => ({ variantId: variant.id, quantity: Number.parseInt(stockInputs[variant.id] ?? "", 10) }))
      .filter((entry) => Number.isFinite(entry.quantity) && entry.quantity > 0);
    if (entries.length === 0) {
      setStockError("Enter a quantity for at least one option, or skip for now.");
      return;
    }
    startSavingStock(async () => {
      const result = await setStartingStockAction({ productId: product.id, entries });
      if (!result.success) {
        setStockError(result.error);
        return;
      }
      const { updated, failed } = result.data;
      if (failed.length > 0) {
        setStockError(`${updated} saved; ${failed.length} failed (${failed[0].error}).`);
        setJustCreated((prev) => prev.filter((variant) => failed.some((f) => f.variantId === variant.id)));
        return;
      }
      setJustCreated([]);
      setNotice(`Set stock on ${updated} option${updated === 1 ? "" : "s"}.`);
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
      {justCreated.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="text-sm font-medium text-foreground">Set stock for the new options</p>
          <p className="text-xs text-muted-foreground">
            New options start at 0, so buyers see them as sold out until they have stock. Enter only
            units you actually have; leave a box blank to keep it at 0.
          </p>
          <ul className="flex flex-col gap-2">
            {justCreated.map((variant) => (
              <li key={variant.id} className="flex items-center justify-between gap-3">
                <label htmlFor={`start-${variant.id}`} className="min-w-0 text-sm text-foreground">
                  {[variant.color, variant.size].filter(Boolean).join(" / ")}
                </label>
                <input
                  id={`start-${variant.id}`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="0"
                  value={stockInputs[variant.id] ?? ""}
                  onChange={(event) => setStockInputs((prev) => ({ ...prev, [variant.id]: event.target.value }))}
                  className={stockInputClasses}
                />
              </li>
            ))}
          </ul>
          {stockError ? <ErrorState title="Couldn't set stock" message={stockError} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" size="rjSm" isLoading={isSavingStock} onClick={handleSaveStock}>
              Save stock
            </Button>
            <Button
              type="button"
              variant="outline"
              size="rjSm"
              disabled={isSavingStock}
              onClick={() => setJustCreated([])}
            >
              Skip for now
            </Button>
          </div>
        </div>
      ) : null}
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
