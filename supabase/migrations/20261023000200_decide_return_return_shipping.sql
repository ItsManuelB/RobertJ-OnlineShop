-- =============================================================================
-- decide_return: understand the ship-back step of "Return and Refund".
--
--   * Approve as return_and_refund (from seller_accepted / seller_rejected /
--     overdue pending) no longer refunds. It moves to awaiting_return and gives
--     the buyer 5 days (return_deadline_at) to ship the item back.
--   * Approve while the request is return_received (seller confirmed the item
--     arrived) runs the normal refund: COD -> refund_due, Xendit -> pending
--     provider refund (status stays return_received until the provider settles,
--     so a failed refund is simply retryable).
--   * Reject is also allowed while the item is awaiting_return / return_shipped
--     / return_received, so an admin can always step in.
--   * money_refund approvals are unchanged.
-- ROLLBACK: restore decide_return from 20261022180100_cod_refund_payout.sql.
-- =============================================================================

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
as $fn$
declare
  v_uid              uuid := (select auth.uid());
  v_request          public.return_requests;
  v_order            public.orders;
  v_payment          public.payments;
  v_refund_amount    integer;
  v_already_refunded integer;
  v_total_refunded   integer;
  v_note             text;
  v_is_initial       boolean;
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

  v_is_initial := v_request.status in ('seller_accepted', 'seller_rejected')
    or (v_request.status = 'pending' and v_request.created_at < now() - interval '3 days');

  if p_decision = 'reject' then
    if not (v_is_initial or v_request.status in ('awaiting_return', 'return_shipped', 'return_received')) then
      raise exception 'This return request is not ready for a final decision'
        using errcode = '23514';
    end if;

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

  if not (v_is_initial or v_request.status = 'return_received') then
    raise exception 'This return request is not ready for a final decision'
      using errcode = '23514';
  end if;

  if v_is_initial and p_resolution_type = 'replacement_exchange' then
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

  if v_is_initial and p_resolution_type = 'return_and_refund' then
    update public.return_requests
    set status = 'awaiting_return',
        admin_decision_note = v_note,
        admin_decided_at = now(),
        admin_decided_by = v_uid,
        return_deadline_at = now() + interval '5 days'
    where id = p_return_id
    returning * into v_request;

    insert into public.admin_action_log (actor_id, action, target_user_id, metadata)
    values (
      v_uid, 'approve_return', v_request.buyer_id,
      jsonb_build_object(
        'return_id', p_return_id, 'order_id', v_request.order_id,
        'resolution', 'return_and_refund',
        'return_deadline_at', v_request.return_deadline_at
      )
    );

    return v_request;
  end if;

  -- Refund: money_refund approvals, or return_and_refund once the item was received.
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
$fn$;
