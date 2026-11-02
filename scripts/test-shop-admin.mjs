/**
 * Unit tests for the admin Shops list helpers.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-shop-admin.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { filterShops, summarizeShops } from "../src/features/shops/utils/shop-admin.ts";

const shop = (name, active, members) => ({ id: name, name, slug: name.toLowerCase().replace(/ /g, "-"), active, members: members.map((m) => ({ id: m, name: m })) });
const list = [
  shop("Thread Needle", true, ["Ana Reyes"]),
  shop("Seasonal Corner", true, []),
  shop("Old Stall", false, ["Ben Lim"]),
];

test("summary counts active, inactive and shops with no seller", () => {
  assert.deepEqual(summarizeShops(list), { total: 3, active: 2, inactive: 1, unassigned: ["Seasonal Corner"] });
  assert.deepEqual(summarizeShops([]), { total: 0, active: 0, inactive: 0, unassigned: [] });
});

test("filter matches name, slug or seller, and combines with status", () => {
  assert.equal(filterShops(list, "", "all").length, 3);
  assert.deepEqual(filterShops(list, "thread", "all").map((s) => s.name), ["Thread Needle"]);
  assert.deepEqual(filterShops(list, "seasonal-corner", "all").map((s) => s.name), ["Seasonal Corner"]);
  assert.deepEqual(filterShops(list, "ben", "all").map((s) => s.name), ["Old Stall"]);
  assert.deepEqual(filterShops(list, "", "inactive").map((s) => s.name), ["Old Stall"]);
  assert.deepEqual(filterShops(list, "ana", "inactive"), []);
});
