#!/usr/bin/env node
/**
 * Demo order/review history for Shop One and Shop Two, for a presentation.
 * Places REAL orders against REAL, existing, active products via the real
 * create_order RPC (and real Xendit test-mode payment requests + simulated
 * webhooks for the e-wallet ones) under dedicated demo buyer accounts — no
 * fabricated product/price data here, only the act of purchasing real
 * listings, which is the same mechanism already verified in
 * scripts/e2e-purchase-flow.mjs.
 *
 * Per explicit user confirmation: inventory consumed by these demo orders
 * is restocked back to its original level afterward (this script records
 * the before-quantity for every product touched and prints it so the
 * restock step can verify against it) — the orders/statuses/reviews stay
 * as real history, but current live stock counts are not permanently
 * changed.
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

async function xenditFetch(path, body) {
  const auth = Buffer.from(`${env.XENDIT_SECRET_KEY}:`).toString("base64");
  const res = await fetch(`https://api.xendit.co${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}`, "api-version": "2024-11-11", "Idempotency-Key": body.reference_id },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: await res.json().catch(() => null) };
}
async function postWebhook(payload) {
  const res = await fetch(`${SITE_URL}/api/webhooks/xendit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-callback-token": env.XENDIT_WEBHOOK_TOKEN },
    body: JSON.stringify(payload),
  });
  return res.status;
}

const SHIPPING_POOL = [
  { full_name: "Mika Santos", line1: "45 Mabini St", city: "Quezon City", postal_code: "1100", country: "PH", phone: "09181234567" },
  { full_name: "Carlo Reyes", line1: "12 Rizal Ave", city: "Makati", postal_code: "1200", country: "PH", phone: "09281234567" },
  { full_name: "Dana Cruz", line1: "78 Aguinaldo Hwy", city: "Cavite City", postal_code: "4100", country: "PH", phone: "09381234567" },
];

const SHOP1 = "638e23c6-a9c9-44ad-bfd0-a00fdb0df92d";
const SHOP2 = "d4c7af4e-7486-4b0e-8642-cf28c68e38cf";

const SHOP1_PRODUCTS = [
  { id: "dbedf456-07bf-451e-9cc4-fbffcff72961", sellerId: "4ed1d007-da0e-4624-82e2-7185289f0a7b" },
  { id: "55797bef-691d-4909-862f-b0894ae4d13e", sellerId: "4ed1d007-da0e-4624-82e2-7185289f0a7b" },
  { id: "6e36e112-c294-4ef4-959e-6e6042a5e4e7", sellerId: "4ed1d007-da0e-4624-82e2-7185289f0a7b" },
  { id: "b12af2c9-8be1-4819-a3ea-31042d41f0df", sellerId: "4ed1d007-da0e-4624-82e2-7185289f0a7b" },
  { id: "1312bdd4-6071-433a-9d48-96930d9e8b9f", sellerId: "4ed1d007-da0e-4624-82e2-7185289f0a7b" },
  { id: "1555058b-47de-4d53-a198-52df571bd8c9", sellerId: "4ed1d007-da0e-4624-82e2-7185289f0a7b" },
  { id: "a2645970-647f-4f60-9163-0a5168ab1bd6", sellerId: "331fe722-fed8-422a-829d-7e48f86615eb" },
];
const SHOP2_PRODUCTS = [
  { id: "928503b3-1e03-437a-a646-1a5cc8d49cd8", sellerId: "7636a3b7-6d99-44c1-bff9-9917ed5c40fc" },
  { id: "2fc39657-e18a-4be2-a3d0-9f4d20c862db", sellerId: "7636a3b7-6d99-44c1-bff9-9917ed5c40fc" },
  { id: "ba089601-275c-4151-97a1-80f1734f9533", sellerId: "7636a3b7-6d99-44c1-bff9-9917ed5c40fc" },
  { id: "ced5043c-77ed-492f-b23e-008993770bc8", sellerId: "7636a3b7-6d99-44c1-bff9-9917ed5c40fc" },
  { id: "a92b055b-d534-4344-b2fc-bec5e94f2658", sellerId: "7636a3b7-6d99-44c1-bff9-9917ed5c40fc" },
  { id: "02560575-0fa0-40cf-90e0-15842a4b7314", sellerId: "7636a3b7-6d99-44c1-bff9-9917ed5c40fc" },
  { id: "784cb5e5-6f53-4483-86b3-688d3dab83ea", sellerId: "7636a3b7-6d99-44c1-bff9-9917ed5c40fc" },
];

async function makeBuyer(name, email) {
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: "DemoBuyer123!", email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw new Error(`create buyer ${email}: ${error.message}`);
  await admin.from("profiles").update({ role: "buyer", is_active: true, full_name: name }).eq("id", created.user.id);
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  return { id: created.user.id, client, name };
}

function pick(arr, i) { return arr[i % arr.length]; }

async function main() {
  // Record pre-seed stock for every product we'll touch, so the restock
  // step can verify it restores exactly this.
  const allProductIds = [...SHOP1_PRODUCTS, ...SHOP2_PRODUCTS].map((p) => p.id);
  const { data: beforeStock } = await admin.from("inventory").select("product_id, quantity").in("product_id", allProductIds).is("variant_id", null);
  console.log("PRE_SEED_STOCK=" + JSON.stringify(beforeStock));

  const buyers = [];
  for (let i = 0; i < 3; i++) {
    buyers.push(await makeBuyer(`Demo Buyer ${i + 1}`, `demo-buyer-${i + 1}-${Date.now()}@example.invalid`));
    console.log("created buyer", buyers[i].id, buyers[i].name);
  }

  const placed = [];

  async function place(buyer, product, shopId, qty, paymentMethod) {
    const { data, error } = await buyer.client.rpc("create_order", {
      p_seller_id: product.sellerId,
      p_items: [{ product_id: product.id, variant_id: null, quantity: qty }],
      p_shipping_address: pick(SHIPPING_POOL, placed.length),
      p_shipping_fee_cents: 5000,
      p_notes: "Demo order for presentation",
      p_checkout_group_id: null,
      p_payment_method: paymentMethod,
      p_idempotency_key: randomUUID(),
    });
    if (error) {
      console.log("  SKIP (order failed):", product.id, error.message);
      return null;
    }
    placed.push({ orderId: data.id, shopId, buyer, productId: product.id, qty });
    return data.id;
  }

  async function payViaXendit(buyer, orderId, channelCode) {
    const { data: attempt, error } = await buyer.client.rpc("begin_xendit_payment_attempt", { p_order_id: orderId, p_channel_code: channelCode });
    if (error || !attempt?.id) return;
    const isPayMaya = channelCode === "PAYMAYA";
    const returnUrl = `${SITE_URL}/checkout/resume/${orderId}?xendit_return=1`;
    const res = await xenditFetch("/v3/payment_requests", {
      reference_id: attempt.id,
      type: "PAY",
      country: "PH",
      currency: attempt.currency,
      request_amount: Math.round(attempt.amount_cents) / 100,
      capture_method: "AUTOMATIC",
      channel_code: channelCode,
      channel_properties: { success_return_url: returnUrl, failure_return_url: returnUrl, ...(isPayMaya ? { cancel_return_url: returnUrl } : {}) },
      ...(isPayMaya ? { customer: { type: "INDIVIDUAL", reference_id: attempt.id, individual_detail: { given_names: buyer.name } } } : {}),
    });
    if (!res.ok) { console.log("  xendit create failed", JSON.stringify(res.json)); return; }
    await buyer.client.rpc("finalize_xendit_payment_request", { p_payment_id: attempt.id, p_xendit_payment_request_id: res.json.payment_request_id, p_checkout_url: res.json.actions?.find((a) => a.type === "REDIRECT_CUSTOMER")?.value ?? "" });
    await postWebhook({ event: "payment.succeeded", data: { id: res.json.id, reference_id: attempt.id, payment_request_id: res.json.payment_request_id, payment_id: `pay_demo_${attempt.id}`, status: "SUCCEEDED", channel_code: channelCode, request_amount: Math.round(attempt.amount_cents) / 100, currency: attempt.currency } });
  }

  let i = 0;
  for (const product of SHOP1_PRODUCTS) {
    for (let rep = 0; rep < 2; rep++) {
      const buyer = pick(buyers, i);
      const qty = 1 + (i % 3);
      const method = i % 3 === 0 ? "xendit" : "cod";
      const orderId = await place(buyer, product, SHOP1, qty, method);
      if (orderId && method === "xendit") await payViaXendit(buyer, orderId, i % 2 === 0 ? "GCASH" : "PAYMAYA");
      i++;
    }
  }
  const shop1Count = placed.length;
  console.log(`Shop One: ${shop1Count} orders placed`);

  for (const product of SHOP2_PRODUCTS) {
    for (let rep = 0; rep < 2; rep++) {
      const buyer = pick(buyers, i);
      const qty = 1 + (i % 3);
      const method = i % 3 === 1 ? "xendit" : "cod";
      const orderId = await place(buyer, product, SHOP2, qty, method);
      if (orderId && method === "xendit") await payViaXendit(buyer, orderId, i % 2 === 0 ? "GCASH" : "PAYMAYA");
      i++;
    }
  }
  console.log(`Shop Two: ${placed.length - shop1Count} orders placed`);
  console.log(`Total orders placed: ${placed.length}`);

  console.log("PLACED=" + JSON.stringify(placed.map((p) => ({ orderId: p.orderId, shopId: p.shopId, productId: p.productId, qty: p.qty, buyerId: p.buyer.id }))));
  console.log("BUYER_IDS=" + JSON.stringify(buyers.map((b) => b.id)));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
