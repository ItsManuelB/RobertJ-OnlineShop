import { TrendChart, type TrendChartPoint } from "@/components/charts/TrendChart";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { getSalesByShop, getSalesTimeseriesByShop } from "@/lib/supabase/queries";

import { GRANULARITY_LABELS } from "../constants/report.constants";
import type { ReportFilters, ShopTrendPoint } from "../types/report.types";
import { fillTrendGaps, formatBucketLabel } from "../utils/report-range";

/**
 * Net-sales trend for each shop, one chart per shop so shops can be read side
 * by side. Shops with no orders in the range are skipped. Each chart is scaled
 * to its own peak, so compare the figures in the captions, not the line heights.
 */
export async function ShopTrendPanel({ filters }: { filters: ReportFilters }) {
  let points: ShopTrendPoint[];
  let shops: Awaited<ReturnType<typeof getSalesByShop>>;
  try {
    [points, shops] = await Promise.all([
      getSalesTimeseriesByShop(filters.from, filters.to, filters.granularity),
      getSalesByShop(filters.from, filters.to),
    ]);
  } catch {
    return <ErrorState message="We couldn't load the sales trend by shop right now." />;
  }

  const active = shops.filter((shop) => shop.totalOrders > 0);
  if (active.length === 0) return null;

  const granularityLabel = GRANULARITY_LABELS[filters.granularity].toLowerCase();

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Net sales by shop ({granularityLabel})
        </p>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {active.map((shop) => {
            const own = points.filter((point) => point.shopId === shop.shopId);
            const filled = fillTrendGaps(own, filters);
            const chartPoints: TrendChartPoint[] = filled.map((point) => ({
              label: formatBucketLabel(point.bucket, filters.granularity),
              value: point.revenueCents,
              valueLabel: formatCurrency(point.revenueCents),
            }));
            return (
              <section key={shop.shopId ?? "unassigned"} className="min-w-0">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold text-foreground">{shop.shopName}</h3>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatCurrency(shop.revenueCents)}
                  </span>
                </div>
                <TrendChart
                  points={chartPoints}
                  ariaLabel={`${shop.shopName} net sales per ${granularityLabel} bucket`}
                />
              </section>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
