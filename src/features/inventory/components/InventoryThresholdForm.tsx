"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { updateInventoryThresholdAction } from "@/features/inventory/actions/inventory.actions";
import type { InventoryItem } from "@/features/inventory/types/inventory.types";
import type { ActionResult } from "@/types/action.types";

export function InventoryThresholdForm({ item, onDone }: { item: InventoryItem; onDone?: () => void }) {
  const [threshold, setThreshold] = useState(item.lowStockThresholdOverride?.toString() ?? "");
  const [state, formAction, isPending] = useActionState<ActionResult<InventoryItem> | null, FormData>(
    updateInventoryThresholdAction,
    null,
  );
  const fieldErrors = state && !state.success ? state.fieldErrors : undefined;
  const formError = state && !state.success && !state.fieldErrors ? state.error : undefined;

  useEffect(() => {
    if (state?.success) onDone?.();
  }, [state, onDone]);

  return (
    <form action={formAction} noValidate aria-busy={isPending} className="flex max-w-md flex-col gap-3">
      <input type="hidden" name="productId" value={item.productId} />
      {item.variantId ? <input type="hidden" name="variantId" value={item.variantId} /> : null}
      {formError ? <ErrorState title="Couldn't save the threshold" message={formError} /> : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`threshold-${item.id}`} className="text-sm font-medium text-foreground">
            Threshold for this item
          </label>
          <input
            id={`threshold-${item.id}`}
            name="threshold"
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            step={1}
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            placeholder="Use admin default"
            className="h-10 w-44 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          {fieldErrors?.threshold ? <p role="alert" className="text-xs text-danger">{fieldErrors.threshold[0]}</p> : null}
          <p className="text-xs text-muted-foreground">
            {threshold === "" ? `Inheriting ${item.lowStockThreshold} from the admin default.` : "This item will use its own threshold."}
          </p>
        </div>
        <Button type="button" variant="outline" size="rjSm" onClick={() => setThreshold("")}>
          Use admin default
        </Button>
        <Button type="submit" variant="primary" size="rjSm" isLoading={isPending}>
          Save threshold
        </Button>
      </div>
    </form>
  );
}
