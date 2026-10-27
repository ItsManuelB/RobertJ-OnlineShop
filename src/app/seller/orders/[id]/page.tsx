import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { THEMED_CARD } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils/cn";
import { getBuyerDisplayName, isShippingLabelEligible } from "@/features/orders/types/order.types";
import { BuyerReceiptConfirmation } from "@/features/orders/components/BuyerReceiptConfirmation";
import { OrderCancellationSection } from "@/features/orders/components/OrderCancellationSection";
import { OrderHeader } from "@/features/orders/components/OrderHeader";
import { OrderItemsList } from "@/features/orders/components/OrderItemsList";
import { OrderStatusControl } from "@/features/orders/components/OrderStatusControl";
import { OrderSummary } from "@/features/orders/components/OrderSummary";
import { OrderTimeline } from "@/features/orders/components/OrderTimeline";
import { PaymentStatusBadge } from "@/features/orders/components/PaymentStatusBadge";
import { ShippingAddressCard } from "@/features/orders/components/ShippingAddressCard";
import { MarkCodCollectedButton } from "@/features/payments/components/MarkCodCollectedButton";
import { RecordReturnConditionPanel } from "@/features/returns/components/RecordReturnConditionPanel";
import { ReturnRequestStatusCard } from "@/features/returns/components/ReturnRequestStatusCard";
import { ReturnShippingActions } from "@/features/returns/components/ReturnShippingActions";
import { RespondToReturnPanel } from "@/features/returns/components/RespondToReturnPanel";
import {
  getDashboardOrder,
  getOwnShopId,
  getReturnEvidenceSignedUrl,
  getReturnRequestForOrder,
  hasXenditPaymentAttempt,
  requireSessionUser,
} from "@/lib/supabase/queries";
import { RETURN_STATUS } from "@/constants/status";

interface SellerOrderDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: SellerOrderDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await requireSessionUser();
  const order = await getDashboardOrder(id, { sellerId: user.id, shopId: await getOwnShopId(user.id) });
  return { title: order ? `${order.orderNumber} — Seller Portal` : "Order not found" };
}

/** Seller Portal order detail — same composition as the Admin Portal's order detail page. */
export default async function SellerOrderDetailPage({ params, searchParams }: SellerOrderDetailPageProps) {
  const { id } = await params;
  const { scan } = await searchParams;
  const user = await requireSessionUser();
  const order = await getDashboardOrder(id, { sellerId: user.id, shopId: await getOwnShopId(user.id) });

  if (!order) notFound();

  // `?scan=ship` is set by the barcode scanner when it resolved a Ready for
  // Pickup order — pre-opens the ship-confirmation form so the seller lands
  // straight on "enter courier + tracking" instead of an extra click. Only
  // honored when the order is actually still "processing" (a stale/replayed
  // link on an order that moved on in the meantime is a no-op, not an error).
  const autoOpenShipment = scan === "ship" && order.status === "processing";

  // Same signal `advanceOrderStatus` uses server-side: a not-yet-paid order
  // only blocks fulfilment advancement if it's actually a Xendit order (COD
  // sits at "pending" until delivery and must stay unaffected).
  const paymentRequired =
    order.paymentStatus !== "paid" && (await hasXenditPaymentAttempt(order.id));

  const returnRequest = await getReturnRequestForOrder(order.id).catch(() => null);
  const returnEvidenceUrl = returnRequest?.evidencePath
    ? await getReturnEvidenceSignedUrl(returnRequest.evidencePath).catch(() => null)
    : null;

  return (
    <article className="flex flex-col gap-8 p-5 lg:p-7">
      <OrderHeader order={order} themed />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
        <OrderStatusControl
          // Forces a remount per order — otherwise a client-side navigation
          // between two different "processing" orders (both via the barcode
          // scanner's `?scan=ship`) could reuse the same component instance,
          // and autoOpenShipment's lazy useState initializer would never
          // re-run for the second scan in the same session.
          key={order.id}
          orderId={order.id}
          orderNumber={order.orderNumber}
          status={order.status}
          items={order.items}
          themed
          paymentRequired={paymentRequired}
          autoOpenShipment={autoOpenShipment}
          extraActions={
            isShippingLabelEligible(order) ? (
              <Link
                href={ROUTES.sellerOrderLabel(order.id)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}
              >
                Print shipping label
              </Link>
            ) : null
          }
        />

        <OrderTimeline
          status={order.status}
          themed
          placedAt={order.placedAt}
          confirmedAt={order.confirmedAt}
          processingAt={order.processingAt}
          shippedAt={order.shippedAt}
          deliveredAt={order.deliveredAt}
        />
        <OrderCancellationSection
          orderId={order.id}
          viewer="dashboard"
          paidOnline={order.paymentMethod === "xendit"}
        />

        {returnRequest ? (
          <div className="flex flex-col gap-3">
            <ReturnRequestStatusCard request={returnRequest} evidenceUrl={returnEvidenceUrl} themed />
            {returnRequest.status === RETURN_STATUS.pending ? (
              <RespondToReturnPanel returnId={returnRequest.id} />
            ) : null}
            <ReturnShippingActions request={returnRequest} viewer="seller" />
            {returnRequest.status === RETURN_STATUS.refunded &&
            !returnRequest.restockedAt &&
            !returnRequest.markedUnsellableAt ? (
              <RecordReturnConditionPanel returnId={returnRequest.id} />
            ) : null}
          </div>
        ) : null}

        <OrderItemsList items={order.items} currency={order.currency} themed />
        <ShippingAddressCard address={order.shippingAddress} themed />
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-4">
          <OrderSummary order={order} themed />
          <section aria-label="Buyer and payment" className={cn(THEMED_CARD, "p-5")}>
            <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">Buyer</h2>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {getBuyerDisplayName(order)}
            </p>
            {order.buyerConfirmedReceivedAt ? (
              <div className="mt-3">
                <BuyerReceiptConfirmation confirmedAt={order.buyerConfirmedReceivedAt} />
              </div>
            ) : null}
            <div className="mt-3 border-t border-border pt-3">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
                Payment
              </h2>
              <div className="mt-2">
                <PaymentStatusBadge status={order.paymentStatus} paymentMethod={order.paymentMethod} />
              </div>
              {order.paymentMethod === "cod" &&
              order.paymentStatus === "pending" &&
              (order.status === "shipped" || order.status === "delivered") ? (
                <div className="mt-3">
                  <MarkCodCollectedButton orderId={order.id} />
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      {order.notes ? (
        <section aria-label="Order notes" className={cn(THEMED_CARD, "bg-muted p-5")}>
          <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">Notes</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{order.notes}</p>
        </section>
      ) : null}
    </article>
  );
}
