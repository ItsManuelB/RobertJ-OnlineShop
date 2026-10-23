"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { recordReturnReplacementShipmentAction } from "@/features/returns/actions/return.actions";
import { COMMON_COURIERS } from "@/features/returns/constants/return.constants";

const inputClasses =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export interface RecordReturnReplacementShipmentPanelProps {
  returnId: string;
}

/**
 * The order's own seller (or admin) ships the approved replacement item —
 * manual courier + tracking capture, same shape as `ShipmentCaptureForm`
 * but a self-contained panel (like `RecordReturnConditionPanel`) rather
 * than a controlled form, since there's no multi-step flow around it. Only
 * ever rendered by the caller once `status === 'replacement_approved'` and
 * `replacementShippedAt` is still null.
 */
export function RecordReturnReplacementShipmentPanel({
  returnId,
}: RecordReturnReplacementShipmentPanelProps) {
  const [courier, setCourier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const courierListId = useId();
  const courierId = useId();
  const trackingId = useId();
  const canSubmit = courier.trim().length > 0 && trackingNumber.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await recordReturnReplacementShipmentAction(
        returnId,
        courier.trim(),
        trackingNumber.trim(),
      );
      if (!result.success) {
        setError(result.error);
      }
    });
  }

  return (
    <form
      aria-label="Record replacement shipment"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      {error ? <ErrorState title="Couldn't record this shipment" message={error} /> : null}

      <p className="text-xs font-semibold text-muted-foreground">
        Enter the courier and tracking number for the replacement item.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={courierId} className="text-xs font-semibold text-foreground">
          Courier
        </label>
        <input
          id={courierId}
          list={courierListId}
          value={courier}
          onChange={(event) => setCourier(event.target.value)}
          className={inputClasses}
          placeholder="e.g. J&T Express"
          maxLength={80}
          required
          autoComplete="off"
        />
        <datalist id={courierListId}>
          {COMMON_COURIERS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={trackingId} className="text-xs font-semibold text-foreground">
          Tracking number
        </label>
        <input
          id={trackingId}
          value={trackingNumber}
          onChange={(event) => setTrackingNumber(event.target.value)}
          className={inputClasses}
          placeholder="e.g. JT1234567890"
          maxLength={120}
          required
          autoComplete="off"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="rjSm" isLoading={isPending} disabled={!canSubmit}>
          Confirm shipment
        </Button>
      </div>
    </form>
  );
}
