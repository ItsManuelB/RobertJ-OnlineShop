import { Suspense } from "react";
import type { Metadata } from "next";

import {
  ExportReportButton,
  LowStockPanel,
  OrderStatusPanel,
  parseReportFilters,
  ReportCardSkeleton,
  ReportsFilters,
  SalesByShopPanel,
  SalesSummaryPanel,
  SalesSummarySkeleton,
  TopProductsPanel,
  type ReportShopOption,
} from "@/features/reports";
import { SellerSalesTrend, SellerSalesTrendSkeleton } from "@/features/seller/components/SellerSalesTrend";
import { listShops } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Reports — Admin Portal" };

interface AdminReportsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminReportsPage({ searchParams }: AdminReportsPageProps) {
  const params = await searchParams;
  const filters = parseReportFilters(params, { isAdmin: true });

  let shops: ReportShopOption[] | undefined;
  try {
    shops = (await listShops()).map((shop) => ({ id: shop.id, name: shop.name }));
  } catch {
    shops = undefined;
  }

  const selectedShop = shops?.find((shop) => shop.id === filters.shopId);

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-lg font-semibold text-foreground">
            {selectedShop ? selectedShop.name : "All shops"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {selectedShop
              ? "Every figure below is for this shop only."
              : "Combined figures for every shop. Pick a shop in the table or the filter to narrow it down."}
          </p>
        </div>
        <ExportReportButton filters={filters} />
      </div>

      <ReportsFilters filters={filters} isAdmin shops={shops} />

      {/* Keyed so changing filters restarts every panel's suspense boundary. */}
      <div key={JSON.stringify(filters)} className="flex flex-col gap-6">
        <Suspense fallback={<ReportCardSkeleton />}>
          <SalesByShopPanel filters={filters} />
        </Suspense>

        <Suspense fallback={<SalesSummarySkeleton />}>
          <SalesSummaryPanel filters={filters} />
        </Suspense>

        {/* The filter bar's Trend select drives the interval, so no extra switch here. */}
        <Suspense fallback={<SellerSalesTrendSkeleton />}>
          <SellerSalesTrend
            from={filters.from}
            to={filters.to}
            interval={filters.granularity}
            shopId={filters.shopId}
          />
        </Suspense>

        <div className="grid gap-6 lg:grid-cols-2">
          <Suspense fallback={<ReportCardSkeleton />}>
            <OrderStatusPanel filters={filters} />
          </Suspense>
          <Suspense fallback={<ReportCardSkeleton />}>
            <TopProductsPanel filters={filters} />
          </Suspense>
        </div>

        <Suspense fallback={<ReportCardSkeleton />}>
          <LowStockPanel showShop shopId={filters.shopId} />
        </Suspense>
      </div>
    </div>
  );
}
