import Image from "next/image";
import Link from "next/link";
import { Quote } from "lucide-react";

import { ROUTES } from "@/constants/routes";
import { StarRating } from "@/features/reviews/components/StarRating";
import type { FeaturedReview } from "@/features/reviews/types/review.types";
import { listFeaturedReviews } from "@/lib/supabase/queries";
import { formatDate } from "@/lib/utils/date";

/**
 * "What buyers are saying": three recent 4 and 5 star reviews with a written comment, one
 * per product, each linked to its product. Only reviews that would show on the product page
 * appear here (never hidden ones; demo ones only while demo content is on, tagged "Sample").
 * With none to show, the section is left out rather than filled.
 */
export async function BuyerReviewsSection() {
  let reviews: FeaturedReview[] = [];
  try {
    reviews = await listFeaturedReviews(3);
  } catch {
    reviews = [];
  }
  if (reviews.length === 0) return null;

  return (
    <section aria-labelledby="buyer-reviews-heading" className="bg-rj-gray-50 py-20">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-5 md:px-8">
        <div className="max-w-xl">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-rj-red-dark">From our buyers</p>
          <h2 id="buyer-reviews-heading" className="font-serif text-4xl leading-[1.05] text-rj-black md:text-[48px]">
            What buyers are saying
          </h2>
        </div>

        <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {reviews.map((review) => (
            <li key={review.id} className="flex flex-col gap-4 rounded-2xl border border-rj-gray-200 bg-rj-white p-6">
              <div className="flex items-center justify-between gap-2">
                <StarRating rating={review.rating} />
                {review.isDemo ? (
                  <span className="rounded-full border border-dashed border-rj-gold bg-rj-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rj-black">
                    Sample
                  </span>
                ) : (
                  <Quote className="h-5 w-5 text-rj-gray-300" aria-hidden="true" />
                )}
              </div>
              <blockquote className="flex-1 text-[15px] leading-relaxed text-rj-gray-700">“{review.comment}”</blockquote>
              <div className="flex items-center gap-3 text-xs text-rj-gray-600">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rj-red text-sm font-bold text-rj-white"
                >
                  {review.reviewerName.charAt(0).toUpperCase()}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-rj-black">{review.reviewerName}</span>
                  {formatDate(review.createdAt)}
                  {review.isVerified ? " · Verified purchase" : ""}
                </span>
              </div>
              <Link
                href={`${ROUTES.productDetail(review.productSlug)}#reviews`}
                className="flex items-center gap-3 border-t border-rj-gray-100 pt-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
              >
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-rj-gray-100">
                  {review.productImageUrl ? (
                    <Image src={review.productImageUrl} alt="" fill sizes="44px" className="object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-rj-black">{review.productTitle}</span>
                  <span className="text-xs font-semibold text-rj-red-dark">View product →</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
