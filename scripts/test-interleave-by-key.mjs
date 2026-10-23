/**
 * Unit tests for the round-robin shop mixer.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-interleave-by-key.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { interleaveByKey } from "../src/features/products/lib/interleave-by-key.ts";

const key = (item) => item[0];

test("alternates between groups and keeps each group's order", () => {
  assert.deepEqual(interleaveByKey(["a1", "a2", "a3", "b1", "b2", "b3"], key), [
    "a1", "b1", "a2", "b2", "a3", "b3",
  ]);
});

test("a group that runs out drops out; nothing is lost or repeated", () => {
  const input = ["a1", "a2", "a3", "a4", "b1"];
  const out = interleaveByKey(input, key);
  assert.deepEqual(out, ["a1", "b1", "a2", "a3", "a4"]);
  assert.deepEqual([...out].sort(), [...input].sort());
});

test("one group, or none, comes back unchanged", () => {
  assert.deepEqual(interleaveByKey(["a1", "a2"], key), ["a1", "a2"]);
  assert.deepEqual(interleaveByKey([], key), []);
});
