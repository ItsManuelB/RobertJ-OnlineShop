import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { RJ_CARD } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { ROUTES } from "@/constants/routes";
import { BuyAgainButton } from "@/features/orders/components/BuyAgainButton";
import { CancelOrderButton } from "@/features/orders/components/CancelOrderButton";
import { DeliveryResolutionChoice } from "@/features/orders/components/DeliveryResolutionChoice";
import { OrderHeader } from "@/features/orders/components/OrderHeader";
import { OrderItemsList } from "@/features/orders/components/OrderItemsList";
import { OrderSummary } from "@/features/orders/components/OrderSummary";
import { OrderTimeline } from "@/features/orders/components/OrderTimeline";
import { PaymentStatusBadge } from "@/features/orders/components/PaymentStatusBadge";
import { ReceiptConfirmedNotice } from "@/features/orders/components/ReceiptConfirmedNotice";
import { SellerShopRow } from "@/features/orders/components/SellerShopRow";
import { ShipmentTrackingCard } from "@/features/orders/components/ShipmentTrackingCard";
import { paymentMethodLabel } from "@/features/orders/utils/payment-method-label";
import { PaymentStatusWatcher } from "@/features/payments/components/PaymentStatusWatcher";
import { ReportProblemPanel } from "@/features/returns/components/ReportProblemPanel";
import { ReturnRequestStatusCard } from "@/features/returns/components/ReturnRequestStatusCard";
import {
  getActivePaymentForOrder,
  getBuyerOrder,
  getOrderIdsForCheckoutGroup,
  getOrderShipment,
  getReturnEvidenceSignedUrl,
  getReturnRequestForOrder,
  getShopMembershipBySellerIds,
  listReviewedOrderItemIds,
  requireSessionUser,
} from "@/lib/supabase/queries";
import { ORDER_STATUS } from "@/constants/status";
import { USER_ROLES } from "@/constants/roles";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: OrderDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await requireSessionUser();
  const order = await getBuyerOrder(id, user.id);
  return { title: order ? order.orderNumber : "Order not found" };
}

export default async function OrderDetailPage({
  params,
}: OrderDetailPageProps) {
  const { id } = await params;
  const user = await requireSessionUser();
  const order = await getBuyerOrder(id, user.id);

  if (!order) notFound();

  // Same resolution as the catalog/PDP (see ProductGrid.tsx's toTileItem):
  // a real shop name when the seller belongs to one, else the seller's own
  // name only if `seller_id` actually resolves to a `seller` account —
  // never an admin's or a demoted account's personal name. Uses the
  // membership variant (not `getShopNamesBySellerIds`) because "View Shop"
  // needs the real `shopId` to filter the catalog, not just a display name.
  const shopMembership = await getShopMembershipBySellerIds(
    order.sellerId ? [order.sellerId] : [],
  ).catch(() => new Map<string, { shopId: string; shopName: string }>());
  const membership = (order.sellerId ? shopMembership.get(order.sellerId) : null) ?? null;
  const shopName =
    membership?.shopName ??
    (order.sellerRole === USER_ROLES.seller ? order.sellerName : null);

  // Fetched unconditionally (not just for pending/failed) — the Payment
  // Information section below needs to correctly label a paid/refunded
  // order's channel too, not only show a failure reason.
  const activePayment = await getActivePaymentForOrder(order.id).catch(() => null);

  // "Write a Review" only applies to a delivered order, and only for items
  // the buyer hasn't already reviewed.
  const reviewedOrderItemIds =
    order.status === ORDER_STATUS.delivered
      ? await listReviewedOrderItemIds(order.items.map((item) => item.id)).catch(
          () => new Set<string>(),
        )
      : new Set<string>();
  const reviewableOrderItemIds =
    order.status === ORDER_STATUS.delivered
      ? new Set(
          order.items
            .map((item) => item.id)
            .filter((id) => !reviewedOrderItemIds.has(id)),
        )
      : undefined;

  // Phase 5A: request_return now also accepts a cancelled order that was
  // already paid (see the migration for why — cancelling a paid order used
  // to leave it with no refund path at all). Mirrors request_return's own
  // precondition exactly so this entry point never offers something the
  // server would reject.
  // Same condition `buyer_order_lifecycle` uses for its "to_pay" bucket
  // (payment_method = 'xendit' AND payment_status IN ('pending','failed')) —
  // recomputed here rather than reading `lifecycleTab` because `getBuyerOrder`
  // doesn't populate it (see `Order.lifecycleTab`'s doc comment). Orders
  // itself never starts/retries a payment — this only decides whether to
  // show a link into Checkout's payment workspace, the sole place that
  // happens (see docs/payment-ux-architecture-audit.md).
  const needsPayment =
    order.paymentMethod === "xendit" &&
    (order.paymentStatus === "pending" || order.paymentStatus === "failed");

  // Reuses the existing checkout-group-membership lookup (already used to
  // build the post-payment redirect) purely to size the grouping indicator
  // below — informational only, no behavior change for any channel.
  const groupSize = order.checkoutGroupId
    ? await getOrderIdsForCheckoutGroup(order.checkoutGroupId)
        .then((ids) => ids.length)
        .catch(() => 1)
    : 1;

  // Fulfillment/returns audit finding A1: `shipped` is included here too —
  // the buyer's own "I received it" (now valid from `shipped`, see
  // `confirm_order_received`) and "item not received" report are both
  // reachable before a seller ever marks the order delivered, so a
  // negligent/inactive seller no longer strands the buyer with zero
  // recourse.
  const canRequestReturn =
    order.status === ORDER_STATUS.delivered ||
    order.status === ORDER_STATUS.shipped ||
    (order.status === ORDER_STATUS.cancelled && order.paymentStatus === "paid");

  // Whole-order return only in this UI (the RPC also supports a per-item
  // scope — see request_return — but a single "Request Return" entry point
  // matches the buyer-facing lifecycle this phase actually asked for).
  const returnRequest = canRequestReturn
    ? await getReturnRequestForOrder(order.id).catch(() => null)
    : null;

  // Shipped or delivered + nothing already filed + not yet confirmed
  // received: the buyer gets the paired "everything's fine"/"it hasn't
  // arrived" vs. "something's wrong" choice (DeliveryResolutionChoice).
  // Once they confirm receipt, the order is resolved and neither path is
  // offered again. A cancelled-but-paid order has no "Confirm Received"
  // counterpart, so it goes straight to the report form.
  const showDeliveryResolution =
    (order.status === ORDER_STATUS.delivered || order.status === ORDER_STATUS.shipped) &&
    !returnRequest &&
    !order.buyerConfirmedReceivedAt;
  const returnEvidenceUrl = returnRequest?.evidencePath
    ? await getReturnEvidenceSignedUrl(returnRequest.evidencePath).catch(() => null)
    : null;

  // Tracking is only meaningful once shipped; fetched read-only (RLS lets the
  // buyer see their own order's shipment). Older shipped orders may have no
  // shipment row — the card handles that gracefully.
  const showTracking =
    order.status === ORDER_STATUS.shipped || order.status === ORDER_STATUS.delivered;
  const shipment = showTracking
    ? await getOrderShipment(order.id).catch(() => null)
    : null;

  return (
    <article className="flex flex-col gap-8">
      <OrderHeader order={order} />
      <OrderTimeline
        status={order.status}
        placedAt={order.placedAt}
        confirmedAt={order.confirmedAt}
        processingAt={order.processingAt}
        shippedAt={order.shippedAt}
        deliveredAt={order.deliveredAt}
      />
      <div className="flex flex-wrap items-center gap-3">
        {order.cancellable ? (
          <CancelOrderButton orderId={order.id} orderNumber={order.orderNumber} />
        ) : null}
        {order.status === ORDER_STATUS.cancelled ? (
          <Link
            href={ROUTES.orderCancellation(order.id)}
            className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}
          >
            View Cancellation Details
          </Link>
        ) : null}
        <Link
          href={ROUTES.orderReceipt(order.id)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}
        >
          Print Receipt
        </Link>
        <BuyAgainButton order={order} sellerName={shopName} />
      </div>

      {showTracking ? (
        <ShipmentTrackingCard shipment={shipment} shippedAt={order.shippedAt} />
      ) : null}

      {needsPayment ? (
        <div className={cn(RJ_CARD, "flex flex-col gap-3 p-5")}>
          {order.checkoutGroupId && groupSize > 1 ? (
            <p className="text-xs font-semibold text-rj-gray-500">
              {groupSize}-shop order — paid together
            </p>
          ) : null}
          <p className="text-sm font-semibold text-rj-black">
            {order.paymentStatus === "failed" ? "Payment failed" : "Payment needed"}
          </p>
          {/* An attempt that already reached Xendit may well be paid — confirm it
              in real time instead of leaving "Unpaid" until a webhook arrives. */}
          {order.paymentStatus === "pending" && activePayment?.xenditPaymentRequestId ? (
            <PaymentStatusWatcher
              {...(activePayment.checkoutGroupId
                ? { checkoutGroupId: activePayment.checkoutGroupId }
                : { orderId: order.id })}
            />
          ) : null}
          <p className="text-xs text-rj-gray-600">
            Complete, retry, or change how you pay for this order in Checkout.
          </p>
          <Link
            href={ROUTES.checkoutResume(order.id)}
            className={cn(buttonVariants({ variant: "rj", size: "rjSm" }), "w-fit")}
          >
            Go to Checkout
          </Link>
        </div>
      ) : null}

      {canRequestReturn ? (
        returnRequest ? (
          <ReturnRequestStatusCard request={returnRequest} evidenceUrl={returnEvidenceUrl} />
        ) : showDeliveryResolution ? (
          <DeliveryResolutionChoice
            orderId={order.id}
            orderNumber={order.orderNumber}
            awaitingDelivery={order.status === ORDER_STATUS.shipped}
          />
        ) : (
          // Return is still allowed (delivered, or cancelled-but-paid) and none
          // is open yet. The paired confirm/report choice above only applies
          // before the buyer confirms receipt; once they have (or for a
          // cancelled-paid order with no confirm step), the report path must
          // still be reachable — a defect found days after "Confirm Received"
          // previously hit a dead end here. Backend `request_return` allows it.
          <div className="flex flex-col gap-3">
            {order.buyerConfirmedReceivedAt ? (
              <ReceiptConfirmedNotice confirmedAt={order.buyerConfirmedReceivedAt} />
            ) : null}
            <ReportProblemPanel orderId={order.id} />
          </div>
        )
      ) : null}

      <SellerShopRow shopName={shopName} shopId={membership?.shopId ?? null} />

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <OrderItemsList
            items={order.items}
            currency={order.currency}
            orderId={order.id}
            reviewableOrderItemIds={reviewableOrderItemIds}
          />
        </div>
        <div className="flex flex-col gap-6">
          <OrderSummary order={order} />
          <section
            aria-label="Payment information"
            className={cn(RJ_CARD, "p-5")}
          >
            <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-400">
              Payment Information
            </h2>
            <div className="mt-3">
              <PaymentStatusBadge status={order.paymentStatus} paymentMethod={order.paymentMethod} />
            </div>
            {order.paymentStatus === "failed" && activePayment?.failureReason ? (
              <p className="mt-3 border-t border-rj-gray-100 pt-3 text-xs text-rj-gray-600">
                <span className="font-semibold text-rj-black">Reason: </span>
                {activePayment.failureReason}
              </p>
            ) : null}
            <p className="mt-3 border-t border-rj-gray-100 pt-3 text-xs text-rj-gray-600">
              Payment method:{" "}
              <span className="font-semibold text-rj-black">
                {paymentMethodLabel(activePayment)}
              </span>
            </p>
          </section>
        </div>
      </div>

      {order.notes ? (
        <section
          aria-label="Order notes"
          className={cn(RJ_CARD, "bg-rj-gray-50 p-5")}
        >
          <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-400">
            Notes
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-rj-gray-600">
            {order.notes}
          </p>
        </section>
      ) : null}
    </article>
  );
}
