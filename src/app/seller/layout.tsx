import type { ReactNode } from "react";

import { ROUTES } from "@/constants/routes";
import { USER_ROLES } from "@/constants/roles";
import { SellerLayout, type SellerNotification } from "@/features/seller";
import {
  getLowStockReport,
  getOrderAttentionCounts,
  getRecentlyConfirmedOrders,
  requireRole,
} from "@/lib/supabase/queries";

/**
 * Real pending-work signals surfaced as notifications — no mock data, no
 * separate notifications table. The "Pending orders" count uses
 * `getOrderAttentionCounts().needsConfirmation` — the same definition as
 * `SellerKpiRow`'s KPI tile, `SellerQuickAccess`'s badge, and the Action
 * Center card — so this bell never disagrees with the rest of the dashboard.
 *
 * "Receipt confirmed" entries (one per order, like the others are
 * aggregates) are the seller-facing half of the buyer's "Confirm Received"
 * action — without this, a seller had no signal at all that a delivered
 * order was ever confirmed. Time-boxed by `getRecentlyConfirmedOrders`
 * itself since, unlike the counts above, there's no seller action left to
 * take that would make the entry disappear on its own.
 *
 * Fulfillment/returns audit finding B1: "Return requests" uses
 * `attentionCounts.pendingReturnRequests` — until this, a buyer-filed
 * return had NO seller-facing signal anywhere (not here, not the KPI row,
 * not a dedicated queue), so a seller could only ever discover one by
 * opening that exact order's page.
 */
async function getSellerNotifications(): Promise<SellerNotification[]> {
  const [attentionCounts, lowStock, recentlyConfirmed] = await Promise.all([
    getOrderAttentionCounts(),
    getLowStockReport(),
    getRecentlyConfirmedOrders(),
  ]);

  const notifications: SellerNotification[] = [];

  if (attentionCounts.needsConfirmation > 0) {
    notifications.push({
      id: "pending-orders",
      title: "Pending orders",
      description: `${attentionCounts.needsConfirmation} order${attentionCounts.needsConfirmation === 1 ? "" : "s"} awaiting confirmation`,
      href: ROUTES.sellerOrders,
      tone: "warning",
    });
  }
  if (attentionCounts.pendingReturnRequests > 0) {
    notifications.push({
      id: "pending-returns",
      title: "Return requests",
      description: `${attentionCounts.pendingReturnRequests} return request${attentionCounts.pendingReturnRequests === 1 ? "" : "s"} awaiting your response`,
      href: ROUTES.sellerReturns,
      tone: "warning",
    });
  }
  if (lowStock.length > 0) {
    notifications.push({
      id: "low-stock",
      title: "Low stock",
      description: `${lowStock.length} product${lowStock.length === 1 ? "" : "s"} running low or out of stock`,
      href: ROUTES.sellerInventory,
      tone: "danger",
    });
  }
  for (const order of recentlyConfirmed) {
    notifications.push({
      id: `receipt-confirmed-${order.id}`,
      title: "Receipt confirmed",
      description: `Buyer confirmed receipt of order ${order.orderNumber}`,
      href: ROUTES.sellerOrderDetail(order.id),
      tone: "info",
    });
  }
  return notifications;
}

export default async function SellerRootLayout({ children }: { children: ReactNode }) {
  const user = await requireRole([USER_ROLES.seller]);
  const notifications = await getSellerNotifications();

  return (
    <SellerLayout user={user} notifications={notifications}>
      {children}
    </SellerLayout>
  );
}
