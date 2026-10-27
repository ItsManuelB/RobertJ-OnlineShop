import { Suspense } from "react";
import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardDateFilter } from "@/features/dashboard/components/DashboardDateFilter";
import { RecentOrdersCard, RecentOrdersCardSkeleton } from "@/features/dashboard/components/RecentOrdersCard";
import { LowStockCard, LowStockCardSkeleton } from "@/features/dashboard/components/LowStockCard";
import { SellerSalesTrend, SellerSalesTrendSkeleton } from "@/features/seller/components/SellerSalesTrend";
import { ActionCenterCard, ActionCenterCardSkeleton } from "@/features/seller/components/ActionCenterCard";
import { AdminKpiRow, AdminKpiRowSkeleton } from "@/features/admin/components/AdminKpiRow";
import { AdminQuickAccess, AdminQuickAccessSkeleton } from "@/features/admin/components/AdminQuickAccess";
import { OrderStatusPanel } from "@/features/reports/components/OrderStatusPanel";
import { DEFAULT_GRANULARITY } from "@/features/reports/constants/report.constants";
import type { ReportFilters } from "@/features/reports/types/report.types";
import { parseDashboardDateRange } from "@/features/reports/utils/report-range";
import { ROUTES } from "@/constants/routes";
import { requireSessionUser } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Dashboard — Admin Portal" };

interface AdminDashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function ChartCardSkeleton() {
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <Skeleton className="h-40 w-full" />
      </CardContent>
    </Card>
  );
}

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const { from, to } = parseDashboardDateRange(params);
  const filters: ReportFilters = { from, to, granularity: DEFAULT_GRANULARITY, shopId: null };

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Welcome back{user.fullName ? `, ${user.fullName}` : ""}
          </h2>
          <p className="text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening across the marketplace.
          </p>
        </div>
        <DashboardDateFilter from={from} to={to} />
      </div>

      <Suspense fallback={<ActionCenterCardSkeleton />}>
        <ActionCenterCard
          ordersHref={ROUTES.adminOrders}
          inventoryHref={ROUTES.adminInventory}
          returnsHref={ROUTES.adminReturns}
        />
      </Suspense>

      <Suspense key={`kpi:${from}:${to}`} fallback={<AdminKpiRowSkeleton />}>
        <AdminKpiRow from={from} to={to} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense key={`trend:${from}:${to}`} fallback={<SellerSalesTrendSkeleton />}>
            <SellerSalesTrend from={from} to={to} />
          </Suspense>
        </div>
        <Suspense key={`status:${from}:${to}`} fallback={<ChartCardSkeleton />}>
          <OrderStatusPanel filters={filters} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense fallback={<RecentOrdersCardSkeleton />}>
            <RecentOrdersCard viewAllHref={ROUTES.adminOrders} orderHref={ROUTES.adminOrderDetail} />
          </Suspense>
        </div>
        <div className="flex flex-col gap-4">
          <Suspense fallback={<AdminQuickAccessSkeleton />}>
            <AdminQuickAccess />
          </Suspense>
          <Suspense fallback={<LowStockCardSkeleton />}>
            <LowStockCard viewAllHref={ROUTES.adminInventory} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
