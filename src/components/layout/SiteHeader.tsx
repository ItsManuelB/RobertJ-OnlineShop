import { USER_ROLES } from "@/constants/roles";
import { SiteHeaderClient } from "@/components/layout/SiteHeaderClient";
import { GlobalInbox } from "@/features/messages";
import {
  getBuyerActivityFeed,
  getMyBuyerPreferences,
  getSessionUser,
  listActiveCategories,
} from "@/lib/supabase/queries";
import type { SessionUser } from "@/types/common.types";
import type { BuyerActivityEvent } from "@/features/notifications/types/notification.types";

/**
 * Buyer notifications only. Guests and buyers who turned Order Updates off see
 * none (mirrors the `/notifications` page's own gate); seller/admin are not
 * buyers, so the feed is never even loaded for them — no buyer notification
 * data reaches their client payload, and the bell is hidden client-side.
 */
async function loadNotifications(user: SessionUser | null): Promise<BuyerActivityEvent[]> {
  if (!user || user.role !== USER_ROLES.buyer) return [];
  const preferences = await getMyBuyerPreferences(user.id).catch(() => null);
  if (preferences !== null && !preferences.orderUpdates) return [];
  return getBuyerActivityFeed().catch(() => []);
}

/**
 * The single site-wide header — mounted by every route group's layout
 * (marketing, shop, account) so navigation, search, and cart/account access
 * are identical everywhere. Server Component: reads the session and category
 * list directly so no route group needs to fetch/pass them itself.
 */
export async function SiteHeader() {
  const [user, categories] = await Promise.all([
    getSessionUser(),
    listActiveCategories().catch(() => []),
  ]);
  const notifications = await loadNotifications(user);

  return (
    <>
      <SiteHeaderClient user={user} categories={categories} notifications={notifications} />
      {/* Global messages inbox — one mount for every buyer surface (marketing,
          shop, account) that renders this header. Renders nothing for guests. */}
      <GlobalInbox />
    </>
  );
}
