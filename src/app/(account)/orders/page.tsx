import { Suspense } from "react";
import type { Metadata } from "next";

import { CatalogHeader } from "@/features/products/components/CatalogHeader";
import { BuyerPlacedFilter } from "@/features/orders/components/BuyerPlacedFilter";
import { OrderListSection } from "@/features/orders/components/OrderListSection";
import { OrderLifecycleTabs } from "@/features/orders/components/OrderLifecycleTabs";
import { OrderSearchInput } from "@/features/orders/components/OrderSearchInput";
import { OrderSkeletons } from "@/features/orders/components/OrderSkeletons";
import { UnpaidOrdersNotice } from "@/features/orders/components/UnpaidOrdersNotice";
import { getBuyerOrderLifecycleCounts, requireSessionUser } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Orders" };

interface OrdersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const user = await requireSessionUser();
  const counts = await getBuyerOrderLifecycleCounts(user.id);

  return (
    <div className="flex flex-col gap-8">
      <CatalogHeader
        eyebrow="My Account"
        title="Orders"
        description="Find an order by number or product, filter by status or date, and follow delivery."
      />

      <UnpaidOrdersNotice count={counts.to_pay} onToPayTab={params.tab === "to_pay"} />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Suspense fallback={null}>
            <OrderSearchInput
              label="Search by order number or product name"
              placeholder="Search by order number or product…"
            />
          </Suspense>
          <Suspense fallback={null}>
            <BuyerPlacedFilter />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <OrderLifecycleTabs counts={counts} />
        </Suspense>
      </div>

      {/* Keyed so a new search/filter restarts the suspense boundary. */}
      <Suspense key={JSON.stringify(params)} fallback={<OrderSkeletons />}>
        <OrderListSection searchParams={params} buyerId={user.id} />
      </Suspense>
    </div>
  );
}
