import assert from "node:assert/strict";
import { test } from "node:test";

import { formatHoldLeft, getHoldMinutesLeft } from "../src/features/account/utils/account-attention.ts";

const NOW = Date.parse("2026-10-27T10:00:00Z");

test("no unpaid orders gives null", () => {
  assert.equal(getHoldMinutesLeft([], 60, NOW), null);
});

test("uses the oldest unpaid order", () => {
  const placed = ["2026-10-27T09:40:00Z", "2026-10-27T09:10:00Z"];
  assert.equal(getHoldMinutesLeft(placed, 60, NOW), 10);
});

test("never goes negative", () => {
  assert.equal(getHoldMinutesLeft(["2026-10-27T07:00:00Z"], 60, NOW), 0);
});

test("ignores unreadable dates", () => {
  assert.equal(getHoldMinutesLeft(["nope"], 60, NOW), null);
});

test("formats the time left", () => {
  assert.equal(formatHoldLeft(0), "Expiring now");
  assert.equal(formatHoldLeft(45), "45 min left");
  assert.equal(formatHoldLeft(60), "1 h left");
  assert.equal(formatHoldLeft(65), "1 h 5 min left");
});
