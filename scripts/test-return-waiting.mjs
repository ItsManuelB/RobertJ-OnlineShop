/**
 * Unit tests for "who is this return waiting on, and for how long".
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-return-waiting.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { getReturnWaiting, getWaitingStatus, waitingDays } from "../src/features/returns/utils/return-waiting.ts";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-11-02T12:00:00Z");
const ago = (days) => new Date(now - days * DAY).toISOString();
const req = (status, extra = {}) => ({
  status,
  createdAt: ago(9),
  sellerDecidedAt: null,
  adminDecidedAt: null,
  returnShippedAt: null,
  returnReceivedAt: null,
  replacementShippedAt: null,
  codRefundedAt: null,
  restockedAt: null,
  markedUnsellableAt: null,
  ...extra,
});
const targets = { admin: 2, seller: 3 };

test("a seller's answer hands the case to the admin, timed from that answer", () => {
  for (const status of ["seller_accepted", "seller_rejected"]) {
    assert.deepEqual(getReturnWaiting(req(status, { sellerDecidedAt: ago(4) })), {
      actor: "admin",
      since: ago(4),
    });
  }
});

test("once the admin approved a Xendit refund, nobody is waiting on a person", () => {
  assert.equal(getReturnWaiting(req("seller_accepted", { sellerDecidedAt: ago(4), adminDecidedAt: ago(1) })), null);
});

test("return_received waits on the admin until the refund approval is stamped after receipt", () => {
  assert.equal(getReturnWaiting(req("return_received", { returnReceivedAt: ago(3), adminDecidedAt: ago(6) })).actor, "admin");
  assert.equal(getReturnWaiting(req("return_received", { returnReceivedAt: ago(3), adminDecidedAt: ago(1) })), null);
});

test("each remaining open status names the right actor", () => {
  assert.equal(getReturnWaiting(req("pending")).actor, "seller");
  assert.equal(getReturnWaiting(req("refund_due", { adminDecidedAt: ago(2) })).actor, "admin");
  assert.equal(getReturnWaiting(req("awaiting_return", { adminDecidedAt: ago(1) })).actor, "buyer");
  assert.equal(getReturnWaiting(req("return_shipped", { returnShippedAt: ago(1) })).actor, "seller");
  assert.equal(getReturnWaiting(req("replacement_approved", { adminDecidedAt: ago(1) })).actor, "seller");
  assert.equal(getReturnWaiting(req("replacement_shipped", { replacementShippedAt: ago(1) })).actor, "buyer");
});

test("refunded waits on the seller only until the item's condition is recorded", () => {
  const open = req("refunded", { adminDecidedAt: ago(5), codRefundedAt: ago(2) });
  assert.deepEqual(getReturnWaiting(open), { actor: "seller", since: ago(2) });
  assert.equal(getReturnWaiting({ ...open, restockedAt: ago(1) }), null);
  assert.equal(getReturnWaiting({ ...open, markedUnsellableAt: ago(1) }), null);
});

test("closed requests and replacements already shipped wait on nobody", () => {
  for (const status of ["admin_rejected", "return_expired", "replacement_completed"]) {
    assert.equal(getReturnWaiting(req(status, { adminDecidedAt: ago(1) })), null, status);
  }
  assert.equal(getReturnWaiting(req("replacement_approved", { adminDecidedAt: ago(1), replacementShippedAt: ago(0) })), null);
});

test("past target is judged per actor; the buyer has no target here", () => {
  assert.deepEqual(getWaitingStatus(req("seller_accepted", { sellerDecidedAt: ago(2) }), targets, now), {
    actor: "admin",
    days: 2,
    pastTarget: true,
  });
  assert.equal(getWaitingStatus(req("seller_accepted", { sellerDecidedAt: ago(1.5) }), targets, now).pastTarget, false);
  assert.equal(getWaitingStatus(req("return_shipped", { returnShippedAt: ago(2.9) }), targets, now).pastTarget, false);
  assert.equal(getWaitingStatus(req("return_shipped", { returnShippedAt: ago(3) }), targets, now).pastTarget, true);
  assert.equal(getWaitingStatus(req("awaiting_return", { adminDecidedAt: ago(30) }), targets, now).pastTarget, false);
  assert.equal(getWaitingStatus(req("admin_rejected"), targets, now), null);
});

test("days never go negative", () => {
  assert.equal(waitingDays(new Date(now + DAY).toISOString(), now), 0);
});
