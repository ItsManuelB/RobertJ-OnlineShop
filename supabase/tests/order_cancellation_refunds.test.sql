-- =============================================================================
-- Order-cancellation refund scenarios. Self-cleaning: everything runs in one
-- DO block that ends by raising an exception, so NOTHING is ever committed.
-- The exception message is the report: every line starts with PASS or FAIL.
--
-- Run:  psql / Supabase SQL editor / MCP execute_sql  (any role that can
--       `set local role authenticated`, e.g. postgres).
-- Needs at least one buyer, one admin, and one product with stock > 5 whose
-- seller owns a shop.
-- =============================================================================
do $$
declare
  v_out     text := '';
  v_buyer   uuid;
  v_admin   uuid;
  v_seller  uuid;
  v_shop    uuid;
  v_product uuid;
  v_inv     uuid;
  v_stock0  integer;
  v_o       uuid;
  v_o2      uuid;
  v_pay     uuid;
  v_res     jsonb;
  v_rr      uuid;
  v_ref     uuid;
  v_n       integer;
  v_cr      public.cancellation_requests;
  v_seq     integer := 0;

  procedure_note text;
begin
  select i.id, i.product_id, i.quantity, i.shop_id, p.seller_id
    into v_inv, v_product, v_stock0, v_shop, v_seller
  from public.inventory i join public.products p on p.id = i.product_id
  where i.variant_id is null and i.quantity > 5 and p.seller_id is not null
  limit 1;
  select id into v_buyer from public.profiles where role = 'buyer' limit 1;
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  if v_inv is null or v_buyer is null or v_admin is null then
    raise exception 'FIXTURES MISSING';
  end if;

  -- ---- helpers (inline closures via temp functions) ------------------------
  create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    execute 'set local role authenticated';
  end $f$;
  create or replace function pg_temp.act_service() returns void language plpgsql as $f$
  begin
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
  end $f$;
  create or replace function pg_temp.mk_order(
    p_buyer uuid, p_seller uuid, p_shop uuid, p_product uuid, p_status public.order_status,
    p_method public.order_payment_method, p_paid boolean, p_seq integer
  ) returns uuid language plpgsql as $f$
  declare v_id uuid;
  begin
    insert into public.orders (order_number, buyer_id, seller_id, shop_id, subtotal_cents, total_cents,
      order_status, payment_method, payment_status, shipping_address)
    values ('TEST-CANCEL-' || p_seq, p_buyer, p_seller, p_shop, 10000, 10000, p_status, p_method,
      case when p_paid then 'paid'::public.payment_status else 'pending'::public.payment_status end,
      '{"full_name":"Test","line1":"1 Test St","city":"Manila","postal_code":"1000","country":"PH"}'::jsonb)
    returning id into v_id;
    insert into public.order_items (order_id, product_id, product_title, quantity, unit_price_cents, subtotal_cents)
    values (v_id, p_product, 'Test item', 2, 5000, 10000);
    insert into public.payments (order_id, payment_method_type, amount_cents, status, payment_channel,
      xendit_payment_request_id)
    values (v_id,
      case when p_method = 'xendit' then 'xendit'::public.payment_method_type else 'cod'::public.payment_method_type end,
      10000,
      case when p_paid then 'paid'::public.payment_status else 'pending'::public.payment_status end,
      case when p_method = 'xendit' then 'GCASH' else null end,
      case when p_method = 'xendit' then 'test-pr-' || p_seq else null end);
    return v_id;
  end $f$;
  create or replace function pg_temp.stock(p_inv uuid) returns integer language sql as
    $f$ select quantity from public.inventory where id = p_inv $f$;

  -- ===== 1. COD, unpaid, buyer cancels (pending) ============================
  v_seq := v_seq + 1;
  v_o := pg_temp.mk_order(v_buyer, v_seller, v_shop, v_product, 'pending', 'cod', false, v_seq);
  perform pg_temp.act_as(v_buyer);
  v_res := public.cancel_order_with_refund(v_o, 'changed my mind');
  perform pg_temp.act_service();
  v_out := v_out || case when v_res #>> '{refund,kind}' = 'none' and (select order_status from public.orders where id = v_o) = 'cancelled'
    then 'PASS' else 'FAIL' end || ' 1a COD unpaid cancel: cancelled, no refund' || E'\n';
  v_out := v_out || case when (select count(*) from public.return_requests where order_id = v_o) = 0
    then 'PASS' else 'FAIL' end || ' 1b COD unpaid cancel: no return request created' || E'\n';

  -- ===== 2. Paid e-wallet, buyer cancels; double click; stock once ===========
  v_seq := v_seq + 1;
  v_stock0 := pg_temp.stock(v_inv);
  v_o := pg_temp.mk_order(v_buyer, v_seller, v_shop, v_product, 'confirmed', 'xendit', true, v_seq);
  perform pg_temp.act_as(v_buyer);
  v_res := public.cancel_order_with_refund(v_o, 'changed my mind');
  v_out := v_out || case when v_res #>> '{refund,kind}' = 'xendit' and v_res #>> '{refund,refund_status}' = 'pending'
    and (v_res #>> '{refund,amount_cents}')::int = 10000 and (v_res #>> '{refund,needs_submission}') = 'true'
    then 'PASS' else 'FAIL' end || ' 2a paid cancel: full refund opened, pending, needs submission' || E'\n';
  v_res := public.cancel_order_with_refund(v_o, 'changed my mind');   -- double click
  perform pg_temp.act_service();
  v_out := v_out || case when (v_res->>'already_cancelled') = 'true'
    and (select count(*) from public.return_requests where order_id = v_o) = 1
    and (select count(*) from public.xendit_refunds x join public.return_requests r on r.id = x.return_request_id where r.order_id = v_o) = 1
    then 'PASS' else 'FAIL' end || ' 2b double click: one return request, one refund' || E'\n';
  v_out := v_out || case when pg_temp.stock(v_inv) = v_stock0 + 2
    then 'PASS' else 'FAIL stock=' || pg_temp.stock(v_inv) || ' expected ' || (v_stock0 + 2) end
    || ' 2c stock restored exactly once' || E'\n';
  v_rr := (v_res #>> '{refund,return_request_id}')::uuid;
  v_ref := (v_res #>> '{refund,refund_id}')::uuid;

  -- ===== 3. Xendit confirms the refund; duplicate webhook ====================
  perform public.system_record_xendit_refund_submission(v_ref, 'rfd-test-' || v_seq, '{"id":"x"}'::jsonb);
  perform public.process_xendit_refund_webhook('rfd-test-' || v_seq, 'SUCCEEDED', null, 10000, '{"t":1}'::jsonb);
  v_out := v_out || case when (select order_status from public.orders where id = v_o) = 'cancelled'
    and (select payment_status from public.orders where id = v_o) = 'refunded'
    and (select status from public.return_requests where id = v_rr) = 'refunded'
    then 'PASS' else 'FAIL' end || ' 3a refund confirmed: order stays cancelled, payment refunded' || E'\n';
  perform public.process_xendit_refund_webhook('rfd-test-' || v_seq, 'SUCCEEDED', null, 10000, '{"t":2}'::jsonb);
  v_out := v_out || case when (select count(*) from public.xendit_refunds x join public.return_requests r on r.id = x.return_request_id
      where r.order_id = v_o and x.status = 'succeeded') = 1
    and pg_temp.stock(v_inv) = v_stock0 + 2
    then 'PASS' else 'FAIL' end || ' 3b duplicate webhook: no second refund, stock unchanged' || E'\n';

  -- ===== 4. Failed refund -> visible -> retry, no duplicates =================
  v_seq := v_seq + 1;
  v_o := pg_temp.mk_order(v_buyer, v_seller, v_shop, v_product, 'pending', 'xendit', true, v_seq);
  perform pg_temp.act_as(v_buyer);
  v_res := public.cancel_order_with_refund(v_o, 'oops');
  perform pg_temp.act_service();
  v_rr := (v_res #>> '{refund,return_request_id}')::uuid;
  v_ref := (v_res #>> '{refund,refund_id}')::uuid;
  perform public.system_fail_xendit_refund_submission(v_ref, 'network down');
  v_out := v_out || case when public._cancellation_refund_state(v_o) ->> 'refund_status' = 'failed'
    then 'PASS' else 'FAIL' end || ' 4a submission failure is recorded as failed (visible)' || E'\n';
  perform pg_temp.act_as(v_buyer);
  begin
    perform public.retry_order_refund(v_rr);
    v_out := v_out || 'FAIL 4b buyer must not be able to retry' || E'\n';
  exception when others then
    v_out := v_out || 'PASS 4b buyer cannot retry (' || sqlerrm || ')' || E'\n';
  end;
  perform pg_temp.act_as(v_seller);
  v_res := public.retry_order_refund(v_rr);
  v_out := v_out || case when v_res ->> 'refund_status' = 'pending' and (v_res ->> 'needs_submission') = 'true'
    then 'PASS' else 'FAIL' end || ' 4c seller retry opens one new pending attempt' || E'\n';
  begin
    perform public.retry_order_refund(v_rr);
    v_out := v_out || 'FAIL 4d second retry must be refused' || E'\n';
  exception when others then
    v_out := v_out || 'PASS 4d second retry refused while one is pending' || E'\n';
  end;
  perform pg_temp.act_service();
  v_out := v_out || case when public.system_retry_cancellation_refund(v_rr) ->> 'retried' = 'false'
    then 'PASS' else 'FAIL' end || ' 4e system retry does nothing while an attempt is pending' || E'\n';

  -- ===== 5. Processing order: request -> reject -> request -> approve ========
  v_seq := v_seq + 1;
  v_stock0 := pg_temp.stock(v_inv);
  v_o := pg_temp.mk_order(v_buyer, v_seller, v_shop, v_product, 'processing', 'xendit', true, v_seq);
  perform pg_temp.act_as(v_buyer);
  begin
    perform public.cancel_order_with_refund(v_o, 'x');
    v_out := v_out || 'FAIL 5a instant cancel of a processing order must be refused' || E'\n';
  exception when others then
    v_out := v_out || 'PASS 5a instant cancel refused for processing (' || sqlerrm || ')' || E'\n';
  end;
  v_cr := public.request_order_cancellation(v_o, 'found it cheaper');
  v_n := (select count(*) from public.cancellation_requests where order_id = v_o);
  perform public.request_order_cancellation(v_o, 'found it cheaper');   -- double click
  v_out := v_out || case when v_n = 1 and (select count(*) from public.cancellation_requests where order_id = v_o) = 1
    then 'PASS' else 'FAIL' end || ' 5b duplicate request: still one pending request' || E'\n';
  perform pg_temp.act_as(v_seller);
  begin
    perform public.respond_to_cancellation_request(v_cr.id, 'reject', '');
    v_out := v_out || 'FAIL 5c reject without a reason must be refused' || E'\n';
  exception when others then
    v_out := v_out || 'PASS 5c reject needs a reason' || E'\n';
  end;
  v_res := public.respond_to_cancellation_request(v_cr.id, 'reject', 'Already packed and handed to the courier.');
  v_out := v_out || case when v_res ->> 'outcome' = 'rejected'
    and (select order_status from public.orders where id = v_o) = 'processing'
    and pg_temp.stock(v_inv) = v_stock0
    then 'PASS' else 'FAIL' end || ' 5d rejected: order stays processing, stock untouched' || E'\n';
  perform pg_temp.act_as(v_buyer);
  v_cr := public.request_order_cancellation(v_o, 'please cancel');
  perform pg_temp.act_as(v_seller);
  v_res := public.respond_to_cancellation_request(v_cr.id, 'approve', null);
  v_out := v_out || case when v_res ->> 'outcome' = 'approved'
    and (select order_status from public.orders where id = v_o) = 'cancelled'
    and v_res #>> '{refund,refund_status}' = 'pending'
    and pg_temp.stock(v_inv) = v_stock0 + 2
    then 'PASS' else 'FAIL' end || ' 5e approved: cancelled, refund pending, stock restored once' || E'\n';
  v_res := public.respond_to_cancellation_request(v_cr.id, 'approve', null);   -- double click
  perform pg_temp.act_service();
  v_out := v_out || case when (v_res ->> 'already_decided') = 'true'
    and (select count(*) from public.return_requests where order_id = v_o) = 1
    and pg_temp.stock(v_inv) = v_stock0 + 2
    then 'PASS' else 'FAIL' end || ' 5f approve twice: no second refund, no second restock' || E'\n';
  -- A stranger seller/buyer cannot respond.
  v_seq := v_seq + 1;
  v_o2 := pg_temp.mk_order(v_buyer, v_seller, v_shop, v_product, 'processing', 'cod', false, v_seq);
  perform pg_temp.act_as(v_buyer);
  v_cr := public.request_order_cancellation(v_o2, 'cod cancel');
  begin
    perform public.respond_to_cancellation_request(v_cr.id, 'approve', null);
    v_out := v_out || 'FAIL 5g buyer must not approve their own request' || E'\n';
  exception when others then
    v_out := v_out || 'PASS 5g buyer cannot approve their own request' || E'\n';
  end;
  perform pg_temp.act_as(v_admin);
  v_res := public.respond_to_cancellation_request(v_cr.id, 'approve', null);
  perform pg_temp.act_service();
  v_out := v_out || case when v_res ->> 'outcome' = 'approved' and v_res #>> '{refund,kind}' = 'none'
    then 'PASS' else 'FAIL' end || ' 5h admin approves unpaid COD: cancelled, nothing to refund' || E'\n';

  -- ===== 6. Seller prepared meanwhile: request goes stale ===================
  v_seq := v_seq + 1;
  v_o := pg_temp.mk_order(v_buyer, v_seller, v_shop, v_product, 'processing', 'xendit', true, v_seq);
  perform pg_temp.act_as(v_buyer);
  v_cr := public.request_order_cancellation(v_o, 'late');
  perform pg_temp.act_service();
  update public.orders set order_status = 'shipped' where id = v_o;
  perform pg_temp.act_as(v_seller);
  v_res := public.respond_to_cancellation_request(v_cr.id, 'approve', null);
  perform pg_temp.act_service();
  v_out := v_out || case when v_res ->> 'outcome' = 'expired'
    and (select order_status from public.orders where id = v_o) = 'shipped'
    and (select count(*) from public.return_requests where order_id = v_o) = 0
    then 'PASS' else 'FAIL' end || ' 6 shipped meanwhile: request expires, no cancel, no refund' || E'\n';

  -- ===== 7. Payment arrives AFTER cancellation ===============================
  v_seq := v_seq + 1;
  v_o := pg_temp.mk_order(v_buyer, v_seller, v_shop, v_product, 'pending', 'xendit', false, v_seq);
  v_pay := (select id from public.payments where order_id = v_o);
  -- The existing guard blocks cancelling while a payment window is open; a
  -- late payment is one that lands after that window.
  update public.payments set created_at = now() - interval '1 hour' where id = v_pay;
  perform pg_temp.act_as(v_buyer);
  perform public.cancel_order_with_refund(v_o, 'no thanks');
  perform pg_temp.act_service();
  v_out := v_out || case when public._cancellation_refund_state(v_o) ->> 'kind' = 'none'
    then 'PASS' else 'FAIL' end || ' 7a unpaid cancel: nothing to refund yet' || E'\n';
  v_res := public.refund_late_payment_on_cancelled_order(v_pay, 'test-pr-' || v_seq, 'pay-1', 'SUCCEEDED', 10000, 'PHP', 'GCASH', '{}'::jsonb);
  v_out := v_out || case when jsonb_array_length(v_res) = 1 and v_res -> 0 ->> 'refund_status' = 'pending'
    and (select status from public.payments where id = v_pay) = 'paid'
    and (select order_status from public.orders where id = v_o) = 'cancelled'
    then 'PASS' else 'FAIL ' || v_res::text end || ' 7b late payment: recorded paid, full refund opened, order stays cancelled' || E'\n';
  v_res := public.refund_late_payment_on_cancelled_order(v_pay, 'test-pr-' || v_seq, 'pay-1', 'SUCCEEDED', 10000, 'PHP', 'GCASH', '{}'::jsonb);
  v_out := v_out || case when jsonb_array_length(v_res) = 0
    and (select count(*) from public.return_requests where order_id = v_o) = 1
    then 'PASS' else 'FAIL' end || ' 7c duplicate late-payment webhook: no second refund' || E'\n';
  v_res := public.refund_late_payment_on_cancelled_order(v_pay, 'wrong-id', 'pay-9', 'SUCCEEDED', 10000, 'PHP', 'GCASH', '{}'::jsonb);
  v_out := v_out || case when jsonb_array_length(v_res) = 0 then 'PASS' else 'FAIL' end
    || ' 7d mismatching payment reference is ignored' || E'\n';

  -- ===== 8. Reports ==========================================================
  perform pg_temp.act_as(v_seller);
  v_n := (select pending_refunds from public.report_refund_pipeline(current_date - 1, current_date + 1, null));
  perform pg_temp.act_service();
  v_out := v_out || case when v_n >= 1 then 'PASS' else 'FAIL' end || ' 8 report counts pending refunds (' || v_n || ')' || E'\n';

  -- ===== 9. Shipped orders are NOT auto-refunded =============================
  v_seq := v_seq + 1;
  v_o := pg_temp.mk_order(v_buyer, v_seller, v_shop, v_product, 'shipped', 'xendit', true, v_seq);
  update public.orders set order_status = 'cancelled', cancelled_at = now(), cancelled_by = 'seller' where id = v_o;
  v_out := v_out || case when (select count(*) from public.return_requests where order_id = v_o) = 0
    then 'PASS' else 'FAIL' end || ' 9 shipped -> cancelled stays under the return policy (no auto refund)' || E'\n';

  raise exception E'\n===== RESULTS (rolled back) =====\n%', v_out;
end $$;
