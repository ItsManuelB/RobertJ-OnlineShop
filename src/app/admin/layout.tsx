import type { ReactNode } from "react";

import { ROUTES } from "@/constants/routes";
import { ADMIN_ONLY_ROLES } from "@/constants/roles";
import { RETURN_STATUS } from "@/constants/status";
import type { PortalBadges, PortalNotification } from "@/components/portal/portal.types";
import { AdminLayout } from "@/features/admin";
import {
  getLowStockReport,
  getOrderAttentionCounts,
  getOverduePendingReturnCount,
  listReturnRequests,
  requireRole,
} from "@/lib/supabase/queries";

/**
 * Real pending-work signals surfaced as notifications — no mock data, no
 * separate notifications table. The "Pending orders" count uses
 * `getOrderAttentionCounts().needsConfirmation` — the same definition as
 * `AdminKpiRow`'s KPI tile and `AdminQuickAccess`'s badge — so this bell
 * never disagrees with the rest of the dashboard.
 *
 * Fulfillment/returns audit finding B1: "Returns overdue" is distinct from
 * "Returns awaiting decision" below — it's requests still `pending` (the
 * seller hasn't responded at all) that have crossed `decide_return`'s own
 * overdue threshold, which is the one case admin previously had NO way to
 * even see, let alone act on (the RPC refused anything still `pending`).
 */
async function getPortalNotifications(): Promise<PortalNotification[]> {
  const [attentionCounts, lowStock, pendingReturns, payoutReturns, receivedReturns, overdueReturns] = await Promise.all([
    getOrderAttentionCounts(),
    getLowStockReport(),
    listReturnRequests(RETURN_STATUS.sellerAccepted),
    listReturnRequests(RETURN_STATUS.refundDue),
    listReturnRequests(RETURN_STATUS.returnReceived),
    getOverduePendingReturnCount(),
  ]);

  const notifications: PortalNotification[] = [];

  if (attentionCounts.needsConfirmation > 0) {
    notifications.push({
      id: "pending-orders",
      title: "Pending orders",
      description: `${attentionCounts.needsConfirmation} order${attentionCounts.needsConfirmation === 1 ? "" : "s"} awaiting confirmation`,
      href: ROUTES.adminOrders,
      tone: "warning",
      count: attentionCounts.needsConfirmation,
    });
  }
  if (lowStock.length > 0) {
    notifications.push({
      id: "low-stock",
      title: "Low stock",
      description: `${lowStock.length} product${lowStock.length === 1 ? "" : "s"} running low or out of stock`,
      href: ROUTES.adminInventory,
      tone: "danger",
      count: lowStock.length,
    });
  }
  if (pendingReturns.length > 0) {
    notifications.push({
      id: "pending-returns",
      title: "Returns awaiting decision",
      description: `${pendingReturns.length} return request${pendingReturns.length === 1 ? "" : "s"} need your review`,
      href: ROUTES.adminReturns,
      tone: "warning",
      count: pendingReturns.length,
    });
  }
  if (payoutReturns.length > 0) {
    notifications.push({
      id: "pending-cod-refund-payouts",
      title: "COD refunds to pay out",
      description: `${payoutReturns.length} approved COD refund${payoutReturns.length === 1 ? "" : "s"} waiting for the payout to be recorded`,
      href: ROUTES.adminReturns,
      tone: "warning",
      count: payoutReturns.length,
    });
  }
  if (receivedReturns.length > 0) {
    notifications.push({
      id: "returns-ready-for-refund",
      title: "Returned items ready for refund",
      description: `${receivedReturns.length} returned item${receivedReturns.length === 1 ? "" : "s"} received by the seller — confirm the refund`,
      href: ROUTES.adminReturns,
      tone: "warning",
      count: receivedReturns.length,
    });
  }
  if (overdueReturns > 0) {
    notifications.push({
      id: "overdue-returns",
      title: "Returns overdue",
      description: `${overdueReturns} return request${overdueReturns === 1 ? "" : "s"} unanswered by the seller — you can decide ${overdueReturns === 1 ? "it" : "them"} directly`,
      href: ROUTES.adminReturns,
      tone: "danger",
      count: overdueReturns,
    });
  }

  return notifications;
}

/** Menu badges from the same entries as the bell: items waiting per destination, red only when something is overdue. */
function getAdminNavBadges(notifications: readonly PortalNotification[]): PortalBadges {
  const badges: Record<string, { count: number; urgent?: boolean }> = {};
  for (const entry of notifications) {
    const current = badges[entry.href] ?? { count: 0 };
    badges[entry.href] = {
      count: current.count + (entry.count ?? 1),
      urgent: current.urgent || entry.id === "overdue-returns",
    };
  }
  return badges;
}

export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(ADMIN_ONLY_ROLES);
  const notifications = await getPortalNotifications();

  return (
    <AdminLayout user={user} notifications={notifications} badges={getAdminNavBadges(notifications)}>
      {children}
    </AdminLayout>
  );
}
