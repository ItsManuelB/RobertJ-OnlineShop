import { RJ_CARD } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date";
import type { OrderShipment } from "@/features/orders/types/order.types";

export interface ShipmentTrackingCardProps {
  shipment: OrderShipment | null;
  /** `orders.shipped_at` — the authoritative ship date (never stored on the shipment). */
  shippedAt: string | null;
}

/**
 * Read-only shipment/tracking for the buyer, shown once an order is shipped
 * ("To Receive") or delivered. Manual courier + tracking only — no ETA, no map,
 * no courier API. Buyers can never edit this (RLS is read-only for them).
 * Handles older shipped orders that have no shipment row gracefully.
 */
export function ShipmentTrackingCard({ shipment, shippedAt }: ShipmentTrackingCardProps) {
  const hasDetails = Boolean(shipment?.courier || shipment?.trackingNumber);

  return (
    <section aria-label="Shipment tracking" className={cn(RJ_CARD, "p-5")}>
      <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-400">
        Shipment Tracking
      </h2>

      {hasDetails ? (
        <dl className="mt-3 flex flex-col gap-3">
          <div>
            <dt className="text-xs text-rj-gray-600">Courier</dt>
            <dd className="text-sm font-semibold text-rj-black">
              {shipment?.courier ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-rj-gray-600">Tracking number</dt>
            <dd className="font-mono text-sm font-bold tracking-wide text-rj-black">
              {shipment?.trackingNumber ?? "—"}
            </dd>
          </div>
          {shippedAt ? (
            <div>
              <dt className="text-xs text-rj-gray-600">Shipped</dt>
              <dd className="text-sm text-rj-black">{formatDateTime(shippedAt)}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-rj-gray-600">
          Tracking details will appear here once your seller adds them.
        </p>
      )}
    </section>
  );
}
