import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterActivity,
  getActivityCategory,
  groupActivityByDay,
  isAttentionEvent,
  parseActivityCategory,
} from "../src/features/notifications/utils/activity-view.ts";

// 27 Oct 2026, 10:00 Manila time.
const NOW = Date.parse("2026-10-27T02:00:00Z");
const ev = (eventType, occurredAt) => ({ eventType, orderId: "o", orderNumber: "RJ-1", occurredAt });

test("every group keeps newest-first order and empty groups are dropped", () => {
  const groups = groupActivityByDay(
    [
      ev("order_placed", "2026-10-27T01:00:00Z"),
      ev("order_shipped", "2026-10-26T05:00:00Z"),
      ev("order_delivered", "2026-10-20T05:00:00Z"),
    ],
    NOW,
  );
  assert.deepEqual(groups.map((g) => [g.key, g.events.length]), [["today", 1], ["yesterday", 1], ["earlier", 1]]);
  assert.deepEqual(groupActivityByDay([], NOW), []);
});

test("days follow Manila time, not UTC", () => {
  // 17:00 UTC on 26 Oct is 01:00 on 27 Oct in Manila: still today.
  const [group] = groupActivityByDay([ev("order_placed", "2026-10-26T17:00:00Z")], NOW);
  assert.equal(group.key, "today");
});

test("categories and filtering", () => {
  assert.equal(getActivityCategory("payment_failed"), "payments");
  assert.equal(getActivityCategory("return_filed"), "returns");
  assert.equal(getActivityCategory("order_shipped"), "orders");
  const events = [ev("order_placed", "x"), ev("payment_confirmed", "x")];
  assert.equal(filterActivity(events, "payments").length, 1);
  assert.equal(filterActivity(events, null).length, 2);
});

test("parse and attention", () => {
  assert.equal(parseActivityCategory("returns"), "returns");
  assert.equal(parseActivityCategory("zzz"), null);
  assert.equal(parseActivityCategory(undefined), null);
  assert.equal(isAttentionEvent("payment_failed"), true);
  assert.equal(isAttentionEvent("order_placed"), false);
});
