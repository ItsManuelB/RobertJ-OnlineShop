import Link from "next/link";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { getOrderStatusLabel } from "@/features/orders/constants/order.constants";
import { PaymentSourceBreakdown } from "@/features/reports/components/PaymentSourceBreakdown";
import type { ReportFilters } from "@/features/reports/types/report.types";
import { getOrderStatusBreakdown, getSalesSummary } from "@/lib/supabase/queries";

/** Payment-source split for the range, with a check against the Gross sales tile. Anchor target for the Gross tile. */
export async function SellerReportPaymentSource({ filters }: { filters: ReportFilters }) {
  let grossCents: number | undefined;
  try {
    grossCents = (await getSalesSummary(filters.from, filters.to, null)).grossRevenueCents;
  } catch {
    grossCents = undefined; // the breakdown still renders; it just can't show the check line
  }

  return (
    <Card id="sources" className="scroll-mt-24">
      <CardContent className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold text-foreground">Payment source</h3>
        <PaymentSourceBreakdown filters={filters} grossCents={grossCents} />
      </CardContent>
    </Card>
  );
}

/** Order counts per fulfilment status; each row opens the Orders list for the same dates and status. */
export async function SellerReportStatus({ filters }: { filters: ReportFilters }) {
  let breakdown: Awaited<ReturnType<typeof getOrderStatusBreakdown>>;
  try {
    breakdown = await getOrderStatusBreakdown(filters.from, filters.to, null);
  } catch {
    return <ErrorState message="We couldn't load order statuses right now." />;
  }

  const max = breakdown.reduce((m, row) => Math.max(m, row.orderCount), 0);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold text-foreground">Orders by status</h3>
          <p className="text-xs text-muted-foreground">Select a status to open those orders for these dates.</p>
        </div>
        {breakdown.length === 0 ? (
          <EmptyState title="No orders in this period" description="Statuses will break down here once orders are placed." />
        ) : (
          <ul className="flex flex-col gap-1">
            {breakdown.map((row) => {
              const label = getOrderStatusLabel(row.status);
              return (
                <li key={row.status}>
                  <Link
                    href={`${ROUTES.sellerOrders}?status=${row.status}&from=${filters.from}&to=${filters.to}`}
                    aria-label={`${label}: ${row.orderCount} order${row.orderCount === 1 ? "" : "s"}. Open these orders.`}
                    className="grid grid-cols-[6rem_minmax(0,1fr)_2.5rem] items-center gap-3 rounded-lg px-1 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <span className="font-medium text-foreground">{label}</span>
                    <span aria-hidden="true" className="block h-2.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${max ? Math.round((row.orderCount / max) * 100) : 0}%` }} />
                    </span>
                    <span className="text-right font-semibold tabular-nums text-foreground">{row.orderCount}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
