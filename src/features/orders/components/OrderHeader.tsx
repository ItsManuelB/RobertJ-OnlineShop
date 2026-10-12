import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date";
import type { Order } from "@/features/orders/types/order.types";

import { OrderStatusBadge } from "./OrderStatusBadge";

/**
 * Order detail header: order number, placed date, live status badge.
 * `themed` renders through the Admin/Seller portal's tokens instead of the
 * fixed rj-* palette — pass it from a themed portal page only; the Buyer
 * order-detail page omits it and keeps its current fixed-light look.
 */
export function OrderHeader({ order, themed = false }: { order: Order; themed?: boolean }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p
          className={cn(
            "text-[10px] font-bold uppercase tracking-[0.3em]",
            themed ? "text-primary" : "text-rj-red-dark",
          )}
        >
          Order
        </p>
        <h1
          className={cn(
            "mt-1 font-serif text-3xl leading-[1.05] md:text-4xl",
            themed ? "text-foreground" : "text-rj-black",
          )}
        >
          {order.orderNumber}
        </h1>
        <p className={cn("mt-1 text-xs", themed ? "text-muted-foreground" : "text-rj-gray-600")}>
          Placed {formatDate(order.placedAt)}
        </p>
      </div>
      <OrderStatusBadge
        status={order.status}
        paymentStatus={order.paymentStatus}
        paymentMethod={order.paymentMethod}
      />
    </header>
  );
}
