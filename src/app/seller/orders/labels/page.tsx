import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils/cn";
import { MAX_ORDER_SELECTION } from "@/features/orders/order-selection.constants";
import { PrintLabelButton } from "@/features/orders/components/PrintLabelButton";
import { ShippingLabel } from "@/features/orders/components/ShippingLabel";
import { isShippingLabelEligible, type Order } from "@/features/orders/types/order.types";
import {
  getDashboardOrdersByIds,
  getOrderShipment,
  getOwnShopId,
  getShopMembershipBySellerIds,
  requireSessionUser,
} from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Shipping labels — Seller Portal" };

interface SellerOrderLabelsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Bulk shipping-label print view — one print job covering every selected
 * order's label, each on its own page (`.print-page-break`, globals.css).
 * Ids come from `OrdersDataTable`'s "Print labels" bulk action
 * (`ROUTES.sellerOrderLabels`); selected orders are re-scoped to the signed-in
 * seller in one query (RLS backs this too). Orders that aren't found or
 * eligible are skipped; query failures surface as errors instead of looking
 * like an empty selection.
 */
export default async function SellerOrderLabelsPage({ searchParams }: SellerOrderLabelsPageProps) {
  const { ids } = await searchParams;
  const user = await requireSessionUser();
  const shopId = await getOwnShopId(user.id);
  const owner = { sellerId: user.id, shopId };

  const requestedIds = Array.from(
    new Set(
      (typeof ids === "string" ? ids.split(",") : (ids ?? []))
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_ORDER_SELECTION);

  const resolvedOrders = await getDashboardOrdersByIds(requestedIds, owner).catch((error) => {
    console.error("[seller-labels] Failed to load selected orders", error);
    throw error;
  });
  const resolvedById = new Map(resolvedOrders.map((order) => [order.id, order] as const));
  const orders = requestedIds
    .map((id) => resolvedById.get(id))
    .filter((order): order is Order => order !== undefined && isShippingLabelEligible(order));

  if (orders.length === 0) {
    return (
      <div className="p-5 lg:p-7">
        <EmptyState
          title={requestedIds.length === 0 ? "No orders selected" : "No labels to show"}
          description={
            requestedIds.length === 0
              ? "Go back to orders, select the orders you want to print, then choose Print labels."
              : "No labels are available for these selections. Labels are available for To Pack orders and later. Check that you're signed in to the seller account for these orders."
          }
          action={
            <Link href={ROUTES.sellerOrders} className={cn(buttonVariants({ variant: "rj", size: "rjSm" }))}>
              Back to orders
            </Link>
          }
        />
      </div>
    );
  }

  const shipments = await Promise.all(
    orders.map((order) => getOrderShipment(order.id).catch(() => null)),
  );
  // Resolved per order's own seller (a shop can have co-sellers — see
  // "Enable shop-based multi-seller access"), not once for the whole batch:
  // a shared viewer-keyed name would be wrong for any order belonging to a
  // different co-seller. One batched lookup for every distinct seller in
  // the selection, same shape as the single-label page's per-order fallback.
  const distinctSellerIds = Array.from(
    new Set(orders.map((order) => order.sellerId).filter((id): id is string => id !== null)),
  );
  const membership = await getShopMembershipBySellerIds(distinctSellerIds).catch(
    () => new Map<string, { shopId: string; shopName: string }>(),
  );
  const shopNames = orders.map(
    (order) => (order.sellerId ? membership.get(order.sellerId)?.shopName : null) ?? order.sellerName ?? null,
  );

  return (
    <div className="flex flex-col items-center gap-6 p-5 lg:p-7">
      <div className="no-print flex w-full max-w-[420px] items-center justify-between">
        <h1 className="text-sm font-bold text-foreground">
          {orders.length} shipping label{orders.length === 1 ? "" : "s"}
        </h1>
        <PrintLabelButton />
      </div>
      {orders.length < requestedIds.length ? (
        <p className="no-print w-full max-w-[420px] text-xs text-muted-foreground">
          {requestedIds.length - orders.length} selected order
          {requestedIds.length - orders.length === 1 ? " isn't" : "s aren't"} eligible for a label
          and {requestedIds.length - orders.length === 1 ? "was" : "were"} skipped.
        </p>
      ) : null}

      <div data-print-root className="flex w-full flex-col items-center gap-6">
        {orders.map((order, index) => (
          <div
            key={order.id}
            className={cn("w-full", index < orders.length - 1 && "print-page-break")}
          >
            <ShippingLabel order={order} shipment={shipments[index] ?? null} shopName={shopNames[index] ?? null} />
          </div>
        ))}
      </div>
    </div>
  );
}
