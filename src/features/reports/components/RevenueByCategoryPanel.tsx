import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { getRevenueByCategory, getSalesSummary } from "@/lib/supabase/queries";

import type { ReportFilters } from "../types/report.types";

/**
 * Sales per category for the range: the same ever-paid orders as Gross sales,
 * before refunds. Item subtotals by category plus a "Shipping & fees" row make
 * the list add up to Gross sales, and the footer says whether it does.
 * Seller and Admin Reports.
 */
export async function RevenueByCategoryPanel({ filters }: { filters: Pick<ReportFilters, "from" | "to"> & { shopId?: string | null } }) {
  let rows: Awaited<ReturnType<typeof getRevenueByCategory>>;
  let grossCents: number;
  try {
    // `getSalesSummary` is request-cached, so the overview and this panel share one read.
    const [categories, summary] = await Promise.all([
      getRevenueByCategory(filters.from, filters.to, filters.shopId ?? null),
      getSalesSummary(filters.from, filters.to, filters.shopId ?? null),
    ]);
    rows = categories;
    grossCents = summary.grossRevenueCents;
  } catch {
    return <ErrorState message="We couldn't load sales by category right now." />;
  }

  const itemsCents = rows.reduce((sum, row) => sum + row.revenueCents, 0);
  const remainderCents = grossCents - itemsCents;
  const lines = [
    ...rows.map((row) => ({ key: row.categoryId ?? "uncategorized", label: row.categoryName, cents: row.revenueCents })),
    ...(remainderCents > 0 ? [{ key: "shipping-fees", label: "Shipping & fees", cents: remainderCents }] : []),
  ];
  const maxCents = lines.reduce((max, line) => Math.max(max, line.cents), 0);
  const reconciles = itemsCents + Math.max(remainderCents, 0) === grossCents;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Sales by category</h3>
          <p className="text-xs text-muted-foreground">Paid orders · before refunds</p>
        </div>
        {lines.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2">
              {lines.map((line) => (
                <li key={line.key} className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
                  <span className="truncate font-medium text-foreground">{line.label}</span>
                  <span aria-hidden="true" className="block h-2.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-info"
                      style={{ width: `${maxCents ? Math.round((line.cents / maxCents) * 100) : 0}%` }}
                    />
                  </span>
                  <span className="text-right font-semibold tabular-nums text-foreground">{formatCurrency(line.cents)}</span>
                </li>
              ))}
            </ul>
            <p className={reconciles ? "border-t border-border pt-2 text-xs text-success" : "border-t border-border pt-2 text-xs font-semibold text-danger"}>
              {reconciles
                ? `✓ Categories add up to Gross sales (${formatCurrency(grossCents)}).`
                : `Categories do not add up to Gross sales (${formatCurrency(grossCents)}).`}
            </p>
          </>
        ) : (
          <EmptyState title="No paid sales in this period yet" description="Category sales will appear here once orders are paid." />
        )}
      </CardContent>
    </Card>
  );
}
