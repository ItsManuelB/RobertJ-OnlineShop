import Link from "next/link";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import type { TopProduct } from "@/features/reports/types/report.types";
import { getCurrentSellerOwner, getTopProducts } from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/utils/currency";

import { SELLER_TOP_PRODUCTS_LIMIT } from "../constants/fulfilment";

/** How many ranked rows are fetched when re-sorting by sales (units-ranked top N is not the top N by sales). */
const SALES_SORT_POOL = 50;

export type TopProductsSort = "units" | "sales";

/**
 * Best-selling products of the signed-in seller's shop in the selected dates.
 * Ranked by units by default; sales are paid orders before refunds (same basis
 * as `report_top_products`). The Reports page passes `sortHrefs` to add a
 * By units / By sales switch. Each row links to the product editor.
 */
export async function SellerTopProducts({
  from,
  to,
  sort = "units",
  sortHrefs,
}: {
  from: string;
  to: string;
  sort?: TopProductsSort;
  sortHrefs?: Record<TopProductsSort, string>;
}) {
  let products: TopProduct[];
  try {
    const owner = await getCurrentSellerOwner();
    if (!owner.shopId) {
      products = [];
    } else if (sort === "sales") {
      const pool = await getTopProducts(from, to, SALES_SORT_POOL, owner.shopId);
      products = [...pool]
        .sort((a, b) => b.revenueCents - a.revenueCents || b.unitsSold - a.unitsSold)
        .slice(0, SELLER_TOP_PRODUCTS_LIMIT);
    } else {
      products = await getTopProducts(from, to, SELLER_TOP_PRODUCTS_LIMIT, owner.shopId);
    }
  } catch {
    return <ErrorState message="We couldn't load top products right now." />;
  }

  const barValue = (p: TopProduct) => (sort === "sales" ? p.revenueCents : p.unitsSold);
  const maxBar = products.reduce((max, p) => Math.max(max, barValue(p)), 0);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Top products</h3>
          <p className="text-xs text-muted-foreground">
            Ranked by {sort === "sales" ? "sales" : "units"} · paid orders, sales before refunds
          </p>
        </div>
        {sortHrefs ? (
          <nav aria-label="Rank products by" className="flex items-center gap-1 self-start rounded-lg bg-muted p-1">
            {(["units", "sales"] as const).map((choice) => (
              <Link
                key={choice}
                href={sortHrefs[choice]}
                scroll={false}
                aria-current={sort === choice ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-8 items-center rounded-md px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  sort === choice ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {choice === "units" ? "By units" : "By sales"}
              </Link>
            ))}
          </nav>
        ) : null}
        {products.length === 0 ? (
          <EmptyState
            title="No paid sales in this period yet"
            description="Try a wider date range."
          />
        ) : (
          <ol className="flex flex-col gap-2">
            {products.map((product, index) => (
              <li
                key={product.productId}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-primary"
                  >
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm font-semibold text-foreground">{product.productTitle}</span>
                    <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${maxBar ? Math.round((barValue(product) / maxBar) * 100) : 0}%` }}
                      />
                    </span>
                  </div>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(product.revenueCents)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {product.unitsSold} {product.unitsSold === 1 ? "unit" : "units"} sold
                  </span>
                </div>
                <Link
                  href={ROUTES.sellerProductEdit(product.productId)}
                  aria-label={`View product ${product.productTitle}`}
                  className="inline-flex min-h-9 items-center justify-center justify-self-end rounded-lg border border-border px-3 text-xs font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  View product
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function SellerTopProductsSkeleton() {
  return (
    <Card>
      <CardContent className="p-5" role="status">
        <span className="sr-only">Loading top products</span>
        <Skeleton className="h-40 w-full" />
      </CardContent>
    </Card>
  );
}
