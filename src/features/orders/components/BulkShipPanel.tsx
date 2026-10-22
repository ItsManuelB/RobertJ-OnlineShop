"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { COMMON_COURIERS } from "@/features/orders/constants/couriers.constants";
import { OrderItemThumbs } from "@/features/orders/components/OrderItemThumbs";
import { getBuyerDisplayName, type Order } from "@/features/orders/types/order.types";

const inputClasses =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export interface BulkShipEntry {
  orderId: string;
  courier: string;
  trackingNumber: string;
}

export interface BulkShipPanelProps {
  /** Ready for Pickup orders only — the caller filters. */
  orders: Order[];
  isPending: boolean;
  onSubmit: (entries: BulkShipEntry[]) => void;
  onCancel: () => void;
}

/**
 * Bulk Ready for Pickup → Shipped. One courier is picked once for the batch;
 * every order still needs its own tracking number (a tracking number is
 * unique per parcel — the same rule as the single-order form). Nothing is
 * sent until the courier and every tracking number are filled in and no two
 * orders share a number.
 */
export function BulkShipPanel({ orders, isPending, onSubmit, onCancel }: BulkShipPanelProps) {
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const courierListId = useId();
  const courierId = useId();

  const trimmed = orders.map((order) => (tracking[order.id] ?? "").trim());
  const counts = new Map<string, number>();
  for (const value of trimmed) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  const hasDuplicate = Array.from(counts.values()).some((count) => count > 1);
  const allFilled = trimmed.every((value) => value.length > 0);
  const canSubmit = courier.trim().length > 0 && allFilled && !hasDuplicate;

  return (
    <form
      aria-label="Mark selected orders shipped"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit || isPending) return;
        onSubmit(
          orders.map((order, index) => ({
            orderId: order.id,
            courier: courier.trim(),
            trackingNumber: trimmed[index],
          })),
        );
      }}
    >
      <div>
        <h3 className="text-sm font-bold text-foreground">
          Mark {orders.length} order{orders.length === 1 ? "" : "s"} shipped
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose the courier once, then enter each parcel&apos;s tracking number. Both are required before an order can be marked shipped.
        </p>
      </div>

      <div className="flex max-w-sm flex-col gap-1.5">
        <label htmlFor={courierId} className="text-xs font-semibold text-foreground">
          Courier (applies to all)
        </label>
        <input
          id={courierId}
          list={courierListId}
          value={courier}
          onChange={(event) => setCourier(event.target.value)}
          className={inputClasses}
          placeholder="e.g. J&T Express"
          maxLength={80}
          autoComplete="off"
        />
        <datalist id={courierListId}>
          {COMMON_COURIERS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {orders.map((order, index) => {
          const value = trimmed[index];
          const duplicate = value.length > 0 && (counts.get(value) ?? 0) > 1;
          return (
            <li key={order.id} className="flex flex-col gap-2 rounded-md border border-border p-2 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <OrderItemThumbs items={order.items} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{order.orderNumber}</p>
                  <p className="truncate text-xs text-muted-foreground">{getBuyerDisplayName(order)}</p>
                </div>
              </div>
              <div className="sm:w-64">
                <input
                  value={tracking[order.id] ?? ""}
                  onChange={(event) =>
                    setTracking((prev) => ({ ...prev, [order.id]: event.target.value }))
                  }
                  aria-label={`Tracking number for ${order.orderNumber}`}
                  aria-invalid={duplicate}
                  className={inputClasses}
                  placeholder="Tracking number"
                  maxLength={120}
                  autoComplete="off"
                />
                {duplicate ? (
                  <p className="mt-1 text-xs text-danger">Already used for another order in this batch.</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="rjSm" isLoading={isPending} disabled={!canSubmit}>
          Mark {orders.length} shipped
        </Button>
        <Button type="button" variant="outline" size="rjSm" disabled={isPending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
