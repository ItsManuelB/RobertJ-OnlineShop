import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyWishlistView,
  countByShow,
  parseWishlistView,
} from "../src/features/wishlist/utils/wishlist-view.ts";

const ITEMS = [
  { id: "a", priceCents: 500, quantity: 20 },
  { id: "b", priceCents: 100, quantity: 0 },
  { id: "c", priceCents: 300, quantity: 3 },
];

test("unknown params fall back to defaults", () => {
  assert.deepEqual(parseWishlistView("zzz", undefined), { sort: "recent", show: "all" });
  assert.deepEqual(parseWishlistView("price_asc", "in_stock"), { sort: "price_asc", show: "in_stock" });
});

test("recent keeps saved order", () => {
  const ids = applyWishlistView(ITEMS, { sort: "recent", show: "all" }, 5).map((i) => i.id);
  assert.deepEqual(ids, ["a", "b", "c"]);
});

test("sorts by price without mutating the input", () => {
  const asc = applyWishlistView(ITEMS, { sort: "price_asc", show: "all" }, 5).map((i) => i.id);
  const desc = applyWishlistView(ITEMS, { sort: "price_desc", show: "all" }, 5).map((i) => i.id);
  assert.deepEqual(asc, ["b", "c", "a"]);
  assert.deepEqual(desc, ["a", "c", "b"]);
  assert.deepEqual(ITEMS.map((i) => i.id), ["a", "b", "c"]);
});

test("availability chips split at the low-stock line", () => {
  const inStock = applyWishlistView(ITEMS, { sort: "recent", show: "in_stock" }, 5).map((i) => i.id);
  const lowOrOut = applyWishlistView(ITEMS, { sort: "recent", show: "low_or_out" }, 5).map((i) => i.id);
  assert.deepEqual(inStock, ["a"]);
  assert.deepEqual(lowOrOut, ["b", "c"]);
  assert.deepEqual(countByShow(ITEMS, 5), { all: 3, in_stock: 1, low_or_out: 2 });
});
