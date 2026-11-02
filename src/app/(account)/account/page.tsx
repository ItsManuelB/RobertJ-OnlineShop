import type { Metadata } from "next";

import { AccountAttentionPanel } from "@/features/account/components/AccountAttentionPanel";
import { OrderGroupCounts } from "@/features/account/components/OrderGroupCounts";
import { ItemsToReview } from "@/features/account/components/ItemsToReview";
import { RecentOrdersList } from "@/features/account/components/RecentOrdersList";
import { WishlistPreview } from "@/features/account/components/WishlistPreview";
import { getHoldMinutesLeft } from "@/features/account/utils/account-attention";
import { UNPAID_ORDER_EXPIRY_MINUTES } from "@/features/orders/constants/order-lifecycle.constants";
import { CatalogHeader } from "@/features/products/components/CatalogHeader";
import {
  getBuyerOrderLifecycleCounts,
  listBuyerOrders,
  listItemsToReview,
  listWishlistProducts,
  requireSessionUser,
} from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "My Account" };

const RECENT_ORDER_COUNT = 3;
const WISHLIST_PREVIEW_COUNT = 3;
const ITEMS_TO_REVIEW_COUNT = 3;
/** Enough unpaid orders to find the oldest one; the hold only matters for the first few. */
const UNPAID_LOOKUP_SIZE = 20;

export default async function AccountPage() {
  const user = await requireSessionUser();
  const [counts, recent, wishlist, toReview] = await Promise.all([
    getBuyerOrderLifecycleCounts(user.id),
    listBuyerOrders(user.id, { page: 1, pageSize: RECENT_ORDER_COUNT }),
    // The wishlist and review prompts are niceties here; a failed read hides them instead of the page.
    listWishlistProducts(user.id).catch(() => []),
    listItemsToReview(user.id, ITEMS_TO_REVIEW_COUNT).catch(() => ({ items: [], total: 0 })),
  ]);

  const unpaid =
    counts.to_pay > 0
      ? await listBuyerOrders(user.id, {
          page: 1,
          pageSize: UNPAID_LOOKUP_SIZE,
          lifecycleTab: "to_pay",
        }).catch(() => null)
      : null;
  const holdMinutesLeft = getHoldMinutesLeft(
    (unpaid?.items ?? []).map((order) => order.placedAt),
    UNPAID_ORDER_EXPIRY_MINUTES,
  );

  const firstName = user.fullName?.trim().split(" ")[0];

  return (
    <div className="flex flex-col gap-8">
      <CatalogHeader
        eyebrow="My Account"
        title={firstName ? `Hi, ${firstName}` : "My Account"}
        description="Track your orders and keep your details up to date."
      />
      <AccountAttentionPanel
        toPayCount={counts.to_pay}
        holdMinutesLeft={holdMinutesLeft}
        toReceiveCount={counts.to_receive}
        returnCount={counts.return_refund}
        toReviewCount={toReview.total}
      />
      <OrderGroupCounts counts={counts} />
      <RecentOrdersList orders={recent.items} />
      <ItemsToReview items={toReview.items} total={toReview.total} />
      <WishlistPreview
        products={wishlist.slice(0, WISHLIST_PREVIEW_COUNT)}
        total={wishlist.length}
      />
    </div>
  );
}
