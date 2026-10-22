import { Suspense } from "react";
import type { Metadata } from "next";

import { DashboardRowsSkeleton } from "@/features/dashboard/components/DashboardRowsSkeleton";
import { DashboardInventorySearchInput } from "@/features/inventory/components/DashboardInventorySearchInput";
import { DashboardStockStatusFilter } from "@/features/inventory/components/DashboardStockStatusFilter";
import { AdminInventoryShopFilter } from "@/features/inventory/components/AdminInventoryShopFilter";
import { AdminInventoryViewToggle } from "@/features/inventory/components/AdminInventoryViewToggle";
import { InventoryTable } from "@/features/inventory/components/InventoryTable";
import { listShops } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Inventory — Admin Portal" };

interface AdminInventoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminInventoryPage({ searchParams }: AdminInventoryPageProps) {
  const [params, shops] = await Promise.all([searchParams, listShops().catch(() => [])]);
  const shopOptions = shops.map(({ id, name }) => ({ id, name }));

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={null}>
              <DashboardInventorySearchInput />
            </Suspense>
            <Suspense fallback={null}>
              <AdminInventoryShopFilter shops={shopOptions} />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <DashboardStockStatusFilter />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <AdminInventoryViewToggle />
        </Suspense>
      </div>

      {/* Keyed so a new search/filter restarts the suspense boundary. */}
      <Suspense key={JSON.stringify(params)} fallback={<DashboardRowsSkeleton label="Loading inventory" />}>
        <InventoryTable searchParams={params} isAdmin />
      </Suspense>
    </div>
  );
}
