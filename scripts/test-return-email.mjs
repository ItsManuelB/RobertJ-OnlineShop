/**
 * Unit tests for the return/refund email content and opt-out rules.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-return-email.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { renderEmail } from "../src/lib/email/layout.ts";
import {
  RETURN_EMAIL_KINDS,
  RETURN_EMAIL_REASON,
  formatDeadline,
  formatShortDate,
  getReturnEmailAudience,
  isBuyerReturnEmailAllowed,
  isReturnEmailKind,
  isSellerReturnEmailAllowed,
  returnEmailMessage,
} from "../src/features/notifications/utils/return-email.ts";

// 7 Nov 2026, 15:20 Manila time.
const DEADLINE = "2026-11-07T07:20:00Z";
const chrome = { logoUrl: "https://shop.test/brand/email-logo.png", siteUrl: "https://shop.test", settingsUrl: null, canReply: false };
const input = (kind, extra = {}) => ({
  kind,
  orderNumber: "RJ-1042",
  url: "https://shop.test/orders/abc",
  deadlineAt: DEADLINE,
  ...extra,
});
const render = (kind, extra) => renderEmail(returnEmailMessage(input(kind, extra)), chrome);

test("deadlines are shown in Manila time whatever the server zone is", () => {
  const shown = formatDeadline(DEADLINE);
  assert.match(shown, /Nov 7, 2026|7 Nov 2026/);
  assert.match(shown, /3:20\s?pm/i);
  assert.match(shown, /\(Philippine time\)$/);
  // 23:30 UTC on the 6th is already the 7th in Manila.
  assert.match(formatShortDate("2026-11-06T23:30:00Z"), /Nov 7|7 Nov/);
});

test("audience follows the kind's prefix", () => {
  assert.deepEqual(RETURN_EMAIL_KINDS.map(getReturnEmailAudience), [
    "seller",
    "seller",
    "buyer",
    "buyer",
    "buyer",
    "buyer",
    "buyer",
  ]);
  assert.equal(isReturnEmailKind("buyer_return_approved"), true);
  assert.equal(isReturnEmailKind("promo_blast"), false);
});

test("the buyer's approval email names the order, the deadline and the consequence", () => {
  const mail = render("buyer_return_approved");
  assert.match(mail.subject, /RJ-1042/);
  // The subject carries only the short date; the full deadline sits in the body.
  assert.match(mail.subject, /Nov 7|7 Nov/);
  assert.doesNotMatch(mail.subject, /Philippine time/);
  assert.match(mail.text, /Ship back by: .*3:20\s?pm/i);
  assert.match(mail.text, /nothing is refunded/);
  assert.match(mail.text, /https:\/\/shop\.test\/orders\/abc/);
  assert.match(mail.html, /href="https:\/\/shop\.test\/orders\/abc"/);
});

test("outcome emails name the order and promise nothing they cannot know", () => {
  const refunded = render("buyer_return_refunded", { deadlineAt: null });
  assert.match(refunded.subject, /Refund issued for order RJ-1042/);
  assert.match(refunded.text, /depends on your bank or e-wallet/);
  assert.doesNotMatch(refunded.text, /\d+ (business )?days/);

  const rejected = render("buyer_return_rejected", { deadlineAt: null });
  assert.match(rejected.subject, /not approved/);
  assert.match(rejected.text, /https:\/\/shop\.test\/orders\/abc/);

  const expired = render("buyer_return_expired");
  assert.match(expired.subject, /RJ-1042/);
  assert.match(expired.text, /nothing is refunded/);
  // The deadline has already passed, so none of the outcome emails repeat it as an ask.
  for (const mail of [refunded, rejected, expired]) {
    assert.doesNotMatch(mail.text, /Ship back by|Please ship/);
  }
});

test("the refund email shows the amount only when it is known", () => {
  const known = render("buyer_return_refunded", { deadlineAt: null, refundAmount: "₱1,250.00" });
  assert.match(known.text, /Refund amount: ₱1,250\.00/);
  assert.match(known.html, /₱1,250\.00 is on its way back to you/);

  const unknown = render("buyer_return_refunded", { deadlineAt: null, refundAmount: null });
  assert.doesNotMatch(unknown.text, /Refund amount/);
});

test("every kind produces a subject, text and html, with or without a deadline", () => {
  for (const kind of RETURN_EMAIL_KINDS) {
    for (const deadlineAt of [DEADLINE, null]) {
      const mail = render(kind, { deadlineAt });
      assert.ok(mail.subject.length > 0 && mail.text.length > 0 && mail.html.length > 0, kind);
      assert.match(mail.subject, /RJ-1042/);
      assert.doesNotMatch(`${mail.subject} ${mail.text}`, /undefined|null/);
    }
  }
});

test("subjects fit a phone even with the longest real order number and a two-digit day", () => {
  const orderNumber = "ORD-20261102-000481";
  for (const kind of RETURN_EMAIL_KINDS) {
    const { subject } = returnEmailMessage(input(kind, { orderNumber, deadlineAt: "2026-11-27T07:20:00Z" }));
    assert.ok(subject.length <= 60, `${kind}: ${subject.length} characters`);
  }
});

test("seller and buyer emails explain why the person got them", () => {
  assert.match(render("seller_new_request").text, /return alerts are on for your seller account/);
  assert.match(render("buyer_ship_back_reminder").text, /order update emails are on for your account/);
  assert.match(RETURN_EMAIL_REASON.seller, /seller account/);
});

test("html output escapes anything that could carry markup", () => {
  const mail = render("seller_new_request", { orderNumber: "<b>RJ</b>", url: 'https://x.test/?a="1"&b=2' });
  assert.doesNotMatch(mail.html, /<b>RJ<\/b>/);
  assert.match(mail.html, /&lt;b&gt;RJ&lt;\/b&gt;/);
  assert.match(mail.html, /&quot;1&quot;&amp;b=2/);
});

test("opt-outs: a missing row means on; either buyer switch off blocks; the seller alert switch decides", () => {
  assert.equal(isBuyerReturnEmailAllowed(null), true);
  assert.equal(isBuyerReturnEmailAllowed({ emailEnabled: true, orderUpdates: true }), true);
  assert.equal(isBuyerReturnEmailAllowed({ emailEnabled: false, orderUpdates: true }), false);
  assert.equal(isBuyerReturnEmailAllowed({ emailEnabled: true, orderUpdates: false }), false);
  assert.equal(isSellerReturnEmailAllowed(null), true);
  assert.equal(isSellerReturnEmailAllowed({ alertReturns: true }), true);
  assert.equal(isSellerReturnEmailAllowed({ alertReturns: false }), false);
});
