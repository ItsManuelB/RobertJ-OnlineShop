import { Suspense } from "react";
import type { Metadata } from "next";

import { ROUTES } from "@/constants/routes";
import { DashboardOrdersPanel } from "@/features/orders/components/DashboardOrdersPanel";
import { OrderAttentionStrip } from "@/features/orders/components/OrderAttentionStrip";
import { OrderDateFilter } from "@/features/orders/components/OrderDateFilter";
import { OrderMethodFilter } from "@/features/orders/components/OrderMethodFilter";
import { OrderSearchInput } from "@/features/orders/components/OrderSearchInput";
import { OrderShopFilter } from "@/features/orders/components/OrderShopFilter";
import { OrderSkeletons } from "@/features/orders/components/OrderSkeletons";
import { OrderStatusFilter } from "@/features/orders/components/OrderStatusFilter";
import {
  getDashboardOrderStatusCounts,
  getOrderAttentionCounts,
  listShops,
} from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Orders — Admin Portal" };

interface AdminOrdersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const params = await searchParams;
  const shopId = typeof params.shopId === "string" && params.shopId ? params.shopId : null;

  // The shop list, tab numbers and next-step cards are conveniences — a failure
  // degrades to the plain filters rather than failing the page. Counts follow
  // the selected shop so the chips always match the rows below.
  const [shops, statusCounts, attention] = await Promise.all([
    listShops().catch(() => []),
    getDashboardOrderStatusCounts(null, shopId).catch(() => undefined),
    getOrderAttentionCounts(shopId ?? undefined).catch(() => undefined),
  ]);

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Watch every shop&apos;s orders and step in when something is stuck.
        </p>
      </div>

      {attention ? (
        <Suspense fallback={null}>
          <OrderAttentionStrip
            needsConfirmation={attention.needsConfirmation}
            toPack={statusCounts?.confirmed ?? 0}
            codAwaitingCollection={attention.codAwaitingCollection}
            returnsAwaitingRestock={attention.returnsAwaitingRestock}
            overdueToShip={attention.overdueToShip}
            ordersHref={ROUTES.adminOrders}
            paymentsHref={ROUTES.adminPayments}
            returnsHref={ROUTES.adminReturns}
          />
        </Suspense>
      ) : null}

      <div className="flex flex-col gap-4">
        <Suspense fallback={null}>
          <OrderStatusFilter themed counts={statusCounts} />
        </Suspense>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <OrderShopFilter shops={shops.map((shop) => ({ id: shop.id, name: shop.name }))} />
          </Suspense>
          <div className="min-w-[14rem] flex-1">
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
        </div>
      </div>

      {/* Keyed so a new search/filter restarts the suspense boundary. */}
      <Suspense key={JSON.stringify(params)} fallback={<OrderSkeletons themed />}>
        <DashboardOrdersPanel
          searchParams={params}
          clearFiltersHref={ROUTES.adminOrders}
          isAdmin
          hideAttention
        />
      </Suspense>
    </div>
  );
}
