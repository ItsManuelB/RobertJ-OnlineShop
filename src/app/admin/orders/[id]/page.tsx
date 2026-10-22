import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { THEMED_CARD } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { getBuyerDisplayName } from "@/features/orders/types/order.types";
import { BuyerReceiptConfirmation } from "@/features/orders/components/BuyerReceiptConfirmation";
import { OrderHeader } from "@/features/orders/components/OrderHeader";
import { OrderItemsList } from "@/features/orders/components/OrderItemsList";
import { OrderStatusControl } from "@/features/orders/components/OrderStatusControl";
import { OrderSummary } from "@/features/orders/components/OrderSummary";
import { OrderTimeline } from "@/features/orders/components/OrderTimeline";
import { PaymentStatusBadge } from "@/features/orders/components/PaymentStatusBadge";
import { ShippingAddressCard } from "@/features/orders/components/ShippingAddressCard";
import { MarkCodCollectedButton } from "@/features/payments/components/MarkCodCollectedButton";
import { RecordCodRefundPayoutPanel } from "@/features/returns/components/RecordCodRefundPayoutPanel";
import { RecordReturnConditionPanel } from "@/features/returns/components/RecordReturnConditionPanel";
import { ReturnRequestStatusCard } from "@/features/returns/components/ReturnRequestStatusCard";
import { ReturnShippingActions } from "@/features/returns/components/ReturnShippingActions";
import { RespondToReturnPanel } from "@/features/returns/components/RespondToReturnPanel";
import {
  getDashboardOrder,
  getReturnEvidenceSignedUrl,
  getReturnRequestForOrder,
  hasXenditPaymentAttempt,
} from "@/lib/supabase/queries";
import { RETURN_STATUS } from "@/constants/status";

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: AdminOrderDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  // `null`: admin's unrestricted access is authorized once, at the layout
  // (`requireRole(ADMIN_ONLY_ROLES)`), matching RLS's own `is_admin()` bypass.
  const order = await getDashboardOrder(id, null);
  return { title: order ? `${order.orderNumber} — Admin Portal` : "Order not found" };
}

/** Admin Portal order detail — same composition as the seller dashboard's order detail page, moved to `/admin`. */
export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  const { id } = await params;
  const order = await getDashboardOrder(id, null);

  if (!order) notFound();

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
      <OrderTimeline
        status={order.status}
        themed
        placedAt={order.placedAt}
        confirmedAt={order.confirmedAt}
        processingAt={order.processingAt}
        shippedAt={order.shippedAt}
        deliveredAt={order.deliveredAt}
      />
      <OrderStatusControl
        orderId={order.id}
        orderNumber={order.orderNumber}
        status={order.status}
        items={order.items}
        themed
        paymentRequired={paymentRequired}
      />

      {returnRequest ? (
        <div className="flex flex-col gap-3">
          <ReturnRequestStatusCard request={returnRequest} evidenceUrl={returnEvidenceUrl} themed />
          {returnRequest.status === RETURN_STATUS.pending ? (
            <RespondToReturnPanel returnId={returnRequest.id} />
          ) : null}
          <ReturnShippingActions request={returnRequest} viewer="admin" />
          {returnRequest.status === RETURN_STATUS.refundDue ? (
            <RecordCodRefundPayoutPanel
              returnId={returnRequest.id}
              amountCents={returnRequest.refundAmountCents}
              currency={returnRequest.currency}
            />
          ) : null}
          {returnRequest.status === RETURN_STATUS.refunded &&
          !returnRequest.restockedAt &&
          !returnRequest.markedUnsellableAt ? (
            <RecordReturnConditionPanel returnId={returnRequest.id} />
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <OrderItemsList items={order.items} currency={order.currency} themed />
          <ShippingAddressCard address={order.shippingAddress} themed />
        </div>
        <div className="flex flex-col gap-6">
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
