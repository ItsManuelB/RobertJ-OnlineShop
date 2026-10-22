import Link from "next/link";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { buttonVariants } from "@/components/ui/button";
import { USER_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { PaginationControls } from "@/features/products/components/PaginationControls";
import { buyerOrderListParamsSchema } from "@/features/orders/schemas/order.schema";
import type { Order, OrderListParams } from "@/features/orders/types/order.types";
import { computeOrderGroupInfo } from "@/features/orders/utils/order-grouping";
import { cn } from "@/lib/utils/cn";
import { getShopMembershipBySellerIds, listBuyerOrders } from "@/lib/supabase/queries";
import type { PaginatedResult } from "@/types/pagination.types";

import { BuyerOrderCard } from "./BuyerOrderCard";

export interface OrderListSectionProps {
  searchParams: Record<string, string | string[] | undefined>;
  buyerId: string;
}

/**
 * Server Component that owns data loading for the order history. Kept inside a
 * keyed Suspense boundary so a new search/filter restarts loading from scratch.
 */
export async function OrderListSection({
  searchParams,
  buyerId,
}: OrderListSectionProps) {
  const parsed = buyerOrderListParamsSchema.safeParse(searchParams);
  if (!parsed.success) {
    return (
      <ErrorState message="Those filters aren't valid. Try clearing your search." />
    );
  }

  // Schema field is `tab` (short, URL-facing); the query layer's field is
  // the more descriptive `lifecycleTab` — mapped explicitly here rather than
  // renaming one to match the other.
  const params: OrderListParams = { ...parsed.data, lifecycleTab: parsed.data.tab };

  let result: PaginatedResult<Order>;
  try {
    result = await listBuyerOrders(buyerId, params);
  } catch {
    return (
      <ErrorState message="We couldn't load your orders right now." />
    );
  }

  const { items, page, totalPages, total } = result;

  if (items.length === 0) {
    const filtering = Boolean(params.search || params.status || params.lifecycleTab);
    return (
      <EmptyState
        title={filtering ? "No matching orders" : "No orders yet"}
        description={
          filtering
            ? "Try a different order ID or status filter."
            : "Orders you place will appear here."
        }
        action={
          filtering ? (
            <Link
              href={ROUTES.orders}
              className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}
            >
              Clear filters
            </Link>
          ) : (
            <Link
              href={ROUTES.products}
              className={cn(buttonVariants({ variant: "rj", size: "rjSm" }))}
            >
              Browse products
            </Link>
          )
        }
      />
    );
  }

  // Resolved once for the whole page, not per card — avoids an N+1 shop
  // lookup across potentially many orders from different sellers.
  const sellerIds = [
    ...new Set(
      items.map((order) => order.sellerId).filter((id): id is string => id !== null),
    ),
  ];
  const shopMembership = await getShopMembershipBySellerIds(sellerIds).catch(
    () => new Map<string, { shopId: string; shopName: string }>(),
  );
  const shopLabelFor = (order: Order) =>
    order.shopName ??
    (order.sellerId ? shopMembership.get(order.sellerId)?.shopName : null) ??
    (order.sellerRole === USER_ROLES.seller ? order.sellerName : null) ??
    "RobertJ Seller";

  // Computed from this page's own results — no extra query. Only meaningful
  // for orders whose group siblings are also on this page, which holds for
  // the case this exists for (a fresh multi-seller checkout's "To Pay" tab).
  const groupInfoByOrderId = computeOrderGroupInfo(items);

  return (
    <section className="flex flex-col gap-6">
      <p
        className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-400"
        aria-live="polite"
      >
        {total} order{total === 1 ? "" : "s"}
      </p>
      <ul className="flex flex-col gap-4">
        {items.map((order) => (
          <li key={order.id}>
            <BuyerOrderCard
              order={order}
              shopName={shopLabelFor(order)}
              shopId={(order.sellerId ? shopMembership.get(order.sellerId)?.shopId : null) ?? null}
              groupInfo={groupInfoByOrderId.get(order.id) ?? null}
            />
          </li>
        ))}
      </ul>
      {totalPages > 1 ? (
        <PaginationControls page={page} totalPages={totalPages} />
      ) : null}
    </section>
  );
}
