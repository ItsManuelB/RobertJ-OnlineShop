import type { ReactNode } from "react";
import { BadgeCheck, EyeOff } from "lucide-react";

import { RJ_CARD } from "@/components/ui/card";
import { StarRating } from "@/features/reviews/components/StarRating";
import type { Review } from "@/features/reviews/types/review.types";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date";

export interface ReviewCardProps {
  review: Review;
  /** Who replies under it, e.g. "Shop One". */
  shopName?: string | null;
  /** Shown above the comment in the portals, e.g. a link to the product. */
  context?: ReactNode;
  /** Buttons or a reply form, shown at the bottom (portals, the buyer's own review). */
  footer?: ReactNode;
  /** Portal surfaces use the theme tokens so they invert in dark mode; the storefront omits it. */
  themed?: boolean;
}

/**
 * One review: masked name, "Verified purchase" or "Sample", stars, date, what was bought,
 * the comment and the shop's reply. Shared by the product page and both portals.
 */
export function ReviewCard({ review, shopName, context, footer, themed = false }: ReviewCardProps) {
  const muted = themed ? "text-muted-foreground" : "text-rj-gray-600";
  const strong = themed ? "text-foreground" : "text-rj-black";

  return (
    <article
      className={cn(
        themed ? "rounded-xl border border-border bg-card" : RJ_CARD,
        "flex flex-col gap-2 p-4",
        review.hiddenAt && "opacity-75",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              themed ? "bg-primary/10 text-primary" : "bg-rj-gray-100 text-rj-red-dark",
            )}
          >
            {review.reviewerName.charAt(0).toUpperCase()}
          </span>
          <span className={cn("text-sm font-semibold", strong)}>{review.reviewerName}</span>
          {review.isDemo ? (
            <span
              className={cn(
                "rounded-full border border-dashed px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                themed ? "border-border bg-muted text-muted-foreground" : "border-rj-gold bg-rj-gold/15 text-rj-black",
              )}
            >
              Sample
            </span>
          ) : review.isVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10.5px] font-semibold text-success">
              <BadgeCheck className="h-3 w-3" aria-hidden="true" />
              Verified purchase
            </span>
          ) : null}
        </div>
        <StarRating rating={review.rating} />
      </div>

      <p className={cn("text-xs", muted)}>
        {formatDate(review.createdAt)}
        {review.variantLabel ? ` · Bought: ${review.variantLabel}` : ""}
        {review.editedAt ? " · Edited" : ""}
      </p>

      {context}

      {review.comment ? (
        <p className={cn("whitespace-pre-line text-sm leading-relaxed", themed ? "text-foreground" : "text-rj-gray-700")}>
          {review.comment}
        </p>
      ) : (
        <p className={cn("text-xs italic", muted)}>No written comment.</p>
      )}

      {review.sellerReply ? (
        <div
          className={cn(
            "rounded-lg border-l-[3px] px-3 py-2 text-sm",
            themed ? "border-primary bg-muted" : "border-rj-red bg-rj-gray-50",
          )}
        >
          <p className={cn("text-xs font-semibold", strong)}>Reply from {shopName ?? "the shop"}</p>
          <p className={cn("mt-0.5 whitespace-pre-line", themed ? "text-foreground" : "text-rj-gray-700")}>
            {review.sellerReply}
          </p>
        </div>
      ) : null}

      {review.hiddenAt ? (
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          Hidden from the store{review.hiddenReason ? `: ${review.hiddenReason}` : ""}
        </p>
      ) : null}

      {footer}
    </article>
  );
}
