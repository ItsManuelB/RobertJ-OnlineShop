"use client";

import { useId, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { RJ_CARD, THEMED_CARD } from "@/components/ui/card";
import { COMMON_COURIERS } from "@/features/orders/constants/couriers.constants";
import { cn } from "@/lib/utils/cn";

const inputClasses =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export interface ShipmentCaptureFormProps {
  isPending: boolean;
  themed?: boolean;
  /** Courier + tracking are trimmed and guaranteed non-empty before this fires. */
  onSubmit: (courier: string, trackingNumber: string) => void;
  onCancel: () => void;
}

/**
 * Ready for Pickup → Shipped capture: manual courier + tracking number.
 * Required before shipping (validated here, at the action, and in the
 * `record_order_shipment` RPC). No courier API, no ETA — free-text entry.
 */
export function ShipmentCaptureForm({
  isPending,
  themed = false,
  onSubmit,
  onCancel,
}: ShipmentCaptureFormProps) {
  const [courier, setCourier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const courierListId = useId();
  const courierId = useId();
  const trackingId = useId();
  const canSubmit = courier.trim().length > 0 && trackingNumber.trim().length > 0;
  const ink = themed ? "text-foreground" : "text-rj-black";
  const muted = themed ? "text-muted-foreground" : "text-rj-gray-600";

  return (
    <form
      aria-label="Capture shipment tracking"
      className={cn(themed ? THEMED_CARD : RJ_CARD, "flex flex-col gap-4 p-5")}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !isPending) onSubmit(courier.trim(), trackingNumber.trim());
      }}
    >
      <div>
        <h3 className={cn("text-sm font-bold", ink)}>Shipment details</h3>
        <p className={cn("mt-1 text-xs", muted)}>
          Enter the courier and tracking number. Both are required before the order can be marked shipped.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={courierId} className={cn("text-xs font-semibold", ink)}>
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
        <label htmlFor={trackingId} className={cn("text-xs font-semibold", ink)}>
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
        <Button
          type="submit"
          variant="primary"
          size="rjSm"
          isLoading={isPending}
          disabled={!canSubmit}
        >
          Confirm &amp; mark shipped
        </Button>
        <button
          type="button"
          className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
