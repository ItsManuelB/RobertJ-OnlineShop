import Link from "next/link";
import { Star } from "lucide-react";

import { RJ_CARD } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import type { ItemToReview } from "@/features/reviews/types/review.types";
import { cn } from "@/lib/utils/cn";

/** "Waiting for your rating": delivered items without a review, each opening its review form on the order page. */
export function ItemsToReview({ items, total }: { items: ItemToReview[]; total: number }) {
  if (items.length === 0) return null;

  return (
    <section id="items-to-review" aria-labelledby="items-to-review-heading" className="flex scroll-mt-24 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="items-to-review-heading" className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-400">
          Waiting for your rating{total > items.length ? ` · ${total}` : ""}
        </h2>
        <Link
          href={`${ROUTES.orders}?tab=completed`}
          className="text-xs font-semibold text-rj-red-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
        >
          Completed orders
        </Link>
      </div>
      <ul className={cn(RJ_CARD, "divide-y divide-rj-gray-100")}>
        {items.map((item) => (
          <li key={item.orderItemId}>
            <Link
              href={`${ROUTES.orderDetail(item.orderId)}?rate=${item.orderItemId}#review-${item.orderItemId}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-rj-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rj-red/30"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-rj-black">{item.productTitle}</span>
                <span className="text-xs text-rj-gray-600">
                  {item.variantLabel ? `${item.variantLabel} · ` : ""}Order {item.orderNumber}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} className="h-4 w-4 text-rj-gray-300" />
                ))}
              </span>
              <span className="sr-only">Rate this item</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
