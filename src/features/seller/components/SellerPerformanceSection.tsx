import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { ROUTES } from "@/constants/routes";
import { getPreviousPeriod } from "@/features/reports/utils/report-range";
import { formatCurrency } from "@/lib/utils/currency";
import { getSalesSummary } from "@/lib/supabase/queries";

import { MetricInfoButton } from "./MetricInfoButton";

export interface SellerPerformanceSectionProps {
  from: string;
  to: string;
}

function periodLabel(from: string, to: string): string {
  const fmt = (iso: string, year: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(year ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  return from === to ? fmt(from, true) : `${fmt(from, false)} – ${fmt(to, true)}`;
}

/**
 * Gross sales, confirmed refunds, net sales and orders placed for the
 * selected Manila date range, plus the previous equal period for the delta
 * chips. Both calls hit `report_sales_summary`, which scopes to the signed-in
 * seller's shop and sums each shop's own order totals (never the combined
 * checkout payment), so multi-shop orders are credited per shop.
 */
export async function SellerPerformanceSection({ from, to }: SellerPerformanceSectionProps) {
  const previous = getPreviousPeriod(from, to);

  let current: Awaited<ReturnType<typeof getSalesSummary>>;
  let prior: Awaited<ReturnType<typeof getSalesSummary>>;
  try {
    [current, prior] = await Promise.all([
      getSalesSummary(from, to, null),
      getSalesSummary(previous.from, previous.to, null),
    ]);
  } catch {
    return <ErrorState message="We couldn't load your shop's performance right now. Your tasks, orders and stock are unaffected." />;
  }

  const label = periodLabel(from, to);
  const reportsHref = `${ROUTES.sellerReports}?from=${from}&to=${to}`;
  const ordersHref = `${ROUTES.sellerOrders}?from=${from}&to=${to}`;
  const refundsHref = `${ROUTES.sellerReturns}?tab=closed`;
  const money = formatCurrency;

  const secondary: Array<{ label: string; value: string }> = [
    { label: "Average order value", value: money(current.avgOrderValueCents) },
    { label: "Units sold (paid orders)", value: String(current.unitsSold) },
    { label: "Awaiting payment", value: `${current.pendingPaymentOrders} order${current.pendingPaymentOrders === 1 ? "" : "s"}` },
    { label: "Cancelled", value: `${current.cancelledOrders} order${current.cancelledOrders === 1 ? "" : "s"}` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Gross sales"
          href={reportsHref}
          value={
            <span className="inline-flex flex-wrap items-baseline gap-2">
              {money(current.grossRevenueCents)}
              <DeltaBadge current={current.grossRevenueCents} previous={prior.grossRevenueCents} />
            </span>
          }
          hint={`${current.paidOrders} paid order${current.paidOrders === 1 ? "" : "s"}`}
          action={
            <MetricInfoButton
              metric="gross"
              calculation={`${money(current.grossRevenueCents)} from ${current.paidOrders} paid order${current.paidOrders === 1 ? "" : "s"}`}
              periodLabel={label}
              drillHref={reportsHref}
              drillLabel="Open in Reports"
            />
          }
        />
        <StatCard
          label="Confirmed refunds"
          href={refundsHref}
          value={
            <span className="inline-flex flex-wrap items-baseline gap-2">
              {current.refundsCents > 0 ? "−" : ""}
              {money(current.refundsCents)}
              <DeltaBadge current={current.refundsCents} previous={prior.refundsCents} invert />
            </span>
          }
          hint={`${current.refundedOrders} order${current.refundedOrders === 1 ? "" : "s"} refunded`}
          action={
            <MetricInfoButton
              metric="refunds"
              calculation={`−${money(current.refundsCents)} on ${current.refundedOrders} order${current.refundedOrders === 1 ? "" : "s"}`}
              periodLabel={label}
              drillHref={refundsHref}
              drillLabel="Open returns"
            />
          }
        />
        <StatCard
          emphasis
          label="Net sales"
          href={reportsHref}
          value={
            <span className="inline-flex flex-wrap items-baseline gap-2">
              {money(current.revenueCents)}
              <DeltaBadge current={current.revenueCents} previous={prior.revenueCents} />
            </span>
          }
          hint="Gross minus confirmed refunds"
          action={
            <MetricInfoButton
              metric="net"
              calculation={`${money(current.grossRevenueCents)} − ${money(current.refundsCents)} = ${money(current.revenueCents)}`}
              periodLabel={label}
              drillHref={reportsHref}
              drillLabel="Open in Reports"
            />
          }
        />
        <StatCard
          label="Orders placed"
          href={ordersHref}
          value={
            <span className="inline-flex flex-wrap items-baseline gap-2">
              {current.totalOrders}
              <DeltaBadge current={current.totalOrders} previous={prior.totalOrders} />
            </span>
          }
          hint={`${current.paidOrders} paid · ${current.cancelledOrders} cancelled`}
          action={
            <MetricInfoButton
              metric="orders"
              calculation={`${current.totalOrders} placed · ${current.paidOrders} paid · ${current.cancelledOrders} cancelled · ${current.pendingPaymentOrders} awaiting payment`}
              periodLabel={label}
              drillHref={ordersHref}
              drillLabel="View these orders"
            />
          }
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-muted px-4 py-3 sm:grid-cols-4">
        {secondary.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-col">
            <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
            <dd className="font-semibold tabular-nums text-foreground">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function SellerPerformanceSectionSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status">
      <span className="sr-only">Loading shop performance</span>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-2 p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
    </div>
  );
}
