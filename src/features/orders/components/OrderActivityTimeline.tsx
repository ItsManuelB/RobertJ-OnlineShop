import {
  BadgeCheck,
  ClipboardList,
  CreditCard,
  Package,
  PackageCheck,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { RJ_CARD, THEMED_CARD } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date";
import type { Order, OrderShipment } from "@/features/orders/types/order.types";

type ActivityOrder = Pick<
  Order,
  | "placedAt"
  | "paidAt"
  | "confirmedAt"
  | "processingAt"
  | "shippedAt"
  | "deliveredAt"
  | "buyerConfirmedReceivedAt"
  | "cancelledAt"
  | "cancellationReason"
>;

export interface OrderActivityTimelineProps {
  order: ActivityOrder;
  /** Courier/tracking shown in the header once shipped; null before that (or for older rows). */
  shipment: OrderShipment | null;
  /** `themed` renders through the Admin/Seller portal tokens; omit for the fixed-light buyer view. */
  themed?: boolean;
}

interface ActivityEvent {
  key: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Non-null ISO timestamp — events with no timestamp are filtered out before render. */
  at: string;
  /** Terminal/negative event (cancelled) — tinted with the danger token when it's the latest. */
  danger?: boolean;
}

/**
 * Vertical, newest-first delivery/order-activity timeline, complementing the
 * horizontal `OrderTimeline` stepper. Built entirely from the order's own
 * status timestamps (there is no live courier-event feed in scope — manual
 * courier + tracking only), so every row shown is a real, recorded moment.
 * The most recent event is highlighted; older ones read as muted history.
 */
export function OrderActivityTimeline({
  order,
  shipment,
  themed = false,
}: OrderActivityTimelineProps) {
  const ink = themed ? "text-foreground" : "text-rj-black";
  const muted = themed ? "text-muted-foreground" : "text-rj-gray-600";

  const courierLine = [shipment?.courier, shipment?.trackingNumber]
    .filter(Boolean)
    .join(" · ");

  // Declared in forward order for readability; filtered to the ones that
  // actually happened, then sorted newest-first for display.
  const candidates: Array<ActivityEvent | null> = [
    order.placedAt
      ? {
          key: "placed",
          icon: ClipboardList,
          title: "Order placed",
          description: "Your order has been placed.",
          at: order.placedAt,
        }
      : null,
    order.paidAt
      ? {
          key: "paid",
          icon: CreditCard,
          title: "Payment received",
          description: "Your payment has been confirmed.",
          at: order.paidAt,
        }
      : null,
    order.confirmedAt
      ? {
          key: "confirmed",
          icon: Package,
          title: "Order confirmed",
          description: "The seller is preparing your order.",
          at: order.confirmedAt,
        }
      : null,
    order.processingAt
      ? {
          key: "processing",
          icon: PackageCheck,
          title: "Ready to ship",
          description: "The seller has packed your order.",
          at: order.processingAt,
        }
      : null,
    order.shippedAt
      ? {
          key: "shipped",
          icon: Truck,
          title: "Shipped out",
          description: courierLine
            ? `Handed to the courier — ${courierLine}.`
            : "Your parcel is on its way.",
          at: order.shippedAt,
        }
      : null,
    order.deliveredAt
      ? {
          key: "delivered",
          icon: BadgeCheck,
          title: "Delivered",
          description: "Your parcel has been delivered.",
          at: order.deliveredAt,
        }
      : null,
    order.buyerConfirmedReceivedAt
      ? {
          key: "received",
          icon: BadgeCheck,
          title: "Order completed",
          description: "You confirmed you received this order.",
          at: order.buyerConfirmedReceivedAt,
        }
      : null,
    order.cancelledAt
      ? {
          key: "cancelled",
          icon: XCircle,
          title: "Order cancelled",
          description: order.cancellationReason
            ? `Reason: ${order.cancellationReason}`
            : "This order was cancelled.",
          at: order.cancelledAt,
          danger: true,
        }
      : null,
  ];

  const events = candidates
    .filter((event): event is ActivityEvent => event !== null)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <section
      aria-label="Delivery updates"
      className={cn(themed ? THEMED_CARD : RJ_CARD, "p-5")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className={cn("text-[10px] font-bold uppercase tracking-[0.3em]", muted)}>
          Delivery updates
        </h2>
        {courierLine ? (
          <p className={cn("text-right text-xs", muted)}>
            <span className="font-semibold">{shipment?.courier}</span>
            {shipment?.trackingNumber ? (
              <>
                <br />
                <span className="font-mono tracking-wide">{shipment.trackingNumber}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      {events.length > 0 ? (
        <ol className="mt-4">
          {events.map((event, index) => {
            const isLatest = index === 0;
            const isLast = index === events.length - 1;
            const Icon = event.icon;
            const latestNode = event.danger
              ? themed
                ? "bg-danger text-danger-foreground"
                : "bg-rj-red-dark text-rj-white"
              : themed
                ? "bg-primary text-primary-foreground"
                : "bg-rj-red text-rj-white";
            const idleNode = themed
              ? "bg-muted text-muted-foreground"
              : "bg-rj-gray-100 text-rj-gray-400";
            return (
              <li key={event.key} className="flex gap-4">
                <div className="flex flex-col items-center self-stretch">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      isLatest ? latestNode : idleNode,
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {!isLast ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "w-px grow",
                        themed ? "bg-border" : "bg-rj-gray-200",
                      )}
                    />
                  ) : null}
                </div>
                <div className={cn("flex-1", !isLast && "pb-6")}>
                  <time className={cn("text-xs", muted)}>{formatDateTime(event.at)}</time>
                  <p
                    className={cn(
                      "mt-0.5 text-sm font-semibold",
                      isLatest && event.danger
                        ? themed
                          ? "text-danger"
                          : "text-rj-red-dark"
                        : isLatest
                          ? themed
                            ? "text-primary"
                            : "text-rj-red"
                          : ink,
                    )}
                  >
                    {event.title}
                  </p>
                  <p className={cn("mt-0.5 text-xs leading-relaxed", muted)}>
                    {event.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={cn("mt-3 text-sm", muted)}>
          Updates will appear here as your order moves along.
        </p>
      )}
    </section>
  );
}
