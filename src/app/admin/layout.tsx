import type { ReactNode } from "react";

import { ROUTES } from "@/constants/routes";
import { ADMIN_ONLY_ROLES } from "@/constants/roles";
import { RETURN_STATUS } from "@/constants/status";
import { AdminLayout, type AdminNotification } from "@/features/admin";
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
async function getAdminNotifications(): Promise<AdminNotification[]> {
  const [attentionCounts, lowStock, pendingReturns, overdueReturns] = await Promise.all([
    getOrderAttentionCounts(),
    getLowStockReport(),
    listReturnRequests(RETURN_STATUS.sellerAccepted),
    getOverduePendingReturnCount(),
  ]);

  const notifications: AdminNotification[] = [];

  if (attentionCounts.needsConfirmation > 0) {
    notifications.push({
      id: "pending-orders",
      title: "Pending orders",
      description: `${attentionCounts.needsConfirmation} order${attentionCounts.needsConfirmation === 1 ? "" : "s"} awaiting confirmation`,
      href: ROUTES.adminOrders,
      tone: "warning",
    });
  }
  if (lowStock.length > 0) {
    notifications.push({
      id: "low-stock",
      title: "Low stock",
      description: `${lowStock.length} product${lowStock.length === 1 ? "" : "s"} running low or out of stock`,
      href: ROUTES.adminInventory,
      tone: "danger",
    });
  }
  if (pendingReturns.length > 0) {
    notifications.push({
      id: "pending-returns",
      title: "Returns awaiting decision",
      description: `${pendingReturns.length} return request${pendingReturns.length === 1 ? "" : "s"} need your review`,
      href: ROUTES.adminReturns,
      tone: "warning",
    });
  }
  if (overdueReturns > 0) {
    notifications.push({
      id: "overdue-returns",
      title: "Returns overdue",
      description: `${overdueReturns} return request${overdueReturns === 1 ? "" : "s"} unanswered by the seller — you can decide ${overdueReturns === 1 ? "it" : "them"} directly`,
      href: ROUTES.adminReturns,
      tone: "danger",
    });
  }

  return notifications;
}

export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(ADMIN_ONLY_ROLES);
  const notifications = await getAdminNotifications();

  return (
    <AdminLayout user={user} notifications={notifications}>
      {children}
    </AdminLayout>
  );
}
