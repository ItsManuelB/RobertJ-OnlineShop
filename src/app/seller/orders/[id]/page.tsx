import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { THEMED_CARD } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils/cn";
import { getBuyerDisplayName } from "@/features/orders/types/order.types";
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
export default async function SellerOrderDetailPage({ params }: SellerOrderDetailPageProps) {
  const { id } = await params;
  const user = await requireSessionUser();
  const order = await getDashboardOrder(id, { sellerId: user.id, shopId: await getOwnShopId(user.id) });

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
      <OrderTimeline status={order.status} themed />
      <div className="flex flex-col gap-3">
        <OrderStatusControl
          orderId={order.id}
          orderNumber={order.orderNumber}
          status={order.status}
          items={order.items}
          themed
          paymentRequired={paymentRequired}
        />
        {["processing", "shipped", "delivered"].includes(order.status) ? (
          <Link
            href={ROUTES.sellerOrderLabel(order.id)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "rjSm" }), "w-fit")}
          >
            Print shipping label
          </Link>
        ) : null}
      </div>

      {returnRequest ? (
        <div className="flex flex-col gap-3">
          <ReturnRequestStatusCard request={returnRequest} evidenceUrl={returnEvidenceUrl} themed />
          {returnRequest.status === RETURN_STATUS.pending ? (
            <RespondToReturnPanel returnId={returnRequest.id} />
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
