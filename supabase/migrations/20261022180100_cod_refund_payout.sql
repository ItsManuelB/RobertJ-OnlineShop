-- =============================================================================
-- COD refunds: approval no longer marks the refund done; an admin records the
-- actual payout.
--
-- Cash on delivery has no payment provider to send money back, so approving a
-- COD return used to flip payments/orders/return to "refunded" immediately
-- with no proof that the buyer was ever paid. Now:
--   1. decide_return (COD branch) validates as before, then moves the request to
--      `refund_due` and fixes the refund amount. payments/orders are untouched.
--   2. record_cod_refund_payout (admin only) records HOW the buyer was paid
--      (gcash / bank_transfer / cash), a reference number and who recorded it,
--      and only then performs the same finalisation decide_return used to do
--      (payment + order status, return -> refunded).
-- Online (Xendit) refunds are unchanged. Original payment/order rows are never
-- deleted; reports already read refunded requests (20261022170000).
--
-- `refund_due` counts as an OPEN request, so the one-open-request-per-item
-- unique index is rebuilt to include it (a buyer can't file a duplicate while a
-- payout is pending).
-- ROLLBACK: restore decide_return from 20261020030000_return_overdue_admin_
-- escalation.sql, drop function record_cod_refund_payout, drop the four
-- cod_refund_* columns, recreate the index with only pending/seller_accepted
-- (only after resolving any refund_due rows).
-- =============================================================================

begin;

alter table public.return_requests
  add column if not exists cod_refund_method text,
  add column if not exists cod_refund_reference text,
  add column if not exists cod_refunded_at timestamptz,
  add column if not exists cod_refunded_by uuid references public.profiles (id);

do $$ begin
  alter table public.return_requests
    add constraint return_requests_cod_refund_method_check
    check (cod_refund_method is null or cod_refund_method in ('gcash', 'bank_transfer', 'cash'));
exception when duplicate_object then null; end $$;

create index if not exists return_requests_cod_refunded_by_idx
  on public.return_requests (cod_refunded_by);

drop index if exists public.return_requests_one_open_per_order_item;
create unique index return_requests_one_open_per_order_item
  on public.return_requests (order_id, coalesce(order_item_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('pending', 'seller_accepted', 'refund_due');

create or replace function public.decide_return(
  p_return_id uuid,
  p_decision text,
  p_note text default null,
  p_resolution_type public.return_request_type default 'money_refund'
)
returns public.return_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid              uuid := (select auth.uid());
  v_request          public.return_requests;
  v_order            public.orders;
  v_payment          public.payments;
  v_refund_amount    integer;
  v_already_refunded integer;
  v_total_refunded   integer;
  v_note             text;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to decide a return request'
      using errcode = '42501';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  if p_note is not null then
    v_note := nullif(trim(p_note), '');
    if v_note is not null and char_length(v_note) > 500 then
      raise exception 'Note is too long' using errcode = '22023';
    end if;
  end if;

  select * into v_request from public.return_requests where id = p_return_id for update;
  if not found then
    raise exception 'Return request not found' using errcode = 'P0002';
  end if;

  if not (
    v_request.status in ('seller_accepted', 'seller_rejected')
    or (v_request.status = 'pending' and v_request.created_at < now() - interval '3 days')
  ) then
    raise exception 'This return request is not ready for a final decision'
      using errcode = '23514';
  end if;

  if p_decision = 'reject' then
    update public.return_requests
    set status = 'admin_rejected',
        admin_decision_note = v_note,
        admin_decided_at = now(),
        admin_decided_by = v_uid
    where id = p_return_id
    returning * into v_request;

    insert into public.admin_action_log (actor_id, action, target_user_id, metadata)
    values (
      v_uid, 'reject_refund', v_request.buyer_id,
      jsonb_build_object('return_id', p_return_id, 'order_id', v_request.order_id)
    );

    return v_request;
  end if;

  if p_resolution_type = 'replacement_exchange' then
    update public.return_requests
    set status = 'replacement_approved',
        admin_decision_note = v_note,
        admin_decided_at = now(),
        admin_decided_by = v_uid
    where id = p_return_id
    returning * into v_request;

    insert into public.admin_action_log (actor_id, action, target_user_id, metadata)
    values (
      v_uid, 'approve_refund', v_request.buyer_id,
      jsonb_build_object(
        'return_id', p_return_id, 'order_id', v_request.order_id,
        'resolution', 'replacement_exchange'
      )
    );

    return v_request;
  end if;

  select * into v_order from public.orders where id = v_request.order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  select * into v_payment
  from public.payments
  where order_id = v_request.order_id and status in ('paid', 'partially_refunded')
  for update;
  if not found then
    raise exception 'No paid payment found for this order' using errcode = '23514';
  end if;

  if v_request.order_item_id is null then
    v_refund_amount := v_order.total_cents;
  else
    select subtotal_cents into v_refund_amount
    from public.order_items
    where id = v_request.order_item_id;
  end if;

  if v_payment.payment_method_type <> 'xendit' then
    -- COD (or legacy): reserve the refund. Nothing is marked refunded until an
    -- admin records the real payout (record_cod_refund_payout).
    select coalesce(sum(refund_amount_cents), 0) into v_already_refunded
    from public.return_requests
    where order_id = v_request.order_id and status = 'refunded';

    v_total_refunded := v_already_refunded + v_refund_amount;

    if v_total_refunded > v_payment.amount_cents then
      raise exception 'This refund would exceed the amount actually paid for this order'
        using errcode = '23514';
    end if;

    update public.return_requests
    set status = 'refund_due',
        admin_decision_note = v_note,
        admin_decided_at = now(),
        admin_decided_by = v_uid,
        refund_amount_cents = v_refund_amount
    where id = p_return_id
    returning * into v_request;

    insert into public.admin_action_log (actor_id, action, target_user_id, metadata)
    values (
      v_uid, 'approve_refund', v_request.buyer_id,
      jsonb_build_object(
        'return_id', p_return_id, 'order_id', v_request.order_id,
        'refund_amount_cents', v_refund_amount,
        'status', 'refund_due'
      )
    );

    return v_request;
  end if;

  if v_payment.xendit_payment_request_id is null then
    raise exception 'This payment has no Xendit reference to refund' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.xendit_refunds
    where return_request_id = p_return_id and status = 'pending'
  ) then
    raise exception 'A refund is already being processed for this request' using errcode = '23514';
  end if;

  select coalesce(sum(amount_cents), 0) into v_already_refunded
  from public.xendit_refunds
  where payment_id = v_payment.id and status = 'succeeded';

  v_total_refunded := v_already_refunded + v_refund_amount;

  if v_total_refunded > v_payment.amount_cents then
    raise exception 'This refund would exceed the amount actually paid for this order'
      using errcode = '23514';
  end if;

  insert into public.xendit_refunds (
    return_request_id, payment_id, xendit_payment_request_id, amount_cents, currency, status
  ) values (
    p_return_id, v_payment.id, v_payment.xendit_payment_request_id, v_refund_amount, v_payment.currency, 'pending'
  );

  update public.return_requests
  set admin_decision_note = v_note,
      admin_decided_at = now(),
      admin_decided_by = v_uid
  where id = p_return_id
  returning * into v_request;

  insert into public.admin_action_log (actor_id, action, target_user_id, metadata)
  values (
    v_uid, 'approve_refund', v_request.buyer_id,
    jsonb_build_object(
      'return_id', p_return_id, 'order_id', v_request.order_id,
      'refund_amount_cents', v_refund_amount,
      'status', 'submitted_to_xendit'
    )
  );

  return v_request;
end;
$$;

create or replace function public.record_cod_refund_payout(
  p_return_id uuid,
  p_method text,
  p_reference text,
  p_note text default null
)
returns public.return_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid              uuid := (select auth.uid());
  v_request          public.return_requests;
  v_order            public.orders;
  v_payment          public.payments;
  v_already_refunded integer;
  v_total_refunded   integer;
  v_new_status       public.payment_status;
  v_reference        text;
  v_note             text;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to record a refund payout'
      using errcode = '42501';
  end if;

  if p_method is null or p_method not in ('gcash', 'bank_transfer', 'cash') then
    raise exception 'Choose how the buyer was paid' using errcode = '22023';
  end if;

  v_reference := nullif(trim(p_reference), '');
  if v_reference is null then
    raise exception 'A payout reference is required' using errcode = '22023';
  end if;
  if char_length(v_reference) > 120 then
    raise exception 'Payout reference is too long' using errcode = '22023';
  end if;

  if p_note is not null then
    v_note := nullif(trim(p_note), '');
    if v_note is not null and char_length(v_note) > 500 then
      raise exception 'Note is too long' using errcode = '22023';
    end if;
  end if;

  select * into v_request from public.return_requests where id = p_return_id for update;
  if not found then
    raise exception 'Return request not found' using errcode = 'P0002';
  end if;
  if v_request.status <> 'refund_due' then
    raise exception 'This return is not waiting for a refund payout' using errcode = '23514';
  end if;

  select * into v_order from public.orders where id = v_request.order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  select * into v_payment
  from public.payments
  where order_id = v_request.order_id and status in ('paid', 'partially_refunded')
  for update;
  if not found then
    raise exception 'No paid payment found for this order' using errcode = '23514';
  end if;

  select coalesce(sum(refund_amount_cents), 0) into v_already_refunded
  from public.return_requests
  where order_id = v_request.order_id and status = 'refunded';

  v_total_refunded := v_already_refunded + v_request.refund_amount_cents;
  if v_total_refunded > v_payment.amount_cents then
    raise exception 'This refund would exceed the amount actually paid for this order'
      using errcode = '23514';
  end if;

  v_new_status := case
    when v_total_refunded < v_payment.amount_cents then 'partially_refunded'::public.payment_status
    else 'refunded'::public.payment_status
  end;

  update public.payments set status = v_new_status where id = v_payment.id;

  perform set_config('app.refund_in_progress', 'true', true);

  update public.orders
  set payment_status = v_new_status,
      order_status = case when v_new_status = 'refunded' then 'refunded'::public.order_status else order_status end
  where id = v_order.id;

  update public.return_requests
  set status = 'refunded',
      cod_refund_method = p_method,
      cod_refund_reference = v_reference,
      cod_refunded_at = now(),
      cod_refunded_by = v_uid,
      admin_decision_note = coalesce(v_note, admin_decision_note)
  where id = p_return_id
  returning * into v_request;

  insert into public.admin_action_log (actor_id, action, target_user_id, metadata)
  values (
    v_uid, 'record_cod_refund', v_request.buyer_id,
    jsonb_build_object(
      'return_id', p_return_id, 'order_id', v_request.order_id,
      'refund_amount_cents', v_request.refund_amount_cents,
      'method', p_method, 'reference', v_reference,
      'payment_status', v_new_status
    )
  );

  return v_request;
end;
$$;

revoke all on function public.record_cod_refund_payout(uuid, text, text, text) from public, anon;
grant execute on function public.record_cod_refund_payout(uuid, text, text, text) to authenticated;

commit;
