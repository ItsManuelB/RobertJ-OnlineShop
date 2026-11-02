/**
 * Unit tests for the return/refund email content and opt-out rules.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-return-email.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  RETURN_EMAIL_KINDS,
  buildReturnEmail,
  escapeHtml,
  formatDeadline,
  getReturnEmailAudience,
  isBuyerReturnEmailAllowed,
  isReturnEmailKind,
  isSellerReturnEmailAllowed,
} from "../src/features/notifications/utils/return-email.ts";

// 7 Nov 2026, 15:20 Manila time.
const DEADLINE = "2026-11-07T07:20:00Z";
const input = (kind, extra = {}) => ({
  kind,
  orderNumber: "RJ-1042",
  url: "https://shop.test/orders/abc",
  deadlineAt: DEADLINE,
  ...extra,
});

test("deadlines are shown in Manila time whatever the server zone is", () => {
  const shown = formatDeadline(DEADLINE);
  assert.match(shown, /Nov 7, 2026|7 Nov 2026/);
  assert.match(shown, /3:20\s?pm/i);
  assert.match(shown, /\(Philippine time\)$/);
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
  const mail = buildReturnEmail(input("buyer_return_approved"));
  assert.match(mail.subject, /RJ-1042/);
  assert.match(mail.subject, /Nov 7, 2026|7 Nov 2026/);
  assert.match(mail.text, /nothing is refunded/);
  assert.match(mail.text, /https:\/\/shop\.test\/orders\/abc/);
  assert.match(mail.html, /href="https:\/\/shop\.test\/orders\/abc"/);
});

test("outcome emails name the order and promise nothing they cannot know", () => {
  const refunded = buildReturnEmail(input("buyer_return_refunded", { deadlineAt: null }));
  assert.match(refunded.subject, /Refund issued for order RJ-1042/);
  assert.match(refunded.text, /depends on your bank or e-wallet/);
  assert.doesNotMatch(refunded.text, /\d+ (business )?days/);

  const rejected = buildReturnEmail(input("buyer_return_rejected", { deadlineAt: null }));
  assert.match(rejected.subject, /not approved/);
  assert.match(rejected.text, /https:\/\/shop\.test\/orders\/abc/);

  const expired = buildReturnEmail(input("buyer_return_expired"));
  assert.match(expired.subject, /RJ-1042/);
  assert.match(expired.text, /Nothing is refunded/);
  // The deadline has already passed, so none of the outcome emails repeat it as an ask.
  for (const mail of [refunded, rejected, expired]) {
    assert.doesNotMatch(mail.text, /Please ship/);
  }
});

test("every kind produces a subject, text and html, with or without a deadline", () => {
  for (const kind of RETURN_EMAIL_KINDS) {
    for (const deadlineAt of [DEADLINE, null]) {
      const mail = buildReturnEmail(input(kind, { deadlineAt }));
      assert.ok(mail.subject.length > 0 && mail.text.length > 0 && mail.html.length > 0, kind);
      assert.match(mail.subject, /RJ-1042/);
      assert.doesNotMatch(mail.subject, /undefined|null/);
    }
  }
});

test("seller and buyer footers explain which setting turns the email off", () => {
  assert.match(buildReturnEmail(input("seller_new_request")).text, /seller notification settings/);
  assert.match(buildReturnEmail(input("buyer_ship_back_reminder")).text, /account notification settings/);
});

test("html output escapes anything that could carry markup", () => {
  const mail = buildReturnEmail(
    input("seller_new_request", { orderNumber: "<b>RJ</b>", url: 'https://x.test/?a="1"&b=2' }),
  );
  assert.doesNotMatch(mail.html, /<b>RJ<\/b>/);
  assert.match(mail.html, /&lt;b&gt;RJ&lt;\/b&gt;/);
  assert.match(mail.html, /&quot;1&quot;&amp;b=2/);
  assert.equal(escapeHtml(`a&b<c>"d"'e'`), "a&amp;b&lt;c&gt;&quot;d&quot;&#39;e&#39;");
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
