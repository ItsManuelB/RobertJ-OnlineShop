import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { ROUTES } from "@/constants/routes";
import { getDefaultRange, parseDashboardDateRange } from "@/features/reports/utils/report-range";
import { SellerAttentionPanel, SellerAttentionPanelSkeleton } from "@/features/seller/components/SellerAttentionPanel";
import { SellerDateFilterButton } from "@/features/seller/components/SellerDateFilterButton";
import { SellerLowStock, SellerLowStockSkeleton } from "@/features/seller/components/SellerLowStock";
import { SellerPerformanceSection, SellerPerformanceSectionSkeleton } from "@/features/seller/components/SellerPerformanceSection";
import { SellerQuickActions } from "@/features/seller/components/SellerQuickActions";
import { SellerSalesTrend, SellerSalesTrendSkeleton } from "@/features/seller/components/SellerSalesTrend";
import { SellerTopProducts, SellerTopProductsSkeleton } from "@/features/seller/components/SellerTopProducts";
import { SellerRecentOrders, SellerRecentOrdersSkeleton } from "@/features/seller/components/SellerRecentOrders";
import { parseSellerOrderTab } from "@/features/seller/constants/order-tabs";
import { parseSellerStockFilter } from "@/features/seller/constants/stock-filters";
import { getCurrentSellerOwner, requireSessionUser } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Dashboard — Seller Portal" };

interface SellerDashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Seller Dashboard: tasks (live, collapsible), shop performance (date range),
 * then recent orders and low stock (live). Every read is scoped to the
 * signed-in seller's shop — money through the `report_*` RPCs, lists and
 * counts through the same owner filter the Orders page uses.
 */
export default async function SellerDashboardPage({ searchParams }: SellerDashboardPageProps) {
  const [user, owner, params] = await Promise.all([
    requireSessionUser(),
    getCurrentSellerOwner(),
    searchParams,
  ]);
  const { from, to } = parseDashboardDateRange(params, getDefaultRange());
  const ordersTab = parseSellerOrderTab(params.ordersTab);
  const stockFilter = parseSellerStockFilter(params.stockFilter);
  const rangeQuery = `from=${from}&to=${to}`;
  const firstName = user.fullName?.split(" ")[0];

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h2 className="text-lg font-semibold text-foreground">
        Welcome back{firstName ? `, ${firstName}` : ""}
      </h2>
      {owner.shopId ? <SellerQuickActions reportsQuery={rangeQuery} /> : null}
    </div>
  );

  if (!owner.shopId) {
    return (
      <div className="flex flex-col gap-6 p-5 lg:p-7">
        {header}
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground">Your account isn&apos;t linked to a shop yet</h3>
          <p className="max-w-xl text-sm text-muted-foreground">
            Sales, orders and stock appear here once an administrator assigns you to one of the RobertJ shops.
          </p>
          <Link href={ROUTES.sellerSettings} className="text-sm font-semibold text-primary underline">
            Check account settings
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      {header}

      <Suspense fallback={<SellerAttentionPanelSkeleton />}>
        <SellerAttentionPanel />
      </Suspense>

      <section aria-labelledby="performance-heading" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="performance-heading" className="text-base font-semibold text-foreground">Shop performance</h2>
            <p className="text-xs text-muted-foreground">Orders placed in the selected dates, compared with the previous equal period.</p>
          </div>
          <SellerDateFilterButton from={from} to={to} />
        </div>

        <Suspense key={`kpi:${from}:${to}`} fallback={<SellerPerformanceSectionSkeleton />}>
          <SellerPerformanceSection from={from} to={to} />
        </Suspense>

        <Suspense key={`trend:${from}:${to}`} fallback={<SellerSalesTrendSkeleton />}>
          <SellerSalesTrend from={from} to={to} />
        </Suspense>

        <Suspense key={`top:${from}:${to}`} fallback={<SellerTopProductsSkeleton />}>
          <SellerTopProducts from={from} to={to} />
        </Suspense>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <Suspense key={`orders:${ordersTab}`} fallback={<SellerRecentOrdersSkeleton />}>
            <SellerRecentOrders tab={ordersTab} baseQuery={rangeQuery} />
          </Suspense>
        </div>
        <div className="min-w-0 xl:col-span-2">
          <Suspense key={`stock:${stockFilter}`} fallback={<SellerLowStockSkeleton />}>
            <SellerLowStock filter={stockFilter} baseQuery={rangeQuery} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
