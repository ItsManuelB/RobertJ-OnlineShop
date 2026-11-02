/**
 * Unit tests for the admin returns queue tabs.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-admin-return-queue.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  adminReturnBucket,
  isAdminReturnTab,
  isSellerReplyOverdue,
  matchesAdminReturnTab,
} from "../src/features/returns/utils/admin-return-queue.ts";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-10-27T12:00:00Z");
const ago = (days) => new Date(now - days * DAY).toISOString();
const req = (status, extra = {}) => ({ status, createdAt: ago(1), restockedAt: null, markedUnsellableAt: null, ...extra });

test("a fresh pending request is in progress; an overdue one needs the admin", () => {
  assert.equal(adminReturnBucket(req("pending"), now), "progress");
  assert.equal(adminReturnBucket(req("pending", { createdAt: ago(4) }), now), "decide");
  assert.equal(isSellerReplyOverdue(req("pending", { createdAt: ago(3.5) }), now), true);
  assert.equal(isSellerReplyOverdue(req("pending", { createdAt: ago(2.9) }), now), false);
  assert.equal(isSellerReplyOverdue(req("seller_accepted", { createdAt: ago(9) }), now), false);
});

test("buckets follow who has to act", () => {
  for (const status of ["seller_accepted", "seller_rejected", "return_received"]) {
    assert.equal(adminReturnBucket(req(status), now), "decide", status);
  }
  assert.equal(adminReturnBucket(req("refund_due"), now), "payouts");
  for (const status of ["awaiting_return", "return_shipped", "replacement_approved", "replacement_shipped"]) {
    assert.equal(adminReturnBucket(req(status), now), "progress", status);
  }
  for (const status of ["admin_rejected", "replacement_completed", "return_expired"]) {
    assert.equal(adminReturnBucket(req(status), now), "closed", status);
  }
});

test("refunded stays in progress until the item condition is recorded", () => {
  assert.equal(adminReturnBucket(req("refunded"), now), "progress");
  assert.equal(adminReturnBucket(req("refunded", { restockedAt: ago(0) }), now), "closed");
  assert.equal(adminReturnBucket(req("refunded", { markedUnsellableAt: ago(0) }), now), "closed");
});

test("all matches everything, and tab validation rejects unknown values", () => {
  assert.equal(matchesAdminReturnTab(req("refund_due"), "all", now), true);
  assert.equal(matchesAdminReturnTab(req("refund_due"), "decide", now), false);
  assert.equal(isAdminReturnTab("payouts"), true);
  assert.equal(isAdminReturnTab("action"), false);
  assert.equal(isAdminReturnTab(undefined), false);
});
