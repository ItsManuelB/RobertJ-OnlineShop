import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";
import type { ReactNode } from "react";

import { RJ_CARD, THEMED_CARD } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import type { Order } from "@/features/orders/types/order.types";

import { OrderStatusBadge } from "./OrderStatusBadge";

export interface OrderCardProps {
  order: Order;
  /** Overrides the default buyer-facing detail link — used by the dashboard list to point at `ROUTES.dashboardOrderDetail`. */
  href?: string;
  /** Renders through the Admin/Seller portal's tokens instead of the fixed rj-* palette — pass from portal call sites only (DashboardOrdersPanel, RecentOrdersCard); the Buyer order list omits it. */
  themed?: boolean;
  /**
   * Lifecycle-tab action row (Pay Now, Cancel Order, Buy Again, etc.),
   * rendered as a sibling below the clickable card content rather than
   * inside it — buttons can't nest inside the `<Link>` that makes the rest
   * of the card clickable. Only the buyer `/orders` list (`OrderCardActions`)
   * passes this; every other caller (dashboard, seller/admin portals, and
   * historically the confirmation page) omits it and renders exactly as
   * before this prop was added.
   */
  actions?: ReactNode;
}

/** Responsive order-list item: cover, order number, date, total, status badge. */
export function OrderCard({ order, href, themed = false, actions }: OrderCardProps) {
  const cover = order.items.find((item) => item.imageUrl)?.imageUrl ?? null;
  const ink = themed ? "text-foreground" : "text-rj-black";
  const muted = themed ? "text-muted-foreground" : "text-rj-gray-600";
  const ring = themed ? "focus-visible:ring-ring/30" : "focus-visible:ring-rj-red/30";

  return (
    <div className={cn(themed ? THEMED_CARD : RJ_CARD, "shadow-sm transition-all hover:shadow-lg")}>
      <Link
        href={href ?? ROUTES.orderDetail(order.id)}
        className={cn(
          "group flex items-center gap-4 rounded-[inherit] p-4 focus-visible:outline-none focus-visible:ring-2",
          ring,
        )}
      >
      {cover ? (
        <Image
          src={cover}
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex h-16 w-16 shrink-0 items-center justify-center rounded-xl",
            themed ? "bg-muted" : "bg-rj-gray-100",
          )}
        >
          <Package className={cn("h-6 w-6", themed ? "text-muted-foreground" : "text-rj-gray-400")} aria-hidden="true" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px] font-bold", ink)}>{order.orderNumber}</p>
        <p className={cn("mt-0.5 text-xs", muted)}>{formatDateTime(order.placedAt)}</p>
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <p className={cn("text-sm font-bold", ink)}>
          {formatCurrency(order.totalCents, order.currency)}
        </p>
        <OrderStatusBadge
          status={order.status}
          paymentStatus={order.paymentStatus}
          paymentMethod={order.paymentMethod}
        />
      </div>
      </Link>
      {actions ? (
        <div
          className={cn(
            "flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3",
            themed ? "border-border" : "border-rj-gray-100",
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
