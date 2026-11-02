/**
 * Unit tests for the order email wording and the seller opt-out rule.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-order-email.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ORDER_EMAIL_FOOTER,
  ORDER_EMAIL_KINDS,
  formatOrderTotal,
  getOrderEmailAudience,
  isOrderEmailKind,
  isSellerOrderEmailAllowed,
  orderEmailParts,
} from "../src/features/notifications/utils/order-email.ts";

const input = (kind, extra = {}) => ({
  kind,
  orderNumber: "RJ-2001",
  totalCents: 125000,
  currency: "PHP",
  paymentMethod: "cod",
  paymentStatus: "pending",
  itemCount: 2,
  ...extra,
});

test("totals are shown from integer cents", () => {
  assert.match(formatOrderTotal(125000, "PHP"), /1,250\.00/);
  assert.match(formatOrderTotal(5, "PHP"), /0\.05/);
  assert.equal(formatOrderTotal(1000, "NOT-A-CODE"), "10.00 NOT-A-CODE");
});

test("audience follows the kind's prefix", () => {
  assert.deepEqual(ORDER_EMAIL_KINDS.map(getOrderEmailAudience), ["buyer", "buyer", "buyer", "seller"]);
  assert.equal(isOrderEmailKind("seller_new_order"), true);
  assert.equal(isOrderEmailKind("buyer_return_approved"), false);
});

test("every kind names the order and never leaks undefined", () => {
  for (const kind of ORDER_EMAIL_KINDS) {
    const parts = orderEmailParts(input(kind));
    for (const text of [parts.subject, parts.intro, parts.detail, parts.cta]) {
      assert.ok(text.length > 0, kind);
      assert.doesNotMatch(text, /undefined|null|NaN/, kind);
    }
    assert.match(parts.subject, /RJ-2001/);
  }
});

test("the receipt says what the buyer still has to do, by payment state", () => {
  const cod = orderEmailParts(input("buyer_order_placed"));
  assert.match(cod.intro, /2 items, total .*1,250\.00/);
  assert.match(cod.detail, /cash on delivery/);

  const unpaid = orderEmailParts(input("buyer_order_placed", { paymentMethod: "xendit", paymentStatus: "pending" }));
  assert.match(unpaid.detail, /complete your online payment/);

  const paid = orderEmailParts(input("buyer_order_placed", { paymentMethod: "xendit", paymentStatus: "paid" }));
  assert.match(paid.detail, /payment is confirmed/i);
  assert.doesNotMatch(paid.detail, /complete your online payment/);

  assert.match(orderEmailParts(input("buyer_order_placed", { itemCount: 1 })).intro, /1 item,/);
});

test("shipped reminds a COD buyer of the amount and does not ask an online buyer to pay", () => {
  assert.match(orderEmailParts(input("buyer_order_shipped")).detail, /have .*1,250\.00 ready/);
  const online = orderEmailParts(input("buyer_order_shipped", { paymentMethod: "xendit", paymentStatus: "paid" }));
  assert.doesNotMatch(online.detail, /ready/);
});

test("the seller email states the payment situation and sends them to the orders page", () => {
  const cod = orderEmailParts(input("seller_new_order"));
  assert.match(cod.detail, /cash on delivery/);
  assert.equal(cod.cta, "Open orders");
  const online = orderEmailParts(input("seller_new_order", { paymentMethod: "xendit", paymentStatus: "paid" }));
  assert.match(online.detail, /Payment is confirmed/);
});

test("footers name the setting that turns the email off", () => {
  assert.match(ORDER_EMAIL_FOOTER.buyer, /account notification settings/);
  assert.match(ORDER_EMAIL_FOOTER.seller, /order alerts/);
});

test("opt-out: a missing row means on; the order alert switch decides", () => {
  assert.equal(isSellerOrderEmailAllowed(null), true);
  assert.equal(isSellerOrderEmailAllowed({ alertOrders: true }), true);
  assert.equal(isSellerOrderEmailAllowed({ alertOrders: false }), false);
});
