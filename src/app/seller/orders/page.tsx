import { Suspense } from "react";
import type { Metadata } from "next";

import { ROUTES } from "@/constants/routes";
import { DashboardOrdersPanel } from "@/features/orders/components/DashboardOrdersPanel";
import { OrderAttentionStrip } from "@/features/orders/components/OrderAttentionStrip";
import { OrderDateFilter } from "@/features/orders/components/OrderDateFilter";
import { OrderMethodFilter } from "@/features/orders/components/OrderMethodFilter";
import { OrderSearchInput } from "@/features/orders/components/OrderSearchInput";
import { OrderSkeletons } from "@/features/orders/components/OrderSkeletons";
import { OrderStatusFilter } from "@/features/orders/components/OrderStatusFilter";
import { ScanBarcodeButton } from "@/features/orders/components/ScanBarcodeButton";
import {
  getDashboardOrderStatusCounts,
  getOrderAttentionCounts,
  getOwnShopId,
  requireSessionUser,
} from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Orders — Seller Portal" };

interface SellerOrdersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SellerOrdersPage({ searchParams }: SellerOrdersPageProps) {
  const params = await searchParams;
  const user = await requireSessionUser();
  const shopId = await getOwnShopId(user.id);
  // The tab numbers and next-step cards are a nicety — a failed count just leaves the plain chips.
  const [statusCounts, attention] = await Promise.all([
    getDashboardOrderStatusCounts(user.id, shopId).catch(() => undefined),
    getOrderAttentionCounts(shopId).catch(() => undefined),
  ]);

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground">Confirm, pack and ship what buyers have placed.</p>
        </div>
        <ScanBarcodeButton />
      </div>

      {attention ? (
        <Suspense fallback={null}>
          <OrderAttentionStrip
            needsConfirmation={attention.needsConfirmation}
            toPack={statusCounts?.confirmed ?? 0}
            codAwaitingCollection={attention.codAwaitingCollection}
            returnsAwaitingRestock={attention.returnsAwaitingRestock}
            ordersHref={ROUTES.sellerOrders}
            paymentsHref={ROUTES.sellerPayments}
            returnsHref={ROUTES.sellerReturns}
          />
        </Suspense>
      ) : null}

      <div className="flex flex-col gap-4">
        <Suspense fallback={null}>
          <OrderStatusFilter themed counts={statusCounts} />
        </Suspense>
        <div className="flex flex-wrap items-center gap-2">
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
          clearFiltersHref={ROUTES.sellerOrders}
          isAdmin={false}
          hideAttention
        />
      </Suspense>
    </div>
  );
}
