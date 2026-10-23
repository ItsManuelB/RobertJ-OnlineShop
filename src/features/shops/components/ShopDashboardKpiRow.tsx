import { ErrorState } from "@/components/feedback/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { AlertTriangle, ShoppingBag, Timer, TrendingUp } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { formatCurrency } from "@/lib/utils/currency";
import { getLowStockReport, getOrderAttentionCounts, getSalesSummary } from "@/lib/supabase/queries";

export interface ShopDashboardKpiRowProps {
  from: string;
  to: string;
  shopId: string;
}

/** Period totals and current attention snapshots, all scoped to one shop. */
export async function ShopDashboardKpiRow({ from, to, shopId }: ShopDashboardKpiRowProps) {
  let summary: Awaited<ReturnType<typeof getSalesSummary>>;
  let pendingConfirmation: number;
  let lowStockRows: number;

  try {
    const [sales, attention, lowStock] = await Promise.all([
      getSalesSummary(from, to, shopId),
      getOrderAttentionCounts(shopId),
      getLowStockReport(shopId),
    ]);
    summary = sales;
    pendingConfirmation = attention.needsConfirmation;
    lowStockRows = lowStock.length;
  } catch {
    return <ErrorState message="We couldn't load this shop's overview right now." />;
  }

  const reportParams = new URLSearchParams({ from, to, shopId });
  const reportHref = `${ROUTES.adminReports}?${reportParams.toString()}`;
  const ordersParams = new URLSearchParams({ from, to, shopId });
  const ordersHref = `${ROUTES.adminOrders}?${ordersParams.toString()}`;
  const pendingParams = new URLSearchParams({
    shopId,
    status: "pending",
    confirmationRequired: "true",
  });
  const pendingHref = `${ROUTES.adminOrders}?${pendingParams.toString()}`;
  const lowStockParams = new URLSearchParams({ shopId, stockStatus: "needs_attention" });
  const lowStockHref = `${ROUTES.adminInventory}?${lowStockParams.toString()}`;

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatCard
        label="Revenue"
        value={formatCurrency(summary.revenueCents)}
        hint="Net of refunds · selected date range"
        href={reportHref}
        icon={TrendingUp}
        iconBg="bg-primary/10"
        iconColor="text-primary"
      />
      <StatCard
        label="Orders placed"
        value={summary.totalOrders}
        hint="Selected date range"
        href={ordersHref}
        icon={ShoppingBag}
        iconBg="bg-info/10"
        iconColor="text-info"
      />
      <StatCard
        label="Pending confirmation"
        value={pendingConfirmation}
        hint="Current snapshot"
        href={pendingHref}
        icon={Timer}
        iconBg="bg-warning/10"
        iconColor="text-warning"
      />
      <StatCard
        label="Low or out of stock"
        value={lowStockRows}
        hint="Current inventory snapshot"
        href={lowStockHref}
        icon={AlertTriangle}
        iconBg="bg-danger/10"
        iconColor="text-danger"
      />
    </div>
  );
}

export function ShopDashboardKpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="mb-4 h-9 w-9 rounded-lg" />
          <Skeleton className="mb-2 h-7 w-20" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}
