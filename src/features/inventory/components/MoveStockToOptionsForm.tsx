"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import {
  allocateStockToOptionsAction,
  getProductOptionsAction,
  type ProductOptionStock,
} from "@/features/inventory/actions/inventory.actions";
import type { InventoryItem } from "@/features/inventory/types/inventory.types";

const inputClasses =
  "h-9 w-24 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export interface MoveStockToOptionsFormProps {
  /** The product-level (unassigned) row. */
  item: InventoryItem;
  onDone?: () => void;
}

/**
 * Moves a product's unassigned stock into its options. It only ever
 * transfers: whatever is entered is taken off the unassigned count, so the
 * product's total never changes and nothing is created. The server enforces
 * the same limit atomically.
 */
export function MoveStockToOptionsForm({ item, onDone }: MoveStockToOptionsFormProps) {
  const [options, setOptions] = useState<ProductOptionStock[] | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    getProductOptionsAction(item.productId).then((result) => {
      if (!active) return;
      if (result.success) setOptions(result.data);
      else setError(result.error);
    });
    return () => {
      active = false;
    };
  }, [item.productId]);

  const entries = Object.entries(amounts)
    .map(([variantId, raw]) => ({ variantId, quantity: Number.parseInt(raw, 10) }))
    .filter((entry) => Number.isFinite(entry.quantity) && entry.quantity > 0);
  const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const remaining = item.quantity - total;

  function handleMove() {
    setError(null);
    if (entries.length === 0) {
      setError("Enter a quantity for at least one option.");
      return;
    }
    if (remaining < 0) {
      setError(`Only ${item.quantity} unassigned units are available.`);
      return;
    }
    startTransition(async () => {
      const result = await allocateStockToOptionsAction({
        productId: item.productId,
        allocations: entries,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onDone?.();
    });
  }

  if (error && !options) return <ErrorState title="Couldn't load options" message={error} />;
  if (!options) return <p className="text-sm text-muted-foreground">Loading options…</p>;
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">This product has no options yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{item.quantity}</span> unassigned unit
        {item.quantity === 1 ? "" : "s"} — not sold until moved into an option. Moving stock never
        changes the total.
      </p>
      <ul className="flex flex-col gap-2">
        {options.map((option) => (
          <li key={option.variantId} className="flex items-center justify-between gap-3">
            <label htmlFor={`move-${option.variantId}`} className="min-w-0 text-sm text-foreground">
              {option.label || "Option"}
              <span className="ml-2 text-xs text-muted-foreground">now {option.quantity}</span>
            </label>
            <input
              id={`move-${option.variantId}`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={amounts[option.variantId] ?? ""}
              onChange={(event) =>
                setAmounts((prev) => ({ ...prev, [option.variantId]: event.target.value }))
              }
              placeholder="0"
              className={inputClasses}
            />
          </li>
        ))}
      </ul>
      <p className={remaining < 0 ? "text-sm text-danger" : "text-sm text-muted-foreground"}>
        Moving {total} · {remaining} left unassigned
      </p>
      {error ? <ErrorState title="Couldn't move stock" message={error} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="rjSm" isLoading={isPending} onClick={handleMove}>
          Move stock
        </Button>
        <Button type="button" variant="outline" size="rjSm" disabled={isPending} onClick={() => onDone?.()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
