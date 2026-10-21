import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/utils/currency";
import { getSalesSummary } from "@/lib/supabase/queries";

import { PaymentSourceBreakdown } from "./PaymentSourceBreakdown";
import type { ReportFilters } from "../types/report.types";

/**
 * KPI grid + confirmed-payment source split for the selected range. Reads the
 * one-row summary RPC (RLS/DEFINER-scoped: seller → own shop, admin → all or
 * one shop). Revenue counts only orders whose payment_status='paid'.
 */
export async function SalesSummaryPanel({ filters }: { filters: ReportFilters }) {
  let summary;
  try {
    summary = await getSalesSummary(filters.from, filters.to, filters.shopId);
  } catch {
    return <ErrorState message="We couldn't load the sales summary right now." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Revenue"
          value={formatCurrency(summary.revenueCents)}
          hint="Paid orders only"
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
