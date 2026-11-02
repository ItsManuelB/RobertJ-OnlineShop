/**
 * Unit tests for the order email wording and the seller opt-out rule.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-order-email.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { renderEmail } from "../src/lib/email/layout.ts";
import {
  ORDER_EMAIL_KINDS,
  ORDER_EMAIL_MAX_ITEMS,
  ORDER_EMAIL_REASON,
  formatOrderPlaced,
  formatOrderTotal,
  getOrderEmailAudience,
  isOrderEmailKind,
  isSellerOrderEmailAllowed,
  orderEmailMessage,
} from "../src/features/notifications/utils/order-email.ts";

const chrome = { logoUrl: "https://shop.test/brand/email-logo.png", siteUrl: "https://shop.test", settingsUrl: null, canReply: false };
const input = (kind, extra = {}) => ({
  kind,
  orderNumber: "RJ-2001",
  url: "https://shop.test/orders/abc",
  totalCents: 125000,
  currency: "PHP",
  paymentMethod: "cod",
  paymentStatus: "pending",
  itemCount: 2,
  ...extra,
});
const details = (extra = {}) => ({
  placedAt: "2026-11-02T08:12:00Z",
  shippingFeeCents: 10000,
  items: [
    { name: "Linen camp shirt", variantLabel: "Size M", quantity: 1, amountCents: 75000 },
    { name: "Canvas tote", variantLabel: null, quantity: 2, amountCents: 40000 },
  ],
  courier: "J&T Express",
  trackingNumber: "JT0012345678",
  ...extra,
});
const render = (kind, extra) => renderEmail(orderEmailMessage(input(kind, extra)), chrome);
const flat = (message) => JSON.stringify(message);

test("totals are shown from integer cents", () => {
  assert.match(formatOrderTotal(125000, "PHP"), /1,250\.00/);
  assert.match(formatOrderTotal(5, "PHP"), /0\.05/);
  assert.equal(formatOrderTotal(1000, "NOT-A-CODE"), "10.00 NOT-A-CODE");
});

test("the placed time is shown in Manila time", () => {
  // 08:12 UTC is 4:12 pm in Manila.
  assert.match(formatOrderPlaced("2026-11-02T08:12:00Z"), /4:12\s?pm/i);
});

test("audience follows the kind's prefix", () => {
  assert.deepEqual(ORDER_EMAIL_KINDS.map(getOrderEmailAudience), ["buyer", "buyer", "buyer", "seller"]);
  assert.equal(isOrderEmailKind("seller_new_order"), true);
  assert.equal(isOrderEmailKind("buyer_return_approved"), false);
});

test("every kind names the order and never leaks undefined, with or without details", () => {
  for (const kind of ORDER_EMAIL_KINDS) {
    for (const extra of [{}, { details: details() }, { details: details({ courier: null, trackingNumber: null }) }]) {
      const message = orderEmailMessage(input(kind, extra));
      assert.ok(message.subject.length > 0 && message.headline.length > 0 && message.cta.label.length > 0, kind);
      assert.doesNotMatch(flat(message), /undefined|null|NaN/, kind);
      assert.match(message.subject, /RJ-2001/);
    }
  }
});

test("subjects fit a phone with the longest real order number and a large total", () => {
  for (const kind of ORDER_EMAIL_KINDS) {
    const { subject } = orderEmailMessage(input(kind, { orderNumber: "ORD-20261102-000481", totalCents: 12500000 }));
    assert.ok(subject.length <= 60, `${kind}: ${subject.length} characters`);
  }
});

test("the receipt says what the buyer still has to do, by payment state", () => {
  const cod = orderEmailMessage(input("buyer_order_placed"));
  assert.match(cod.paragraphs[0], /pay in cash/i);
  assert.match(cod.preheader, /1,250\.00 in cash/);

  const unpaid = orderEmailMessage(input("buyer_order_placed", { paymentMethod: "xendit", paymentStatus: "pending" }));
  assert.match(unpaid.paragraphs[0], /complete your online payment/);

  const paid = orderEmailMessage(input("buyer_order_placed", { paymentMethod: "xendit", paymentStatus: "paid" }));
  assert.match(paid.paragraphs[0], /payment is confirmed/i);
  assert.doesNotMatch(paid.paragraphs[0], /complete your online payment/);
});

test("the receipt greets the buyer by first name when there is one", () => {
  assert.equal(orderEmailMessage(input("buyer_order_placed", { firstName: "Ana" })).headline, "Thanks for your order, Ana");
  assert.equal(orderEmailMessage(input("buyer_order_placed", { firstName: null })).headline, "Thanks for your order");
});

test("with details, the receipt lists the lines, the shipping fee and the total", () => {
  const mail = render("buyer_order_placed", { details: details() });
  assert.match(mail.text, /Placed: 2 Nov 2026|Placed: Nov 2, 2026/);
  assert.match(mail.text, /- Linen camp shirt \(Size M\) x 1  .*750\.00/);
  assert.match(mail.text, /- Canvas tote x 2  .*400\.00/);
  assert.match(mail.text, /Shipping: .*100\.00/);
  assert.match(mail.text, /Total: .*1,250\.00/);
  assert.match(mail.text, /Payment: Cash on delivery/);
});

test("without details, the receipt still gives the count and the total", () => {
  const mail = render("buyer_order_placed", { details: null });
  assert.match(mail.text, /Items: 2 items/);
  assert.match(mail.text, /Total: .*1,250\.00/);
  assert.doesNotMatch(mail.text, /Shipping|Placed/);
  assert.match(render("buyer_order_placed", { details: null, itemCount: 1 }).text, /Items: 1 item\n/);
});

test("a big order lists the first lines and summarises the rest", () => {
  const items = Array.from({ length: ORDER_EMAIL_MAX_ITEMS + 3 }, (_, i) => ({
    name: `Item ${i + 1}`,
    variantLabel: null,
    quantity: 1,
    amountCents: 1000,
  }));
  const { text } = render("seller_new_order", { details: details({ items }) });
  assert.match(text, new RegExp(`- Item ${ORDER_EMAIL_MAX_ITEMS}\\b`));
  assert.doesNotMatch(text, new RegExp(`- Item ${ORDER_EMAIL_MAX_ITEMS + 1}\\b`));
  assert.match(text, /- and 3 more items/);
});

test("shipped shows the courier and tracking number, and reminds a COD buyer of the amount", () => {
  const mail = render("buyer_order_shipped", { details: details() });
  assert.match(mail.text, /Courier: J&T Express/);
  assert.match(mail.text, /Tracking number: JT0012345678/);
  assert.match(mail.text, /To pay on arrival: .*1,250\.00 in cash/);
  assert.match(mail.html, /J&amp;T Express/);

  const online = render("buyer_order_shipped", { paymentMethod: "xendit", paymentStatus: "paid", details: details() });
  assert.doesNotMatch(online.text, /To pay on arrival/);

  const noShipment = render("buyer_order_shipped", { details: details({ courier: null, trackingNumber: null }) });
  assert.doesNotMatch(noShipment.text, /Courier|Tracking number/);
});

test("the seller email states the payment situation, lists the order, and never names the buyer", () => {
  const cod = render("seller_new_order", { details: details(), firstName: "Ana" });
  assert.match(cod.text, /Payment: Cash on delivery/);
  assert.match(cod.text, /Open orders: https:\/\/shop\.test\/orders\/abc/);
  assert.doesNotMatch(cod.text, /Ana/);
  assert.match(cod.subject, /New order RJ-2001: .*1,250\.00/);

  const online = render("seller_new_order", { paymentMethod: "xendit", paymentStatus: "paid" });
  assert.match(online.text, /Payment: Paid online/);
});

test("emails explain why the person got them", () => {
  assert.match(ORDER_EMAIL_REASON.buyer, /order update emails are on/);
  assert.match(ORDER_EMAIL_REASON.seller, /order alerts are on/);
  assert.match(render("buyer_order_delivered").text, /order update emails are on/);
});

test("opt-out: a missing row means on; the order alert switch decides", () => {
  assert.equal(isSellerOrderEmailAllowed(null), true);
  assert.equal(isSellerOrderEmailAllowed({ alertOrders: true }), true);
  assert.equal(isSellerOrderEmailAllowed({ alertOrders: false }), false);
});
