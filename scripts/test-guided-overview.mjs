import assert from "node:assert/strict";
import { test } from "node:test";

import {
  budgetLabel,
  budgetPresets,
  countAttributeValues,
  countOccasions,
  isPurchasable,
  lowestPriceCents,
  niceRound,
} from "../src/features/assistant/lib/guided-overview.ts";
import { matchCandidates } from "../src/features/assistant/lib/guided-match.ts";

const opt = (id, over = {}) => ({ id, color: null, size: null, material: null, dimensions: null, priceCents: null, quantity: 5, ...over });
const prod = (id, over = {}) => ({ id, priceCents: 10000, quantity: 5, material: null, dimensions: null, tags: [], options: [], ...over });

test("purchasable and lowest price", () => {
  assert.equal(isPurchasable(prod("a", { quantity: 0 })), false);
  assert.equal(isPurchasable(prod("b", { options: [opt("o", { quantity: 0 })] })), false);
  assert.equal(isPurchasable(prod("c", { options: [opt("o")] })), true);
  const p = prod("d", { options: [opt("x", { priceCents: 9000 }), opt("y", { priceCents: 5000, quantity: 0 })] });
  assert.equal(lowestPriceCents(p), 9000);
});

test("occasion counts ignore sold-out products and tag case", () => {
  const counts = countOccasions(
    [prod("a", { tags: ["Casual"] }), prod("b", { tags: ["casual", "work"] }), prod("c", { tags: ["casual"], quantity: 0 })],
    ["casual", "work", "party"],
  );
  assert.deepEqual(counts, { casual: 2, work: 1, party: 0 });
});

test("attribute counts use in-stock options and product spec fallback", () => {
  const items = [
    prod("a", { options: [opt("1", { color: "Black" }), opt("2", { color: "Blue", quantity: 0 })] }),
    prod("b", { options: [opt("3", { color: "black " })] }),
    prod("c", { material: "Cotton" }),
    prod("d", { material: "Cotton", options: [opt("4")] }),
  ];
  assert.deepEqual(countAttributeValues(items, "color", ["Black", "Blue"]), { Black: 2, Blue: 0 });
  assert.deepEqual(countAttributeValues(items, "material", ["Cotton"]), { Cotton: 2 });
});

test("budget ranges split prices into rounded thirds", () => {
  const prices = [40, 45, 50, 55, 60, 120, 150, 180, 600, 1200, 1999].map((p) => p * 100);
  const presets = budgetPresets(prices);
  assert.equal(presets.length, 3);
  assert.equal(presets[0].minPesos, null);
  assert.equal(presets[2].maxPesos, null);
  assert.ok(presets[0].maxPesos < presets[1].maxPesos);
  assert.equal(presets.reduce((n, p) => n + p.count, 0) >= prices.length, true);
});

test("budget ranges need enough spread", () => {
  assert.deepEqual(budgetPresets([5000, 5000]), []);
  const same = budgetPresets([5000, 5000, 5000, 5000]);
  assert.ok(same.length <= 2);
});

test("rounding and labels", () => {
  assert.equal(niceRound(57.5), 60);
  assert.equal(niceRound(180), 200);
  assert.equal(niceRound(1234), 1200);
  assert.equal(niceRound(3), 10);
  assert.equal(budgetLabel(null, 50), "Up to ₱50");
  assert.equal(budgetLabel(50, 180), "₱50 to ₱180");
  assert.equal(budgetLabel(1000, null), "₱1,000 and up");
});

test("matcher returns reasons only for confirmed answers", () => {
  const p = prod("a", { tags: ["casual"], options: [opt("1", { color: "Black", size: "M" })] });
  const [r] = matchCandidates([p], { occasion: "casual", size: "M", color: "black", maxPriceCents: 20000 });
  assert.deepEqual(r.reasons, ["Good for Casual", "Size M", "Black", "Within your budget"]);
  const q = prod("b", { options: [opt("2", { color: "Black" })] });
  const [u] = matchCandidates([q], { size: "M", color: "Black" });
  assert.equal(u.fit, "unconfirmed");
  assert.deepEqual(u.reasons, ["Black"]);
});
