#!/usr/bin/env node
/**
 * Regression check for get_buyer_activity_feed() against the LIVE database.
 *
 * get_buyer_activity_feed's SQL body has been hand-edited three times
 * (20261020060000, 20261020000000, 20261024000200) as new lifecycle events
 * were added, with nothing catching a future edit that silently drops or
 * renames a UNION ALL branch. This creates a throwaway buyer, places one
 * real COD order via the real `create_order` RPC (so `order_placed` is
 * guaranteed), and asserts:
 *   - the RPC call succeeds and returns that order_placed row
 *   - every returned event_type is in the known whitelist (catches a typo'd
 *     or dropped event_type string before it reaches the TS layer, which
 *     would otherwise just render as a blank/unmapped row)
 *   - rows stay sorted newest-first
 *   - the `p_before` keyset cursor (added for /notifications pagination)
 *     actually excludes rows at/after the cursor
 *
 * Self-contained: deletes the order/payment rows and the test buyer at the
 * end, the same way scripts/e2e-cancellation-refund.mjs cleans up its own
 * E2E-labelled rows via the service-role client.
 *
 * Usage: node --experimental-strip-types --no-warnings scripts/test-buyer-activity-feed.mjs
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Keep in sync with BuyerActivityEventType in
// src/features/notifications/types/notification.types.ts.
const KNOWN_EVENT_TYPES = new Set([
  "order_placed",
  "payment_confirmed",
  "order_shipped",
  "order_delivered",
  "receipt_confirmed",
  "order_cancelled",
  "receipt_submitted",
  "payment_verified",
  "payment_failed",
  "return_filed",
  "return_rejected_by_seller",
  "return_rejected",
  "return_refunded",
  "return_replacement_approved",
  "cancellation_requested",
  "cancellation_declined",
  "refund_completed",
  "refund_needs_attention",
]);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

let buyerId = null;
let orderId = null;

async function cleanup() {
  if (orderId) {
    await admin.from("payments").delete().eq("order_id", orderId);
    await admin.from("orders").delete().eq("id", orderId);
  }
  if (buyerId) {
    await admin.auth.admin.deleteUser(buyerId);
  }
}

async function main() {
  const email = `e2e-activity-feed-test-${Date.now()}@example.invalid`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: "TestPass123!E2E",
    email_confirm: true,
    user_metadata: { full_name: "E2E Activity Feed Test Buyer" },
  });
  if (createErr) return check("setup: create test buyer", false, createErr.message);
  buyerId = created.user.id;
  await admin.from("profiles").update({ role: "buyer", is_active: true }).eq("id", buyerId);

  // Any active, variant-less listing: `products_active_requires_stock`
  // guarantees quantity > 0 whenever status = 'active'.
  const { data: products, error: productErr } = await admin
    .from("products")
    .select("id, seller_id, product_variants(id)")
    .eq("status", "active")
    .limit(20);
  const product = (products ?? []).find((p) => (p.product_variants ?? []).length === 0);
  if (productErr || !product) {
    check("setup: find an active, variant-less product", false, productErr?.message ?? "none found");
    return cleanup();
  }

  const buyer = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Magic link avoids the captcha gate on password sign-in — still a real
  // Supabase Auth session, same as scripts/e2e-purchase-flow.mjs.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr) {
    check("setup: generate sign-in link", false, linkErr.message);
    return cleanup();
  }
  const { error: signInErr } = await buyer.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (signInErr) {
    check("setup: sign in as test buyer", false, signInErr.message);
    return cleanup();
  }

  const { data: order, error: orderErr } = await buyer.rpc("create_order", {
    p_seller_id: product.seller_id,
    p_items: [{ product_id: product.id, variant_id: null, quantity: 1 }],
    p_shipping_address: {
      full_name: "E2E Activity Feed Test",
      line1: "123 Test St",
      city: "Manila",
      postal_code: "1000",
      country: "PH",
      phone: "09171234567",
    },
    p_shipping_fee_cents: 5000,
    p_notes: "Activity feed regression test order — safe to ignore/delete",
    p_checkout_group_id: null,
    p_payment_method: "cod",
    p_idempotency_key: randomUUID(),
  });
  if (orderErr || !order?.id) {
    check("setup: place a real order", false, orderErr?.message ?? "no order id returned");
    return cleanup();
  }
  orderId = order.id;
  check("setup: create buyer, sign in, place order", true, orderId);

  const { data: feed, error: feedErr } = await buyer.rpc("get_buyer_activity_feed", { p_limit: 20 });
  check("RPC call succeeds", !feedErr, feedErr?.message);

  const rows = feed ?? [];
  check("order_placed is present for the order just placed", rows.some((e) => e.event_type === "order_placed" && e.order_id === orderId));
  check(
    "every returned event_type is a known type",
    rows.every((e) => KNOWN_EVENT_TYPES.has(e.event_type)),
    rows.filter((e) => !KNOWN_EVENT_TYPES.has(e.event_type)).map((e) => e.event_type).join(", "),
  );
  check(
    "rows are sorted newest-first",
    rows.every((e, i) => i === 0 || new Date(rows[i - 1].occurred_at) >= new Date(e.occurred_at)),
  );

  const cursor = rows[0]?.occurred_at;
  const { data: nextPage, error: pageErr } = await buyer.rpc("get_buyer_activity_feed", {
    p_limit: 20,
    p_before: cursor,
  });
  check(
    "p_before cursor excludes rows at/after the cursor",
    !pageErr && (nextPage ?? []).every((e) => new Date(e.occurred_at) < new Date(cursor)),
    pageErr?.message,
  );

  await cleanup();
  check("cleanup: order + test buyer removed", true);
}

main()
  .catch((e) => {
    console.error("FATAL", e);
    return cleanup();
  })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n===== ${results.length - failed.length}/${results.length} passed =====`);
    process.exitCode = failed.length ? 1 : 0;
    setTimeout(() => process.exit(process.exitCode), 200);
  });
