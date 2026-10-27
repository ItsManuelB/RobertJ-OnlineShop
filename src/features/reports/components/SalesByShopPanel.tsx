import Link from "next/link";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";
import { getSalesByShop } from "@/lib/supabase/queries";

import type { ReportFilters, ShopSalesRow } from "../types/report.types";
import { getPreviousPeriod } from "../utils/report-range";

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

/** Same page, same dates, narrowed to one shop (or back to all shops when `shopId` is null). */
function shopHref(filters: ReportFilters, shopId: string | null): string {
  const query = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    granularity: filters.granularity,
  });
  if (shopId) query.set("shopId", shopId);
  return `${ROUTES.adminReports}?${query.toString()}`;
}

/** Sums the shop rows into the All-shops line. Equal to the unfiltered summary because the rows partition every order. */
function totalRow(rows: ShopSalesRow[]): ShopSalesRow {
  const sum = (pick: (row: ShopSalesRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const paidOrders = sum((r) => r.paidOrders);
  const gross = sum((r) => r.grossRevenueCents);
  return {
    shopId: null,
    shopName: "All shops",
    totalOrders: sum((r) => r.totalOrders),
    paidOrders,
    cancelledOrders: sum((r) => r.cancelledOrders),
    grossRevenueCents: gross,
    refundsCents: sum((r) => r.refundsCents),
    revenueCents: sum((r) => r.revenueCents),
    avgOrderValueCents: paidOrders > 0 ? Math.round(gross / paidOrders) : 0,
    unitsSold: sum((r) => r.unitsSold),
    refundedOrders: sum((r) => r.refundedOrders),
  };
}

const HEAD = "py-2 px-3 text-right font-medium whitespace-nowrap";
const CELL = "py-2.5 px-3 text-right tabular-nums";

/**
 * Admin-only side-by-side comparison: one row per shop plus an All-shops
 * total that is the sum of the rows. Net sales carry a change chip against
 * the previous equal period. Selecting a row narrows the whole page to that
 * shop. Not narrowed by `filters.shopId` itself — the comparison is the point.
 */
export async function SalesByShopPanel({ filters }: { filters: ReportFilters }) {
  const prior = getPreviousPeriod(filters.from, filters.to);

  let rows: ShopSalesRow[];
  try {
    rows = await getSalesByShop(filters.from, filters.to);
  } catch {
    return <ErrorState message="We couldn't load the sales by shop right now." />;
  }
  // Only the change chips depend on this read, so a failure just drops them.
  const previous = await getSalesByShop(prior.from, prior.to).catch(() => null);
  const previousNet = new Map((previous ?? []).map((row) => [row.shopId, row.revenueCents]));

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <EmptyState title="No shops yet" description="Shops will appear here once they are created." />
        </CardContent>
      </Card>
    );
  }

  const total = totalRow(rows);
  const previousTotal = previous ? previous.reduce((sum, row) => sum + row.revenueCents, 0) : null;
  const display: ShopSalesRow[] = [total, ...rows];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Sales by shop</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Net sales = gross paid orders minus confirmed refunds. Choose a shop to filter the whole report to it.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-subtle-border text-muted-foreground">
                <th scope="col" className="py-2 pr-3 text-left font-medium">Shop</th>
                <th scope="col" className={HEAD}>Net sales</th>
                <th scope="col" className={HEAD}>Share</th>
                <th scope="col" className={HEAD}>Gross</th>
                <th scope="col" className={HEAD}>Refunds</th>
                <th scope="col" className={HEAD}>Orders</th>
                <th scope="col" className={HEAD}>Paid</th>
                <th scope="col" className={HEAD}>Avg order</th>
                <th scope="col" className={HEAD}>Units</th>
                <th scope="col" className={HEAD}>Cancelled</th>
                <th scope="col" className={HEAD}>Refunded</th>
              </tr>
            </thead>
            <tbody>
              {display.map((row, index) => {
                const isTotal = index === 0;
                const isSelected = isTotal ? filters.shopId === null : row.shopId === filters.shopId;
                const before = isTotal ? previousTotal : (previousNet.get(row.shopId) ?? (previous ? 0 : null));
                const selectable = isTotal || row.shopId !== null;
                return (
                  <tr
                    key={row.shopId ?? (isTotal ? "all" : "unassigned")}
                    className={cn(
                      "border-b border-table-divider last:border-0",
                      isTotal && "font-semibold",
                      isSelected && "bg-primary/5",
                    )}
                  >
                    <th scope="row" className="py-2.5 pr-3 text-left font-medium text-foreground">
                      {selectable ? (
                        <Link
                          href={shopHref(filters, isTotal ? null : row.shopId)}
                          aria-current={isSelected ? "true" : undefined}
                          className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                        >
                          {row.shopName}
                        </Link>
                      ) : (
                        <span title="Orders that are not linked to any shop">{row.shopName}</span>
                      )}
                    </th>
                    <td className={cn(CELL, "text-foreground")}>
                      <span className="inline-flex flex-wrap items-baseline justify-end gap-2">
                        {formatCurrency(row.revenueCents)}
                        {before !== null ? <DeltaBadge current={row.revenueCents} previous={before} /> : null}
                      </span>
                    </td>
                    <td className={cn(CELL, "text-muted-foreground")}>{percent(row.revenueCents, total.revenueCents)}</td>
                    <td className={cn(CELL, "text-muted-foreground")}>{formatCurrency(row.grossRevenueCents)}</td>
                    <td className={cn(CELL, "text-muted-foreground")}>{formatCurrency(row.refundsCents)}</td>
                    <td className={cn(CELL, "text-muted-foreground")}>{row.totalOrders}</td>
                    <td className={cn(CELL, "text-muted-foreground")}>{row.paidOrders}</td>
                    <td className={cn(CELL, "text-muted-foreground")}>{formatCurrency(row.avgOrderValueCents)}</td>
                    <td className={cn(CELL, "text-muted-foreground")}>{row.unitsSold}</td>
                    <td className={cn(CELL, "text-muted-foreground")}>
                      {row.cancelledOrders} · {percent(row.cancelledOrders, row.totalOrders)}
                    </td>
                    <td className={cn(CELL, "text-muted-foreground")}>
                      {row.refundedOrders} · {percent(row.refundedOrders, row.paidOrders)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Cancelled is a share of orders placed; Refunded is a share of paid orders. Change chips compare with the previous equal period.
        </p>
      </CardContent>
    </Card>
  );
}
