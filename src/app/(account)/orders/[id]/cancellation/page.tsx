import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { buttonVariants } from "@/components/ui/button";
import { USER_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { CopyOrderIdButton } from "@/features/orders/components/CopyOrderIdButton";
import { OrderItemsList } from "@/features/orders/components/OrderItemsList";
import { paymentMethodLabel } from "@/features/orders/utils/payment-method-label";
import {
  getActivePaymentForOrder,
  getBuyerOrder,
  getShopMembershipBySellerIds,
  requireSessionUser,
} from "@/lib/supabase/queries";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date";

const ROLE_LABELS: Record<string, string> = {
  buyer: "Buyer",
  seller: "Seller",
  admin: "Administrator",
};

interface OrderCancellationPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Cancellation Details" };

/**
 * Buyer-facing "why was this order cancelled" detail — reachable only for
 * the buyer's own orders that are actually cancelled (never for any other
 * status, and never for someone else's order — `getBuyerOrder` already
 * scopes to `buyer_id = auth.uid()`). Linked from `OrderCardActions`'s
 * "View Cancellation Details" action on the Cancelled tab.
 */
export default async function OrderCancellationPage({ params }: OrderCancellationPageProps) {
  const { id } = await params;
  const user = await requireSessionUser();
  const order = await getBuyerOrder(id, user.id);

  if (!order || order.status !== "cancelled") notFound();

  const [shopMembership, activePayment] = await Promise.all([
    getShopMembershipBySellerIds(order.sellerId ? [order.sellerId] : []).catch(
      () => new Map(),
    ),
    getActivePaymentForOrder(order.id).catch(() => null),
  ]);
  const membership = (order.sellerId ? shopMembership.get(order.sellerId) : null) ?? null;
  const shopLabel =
    order.shopName ??
    membership?.shopName ??
    (order.sellerRole === USER_ROLES.seller ? order.sellerName : null) ??
    "RobertJ Seller";

  const requestedByLabel = order.cancelledBy ? (ROLE_LABELS[order.cancelledBy] ?? order.cancelledBy) : "—";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link
          href={ROUTES.orderDetail(order.id)}
          className="text-xs font-semibold text-rj-red-dark hover:underline"
        >
          ← Back
        </Link>
        {order.cancelledAt ? (
          <p className="text-xs text-rj-gray-500">Requested at: {formatDateTime(order.cancelledAt)}</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-rj-gray-100 bg-rj-gray-50 p-5">
        <p className="text-lg font-bold text-rj-red-dark">Cancellation Completed</p>
        {order.cancelledAt ? (
          <p className="mt-1 text-xs text-rj-gray-600">on {formatDateTime(order.cancelledAt)}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-rj-gray-100 p-4">
        <p className="text-sm font-bold text-rj-black">{shopLabel}</p>
        {membership ? (
          <Link
            href={`${ROUTES.products}?shopId=${membership.shopId}`}
            className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}
          >
            View Shop
          </Link>
        ) : null}
      </div>

      <OrderItemsList items={order.items} currency={order.currency} />

      <div className="flex flex-col divide-y divide-rj-gray-100 rounded-2xl border border-rj-gray-100">
        <div className="flex items-center justify-between p-4 text-sm">
          <span className="text-rj-gray-600">Requested by</span>
          <span className="font-semibold text-rj-black">{requestedByLabel}</span>
        </div>
        <div className="flex items-center justify-between p-4 text-sm">
          <span className="text-rj-gray-600">Payment method</span>
          <span className="font-semibold text-rj-black">{paymentMethodLabel(activePayment)}</span>
        </div>
        <div className="flex items-center justify-between p-4 text-sm">
          <span className="text-rj-gray-600">Order ID</span>
          <CopyOrderIdButton value={order.orderNumber} />
        </div>
      </div>

      <div className="rounded-2xl border border-rj-gray-100 p-4">
        <p className="text-sm font-semibold text-rj-black">Reason</p>
        <p className="mt-1 text-sm text-rj-gray-600">
          {order.cancellationReason ?? "No reason was recorded for this cancellation."}
        </p>
      </div>
    </div>
  );
}
