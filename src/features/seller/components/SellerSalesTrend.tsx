import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReportGranularity, SalesTrendPoint } from "@/features/reports/types/report.types";
import { fillTrendGaps } from "@/features/reports/utils/report-range";
import { getSalesTimeseries } from "@/lib/supabase/queries";

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

/**
 * The Seller Dashboard's trend chart: net sales (gross minus confirmed
 * refunds, from `report_sales_timeseries`) or orders placed, switchable.
 * Reports keeps its own two-chart `SalesTrendPanel`.
 */
export async function SellerSalesTrend({ from, to }: { from: string; to: string }) {
  const granularity = pickGranularity(from, to);

  let series: SalesTrendPoint[];
  try {
    series = await getSalesTimeseries(from, to, granularity, null);
  } catch {
    return <ErrorState message="We couldn't load the sales trend right now." />;
  }

  const buckets: SellerTrendBucket[] = fillTrendGaps(series, { from, to, granularity, shopId: null }).map((p) => ({
    label: granularity === "week" ? `Week of ${shortDate(p.bucket, granularity)}` : shortDate(p.bucket, granularity),
    tick: shortDate(p.bucket, granularity),
    netCents: p.revenueCents,
    orders: p.orderCount,
  }));

  return (
    <Card>
      <CardContent className="p-5">
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
