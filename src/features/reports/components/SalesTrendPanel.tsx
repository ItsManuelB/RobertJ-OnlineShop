import { TrendChart, type TrendChartPoint } from "@/components/charts/TrendChart";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { getSalesTimeseries } from "@/lib/supabase/queries";

import { GRANULARITY_LABELS } from "../constants/report.constants";
import type { ReportFilters, SalesTrendPoint } from "../types/report.types";
import { fillTrendGaps, formatBucketLabel } from "../utils/report-range";

/**
 * Revenue and order-volume trend over the range, on the single placed_at /
 * Manila axis. Gaps are filled with zeros so the line is continuous.
 */
export async function SalesTrendPanel({ filters }: { filters: ReportFilters }) {
  let series: SalesTrendPoint[];
  try {
    series = await getSalesTimeseries(
      filters.from,
      filters.to,
      filters.granularity,
      filters.shopId,
    );
  } catch {
    return <ErrorState message="We couldn't load the sales trend right now." />;
  }

  const filled = fillTrendGaps(series, filters);

  const revenuePoints: TrendChartPoint[] = filled.map((p) => ({
    label: formatBucketLabel(p.bucket, filters.granularity),
    value: p.revenueCents,
    valueLabel: formatCurrency(p.revenueCents),
  }));
  const orderPoints: TrendChartPoint[] = filled.map((p) => ({
    label: formatBucketLabel(p.bucket, filters.granularity),
    value: p.orderCount,
    valueLabel: `${p.orderCount} order${p.orderCount === 1 ? "" : "s"}`,
  }));

  const granularityLabel = GRANULARITY_LABELS[filters.granularity].toLowerCase();

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-5">
        <div className="flex flex-col gap-6 md:flex-row">
          <section className="flex-1">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Revenue ({granularityLabel})
            </p>
            <TrendChart points={revenuePoints} ariaLabel={`Revenue per ${granularityLabel} bucket`} />
          </section>
          <section className="flex-1">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Orders ({granularityLabel})
            </p>
            <TrendChart points={orderPoints} ariaLabel={`Orders per ${granularityLabel} bucket`} />
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
