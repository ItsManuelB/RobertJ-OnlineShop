begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(46);

-- Isolated fixture users: a Shop A owner, another Shop A staff member, a
-- Shop B seller, a buyer, and an admin. No production account is touched.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'shop-a-owner@test.invalid', '', now(), '{}', '{}', now(), now()),
  ('a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'shop-a-staff@test.invalid', '', now(), '{}', '{}', now(), now()),
  ('b0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'shop-b-seller@test.invalid', '', now(), '{}', '{}', now(), now()),
  ('b0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'buyer@test.invalid', '', now(), '{}', '{}', now(), now()),
  ('c0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin@test.invalid', '', now(), '{}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, role, full_name, is_active)
values
  ('a0000000-0000-4000-8000-000000000001', 'seller', 'Shop A Owner', true),
  ('a0000000-0000-4000-8000-000000000002', 'seller', 'Shop A Staff', true),
  ('b0000000-0000-4000-8000-000000000001', 'seller', 'Shop B Seller', true),
  ('b0000000-0000-4000-8000-000000000002', 'buyer', 'Buyer', true),
  ('c0000000-0000-4000-8000-000000000001', 'admin', 'Admin', true)
on conflict (id) do update set role = excluded.role, is_active = excluded.is_active;

insert into public.shops (id, name, slug, active)
values
  ('a1000000-0000-4000-8000-000000000001', 'Isolation Shop A', 'isolation-shop-a', true),
  ('b1000000-0000-4000-8000-000000000001', 'Isolation Shop B', 'isolation-shop-b', true)
on conflict (id) do nothing;

insert into public.shop_users (shop_id, user_id)
values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.products (id, seller_id, shop_id, title, slug, price_cents, status, quantity)
values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Shop A private draft', 'isolation-shop-a-product', 1000, 'draft', 0),
  ('a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Shop A transfer draft', 'isolation-shop-a-transfer-product', 1000, 'draft', 0),
  ('a2000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', null, 'Unassigned legacy draft', 'isolation-unassigned-legacy-product', 1000, 'draft', 0),
  -- Simulates a Shop A seller_id left behind after an admin transfer to B.
  ('b2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Transferred Shop B draft', 'isolation-shop-b-product', 1000, 'draft', 0)
on conflict (id) do nothing;

insert into public.product_variants (id, product_id, seller_id, shop_id, color, size)
values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Blue', 'S'),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Green', 'M'),
  ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Red', 'M')
on conflict (id) do nothing;

insert into public.recommendation_rules (product_id, seller_id, shop_id, occasion)
values
  ('b2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'casual'),
  ('a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'formal');

insert into public.orders (id, order_number, buyer_id, seller_id, shop_id, subtotal_cents, shipping_fee_cents, total_cents, currency, shipping_address)
values (
  'b4000000-0000-4000-8000-000000000001', 'ISO-B-0001',
  'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001', 1000, 0, 1000, 'PHP',
  '{"full_name":"Buyer","line1":"1 Main St","city":"Manila","postal_code":"1000","country":"PH"}'
);

insert into public.return_requests (id, order_id, buyer_id, seller_id, shop_id, reason)
values (
  'b5000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'Shop B return test fixture'
);

insert into public.order_items (order_id, product_id, product_title, quantity, unit_price_cents, subtotal_cents)
values ('b4000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'Transferred Shop B draft', 1, 1000, 1000);

insert into public.product_images (product_id, url, alt_text)
values ('b2000000-0000-4000-8000-000000000001', 'https://example.invalid/shop-b-draft.png', 'Shop B private draft image');

insert into public.payments (order_id, payment_method_type, amount_cents, currency)
values ('b4000000-0000-4000-8000-000000000001', 'qr_upload', 1000, 'PHP');

insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values
  ('payment-receipts', 'b4000000-0000-4000-8000-000000000001/receipt.png', 'b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', '{}');

insert into public.stock_adjustments (product_id, shop_id, delta, previous_quantity, new_quantity, reason)
values ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 1, 0, 1, 'initial_stock');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select extensions.ok(not public.is_shop_member('b1000000-0000-4000-8000-000000000001'), 'Shop A seller is not a member of Shop B');
select extensions.is((select count(*) from public.products where id = 'a2000000-0000-4000-8000-000000000003'), 0::bigint, 'assigned seller cannot use an unassigned legacy row to bypass current shop scope');
select extensions.is((select count(*) from public.products where id = 'b2000000-0000-4000-8000-000000000001'), 0::bigint, 'stale seller_id does not expose Shop B products');
select extensions.is((select count(*) from public.product_variants where id = 'b3000000-0000-4000-8000-000000000001'), 0::bigint, 'stale seller_id does not expose Shop B variants');
select extensions.is((select count(*) from public.inventory where product_id = 'b2000000-0000-4000-8000-000000000001'), 0::bigint, 'Shop A cannot read Shop B inventory');
select extensions.is((select count(*) from public.stock_adjustments where product_id = 'b2000000-0000-4000-8000-000000000001'), 0::bigint, 'Shop A cannot read Shop B stock history');
select extensions.is((select count(*) from public.recommendation_rules where product_id = 'b2000000-0000-4000-8000-000000000001'), 0::bigint, 'Shop A cannot read Shop B recommendation rules');
select extensions.is((select count(*) from public.orders where id = 'b4000000-0000-4000-8000-000000000001'), 0::bigint, 'stale seller_id does not expose Shop B orders');
select extensions.is((select count(*) from public.order_items where order_id = 'b4000000-0000-4000-8000-000000000001'), 0::bigint, 'Shop A cannot read Shop B order items');
select extensions.is((select count(*) from public.payments where order_id = 'b4000000-0000-4000-8000-000000000001'), 0::bigint, 'Shop A cannot read Shop B payments');
select extensions.is((select count(*) from public.product_images where product_id = 'b2000000-0000-4000-8000-000000000001'), 0::bigint, 'Shop A cannot read private Shop B product images');
select extensions.is((select count(*) from storage.objects where bucket_id = 'payment-receipts' and name = 'b4000000-0000-4000-8000-000000000001/receipt.png'), 0::bigint, 'Shop A cannot read Shop B payment receipts');
select extensions.is((select count(*) from public.profiles where id = 'b0000000-0000-4000-8000-000000000002'), 0::bigint, 'Shop A cannot read Shop B buyer profile through a stale order seller_id');
with changed as (
  update public.products set title = 'Unauthorized'
  where id = 'b2000000-0000-4000-8000-000000000001' returning 1
)
select extensions.is((select count(*) from changed), 0::bigint, 'direct product update cannot affect Shop B');
with changed as (
  update public.orders set notes = 'Unauthorized'
  where id = 'b4000000-0000-4000-8000-000000000001' returning 1
)
select extensions.is((select count(*) from changed), 0::bigint, 'direct order update cannot affect Shop B');
select extensions.throws_ok(
  $$select public.adjust_stock('b2000000-0000-4000-8000-000000000001', 1, 'correction'::public.stock_adjustment_reason, 'cross-shop probe', null)$$,
  '42501', null, 'direct stock RPC call cannot alter Shop B inventory'
);
select extensions.throws_ok(
  $$select public.mark_cod_payment_collected('b4000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'direct COD collection RPC cannot manage Shop B orders'
);
select extensions.throws_ok(
  $$select public.record_order_shipment('b4000000-0000-4000-8000-000000000001', 'Test Courier', 'TEST-TRACKING')$$,
  '42501', null, 'direct shipment RPC cannot manage Shop B orders'
);
select extensions.throws_ok(
  $$select public.respond_to_return('b5000000-0000-4000-8000-000000000001', 'accept', null)$$,
  '42501', null, 'direct return RPC cannot manage Shop B requests'
);
select extensions.throws_ok(
  $$update public.products set seller_id = 'b0000000-0000-4000-8000-000000000001' where id = 'a2000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'seller attribution cannot be reassigned through the Data API'
);
select extensions.throws_ok(
  $$update public.products set shop_id = 'b1000000-0000-4000-8000-000000000001' where id = 'a2000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'seller cannot bypass the audited product transfer path'
);
select extensions.throws_ok(
  $$update public.product_variants set seller_id = 'b0000000-0000-4000-8000-000000000001' where id = 'a3000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'variant seller attribution cannot be reassigned through the Data API'
);
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ('product-images', 'b2000000-0000-4000-8000-000000000001/probe.png', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '{}')$$,
  '42501', null, 'Shop A cannot upload an image into Shop B product storage'
);
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ('shop-images', 'b1000000-0000-4000-8000-000000000001/logo/probe.png', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '{}')$$,
  '42501', null, 'Shop A cannot upload into Shop B branding storage'
);

-- A second seller assigned to the same shop can still manage its catalog and stock.
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.is((select count(*) from public.products where id = 'a2000000-0000-4000-8000-000000000001'), 1::bigint, 'same-shop staff can read Shop A products');
with changed as (
  update public.products set title = 'Shop A edited by staff'
  where id = 'a2000000-0000-4000-8000-000000000001' returning 1
)
select extensions.is((select count(*) from changed), 1::bigint, 'same-shop staff can edit Shop A products');
select extensions.is((public.adjust_stock('a2000000-0000-4000-8000-000000000001', 2, 'correction'::public.stock_adjustment_reason, 'same-shop probe', null)).quantity, 2, 'same-shop staff can adjust Shop A stock');

-- The Shop B seller can manage Shop B despite the historic seller attribution.
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.ok(public.is_shop_member('b1000000-0000-4000-8000-000000000001'), 'Shop B seller remains a direct member');
select extensions.is((select count(*) from public.products where id = 'b2000000-0000-4000-8000-000000000001'), 1::bigint, 'Shop B seller can read Shop B products');
select extensions.is((select count(*) from public.orders where id = 'b4000000-0000-4000-8000-000000000001'), 1::bigint, 'Shop B seller can read Shop B orders');
with changed as (
  update public.products set title = 'Shop B edited by member'
  where id = 'b2000000-0000-4000-8000-000000000001' returning 1
)
select extensions.is((select count(*) from changed), 1::bigint, 'Shop B seller can edit Shop B products');
select extensions.is((select count(*) from public.product_images where product_id = 'b2000000-0000-4000-8000-000000000001'), 1::bigint, 'Shop B seller can read Shop B product images');
select extensions.is((select count(*) from storage.objects where bucket_id = 'payment-receipts' and name = 'b4000000-0000-4000-8000-000000000001/receipt.png'), 1::bigint, 'Shop B seller can read Shop B payment receipts');
select extensions.lives_ok(
  $$insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ('product-images', 'b2000000-0000-4000-8000-000000000001/member-upload.png', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '{}')$$,
  'Shop B seller can upload an image for Shop B product'
);
select extensions.lives_ok(
  $$insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ('shop-images', 'b1000000-0000-4000-8000-000000000001/logo/member-upload.png', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '{}')$$,
  'Shop B seller can upload Shop B branding'
);

-- The admin transfer RPC moves product and variant scope together. The old
-- seller attribution remains on the rows but cannot keep Shop A access.
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.lives_ok(
  $$select public.admin_transfer_product_shop('a2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001')$$,
  'admin can transfer a product across shops'
);

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.is((select count(*) from public.products where id = 'a2000000-0000-4000-8000-000000000002'), 0::bigint, 'source seller loses access after product transfer');

select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.is((select count(*) from public.products where id = 'a2000000-0000-4000-8000-000000000002'), 1::bigint, 'destination shop gains access after product transfer');
select extensions.is((select count(*) from public.product_variants where product_id = 'a2000000-0000-4000-8000-000000000002'), 1::bigint, 'product transfer also moves variant access');
select extensions.is((select count(*) from public.recommendation_rules where product_id = 'a2000000-0000-4000-8000-000000000002'), 1::bigint, 'product transfer also moves recommendation rules');

select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.lives_ok(
  $$select public.admin_assign_seller_shop('a0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001')$$,
  'admin can reassign a seller to Shop B'
);
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.is((select count(*) from public.products where id = 'b2000000-0000-4000-8000-000000000001'), 1::bigint, 'reassigned seller gains access to the newly assigned shop');
select extensions.is((select count(*) from public.products where id = 'a2000000-0000-4000-8000-000000000001'), 0::bigint, 'reassigned seller loses access to the former shop');

-- Reassignment and deactivation take effect immediately at the database layer.
reset role;
delete from public.shop_users where user_id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set is_active = false where id = 'a0000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select extensions.is((select count(*) from public.products where id = 'a2000000-0000-4000-8000-000000000001'), 0::bigint, 'membership reassignment removes prior Shop A access');
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select extensions.ok(not public.is_active_seller(), 'deactivated seller fails the active seller check');
select extensions.is((select count(*) from public.products where id = 'a2000000-0000-4000-8000-000000000001'), 0::bigint, 'deactivated seller loses access despite retained membership');

select * from extensions.finish();
rollback;
