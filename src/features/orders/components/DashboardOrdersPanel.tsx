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
import { getOrderAttentionCounts, listDashboardOrders } from "@/lib/supabase/queries";
import type { PaginatedResult } from "@/types/pagination.types";

export interface DashboardOrdersPanelProps {
  searchParams: Record<string, string | string[] | undefined>;
  /** Overridable for the Admin Portal, which links into `/admin/orders` instead of `/dashboard/orders`. */
  clearFiltersHref?: string;
  isAdmin?: boolean;
}

/**
 * Dashboard equivalent of `OrderListSection` — same composition, but reads
 * via `listDashboardOrders()` (no manual seller/admin filter; RLS is the
 * boundary) instead of the buyer-scoped `listBuyerOrders`. Renders a data
 * table (checkbox multi-select + bulk actions) instead of a plain card
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
    [result, attentionCounts] = await Promise.all([
      listDashboardOrders(params),
      getOrderAttentionCounts(),
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

      {items.length === 0 ? (
        (() => {
          const filtering = Boolean(
            params.search || params.status || params.paymentMethod || params.dateRange || params.attentionOnly,
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
