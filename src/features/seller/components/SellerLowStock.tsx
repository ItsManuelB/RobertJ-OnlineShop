import Link from "next/link";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import {
  FILTER_CHIP_ACTIVE_THEMED,
  FILTER_CHIP_IDLE_THEMED,
} from "@/components/ui/filter-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { StockStatusBadge } from "@/features/inventory/components/StockStatusBadge";
import type { RestockPriorityItem } from "@/features/reports/types/report.types";
import { addDays, manilaToday } from "@/features/reports/utils/report-range";
import { SELLER_STOCK_FILTERS, type SellerStockFilter } from "@/features/seller/constants/stock-filters";
import { getCurrentSellerOwner, getRestockPriorityReport } from "@/lib/supabase/queries";

const MAX_ROWS = 6;
const SALES_WINDOW_DAYS = 30;

export interface SellerLowStockProps {
  filter: SellerStockFilter;
  /** Preserves the dashboard's other search params when switching filters. */
  baseQuery: string;
}

/**
 * Low and out-of-stock products for the signed-in seller's shop, best-sellers
 * first (paid units in the last 30 days), merging the old Low stock card and
 * Restock priority panel. Live: it ignores the dashboard's date range.
 */
export async function SellerLowStock({ filter, baseQuery }: SellerLowStockProps) {
  let items: RestockPriorityItem[];
  try {
    const owner = await getCurrentSellerOwner();
    if (!owner.shopId) {
      items = [];
    } else {
      const today = manilaToday();
      items = await getRestockPriorityReport(addDays(today, -(SALES_WINDOW_DAYS - 1)), today, 500, owner);
    }
  } catch {
    return <ErrorState message="We couldn't load low-stock products right now." />;
  }

  const outCount = items.filter((item) => item.stockStatus === "out_of_stock").length;
  const lowCount = items.length - outCount;
  const counts: Record<SellerStockFilter, number> = { all: items.length, out_of_stock: outCount, low_stock: lowCount };
  const visible = items.filter((item) => filter === "all" || item.stockStatus === filter);
  // Best-sellers first, then the emptiest shelf.
  visible.sort((a, b) => b.unitsSoldInRange - a.unitsSoldInRange || a.quantity - b.quantity);

  const filterHref = (id: SellerStockFilter) => {
    const params = new URLSearchParams(baseQuery);
    if (id === "all") params.delete("stockFilter");
    else params.set("stockFilter", id);
    const query = params.toString();
    return query ? `${ROUTES.sellerDashboard}?${query}` : ROUTES.sellerDashboard;
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Low stock</h2>
            <p className="text-xs text-muted-foreground">Best-sellers first · live</p>
          </div>
          <Link href={ROUTES.sellerInventory} className="text-xs font-semibold text-primary hover:underline">
            View inventory →
          </Link>
        </div>

        <nav aria-label="Filter low stock" className="flex flex-wrap gap-2">
          {SELLER_STOCK_FILTERS.map((item) => (
            <Link
              key={item.id}
              href={filterHref(item.id)}
              scroll={false}
              aria-current={item.id === filter ? "true" : undefined}
              className={item.id === filter ? FILTER_CHIP_ACTIVE_THEMED : FILTER_CHIP_IDLE_THEMED}
            >
              {item.label} ({counts[item.id]})
            </Link>
          ))}
        </nav>

        {visible.length === 0 ? (
          <EmptyState
            title={filter === "all" ? "Stock looks healthy" : "Nothing in this group"}
            description={filter === "all" ? "Nothing needs restocking right now." : "Try another filter."}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.slice(0, MAX_ROWS).map((item) => (
              <li
                key={`${item.productId}:${item.variantId ?? ""}`}
                className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{item.productTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.variantLabel ? `${item.variantLabel} · ` : ""}
                    {item.quantity === 0 ? "none left" : `${item.quantity} left`} · {item.unitsSoldInRange} sold in {SALES_WINDOW_DAYS} days
                  </p>
                </div>
                <StockStatusBadge status={item.stockStatus} />
                <Link
                  href={`${ROUTES.sellerInventory}?search=${encodeURIComponent(item.productTitle)}`}
                  aria-label={`Restock ${item.productTitle}${item.variantLabel ? `, ${item.variantLabel}` : ""}`}
                  className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-xs font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  Restock
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function SellerLowStockSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5" role="status">
        <span className="sr-only">Loading low stock</span>
        <Skeleton className="h-5 w-24" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
