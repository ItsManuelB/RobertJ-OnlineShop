"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { recordReturnShipmentAction } from "@/features/returns/actions/return.actions";
import { COMMON_COURIERS } from "@/features/returns/constants/return.constants";
import { formatDateTime } from "@/lib/utils/date";

const inputClasses =
  "h-10 w-full rounded-md border border-rj-gray-200 bg-white px-3 text-sm text-rj-black outline-none transition-colors placeholder:text-rj-gray-400 focus-visible:border-rj-red focus-visible:ring-2 focus-visible:ring-rj-red/30";

/** Days left (rounded up) at which the panel switches to its "ship soon" warning — the day-3 reminder of a 5-day window. */
const REMINDER_DAYS_LEFT = 2;

export interface ShipReturnPanelProps {
  returnId: string;
  /** ISO timestamp the buyer must ship by (`returnDeadlineAt`). */
  deadlineAt: string | null;
}

/**
 * Buyer-only: enters the courier + tracking number of the parcel they are
 * sending back for an approved Return and Refund. Only rendered by the caller
 * while `status === 'awaiting_return'`. The deadline is re-checked inside
 * `record_return_shipment`, so a stale page can't submit past it.
 */
export function ShipReturnPanel({ returnId, deadlineAt }: ShipReturnPanelProps) {
  const [courier, setCourier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Snapshot at mount: render stays pure, and the server re-checks the deadline on submit anyway.
  const [mountedAt] = useState(() => Date.now());
  const courierListId = useId();
  const courierId = useId();
  const trackingId = useId();
  const canSubmit = courier.trim().length > 0 && trackingNumber.trim().length > 0;

  const daysLeft = deadlineAt
    ? Math.ceil((new Date(deadlineAt).getTime() - mountedAt) / (24 * 60 * 60 * 1000))
    : null;
  const urgent = daysLeft !== null && daysLeft <= REMINDER_DAYS_LEFT;

  function handleSubmit() {
    if (!canSubmit || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await recordReturnShipmentAction(returnId, courier.trim(), trackingNumber.trim());
      if (!result.success) setError(result.error);
    });
  }

  return (
    <form
      aria-label="Ship your return"
      className="flex flex-col gap-3 rounded-2xl border border-rj-gray-100 bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      {error ? <ErrorState title="Couldn't save your shipment" message={error} /> : null}

      <div>
        <p className="text-sm font-semibold text-rj-black">Ship the item back to the seller</p>
        <p className="mt-1 text-xs text-rj-gray-600">
          Pack the item, send it with any courier, then enter the courier and tracking number below. Your
          refund is confirmed once the seller receives it.
        </p>
        {deadlineAt ? (
          <p className={urgent ? "mt-2 text-xs font-semibold text-rj-red" : "mt-2 text-xs text-rj-gray-600"}>
            {urgent ? "Ship soon — " : ""}please ship by {formatDateTime(deadlineAt)}. After that this request
            closes automatically.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={courierId} className="text-xs font-semibold text-rj-black">
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
        <label htmlFor={trackingId} className="text-xs font-semibold text-rj-black">
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
        <Button type="submit" variant="rj" size="rjSm" isLoading={isPending} disabled={!canSubmit}>
          I&apos;ve shipped it
        </Button>
      </div>
    </form>
  );
}
