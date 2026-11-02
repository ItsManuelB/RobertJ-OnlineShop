"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ReviewCard } from "@/features/reviews/components/ReviewCard";
import type { Review } from "@/features/reviews/types/review.types";
import { cn } from "@/lib/utils/cn";

type Filter = "all" | "5" | "4" | "3" | "low" | "comments";
type Sort = "newest" | "highest" | "lowest";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "5", label: "5 ★" },
  { value: "4", label: "4 ★" },
  { value: "3", label: "3 ★" },
  { value: "low", label: "1–2 ★" },
  { value: "comments", label: "With comments" },
];

const SORT_LABELS: Record<Sort, string> = {
  newest: "Newest",
  highest: "Highest rating",
  lowest: "Lowest rating",
};

const PAGE_SIZE = 5;

function matches(review: Review, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "comments") return Boolean(review.comment);
  if (filter === "low") return review.rating <= 2;
  return review.rating === Number(filter);
}

/** Real reviews always come before sample ones; then the chosen order. */
function compare(sort: Sort) {
  return (a: Review, b: Review) => {
    if (a.isDemo !== b.isDemo) return a.isDemo ? 1 : -1;
    if (sort === "highest" && a.rating !== b.rating) return b.rating - a.rating;
    if (sort === "lowest" && a.rating !== b.rating) return a.rating - b.rating;
    return b.createdAt.localeCompare(a.createdAt);
  };
}

/** The product page's review list: filter chips, sort, five at a time with "Show more". */
export function ReviewList({ reviews, shopName }: { reviews: Review[]; shopName: string | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [shown, setShown] = useState(PAGE_SIZE);

  const visible = useMemo(
    () => reviews.filter((review) => matches(review, filter)).sort(compare(sort)),
    [reviews, filter, sort],
  );

  function choose(next: Filter) {
    setFilter(next);
    setShown(PAGE_SIZE);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter reviews" className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => choose(option.value)}
              className={cn(
                "min-h-9 rounded-full border-[1.5px] px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30",
                filter === option.value
                  ? "border-rj-black bg-rj-black text-rj-white"
                  : "border-rj-gray-200 text-rj-gray-600 hover:border-rj-black hover:text-rj-black",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="review-sort" className="sr-only">
            Sort reviews
          </label>
          <select
            id="review-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="h-10 w-full rounded-full border-[1.5px] border-rj-gray-200 bg-transparent px-4 text-sm text-rj-black outline-none focus-visible:border-rj-black sm:w-auto"
          >
            {(Object.keys(SORT_LABELS) as Sort[]).map((value) => (
              <option key={value} value={value}>
                {SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-rj-gray-600" aria-live="polite">
        {visible.length === 0
          ? "No reviews match this filter."
          : `Showing ${Math.min(shown, visible.length)} of ${visible.length} review${visible.length === 1 ? "" : "s"}`}
      </p>

      <ul className="flex flex-col gap-3">
        {visible.slice(0, shown).map((review) => (
          <li key={review.id}>
            <ReviewCard review={review} shopName={shopName} />
          </li>
        ))}
      </ul>

      {shown < visible.length ? (
        <Button
          type="button"
          variant="rjOutline"
          size="rjSm"
          className="self-center"
          onClick={() => setShown((count) => count + PAGE_SIZE)}
        >
          Show more reviews
        </Button>
      ) : null}
    </div>
  );
}
