// Pure on purpose: Node built-ins only, so it is unit-tested with plain Node (no `@/` alias).
import { createHmac, timingSafeEqual } from "node:crypto";

/** How far a webhook's timestamp may be from our clock. Rejects replays of an old, captured request. */
export const RESEND_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface ResendWebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Verifies a Resend webhook (Resend signs with Svix). The signed content is
 * `<svix-id>.<svix-timestamp>.<raw body>`, MAC'd with HMAC-SHA256 under the
 * base64-decoded part of the secret after `whsec_`. The header may hold several
 * space-separated `v1,<base64>` entries (during a secret rotation); any match
 * passes. Must be given the RAW body: re-serialising the JSON changes the bytes
 * and breaks the signature.
 */
export function verifyResendWebhook(
  headers: ResendWebhookHeaders,
  rawBody: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowSeconds - sentAt) > RESEND_WEBHOOK_TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();

  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    // timingSafeEqual throws on a length mismatch, so compare lengths first.
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type SuppressionReason = "bounced" | "complained";

export interface SuppressionEvent {
  reason: SuppressionReason;
  /** Lowercased recipient addresses the event is about. */
  emails: string[];
  /** A short, human-readable cause for support, never the full provider payload. */
  detail: string | null;
}

/**
 * The suppression a webhook event calls for, or null when it calls for none.
 * Only a PERMANENT bounce and a spam complaint suppress: a temporary bounce
 * (full mailbox, server down) can recover, and every other event type is not
 * about deliverability of the address.
 */
export function getSuppressionEvent(payload: unknown): SuppressionEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { type, data } = payload as { type?: unknown; data?: unknown };
  if (typeof data !== "object" || data === null) return null;
  const { to, bounce } = data as { to?: unknown; bounce?: { type?: unknown; subType?: unknown } | null };

  const emails = Array.isArray(to)
    ? to.filter((value): value is string => typeof value === "string" && value.includes("@")).map((v) => v.trim().toLowerCase())
    : [];
  if (emails.length === 0) return null;

  if (type === "email.complained") {
    return { reason: "complained", emails, detail: "Marked as spam by the recipient" };
  }
  if (type === "email.bounced" && bounce?.type === "Permanent") {
    const subType = typeof bounce.subType === "string" ? bounce.subType : null;
    return { reason: "bounced", emails, detail: subType ? `Permanent bounce (${subType})` : "Permanent bounce" };
  }
  return null;
}
