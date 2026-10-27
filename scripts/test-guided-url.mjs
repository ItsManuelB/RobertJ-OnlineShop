import assert from "node:assert/strict";
import { test } from "node:test";

import { answeredKeys, dropAnswer, guidedSearch } from "../src/features/assistant/utils/guided-url.ts";

const ANSWERS = { categoryId: "c1", occasion: "casual", color: "Black", minPrice: 50, maxPrice: 180 };

test("builds a stable query string", () => {
  assert.equal(guidedSearch({}), "");
  assert.equal(guidedSearch(ANSWERS), "?category=c1&occasion=casual&color=Black&min=50&max=180");
  assert.equal(guidedSearch({ occasion: "work" }, { show: true }), "?occasion=work&show=1");
  assert.equal(guidedSearch({ occasion: "work" }, { step: "budget" }), "?occasion=work&step=budget");
});

test("dropping answers", () => {
  assert.deepEqual(dropAnswer(ANSWERS, "budget"), { categoryId: "c1", occasion: "casual", color: "Black" });
  assert.deepEqual(dropAnswer(ANSWERS, "category"), { occasion: "casual", minPrice: 50, maxPrice: 180 });
  assert.deepEqual(dropAnswer(ANSWERS, "color").color, undefined);
  assert.equal(ANSWERS.color, "Black");
});

test("answered keys follow question order", () => {
  assert.deepEqual(answeredKeys(ANSWERS), ["category", "occasion", "color", "budget"]);
  assert.deepEqual(answeredKeys({ maxPrice: 100 }), ["budget"]);
  assert.deepEqual(answeredKeys({}), []);
});
