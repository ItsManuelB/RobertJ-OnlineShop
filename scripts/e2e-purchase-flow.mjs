#!/usr/bin/env node
/**
 * Real-client purchase-flow E2E test. No browser automation tool is
 * available in this environment, so this exercises the actual production
 * code paths one layer below the browser:
 *   - the real `create_order` RPC via a genuinely signed-in Supabase Auth
 *     buyer session (same call `queries.createOrder` makes from the Server
 *     Action), so RLS and the RPC's own business rules run for real;
 *   - the real Xendit TEST-MODE REST API (GCash/Maya payment_request
 *     creation) using XENDIT_SECRET_KEY, the same HTTP call
 *     `createEwalletPaymentRequest` makes;
 *   - the real local Next.js webhook route (`/api/webhooks/xendit`) running
 *     under `next dev`, with the real `XENDIT_WEBHOOK_TOKEN` — simulating
 *     the webhook call Xendit itself would make on payment completion
 *     (there is no browser-free way to click Xendit's own hosted
 *     success/failure simulator buttons, so this is the documented
 *     shared-secret mechanism instead).
 *
 * Usage: node --experimental-strip-types --no-warnings scripts/e2e-purchase-flow.mjs
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const SITE_URL = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function log(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function xenditFetch(path, body) {
  const auth = Buffer.from(`${env.XENDIT_SECRET_KEY}:`).toString("base64");
  const res = await fetch(`https://api.xendit.co${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
      "api-version": "2024-11-11",
      "Idempotency-Key": body.reference_id,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function postWebhook(payload) {
  const res = await fetch(`${SITE_URL}/api/webhooks/xendit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-callback-token": env.XENDIT_WEBHOOK_TOKEN },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const SHIPPING = {
  full_name: "E2E Test Buyer",
  line1: "123 Test St",
  city: "Manila",
  postal_code: "1000",
  country: "PH",
  phone: "09171234567",
};

async function main() {
  // --- 0. Set up a dedicated, clearly-named test buyer -------------------
  const email = `e2e-purchase-test-${Date.now()}@example.invalid`;
  const password = "TestPass123!E2E";
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "E2E Purchase Test Buyer" },
  });
  if (createErr) {
    log("setup: create test buyer", false, createErr.message);
    return finish();
  }
  const buyerId = created.user.id;
  await admin.from("profiles").update({ role: "buyer", is_active: true, full_name: "E2E Purchase Test Buyer" }).eq("id", buyerId);
  log("setup: create + activate test buyer", true, buyerId);

  const buyer = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Password sign-in is captcha-gated (matches the real sign-in form), and
  // this script can't solve a captcha. Use an admin-generated magic link's
  // token_hash instead — a real Supabase Auth session is still established
  // for the anon client, it's just issued via a different (non-captcha)
  // grant, same as how a real magic-link email sign-in works in the app.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) {
    log("setup: generate sign-in link", false, linkErr.message);
    return finish();
  }
  const { error: signInErr } = await buyer.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (signInErr) {
    log("setup: sign in as test buyer", false, signInErr.message);
    return finish();
  }
  log("setup: sign in as test buyer (real Supabase Auth session)", true);

  // Known real products (verified live, Shop One has 2 distinct sellers; Shop Two is a 3rd shop).
  const P_NO_VARIANT_SHOP1 = { productId: "6e36e112-c294-4ef4-959e-6e6042a5e4e7", sellerId: "4ed1d007-da0e-4624-82e2-7185289f0a7b" }; // men's short semi formal fit, qty 28
  const P_LOW_STOCK_SHOP1 = { productId: "ba4a218a-8491-4ebb-a6ed-2a6d6f2310d8", sellerId: "4ed1d007-da0e-4624-82e2-7185289f0a7b" }; // qty 1
  const P_VARIANT_SHOP1 = { productId: "a2645970-647f-4f60-9163-0a5168ab1bd6", sellerId: "331fe722-fed8-422a-829d-7e48f86615eb", variantId: null }; // chino shorts, 7 size variants
  const P_SHOP2 = { productId: "928503b3-1e03-437a-a646-1a5cc8d49cd8", sellerId: "7636a3b7-6d99-44c1-bff9-9917ed5c40fc" }; // Skater Mini Skirt, qty 85

  // Resolve one real variant id for the chino shorts (size "S") via the buyer's own read access.
  const { data: variants } = await buyer.from("product_variants").select("id, size").eq("product_id", P_VARIANT_SHOP1.productId);
  P_VARIANT_SHOP1.variantId = variants?.find((v) => v.size === "S")?.id;

  async function createOrder({ sellerId, items, paymentMethod = "cod", idempotencyKey = randomUUID() }) {
    return buyer.rpc("create_order", {
      p_seller_id: sellerId,
      p_items: items,
      p_shipping_address: SHIPPING,
      p_shipping_fee_cents: 5000,
      p_notes: "E2E purchase-flow test order — safe to ignore/delete",
      p_checkout_group_id: null,
      p_payment_method: paymentMethod,
      p_idempotency_key: idempotencyKey,
    });
  }

  const orderIds = [];

  // --- 1. COD happy path, no variants, qty 2 ------------------------------
  {
    const { data, error } = await createOrder({
      sellerId: P_NO_VARIANT_SHOP1.sellerId,
      items: [{ product_id: P_NO_VARIANT_SHOP1.productId, variant_id: null, quantity: 2 }],
    });
    log("1. COD, no-variant product, qty 2", !error && !!data?.id, error?.message ?? data?.id);
    if (data?.id) orderIds.push({ id: data.id, label: "cod_no_variant" });
  }

  // --- 2. COD, product with a valid variant -------------------------------
  {
    const { data, error } = await createOrder({
      sellerId: P_VARIANT_SHOP1.sellerId,
      items: [{ product_id: P_VARIANT_SHOP1.productId, variant_id: P_VARIANT_SHOP1.variantId, quantity: 1 }],
    });
    log("2. COD, product WITH a valid size variant (S)", !error && !!data?.id, error?.message ?? data?.id);
    if (data?.id) orderIds.push({ id: data.id, label: "cod_variant" });
  }

  // --- 3. COD, multi-shop cart (two separate orders, different sellers/shops) ---
  {
    const key = randomUUID();
    const r1 = await createOrder({ sellerId: P_NO_VARIANT_SHOP1.sellerId, items: [{ product_id: P_NO_VARIANT_SHOP1.productId, variant_id: null, quantity: 1 }], idempotencyKey: key });
    const r2 = await createOrder({ sellerId: P_SHOP2.sellerId, items: [{ product_id: P_SHOP2.productId, variant_id: null, quantity: 3 }], idempotencyKey: key });
    const ok = !r1.error && !r2.error && !!r1.data?.id && !!r2.data?.id && r1.data.id !== r2.data.id;
    log("3. COD, multi-shop cart (Shop One + Shop Two, one checkout)", ok, `${r1.data?.id ?? r1.error?.message} / ${r2.data?.id ?? r2.error?.message}`);
    if (r1.data?.id) orderIds.push({ id: r1.data.id, label: "cod_multishop_1" });
    if (r2.data?.id) orderIds.push({ id: r2.data.id, label: "cod_multishop_2" });
  }

  // --- 4. Insufficient stock ------------------------------------------------
  {
    const { data, error } = await createOrder({
      sellerId: P_LOW_STOCK_SHOP1.sellerId,
      items: [{ product_id: P_LOW_STOCK_SHOP1.productId, variant_id: null, quantity: 5 }],
    });
    log("4. Insufficient stock (qty 5 against qty 1) is rejected", !data && !!error && /Only \d+ left/.test(error.message), error?.message);
  }

  // --- 5. Invalid variant (tampered: variant belongs to a different product) ---
  {
    const { data, error } = await createOrder({
      sellerId: P_NO_VARIANT_SHOP1.sellerId,
      items: [{ product_id: P_NO_VARIANT_SHOP1.productId, variant_id: P_VARIANT_SHOP1.variantId, quantity: 1 }],
    });
    log("5. Mismatched variant/product is rejected", !data && !!error && /no longer available/i.test(error.message), error?.message);
  }

  // --- 6. Duplicate submission (idempotency) --------------------------------
  {
    const key = randomUUID();
    const first = await createOrder({ sellerId: P_NO_VARIANT_SHOP1.sellerId, items: [{ product_id: P_NO_VARIANT_SHOP1.productId, variant_id: null, quantity: 1 }], idempotencyKey: key });
    const second = await createOrder({ sellerId: P_NO_VARIANT_SHOP1.sellerId, items: [{ product_id: P_NO_VARIANT_SHOP1.productId, variant_id: null, quantity: 1 }], idempotencyKey: key });
    const ok = !first.error && !second.error && first.data?.id === second.data?.id;
    log("6. Duplicate submission (same idempotency key) returns the same order, no dup", ok, `${first.data?.id} vs ${second.data?.id}`);
    if (first.data?.id) orderIds.push({ id: first.data.id, label: "cod_idempotency" });
  }

  // --- 7/8/9. GCash + Maya via real Xendit test-mode API, then simulated webhooks ---
  async function xenditChannelScenario(num, channelCode, simulateStatus, productFixture, qty) {
    const idemKey = randomUUID();
    const orderRes = await createOrder({
      sellerId: productFixture.sellerId,
      items: [{ product_id: productFixture.productId, variant_id: productFixture.variantId ?? null, quantity: qty }],
      paymentMethod: "xendit",
      idempotencyKey: idemKey,
    });
    if (orderRes.error || !orderRes.data?.id) {
      log(`${num}. ${channelCode} order creation`, false, orderRes.error?.message);
      return;
    }
    const orderId = orderRes.data.id;
    orderIds.push({ id: orderId, label: `xendit_${channelCode}_${simulateStatus}` });

    const { data: attempt, error: attemptErr } = await buyer.rpc("begin_xendit_payment_attempt", {
      p_order_id: orderId,
      p_channel_code: channelCode,
    });
    if (attemptErr || !attempt?.id) {
      log(`${num}. ${channelCode} begin_xendit_payment_attempt`, false, attemptErr?.message);
      return;
    }

    const returnUrl = `${SITE_URL}/checkout/resume/${orderId}?xendit_return=1`;
    const isPayMaya = channelCode === "PAYMAYA";
    const xenditRes = await xenditFetch("/v3/payment_requests", {
      reference_id: attempt.id,
      type: "PAY",
      country: "PH",
      currency: attempt.currency,
      request_amount: Math.round(attempt.amount_cents) / 100,
      capture_method: "AUTOMATIC",
      channel_code: channelCode,
      channel_properties: {
        success_return_url: returnUrl,
        failure_return_url: returnUrl,
        ...(isPayMaya ? { cancel_return_url: returnUrl } : {}),
      },
      ...(isPayMaya ? { customer: { type: "INDIVIDUAL", reference_id: attempt.id, individual_detail: { given_names: "E2E Test Buyer" } } } : {}),
    });
    log(
      `${num}a. ${channelCode} real Xendit test-mode payment_request created`,
      xenditRes.ok && !!xenditRes.json?.payment_request_id,
      xenditRes.ok ? xenditRes.json.payment_request_id : JSON.stringify(xenditRes.json),
    );
    if (!xenditRes.ok) return;

    await buyer.rpc("finalize_xendit_payment_request", {
      p_payment_id: attempt.id,
      p_xendit_payment_request_id: xenditRes.json.payment_request_id,
      p_checkout_url: xenditRes.json.actions?.find((a) => a.type === "REDIRECT_CUSTOMER")?.value ?? "",
    });

    // Verify PENDING state before any webhook lands.
    const { data: pendingCheck } = await admin.from("payments").select("status").eq("id", attempt.id).single();
    log(`${num}b. ${channelCode} payment is 'pending' before webhook`, pendingCheck?.status === "pending", pendingCheck?.status);

    // Simulate the webhook Xendit would send, using the real shared secret.
    const webhookRes = await postWebhook({
      event: "payment.succeeded",
      data: {
        id: xenditRes.json.id ?? `pr_sim_${attempt.id}`,
        reference_id: attempt.id,
        payment_request_id: xenditRes.json.payment_request_id,
        payment_id: `pay_sim_${attempt.id}`,
        status: simulateStatus,
        channel_code: channelCode,
        request_amount: Math.round(attempt.amount_cents) / 100,
        currency: attempt.currency,
      },
    });
    log(`${num}c. ${channelCode} simulated '${simulateStatus}' webhook accepted`, webhookRes.status === 200, JSON.stringify(webhookRes.json));

    const { data: finalCheck } = await admin.from("payments").select("status").eq("id", attempt.id).single();
    const expected = simulateStatus === "SUCCEEDED" ? "paid" : "failed";
    log(`${num}d. ${channelCode} payment resolved to '${expected}' after webhook`, finalCheck?.status === expected, finalCheck?.status);
  }

  await xenditChannelScenario(7, "GCASH", "SUCCEEDED", P_NO_VARIANT_SHOP1, 1);
  await xenditChannelScenario(8, "PAYMAYA", "SUCCEEDED", P_SHOP2, 1);
  await xenditChannelScenario(9, "GCASH", "FAILED", P_NO_VARIANT_SHOP1, 1);
  await xenditChannelScenario(10, "GCASH", "EXPIRED", P_NO_VARIANT_SHOP1, 1);

  // --- 11. Webhook with an invalid shared-secret token is rejected ---------
  {
    const res = await fetch(`${SITE_URL}/api/webhooks/xendit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-callback-token": "wrong-token-123" },
      body: JSON.stringify({ event: "payment.succeeded", data: { reference_id: randomUUID(), status: "SUCCEEDED" } }),
    });
    log("11. Webhook with wrong token is rejected (401)", res.status === 401, String(res.status));
  }

  // --- 12. Cancel a COD order and verify restock ----------------------------
  if (orderIds.find((o) => o.label === "cod_no_variant")) {
    const target = orderIds.find((o) => o.label === "cod_no_variant").id;
    const { data: before } = await admin.from("inventory").select("quantity").eq("product_id", P_NO_VARIANT_SHOP1.productId).is("variant_id", null).single();
    const { error: cancelErr } = await buyer
      .from("orders")
      .update({ order_status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: "e2e test cancellation", cancelled_by: "buyer" })
      .eq("id", target)
      .eq("buyer_id", buyerId);
    const { data: after } = await admin.from("inventory").select("quantity").eq("product_id", P_NO_VARIANT_SHOP1.productId).is("variant_id", null).single();
    log("12. Cancel COD order restocks inventory", !cancelErr && after.quantity === before.quantity + 2, `${before?.quantity} -> ${after?.quantity}`);
  }

  // --- 13. Buyer cannot buy their own listing (role/ownership guard) --------
  {
    const { data, error } = await buyer.rpc("create_order", {
      p_seller_id: buyerId,
      p_items: [{ product_id: P_NO_VARIANT_SHOP1.productId, variant_id: null, quantity: 1 }],
      p_shipping_address: SHIPPING,
      p_shipping_fee_cents: 0,
      p_notes: null,
      p_checkout_group_id: null,
      p_payment_method: "cod",
      p_idempotency_key: randomUUID(),
    });
    log("13. Buyer cannot place an order against themselves as seller", !data && !!error, error?.message);
  }

  console.log("\nORDER_IDS_FOR_VERIFICATION=" + JSON.stringify(orderIds));
  console.log("TEST_BUYER_ID=" + buyerId);
  return finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== ${results.length - failed.length}/${results.length} passed =====`);
  for (const f of failed) console.log("  FAILED: " + f.name + " — " + f.detail);
  process.exitCode = failed.length ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
