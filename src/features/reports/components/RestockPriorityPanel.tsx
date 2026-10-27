import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { ROUTES } from "@/constants/routes";
import { StockStatusBadge } from "@/features/inventory";
import { formatCurrency } from "@/lib/utils/currency";
import { getCurrentSellerOwner, getRestockPriorityReport } from "@/lib/supabase/queries";

import type { ReportFilters } from "../types/report.types";

function initials(title: string) {
  const words = title.split(" ").filter(Boolean);
  return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
}

/**
 * Cross-references low/out-of-stock items with their sales this period —
 * "your best-seller is about to run out" — ranked by revenue earned, so a
 * seller knows which restock to prioritize first. Seller Dashboard/Reports
 * only.
 */
export async function RestockPriorityPanel({
  filters,
  audience = "seller",
}: {
  filters: Pick<ReportFilters, "from" | "to"> & { shopId?: string | null };
  audience?: "seller" | "admin";
}) {
  const isAdmin = audience === "admin";
  const inventoryRoute = isAdmin ? ROUTES.adminInventory : ROUTES.sellerInventory;
  let items: Awaited<ReturnType<typeof getRestockPriorityReport>>;
  try {
    items = await getRestockPriorityReport(filters.from, filters.to, 5, isAdmin ? (filters.shopId ? { sellerId: "", shopId: filters.shopId } : null) : await getCurrentSellerOwner());
  } catch {
    return <ErrorState message="We couldn't load restock priority right now." />;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Restock priority</h3>
            <p className="text-xs text-muted-foreground">Low or out of stock, best sellers first · stock is live</p>
          </div>
          <Link href={inventoryRoute} className="text-xs font-bold text-primary hover:underline">
            View inventory →
          </Link>
        </div>

        {items.length === 0 ? (
          <EmptyState
            title="Nothing urgent"
            description={`None of ${isAdmin ? "the" : "your"} products are low or out of stock right now.`}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {items.map((item) => (
              <li key={`${item.productId}:${item.variantId ?? ""}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                  {initials(item.productTitle)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {item.productTitle}
                    {item.variantLabel ? <span className="font-normal text-muted-foreground"> — {item.variantLabel}</span> : null}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {item.quantity === 0 ? "None left" : `${item.quantity} left`} · {item.unitsSoldInRange} sold in these dates
                    <StockStatusBadge status={item.stockStatus} />
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-foreground">{formatCurrency(item.revenueCentsInRange)}</p>
                  <p className="text-[10px] text-muted-foreground">sales in these dates</p>
                  <Link
                    href={`${inventoryRoute}?search=${encodeURIComponent(item.productTitle)}`}
                    aria-label={`Restock ${item.productTitle}${item.variantLabel ? ` ${item.variantLabel}` : ""}`}
                    className="mt-1 inline-block text-xs font-bold text-primary hover:underline"
                  >
                    Restock →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Ranked by revenue earned this period among items that are low or out of stock.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
