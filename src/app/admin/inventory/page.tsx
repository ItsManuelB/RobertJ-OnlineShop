import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { DashboardRowsSkeleton } from "@/features/dashboard/components/DashboardRowsSkeleton";
import { DashboardInventorySearchInput } from "@/features/inventory/components/DashboardInventorySearchInput";
import { DashboardStockStatusFilter } from "@/features/inventory/components/DashboardStockStatusFilter";
import { AdminInventoryShopFilter } from "@/features/inventory/components/AdminInventoryShopFilter";
import { AdminInventoryViewToggle } from "@/features/inventory/components/AdminInventoryViewToggle";
import { InventoryTable } from "@/features/inventory/components/InventoryTable";
import { getInventoryStatusCounts, listShops } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Inventory — Admin Portal" };

interface AdminInventoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminInventoryPage({ searchParams }: AdminInventoryPageProps) {
  const params = await searchParams;
  const shopId = typeof params.shopId === "string" && params.shopId ? params.shopId : null;
  // The tab numbers and restock banner are a nicety — a failed count just leaves the plain chips.
  const [shops, counts] = await Promise.all([
    listShops().catch(() => []),
    getInventoryStatusCounts(shopId).catch(() => undefined),
  ]);
  const shopOptions = shops.map(({ id, name }) => ({ id, name }));
  const needsRestock = counts ? counts.low_stock + counts.out_of_stock : 0;
  const filtered = Boolean(params.stockStatus);
  const restockQuery = new URLSearchParams({ stockStatus: "needs_attention", ...(shopId ? { shopId } : {}) });

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Track stock across every shop and spot what is running low.
        </p>
      </div>

      {counts && needsRestock > 0 && !filtered ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="flex-1 text-sm text-foreground">
            <span className="font-semibold">
              {needsRestock} item{needsRestock === 1 ? "" : "s"} need{needsRestock === 1 ? "s" : ""} restocking.
            </span>{" "}
            {counts.low_stock} low, {counts.out_of_stock} out of stock{shopId ? " in this shop" : " across all shops"}.
            Out-of-stock items cannot be bought.
          </p>
          <Link
            href={`${ROUTES.adminInventory}?${restockQuery.toString()}`}
            className={buttonVariants({ variant: "outline", size: "rjSm" })}
          >
            Show only these
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <Suspense fallback={null}>
          <DashboardStockStatusFilter counts={counts} />
        </Suspense>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-[14rem] flex-1 flex-wrap items-center gap-2">
            <Suspense fallback={null}>
              <AdminInventoryShopFilter shops={shopOptions} />
            </Suspense>
            <div className="min-w-[12rem] flex-1">
              <Suspense fallback={null}>
                <DashboardInventorySearchInput />
              </Suspense>
            </div>
          </div>
          <Suspense fallback={null}>
            <AdminInventoryViewToggle />
          </Suspense>
        </div>
      </div>

      {/* Keyed so a new search/filter restarts the suspense boundary. */}
      <Suspense key={JSON.stringify(params)} fallback={<DashboardRowsSkeleton label="Loading inventory" />}>
        <InventoryTable searchParams={params} isAdmin />
      </Suspense>
    </div>
  );
}
