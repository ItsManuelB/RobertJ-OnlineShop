import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { DashboardCategoryFilter } from "@/features/products/components/DashboardCategoryFilter";
import { DashboardProductSearchInput } from "@/features/products/components/DashboardProductSearchInput";
import { DashboardProductStatusFilter } from "@/features/products/components/DashboardProductStatusFilter";
import { DashboardProductsPanel } from "@/features/products/components/DashboardProductsPanel";
import { DashboardRowsSkeleton } from "@/features/dashboard/components/DashboardRowsSkeleton";
import { getOwnShopId, listActiveCategories, requireSessionUser } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Products — Seller Portal" };

interface SellerProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SellerProductsPage({ searchParams }: SellerProductsPageProps) {
  const params = await searchParams;
  const user = await requireSessionUser();
  const [owner, categories] = await Promise.all([
    getOwnShopId(user.id).then((shopId) => ({ sellerId: user.id, shopId })),
    listActiveCategories(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1">
            <Suspense fallback={null}>
              <DashboardProductSearchInput />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <DashboardCategoryFilter categories={categories} />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <DashboardProductStatusFilter />
        </Suspense>
        <Link
          href={ROUTES.sellerProductNew}
          className={buttonVariants({ variant: "primary", size: "rjSm", className: "self-start" })}
        >
          New product
        </Link>
      </div>

      {/* Keyed so a new search/filter restarts the suspense boundary. */}
      <Suspense key={JSON.stringify(params)} fallback={<DashboardRowsSkeleton label="Loading products" />}>
        <DashboardProductsPanel searchParams={params} owner={owner} shops={[]} isAdmin={false} />
      </Suspense>
    </div>
  );
}
