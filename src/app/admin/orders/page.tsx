import { Suspense } from "react";
import type { Metadata } from "next";

import { ROUTES } from "@/constants/routes";
import { DashboardOrdersPanel } from "@/features/orders/components/DashboardOrdersPanel";
import { OrderDateFilter } from "@/features/orders/components/OrderDateFilter";
import { OrderMethodFilter } from "@/features/orders/components/OrderMethodFilter";
import { OrderSearchInput } from "@/features/orders/components/OrderSearchInput";
import { OrderShopFilter } from "@/features/orders/components/OrderShopFilter";
import { OrderSkeletons } from "@/features/orders/components/OrderSkeletons";
import { OrderStatusFilter } from "@/features/orders/components/OrderStatusFilter";
import { listShops } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Orders — Admin Portal" };

interface AdminOrdersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const params = await searchParams;

  // F-12: admin-only shop filter, same "degrade to no filter rather than
  // fail the page" posture as the Reports page's own `listShops()` call.
  const shops = await listShops().catch(() => []);

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1">
            <Suspense fallback={null}>
              <OrderSearchInput themed />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <OrderMethodFilter />
          </Suspense>
          <Suspense fallback={null}>
            <OrderDateFilter />
          </Suspense>
          <Suspense fallback={null}>
            <OrderShopFilter shops={shops.map((shop) => ({ id: shop.id, name: shop.name }))} />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <OrderStatusFilter themed />
        </Suspense>
      </div>

      {/* Keyed so a new search/filter restarts the suspense boundary. */}
      <Suspense key={JSON.stringify(params)} fallback={<OrderSkeletons themed />}>
        <DashboardOrdersPanel
          searchParams={params}
          clearFiltersHref={ROUTES.adminOrders}
          isAdmin
        />
      </Suspense>
    </div>
  );
}
