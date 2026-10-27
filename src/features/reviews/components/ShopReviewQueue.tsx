import Link from "next/link";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { PaginationControls } from "@/features/products/components/PaginationControls";
import { ReviewCard } from "@/features/reviews/components/ReviewCard";
import { ReviewQueueTabs } from "@/features/reviews/components/ReviewQueueTabs";
import { ReviewReplyForm } from "@/features/reviews/components/ReviewReplyForm";
import type { ManagedReview } from "@/features/reviews/types/review.types";
import { listShopReviews, type ShopReviewTab } from "@/lib/supabase/queries";
import type { PaginatedResult } from "@/types/pagination.types";

const TABS: { value: ShopReviewTab; label: string }[] = [
  { value: "reply", label: "Needs a reply" },
  { value: "all", label: "All reviews" },
  { value: "low", label: "1–2 stars" },
];

const PAGE_SIZE = 10;

function parseTab(value: string | undefined): ShopReviewTab {
  return TABS.some((tab) => tab.value === value) ? (value as ShopReviewTab) : "reply";
}

/**
 * The shop's reviews in the Seller Portal. "Needs a reply" lists real 1–3 star reviews
 * without an answer, oldest first, each with a reply box. Sample (demo) reviews show with
 * their tag while demo content is on, and cannot be replied to.
 */
export async function ShopReviewQueue({ tab, page }: { tab?: string; page?: string }) {
  const activeTab = parseTab(tab);
  const pageNumber = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  let result: PaginatedResult<ManagedReview>;
  try {
    result = await listShopReviews({ tab: activeTab, page: pageNumber, pageSize: PAGE_SIZE });
  } catch {
    return <ErrorState message="We couldn't load your reviews right now." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <ReviewQueueTabs
        label="Review filters"
        active={activeTab}
        tabs={TABS.map((entry) => ({ ...entry, href: `${ROUTES.sellerReviews}?tab=${entry.value}` }))}
      />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {result.total} review{result.total === 1 ? "" : "s"}
      </p>

      {result.items.length === 0 ? (
        <EmptyState
          title={activeTab === "reply" ? "Nothing waiting for a reply" : "No reviews here yet"}
          description={
            activeTab === "reply"
              ? "Low ratings without an answer show up here. You're all caught up."
              : "Reviews of your shop's products appear here once buyers rate them."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {result.items.map((review) => (
            <li key={review.id}>
              <ReviewCard
                themed
                review={review}
                shopName="your shop"
                context={
                  <Link
                    href={ROUTES.productDetail(review.productSlug)}
                    className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    {review.productTitle}
                  </Link>
                }
                footer={
                  review.isDemo || review.hiddenAt ? null : (
                    <ReviewReplyForm reviewId={review.id} existingReply={review.sellerReply} />
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}

      {result.totalPages > 1 ? <PaginationControls page={result.page} totalPages={result.totalPages} themed /> : null}
    </div>
  );
}

export function ReviewQueueSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status">
      <span className="sr-only">Loading reviews</span>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-36 w-full rounded-xl" />
      ))}
    </div>
  );
}
