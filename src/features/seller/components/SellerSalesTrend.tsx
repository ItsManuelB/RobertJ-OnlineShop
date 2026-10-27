import Link from "next/link";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReportGranularity, SalesTrendPoint } from "@/features/reports/types/report.types";
import { fillTrendGaps } from "@/features/reports/utils/report-range";
import { getSalesTimeseries } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils/cn";

import { SellerSalesTrendChart, type SellerTrendBucket } from "./SellerSalesTrendChart";

const GRANULARITY_LABEL: Record<ReportGranularity, string> = { day: "Daily", week: "Weekly", month: "Monthly" };

/** Daily up to 31 days, weekly up to 120, monthly beyond — keeps the chart readable at any range. */
export function pickGranularity(from: string, to: string): ReportGranularity {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return days <= 31 ? "day" : days <= 120 ? "week" : "month";
}

function shortDate(bucket: string, granularity: ReportGranularity): string {
  return new Date(`${bucket}T00:00:00Z`).toLocaleDateString(
    "en-US",
    granularity === "month"
      ? { month: "short", timeZone: "UTC" }
      : { month: "short", day: "numeric", timeZone: "UTC" },
  );
}

export type TrendIntervalChoice = "auto" | ReportGranularity;

const INTERVAL_CHOICES: Array<{ id: TrendIntervalChoice; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
];

/**
 * The Seller Dashboard's trend chart: net sales (gross minus confirmed
 * refunds, from `report_sales_timeseries`) or orders placed, switchable.
 * The Reports page passes `interval` and `intervalHrefs` to add an
 * Auto/Daily/Weekly/Monthly switch (links, so the choice lives in the URL).
 * Admin pages reuse it: `shopId` narrows to one shop (null = all shops; sellers
 * are always scoped to their own shop by the RPC).
 */
export async function SellerSalesTrend({
  from,
  to,
  interval = "auto",
  intervalHrefs,
  shopId = null,
}: {
  from: string;
  to: string;
  shopId?: string | null;
  interval?: TrendIntervalChoice;
  intervalHrefs?: Record<TrendIntervalChoice, string>;
}) {
  const granularity = interval === "auto" ? pickGranularity(from, to) : interval;

  let series: SalesTrendPoint[];
  try {
    series = await getSalesTimeseries(from, to, granularity, shopId);
  } catch {
    return <ErrorState message="We couldn't load the sales trend right now." />;
  }

  const buckets: SellerTrendBucket[] = fillTrendGaps(series, { from, to, granularity, shopId }).map((p) => ({
    label: granularity === "week" ? `Week of ${shortDate(p.bucket, granularity)}` : shortDate(p.bucket, granularity),
    tick: shortDate(p.bucket, granularity),
    netCents: p.revenueCents,
    orders: p.orderCount,
  }));

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        {intervalHrefs ? (
          <nav aria-label="Trend interval" className="flex flex-wrap items-center gap-1 self-end rounded-lg bg-muted p-1">
            {INTERVAL_CHOICES.map((choice) => (
              <Link
                key={choice.id}
                href={intervalHrefs[choice.id]}
                scroll={false}
                aria-current={interval === choice.id ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-8 items-center rounded-md px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  interval === choice.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {choice.label}
              </Link>
            ))}
          </nav>
        ) : null}
        <SellerSalesTrendChart
          buckets={buckets}
          granularityLabel={GRANULARITY_LABEL[granularity]}
          unit={granularity}
        />
      </CardContent>
    </Card>
  );
}

export function SellerSalesTrendSkeleton() {
  return (
    <Card>
      <CardContent className="p-5" role="status">
        <span className="sr-only">Loading sales trend</span>
        <Skeleton className="h-52 w-full" />
      </CardContent>
    </Card>
  );
}
