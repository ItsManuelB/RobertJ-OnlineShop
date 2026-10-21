import Link from "next/link";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { PaginationControls } from "@/features/products/components/PaginationControls";
import { OrderAttentionStrip } from "@/features/orders/components/OrderAttentionStrip";
import { OrdersDataTable } from "@/features/orders/components/OrdersDataTable";
import { dashboardOrderListParamsSchema } from "@/features/orders/schemas/order.schema";
import type { Order, OrderListParams } from "@/features/orders/types/order.types";
import { cn } from "@/lib/utils/cn";
import {
  getOrderAttentionCounts,
  getOwnShopId,
  listDashboardOrders,
  requireSessionUser,
} from "@/lib/supabase/queries";
import type { PaginatedResult } from "@/types/pagination.types";

export interface DashboardOrdersPanelProps {
  searchParams: Record<string, string | string[] | undefined>;
  /** Overridable for the Admin Portal, which links into `/admin/orders` instead of `/dashboard/orders`. */
  clearFiltersHref?: string;
  isAdmin?: boolean;
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
  try {
    const owner = isAdmin
      ? null
      : await (async () => {
          const user = await requireSessionUser();
          return { sellerId: user.id, shopId: await getOwnShopId(user.id) };
        })();
    [result, attentionCounts] = await Promise.all([
      listDashboardOrders(params, owner),
      getOrderAttentionCounts(owner?.shopId),
    ]);
  } catch {
    return <ErrorState message="We couldn't load orders right now." />;
  }

  const { items, page, totalPages, total } = result;

  return (
    <section className="flex flex-col gap-6">
      <OrderAttentionStrip
        needsConfirmation={attentionCounts.needsConfirmation}
        codAwaitingCollection={attentionCounts.codAwaitingCollection}
        returnsAwaitingRestock={attentionCounts.returnsAwaitingRestock}
        returnsHref={isAdmin ? ROUTES.adminReturns : ROUTES.sellerOrders}
      />
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
          <OrdersDataTable orders={items} isAdmin={isAdmin} />
          {totalPages > 1 ? (
            <PaginationControls page={page} totalPages={totalPages} themed />
          ) : null}
        </>
      )}
    </section>
  );
}
