/**
 * Unit tests for the buyer "Download my data" builder.
 *   node --experimental-strip-types --no-warnings scripts/test-export-my-data.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildExport, exportFileName } from "../src/features/account/lib/export-my-data.ts";

const source = {
  email: "b@example.com",
  profile: { id: "uid-1", role: "buyer", avatarUrl: "x", fullName: "Bea", username: "bea", phone: "0917", gender: null, dateOfBirth: null, bio: null },
  preferences: { orderUpdates: true, promotions: false, pushEnabled: false, emailEnabled: false, smsEnabled: false, defaultPaymentMethod: "cod" },
  addresses: [{ id: "addr-1", label: "Home", recipientName: "Bea", phone: "0917", region: null, province: null, city: "Cebu", barangay: null, streetDetails: "1 St", postalCode: "6000", country: "PH", isDefault: true, createdAt: "a", updatedAt: "b" }],
  orders: [{
    id: "order-1", buyerId: "uid-1", sellerId: "seller-9", orderNumber: "RJ-1", status: "delivered", paymentStatus: "paid", paymentMethod: "cod",
    subtotalCents: 1000, shippingFeeCents: 100, totalCents: 1100, currency: "PHP", shippingAddress: null, notes: null, shopName: "Shop",
    items: [{ id: "it-1", productId: "p-1", productTitle: "Shirt", variantLabel: "M", quantity: 1, unitPriceCents: 1000, subtotalCents: 1000, imageUrl: "u" }],
    placedAt: "t", paidAt: null, shippedAt: null, deliveredAt: null, cancelledAt: null,
  }],
  wishlistCount: 3,
};

test("includes the buyer's own data", () => {
  const out = buildExport(source, new Date("2026-10-14T01:00:00Z"));
  assert.equal(out.account.email, "b@example.com");
  assert.equal(out.orders[0].items[0].productTitle, "Shirt");
  assert.equal(out.orders[0].totalCents, 1100);
  assert.equal(out.wishlistCount, 3);
  assert.equal(exportFileName(out.exportedAt), "robertj-my-data-2026-10-14.json");
});

test("never leaks internal ids or seller identifiers", () => {
  const text = JSON.stringify(buildExport(source));
  for (const secret of ["uid-1", "seller-9", "order-1", "addr-1", "p-1", "it-1"]) {
    assert.ok(!text.includes(secret), `leaked ${secret}`);
  }
});

test("handles a brand-new buyer with nothing", () => {
  const out = buildExport({ ...source, profile: null, addresses: [], orders: [], wishlistCount: 0 });
  assert.equal(out.account.fullName, null);
  assert.deepEqual(out.orders, []);
});
