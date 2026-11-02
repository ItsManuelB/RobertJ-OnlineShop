import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PAYMENT_STATUS_LABELS } from "@/constants/status";
import { USER_ROLES } from "@/constants/roles";
import { OrderInvoice } from "@/features/orders/components/OrderInvoice";
import { PrintLabelButton } from "@/features/orders/components/PrintLabelButton";
import { paymentMethodLabel } from "@/features/orders/utils/payment-method-label";
import {
  getActivePaymentForOrder,
  getBuyerOrder,
  getShopMembershipBySellerIds,
  requireSessionUser,
} from "@/lib/supabase/queries";

interface OrderInvoicePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: OrderInvoicePageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await requireSessionUser();
  const order = await getBuyerOrder(id, user.id);
  return { title: order ? `Invoice INV-${order.orderNumber}` : "Invoice not found" };
}

/**
 * Buyer-facing printable invoice — a separate document from the receipt
 * (`/orders/[id]/receipt`), which is preserved unchanged. Scoped to the
 * signed-in buyer's own order via `getBuyerOrder(id, user.id)` (RLS backs this
 * too); same `data-print-root` print-isolation pattern as the receipt/label.
 * Available for any order status — it documents the purchase itself.
 */
export default async function OrderInvoicePage({ params }: OrderInvoicePageProps) {
  const { id } = await params;
  const user = await requireSessionUser();
  const order = await getBuyerOrder(id, user.id);

  if (!order) notFound();

  // Same shop/seller name resolution as the receipt + order detail page.
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
      <div className="no-print flex w-full max-w-[640px] items-center justify-between">
        <h1 className="text-sm font-bold text-rj-black">Invoice</h1>
        <PrintLabelButton label="Print invoice" />
      </div>

      <div data-print-root className="w-full">
        <OrderInvoice
          order={order}
          shopName={shopName}
          paymentLabel={paymentMethodLabel(activePayment)}
          paymentStatusLabel={PAYMENT_STATUS_LABELS[order.paymentStatus]}
        />
      </div>
    </div>
  );
}
