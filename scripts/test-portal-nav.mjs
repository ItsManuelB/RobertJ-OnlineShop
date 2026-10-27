/**
 * Unit tests for the shared portal shell helpers and the seller menu badges.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-portal-nav.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBreadcrumb,
  filterNavItems,
  formatBadgeCount,
  isNavActive,
  sumNotificationItems,
} from "../src/components/portal/portal-nav.ts";
import { buildSellerNavBadges, filterSellerTasks, DEFAULT_SELLER_ALERT_PREFERENCES } from "../src/features/seller/utils/seller-tasks.ts";

const home = "/seller/dashboard";
const groups = [
  { label: "Overview", items: [{ href: home, label: "Dashboard", icon: null }] },
  { label: "Sell", items: [{ href: "/seller/orders", label: "Orders", icon: null }] },
];
const settings = { href: "/seller/settings", label: "Settings", icon: null };

test("isNavActive matches exact and nested routes, home only exactly", () => {
  assert.equal(isNavActive("/seller/orders/abc", "/seller/orders", home), true);
  assert.equal(isNavActive("/seller/orders", "/seller/orders", home), true);
  assert.equal(isNavActive("/seller/ordersx", "/seller/orders", home), false);
  assert.equal(isNavActive("/seller/dashboard/extra", home, home), false);
});

test("formatBadgeCount caps at 99+", () => {
  assert.equal(formatBadgeCount(7), "7");
  assert.equal(formatBadgeCount(99), "99");
  assert.equal(formatBadgeCount(100), "99+");
});

test("sumNotificationItems counts 1 when count is missing", () => {
  assert.equal(sumNotificationItems([{ count: 3 }, { count: 2 }, {}]), 6);
  assert.equal(sumNotificationItems([]), 0);
});

test("buildBreadcrumb links the section on nested pages and labels ids as Details", () => {
  assert.deepEqual(buildBreadcrumb("/seller/orders", "Seller", groups, settings, home), [
    { label: "Seller", href: home },
    { label: "Orders" },
  ]);
  assert.deepEqual(buildBreadcrumb("/seller/orders/0b9f7c1e-1234-4abc-9def-0123456789ab", "Seller", groups, settings, home), [
    { label: "Seller", href: home },
    { label: "Orders", href: "/seller/orders" },
    { label: "Details" },
  ]);
  assert.equal(buildBreadcrumb("/seller/orders/labels", "Seller", groups, settings, home).at(-1).label, "Labels");
  assert.deepEqual(buildBreadcrumb("/seller/unknown", "Seller", groups, settings, home), [{ label: "Seller", href: home }]);
});

test("filterNavItems matches labels case-insensitively", () => {
  const items = groups.flatMap((g) => g.items);
  assert.deepEqual(filterNavItems(items, "ord").map((i) => i.label), ["Orders"]);
  assert.equal(filterNavItems(items, "").length, 2);
});

const routes = { orders: "/o", returns: "/r", inventory: "/i", payments: "/p" };
const task = (id, count, urgent = null) => ({ id, count, urgent, title: "", detail: "", cta: "", href: "", tone: "info" });

test("buildSellerNavBadges sums items per destination and flags overdue", () => {
  const badges = buildSellerNavBadges(
    [task("confirm-orders", 2), task("fulfil-orders", 1, "1 overdue"), task("return-requests", 2), task("cod-collection", 1), task("restock", 7)],
    routes,
  );
  assert.deepEqual(badges["/o"], { count: 3, urgent: true });
  assert.deepEqual(badges["/r"], { count: 2, urgent: false });
  assert.deepEqual(badges["/p"], { count: 1, urgent: false });
  assert.deepEqual(badges["/i"], { count: 7, urgent: false });
});

test("filterSellerTasks hides muted kinds, so menu badges follow Alerts settings", () => {
  const tasks = [task("confirm-orders", 2), task("restock", 7)];
  const kept = filterSellerTasks(tasks, { ...DEFAULT_SELLER_ALERT_PREFERENCES, lowStock: false });
  assert.deepEqual(kept.map((t) => t.id), ["confirm-orders"]);
});
