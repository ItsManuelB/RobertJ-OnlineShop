#!/usr/bin/env node
/**
 * Cancellation-refund failure/recovery E2E against Xendit TEST MODE + the live
 * database. No real money can move: it refuses to run unless XENDIT_SECRET_KEY
 * is a test key, and the Xendit payment it creates is never completed.
 *
 * What it proves with the real Xendit API:
 *  - `POST /refunds` accepts reason CANCELLATION (the app sends it);
 *  - a refund for a payment that was never captured is rejected
 *    (INELIGIBLE_TRANSACTION) and the same Idempotency-Key returns the same
 *    answer both times (a double submit cannot create two refunds);
 *  - the database records that failure on the refund attempt
 *    (`system_fail_xendit_refund_submission`), shows it as needing attention,
 *    re-opens exactly one new attempt (`system_retry_cancellation_refund`),
 *    never while one is pending, and stops after 4 attempts.
 *
 * It cannot prove a SUCCESSFUL e-wallet refund: Xendit's simulate-payment API
 * only supports VA/OTC/QR, so an e-wallet capture needs a person to finish a
 * payment in Xendit's hosted test page. Do that once by hand (see the
 * "Manual end-to-end check" in docs/cancellation-refunds.md).
 *
 * Every row it creates is labelled E2E-CANCEL-* and removed at the end.
 * Usage: node scripts/e2e-cancellation-refund.mjs
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
if (!env.XENDIT_SECRET_KEY?.startsWith("xnd_development_")) {
  throw new Error("XENDIT_SECRET_KEY is not a test-mode key. Refusing to run.");
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const auth = Buffer.from(`${env.XENDIT_SECRET_KEY}:`).toString("base64");

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function xendit(method, path, body, idempotencyKey) {
  const res = await fetch(`https://api.xendit.co${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
      "api-version": "2024-11-11",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const label = `E2E-CANCEL-${Date.now()}`;
let orderId = null;

async function cleanup() {
  if (!orderId) return;
  const { data: requests } = await admin.from("return_requests").select("id").eq("order_id", orderId);
  const ids = (requests ?? []).map((r) => r.id);
  if (ids.length) await admin.from("xendit_refunds").delete().in("return_request_id", ids);
  await admin.from("return_requests").delete().eq("order_id", orderId);
  await admin.from("payment_webhook_events").delete().in(
    "payment_row_id",
    ((await admin.from("payments").select("id").eq("order_id", orderId)).data ?? []).map((p) => p.id),
  );
  await admin.from("payments").delete().eq("order_id", orderId);
  await admin.from("orders").delete().eq("id", orderId);
}

try {
  const { data: buyer } = await admin.from("profiles").select("id").eq("role", "buyer").limit(1).single();
  const { data: seller } = await admin
    .from("shop_users")
    .select("user_id, shop_id")
    .limit(1)
    .single();

  // 1. A real Xendit test-mode payment request that is never completed.
  const referenceId = randomUUID();
  const pr = await xendit(
    "POST",
    "/v3/payment_requests",
    {
      reference_id: referenceId,
      type: "PAY",
      country: "PH",
      currency: "PHP",
      request_amount: 100,
      capture_method: "AUTOMATIC",
      channel_code: "GCASH",
      channel_properties: {
        success_return_url: "https://example.com/ok",
        failure_return_url: "https://example.com/fail",
      },
      description: `${label} (test mode)`,
    },
    referenceId,
  );
  const prId = pr.json?.payment_request_id;
  check("1. Xendit test-mode payment request created", pr.status === 201 && !!prId, prId);

  // 2. A labelled paid order (no line items, so no stock is touched).
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      order_number: label,
      buyer_id: buyer.id,
      seller_id: seller.user_id,
      shop_id: seller.shop_id,
      subtotal_cents: 10000,
      total_cents: 10000,
      order_status: "confirmed",
      payment_method: "xendit",
      payment_status: "paid",
      shipping_address: { full_name: "E2E", line1: "1 Test St", city: "Manila", postal_code: "1000", country: "PH" },
    })
    .select("id")
    .single();
  if (orderError) throw orderError;
  orderId = order.id;
  const { error: payError } = await admin.from("payments").insert({
    order_id: orderId,
    payment_method_type: "xendit",
    amount_cents: 10000,
    status: "paid",
    payment_channel: "GCASH",
    xendit_payment_request_id: prId,
  });
  if (payError) throw payError;

  // 3. Seller-side cancel: the trigger opens the refund automatically.
  const { error: cancelError } = await admin
    .from("orders")
    .update({ order_status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: "seller", cancellation_reason: label })
    .eq("id", orderId);
  check("3a. cancelling a paid order succeeds", !cancelError, cancelError?.message);

  const pending = async () =>
    (
      await admin
        .from("xendit_refunds")
        .select("id, status, failure_code, xendit_refund_id, amount_cents, return_request_id")
        .in(
          "return_request_id",
          ((await admin.from("return_requests").select("id").eq("order_id", orderId)).data ?? []).map((r) => r.id),
        )
        .order("created_at", { ascending: false })
    ).data ?? [];

  let attempts = await pending();
  check(
    "3b. one pending full-amount refund attempt was opened, not yet sent",
    attempts.length === 1 && attempts[0].status === "pending" && attempts[0].amount_cents === 10000 && !attempts[0].xendit_refund_id,
  );

  // 4. Submit like the app does (attempt id = Idempotency-Key), twice.
  const refundBody = { payment_request_id: prId, amount: 100, currency: "PHP", reason: "CANCELLATION" };
  const first = await xendit("POST", "/refunds", refundBody, attempts[0].id);
  const second = await xendit("POST", "/refunds", refundBody, attempts[0].id);
  check(
    "4a. Xendit accepts reason CANCELLATION and rejects a never-captured payment",
    first.status === 400 && first.json?.error_code === "INELIGIBLE_TRANSACTION",
    first.json?.error_code,
  );
  check(
    "4b. same Idempotency-Key -> same answer (no second refund possible)",
    second.status === first.status && second.json?.error_code === first.json?.error_code,
  );

  // 5. Failure is recorded, visible, and recoverable without duplicates.
  await admin.rpc("system_fail_xendit_refund_submission", { p_refund_id: attempts[0].id, p_error_note: first.json?.message ?? "rejected" });
  attempts = await pending();
  check(
    "5a. failed attempt is recorded as submission_error",
    attempts[0].status === "failed" && attempts[0].failure_code === "submission_error",
  );

  const requestId = attempts[0].return_request_id;
  const retry1 = await admin.rpc("system_retry_cancellation_refund", { p_return_request_id: requestId });
  attempts = await pending();
  check("5b. retry opens exactly one new pending attempt", retry1.data?.retried === true && attempts.filter((a) => a.status === "pending").length === 1 && attempts.length === 2);

  const retryWhilePending = await admin.rpc("system_retry_cancellation_refund", { p_return_request_id: requestId });
  check("5c. no retry while an attempt is pending", retryWhilePending.data?.retried === false && (await pending()).length === 2);

  for (let i = 0; i < 2; i += 1) {
    const current = (await pending()).find((a) => a.status === "pending");
    await admin.rpc("system_fail_xendit_refund_submission", { p_refund_id: current.id, p_error_note: "still failing" });
    await admin.rpc("system_retry_cancellation_refund", { p_return_request_id: requestId });
  }
  const last = (await pending()).find((a) => a.status === "pending");
  await admin.rpc("system_fail_xendit_refund_submission", { p_refund_id: last.id, p_error_note: "still failing" });
  const stop = await admin.rpc("system_retry_cancellation_refund", { p_return_request_id: requestId });
  check(
    "5d. automatic retries stop after 4 attempts (then a human retries)",
    stop.data?.retried === false && (await pending()).length === 4,
    JSON.stringify(stop.data),
  );
} catch (error) {
  failures += 1;
  console.error("FAIL  unexpected error:", error);
} finally {
  await cleanup();
  const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).like("order_number", "E2E-CANCEL-%");
  check("cleanup: no E2E-CANCEL orders remain", count === 0, String(count));
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
