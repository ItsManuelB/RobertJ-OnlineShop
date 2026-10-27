import Link from "next/link";

import { EmptyState } from "@/components/feedback/EmptyState";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { OrderCard } from "@/features/orders/components/OrderCard";
import type { Order } from "@/features/orders/types/order.types";
import { cn } from "@/lib/utils/cn";

/** The latest few orders + a link to the full history. */
export function RecentOrdersList({ orders }: { orders: Order[] }) {
  return (
    <section aria-label="Recent orders" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-400">
          Recent orders
        </h2>
        <Link
          href={ROUTES.orders}
          className="text-xs font-semibold text-rj-red-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
        >
          View all orders
        </Link>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Orders you place will show up here."
          action={
            <Link
              href={ROUTES.products}
              className={cn(buttonVariants({ variant: "rj", size: "rjSm" }))}
            >
              Browse products
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
