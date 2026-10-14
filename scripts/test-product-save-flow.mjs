/**
 * Unit tests for the pure "save a new product with photos and options" flow
 * and the variant-photo filter. No test framework is installed (see
 * CLAUDE.md → Testing Expectations), so this uses Node's built-in runner and
 * type-stripping:
 *
 *   node --experimental-strip-types --no-warnings scripts/test-product-save-flow.mjs
 *
 * The modules under test deliberately have no runtime imports.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { initialProgress, isSaveComplete, runProductSave } from "../src/features/products/lib/product-save-flow.ts";
import { filterImagesForColor, getColorOptions } from "../src/lib/utils/variant-images.ts";

const PID = "11111111-1111-4111-8111-111111111111";

/** Fake dependencies that record every call and fail on demand. */
function makeDeps({ failCreate = 0, failUpload = new Set(), failVariant = new Set(), failTag = new Set(), throwOn = null } = {}) {
  const calls = { create: 0, upload: [], variant: [], tag: [] };
  let createFailures = failCreate;
  return {
    calls,
    deps: {
      async createProduct() {
        calls.create += 1;
        if (throwOn === "create") throw new Error("network down");
        if (createFailures > 0) { createFailures -= 1; return { success: false, error: "create failed" }; }
        return { success: true, data: { id: PID } };
      },
      async uploadPhoto(productId, file) {
        assert.equal(productId, PID);
        calls.upload.push(file.name);
        if (failUpload.has(file.name)) return { success: false, error: `upload ${file.name} failed` };
        return { success: true, data: { id: `img-${file.name}` } };
      },
      async ensureVariant(productId, input) {
        assert.equal(productId, PID);
        const label = input.color ?? input.size;
        calls.variant.push(label);
        if (failVariant.has(label)) return { success: false, error: `option ${label} failed` };
        return { success: true, data: { id: `var-${label}` } };
      },
      async tagPhoto(imageId, variantId) {
        calls.tag.push([imageId, variantId]);
        if (failTag.has(imageId)) return { success: false, error: "tag failed" };
        return { success: true, data: null };
      },
    },
  };
}

const photos = (...names) => names.map((name, i) => ({ key: `p${i}`, file: { name }, color: null }));
const sizes = (...labels) => labels.map((size) => ({ key: `o-${size}`, input: { size } }));

test("happy path saves product, photos and options exactly once", async () => {
  const { deps, calls } = makeDeps();
  const result = await runProductSave(initialProgress(PID, photos("a", "b"), sizes("30", "32")), deps);
  assert.equal(isSaveComplete(result), true);
  assert.equal(calls.create, 1);
  assert.deepEqual(calls.upload, ["a", "b"]);
  assert.deepEqual(calls.variant, ["30", "32"]);
});

test("a product with no photos or options saves with just the create call", async () => {
  const { deps, calls } = makeDeps();
  const result = await runProductSave(initialProgress(PID, [], []), deps);
  assert.equal(isSaveComplete(result), true);
  assert.deepEqual([calls.create, calls.upload.length, calls.variant.length], [1, 0, 0]);
});

test("if the product fails, nothing else is attempted, and a retry creates it once", async () => {
  const { deps, calls } = makeDeps({ failCreate: 1 });
  const first = await runProductSave(initialProgress(PID, photos("a"), sizes("30")), deps);
  assert.equal(first.product, "failed");
  assert.equal(first.productError, "create failed");
  assert.deepEqual([calls.upload.length, calls.variant.length], [0, 0]);

  const second = await runProductSave(first, deps);
  assert.equal(isSaveComplete(second), true);
  assert.equal(calls.create, 2); // second attempt is the successful one; same clientId makes it idempotent server-side
  assert.deepEqual(calls.upload, ["a"]);
});

test("a thrown error (network down) becomes a failed step instead of escaping", async () => {
  const { deps } = makeDeps({ throwOn: "create" });
  const result = await runProductSave(initialProgress(PID, [], []), deps);
  assert.equal(result.product, "failed");
  assert.equal(result.productError, "network down");
});

test("photo upload stops at the first failure to keep the cover order, and a retry resumes there", async () => {
  const { deps, calls } = makeDeps({ failUpload: new Set(["b"]) });
  const first = await runProductSave(initialProgress(PID, photos("a", "b", "c"), []), deps);
  assert.deepEqual(first.photos.map((p) => p.status), ["done", "failed", "pending"]);
  assert.deepEqual(calls.upload, ["a", "b"]); // "c" was never attempted

  const { deps: deps2, calls: calls2 } = makeDeps();
  const second = await runProductSave(first, deps2);
  assert.equal(isSaveComplete(second), true);
  assert.equal(calls2.create, 0, "the product is not created again");
  assert.deepEqual(calls2.upload, ["b", "c"], "photo a is not uploaded twice");
});

test("options are independent: one failing does not block the rest, and retry redoes only that one", async () => {
  const { deps, calls } = makeDeps({ failVariant: new Set(["32"]) });
  const first = await runProductSave(initialProgress(PID, [], sizes("30", "32", "34")), deps);
  assert.deepEqual(first.options.map((o) => o.status), ["done", "failed", "done"]);
  assert.deepEqual(calls.variant, ["30", "32", "34"]);

  const { deps: deps2, calls: calls2 } = makeDeps();
  const second = await runProductSave(first, deps2);
  assert.equal(isSaveComplete(second), true);
  assert.deepEqual(calls2.variant, ["32"]);
  assert.equal(calls2.create, 0);
});

test("photos still upload when an option fails (and vice versa)", async () => {
  const { deps, calls } = makeDeps({ failVariant: new Set(["30"]) });
  const result = await runProductSave(initialProgress(PID, photos("a"), sizes("30")), deps);
  assert.equal(result.photos[0].status, "done");
  assert.equal(result.options[0].status, "failed");
  assert.deepEqual(calls.upload, ["a"]);
});

test("a photo tagged with a color is tagged to the first saved option of that color", async () => {
  const { deps, calls } = makeDeps();
  const tagged = [{ key: "p0", file: { name: "blue" }, color: "Blue" }, { key: "p1", file: { name: "plain" }, color: null }];
  const options = [{ key: "o1", input: { color: "Red" } }, { key: "o2", input: { color: "Blue" } }, { key: "o3", input: { color: "Blue", size: "M" } }];
  const result = await runProductSave(initialProgress(PID, tagged, options), deps);
  assert.equal(isSaveComplete(result), true);
  assert.deepEqual(calls.tag, [["img-blue", "var-Blue"]]);
});

test("a failed tag keeps the saved photo, is retried alone, and is not re-uploaded", async () => {
  const { deps } = makeDeps({ failTag: new Set(["img-blue"]) });
  const input = initialProgress(PID, [{ key: "p0", file: { name: "blue" }, color: "Blue" }], [{ key: "o", input: { color: "Blue" } }]);
  const first = await runProductSave(input, deps);
  assert.equal(first.photos[0].status, "done");
  assert.equal(first.photos[0].tagged, false);
  assert.equal(isSaveComplete(first), false);

  const { deps: deps2, calls: calls2 } = makeDeps();
  const second = await runProductSave(first, deps2);
  assert.equal(isSaveComplete(second), true);
  assert.deepEqual([calls2.create, calls2.upload.length, calls2.variant.length], [0, 0, 0]);
  assert.deepEqual(calls2.tag, [["img-blue", "var-Blue"]]);
});

test("a tag waits for its option: if the color option fails, the photo is untagged until it is retried", async () => {
  const { deps } = makeDeps({ failVariant: new Set(["Blue"]) });
  const input = initialProgress(PID, [{ key: "p0", file: { name: "blue" }, color: "Blue" }], [{ key: "o", input: { color: "Blue" } }]);
  const first = await runProductSave(input, deps);
  assert.equal(first.photos[0].tagged, false);

  const { deps: deps2, calls: calls2 } = makeDeps();
  const second = await runProductSave(first, deps2);
  assert.equal(isSaveComplete(second), true);
  assert.deepEqual(calls2.tag, [["img-blue", "var-Blue"]]);
});

test("a color tag with no option of that color never holds the save open", async () => {
  const { deps, calls } = makeDeps();
  const result = await runProductSave(initialProgress(PID, [{ key: "p0", file: { name: "orphan" }, color: "Green" }], sizes("30")), deps);
  assert.equal(isSaveComplete(result), true);
  assert.equal(calls.tag.length, 0);
});

test("running twice over finished progress does nothing (a double click cannot duplicate work)", async () => {
  const { deps, calls } = makeDeps();
  const done = await runProductSave(initialProgress(PID, photos("a"), sizes("30")), deps);
  const again = await runProductSave(done, deps);
  assert.equal(isSaveComplete(again), true);
  assert.deepEqual([calls.create, calls.upload.length, calls.variant.length], [1, 1, 1]);
});

test("the input progress object is never mutated", async () => {
  const { deps } = makeDeps();
  const input = initialProgress(PID, photos("a"), sizes("30"));
  const snapshot = JSON.stringify(input);
  await runProductSave(input, deps);
  assert.equal(JSON.stringify(input), snapshot);
});

test("onProgress reports snapshots as steps complete", async () => {
  const { deps } = makeDeps();
  const seen = [];
  await runProductSave(initialProgress(PID, photos("a"), sizes("30")), deps, (p) => seen.push(`${p.product}/${p.photos[0].status}/${p.options[0].status}`));
  assert.deepEqual(seen, ["done/pending/pending", "done/done/pending", "done/done/done"]);
});

// ---- variant photo helpers (unchanged behaviour, kept under test) ----
const variants = [{ id: "b1", color: "Blue" }, { id: "b2", color: "Blue" }, { id: "r1", color: "Red" }, { id: "x", color: null }];
const img = (id, variantId) => ({ id, variantId });
const ids = (list) => list.map((i) => i.id).join();

test("filterImagesForColor never returns an empty gallery and leaves untagged products untouched", () => {
  assert.equal(ids(filterImagesForColor([img("1", null), img("2", null)], variants, "Blue")), "1,2");
  assert.equal(ids(filterImagesForColor([img("1", null), img("2", "b1"), img("3", "r1")], variants, "Blue")), "2");
  assert.equal(ids(filterImagesForColor([img("1", null), img("3", "r1")], variants, "Blue")), "1");
  assert.equal(ids(filterImagesForColor([img("3", "r1")], variants, "Blue")), "3");
  assert.equal(ids(filterImagesForColor([img("1", null)], variants, null)), "1");
});

test("getColorOptions lists each color once with its first variant", () => {
  assert.deepEqual(getColorOptions(variants), [{ color: "Blue", variantId: "b1" }, { color: "Red", variantId: "r1" }]);
});
