/**
 * The Set B/C Code 128 encoder must produce symbols ZXing reads back exactly,
 * and be shorter than Set-B-only for an order number.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-code128.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { BinaryBitmap, DecodeHintType, BarcodeFormat, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from "@zxing/library";

import { encodeCode128, encodeCode128B } from "../src/features/orders/utils/code128.ts";

function decode(encoding, { scale = 3, height = 60 } = {}) {
  const width = encoding.totalModules * scale;
  const pixels = new Uint8ClampedArray(width * height).fill(255);
  for (const bar of encoding.bars) {
    for (let y = 0; y < height; y += 1) {
      for (let x = bar.x * scale; x < (bar.x + bar.width) * scale; x += 1) pixels[y * width + x] = 0;
    }
  }
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]]]);
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)));
  return new MultiFormatReader().decode(bitmap, hints).getText();
}

test("order numbers round-trip", () => {
  for (const value of ["ORD-20261023-000123", "ORD-20260925-000247", "ORD-00000000-000000", "ORD-99999999-999999"]) {
    assert.equal(decode(encodeCode128(value)), value);
  }
});

test("digit-only, letter-only, odd digit runs and short digit runs all round-trip", () => {
  for (const value of ["12345678", "1234567", "123", "ABC", "AB1234C", "A12345", "12345Z", "x-1234567-y", "Hello World 2026"]) {
    assert.equal(decode(encodeCode128(value)), value, value);
  }
});

test("Set C makes an order number about a quarter shorter than Set B alone", () => {
  const value = "ORD-20261023-000123";
  const modules = encodeCode128(value).totalModules;
  const setB = encodeCode128B(value).totalModules;
  assert.ok(modules < setB * 0.85, `${modules} vs ${setB}`);
});

test("the quiet zone can be dropped when the layout provides it", () => {
  const value = "ORD-20261023-000123";
  assert.equal(encodeCode128(value, { quietModules: 0 }).totalModules, encodeCode128(value).totalModules - 20);
});

test("unsupported characters and empty text are rejected", () => {
  assert.throws(() => encodeCode128("é"));
  assert.throws(() => encodeCode128(""));
});
