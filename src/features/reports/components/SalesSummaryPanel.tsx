import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/utils/currency";
import { getRefundPipeline, getSalesSummary } from "@/lib/supabase/queries";

import { PaymentSourceBreakdown } from "./PaymentSourceBreakdown";
import type { ReportFilters } from "../types/report.types";

/**
 * KPI grid + confirmed-payment source split for the selected range. Reads the
 * one-row summary RPC (RLS/DEFINER-scoped: seller → own shop, admin → all or
 * one shop). Revenue is net of confirmed refunds (gross paid-order totals minus
 * refunds on those orders); the original orders and payments are never altered.
 */
export async function SalesSummaryPanel({ filters }: { filters: ReportFilters }) {
  let summary;
  try {
    summary = await getSalesSummary(filters.from, filters.to, filters.shopId);
  } catch {
    return <ErrorState message="We couldn't load the sales summary right now." />;
  }

  // Refunds in flight are shown beside the settled figures so "payments received",
  // "refunds pending", "refunds completed" and "net revenue" can be told apart.
  // A failure here must not hide the rest of the summary.
  const pipeline = await getRefundPipeline(
    { from: filters.from, to: filters.to },
    filters.shopId,
  ).catch(() => null);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Net revenue"
          value={formatCurrency(summary.revenueCents)}
          hint={`${formatCurrency(summary.grossRevenueCents)} gross − ${formatCurrency(summary.refundsCents)} refunds`}
        />
        <StatCard label="Orders placed" value={summary.totalOrders} />
        <StatCard
          label="Paid orders"
          value={summary.paidOrders}
          hint={`${summary.pendingPaymentOrders} awaiting payment`}
        />
        <StatCard
          label="Avg order value"
          value={formatCurrency(summary.avgOrderValueCents)}
          hint="Across paid orders"
        />
        <StatCard label="Units sold" value={summary.unitsSold} />
        <StatCard label="Cancelled" value={summary.cancelledOrders} />
        <StatCard
          label="Refunds"
          value={formatCurrency(summary.refundsCents)}
          hint={`${summary.refundedOrders} completed refund${summary.refundedOrders === 1 ? "" : "s"}`}
        />
        {pipeline ? (
          <StatCard
            label="Refunds pending"
            value={formatCurrency(pipeline.pendingCents)}
            hint={
              pipeline.attentionCount > 0
                ? `${pipeline.pendingCount} in progress · ${pipeline.attentionCount} need attention (${formatCurrency(pipeline.attentionCents)})`
                : `${pipeline.pendingCount} in progress — still counted in net revenue until confirmed`
            }
          />
        ) : null}
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
