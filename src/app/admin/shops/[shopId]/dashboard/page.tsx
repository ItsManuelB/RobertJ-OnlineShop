import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/constants/routes";
import { RecentOrdersCard, RecentOrdersCardSkeleton } from "@/features/dashboard/components/RecentOrdersCard";
import { AdminOrderPipeline, AdminOrderPipelineSkeleton } from "@/features/admin/components/AdminOrderPipeline";
import { AdminShopAttention, AdminShopAttentionSkeleton } from "@/features/admin/components/AdminShopAttention";
import { DashboardRefresh } from "@/features/admin/components/DashboardRefresh";
import { LowStockPanel, ReportCardSkeleton } from "@/features/reports";
import { parseDashboardDateRange } from "@/features/reports/utils/report-range";
import { SellerDateFilterButton } from "@/features/seller/components/SellerDateFilterButton";
import {
  SellerPerformanceSection,
  SellerPerformanceSectionSkeleton,
} from "@/features/seller/components/SellerPerformanceSection";
import { SellerSalesTrend, SellerSalesTrendSkeleton } from "@/features/seller/components/SellerSalesTrend";
import { SellerTopProducts, SellerTopProductsSkeleton } from "@/features/seller/components/SellerTopProducts";
import { getShopById } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Shop Dashboard — Admin Portal" };

interface AdminShopDashboardPageProps {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * One shop's dashboard for the admin, laid out like the Seller dashboard: what needs attention,
 * performance for the chosen dates, then orders and stock. Every panel is scoped to this shop.
 * The parent `/admin` layout enforces the admin role before this page runs.
 */
export default async function AdminShopDashboardPage({
  params,
  searchParams,
}: AdminShopDashboardPageProps) {
  const [{ shopId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(shopId).success) notFound();

  const shop = await getShopById(shopId);
  if (!shop) notFound();

  const { from, to } = parseDashboardDateRange(query);
  const viewAllHref = `${ROUTES.adminOrders}?shopId=${encodeURIComponent(shop.id)}`;

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Link href={ROUTES.adminShops} className="text-xs font-semibold text-primary underline">
            ← All shops
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground">{shop.name}</h1>
            <Badge tone={shop.active ? "success" : "neutral"}>{shop.active ? "Active" : "Inactive"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Admin view of this shop only. Order dates use Asia/Manila time.
          </p>
        </div>
        <DashboardRefresh />
      </div>

      <Suspense key={`attention:${shop.id}`} fallback={<AdminShopAttentionSkeleton />}>
        <AdminShopAttention shopId={shop.id} />
      </Suspense>

      <section aria-labelledby="performance-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="performance-heading" className="text-base font-semibold text-foreground">
              Shop performance
            </h2>
            <p className="text-xs text-muted-foreground">
              Orders placed in the selected dates, compared with the previous equal period.
            </p>
          </div>
          <SellerDateFilterButton from={from} to={to} />
        </div>

        <Suspense key={`kpi:${shop.id}:${from}:${to}`} fallback={<SellerPerformanceSectionSkeleton audience="admin" />}>
          <SellerPerformanceSection from={from} to={to} audience="admin" shopId={shop.id} />
        </Suspense>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-3">
            <Suspense key={`trend:${shop.id}:${from}:${to}`} fallback={<SellerSalesTrendSkeleton />}>
              <SellerSalesTrend from={from} to={to} shopId={shop.id} />
            </Suspense>
          </div>
          <div className="min-w-0 xl:col-span-2">
            <Suspense key={`top:${shop.id}:${from}:${to}`} fallback={<SellerTopProductsSkeleton />}>
              <SellerTopProducts from={from} to={to} audience="admin" shopId={shop.id} />
            </Suspense>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <Suspense key={`orders:${shop.id}:${from}:${to}`} fallback={<RecentOrdersCardSkeleton />}>
            <RecentOrdersCard
              from={from}
              to={to}
              shopId={shop.id}
              viewAllHref={viewAllHref}
              orderHref={ROUTES.adminOrderDetail}
            />
          </Suspense>
        </div>
        <div className="min-w-0 xl:col-span-2">
          <Suspense key={`pipeline:${shop.id}`} fallback={<AdminOrderPipelineSkeleton />}>
            <AdminOrderPipeline shopId={shop.id} />
          </Suspense>
        </div>
      </div>

      <Suspense key={`low-stock:${shop.id}`} fallback={<ReportCardSkeleton />}>
        <LowStockPanel showShop={false} shopId={shop.id} />
      </Suspense>
    </div>
  );
}
