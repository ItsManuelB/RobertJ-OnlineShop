import Link from "next/link";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { ORDER_STATUS } from "@/constants/status";
import { formatCurrency } from "@/lib/utils/currency";
import { getLowStockReport, getOrderAttentionCounts, getSalesByShop, listShops } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils/cn";

export interface AdminShopHealthProps {
  from: string;
  to: string;
}

const NUM = "px-3 py-2 text-right tabular-nums";

/** A count that links to the matching list for that shop; zero stays plain so the rows with work stand out. */
function CountLink({ value, href, urgent = false }: { value: number; href: string; urgent?: boolean }) {
  if (value === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <Link
      href={href}
      className={cn(
        "font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        urgent ? "text-danger" : "text-foreground",
      )}
    >
      {value}
    </Link>
  );
}

/**
 * One row per active shop: net sales for the range (same figures as Reports > Sales by
 * shop) beside the work waiting on that shop right now. Tells the admin which shop to
 * call first. A failed per-shop read shows a dash instead of hiding the table.
 */
export async function AdminShopHealth({ from, to }: AdminShopHealthProps) {
  let shops: Awaited<ReturnType<typeof listShops>>;
  let sales: Awaited<ReturnType<typeof getSalesByShop>>;
  try {
    [shops, sales] = await Promise.all([listShops(), getSalesByShop(from, to)]);
  } catch {
    return <ErrorState message="We couldn't load the shop overview right now." />;
  }

  const active = shops.filter((shop) => shop.active);
  const rows = await Promise.all(
    active.map(async (shop) => {
      const [counts, lowStock] = await Promise.all([
        getOrderAttentionCounts(shop.id).catch(() => null),
        getLowStockReport(shop.id).catch(() => null),
      ]);
      return {
        shop,
        netCents: sales.find((row) => row.shopId === shop.id)?.revenueCents ?? 0,
        toConfirm: counts?.needsConfirmation ?? null,
        overdue: counts?.overdueToShip ?? null,
        lowStock: lowStock?.length ?? null,
      };
    }),
  );

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-semibold">Shop health</CardTitle>
        <Link href={ROUTES.adminShops} className="text-xs font-semibold text-primary underline">
          Manage shops
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">No active shops yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="border-y border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2 pl-5 text-left font-semibold">Shop</th>
                  <th scope="col" className={cn(NUM, "font-semibold")}>Net sales</th>
                  <th scope="col" className={cn(NUM, "font-semibold")}>To confirm</th>
                  <th scope="col" className={cn(NUM, "font-semibold")}>Ship overdue</th>
                  <th scope="col" className={cn(NUM, "pr-5 font-semibold")}>Low stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.shop.id} className="border-b border-border last:border-0">
                    <th scope="row" className="max-w-[12rem] truncate px-3 py-2 pl-5 text-left font-medium text-foreground">
                      {row.shop.name}
                    </th>
                    <td className={NUM}>{formatCurrency(row.netCents)}</td>
                    <td className={NUM}>
                      {row.toConfirm === null ? (
                        "—"
                      ) : (
                        <CountLink
                          value={row.toConfirm}
                          href={`${ROUTES.adminOrders}?shopId=${row.shop.id}&status=${ORDER_STATUS.pending}`}
                        />
                      )}
                    </td>
                    <td className={NUM}>
                      {row.overdue === null ? (
                        "—"
                      ) : (
                        <CountLink
                          value={row.overdue}
                          urgent
                          href={`${ROUTES.adminOrders}?shopId=${row.shop.id}&status=${ORDER_STATUS.confirmed}`}
                        />
                      )}
                    </td>
                    <td className={cn(NUM, "pr-5")}>
                      {row.lowStock === null ? (
                        "—"
                      ) : (
                        <CountLink value={row.lowStock} href={`${ROUTES.adminInventory}?shopId=${row.shop.id}`} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminShopHealthSkeleton() {
  return (
    <Card className="border-border">
      <CardContent className="flex flex-col gap-3 p-5" role="status">
        <span className="sr-only">Loading the shop overview</span>
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
