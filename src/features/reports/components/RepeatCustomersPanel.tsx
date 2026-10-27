import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentSellerOwner, getRepeatCustomerRate } from "@/lib/supabase/queries";

import type { ReportFilters } from "../types/report.types";

/**
 * Returning- vs. new-buyer split for the range. A seller sees their own shop; an admin sees the
 * whole marketplace, or one shop when `filters.shopId` is set.
 */
export async function RepeatCustomersPanel({
  filters,
  audience = "seller",
}: {
  filters: Pick<ReportFilters, "from" | "to"> & { shopId?: string | null };
  audience?: "seller" | "admin";
}) {
  const isAdmin = audience === "admin";
  let stats: Awaited<ReturnType<typeof getRepeatCustomerRate>>;
  try {
    stats = await getRepeatCustomerRate(filters.from, filters.to, isAdmin ? (filters.shopId ? { sellerId: "", shopId: filters.shopId } : null) : await getCurrentSellerOwner());
  } catch {
    return <ErrorState message="We couldn't load repeat customer stats right now." />;
  }

  return (
    <Card>
      <CardContent className="flex flex-col p-5">
        <h3 className="mb-1 text-sm font-bold text-foreground">Repeat customers</h3>

        {stats.totalOrders === 0 ? (
          <EmptyState title="No orders in this range" description="Repeat-buyer stats will appear once orders come in." />
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-foreground">{stats.ratePercent}%</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              of this period&apos;s orders were placed by a returning buyer
            </p>
            <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${stats.ratePercent}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>{stats.returningOrders} returning</span>
              <span>{stats.newOrders} new</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Counts every order placed in these dates. A buyer is &quot;returning&quot; if they have ordered from {isAdmin ? (filters.shopId ? "this shop" : "the marketplace") : "your shop"} more than once, ever.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
