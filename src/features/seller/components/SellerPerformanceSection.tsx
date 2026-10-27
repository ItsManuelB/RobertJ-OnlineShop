import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { ROUTES } from "@/constants/routes";
import { getPreviousPeriod } from "@/features/reports/utils/report-range";
import { formatCurrency } from "@/lib/utils/currency";
import { getRefundPipeline, getSalesSummary } from "@/lib/supabase/queries";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

import { MetricInfoButton } from "./MetricInfoButton";

export interface SellerPerformanceSectionProps {
  from: string;
  to: string;
  /**
   * "reports" is the Reports page's overview: Gross and Net jump to the
   * sections below instead of linking back to Reports, the strip adds paid
   * orders and refunds in progress, and a prompt appears when refunds are pending.
   */
  variant?: "dashboard" | "reports";
  /** Whose numbers these are. Admin links to the admin pages; the seller scope is enforced by the RPCs. */
  audience?: "seller" | "admin";
  /** Admin only: narrow the numbers to one shop. Null/omitted = the whole marketplace. */
  shopId?: string | null;
}

const AUDIENCE_LINKS = {
  seller: {
    reports: ROUTES.sellerReports,
    orders: ROUTES.sellerOrders,
    refunds: `${ROUTES.sellerReturns}?tab=closed`,
    inProgress: `${ROUTES.sellerReturns}?tab=action`,
    error: "We couldn't load your shop's performance right now. Your tasks, orders and stock are unaffected.",
    loading: "Loading shop performance",
  },
  admin: {
    reports: ROUTES.adminReports,
    orders: ROUTES.adminOrders,
    refunds: `${ROUTES.adminReturns}?tab=closed`,
    inProgress: `${ROUTES.adminReturns}?tab=progress`,
    error: "We couldn't load the marketplace performance right now. Your attention list, orders and stock are unaffected.",
    loading: "Loading marketplace performance",
  },
} as const;

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
export async function SellerPerformanceSection({
  from,
  to,
  variant = "dashboard",
  audience = "seller",
  shopId = null,
}: SellerPerformanceSectionProps) {
  const links = AUDIENCE_LINKS[audience];
  const previous = getPreviousPeriod(from, to);

  const isReports = variant === "reports";
  let current: Awaited<ReturnType<typeof getSalesSummary>>;
  let prior: Awaited<ReturnType<typeof getSalesSummary>>;
  let pipeline: Awaited<ReturnType<typeof getRefundPipeline>> | null = null;
  try {
    [current, prior, pipeline] = await Promise.all([
      getSalesSummary(from, to, shopId),
      getSalesSummary(previous.from, previous.to, shopId),
      // Refunds in progress are not date-bound: they are money on its way back right now.
      isReports ? getRefundPipeline({ from, to }, shopId).catch(() => null) : Promise.resolve(null),
    ]);
  } catch {
    return <ErrorState message={links.error} />;
  }

  const label = periodLabel(from, to);
  const reportsHref = `${links.reports}?from=${from}&to=${to}`;
  const grossHref = isReports ? "#sources" : reportsHref;
  const netHref = isReports ? "#trend" : reportsHref;
  const ordersHref = `${links.orders}?from=${from}&to=${to}`;
  const refundsHref = links.refunds;
  const money = formatCurrency;

  const inProgressCount = pipeline ? pipeline.pendingCount + pipeline.attentionCount : 0;
  const inProgressCents = pipeline ? pipeline.pendingCents + pipeline.attentionCents : 0;
  const secondary: Array<{ label: string; value: string }> = [
    ...(isReports ? [{ label: "Paid orders", value: String(current.paidOrders) }] : []),
    { label: "Average order value", value: money(current.avgOrderValueCents) },
    { label: "Units sold (paid orders)", value: String(current.unitsSold) },
    { label: "Awaiting payment", value: `${current.pendingPaymentOrders} order${current.pendingPaymentOrders === 1 ? "" : "s"}` },
    { label: "Cancelled", value: `${current.cancelledOrders} order${current.cancelledOrders === 1 ? "" : "s"}` },
    ...(isReports && pipeline
      ? [{ label: "Refunds in progress", value: `${money(inProgressCents)} · ${inProgressCount}` }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Gross sales"
          href={grossHref}
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
              drillHref={grossHref}
              drillLabel={isReports ? "See payment source" : "Open in Reports"}
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
          href={netHref}
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
              drillHref={netHref}
              drillLabel={isReports ? "See the trend" : "Open in Reports"}
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

      <dl className={`grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-muted px-4 py-3 ${isReports ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
        {secondary.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-col">
            <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
            <dd className="font-semibold tabular-nums text-foreground">{item.value}</dd>
          </div>
        ))}
      </dl>

      {isReports && pipeline && inProgressCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-sm text-foreground">
            <strong className="font-semibold">
              {inProgressCount} refund{inProgressCount === 1 ? "" : "s"} in progress ({money(inProgressCents)}).
            </strong>{" "}
            {pipeline.attentionCount > 0
              ? `${pipeline.attentionCount} need${pipeline.attentionCount === 1 ? "s" : ""} attention (${money(pipeline.attentionCents)}). `
              : ""}
            In-progress refunds stay in Net sales until they are confirmed.
          </p>
          <Link href={links.inProgress} className={buttonVariants({ variant: "outline", size: "rjSm" })}>
            Open returns
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function SellerPerformanceSectionSkeleton({ audience = "seller" }: { audience?: "seller" | "admin" }) {
  return (
    <div className="flex flex-col gap-4" role="status">
      <span className="sr-only">{AUDIENCE_LINKS[audience].loading}</span>
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
