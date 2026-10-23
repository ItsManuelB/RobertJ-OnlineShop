import Link from "next/link";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import {
  FILTER_CHIP_ACTIVE_THEMED,
  FILTER_CHIP_IDLE_THEMED,
} from "@/components/ui/filter-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { ORDER_STATUS } from "@/constants/status";
import { OrderCard } from "@/features/orders/components/OrderCard";
import type { OrderListParams } from "@/features/orders/types/order.types";
import { SELLER_ORDER_TABS, type SellerOrderTab } from "@/features/seller/constants/order-tabs";
import { cn } from "@/lib/utils/cn";
import { getCurrentSellerOwner, getOrderAttentionCounts, listDashboardOrders } from "@/lib/supabase/queries";

const PAGE_SIZE = 6;

const TAB_PARAMS: Record<SellerOrderTab, Partial<OrderListParams>> = {
  all: {},
  confirm: { confirmationRequired: true },
  ship: {},
  delivered: { status: ORDER_STATUS.delivered },
};

const EMPTY_COPY: Record<SellerOrderTab, { title: string; description: string }> = {
  all: { title: "No orders yet", description: "New orders from the marketplace will show up here." },
  confirm: { title: "Nothing to confirm", description: "New COD and paid online orders will appear here." },
  ship: { title: "Nothing to prepare or ship", description: "Confirmed orders waiting for fulfilment will appear here." },
  delivered: { title: "No delivered orders yet", description: "Orders appear here once the courier delivers them." },
};

export interface SellerRecentOrdersProps {
  tab: SellerOrderTab;
  /** Preserves the dashboard's other search params (date range) when switching tabs. */
  baseQuery: string;
}

/**
 * Recent orders for the signed-in seller's shop (live, not date filtered),
 * with status tabs. Owner-scoped exactly like the Orders page, so a seller's
 * own purchases as a buyer never appear. A multi-shop checkout is one order
 * per shop, so each row is this shop's order and total only.
 */
export async function SellerRecentOrders({ tab, baseQuery }: SellerRecentOrdersProps) {
  let orders;
  let counts;
  try {
    const owner = await getCurrentSellerOwner();
    const base = { page: 1, pageSize: PAGE_SIZE };
    // "To prepare & ship" spans two statuses, so it is two small reads merged.
    const [result, attention] = await Promise.all([
      tab === "ship"
        ? Promise.all([
            listDashboardOrders({ ...base, status: ORDER_STATUS.confirmed }, owner),
            listDashboardOrders({ ...base, status: ORDER_STATUS.processing }, owner),
          ]).then(([a, b]) =>
            [...a.items, ...b.items]
              .sort((x, y) => y.placedAt.localeCompare(x.placedAt))
              .slice(0, PAGE_SIZE),
          )
        : listDashboardOrders({ ...base, ...TAB_PARAMS[tab] }, owner).then((r) => r.items),
      owner.shopId ? getOrderAttentionCounts(owner.shopId) : Promise.resolve(null),
    ]);
    orders = result;
    counts = attention;
  } catch {
    return <ErrorState message="We couldn't load recent orders right now." />;
  }

  const tabHref = (id: SellerOrderTab) => {
    const params = new URLSearchParams(baseQuery);
    if (id === "all") params.delete("ordersTab");
    else params.set("ordersTab", id);
    const query = params.toString();
    return query ? `${ROUTES.sellerDashboard}?${query}` : ROUTES.sellerDashboard;
  };
  const tabCount: Partial<Record<SellerOrderTab, number>> = counts
    ? { confirm: counts.needsConfirmation, ship: counts.toPrepare + counts.inProcessing }
    : {};

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Recent orders</h2>
            <p className="text-xs text-muted-foreground">Live · your shop&apos;s orders only</p>
          </div>
          <Link href={ROUTES.sellerOrders} className="text-xs font-semibold text-primary hover:underline">
            View all orders →
          </Link>
        </div>

        <nav aria-label="Filter recent orders" className="flex flex-wrap gap-2">
          {SELLER_ORDER_TABS.map((item) => {
            const count = tabCount[item.id];
            return (
              <Link
                key={item.id}
                href={tabHref(item.id)}
                scroll={false}
                aria-current={item.id === tab ? "true" : undefined}
                className={item.id === tab ? FILTER_CHIP_ACTIVE_THEMED : FILTER_CHIP_IDLE_THEMED}
              >
                {item.label}
                {count !== undefined ? ` (${count})` : ""}
              </Link>
            );
          })}
        </nav>

        {orders.length === 0 ? (
          <EmptyState title={EMPTY_COPY[tab].title} description={EMPTY_COPY[tab].description} />
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((order) => (
              <div key={order.id} className="flex flex-col gap-1">
                {order.checkoutGroupId ? (
                  <p
                    className={cn("px-1 text-[11px] font-medium text-muted-foreground")}
                    title="The buyer paid once for items from several shops. This is your shop's order and total only."
                  >
                    Multi-shop checkout · your items only
                  </p>
                ) : null}
                <OrderCard order={order} href={ROUTES.sellerOrderDetail(order.id)} themed />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SellerRecentOrdersSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5" role="status">
        <span className="sr-only">Loading recent orders</span>
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </CardContent>
    </Card>
  );
}
