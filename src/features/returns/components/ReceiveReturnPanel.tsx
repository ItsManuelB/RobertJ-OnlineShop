"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { ErrorState } from "@/components/feedback/ErrorState";
import { recordReturnReceivedAction } from "@/features/returns/actions/return.actions";
import type { ReturnItemCondition } from "@/features/returns/types/return.types";

const inputClasses =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export interface ReceiveReturnPanelProps {
  returnId: string;
}

/**
 * Seller/admin: confirms the returned parcel arrived and records what was
 * found. A sellable item goes back into stock right away; a not-sellable one is
 * recorded without restocking. Either way the admin then confirms (or rejects)
 * the refund. Only rendered by the caller while `status === 'return_shipped'`.
 */
export function ReceiveReturnPanel({ returnId }: ReceiveReturnPanelProps) {
  const [condition, setCondition] = useState<ReturnItemCondition | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const noteId = useId();

  function confirm() {
    if (!condition) return;
    setError(null);
    startTransition(async () => {
      const result = await recordReturnReceivedAction(returnId, condition, note.trim() || undefined);
      if (!result.success) setError(result.error);
      setCondition(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <ErrorState title="Couldn't record this return" message={error} /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={noteId} className="text-xs font-semibold text-foreground">
          Inspection note (optional)
        </label>
        <input
          id={noteId}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={inputClasses}
          placeholder="e.g. box opened, item scratched"
          maxLength={500}
          autoComplete="off"
        />
      </div>

      {condition ? (
        <ConfirmPanel
          label={`Confirm: item received, ${condition === "sellable" ? "sellable" : "not sellable"}`}
          title="Confirm you received this item?"
          description={
            condition === "sellable"
              ? "The returned quantity goes back into your inventory now, and the admin is asked to confirm the refund."
              : "Stock is not restored. The admin is asked to review the item and confirm or reject the refund."
          }
          tone="neutral"
          confirmVariant={condition === "sellable" ? "primary" : "danger"}
          confirmLabel={condition === "sellable" ? "Yes, received — restock" : "Yes, received — don't restock"}
          isPending={isPending}
          onConfirm={confirm}
          onCancel={() => setCondition(null)}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted-foreground">
            The buyer shipped this item back. Did it arrive, and can you sell it again?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" size="rjSm" onClick={() => setCondition("sellable")}>
              Received — sellable
            </Button>
            <Button type="button" variant="danger" size="rjSm" onClick={() => setCondition("not_sellable")}>
              Received — not sellable
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
