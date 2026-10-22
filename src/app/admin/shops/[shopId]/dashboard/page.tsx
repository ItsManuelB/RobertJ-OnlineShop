import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { DashboardDateFilter } from "@/features/dashboard/components/DashboardDateFilter";
import { RecentOrdersCard, RecentOrdersCardSkeleton } from "@/features/dashboard/components/RecentOrdersCard";
import {
  LowStockPanel,
  OrderStatusPanel,
  ReportCardSkeleton,
  SalesTrendPanel,
  TopProductsPanel,
} from "@/features/reports";
import { DEFAULT_GRANULARITY } from "@/features/reports/constants/report.constants";
import type { ReportFilters } from "@/features/reports/types/report.types";
import { parseDashboardDateRange } from "@/features/reports/utils/report-range";
import { ShopDashboardKpiRow, ShopDashboardKpiRowSkeleton } from "@/features/shops/components/ShopDashboardKpiRow";
import { getShopById } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Shop Dashboard — Admin Portal" };

interface AdminShopDashboardPageProps {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function ChartCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <Skeleton className="h-40 w-full" />
      </CardContent>
    </Card>
  );
}

/** The parent `/admin` layout enforces the admin role before this page runs. */
export default async function AdminShopDashboardPage({
  params,
  searchParams,
}: AdminShopDashboardPageProps) {
  const [{ shopId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(shopId).success) notFound();

  const shop = await getShopById(shopId);
  if (!shop) notFound();

  const { from, to } = parseDashboardDateRange(query);
  const filters: ReportFilters = {
    from,
    to,
    granularity: DEFAULT_GRANULARITY,
    shopId: shop.id,
  };
  const viewAllHref = `${ROUTES.adminOrders}?shopId=${encodeURIComponent(shop.id)}`;

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-3">
          <Link href={ROUTES.adminShops} className="text-xs font-semibold text-primary underline">
            ← All shops
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">{shop.name}</h1>
              <Badge tone={shop.active ? "success" : "neutral"}>
                {shop.active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Admin view · scoped to this shop · order metrics use Asia/Manila dates
            </p>
          </div>
        </div>
        <DashboardDateFilter from={from} to={to} />
      </div>

      <Suspense key={`shop-kpis:${shop.id}:${from}:${to}`} fallback={<ShopDashboardKpiRowSkeleton />}>
        <ShopDashboardKpiRow from={from} to={to} shopId={shop.id} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense key={`shop-trend:${shop.id}:${from}:${to}`} fallback={<ChartCardSkeleton />}>
            <SalesTrendPanel filters={filters} />
          </Suspense>
        </div>
        <Suspense key={`shop-status:${shop.id}:${from}:${to}`} fallback={<ChartCardSkeleton />}>
          <OrderStatusPanel filters={filters} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense key={`shop-orders:${shop.id}:${from}:${to}`} fallback={<RecentOrdersCardSkeleton />}>
            <RecentOrdersCard
              from={from}
              to={to}
              shopId={shop.id}
              viewAllHref={viewAllHref}
              orderHref={ROUTES.adminOrderDetail}
            />
          </Suspense>
        </div>
        <Suspense key={`shop-top-products:${shop.id}:${from}:${to}`} fallback={<ReportCardSkeleton />}>
          <TopProductsPanel filters={filters} />
        </Suspense>
      </div>

      <Suspense key={`shop-low-stock:${shop.id}`} fallback={<ReportCardSkeleton />}>
        <LowStockPanel showShop={false} shopId={shop.id} />
      </Suspense>
    </div>
  );
}
