import Link from "next/link";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { ROUTES } from "@/constants/routes";
import { PaginationControls } from "@/features/products/components/PaginationControls";
import { ReviewCard } from "@/features/reviews/components/ReviewCard";
import { ReviewModerationControls } from "@/features/reviews/components/ReviewModerationControls";
import { ReviewQueueTabs } from "@/features/reviews/components/ReviewQueueTabs";
import type { ManagedReview } from "@/features/reviews/types/review.types";
import { listAdminReviews, type AdminReviewTab } from "@/lib/supabase/queries";
import type { PaginatedResult } from "@/types/pagination.types";

const TABS: { value: AdminReviewTab; label: string }[] = [
  { value: "all", label: "Real reviews" },
  { value: "low", label: "1–2 stars" },
  { value: "hidden", label: "Hidden" },
  { value: "demo", label: "Sample (demo)" },
];

const PAGE_SIZE = 10;

function parseTab(value: string | undefined): AdminReviewTab {
  return TABS.some((tab) => tab.value === value) ? (value as AdminReviewTab) : "all";
}

/** Every review across the shops for the Admin Portal, with hide / show. Demo reviews have their own tab. */
export async function AdminReviewQueue({ tab, page }: { tab?: string; page?: string }) {
  const activeTab = parseTab(tab);
  const pageNumber = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  let result: PaginatedResult<ManagedReview>;
  try {
    result = await listAdminReviews({ tab: activeTab, page: pageNumber, pageSize: PAGE_SIZE });
  } catch {
    return <ErrorState message="We couldn't load reviews right now. Make sure the latest database migration has been applied." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <ReviewQueueTabs
        label="Review filters"
        active={activeTab}
        tabs={TABS.map((entry) => ({ ...entry, href: `${ROUTES.adminReviews}?tab=${entry.value}` }))}
      />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {result.total} review{result.total === 1 ? "" : "s"}
        {activeTab === "demo" ? " · Turn demo content on or off, or remove it, in Settings." : ""}
      </p>

      {result.items.length === 0 ? (
        <EmptyState
          title={activeTab === "hidden" ? "No hidden reviews" : "No reviews here"}
          description={
            activeTab === "demo"
              ? "There are no demo reviews."
              : "Reviews appear here as buyers rate delivered items."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {result.items.map((review) => (
            <li key={review.id}>
              <ReviewCard
                themed
                review={review}
                shopName={review.shopName}
                context={
                  <p className="text-xs text-muted-foreground">
                    <Link
                      href={ROUTES.productDetail(review.productSlug)}
                      className="font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      {review.productTitle}
                    </Link>
                    {review.shopName ? ` · ${review.shopName}` : ""}
                  </p>
                }
                footer={
                  review.isDemo ? null : (
                    <ReviewModerationControls reviewId={review.id} hidden={Boolean(review.hiddenAt)} />
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
