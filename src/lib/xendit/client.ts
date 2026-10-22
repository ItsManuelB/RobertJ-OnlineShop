import "server-only";

import { getServerEnv } from "@/config/env";

import type {
  XenditEwalletChannelCode,
  XenditPaymentRequestResponse,
  XenditPaymentSessionResponse,
  XenditRefundResponse,
} from "./types";

const XENDIT_API_BASE_URL = "https://api.xendit.co";
const XENDIT_API_VERSION = "2024-11-11";

/**
 * Amount unit conversion, isolated deliberately: Xendit's docs were
 * inconsistent on whether `request_amount`/`amount` for PHP are decimal
 * major units (pesos) or minor units (centavos) — see DECISIONS.md. Treated
 * here as decimal pesos (cents / 100), matching the older Invoice product's
 * documented convention. Confirm against one real sandbox response before
 * relying on this for the webhook's amount-mismatch check in production.
 */
export function centsToXenditAmount(amountCents: number): number {
  return Math.round(amountCents) / 100;
}

export function xenditAmountToCents(amount: number): number {
  return Math.round(amount * 100);
}

function getSecretKey(): string {
  const env = getServerEnv();
  if (!env.XENDIT_SECRET_KEY) {
    throw new Error("XENDIT_SECRET_KEY is required for Xendit payment operations.");
  }
  return env.XENDIT_SECRET_KEY;
}

async function xenditFetch<T>(path: string, init: RequestInit & { idempotencyKey?: string }): Promise<T> {
  const secretKey = getSecretKey();
  const basicAuth = Buffer.from(`${secretKey}:`).toString("base64");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Basic ${basicAuth}`,
    "api-version": XENDIT_API_VERSION,
  };
  if (init.idempotencyKey) {
    headers["Idempotency-Key"] = init.idempotencyKey;
  }

  const response = await fetch(`${XENDIT_API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const body = (await response.json().catch(() => null)) as T | { message?: string } | null;

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : `Xendit request failed (${response.status})`;
    throw new Error(message);
  }

  return body as T;
}

export interface XenditCustomerInput {
  /** Buyer's own id, sent as Xendit's `customer.reference_id`. */
  id: string;
  /** Buyer's display name, sent as `customer.individual_detail.given_names`. */
  givenNames: string;
}

export interface CreateEwalletPaymentRequestInput {
  referenceId: string;
  channelCode: XenditEwalletChannelCode;
  amountCents: number;
  currency: string;
  successReturnUrl: string;
  failureReturnUrl: string;
  customer: XenditCustomerInput;
}

/**
 * GCash / Maya — POST /v3/payment_requests, redirect-based e-wallet flow.
 * PAYMAYA's validator additionally requires `channel_properties.cancel_return_url`
 * and a `customer` object (confirmed against live test-mode API responses);
 * GCASH was confirmed working without either, so both stay GCash-only-absent
 * rather than being added unconditionally.
 */
export async function createEwalletPaymentRequest(
  input: CreateEwalletPaymentRequestInput,
): Promise<XenditPaymentRequestResponse> {
  const isPayMaya = input.channelCode === "PAYMAYA";
  return xenditFetch<XenditPaymentRequestResponse>("/v3/payment_requests", {
    method: "POST",
    idempotencyKey: input.referenceId,
    body: JSON.stringify({
      reference_id: input.referenceId,
      type: "PAY",
      country: "PH",
      currency: input.currency,
      request_amount: centsToXenditAmount(input.amountCents),
      capture_method: "AUTOMATIC",
      channel_code: input.channelCode,
      channel_properties: {
        success_return_url: input.successReturnUrl,
        failure_return_url: input.failureReturnUrl,
        ...(isPayMaya ? { cancel_return_url: input.failureReturnUrl } : {}),
      },
      ...(isPayMaya
        ? {
            customer: {
              type: "INDIVIDUAL",
              reference_id: input.customer.id,
              individual_detail: { given_names: input.customer.givenNames },
            },
          }
        : {}),
    }),
  });
}

export interface CreateCardPaymentSessionInput {
  referenceId: string;
  amountCents: number;
  currency: string;
  successReturnUrl: string;
  cancelReturnUrl: string;
  customer: XenditCustomerInput;
}

/**
 * Card — POST /sessions with mode=COMPONENTS. Returns a short-lived
 * components_sdk_key for the client-side `xendit-components-web` widget to
 * collect and tokenize the card entirely in the browser; raw card data never
 * reaches this server. The exact webhook event family fired on completion
 * (payment_session.* vs payment.*) is unconfirmed against a live sandbox —
 * the webhook route handles both shapes defensively.
 *
 * `channel_properties`, a populated `customer`, and
 * `components_configuration.origins` are all confirmed-required by live
 * test-mode API responses — the session create call 400s without them.
 */
export async function createCardPaymentSession(
  input: CreateCardPaymentSessionInput,
): Promise<XenditPaymentSessionResponse> {
  // Confirmed live: /sessions rejects any non-HTTPS return URL or component
  // origin (INVALID_URL / "need to use HTTPS"), unlike GCash/Maya payment
  // requests. Say so plainly rather than surfacing Xendit's generic message.
  if (!input.successReturnUrl.startsWith("https://")) {
    throw new Error(
      "Card payments need an HTTPS site address. Set NEXT_PUBLIC_SITE_URL to an https:// URL (locally, run `npm run dev:https`).",
    );
  }
  return xenditFetch<XenditPaymentSessionResponse>("/sessions", {
    method: "POST",
    idempotencyKey: input.referenceId,
    body: JSON.stringify({
      reference_id: input.referenceId,
      session_type: "PAY",
      mode: "COMPONENTS",
      country: "PH",
      currency: input.currency,
      amount: centsToXenditAmount(input.amountCents),
      capture_method: "AUTOMATIC",
      success_return_url: input.successReturnUrl,
      cancel_return_url: input.cancelReturnUrl,
      channel_properties: {
        success_return_url: input.successReturnUrl,
        cancel_return_url: input.cancelReturnUrl,
      },
      customer: {
        type: "INDIVIDUAL",
        reference_id: input.customer.id,
        individual_detail: { given_names: input.customer.givenNames },
      },
      components_configuration: {
        origins: [new URL(input.successReturnUrl).origin],
        payment_method: {
          card: {},
        },
      },
    }),
  });
}

/**
 * GCash / Maya — GET /v3/payment_requests/{id}. Used only for the fix #5A
 * reconcile-before-replace check (never for the initial create flow): before
 * treating a finalized-but-unresolved attempt as abandoned and starting a
 * fresh one, ask Xendit directly whether it actually already succeeded.
 */
export async function getPaymentRequestStatus(
  paymentRequestId: string,
): Promise<XenditPaymentRequestResponse> {
  return xenditFetch<XenditPaymentRequestResponse>(
    `/v3/payment_requests/${encodeURIComponent(paymentRequestId)}`,
    { method: "GET" },
  );
}

/**
 * Card — GET /sessions/{id}. Same reconcile-before-replace purpose as
 * `getPaymentRequestStatus` above, for the Card flow.
 */
export async function getCardSessionStatus(
  sessionId: string,
): Promise<XenditPaymentSessionResponse> {
  return xenditFetch<XenditPaymentSessionResponse>(
    `/sessions/${encodeURIComponent(sessionId)}`,
    { method: "GET" },
  );
}

/**
 * GET /refunds/{id} — Xendit's current state for a refund we submitted. Used
 * to catch up when the `refund.succeeded`/`refund.failed` webhook is late or
 * never arrives; authoritative (it comes from Xendit, unlike the synchronous
 * POST response), and applied through the same RPC the webhook uses.
 */
export async function getRefundStatus(refundId: string): Promise<XenditRefundResponse> {
  return xenditFetch<XenditRefundResponse>(`/refunds/${encodeURIComponent(refundId)}`, {
    method: "GET",
  });
}

export interface CreateRefundInput {
  /** `payments.xendit_payment_request_id` — the same field for GCash, Maya, and Card once a payment is genuinely 'paid' (see Phase 5B-1: process_xendit_webhook already overwrites Card's session id with the real Payment Request ID on success). */
  paymentRequestId: string;
  amountCents: number;
  currency: string;
  /** This app only ever creates buyer-initiated return refunds. */
  reason?: "REQUESTED_BY_CUSTOMER" | "FRAUDULENT" | "DUPLICATE" | "CANCELLATION" | "OTHERS";
  /**
   * Verified live against Test Mode (Phase 5B-1): Xendit's `/refunds`
   * endpoint honors the `Idempotency-Key` header (the same one `xenditFetch`
   * already sends for payment creation) — two calls with the same key and
   * body return the identical refund object. `X-IDEMPOTENCY-KEY` (a name
   * seen in third-party summaries) was tested and does NOT dedupe.
   */
  idempotencyKey: string;
}

/**
 * POST /refunds — full or partial (`amountCents` less than the original
 * charge). The returned `status` is never authoritative even when it reads
 * "SUCCEEDED" synchronously (observed in Test Mode) — only the
 * `refund.succeeded`/`refund.failed` webhook, processed by
 * `process_xendit_refund_webhook`, is trusted to finalize anything.
 */
export async function createRefund(input: CreateRefundInput): Promise<XenditRefundResponse> {
  return xenditFetch<XenditRefundResponse>("/refunds", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: JSON.stringify({
      payment_request_id: input.paymentRequestId,
      amount: centsToXenditAmount(input.amountCents),
      currency: input.currency,
      reason: input.reason ?? "REQUESTED_BY_CUSTOMER",
    }),
  });
}
