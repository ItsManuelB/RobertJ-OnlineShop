import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { StatCard } from "@/components/ui/stat-card";
import type { ReportFilters } from "@/features/reports/types/report.types";
import { getPreviousPeriod } from "@/features/reports/utils/report-range";
import { formatCurrency } from "@/lib/utils/currency";
import { getSalesSummary } from "@/lib/supabase/queries";
import { PaymentSourceBreakdown } from "@/features/reports/components/PaymentSourceBreakdown";

/**
 * Seller-only counterpart to `SalesSummaryPanel` — same six KPI tiles and
 * payment-source split, plus a period-over-period delta chip on the four
 * metrics where a trend comparison is meaningful (Revenue, Orders placed,
 * Paid orders, Units sold — not Avg order value or Cancelled, which are
 * ratios/edge counts a raw +/-% would misrepresent). Kept as a separate
 * component rather than added to the shared `SalesSummaryPanel` so the
 * Admin Portal's Reports/Dashboard — which render that same shared panel —
 * are completely unaffected.
 */
export async function SellerSalesSummaryPanel({ filters }: { filters: ReportFilters }) {
  const previous = getPreviousPeriod(filters.from, filters.to);

  let summary;
  let previousSummary;
  try {
    [summary, previousSummary] = await Promise.all([
      getSalesSummary(filters.from, filters.to, filters.shopId),
      getSalesSummary(previous.from, previous.to, filters.shopId),
    ]);
  } catch {
    return <ErrorState message="We couldn't load the sales summary right now." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Revenue"
          value={
            <span className="inline-flex items-baseline gap-2">
              {formatCurrency(summary.revenueCents)}
              <DeltaBadge current={summary.revenueCents} previous={previousSummary.revenueCents} />
            </span>
          }
          hint="Net of refunds, vs. previous period"
        />
        <StatCard
          label="Orders placed"
          value={
            <span className="inline-flex items-baseline gap-2">
              {summary.totalOrders}
              <DeltaBadge current={summary.totalOrders} previous={previousSummary.totalOrders} />
            </span>
          }
        />
        <StatCard
          label="Paid orders"
          value={
            <span className="inline-flex items-baseline gap-2">
              {summary.paidOrders}
              <DeltaBadge current={summary.paidOrders} previous={previousSummary.paidOrders} />
            </span>
          }
          hint={`${summary.pendingPaymentOrders} awaiting payment`}
        />
        <StatCard label="Avg order value" value={formatCurrency(summary.avgOrderValueCents)} hint="Across paid orders" />
        <StatCard
          label="Units sold"
          value={
            <span className="inline-flex items-baseline gap-2">
              {summary.unitsSold}
              <DeltaBadge current={summary.unitsSold} previous={previousSummary.unitsSold} />
            </span>
          }
        />
        <StatCard label="Cancelled" value={summary.cancelledOrders} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Payment source (paid orders)
          </p>
          <PaymentSourceBreakdown filters={filters} />
        </CardContent>
      </Card>
    </div>
  );
}
