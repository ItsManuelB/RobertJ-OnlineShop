import Image from "next/image";
import Link from "next/link";
import { Package, Store } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { RJ_CARD } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import type { Order } from "@/features/orders/types/order.types";
import type { OrderGroupInfo } from "@/features/orders/utils/order-grouping";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

import { OrderCardActions } from "./OrderCardActions";
import { OrderStatusBadge } from "./OrderStatusBadge";

export interface BuyerOrderCardProps {
  order: Order;
  /** Resolved once, in bulk, by `OrderListSection` — avoids an N+1 shop lookup per card. */
  shopName: string;
  /** Null when the seller has no resolvable shop membership — "View Shop" is omitted rather than linking to an unfiltered/broken catalog view. */
  shopId: string | null;
  /** Null for an ungrouped order, or when its group siblings aren't on this page. Forwarded to `OrderCardActions` for the Card multi-shop grouped-payment UI. */
  groupInfo?: OrderGroupInfo | null;
}

const CANCELLED_BY_LABEL: Record<string, string> = {
  buyer: "Cancelled by you",
  seller: "Cancelled by seller",
  admin: "Cancelled by admin",
};

/**
 * Full Shopee-style order card for the buyer's own `/orders` list: seller
 * row + "View Shop", status top-right, every item as its own row, an order
 * total line, and a bottom action row driven by the order's own lifecycle
 * tab (`OrderCardActions`). Buyer-`/orders`-only — the generic `OrderCard`
 * (shared verbatim by the dashboard/seller/admin portals and the account
 * overview) is untouched and keeps its compact single-line layout there.
 */
export function BuyerOrderCard({ order, shopName, shopId, groupInfo = null }: BuyerOrderCardProps) {
  const lifecycleTab = order.lifecycleTab;
  const cancelledByText =
    order.status === "cancelled" && order.cancelledBy ? CANCELLED_BY_LABEL[order.cancelledBy] : null;

  // Cancelled orders open the cancellation-details experience instead of the
  // normal order-detail page; every other status opens order-detail as usual.
  const cardHref =
    order.status === "cancelled" ? ROUTES.orderCancellation(order.id) : ROUTES.orderDetail(order.id);

  return (
    <div className={cn(RJ_CARD, "relative flex flex-col gap-4 p-4 transition-shadow hover:shadow-md")}>
      {/* Stretched link: makes the whole card clickable/keyboard-focusable
          without nesting an <a> inside the item/View Shop/action links below
          (invalid HTML). It sits at the bottom of paint order (z-0); every
          other interactive element here is given a higher stacking context
          (relative + z-10) so clicks on those still hit them, not this. */}
      <Link
        href={cardHref}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
        aria-label={
          order.status === "cancelled"
            ? `View cancellation details for order ${order.orderNumber}`
            : `View order ${order.orderNumber}`
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Store className="h-4 w-4 shrink-0 text-rj-gray-500" aria-hidden="true" />
          <p className="text-sm font-bold text-rj-black">{shopName}</p>
          {shopId ? (
            <Link
              href={`${ROUTES.products}?shopId=${shopId}`}
              className={cn(
                buttonVariants({ variant: "rjOutline", size: "rjSm" }),
                "relative z-10 h-7 px-3 text-[11px]",
              )}
            >
              View Shop
            </Link>
          ) : null}
        </div>
        <OrderStatusBadge
          status={order.status}
          paymentStatus={order.paymentStatus}
          paymentMethod={order.paymentMethod}
        />
      </div>

      <ul className="flex flex-col divide-y divide-rj-gray-100 border-t border-rj-gray-100">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center gap-4 py-3 first:pt-3">
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt={item.productTitle}
                width={56}
                height={56}
                className="h-14 w-14 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-rj-gray-100 text-rj-gray-400">
                <Package className="h-5 w-5" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              {item.productSlug ? (
                <Link
                  href={ROUTES.productDetail(item.productSlug)}
                  className="relative z-10 text-sm font-semibold text-rj-black hover:underline"
                >
                  {item.productTitle}
                </Link>
              ) : (
                <p className="text-sm font-semibold text-rj-black">{item.productTitle}</p>
              )}
              {item.variantLabel ? (
                <p className="mt-0.5 text-xs text-rj-gray-500">Variation: {item.variantLabel}</p>
              ) : null}
              <p className="mt-0.5 text-xs text-rj-gray-600">x{item.quantity}</p>
            </div>
            <p className="shrink-0 text-sm font-bold text-rj-black">
              {formatCurrency(item.subtotalCents, order.currency)}
            </p>
          </li>
        ))}
      </ul>

      <p className="text-right text-sm">
        <span className="text-rj-gray-600">Order Total: </span>
        <span className="text-base font-bold text-rj-red-dark">
          {formatCurrency(order.totalCents, order.currency)}
        </span>
      </p>

      {lifecycleTab === "to_pay" ? (
        <div className="relative z-10 border-t border-rj-gray-100 pt-3">
          <OrderCardActions order={order} lifecycleTab={lifecycleTab} groupInfo={groupInfo} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rj-gray-100 pt-3">
          <p className="text-xs text-rj-gray-500">{cancelledByText}</p>
          <div className="relative z-10 flex flex-wrap justify-end gap-2">
            {lifecycleTab ? <OrderCardActions order={order} lifecycleTab={lifecycleTab} groupInfo={groupInfo} /> : null}
          </div>
        </div>
      )}
    </div>
  );
}
