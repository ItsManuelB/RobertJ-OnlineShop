import type { ReactNode } from "react";

import { ROUTES } from "@/constants/routes";
import { USER_ROLES } from "@/constants/roles";
import { SellerLayout, type SellerNotification } from "@/features/seller";
import { getSellerTaskList } from "@/features/seller/utils/seller-tasks.server";
import { getCurrentSellerOwner, getRecentlyConfirmedOrders, requireRole } from "@/lib/supabase/queries";

/**
 * Real pending-work signals surfaced as notifications — no mock data, no
 * separate notifications table. The task entries come from
 * `getSellerTaskList()`, the same list as the dashboard's "Needs your
 * attention" panel, so this bell can never disagree with it. Everything is
 * scoped to the seller's own shop (RLS alone would also return orders they
 * placed as a buyer).
 *
 * "Receipt confirmed" entries (one per order) are the seller-facing half of
 * the buyer's "Confirm Received" action, time-boxed by
 * `getRecentlyConfirmedOrders` since no seller action would clear them.
 */
async function getSellerNotifications(): Promise<SellerNotification[]> {
  const owner = await getCurrentSellerOwner();
  if (!owner.shopId) return [];

  const [tasks, recentlyConfirmed] = await Promise.all([
    getSellerTaskList(),
    getRecentlyConfirmedOrders(5, owner),
  ]);

  const notifications: SellerNotification[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: `${task.count} ${task.count === 1 ? "item" : "items"} waiting`,
    href: task.href,
    tone: task.tone,
  }));
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
