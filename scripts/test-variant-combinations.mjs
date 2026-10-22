/**
 * Unit tests for the pure variant-combination helpers.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-variant-combinations.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  axisConsistencyError,
  parseValueList,
  planColorSizeCombinations,
} from "../src/features/products/lib/variant-combinations.ts";

test("parseValueList trims, drops blanks and case-insensitive repeats", () => {
  assert.deepEqual(parseValueList(" Blue, red\nBLUE ,, Green "), ["Blue", "red", "Green"]);
  assert.deepEqual(parseValueList("   "), []);
});

test("planColorSizeCombinations builds the grid minus existing pairs", () => {
  const plan = planColorSizeCombinations(
    ["Blue", "Red"],
    ["S", "M"],
    [{ color: "blue", size: "s" }],
  );
  assert.equal(plan.alreadyExist, 1);
  assert.deepEqual(plan.toCreate, [
    { color: "Blue", size: "M" },
    { color: "Red", size: "S" },
    { color: "Red", size: "M" },
  ]);
});

test("axisConsistencyError allows the first option and matching axes", () => {
  assert.equal(axisConsistencyError([], { color: "Blue" }), null);
  assert.equal(
    axisConsistencyError([{ color: "Blue", size: "S" }], { color: "Red", size: "M" }),
    null,
  );
});

test("axisConsistencyError rejects a row with different axes", () => {
  const message = axisConsistencyError([{ color: "Blue", size: "S" }], { size: "M" });
  assert.match(message, /Color \+ Size/);
  assert.notEqual(axisConsistencyError([{ size: "S" }], { color: "Blue" }), null);
});
