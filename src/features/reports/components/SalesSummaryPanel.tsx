import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/utils/currency";
import { getRefundPipeline, getSalesSummary } from "@/lib/supabase/queries";

import { PaymentSourceBreakdown } from "./PaymentSourceBreakdown";
import type { ReportFilters, SalesSummary } from "../types/report.types";
import { getPreviousPeriod } from "../utils/report-range";

/** Whole-number percentage of `part` in `whole`; 0 when there is nothing to divide by. */
function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";
}

/** A KPI value with its change versus the previous equal period (omitted when that read failed). */
function withDelta(value: string | number, current: number, previous: SalesSummary | null, pick: (s: SalesSummary) => number, invert = false) {
  if (!previous) return value;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-2">
      {value}
      <DeltaBadge current={current} previous={pick(previous)} invert={invert} />
    </span>
  );
}

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

  // The equal-length period before the range powers the change chips. A failure here
  // only drops the chips; it must not hide the summary.
  const prior = getPreviousPeriod(filters.from, filters.to);
  const previous = await getSalesSummary(prior.from, prior.to, filters.shopId).catch(() => null);

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
          value={withDelta(formatCurrency(summary.revenueCents), summary.revenueCents, previous, (s) => s.revenueCents)}
          hint={`${formatCurrency(summary.grossRevenueCents)} gross − ${formatCurrency(summary.refundsCents)} refunds`}
        />
        <StatCard
          label="Orders placed"
          value={withDelta(summary.totalOrders, summary.totalOrders, previous, (s) => s.totalOrders)}
        />
        <StatCard
          label="Paid orders"
          value={withDelta(summary.paidOrders, summary.paidOrders, previous, (s) => s.paidOrders)}
          hint={`${summary.pendingPaymentOrders} awaiting payment`}
        />
        <StatCard
          label="Avg order value"
          value={withDelta(formatCurrency(summary.avgOrderValueCents), summary.avgOrderValueCents, previous, (s) => s.avgOrderValueCents)}
          hint="Across paid orders"
        />
        <StatCard
          label="Units sold"
          value={withDelta(summary.unitsSold, summary.unitsSold, previous, (s) => s.unitsSold)}
        />
        <StatCard
          label="Cancelled"
          value={withDelta(summary.cancelledOrders, summary.cancelledOrders, previous, (s) => s.cancelledOrders, true)}
          hint={`${percent(summary.cancelledOrders, summary.totalOrders)} of orders placed`}
        />
        <StatCard
          label="Refunds"
          value={withDelta(formatCurrency(summary.refundsCents), summary.refundsCents, previous, (s) => s.refundsCents, true)}
          hint={`${summary.refundedOrders} completed refund${summary.refundedOrders === 1 ? "" : "s"} · ${percent(summary.refundedOrders, summary.paidOrders)} of paid orders`}
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
          <PaymentSourceBreakdown filters={filters} grossCents={summary.grossRevenueCents} />
        </CardContent>
      </Card>
    </div>
  );
}
