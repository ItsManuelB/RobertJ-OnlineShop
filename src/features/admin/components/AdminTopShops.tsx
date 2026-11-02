import Link from "next/link";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { formatCurrency } from "@/lib/utils/currency";
import { getSalesByShop } from "@/lib/supabase/queries";

const TOP_SHOP_LIMIT = 5;

export interface AdminTopShopsProps {
  from: string;
  to: string;
}

/** The shops with the most net sales in the range (same data as Reports > Sales by shop). */
export async function AdminTopShops({ from, to }: AdminTopShopsProps) {
  let rows: Awaited<ReturnType<typeof getSalesByShop>>;
  try {
    rows = await getSalesByShop(from, to);
  } catch {
    return <ErrorState message="We couldn't load the top shops right now." />;
  }

  const ranked = rows
    .filter((row) => row.revenueCents > 0)
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, TOP_SHOP_LIMIT);
  const best = ranked[0]?.revenueCents ?? 0;
  const reportsHref = `${ROUTES.adminReports}?from=${from}&to=${to}#shops`;

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-semibold">Top shops by net sales</CardTitle>
        <Link href={reportsHref} className="text-xs font-semibold text-primary underline">
          All shops
        </Link>
      </CardHeader>
      <CardContent>
        {ranked.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No sales in this period yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {ranked.map((row, index) => (
              <li key={row.shopId ?? "unassigned"} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {index + 1}. {row.shopName}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {formatCurrency(row.revenueCents)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, Math.round((row.revenueCents / best) * 100))}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {row.paidOrders} paid order{row.paidOrders === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminTopShopsSkeleton() {
  return (
    <Card className="border-border">
      <CardContent className="flex flex-col gap-3 p-5" role="status">
        <span className="sr-only">Loading top shops</span>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
