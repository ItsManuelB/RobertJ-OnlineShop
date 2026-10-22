import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/feedback/ErrorState";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { OrderCard } from "@/features/orders/components/OrderCard";
import { getDashboardOrderSummary } from "@/lib/supabase/queries";

export interface RecentOrdersCardProps {
  /** Overridable for the Admin Portal, which links into `/admin/orders` instead of `/dashboard/orders`. */
  viewAllHref?: string;
  orderHref?: (id: string) => string;
  /** Optional exact date range for a scoped shop dashboard. Dates use the report timezone boundary. */
  from?: string;
  to?: string;
  shopId?: string;
}

/** The 5 most recent orders visible to the caller (own shop, or every shop for admin). */
export async function RecentOrdersCard({
  viewAllHref = ROUTES.dashboardOrders,
  orderHref = ROUTES.dashboardOrderDetail,
  from,
  to,
  shopId,
}: RecentOrdersCardProps = {}) {
  let recentOrders;
  try {
    ({ recentOrders } = await getDashboardOrderSummary(
      from && to ? { from, to, shopId } : undefined,
    ));
  } catch {
    return <ErrorState message="We couldn't load recent orders right now." />;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Recent orders</h2>
          <Link href={viewAllHref} className="text-xs font-semibold text-foreground underline">
            View all orders →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <EmptyState
            title={from && to ? "No orders in this range" : "No orders yet"}
            description={
              from && to
                ? "Try a wider date range to see this shop's earlier orders."
                : "New orders will show up here."
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {recentOrders.map((order) => (
              <OrderCard key={order.id} order={order} href={orderHref(order.id)} themed />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentOrdersCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </CardContent>
    </Card>
  );
}
