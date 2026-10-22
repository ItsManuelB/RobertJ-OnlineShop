-- =============================================================================
-- Fulfillment/returns audit, finding B1 (Critical): `decide_return` refused
-- to touch a return request still in `pending` -- only `seller_accepted`/
-- `seller_rejected` were "ready for a final decision". There was no seller
-- notification, no dashboard count, and no dedicated seller queue page for
-- a freshly-filed request (closed separately, app-layer, alongside this
-- migration), so a seller who never opened that one order's page left the
-- request permanently un-escalatable -- admin had no override, no matter
-- how long it sat.
--
-- Fix: `decide_return` now also accepts a `pending` request once it has
-- gone unanswered past `RETURN_SELLER_RESPONSE_SLA_DAYS` (3 days -- shorter
-- than the 7-day filing window, so the buyer still has runway after an
-- admin's decision). This does not touch `respond_to_return` -- a seller
-- can still respond right up until an admin actually acts; the row lock
-- (`for update`) plus the status check means whichever call lands first
-- wins, exactly the same race-safety the table already relies on.
--
-- Everything else in `decide_return` (refund math, Xendit vs. COD
-- branching, admin-only authorization) is byte-for-byte unchanged.
--
-- ROLLBACK:
--   -- restore decide_return's previous body from
--   -- 20260930070000_refund_sets_order_status.sql (or whichever migration
--   -- last touched it before this one)
-- =============================================================================

begin;

create or replace function public.decide_return(p_return_id uuid, p_decision text, p_note text default null)
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
  v_new_status       public.payment_status;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to decide a return request'
      using errcode = '42501';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'Note is too long' using errcode = '22023';
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
        admin_decision_note = p_note,
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

  -- p_decision = 'approve'.
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
        admin_decision_note = p_note,
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
        'payment_status', v_new_status
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
  set admin_decision_note = p_note,
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

commit;
