import {
  BadgeCheck,
  Check,
  ClipboardList,
  Package,
  PackageCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { RJ_CARD, THEMED_CARD } from "@/components/ui/card";
import type { OrderStatus } from "@/constants/status";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date";
import {
  getOrderStatusLabel,
  ORDER_TIMELINE_STEPS,
} from "@/features/orders/constants/order.constants";

const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "cancelled",
  "refunded",
]);

/**
 * Logo per fulfilment step shown inside each stepper node (purely presentational,
 * so it lives in the component layer, not the status constants). Mirrors the
 * customer-facing labels: Pending = order placed, To Pack = packing, Ready for
 * Pickup = packed/ready, Shipped = in transit, Delivered = received.
 */
const STEP_ICON: Partial<Record<OrderStatus, LucideIcon>> = {
  pending: ClipboardList,
  confirmed: Package,
  processing: PackageCheck,
  shipped: Truck,
  delivered: BadgeCheck,
};

export interface OrderTimelineProps {
  status: OrderStatus;
  themed?: boolean;
  /**
   * Per-step timestamps, keyed the same as `ORDER_TIMELINE_STEPS`. Optional —
   * omitting this (or any single key) keeps the step label without a time,
   * same as before this timestamp was added. `confirmedAt`/`processingAt` are
   * null for every order placed before those columns existed; there is no
   * real timestamp to backfill, so those steps just render without a time.
   */
  placedAt?: string | null;
  confirmedAt?: string | null;
  processingAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
}

/**
 * Forward fulfilment stepper (Pending → … → Delivered) with `aria-current="step"`
 * on the live step. Cancelled/Refunded are terminal and render a single marker
 * instead of the forward steps. `themed`: see OrderHeader.
 */
export function OrderTimeline({
  status,
  themed = false,
  placedAt,
  confirmedAt,
  processingAt,
  shippedAt,
  deliveredAt,
}: OrderTimelineProps) {
  const stepTimestamp: Record<OrderStatus, string | null | undefined> = {
    pending: placedAt,
    confirmed: confirmedAt,
    processing: processingAt,
    shipped: shippedAt,
    delivered: deliveredAt,
    cancelled: undefined,
    refunded: undefined,
  };
  const ink = themed ? "text-foreground" : "text-rj-black";
  const muted = themed ? "text-muted-foreground" : "text-rj-gray-600";

  if (TERMINAL_STATUSES.has(status)) {
    const dotClass = themed
      ? status === "cancelled"
        ? "bg-danger text-danger-foreground"
        : "bg-secondary text-secondary-foreground"
      : status === "cancelled"
        ? "bg-rj-red-dark text-rj-white"
        : "bg-rj-gray-400 text-rj-white";

    return (
      <section
        aria-label={`Order status: ${getOrderStatusLabel(status)}`}
        role="status"
        aria-live="polite"
        className={cn(
          themed ? THEMED_CARD : RJ_CARD,
          "flex items-center gap-3 p-5",
          status === "cancelled" ? "bg-danger/5" : themed ? "bg-muted" : "bg-rj-gray-50",
        )}
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            dotClass,
          )}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className={cn("text-sm font-bold", ink)}>
            {getOrderStatusLabel(status)}
          </p>
          <p className={cn("mt-0.5 text-xs", muted)}>
            {status === "cancelled"
              ? "This order was cancelled and will not be fulfilled."
              : "This order was refunded and is complete."}
          </p>
        </div>
      </section>
    );
  }

  const currentIndex = ORDER_TIMELINE_STEPS.indexOf(status);

  return (
    <section
      aria-label="Order progress"
      className={cn(themed ? THEMED_CARD : RJ_CARD, "p-5")}
    >
      <ol className="flex items-start">
        {ORDER_TIMELINE_STEPS.map((step, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isLast = index === ORDER_TIMELINE_STEPS.length - 1;
          const timestamp = stepTimestamp[step];
          const StepIcon = STEP_ICON[step] ?? ClipboardList;
          const doneTrack = themed ? "bg-primary" : "bg-rj-red";
          const idleTrack = themed ? "bg-border" : "bg-rj-gray-200";
          return (
            <li
              key={step}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-2",
                isLast && "flex-none",
              )}
            >
              <div className="flex w-full items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    index > 0 ? (index <= currentIndex ? doneTrack : idleTrack) : "bg-transparent",
                  )}
                />
                <span
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    themed
                      ? [
                          // Done steps read as "complete" via an outlined node
                          // (brand ring + brand icon); the live step is the only
                          // solid-filled node; upcoming steps stay muted.
                          isDone && "border-primary bg-card text-primary",
                          isCurrent &&
                            "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
                          !isDone && !isCurrent && "border-border bg-card text-muted-foreground",
                        ]
                      : [
                          isDone && "border-rj-red bg-rj-white text-rj-red",
                          isCurrent &&
                            "border-rj-red bg-rj-red text-rj-white ring-4 ring-rj-red/15",
                          !isDone && !isCurrent &&
                            "border-rj-gray-200 bg-rj-white text-rj-gray-400",
                        ],
                  )}
                >
                  <StepIcon className="h-5 w-5" aria-hidden="true" />
                  {isDone ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2",
                        themed
                          ? "border-card bg-primary text-primary-foreground"
                          : "border-rj-white bg-rj-red text-rj-white",
                      )}
                    >
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  ) : null}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    isLast ? "bg-transparent" : index < currentIndex ? doneTrack : idleTrack,
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-center text-[11px] font-semibold leading-tight",
                  isDone || isCurrent ? ink : muted,
                )}
              >
                {getOrderStatusLabel(step)}
              </span>
              {timestamp ? (
                <span className={cn("text-center text-[10px] leading-tight", muted)}>
                  {formatDateTime(timestamp)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
