import type { DeliveredOrderInfo, Order } from "@/features/orders/types/order.types";
import { formatDateTime } from "@/lib/utils/date";

/**
 * Cancelled tab: who cancelled, when and why — all already stored on the
 * order, so the seller doesn't have to open each one to reconcile it.
 */
export function CancellationInfo({
  order,
}: {
  order: Pick<Order, "cancelledBy" | "cancelledAt" | "cancellationReason">;
}) {
  if (!order.cancelledBy && !order.cancelledAt && !order.cancellationReason) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-medium capitalize text-foreground">
        {order.cancelledBy ? `By ${order.cancelledBy}` : "Cancelled"}
      </span>
      {order.cancelledAt ? (
        <span className="text-xs text-muted-foreground">{formatDateTime(order.cancelledAt)}</span>
      ) : null}
      <span className="line-clamp-2 max-w-[16rem] text-xs text-muted-foreground">
        {order.cancellationReason ?? "No reason recorded"}
      </span>
    </div>
  );
}

/** Delivered tab: days since delivery and how much of the buyer's return window is left. */
export function DeliveredInfo({ info }: { info: DeliveredOrderInfo | undefined }) {
  if (!info || info.daysSinceDelivery === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const { daysSinceDelivery, returnDaysLeft } = info;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-foreground">
        {daysSinceDelivery === 0
          ? "Delivered today"
          : `Delivered ${daysSinceDelivery} day${daysSinceDelivery === 1 ? "" : "s"} ago`}
      </span>
      <span className="text-xs text-muted-foreground">
        {returnDaysLeft === null
          ? ""
          : returnDaysLeft === 0
            ? "Return window closed"
            : `${returnDaysLeft} day${returnDaysLeft === 1 ? "" : "s"} left to return`}
      </span>
    </div>
  );
}
