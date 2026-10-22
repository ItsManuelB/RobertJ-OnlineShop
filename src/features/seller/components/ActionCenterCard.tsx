import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { getLowStockReport, getOrderAttentionCounts } from "@/lib/supabase/queries";

const DOT_CLASS: Record<"info" | "warning" | "danger", string> = {
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-danger",
};

export interface ActionCenterCardProps {
  /** Where "Review →" sends the order-related rows. Defaults to the Seller Portal's own Orders list. Pass `ROUTES.adminOrders` to reuse this same card on the Admin Dashboard. */
  ordersHref?: string;
  /** Where the low-stock row's "Review →" sends. Defaults to the Seller Portal's own Inventory. Pass `ROUTES.adminInventory` for Admin. */
  inventoryHref?: string;
  /** Where the return-requests row's "Review →" sends. Defaults to the Seller Portal's own Returns queue. Pass `ROUTES.adminReturns` for Admin. */
  returnsHref?: string;
}

/**
 * Consolidates the attention signals already surfaced separately in Orders
 * (needs confirmation, COD awaiting cash collection) and Inventory
 * (low/out of stock) into one scannable list — no new queries, just
 * composing what those modules already expose. `getOrderAttentionCounts`/
 * `getLowStockReport` take no scope parameter; RLS alone decides what's
 * visible (a seller's own shop, or everything for an admin), so this same
 * component works unchanged on both the Seller and Admin dashboards — only
 * the review-link destinations differ, which is what `ordersHref`/
 * `inventoryHref` are for.
 */
export async function ActionCenterCard({
  ordersHref = ROUTES.sellerOrders,
  inventoryHref = ROUTES.sellerInventory,
  returnsHref = ROUTES.sellerReturns,
}: ActionCenterCardProps = {}) {
  let needsConfirmation: number;
  let codAwaitingCollection: number;
  let pendingReturnRequests: number;
  let returnsAwaitingReceipt: number;
  let lowStockCount: number;

  try {
    const [attention, lowStock] = await Promise.all([
      getOrderAttentionCounts(),
      getLowStockReport(),
    ]);
    needsConfirmation = attention.needsConfirmation;
    codAwaitingCollection = attention.codAwaitingCollection;
    pendingReturnRequests = attention.pendingReturnRequests;
    returnsAwaitingReceipt = attention.returnsAwaitingReceipt;
    lowStockCount = lowStock.length;
  } catch {
    return <ErrorState message="We couldn't load your action items right now." />;
  }

  const rows: Array<{ tone: "info" | "warning" | "danger"; text: string; href: string }> = [];
  if (needsConfirmation > 0) {
    rows.push({
      tone: "info",
      text: `${needsConfirmation} order${needsConfirmation === 1 ? "" : "s"} need${needsConfirmation === 1 ? "s" : ""} confirmation`,
      href: `${ordersHref}?attentionOnly=true`,
    });
  }
  if (codAwaitingCollection > 0) {
    const noun = codAwaitingCollection === 1 ? "delivery" : "deliveries";
    rows.push({
      tone: "warning",
      text: `${codAwaitingCollection} COD ${noun} awaiting cash collection`,
      href: `${ordersHref}?attentionOnly=true`,
    });
  }
  if (pendingReturnRequests > 0) {
    rows.push({
      tone: "warning",
      text: `${pendingReturnRequests} return request${pendingReturnRequests === 1 ? "" : "s"} awaiting your response`,
      href: returnsHref,
    });
  }
  if (returnsAwaitingReceipt > 0) {
    rows.push({
      tone: "info",
      text: `${returnsAwaitingReceipt} returned item${returnsAwaitingReceipt === 1 ? "" : "s"} shipped back — confirm when ${returnsAwaitingReceipt === 1 ? "it arrives" : "they arrive"}`,
      href: returnsHref,
    });
  }
  if (lowStockCount > 0) {
    rows.push({
      tone: "danger",
      text: `${lowStockCount} product${lowStockCount === 1 ? "" : "s"} low or out of stock`,
      href: inventoryHref,
    });
  }

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-bold text-foreground">Action Center</h2>
        {rows.length === 0 ? (
          <EmptyState
            title="You're all caught up"
            description="No orders or stock need your attention right now."
          />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {rows.map((row) => (
              <div key={row.text} className="flex items-center gap-3 py-3 first:pt-3 last:pb-0">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_CLASS[row.tone]}`} aria-hidden="true" />
                <p className="flex-1 text-sm font-semibold text-foreground">{row.text}</p>
                <Link href={row.href} className="shrink-0 text-xs font-bold text-primary hover:underline">
                  Review →
                </Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ActionCenterCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}
