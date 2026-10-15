import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintLabelButton } from "@/features/orders/components/PrintLabelButton";
import { ShippingLabel } from "@/features/orders/components/ShippingLabel";
import { isShippingLabelEligible } from "@/features/orders/types/order.types";
import {
  getDashboardOrder,
  getOrderShipment,
  getOwnShopId,
  getShopMembershipBySellerIds,
  requireSessionUser,
} from "@/lib/supabase/queries";

interface SellerOrderLabelPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: SellerOrderLabelPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await requireSessionUser();
  const order = await getDashboardOrder(id, { sellerId: user.id, shopId: await getOwnShopId(user.id) });
  return { title: order ? `Label ${order.orderNumber}` : "Label not found" };
}

/**
 * Seller shipping-label print view. Scoped to the seller's own order or shop
 * via `getDashboardOrder(id, owner)` (RLS backs this too). The
 * `data-print-root` wrapper is what the print stylesheet keeps; everything
 * else (portal chrome, the print button) is hidden when printing.
 */
export default async function SellerOrderLabelPage({ params }: SellerOrderLabelPageProps) {
  const { id } = await params;
  const user = await requireSessionUser();
  const order = await getDashboardOrder(id, { sellerId: user.id, shopId: await getOwnShopId(user.id) });

  // Ownership alone isn't enough — a direct URL visit must be gated by the
  // same eligibility rule the links pointing here already enforce, so this
  // page is genuinely "the single source for label-visibility" (MODULES.md),
  // not just the UI that happens to link to it.
  if (!order || !isShippingLabelEligible(order)) notFound();

  const shipment = await getOrderShipment(order.id).catch(() => null);
  const membership = await getShopMembershipBySellerIds(
    order.sellerId ? [order.sellerId] : [],
  ).catch(() => new Map<string, { shopId: string; shopName: string }>());
  const shopName =
    (order.sellerId ? membership.get(order.sellerId)?.shopName : null) ??
    order.sellerName ??
    null;

  return (
    <div className="flex flex-col items-center gap-6 p-5 lg:p-7">
      <div className="no-print flex w-full max-w-[420px] items-center justify-between">
        <h1 className="text-sm font-bold text-foreground">Shipping label</h1>
        <PrintLabelButton />
      </div>

      <div data-print-root className="w-full">
        <ShippingLabel order={order} shipment={shipment} shopName={shopName} />
      </div>
    </div>
  );
}
