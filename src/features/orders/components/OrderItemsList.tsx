import Image from "next/image";
import Link from "next/link";

import { RJ_CARD, THEMED_CARD } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { ReviewForm } from "@/features/reviews/components/ReviewForm";
import type { OrderItem } from "@/features/orders/types/order.types";
import type { Review } from "@/features/reviews/types/review.types";
import { canStillEdit } from "@/features/reviews/utils/review-format";

/**
 * Line items with snapshots. A sold/archived product resolves to a null slug,
 * so the title renders as plain text instead of a (dead) link.
 *
 * `reviewableOrderItemIds` is only passed for a `delivered` order — when set,
 * every item whose id is in it gets a "Write a Review" entry point; items in
 * `myReviews` show the buyer's review instead, editable for 30 days.
 *
 * `themed`: see OrderHeader.
 */
export function OrderItemsList({
  items,
  currency,
  orderId,
  reviewableOrderItemIds,
  myReviews,
  reviewerPublicName = "",
  rateItemId,
  themed = false,
}: {
  items: OrderItem[];
  currency: string;
  orderId?: string;
  reviewableOrderItemIds?: ReadonlySet<string>;
  /** The buyer's own reviews on this order, keyed by order item. */
  myReviews?: ReadonlyMap<string, Review>;
  /** How the buyer appears on reviews, e.g. "Mia S.". */
  reviewerPublicName?: string;
  /** Opens this item's review form straight away (from "Items to review"). */
  rateItemId?: string;
  themed?: boolean;
}) {
  const ink = themed ? "text-foreground" : "text-rj-black";
  const muted = themed ? "text-muted-foreground" : "text-rj-gray-600";
  const faint = themed ? "text-muted-foreground" : "text-rj-gray-500";
  return (
    <section aria-label="Items in this order" className="flex flex-col gap-3">
      <h2 className={cn("text-[10px] font-bold uppercase tracking-[0.3em]", muted)}>
        Items
      </h2>
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const myReview = myReviews?.get(item.id) ?? null;
          const canReview = Boolean(orderId && (reviewableOrderItemIds?.has(item.id) || myReview));
          return (
            <li
              key={item.id}
              id={`review-${item.id}`}
              className={cn(themed ? THEMED_CARD : RJ_CARD, "flex flex-col gap-3 p-3")}
            >
              <div className="flex items-center gap-4">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.productTitle}
                    width={64}
                    height={64}
                    className="h-16 w-16 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <span
                    className={cn(
                      "flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-xs",
                      themed ? "bg-muted text-muted-foreground" : "bg-rj-gray-100 text-rj-gray-400",
                    )}
                  >
                    No image
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  {item.productSlug ? (
                    <Link
                      href={ROUTES.productDetail(item.productSlug)}
                      className={cn("text-sm font-semibold hover:underline", ink)}
                    >
                      {item.productTitle}
                    </Link>
                  ) : (
                    <p className={cn("text-sm font-semibold", ink)}>{item.productTitle}</p>
                  )}
                  {item.variantLabel ? (
                    <p className={cn("mt-0.5 text-xs", faint)}>{item.variantLabel}</p>
                  ) : null}
                  <p className={cn("mt-0.5 text-xs", muted)}>
                    {item.quantity} × {formatCurrency(item.unitPriceCents, currency)}
                  </p>
                </div>

                <p className={cn("shrink-0 text-sm font-bold", ink)}>
                  {formatCurrency(item.subtotalCents, currency)}
                </p>
              </div>

              {canReview && orderId ? (
                <ReviewForm
                  orderId={orderId}
                  orderItemId={item.id}
                  productTitle={item.productTitle}
                  publicName={reviewerPublicName}
                  existing={myReview}
                  editable={myReview ? canStillEdit(myReview.createdAt) : false}
                  defaultOpen={rateItemId === item.id}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
