/**
 * Unit tests for the pure Guided Selection matcher (ADR-022).
 *   node --experimental-strip-types --no-warnings scripts/test-guided-match.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { matchCandidates } from "../src/features/assistant/lib/guided-match.ts";

const opt = (id, o = {}) => ({ id, color: null, size: null, material: null, dimensions: null, priceCents: null, quantity: 5, ...o });
const prod = (id, o = {}) => ({ id, priceCents: 100000, quantity: 5, material: null, dimensions: null, tags: [], options: [], ...o });
const ids = (results) => results.map((r) => r.candidateId);

test("no answers: every in-stock product matches, sold-out ones do not", () => {
  const r = matchCandidates([prod("a"), prod("b", { quantity: 0 })], {});
  assert.deepEqual(ids(r), ["a"]);
});

test("a product whose options are all sold out is not recommended", () => {
  const r = matchCandidates([prod("a", { options: [opt("o1", { size: "M", quantity: 0 })] })], {});
  assert.deepEqual(r, []);
});

test("size needs a real in-stock option of that size", () => {
  const p = prod("a", { options: [opt("o1", { size: "S" }), opt("o2", { size: "M", quantity: 0 })] });
  assert.deepEqual(matchCandidates([p], { size: "M" }), []);
  const r = matchCandidates([p], { size: "s" });
  assert.equal(r[0].optionId, "o1");
});

test("size and color must be satisfied by the same option", () => {
  const p = prod("a", { options: [opt("o1", { size: "M", color: "Red" }), opt("o2", { size: "L", color: "Black" })] });
  assert.deepEqual(matchCandidates([p], { size: "M", color: "Black" }), []);
  assert.equal(matchCandidates([p], { size: "L", color: "black" })[0].optionId, "o2");
});

test("a product without options is never an exact match for a size or color answer", () => {
  const size = matchCandidates([prod("a")], { size: "M" });
  assert.equal(size.length, 1);
  assert.equal(size[0].fit, "unconfirmed");
  assert.equal(size[0].note, "Size not confirmed");
  const both = matchCandidates([prod("a")], { size: "M", color: "Red" });
  assert.equal(both[0].note, "Size and color not confirmed");
  assert.equal(both[0].optionId, null);
});

test("an unconfirmed product still has to be in stock, in budget and match other answers", () => {
  assert.deepEqual(matchCandidates([prod("a", { quantity: 0 })], { size: "M" }), []);
  assert.deepEqual(matchCandidates([prod("a")], { size: "M", maxPriceCents: 50000 }), []);
  assert.deepEqual(matchCandidates([prod("a", { material: "Cotton" })], { size: "M", material: "Linen" }), []);
});

test("unconfirmed matches rank after exact and close ones", () => {
  const confirmed = prod("c", { options: [opt("o1", { size: "M" })] });
  const r = matchCandidates([prod("u"), confirmed], { size: "M" });
  assert.deepEqual(ids(r), ["c", "u"]);
  assert.deepEqual(r.map((x) => x.fit), ["exact", "unconfirmed"]);
});

test("options that carry color but no size leave size unconfirmed, color still matched", () => {
  const p = prod("a", { options: [opt("o1", { color: "Blue" }), opt("o2", { color: "Red" })] });
  const r = matchCandidates([p], { size: "M", color: "red" });
  assert.equal(r[0].fit, "unconfirmed");
  assert.equal(r[0].optionId, "o2");
  assert.equal(r[0].note, "Size not confirmed");
  assert.deepEqual(matchCandidates([p], { size: "M", color: "Green" }), []);
});

test("material and dimensions fall back to the product's own spec", () => {
  const p = prod("a", { material: "Cotton", options: [opt("o1", { size: "M" })] });
  assert.equal(matchCandidates([p], { material: "cotton" }).length, 1);
  assert.equal(matchCandidates([p], { material: "Linen" }).length, 0);
  const q = prod("b", { material: "Cotton", options: [opt("o2", { material: "Linen" })] });
  assert.equal(matchCandidates([q], { material: "Linen" }).length, 1);
  assert.equal(matchCandidates([q], { material: "Cotton" }).length, 0);
});

test("budget uses the option's own price, else the product price; picks the cheapest fit", () => {
  const p = prod("a", { priceCents: 100000, options: [opt("o1", { size: "M", priceCents: 80000 }), opt("o2", { size: "M" })] });
  const r = matchCandidates([p], { size: "M", maxPriceCents: 90000 });
  assert.equal(r[0].optionId, "o1");
  assert.equal(r[0].matchedPriceCents, 80000);
  assert.equal(r[0].fit, "exact");
});

test("just over budget is a close match with a note; far over is dropped", () => {
  const near = prod("near", { priceCents: 110000 });
  const far = prod("far", { priceCents: 200000 });
  const r = matchCandidates([near, far], { maxPriceCents: 100000 });
  assert.deepEqual(ids(r), ["near"]);
  assert.equal(r[0].fit, "close");
  assert.match(r[0].note, /over your budget/);
});

test("exact matches always rank above close ones", () => {
  const close = prod("close", { priceCents: 110000 });
  const exact = prod("exact", { priceCents: 90000 });
  assert.deepEqual(ids(matchCandidates([close, exact], { maxPriceCents: 100000 })), ["exact", "close"]);
});

test("occasion: tagged first, untagged still qualifies, other-occasion-only is excluded", () => {
  const tagged = prod("tagged", { tags: ["Formal"] });
  const untagged = prod("untagged", { tags: ["sale"] });
  const other = prod("other", { tags: ["party"] });
  const r = matchCandidates([untagged, other, tagged], { occasion: "formal" });
  assert.deepEqual(ids(r), ["tagged", "untagged"]);
});

test("limit is applied after ranking", () => {
  const list = Array.from({ length: 5 }, (_, i) => prod(`p${i}`));
  assert.equal(matchCandidates(list, {}, 3).length, 3);
});

test("optionId is null when no attribute was asked", () => {
  const p = prod("a", { options: [opt("o1", { size: "M" })] });
  assert.equal(matchCandidates([p], {})[0].optionId, null);
});
