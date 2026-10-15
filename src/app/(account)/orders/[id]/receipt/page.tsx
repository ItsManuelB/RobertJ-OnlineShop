import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { USER_ROLES } from "@/constants/roles";
import { OrderReceipt } from "@/features/orders/components/OrderReceipt";
import { PrintLabelButton } from "@/features/orders/components/PrintLabelButton";
import { paymentMethodLabel } from "@/features/orders/utils/payment-method-label";
import {
  getActivePaymentForOrder,
  getBuyerOrder,
  getShopMembershipBySellerIds,
  requireSessionUser,
} from "@/lib/supabase/queries";

interface OrderReceiptPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: OrderReceiptPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await requireSessionUser();
  const order = await getBuyerOrder(id, user.id);
  return { title: order ? `Receipt ${order.orderNumber}` : "Receipt not found" };
}

/**
 * Buyer-facing printable receipt — scoped to the signed-in buyer's own order
 * via `getBuyerOrder(id, user.id)` (RLS backs this too). Same print-isolation
 * pattern as the seller's shipping label (`data-print-root`, `@media print`
 * in globals.css): plain HTML, no PDF library. Available for any order
 * status — it documents the purchase itself, not only a delivered one.
 */
export default async function OrderReceiptPage({ params }: OrderReceiptPageProps) {
  const { id } = await params;
  const user = await requireSessionUser();
  const order = await getBuyerOrder(id, user.id);

  if (!order) notFound();

  const shopMembership = await getShopMembershipBySellerIds(
    order.sellerId ? [order.sellerId] : [],
  ).catch(() => new Map<string, { shopId: string; shopName: string }>());
  const membership = (order.sellerId ? shopMembership.get(order.sellerId) : null) ?? null;
  const shopName =
    membership?.shopName ??
    (order.sellerRole === USER_ROLES.seller ? order.sellerName : null);

  const activePayment = await getActivePaymentForOrder(order.id).catch(() => null);

  return (
    <div className="flex flex-col items-center gap-6 p-5 lg:p-7">
      <div className="no-print flex w-full max-w-[420px] items-center justify-between">
        <h1 className="text-sm font-bold text-rj-black">Receipt</h1>
        <PrintLabelButton label="Print receipt" />
      </div>

      <div data-print-root className="w-full">
        <OrderReceipt
          order={order}
          shopName={shopName}
          paymentLabel={paymentMethodLabel(activePayment)}
        />
      </div>
    </div>
  );
}
