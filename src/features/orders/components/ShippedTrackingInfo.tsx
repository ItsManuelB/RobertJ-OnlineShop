import type { ShippedOrderInfo } from "@/features/orders/types/order.types";

/** "Today", "1 day in transit", "5 days in transit". */
export function formatDaysInTransit(days: number | null): string {
  if (days === null) return "Ship date unknown";
  if (days === 0) return "Shipped today";
  return `${days} day${days === 1 ? "" : "s"} in transit`;
}

/**
 * Courier, tracking number and days in transit for one Shipped order. Older
 * orders shipped before tracking capture existed have no courier/tracking, so
 * those render a dash instead of a blank.
 */
export function ShippedTrackingInfo({ info }: { info: ShippedOrderInfo | undefined }) {
  if (!info) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-foreground">{info.courier ?? "—"}</span>
      <span className="break-all font-mono text-xs text-muted-foreground">
        {info.trackingNumber ?? "No tracking number"}
      </span>
      <span className="text-xs text-muted-foreground">{formatDaysInTransit(info.daysInTransit)}</span>
    </div>
  );
}
