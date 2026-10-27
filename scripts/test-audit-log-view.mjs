/**
 * Unit tests for the Audit Log date range and day grouping.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-audit-log-view.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  auditRangeStart,
  groupEntriesByDay,
  isAuditLogRange,
} from "../src/features/audit-log/utils/audit-log-view.ts";

// 2026-10-27 20:00 UTC is already 2026-10-28 04:00 in Manila.
const now = Date.parse("2026-10-27T20:00:00Z");
const entry = (id, iso) => ({ id, createdAt: iso });

test("range validation and window start", () => {
  assert.equal(isAuditLogRange("7d"), true);
  assert.equal(isAuditLogRange("1y"), false);
  assert.equal(isAuditLogRange(undefined), false);
  assert.equal(auditRangeStart("24h", now), "2026-10-26T20:00:00.000Z");
  assert.equal(auditRangeStart("7d", now), "2026-10-20T20:00:00.000Z");
});

test("entries are grouped by Manila day, keeping order", () => {
  const entries = [
    entry("a", "2026-10-27T19:00:00Z"), // Oct 28 03:00 Manila: today
    entry("b", "2026-10-27T17:00:00Z"), // Oct 28 01:00 Manila: today
    entry("c", "2026-10-27T10:00:00Z"), // Oct 27 18:00 Manila: yesterday
    entry("d", "2026-10-24T02:00:00Z"), // Oct 24 10:00 Manila
  ];
  const groups = groupEntriesByDay(entries, now);
  assert.deepEqual(groups.map((g) => g.label), ["Today", "Yesterday", "Oct 24, 2026"]);
  assert.deepEqual(groups.map((g) => g.entries.map((e) => e.id)), [["a", "b"], ["c"], ["d"]]);
  assert.deepEqual(groupEntriesByDay([], now), []);
});
