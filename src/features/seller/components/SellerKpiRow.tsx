import { AlertTriangle, CreditCard, Package, RotateCcw, ShoppingBag, Timer, TrendingUp } from "lucide-react";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { StatCard } from "@/components/ui/stat-card";
import { ROUTES } from "@/constants/routes";
import { getPreviousPeriod } from "@/features/reports/utils/report-range";
import { formatCurrency } from "@/lib/utils/currency";
import {
  getLowStockReport,
  getOrderAttentionCounts,
  getOwnShopId,
  getProductCount,
  getSalesSummary,
  requireSessionUser,
} from "@/lib/supabase/queries";

export interface SellerKpiRowProps {
  from: string;
  to: string;
}

/**
 * Shop-scoped KPI tiles for the Seller Portal dashboard — same data sources
 * as `AdminKpiRow`, but `getProductCount` is scoped to the caller's own shop
 * instead of `null`. `getSalesSummary`/`getOrderAttentionCounts`/
 * `getLowStockReport` take no owner argument at all — they resolve to "my
 * shop" vs. "every shop" via RLS on the caller's role, so the same calls as
 * Admin already correctly scope to this seller.
 *
 * "Pending Orders" uses `getOrderAttentionCounts().needsConfirmation` — the
 * same definition as the Action Center card and the topbar notification bell
 * (excludes a `pending` order whose online payment hasn't completed yet,
 * since there's nothing for the seller to act on until it does) — not the
 * raw `order_status = 'pending'` count, so this tile can never disagree with
 * those other two surfaces on the same dashboard.
 */
export async function SellerKpiRow({ from, to }: SellerKpiRowProps) {
  let summary: Awaited<ReturnType<typeof getSalesSummary>>;
  let previousSummary: Awaited<ReturnType<typeof getSalesSummary>>;
  let pendingOrders: number;
  let totalProducts: number;
  let lowStockCount: number;
  let returnsAwaitingRestock: number;

  try {
    const user = await requireSessionUser();
    const owner = { sellerId: user.id, shopId: await getOwnShopId(user.id) };
    const previous = getPreviousPeriod(from, to);
    const [salesSummary, priorSummary, attentionCounts, productCount, lowStock] = await Promise.all([
      getSalesSummary(from, to, null),
      getSalesSummary(previous.from, previous.to, null),
      getOrderAttentionCounts(),
      getProductCount(owner),
      getLowStockReport(),
    ]);
    summary = salesSummary;
    previousSummary = priorSummary;
    pendingOrders = attentionCounts.needsConfirmation;
    totalProducts = productCount;
    lowStockCount = lowStock.length;
    returnsAwaitingRestock = attentionCounts.returnsAwaitingRestock;
  } catch {
    return <ErrorState message="We couldn't load your shop's overview right now." />;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-7">
      <StatCard
        href={ROUTES.sellerReports}
        label="Total Revenue"
        value={
          <span className="inline-flex items-baseline gap-2">
            {formatCurrency(summary.revenueCents)}
            <DeltaBadge current={summary.revenueCents} previous={previousSummary.revenueCents} />
          </span>
        }
        icon={TrendingUp}
        iconBg="bg-primary/10"
        iconColor="text-primary"
      />
      <StatCard
        href={ROUTES.sellerOrders}
        label="Total Orders"
        value={
          <span className="inline-flex items-baseline gap-2">
            {summary.totalOrders}
            <DeltaBadge current={summary.totalOrders} previous={previousSummary.totalOrders} />
          </span>
        }
        icon={ShoppingBag}
        iconBg="bg-info/10"
        iconColor="text-info"
      />
      <StatCard
        href={ROUTES.sellerOrders}
        label="Pending Orders"
        value={pendingOrders}
        icon={Timer}
        iconBg="bg-warning/10"
        iconColor="text-warning"
      />
      <StatCard
        href={ROUTES.sellerProducts}
        label="Total Products"
        value={totalProducts}
        icon={Package}
        iconBg="bg-success/10"
        iconColor="text-success"
      />
      <StatCard
        href={ROUTES.sellerInventory}
        label="Low Stock"
        value={lowStockCount}
        icon={AlertTriangle}
        iconBg="bg-danger/10"
        iconColor="text-danger"
      />
      <StatCard
        href={ROUTES.sellerPayments}
        label="Online Payments"
        value={summary.xenditPaidOrders}
        icon={CreditCard}
        iconBg="bg-primary/10"
        iconColor="text-primary"
      />
      <StatCard
        href={ROUTES.sellerOrders}
        label="Returns Awaiting Restock"
        value={returnsAwaitingRestock}
        icon={RotateCcw}
        iconBg="bg-warning/10"
        iconColor="text-warning"
      />
    </div>
  );
}

export function SellerKpiRowSkeleton() {
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
