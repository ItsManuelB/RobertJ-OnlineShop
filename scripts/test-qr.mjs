/**
 * The hand-rolled QR encoder must produce symbols a real decoder (ZXing) reads
 * back exactly, at the sizes the shipping label uses.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-qr.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { BinaryBitmap, DecodeHintType, BarcodeFormat, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from "@zxing/library";

import { encodeQr } from "../src/features/orders/utils/qr.ts";

function decode(text, { scale = 8, quiet = 4 } = {}) {
  const { size, modules } = encodeQr(text);
  const side = (size + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(side * side).fill(255);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!modules[r][c]) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) pixels[((r + quiet) * scale + y) * side + (c + quiet) * scale + x] = 0;
      }
    }
  }
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]]);
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, side, side)));
  return new MultiFormatReader().decode(bitmap, hints).getText();
}

test("an order number round-trips through a real QR decoder", () => {
  assert.equal(decode("ORD-20261023-000123"), "ORD-20261023-000123");
});

test("every version (1 to 3) decodes, including the capacity limits", () => {
  for (const text of ["A", "ORD-1", "x".repeat(14), "y".repeat(15), "z".repeat(26), "w".repeat(27), "q".repeat(42)]) {
    assert.equal(decode(text), text, `length ${text.length}`);
  }
});

test("a small module size, like a printed label, still decodes", () => {
  assert.equal(decode("ORD-20261023-000123", { scale: 3 }), "ORD-20261023-000123");
});

test("text longer than version 3 is rejected instead of drawing a bad symbol", () => {
  assert.throws(() => encodeQr("n".repeat(43)));
});

test("the symbol is 21, 25 or 29 modules wide for the three versions", () => {
  assert.equal(encodeQr("A").size, 21);
  assert.equal(encodeQr("a".repeat(20)).size, 25);
  assert.equal(encodeQr("a".repeat(40)).size, 29);
});
