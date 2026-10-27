import Link from "next/link";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { ORDER_STATUS } from "@/constants/status";
import { getOrderStatusLabel } from "@/features/orders/constants/order.constants";
import { getDashboardOrderStatusCounts } from "@/lib/supabase/queries";

/** The statuses an order passes through before it reaches the customer. */
const PIPELINE_STATUSES = [
  ORDER_STATUS.pending,
  ORDER_STATUS.confirmed,
  ORDER_STATUS.processing,
  ORDER_STATUS.shipped,
] as const;

/**
 * Orders by status right now (never date filtered), so a growing bar shows a backlog at
 * that step. Each row opens the Orders list on that status.
 */
export async function AdminOrderPipeline() {
  let counts: Awaited<ReturnType<typeof getDashboardOrderStatusCounts>>;
  try {
    counts = await getDashboardOrderStatusCounts(null, null);
  } catch {
    return <ErrorState message="We couldn't load the order pipeline right now." />;
  }

  const max = PIPELINE_STATUSES.reduce((m, status) => Math.max(m, counts[status]), 0);

  return (
    <Card className="border-border">
      <CardHeader className="space-y-0">
        <CardTitle className="text-sm font-semibold">Order pipeline</CardTitle>
        <p className="text-xs text-muted-foreground">Open orders right now, by step.</p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1">
          {PIPELINE_STATUSES.map((status) => (
            <li key={status}>
              <Link
                href={`${ROUTES.adminOrders}?status=${status}`}
                aria-label={`${getOrderStatusLabel(status)}: ${counts[status]} order${counts[status] === 1 ? "" : "s"}. Open these orders.`}
                className="grid grid-cols-[5.5rem_minmax(0,1fr)_2rem] items-center gap-3 rounded-lg px-1 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="font-medium text-foreground">{getOrderStatusLabel(status)}</span>
                <span aria-hidden="true" className="block h-2.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${max ? Math.round((counts[status] / max) * 100) : 0}%` }}
                  />
                </span>
                <span className="text-right font-semibold tabular-nums text-foreground">{counts[status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function AdminOrderPipelineSkeleton() {
  return (
    <Card className="border-border">
      <CardContent className="flex flex-col gap-3 p-5" role="status">
        <span className="sr-only">Loading the order pipeline</span>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-7 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
