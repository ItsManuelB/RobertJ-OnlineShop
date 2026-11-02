import { EmptyState } from "@/components/feedback/EmptyState";
import { RJ_CARD } from "@/components/ui/card";
import { ReviewList } from "@/features/reviews/components/ReviewList";
import { StarRating } from "@/features/reviews/components/StarRating";
import type { ProductReviewSummary } from "@/features/reviews/types/review.types";
import { formatAverage, type StarCount } from "@/features/reviews/utils/review-format";
import { cn } from "@/lib/utils/cn";

export interface ProductReviewsProps {
  summary: ProductReviewSummary;
  /** The shop that replies under reviews. */
  shopName: string | null;
}

const STARS: StarCount[] = [5, 4, 3, 2, 1];

/**
 * Reviews section for the product page: the average with a 5-to-1 star breakdown, then the
 * list with filters, sort and "Show more". Demo reviews are only present while demo content
 * is switched on, and are tagged "Sample".
 */
export function ProductReviews({ summary, shopName }: ProductReviewsProps) {
  const { reviews, average, count, byStars, withComments } = summary;

  return (
    <section aria-labelledby="reviews-heading" className="flex flex-col gap-5">
      <h2 id="reviews-heading" className="font-serif text-2xl text-rj-black">
        Reviews
      </h2>

      {count === 0 || average === null ? (
        <EmptyState
          title="No reviews yet"
          description="Bought this? You can rate it once your order is delivered."
        />
      ) : (
        <>
          <div className={cn(RJ_CARD, "grid gap-6 p-5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center")}>
            <div className="flex flex-col items-start gap-1">
              <span className="font-serif text-5xl leading-none text-rj-black">{formatAverage(average)}</span>
              <StarRating rating={average} size="md" />
              <span className="text-xs text-rj-gray-600">
                {count} review{count === 1 ? "" : "s"} · {withComments} with comments
              </span>
            </div>
            <ul className="flex flex-col gap-1.5" aria-label="Ratings breakdown">
              {STARS.map((stars) => {
                const share = count === 0 ? 0 : Math.round((byStars[stars] / count) * 100);
                return (
                  <li key={stars} className="grid grid-cols-[2.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs">
                    <span className="text-rj-gray-600">{stars} ★</span>
                    <span
                      className="h-2 overflow-hidden rounded-full bg-rj-gray-100"
                      role="img"
                      aria-label={`${byStars[stars]} of ${count} reviews gave ${stars} star${stars === 1 ? "" : "s"}`}
                    >
                      <span className="block h-full rounded-full bg-rj-gold" style={{ width: `${share}%` }} />
                    </span>
                    <span className="text-right tabular-nums text-rj-gray-600">{byStars[stars]}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <ReviewList reviews={reviews} shopName={shopName} />
        </>
      )}
    </section>
  );
}
