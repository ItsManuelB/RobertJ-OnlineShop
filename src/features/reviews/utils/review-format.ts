// No value imports on purpose: unit-tested with plain Node, which can't resolve the `@/` alias.

export const REVIEW_FALLBACK_NAME = "RobertJ Customer";

/**
 * Public form of a reviewer's name: first name and last initial ("Mia Santos" -> "Mia S.").
 * Applied when shown, so what is stored never changes. A single word stays as it is.
 */
export function maskReviewerName(raw: string | null | undefined): string {
  const words = (raw ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return REVIEW_FALLBACK_NAME;
  const first = words[0];
  if (words.length === 1) return first;
  const initial = words[words.length - 1].charAt(0).toUpperCase();
  return `${first} ${initial}.`;
}

export type StarCount = 1 | 2 | 3 | 4 | 5;

export interface RatingBreakdown {
  average: number | null;
  count: number;
  /** How many reviews gave each star rating. */
  byStars: Record<StarCount, number>;
}

/** Average, count and per-star counts for a set of ratings (1–5; anything else is ignored). */
export function summarizeRatings(ratings: readonly number[]): RatingBreakdown {
  const byStars: Record<StarCount, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let count = 0;
  for (const rating of ratings) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue;
    byStars[rating as StarCount] += 1;
    total += rating;
    count += 1;
  }
  return { average: count === 0 ? null : total / count, count, byStars };
}

/** "4.6" — one decimal, as shown next to the stars. */
export function formatAverage(average: number): string {
  return (Math.round(average * 10) / 10).toFixed(1);
}

/** What a product page shows when reviews could not be read: an honest empty state. */
export function emptyReviewSummary() {
  return {
    reviews: [] as never[],
    average: null,
    count: 0,
    byStars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<StarCount, number>,
    withComments: 0,
    verified: { average: null, count: 0 },
  };
}

export const REVIEW_EDIT_WINDOW_DAYS = 30;

/** Whether a buyer may still edit a review created at `createdAt`. `now` defaults here so render stays pure. */
export function canStillEdit(createdAt: string, now: number = Date.now()): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now - created < REVIEW_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
