import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils/cn";
import { PrintLabelButton } from "@/features/orders/components/PrintLabelButton";
import { ShippingLabel } from "@/features/orders/components/ShippingLabel";
import { isShippingLabelEligible, type Order } from "@/features/orders/types/order.types";
import {
  getDashboardOrder,
  getOrderShipment,
  getOwnShopId,
  getShopMembershipBySellerIds,
  requireSessionUser,
} from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Shipping labels — Seller Portal" };

interface SellerOrderLabelsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Mirrors OrdersDataTable's own MAX_SELECTION — a bulk print job is already
// capped at selection time; this just guards a hand-edited/replayed URL too.
const MAX_BULK_LABELS = 100;

/**
 * Bulk shipping-label print view — one print job covering every selected
 * order's label, each on its own page (`.print-page-break`, globals.css).
 * Ids come from `OrdersDataTable`'s "Print labels" bulk action
 * (`ROUTES.sellerOrderLabels`); each is independently re-scoped to the
 * signed-in seller via `getDashboardOrder`'s owner filter (RLS backs this
 * too) — an id that isn't found or isn't this seller's is silently skipped,
 * never a hard error, since the list is just whatever was selected on screen.
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
  ).slice(0, MAX_BULK_LABELS);

  const resolvedOrders = await Promise.all(
    requestedIds.map((id) => getDashboardOrder(id, owner).catch(() => null)),
  );
  const orders = resolvedOrders.filter(
    (order): order is Order => order !== null && isShippingLabelEligible(order),
  );

  if (orders.length === 0) {
    return (
      <div className="p-5 lg:p-7">
        <EmptyState
          title="No labels to show"
          description="None of the selected orders have a shipping label yet — only To Pack orders onward do."
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
  const membership = await getShopMembershipBySellerIds([user.id]).catch(
    () => new Map<string, { shopId: string; shopName: string }>(),
  );
  const shopName = membership.get(user.id)?.shopName ?? orders[0]?.sellerName ?? null;

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
            <ShippingLabel order={order} shipment={shipments[index] ?? null} shopName={shopName} />
          </div>
        ))}
      </div>
    </div>
  );
}
