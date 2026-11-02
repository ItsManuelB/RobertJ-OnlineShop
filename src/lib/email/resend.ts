import "server-only";

import { getServerEnv } from "@/config/env";

const RESEND_API_BASE_URL = "https://api.resend.com";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stops Resend from delivering the same message twice if a call is retried. */
  idempotencyKey?: string;
}

/** True when both the key and the From address are set. With either missing, email is simply off. */
export function isEmailConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

/**
 * Sends one email through Resend's REST API (plain `fetch`, no SDK). Throws on
 * any failure so the caller can release its claim and retry on the next run.
 * The error text is deliberately generic: it may be logged, and the provider's
 * response can echo the recipient.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const env = getServerEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error("Email is not configured.");
  }

  const response = await fetch(`${RESEND_API_BASE_URL}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.to],
      ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider rejected the message (HTTP ${response.status}).`);
  }
}
