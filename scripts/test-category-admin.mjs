/**
 * Unit tests for the admin Categories list helpers.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-category-admin.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  describeCategorySpecs,
  filterCategories,
  summarizeCategories,
} from "../src/features/categories/utils/category-admin.ts";

const cat = (name, active, productCount) => ({ id: name, name, slug: name.toLowerCase(), active, productCount });
const list = [cat("Snacks", true, 4), cat("Bags", true, 0), cat("Seasonal", false, 0)];

test("summary counts active, inactive and empty categories", () => {
  assert.deepEqual(summarizeCategories(list), { total: 3, active: 2, inactive: 1, empty: ["Bags", "Seasonal"] });
  assert.deepEqual(summarizeCategories([]), { total: 0, active: 0, inactive: 0, empty: [] });
});

test("filter combines search (name or slug) with the status chip", () => {
  assert.equal(filterCategories(list, "", "all").length, 3);
  assert.deepEqual(filterCategories(list, "  SNA ", "all").map((c) => c.name), ["Snacks"]);
  assert.deepEqual(filterCategories(list, "", "inactive").map((c) => c.name), ["Seasonal"]);
  assert.deepEqual(filterCategories(list, "bags", "inactive"), []);
});

test("spec chips: required beats option, unconfigured is skipped, order is fixed", () => {
  const attr = (attributeKey, isRequired, isVariantEligible) => ({ attributeKey, isRequired, isVariantEligible });
  assert.deepEqual(
    describeCategorySpecs([attr("size", false, true), attr("color", true, false), attr("material", false, false)]),
    ["Color required", "Size option"],
  );
  assert.deepEqual(describeCategorySpecs([]), []);
});
