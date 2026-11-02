import Link from "next/link";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { PaginationControls } from "@/features/products/components/PaginationControls";
import { OrderAttentionStrip } from "@/features/orders/components/OrderAttentionStrip";
import { OrdersDataTable } from "@/features/orders/components/OrdersDataTable";
import { dashboardOrderListParamsSchema } from "@/features/orders/schemas/order.schema";
import type {
  DeliveredOrderInfo,
  Order,
  OrderListParams,
  ShippedOrderInfo,
} from "@/features/orders/types/order.types";
import { RETURN_WINDOW_DAYS } from "@/features/returns";
import { ORDER_STATUS } from "@/constants/status";
import { cn } from "@/lib/utils/cn";
import { daysSince } from "@/lib/utils/date";
import {
  getDashboardOrderStatusCounts,
  getOrderAttentionCounts,
  getOwnShopId,
  listDashboardOrders,
  listOrderShipments,
  requireSessionUser,
} from "@/lib/supabase/queries";
import type { PaginatedResult } from "@/types/pagination.types";

export interface DashboardOrdersPanelProps {
  searchParams: Record<string, string | string[] | undefined>;
  /** Overridable for the Admin Portal, which links into `/admin/orders` instead of `/dashboard/orders`. */
  clearFiltersHref?: string;
  isAdmin?: boolean;
  /** The page renders the next-step cards itself (above its filter bar), so the panel skips them. */
  hideAttention?: boolean;
}

/**
 * Dashboard equivalent of `OrderListSection` — same composition, but reads
 * via `listDashboardOrders()` (explicit seller/shop scope plus RLS, or all
 * orders for admins) instead of the buyer-scoped `listBuyerOrders`. Renders a
 * data table (checkbox multi-select + bulk actions) instead of a plain card
 * list, and a "Needs attention" summary strip above it.
 */
export async function DashboardOrdersPanel({
  searchParams,
  clearFiltersHref = ROUTES.dashboardOrders,
  isAdmin = false,
  hideAttention = false,
}: DashboardOrdersPanelProps) {
  const parsed = dashboardOrderListParamsSchema.safeParse(searchParams);
  if (!parsed.success) {
    return (
      <ErrorState message="Those filters aren't valid. Try clearing your search." />
    );
  }

  const params: OrderListParams = parsed.data;

  let result: PaginatedResult<Order>;
  let attentionCounts: Awaited<ReturnType<typeof getOrderAttentionCounts>>;
  let toPackCount = 0;
  try {
    const owner = isAdmin
      ? null
      : await (async () => {
          const user = await requireSessionUser();
          return { sellerId: user.id, shopId: await getOwnShopId(user.id) };
        })();
    [result, attentionCounts, toPackCount] = await Promise.all([
      listDashboardOrders(params, owner),
      getOrderAttentionCounts(owner?.shopId),
      // The To Pack card is a nicety — a failed count just hides it.
      hideAttention
        ? Promise.resolve(0)
        : getDashboardOrderStatusCounts(owner?.sellerId ?? null, owner?.shopId ?? null)
            .then((counts) => counts.confirmed)
            .catch(() => 0),
    ]);
  } catch {
    return <ErrorState message="We couldn't load orders right now." />;
  }

  const { items, page, totalPages, total } = result;

  // Shipped tab only: courier / tracking / days in transit for this page, in
  // one query. A failure here just hides the extra column — it never blocks
  // the order list itself.
  let shippedInfo: Record<string, ShippedOrderInfo> | undefined;
  if (params.status === ORDER_STATUS.shipped && items.length > 0) {
    try {
      const shipments = await listOrderShipments(items.map((order) => order.id));
      const byOrder = new Map(shipments.map((shipment) => [shipment.orderId, shipment]));
      shippedInfo = Object.fromEntries(
        items.map((order) => {
          const shipment = byOrder.get(order.id);
          return [
            order.id,
            {
              courier: shipment?.courier ?? null,
              trackingNumber: shipment?.trackingNumber ?? null,
              daysInTransit: order.shippedAt ? daysSince(order.shippedAt) : null,
            },
          ];
        }),
      );
    } catch {
      shippedInfo = undefined;
    }
  }

  // Delivered tab only: days since delivery and the buyer's remaining return
  // window. Computed here (not in the client table) so the day counts come
  // from one server clock.
  let deliveredInfo: Record<string, DeliveredOrderInfo> | undefined;
  if (params.status === ORDER_STATUS.delivered && items.length > 0) {
    deliveredInfo = Object.fromEntries(
      items.map((order) => {
        const days = order.deliveredAt ? daysSince(order.deliveredAt) : null;
        return [
          order.id,
          {
            daysSinceDelivery: days,
            returnDaysLeft: days === null ? null : Math.max(0, RETURN_WINDOW_DAYS - days),
          },
        ];
      }),
    );
  }

  return (
    <section className="flex flex-col gap-6">
      {hideAttention ? null : (
        <OrderAttentionStrip
          needsConfirmation={attentionCounts.needsConfirmation}
          toPack={toPackCount}
          codAwaitingCollection={attentionCounts.codAwaitingCollection}
          returnsAwaitingRestock={attentionCounts.returnsAwaitingRestock}
          ordersHref={clearFiltersHref}
          paymentsHref={isAdmin ? ROUTES.adminPayments : ROUTES.sellerPayments}
          returnsHref={isAdmin ? ROUTES.adminReturns : ROUTES.sellerReturns}
        />
      )}
      {params.status === ORDER_STATUS.delivered ? (
        <p className="text-xs text-muted-foreground">
          COD cash is recorded separately — collect it from{" "}
          <Link
            href={isAdmin ? ROUTES.adminPayments : ROUTES.sellerPayments}
            className="font-semibold text-foreground underline"
          >
            Payments
          </Link>
          .
        </p>
      ) : null}
      {params.confirmationRequired ? (
        <p className="text-xs text-muted-foreground">
          Showing pending orders eligible for confirmation (COD or paid online), scoped to {isAdmin ? "the selected shop" : "your shop"}.
        </p>
      ) : null}

      {items.length === 0 ? (
        (() => {
          const filtering = Boolean(
            params.search || params.status || params.paymentMethod || params.dateRange ||
              params.from || params.to || params.confirmationRequired || params.attentionOnly,
          );
          return (
            <EmptyState
              title={filtering ? "No matching orders" : "No orders yet"}
              description={
                filtering
                  ? "Try a different order ID or filter."
                  : "Orders placed against your shop will appear here."
              }
              action={
                filtering ? (
                  <Link
                    href={clearFiltersHref}
                    className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}
                  >
                    Clear filters
                  </Link>
                ) : undefined
              }
            />
          );
        })()
      ) : (
        <>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground"
            aria-live="polite"
          >
            {total} order{total === 1 ? "" : "s"}
          </p>
          <OrdersDataTable orders={items} isAdmin={isAdmin} shippedInfo={shippedInfo} deliveredInfo={deliveredInfo} />
          {totalPages > 1 ? (
            <PaginationControls page={page} totalPages={totalPages} themed />
          ) : null}
        </>
      )}
    </section>
  );
}
