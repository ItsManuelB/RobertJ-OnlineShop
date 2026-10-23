import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { RETURN_STATUS } from "@/constants/status";
import { getOrderAttentionCounts, listReturnRequests } from "@/lib/supabase/queries";

/**
 * Shortcut tiles for the Admin Portal dashboard, with real pending-work
 * counts (no mock badges). The "Pending Orders" badge uses
 * `getOrderAttentionCounts().needsConfirmation` — the same definition as
 * `AdminKpiRow`'s KPI tile and the topbar notification bell — so this
 * dashboard never shows two different numbers for the same thing.
 */
export async function AdminQuickAccess() {
  let pendingOrders: number;
  let pendingReturns: number;

  try {
    const [attentionCounts, returns, payouts, received] = await Promise.all([
      getOrderAttentionCounts(),
      listReturnRequests(RETURN_STATUS.sellerAccepted),
      listReturnRequests(RETURN_STATUS.refundDue),
      listReturnRequests(RETURN_STATUS.returnReceived),
    ]);
    pendingOrders = attentionCounts.needsConfirmation;
    pendingReturns = returns.length + payouts.length + received.length;
  } catch {
    return <ErrorState message="We couldn't load quick actions right now." />;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Quick Access</h2>
      <div className="grid grid-cols-2 gap-2">
        <Link
          href={ROUTES.adminProducts}
          className="flex flex-col items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-3 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Add Product</span>
        </Link>
        <Link
          href={ROUTES.adminOrders}
          className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-3 text-xs font-medium text-foreground transition-all hover:bg-muted"
        >
          <span>Pending Orders</span>
          {pendingOrders > 0 && <Badge tone="danger">{pendingOrders}</Badge>}
        </Link>
        <Link
          href={ROUTES.adminReturns}
          className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-3 text-xs font-medium text-foreground transition-all hover:bg-muted"
        >
          <span>Process Returns</span>
          {pendingReturns > 0 && <Badge tone="danger">{pendingReturns}</Badge>}
        </Link>
        <Link
          href={ROUTES.adminReports}
          className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-3 text-xs font-medium text-foreground transition-all hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <span>Generate Report</span>
        </Link>
      </div>
    </div>
  );
}

export function AdminQuickAccessSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Skeleton className="mb-3 h-5 w-24" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
