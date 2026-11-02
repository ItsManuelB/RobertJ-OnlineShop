/**
 * Unit tests for the buyer's ship-back countdown.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-return-deadline.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { getShipBackDeadline } from "../src/features/returns/utils/return-deadline.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = Date.parse("2026-11-02T12:00:00Z");
const at = (ms) => new Date(now + ms).toISOString();

test("several days left is calm", () => {
  assert.deepEqual(getShipBackDeadline(at(5 * DAY), now), { label: "5 days left", urgent: false, expired: false });
  assert.equal(getShipBackDeadline(at(2 * DAY + 3 * HOUR), now).label, "2 days left");
  assert.equal(getShipBackDeadline(at(1 * DAY), now).label, "1 day left");
});

test("under a day left is urgent and counts hours", () => {
  assert.deepEqual(getShipBackDeadline(at(23 * HOUR + 59 * 60 * 1000), now), {
    label: "23 hours left",
    urgent: true,
    expired: false,
  });
  assert.equal(getShipBackDeadline(at(1 * HOUR), now).label, "1 hour left");
  assert.equal(getShipBackDeadline(at(30 * 60 * 1000), now).label, "Less than an hour left");
});

test("a deadline at or before now is expired", () => {
  assert.deepEqual(getShipBackDeadline(at(0), now), { label: "Deadline passed", urgent: true, expired: true });
  assert.equal(getShipBackDeadline(at(-DAY), now).expired, true);
});
