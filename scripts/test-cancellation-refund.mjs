import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cancellationConfirmationMessage,
  describeCancellationRefund,
  refundTimeframe,
} from "../src/features/orders/utils/cancellation-refund.ts";

const fmt = (c) => `₱${(c / 100).toFixed(2)}`;
const base = {
  kind: "xendit",
  returnRequestId: "r",
  returnStatus: "seller_accepted",
  refundId: "f",
  refundStatus: "pending",
  failureCode: null,
  amountCents: 150000,
  currency: "PHP",
  needsSubmission: false,
};

test("confirmation message: unpaid order", () => {
  assert.equal(
    cancellationConfirmationMessage({ ...base, kind: "none", amountCents: null }, fmt),
    "Order cancelled. You won't be charged.",
  );
});

test("confirmation message: paid e-wallet order promises nothing more to do", () => {
  assert.equal(
    cancellationConfirmationMessage(base, fmt),
    "Order cancelled. Your ₱1500.00 refund is processing. No further action is needed.",
  );
});

test("refund shows completed only once confirmed", () => {
  assert.equal(describeCancellationRefund(base, "GCASH", fmt).stage, "processing");
  const done = describeCancellationRefund(
    { ...base, refundStatus: "succeeded", returnStatus: "refunded" },
    "GCASH",
    fmt,
  );
  assert.equal(done.stage, "completed");
  assert.match(done.headline, /completed/);
});

test("failed refund is surfaced, not hidden", () => {
  const r = describeCancellationRefund({ ...base, refundStatus: "failed" }, "PAYMAYA", fmt);
  assert.equal(r.stage, "needs_attention");
  assert.equal(r.destination, "Maya");
});

test("timeframes per channel", () => {
  assert.match(refundTimeframe("GCASH"), /1 business day/);
  assert.match(refundTimeframe("CARD"), /7–14 business days/);
  assert.equal(refundTimeframe(null), null);
});

test("COD refund is manual until recorded", () => {
  const manual = { ...base, kind: "manual", refundId: null, refundStatus: null, returnStatus: "refund_due" };
  assert.equal(describeCancellationRefund(manual, null, fmt).stage, "manual_pending");
  assert.equal(describeCancellationRefund({ ...manual, returnStatus: "refunded" }, null, fmt).stage, "completed");
});
