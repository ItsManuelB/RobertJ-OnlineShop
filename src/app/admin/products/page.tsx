import { Suspense } from "react";
import type { Metadata } from "next";

import { DashboardCategoryFilter } from "@/features/products/components/DashboardCategoryFilter";
import { DashboardProductSearchInput } from "@/features/products/components/DashboardProductSearchInput";
import { DashboardProductStatusFilter } from "@/features/products/components/DashboardProductStatusFilter";
import { DashboardProductsPanel } from "@/features/products/components/DashboardProductsPanel";
import { DashboardRowsSkeleton } from "@/features/dashboard/components/DashboardRowsSkeleton";
import { listActiveCategories, listShops } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Products — Admin Portal" };

interface AdminProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminProductsPage({ searchParams }: AdminProductsPageProps) {
  const params = await searchParams;
  const [categories, shops] = await Promise.all([listActiveCategories(), listShops()]);

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div className="flex flex-col gap-3">
        <div className="min-w-[14rem]">
          <Suspense fallback={null}>
            <DashboardProductSearchInput />
          </Suspense>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Suspense fallback={null}>
            <DashboardCategoryFilter categories={categories} />
          </Suspense>
          <Suspense fallback={null}>
            <DashboardProductStatusFilter />
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
