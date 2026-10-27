import type { ReactNode } from "react";

import { ROUTES } from "@/constants/routes";
import { USER_ROLES } from "@/constants/roles";
import type { PortalBadges, PortalNotification, PortalShopCard } from "@/components/portal/portal.types";
import { SellerLayout } from "@/features/seller";
import { buildSellerNavBadges, type SellerTask } from "@/features/seller/utils/seller-tasks";
import { getSellerTaskList } from "@/features/seller/utils/seller-tasks.server";
import {
  countShopReviewsNeedingReply,
  getCurrentSellerOwner,
  getRecentlyConfirmedOrders,
  getShopById,
  requireRole,
} from "@/lib/supabase/queries";

/**
 * Real pending-work signals surfaced as notifications — no mock data, no
 * separate notifications table. The task entries come from
 * `getSellerTaskList()`, the same list as the dashboard's "Needs your
 * attention" panel and the menu badges, so none of them can disagree. Everything is
 * scoped to the seller's own shop (RLS alone would also return orders they
 * placed as a buyer).
 *
 * "Receipt confirmed" entries (one per order) are the seller-facing half of
 * the buyer's "Confirm Received" action, time-boxed by
 * `getRecentlyConfirmedOrders` since no seller action would clear them.
 */
async function getSellerNotifications(tasks: readonly SellerTask[]): Promise<PortalNotification[]> {
  const owner = await getCurrentSellerOwner();
  if (!owner.shopId) return [];

  const recentlyConfirmed = await getRecentlyConfirmedOrders(5, owner);

  const notifications: PortalNotification[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: `${task.count} ${task.count === 1 ? "item" : "items"} waiting`,
    href: task.href,
    tone: task.tone,
    count: task.count,
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

/** The sidebar's shop card: name, status, public page and the three-step profile checklist. A failed read hides the card instead of breaking the portal. */
async function getSellerShopCard(): Promise<PortalShopCard> {
  const owner = await getCurrentSellerOwner();
  if (!owner.shopId) return { kind: "none", settingsHref: ROUTES.sellerSettings };
  const shop = await getShopById(owner.shopId);
  if (!shop) return { kind: "none", settingsHref: ROUTES.sellerSettings };

  const steps = [Boolean(shop.logoUrl), Boolean(shop.bannerUrl), Boolean(shop.description?.trim())];
  const done = steps.filter(Boolean).length;
  return {
    kind: "shop",
    name: shop.name,
    active: shop.active,
    publicHref: ROUTES.shopCatalog(shop.id),
    setup: done === steps.length ? null : { done, total: steps.length, href: ROUTES.sellerShop },
  };
}

export default async function SellerRootLayout({ children }: { children: ReactNode }) {
  const user = await requireRole([USER_ROLES.seller]);
  const [tasks, shop, owner] = await Promise.all([
    getSellerTaskList().catch(() => [] as SellerTask[]),
    getSellerShopCard().catch(() => null),
    getCurrentSellerOwner().catch(() => null),
  ]);
  // Unanswered low ratings; a failed count just shows no badge.
  const reviewsToAnswer = owner?.shopId ? await countShopReviewsNeedingReply(owner.shopId).catch(() => 0) : 0;
  const notifications = await getSellerNotifications(tasks);
  const badges: PortalBadges = {
    ...buildSellerNavBadges(tasks, {
      orders: ROUTES.sellerOrders,
      returns: ROUTES.sellerReturns,
      payments: ROUTES.sellerPayments,
      inventory: ROUTES.sellerInventory,
    }),
    ...(reviewsToAnswer > 0 ? { [ROUTES.sellerReviews]: { count: reviewsToAnswer } } : {}),
  };

  return (
    <SellerLayout user={user} notifications={notifications} badges={badges} shop={shop}>
      {children}
    </SellerLayout>
  );
}
