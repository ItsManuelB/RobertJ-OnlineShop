import { Suspense } from "react";
import type { Metadata } from "next";

import { DashboardCategoryFilter } from "@/features/products/components/DashboardCategoryFilter";
import { DashboardProductSearchInput } from "@/features/products/components/DashboardProductSearchInput";
import { DashboardProductStatusFilter } from "@/features/products/components/DashboardProductStatusFilter";
import { DashboardProductsPanel } from "@/features/products/components/DashboardProductsPanel";
import { DashboardRowsSkeleton } from "@/features/dashboard/components/DashboardRowsSkeleton";
import { OrderShopFilter } from "@/features/orders/components/OrderShopFilter";
import { getProductStatusCounts, listActiveCategories, listShops } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Products — Admin Portal" };

interface AdminProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminProductsPage({ searchParams }: AdminProductsPageProps) {
  const params = await searchParams;
  const shopId = typeof params.shopId === "string" && params.shopId ? params.shopId : null;
  const [categories, shops] = await Promise.all([listActiveCategories(), listShops()]);
  // The tab numbers are a nicety — a failed count just leaves the plain chips. They follow the selected shop.
  const statusCounts = await getProductStatusCounts(null, shopId).catch(() => undefined);

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Products</h1>
        <p className="text-sm text-muted-foreground">
          Review what every shop sells and step in on listings that break the rules.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Suspense fallback={null}>
          <DashboardProductStatusFilter counts={statusCounts} />
        </Suspense>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Suspense fallback={null}>
            <OrderShopFilter shops={shops.map((shop) => ({ id: shop.id, name: shop.name }))} />
          </Suspense>
          <div className="min-w-[14rem] flex-1">
            <Suspense fallback={null}>
              <DashboardProductSearchInput />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <DashboardCategoryFilter categories={categories} />
          </Suspense>
        </div>
      </div>

      {/* Keyed so a new search/filter restarts the suspense boundary. */}
      <Suspense key={JSON.stringify(params)} fallback={<DashboardRowsSkeleton label="Loading products" />}>
        <DashboardProductsPanel searchParams={params} owner={null} shops={shops} isAdmin />
      </Suspense>
    </div>
  );
}
