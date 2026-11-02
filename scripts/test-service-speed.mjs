import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDuration } from "../src/features/admin/utils/service-speed.ts";

test("nothing to average shows a dash", () => {
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(-5), "—");
  assert.equal(formatDuration(Number.NaN), "—");
});

test("under an hour is whole minutes, never 0", () => {
  assert.equal(formatDuration(10), "1 min");
  assert.equal(formatDuration(12 * 60), "12 min");
});

test("hours and days use one decimal at most", () => {
  assert.equal(formatDuration(3.2 * 3600), "3.2 h");
  assert.equal(formatDuration(1.4 * 86400), "1.4 days");
  assert.equal(formatDuration(86400), "1 day");
});
