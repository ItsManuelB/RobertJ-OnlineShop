import { BarChart3 } from "lucide-react";

import { getPreviousPeriod } from "@/features/reports/utils/report-range";
import { getSalesSummary } from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/utils/currency";

export interface SellerReportSummaryLineProps {
  from: string;
  to: string;
  /** Admin only: narrow to one shop. */
  shopId?: string | null;
}

function changeText(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "no sales in either period" : "with no sales in the previous period";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "unchanged from the previous period";
  return `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on the previous period`;
}

/**
 * One sentence that states what the overview numbers already show: net sales,
 * how that compares with the previous equal period, and the order count. A
 * failed read renders nothing — the numbers below carry the same facts.
 */
export async function SellerReportSummaryLine({ from, to, shopId = null }: SellerReportSummaryLineProps) {
  const previous = getPreviousPeriod(from, to);
  let current: Awaited<ReturnType<typeof getSalesSummary>>;
  let prior: Awaited<ReturnType<typeof getSalesSummary>>;
  try {
    [current, prior] = await Promise.all([
      getSalesSummary(from, to, shopId),
      getSalesSummary(previous.from, previous.to, shopId),
    ]);
  } catch {
    return null;
  }

  if (current.totalOrders === 0 && prior.totalOrders === 0) return null;

  const orderDiff = current.totalOrders - prior.totalOrders;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border border-l-4 border-l-primary bg-card px-4 py-3 text-sm text-foreground">
      <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p>
        <span className="font-semibold">
          Net sales were {formatCurrency(current.revenueCents)}, {changeText(current.revenueCents, prior.revenueCents)},
        </span>{" "}
        from {current.totalOrders} order{current.totalOrders === 1 ? "" : "s"}
        {orderDiff === 0 ? "" : ` (${Math.abs(orderDiff)} ${orderDiff > 0 ? "more" : "fewer"})`}.
        {current.refundsCents > 0 ? ` Refunds took ${formatCurrency(current.refundsCents)} of gross sales.` : ""}
      </p>
    </div>
  );
}
