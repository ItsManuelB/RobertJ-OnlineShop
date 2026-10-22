/**
 * End-to-end shop isolation checks through the local Supabase REST and Storage APIs.
 * Requires `npx supabase start` and Docker. Uses random disposable fixtures and
 * removes them after the run; it never reads or writes the linked cloud project.
 */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function localSupabaseEnv() {
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npx";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npx supabase status -o env"]
    : ["supabase", "status", "-o", "env"];
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `Could not read local Supabase status. Start it with \`npx supabase start\`.\n${result.stderr || result.stdout}`,
    );
  }

  const values = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="(.*)"$/);
    if (match) values[match[1]] = match[2];
  }
  for (const key of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "JWT_SECRET"]) {
    if (!values[key]) throw new Error(`Local Supabase status did not include ${key}.`);
  }
  return values;
}

function makeUserToken(userId, email, jwtSecret) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const claims = encode({
    aud: "authenticated",
    exp: now + 3600,
    iat: now,
    iss: "supabase",
    role: "authenticated",
    sub: userId,
    email,
  });
  const signingInput = `${header}.${claims}`;
  const signature = createHmac("sha256", jwtSecret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

function runSql(containerName, sql) {
  execFileSync(
    "docker",
    ["exec", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { cwd: root, stdio: "pipe" },
  );
}

function fixtureIds() {
  return Object.fromEntries(
    ["shopA", "shopB", "sellerA", "sellerB", "admin", "buyer", "productA", "productB", "variantA", "variantB", "orderA", "orderB"].map(
      (name) => [name, randomUUID()],
    ),
  );
}

function fixtureSql(ids, suffix) {
  const email = (role) => `${role}-${suffix}@shop-isolation.test.invalid`;
  return `
begin;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('${ids.sellerA}', 'authenticated', 'authenticated', '${email("seller-a")}', '', now(), '{}', '{}', now(), now()),
  ('${ids.sellerB}', 'authenticated', 'authenticated', '${email("seller-b")}', '', now(), '{}', '{}', now(), now()),
  ('${ids.admin}', 'authenticated', 'authenticated', '${email("admin")}', '', now(), '{}', '{}', now(), now()),
  ('${ids.buyer}', 'authenticated', 'authenticated', '${email("buyer")}', '', now(), '{}', '{}', now(), now());

insert into public.profiles (id, role, full_name, is_active)
values
  ('${ids.sellerA}', 'seller', 'API isolation Seller A', true),
  ('${ids.sellerB}', 'seller', 'API isolation Seller B', true),
  ('${ids.admin}', 'admin', 'API isolation Admin', true),
  ('${ids.buyer}', 'buyer', 'API isolation Buyer', true)
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, is_active = excluded.is_active;

insert into public.shops (id, name, slug, active)
values
  ('${ids.shopA}', 'API Isolation Shop A ${suffix}', 'api-isolation-a-${suffix}', true),
  ('${ids.shopB}', 'API Isolation Shop B ${suffix}', 'api-isolation-b-${suffix}', true);

insert into public.shop_users (shop_id, user_id)
values ('${ids.shopA}', '${ids.sellerA}'), ('${ids.shopB}', '${ids.sellerB}');

insert into public.products (id, seller_id, shop_id, title, slug, price_cents, status, quantity)
values
  ('${ids.productA}', '${ids.sellerA}', '${ids.shopA}', 'API Shop A draft ${suffix}', 'api-shop-a-${suffix}', 1000, 'draft', 0),
  ('${ids.productB}', '${ids.sellerB}', '${ids.shopB}', 'API Shop B draft ${suffix}', 'api-shop-b-${suffix}', 1000, 'draft', 0);

insert into public.product_variants (id, product_id, seller_id, shop_id, color, size)
values
  ('${ids.variantA}', '${ids.productA}', '${ids.sellerA}', '${ids.shopA}', 'Blue', 'M'),
  ('${ids.variantB}', '${ids.productB}', '${ids.sellerB}', '${ids.shopB}', 'Green', 'L');

insert into public.orders (id, order_number, buyer_id, seller_id, shop_id, subtotal_cents, shipping_fee_cents, total_cents, currency, shipping_address)
values
  ('${ids.orderA}', 'API-ISO-A-${suffix}', '${ids.buyer}', '${ids.sellerA}', '${ids.shopA}', 1000, 0, 1000, 'PHP', '{"full_name":"Test Buyer","line1":"1 Test St","city":"Manila","postal_code":"1000","country":"PH"}'),
  ('${ids.orderB}', 'API-ISO-B-${suffix}', '${ids.buyer}', '${ids.sellerB}', '${ids.shopB}', 1000, 0, 1000, 'PHP', '{"full_name":"Test Buyer","line1":"1 Test St","city":"Manila","postal_code":"1000","country":"PH"}');
commit;`;
}

function cleanupSql(ids) {
  const userIds = [ids.sellerA, ids.sellerB, ids.admin, ids.buyer].map((id) => `'${id}'`).join(", ");
  const productIds = [ids.productA, ids.productB].map((id) => `'${id}'`).join(", ");
  const orderIds = [ids.orderA, ids.orderB].map((id) => `'${id}'`).join(", ");
  const shopIds = [ids.shopA, ids.shopB].map((id) => `'${id}'`).join(", ");
  return `
begin;
delete from public.admin_action_log where actor_id = '${ids.admin}' or target_user_id in (${userIds});
delete from public.payments where order_id in (${orderIds});
delete from public.order_items where order_id in (${orderIds});
delete from public.return_requests where order_id in (${orderIds});
delete from public.order_shipments where order_id in (${orderIds});
delete from public.orders where id in (${orderIds});
delete from public.product_images where product_id in (${productIds});
delete from public.stock_adjustments where product_id in (${productIds});
delete from public.recommendation_rules where product_id in (${productIds});
delete from public.product_variants where product_id in (${productIds});
delete from public.inventory where product_id in (${productIds});
delete from public.products where id in (${productIds});
delete from public.shop_users where user_id in (${userIds});
delete from public.shops where id in (${shopIds});
delete from auth.users where id in (${userIds});
commit;`;
}

async function apiRequest(apiUrl, anonKey, token, resource, options = {}) {
  const response = await fetch(`${apiUrl}${resource}`, {
    ...options,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep non-JSON error text for useful assertion messages.
  }
  return { response, body };
}

test("Shop A and Shop B remain isolated through PostgREST and Storage APIs", async (t) => {
  const env = localSupabaseEnv();
  const config = readFileSync(path.join(root, "supabase/config.toml"), "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(projectId, "supabase/config.toml must define project_id");
  const containerName = `supabase_db_${projectId}`;
  const ids = fixtureIds();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const emails = {
    sellerA: `seller-a-${suffix}@shop-isolation.test.invalid`,
    sellerB: `seller-b-${suffix}@shop-isolation.test.invalid`,
    admin: `admin-${suffix}@shop-isolation.test.invalid`,
  };
  const tokens = {
    sellerA: makeUserToken(ids.sellerA, emails.sellerA, env.JWT_SECRET),
    sellerB: makeUserToken(ids.sellerB, emails.sellerB, env.JWT_SECRET),
    admin: makeUserToken(ids.admin, emails.admin, env.JWT_SECRET),
  };
  let seeded = false;

  try {
    runSql(containerName, fixtureSql(ids, suffix));
    seeded = true;

    const select = (table, id) => `/rest/v1/${table}?id=eq.${id}&select=*`;
    const readOwnProductA = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerA, select("products", ids.productA));
    await t.test("Shop A seller reads Shop A product", () => {
      assert.equal(readOwnProductA.response.status, 200);
      assert.equal(readOwnProductA.body.length, 1);
    });

    const readForeignProductA = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerA, select("products", ids.productB));
    await t.test("Shop A seller cannot read Shop B product by known ID", () => {
      assert.equal(readForeignProductA.response.status, 200);
      assert.deepEqual(readForeignProductA.body, []);
    });

    const readOwnProductB = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerB, select("products", ids.productB));
    const readForeignProductB = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerB, select("products", ids.productA));
    await t.test("Shop B seller reads only Shop B product", () => {
      assert.equal(readOwnProductB.body.length, 1);
      assert.deepEqual(readForeignProductB.body, []);
    });

    const readForeignVariant = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerA, select("product_variants", ids.variantB));
    const readForeignInventory = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerA, `/rest/v1/inventory?product_id=eq.${ids.productB}&select=*`);
    const readForeignOrder = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerA, select("orders", ids.orderB));
    await t.test("Shop A seller cannot read Shop B variants, inventory, or orders", () => {
      assert.deepEqual(readForeignVariant.body, []);
      assert.deepEqual(readForeignInventory.body, []);
      assert.deepEqual(readForeignOrder.body, []);
    });

    const editForeignProduct = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerA, `/rest/v1/products?id=eq.${ids.productB}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ title: "Unauthorized Shop A edit" }),
    });
    const editOwnProduct = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerB, `/rest/v1/products?id=eq.${ids.productB}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ title: "Shop B API edit" }),
    });
    await t.test("foreign product update affects zero rows while same-shop update succeeds", () => {
      assert.equal(editForeignProduct.response.status, 200);
      assert.deepEqual(editForeignProduct.body, []);
      assert.equal(editOwnProduct.response.status, 200);
      assert.equal(editOwnProduct.body.length, 1);
    });

    const changeSellerAttribution = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerB, `/rest/v1/products?id=eq.${ids.productB}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ seller_id: ids.sellerA }),
    });
    const insertIntoForeignShop = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerA, "/rest/v1/products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        seller_id: ids.sellerA,
        shop_id: ids.shopB,
        title: "Cross-shop insert probe",
        slug: `cross-shop-${suffix}`,
        price_cents: 1000,
        status: "draft",
      }),
    });
    await t.test("seller cannot rewrite ownership or insert directly into another shop", () => {
      assert.ok(!changeSellerAttribution.response.ok, `seller_id update unexpectedly succeeded: ${JSON.stringify(changeSellerAttribution.body)}`);
      assert.ok(!insertIntoForeignShop.response.ok, `cross-shop product insert unexpectedly succeeded: ${JSON.stringify(insertIntoForeignShop.body)}`);
    });

    const foreignImage = await apiRequest(
      env.API_URL,
      env.ANON_KEY,
      tokens.sellerA,
      `/storage/v1/object/shop-images/${ids.shopB}/logo/${suffix}.png`,
      { method: "POST", headers: { "Content-Type": "image/png", "x-upsert": "false" }, body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pYQAAAAASUVORK5CYII=", "base64") },
    );
    const ownImage = await apiRequest(
      env.API_URL,
      env.ANON_KEY,
      tokens.sellerB,
      `/storage/v1/object/shop-images/${ids.shopB}/logo/${suffix}.png`,
      { method: "POST", headers: { "Content-Type": "image/png", "x-upsert": "false" }, body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pYQAAAAASUVORK5CYII=", "base64") },
    );
    await t.test("Storage API blocks foreign shop image uploads and allows the owning shop", () => {
      assert.ok(!foreignImage.response.ok, `cross-shop upload unexpectedly succeeded: ${JSON.stringify(foreignImage.body)}`);
      assert.ok(ownImage.response.ok, `same-shop upload failed: ${JSON.stringify(ownImage.body)}`);
    });

    const reassignSeller = await apiRequest(env.API_URL, env.ANON_KEY, tokens.admin, "/rest/v1/rpc/admin_assign_seller_shop", {
      method: "POST",
      body: JSON.stringify({ p_user_id: ids.sellerA, p_shop_id: ids.shopB }),
    });
    assert.equal(reassignSeller.response.status, 200, `admin reassignment failed: ${JSON.stringify(reassignSeller.body)}`);

    const reassignedCanReadB = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerA, select("products", ids.productB));
    const reassignedCannotReadA = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerA, select("products", ids.productA));
    await t.test("admin reassignment moves API access to the new shop", () => {
      assert.equal(reassignedCanReadB.body.length, 1);
      assert.deepEqual(reassignedCannotReadA.body, []);
    });

    const deactivateSeller = await apiRequest(env.API_URL, env.ANON_KEY, tokens.admin, "/rest/v1/rpc/admin_set_user_active", {
      method: "POST",
      body: JSON.stringify({ p_user_id: ids.sellerA, p_is_active: false }),
    });
    assert.equal(deactivateSeller.response.status, 200, `admin deactivation failed: ${JSON.stringify(deactivateSeller.body)}`);
    const deactivatedSellerRead = await apiRequest(env.API_URL, env.ANON_KEY, tokens.sellerA, select("products", ids.productB));
    await t.test("deactivation immediately removes API access despite an existing token", () => {
      assert.deepEqual(deactivatedSellerRead.body, []);
    });
  } finally {
    if (seeded) {
      for (const [shopId, role] of [[ids.shopA, "a"], [ids.shopB, "b"]]) {
        const deleted = await apiRequest(
          env.API_URL,
          env.SERVICE_ROLE_KEY,
          env.SERVICE_ROLE_KEY,
          "/storage/v1/object/shop-images",
          {
            method: "DELETE",
            body: JSON.stringify({ prefixes: [`${shopId}/logo/${suffix}.png`] }),
          },
        );
        if (!deleted.response.ok) {
          throw new Error(`Could not clean up Shop ${role.toUpperCase()} test image: ${JSON.stringify(deleted.body)}`);
        }
      }
      runSql(containerName, cleanupSql(ids));
    }
  }
});
