/**
 * Unit tests for the Resend webhook signature check and the suppression rules.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-resend-webhook.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  RESEND_WEBHOOK_TOLERANCE_SECONDS,
  getSuppressionEvent,
  verifyResendWebhook,
} from "../src/lib/email/resend-webhook.ts";

const KEY_BYTES = Buffer.from("0123456789abcdef0123456789abcdef");
const SECRET = `whsec_${KEY_BYTES.toString("base64")}`;
const NOW = 1_790_000_000;
const BODY = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.test"] } });

/** Signs the way Svix documents it, independently of the code under test. */
function sign(id, timestamp, body, key = KEY_BYTES) {
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}
const headers = (overrides = {}) => ({
  id: "msg_1",
  timestamp: String(NOW),
  signature: sign("msg_1", String(NOW), BODY),
  ...overrides,
});

test("a correctly signed, fresh request passes", () => {
  assert.equal(verifyResendWebhook(headers(), BODY, SECRET, NOW), true);
});

test("any change to the body, id or timestamp breaks the signature", () => {
  assert.equal(verifyResendWebhook(headers(), BODY + " ", SECRET, NOW), false);
  assert.equal(verifyResendWebhook(headers({ id: "msg_2" }), BODY, SECRET, NOW), false);
  assert.equal(verifyResendWebhook(headers({ timestamp: String(NOW + 1) }), BODY, SECRET, NOW), false);
});

test("a signature made with a different secret is rejected", () => {
  const forged = sign("msg_1", String(NOW), BODY, Buffer.from("a-completely-different-secret!!!!"));
  assert.equal(verifyResendWebhook(headers({ signature: forged }), BODY, SECRET, NOW), false);
});

test("old and far-future timestamps are rejected, edge of the window is accepted", () => {
  const at = (ts) => headers({ timestamp: String(ts), signature: sign("msg_1", String(ts), BODY) });
  const edge = NOW - RESEND_WEBHOOK_TOLERANCE_SECONDS;
  assert.equal(verifyResendWebhook(at(edge), BODY, SECRET, NOW), true);
  assert.equal(verifyResendWebhook(at(edge - 1), BODY, SECRET, NOW), false);
  assert.equal(verifyResendWebhook(at(NOW + RESEND_WEBHOOK_TOLERANCE_SECONDS + 1), BODY, SECRET, NOW), false);
});

test("several signatures in one header (secret rotation): any valid one passes", () => {
  const good = sign("msg_1", String(NOW), BODY);
  const stale = sign("msg_1", String(NOW), BODY, Buffer.from("an-old-secret-an-old-secret-aaaa"));
  assert.equal(verifyResendWebhook(headers({ signature: `${stale} ${good}` }), BODY, SECRET, NOW), true);
  assert.equal(verifyResendWebhook(headers({ signature: `${stale} ${stale}` }), BODY, SECRET, NOW), false);
});

test("missing or malformed headers are rejected, never thrown on", () => {
  for (const bad of [
    headers({ id: null }),
    headers({ timestamp: null }),
    headers({ signature: null }),
    headers({ timestamp: "not-a-number" }),
    headers({ signature: "v2,abc" }),
    headers({ signature: "v1," }),
    headers({ signature: "v1,AAAA" }),
    headers({ signature: "garbage" }),
  ]) {
    assert.equal(verifyResendWebhook(bad, BODY, SECRET, NOW), false);
  }
});

test("a permanent bounce suppresses, with a short cause", () => {
  const event = getSuppressionEvent({
    type: "email.bounced",
    data: { to: ["Buyer@Example.COM"], bounce: { type: "Permanent", subType: "Suppressed", message: "long server text" } },
  });
  assert.deepEqual(event, { reason: "bounced", emails: ["buyer@example.com"], detail: "Permanent bounce (Suppressed)" });
  assert.doesNotMatch(event.detail, /long server text/);
});

test("a spam complaint suppresses", () => {
  const event = getSuppressionEvent({ type: "email.complained", data: { to: ["a@b.test"] } });
  assert.equal(event.reason, "complained");
});

test("a temporary bounce and every other event type do not suppress", () => {
  assert.equal(getSuppressionEvent({ type: "email.bounced", data: { to: ["a@b.test"], bounce: { type: "Temporary" } } }), null);
  assert.equal(getSuppressionEvent({ type: "email.bounced", data: { to: ["a@b.test"] } }), null);
  for (const type of ["email.delivered", "email.sent", "email.opened", "email.delivery_delayed", "email.failed"]) {
    assert.equal(getSuppressionEvent({ type, data: { to: ["a@b.test"] } }), null, type);
  }
});

test("garbage payloads are ignored, not thrown on", () => {
  for (const payload of [null, undefined, "x", 5, [], {}, { type: "email.complained" }, { type: "email.complained", data: {} }, { type: "email.complained", data: { to: [] } }, { type: "email.complained", data: { to: [5, "no-at-sign"] } }]) {
    assert.equal(getSuppressionEvent(payload), null);
  }
});
