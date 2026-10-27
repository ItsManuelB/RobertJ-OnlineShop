"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { BuyAgainButton } from "@/features/orders/components/BuyAgainButton";
import { CancelOrderButton } from "@/features/orders/components/CancelOrderButton";
import { PaymentStatusBadge } from "@/features/orders/components/PaymentStatusBadge";
import type { LifecycleTab } from "@/features/orders/constants/order-lifecycle.constants";
import type { Order } from "@/features/orders/types/order.types";
import type { OrderGroupInfo } from "@/features/orders/utils/order-grouping";
import { cn } from "@/lib/utils/cn";

export interface OrderCardActionsProps {
  order: Order;
  lifecycleTab: LifecycleTab;
  /** This order's multi-seller checkout group membership, if any — drives the Card grouped-payment UI below. Omitted/null for an ungrouped order. */
  groupInfo?: OrderGroupInfo | null;
}

/**
 * Buyer-only per-tab action row for the `/orders` list, passed into
 * `OrderCard`'s `actions` slot. Composes existing, already-tested actions —
 * never rebuilds payment, cancellation, or return logic. "Contact Seller" is
 * deliberately absent: no messaging feature exists in this codebase.
 */
export function OrderCardActions({ order, lifecycleTab, groupInfo = null }: OrderCardActionsProps) {
  if (lifecycleTab === "to_pay") {
    // `active_payment_channel` only affects the grouping display below —
    // Orders itself never starts, retries, or resumes a payment; it only
    // links to Checkout, the sole place that happens (see
    // docs/payment-ux-architecture-audit.md).
    const channel: "GCASH" | "PAYMAYA" | "CARD" = order.activePaymentChannel ?? "GCASH";
    const isGroup = order.checkoutGroupId !== null;

    // Card-only grouping display, unchanged from before this order's
    // payment CTA was removed: a multi-seller Card payment is one shared
    // attempt across the group, so only the primary member's row links to
    // Checkout; the rest point back at it instead of repeating the link.
    const cardGroupInfo = isGroup && channel === "CARD" ? groupInfo : null;
    const isSecondaryCardMember = cardGroupInfo !== null && !cardGroupInfo.isPrimary;

    return (
      <div className="flex w-full flex-col gap-2">
        {cardGroupInfo ? (
          <p className="text-xs font-semibold text-rj-gray-500">
            {cardGroupInfo.groupSize}-shop order — paid together
          </p>
        ) : null}
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          {isSecondaryCardMember && cardGroupInfo ? (
            <p className="text-xs text-rj-gray-600">
              Included in the payment for order #{cardGroupInfo.primaryOrderNumber} above.
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <PaymentStatusBadge status={order.paymentStatus} paymentMethod={order.paymentMethod} />
              <Link
                href={ROUTES.checkoutResume(order.id)}
                className={cn(buttonVariants({ variant: "rj", size: "rjSm" }))}
              >
                Complete Payment
              </Link>
            </div>
          )}
          {!isGroup ? (
            <CancelOrderButton orderId={order.id} orderNumber={order.orderNumber} />
          ) : null}
        </div>
      </div>
    );
  }

  if (lifecycleTab === "completed") {
    const firstItemId = order.items[0]?.id;
    return (
      <>
        <BuyAgainButton order={order} />
        <Link
          href={`${ROUTES.orderDetail(order.id)}${firstItemId ? `#review-${firstItemId}` : ""}`}
          className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}
        >
          Rate items
        </Link>
        <Link
          href={ROUTES.orderDetail(order.id)}
          className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}
        >
          Request Return
        </Link>
      </>
    );
  }

  if (lifecycleTab === "cancelled") {
    return (
      <>
        <BuyAgainButton order={order} />
        <Link
          href={ROUTES.orderCancellation(order.id)}
          className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}
        >
          View Cancellation Details
        </Link>
      </>
    );
  }

  if (lifecycleTab === "return_refund") {
    return (
      <Link
        href={ROUTES.orderDetail(order.id)}
        className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}
      >
        View Details
      </Link>
    );
  }

  return null;
}
