import { AlertTriangle, CreditCard, Package, RotateCcw, ShoppingBag, Timer, TrendingUp } from "lucide-react";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { ROUTES } from "@/constants/routes";
import { formatCurrency } from "@/lib/utils/currency";
import {
  getLowStockReport,
  getOrderAttentionCounts,
  getProductCount,
  getSalesSummary,
} from "@/lib/supabase/queries";

export interface AdminKpiRowProps {
  from: string;
  to: string;
}

/**
 * Platform-wide KPI tiles for the Admin Portal dashboard — same data sources
 * as the Shop Owner dashboard's `DashboardKpiRow` (scope is always
 * platform-wide here, so no `isAdmin` branch is needed), restyled to match
 * the Figma Admin Portal's stat-card look.
 *
 * "Pending Orders" uses `getOrderAttentionCounts().needsConfirmation` — the
 * same definition as `AdminQuickAccess`'s badge and the topbar notification
 * bell (excludes a `pending` order whose online payment hasn't completed
 * yet) — not the raw `order_status = 'pending'` count, so this tile can
 * never disagree with those other two surfaces on the same dashboard.
 */
export async function AdminKpiRow({ from, to }: AdminKpiRowProps) {
  let summary: Awaited<ReturnType<typeof getSalesSummary>>;
  let pendingOrders: number;
  let totalProducts: number;
  let lowStockCount: number;
  let returnsAwaitingRestock: number;

  try {
    const [salesSummary, attentionCounts, productCount, lowStock] = await Promise.all([
      getSalesSummary(from, to, null),
      getOrderAttentionCounts(),
      getProductCount(null),
      getLowStockReport(),
    ]);
    summary = salesSummary;
    pendingOrders = attentionCounts.needsConfirmation;
    totalProducts = productCount;
    lowStockCount = lowStock.length;
    returnsAwaitingRestock = attentionCounts.returnsAwaitingRestock;
  } catch {
    return <ErrorState message="We couldn't load the platform overview right now." />;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-7">
      <StatCard
        href={ROUTES.adminReports}
        label="Total Revenue"
        value={formatCurrency(summary.revenueCents)}
        icon={TrendingUp}
        iconBg="bg-primary/10"
        iconColor="text-primary"
      />
      <StatCard
        href={ROUTES.adminOrders}
        label="Total Orders"
        value={summary.totalOrders}
        icon={ShoppingBag}
        iconBg="bg-info/10"
        iconColor="text-info"
      />
      <StatCard
        href={ROUTES.adminOrders}
        label="Pending Orders"
        value={pendingOrders}
        icon={Timer}
        iconBg="bg-warning/10"
        iconColor="text-warning"
      />
      <StatCard
        href={ROUTES.adminProducts}
        label="Total Products"
        value={totalProducts}
        icon={Package}
        iconBg="bg-success/10"
        iconColor="text-success"
      />
      <StatCard
        href={ROUTES.adminInventory}
        label="Low Stock"
        value={lowStockCount}
        icon={AlertTriangle}
        iconBg="bg-danger/10"
        iconColor="text-danger"
      />
      <StatCard
        href={ROUTES.adminPayments}
        label="Online Payments"
        value={summary.xenditPaidOrders}
        icon={CreditCard}
        iconBg="bg-primary/10"
        iconColor="text-primary"
      />
      <StatCard
        href={ROUTES.adminReturns}
        label="Returns Awaiting Restock"
        value={returnsAwaitingRestock}
        icon={RotateCcw}
        iconBg="bg-warning/10"
        iconColor="text-warning"
      />
    </div>
  );
}

export function AdminKpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-7">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="mb-4 h-9 w-9 rounded-lg" />
          <Skeleton className="mb-2 h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
