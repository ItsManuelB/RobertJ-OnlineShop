import { Suspense } from "react";
import type { Metadata } from "next";

import { ROUTES } from "@/constants/routes";
import { RecentOrdersCard, RecentOrdersCardSkeleton } from "@/features/dashboard/components/RecentOrdersCard";
import { LowStockCard, LowStockCardSkeleton } from "@/features/dashboard/components/LowStockCard";
import { AdminAttentionPanel, AdminAttentionPanelSkeleton } from "@/features/admin/components/AdminAttentionPanel";
import { AdminGlanceStrip, AdminGlanceStripSkeleton } from "@/features/admin/components/AdminGlanceStrip";
import { AdminTopShops, AdminTopShopsSkeleton } from "@/features/admin/components/AdminTopShops";
import {
  SellerDateFilterButton,
} from "@/features/seller/components/SellerDateFilterButton";
import {
  SellerPerformanceSection,
  SellerPerformanceSectionSkeleton,
} from "@/features/seller/components/SellerPerformanceSection";
import { SellerSalesTrend, SellerSalesTrendSkeleton } from "@/features/seller/components/SellerSalesTrend";
import { parseDashboardDateRange } from "@/features/reports/utils/report-range";
import { requireSessionUser } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Dashboard — Admin Portal" };

interface AdminDashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  const [user, params] = await Promise.all([requireSessionUser(), searchParams]);
  const { from, to } = parseDashboardDateRange(params);
  const firstName = user.fullName?.split(" ")[0];

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back{firstName ? `, ${firstName}` : ""}. Here is what needs you today and how the marketplace is doing.
        </p>
      </div>

      <Suspense fallback={<AdminAttentionPanelSkeleton />}>
        <AdminAttentionPanel />
      </Suspense>

      <section aria-labelledby="performance-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="performance-heading" className="text-base font-semibold text-foreground">
              Marketplace performance
            </h2>
            <p className="text-xs text-muted-foreground">
              Orders placed in the selected dates across all shops, compared with the previous equal period.
            </p>
          </div>
          <SellerDateFilterButton from={from} to={to} />
        </div>

        <Suspense key={`kpi:${from}:${to}`} fallback={<SellerPerformanceSectionSkeleton audience="admin" />}>
          <SellerPerformanceSection from={from} to={to} audience="admin" />
        </Suspense>

        <Suspense key={`glance:${from}:${to}`} fallback={<AdminGlanceStripSkeleton />}>
          <AdminGlanceStrip from={from} to={to} />
        </Suspense>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-3">
            <Suspense key={`trend:${from}:${to}`} fallback={<SellerSalesTrendSkeleton />}>
              <SellerSalesTrend from={from} to={to} />
            </Suspense>
          </div>
          <div className="min-w-0 xl:col-span-2">
            <Suspense key={`shops:${from}:${to}`} fallback={<AdminTopShopsSkeleton />}>
              <AdminTopShops from={from} to={to} />
            </Suspense>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <Suspense fallback={<RecentOrdersCardSkeleton />}>
            <RecentOrdersCard viewAllHref={ROUTES.adminOrders} orderHref={ROUTES.adminOrderDetail} />
          </Suspense>
        </div>
        <div className="min-w-0 xl:col-span-2">
          <Suspense fallback={<LowStockCardSkeleton />}>
            <LowStockCard viewAllHref={ROUTES.adminInventory} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
