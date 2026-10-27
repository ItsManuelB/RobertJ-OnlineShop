import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canStillEdit,
  formatAverage,
  maskReviewerName,
  summarizeRatings,
} from "../src/features/reviews/utils/review-format.ts";

test("masks names to first name and last initial", () => {
  assert.equal(maskReviewerName("Mia Santos"), "Mia S.");
  assert.equal(maskReviewerName("  Juan  dela  cruz "), "Juan C.");
  assert.equal(maskReviewerName("LEX"), "LEX");
  assert.equal(maskReviewerName(""), "RobertJ Customer");
  assert.equal(maskReviewerName(null), "RobertJ Customer");
});

test("summarizes ratings and ignores bad values", () => {
  const s = summarizeRatings([5, 5, 4, 3, 1, 0, 6, 4.5]);
  assert.equal(s.count, 5);
  assert.deepEqual(s.byStars, { 1: 1, 2: 0, 3: 1, 4: 1, 5: 2 });
  assert.equal(s.average, 18 / 5);
  assert.deepEqual(summarizeRatings([]), { average: null, count: 0, byStars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
});

test("formats the average with one decimal", () => {
  assert.equal(formatAverage(4.56), "4.6");
  assert.equal(formatAverage(4), "4.0");
});

test("edit window is 30 days", () => {
  const now = Date.parse("2026-10-27T00:00:00Z");
  assert.equal(canStillEdit("2026-10-20T00:00:00Z", now), true);
  assert.equal(canStillEdit("2026-09-20T00:00:00Z", now), false);
  assert.equal(canStillEdit("nope", now), false);
});
