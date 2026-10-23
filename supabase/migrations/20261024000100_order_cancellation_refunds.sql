-- =============================================================================
-- Order-cancellation refunds, step 2 of 2.
--
-- Before: cancelling a PAID order left the money untouched. The buyer had to
-- file a return request and wait for an admin; a payment that succeeded after
-- the order was already cancelled was only logged ('order_cancelled') and
-- never refunded; reports showed no pending refunds.
--
-- After (all additive, built on the existing refund pipeline):
--  1. Trigger `orders_open_refund_on_cancel`: when a PRE-SHIPMENT order
--     (pending / confirmed / processing) becomes cancelled and has a paid
--     payment, a system-approved return request + (for Xendit) a pending
--     xendit_refunds attempt is opened. One code path covers buyer, seller,
--     admin, bulk and approved-request cancellations. shipped -> cancelled
--     (failed delivery) is deliberately NOT auto-refunded: that stays under
--     the existing return/refund policy.
--  2. `cancel_order_with_refund`: buyer's instant cancel (pending/confirmed),
--     atomic and idempotent (a double click returns the same result).
--  3. `cancellation_requests` + `request_order_cancellation` +
--     `respond_to_cancellation_request`: once the seller marks the order Ready
--     for Pickup (processing) the buyer asks, the seller approves/declines.
--  4. `refund_late_payment_on_cancelled_order`: service-role hook the webhook
--     and the reconciliation sweep call when a payment succeeds on an order
--     that is already cancelled -- records the payment and opens a refund.
--  5. `retry_order_refund` (seller/admin) and `system_retry_cancellation_refund`
--     (service role, bounded) re-attempt a failed refund without ever creating
--     a second attempt while one is pending or already succeeded.
--  6. system_record/fail_xendit_refund_submission: service-role twins of the
--     admin-only record/fail RPCs, used by the server after it calls Xendit.
--  7. process_xendit_refund_webhook: a fully refunded CANCELLED order stays
--     'cancelled' (payment_status carries 'refunded') instead of flipping to
--     order_status 'refunded'. Every other order is unchanged.
--  8. report_refund_pipeline: refunds pending + refunds needing attention.
--
-- Stock: the existing orders_restock_on_cancel trigger fires only on the
-- transition INTO cancelled, so stock is restored exactly once. The system
-- return request is stamped restocked_at so the return flow cannot restock it
-- a second time.
--
-- ROLLBACK (in this order):
--   drop trigger if exists orders_open_refund_on_cancel on public.orders;
--   drop function if exists public.open_refund_on_order_cancel();
--   drop function if exists public.report_refund_pipeline(date, date, uuid);
--   drop function if exists public.system_retry_cancellation_refund(uuid, integer);
--   drop function if exists public.retry_order_refund(uuid);
--   drop function if exists public.refund_late_payment_on_cancelled_order(uuid, text, text, text, integer, text, text, jsonb);
--   drop function if exists public.system_fail_xendit_refund_submission(uuid, text);
--   drop function if exists public.system_record_xendit_refund_submission(uuid, text, jsonb);
--   drop function if exists public.respond_to_cancellation_request(uuid, text, text);
--   drop function if exists public.request_order_cancellation(uuid, text);
--   drop function if exists public.cancel_order_with_refund(uuid, text);
--   drop function if exists public._cancel_refund_new_attempt(uuid);
--   drop function if exists public._open_cancellation_refund(uuid, uuid, text);
--   drop function if exists public._cancellation_refund_state(uuid);
--   drop table if exists public.cancellation_requests;
--   drop type if exists public.cancellation_request_status;
--   -- restore process_xendit_refund_webhook from 20260921000000_xendit_refunds.sql
--   -- (its order_status line is the only difference; see section 7 below).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- cancellation_requests: buyer asks to cancel an order the seller has already
-- started preparing (processing). RPC-only writes, like return_requests.
-- -----------------------------------------------------------------------------
create type public.cancellation_request_status as enum ('pending', 'approved', 'rejected', 'expired');

create table public.cancellation_requests (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id),
  buyer_id      uuid not null references public.profiles (id),
  seller_id     uuid references public.profiles (id),
  shop_id       uuid references public.shops (id),
  reason        text not null,
  status        public.cancellation_request_status not null default 'pending',
  decision_note text,
  decided_by    uuid references public.profiles (id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint cancellation_requests_reason_length
    check (char_length(reason) between 1 and 500),
  constraint cancellation_requests_note_length
    check (decision_note is null or char_length(decision_note) <= 500),
  constraint cancellation_requests_rejection_needs_note
    check (status <> 'rejected' or decision_note is not null)
);

comment on table public.cancellation_requests is
  'Buyer request to cancel an order the seller has already started preparing (processing). Seller/shop member/admin approves (cancels the order, which opens the automatic refund) or declines with a reason. RPC-only writes.';

-- One open request per order -- a double click can never queue two.
create unique index cancellation_requests_one_pending_per_order
  on public.cancellation_requests (order_id)
  where status = 'pending';
create index cancellation_requests_order_id_idx on public.cancellation_requests (order_id);
create index cancellation_requests_buyer_id_idx on public.cancellation_requests (buyer_id);
create index cancellation_requests_seller_id_idx on public.cancellation_requests (seller_id);
create index cancellation_requests_shop_id_idx on public.cancellation_requests (shop_id);
create index cancellation_requests_decided_by_idx on public.cancellation_requests (decided_by);

create trigger cancellation_requests_set_updated_at
  before update on public.cancellation_requests
  for each row execute function public.set_updated_at();

alter table public.cancellation_requests enable row level security;

create policy "buyers sellers shop members and admins read cancellation requests"
  on public.cancellation_requests for select
  to authenticated
  using (
    buyer_id = (select auth.uid())
    or seller_id = (select auth.uid())
    or public.is_shop_member(shop_id)
    or public.is_admin()
  );

grant select on public.cancellation_requests to authenticated;
-- No insert/update/delete grant: every write goes through the RPCs below.


-- -----------------------------------------------------------------------------
-- _cancellation_refund_state: the refund picture for an order's cancellation,
-- as jsonb. Shared by every RPC so the app sees one consistent shape.
--   kind: 'none' (nothing was paid) | 'xendit' (refund via Xendit)
--         | 'manual' (COD / legacy payment: staff pays the buyer back)
--   needs_submission: a pending Xendit attempt exists that was never sent to
--         Xendit yet (the app must call POST /refunds with refund_id as the
--         idempotency key).
-- -----------------------------------------------------------------------------
create or replace function public._cancellation_refund_state(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_request public.return_requests;
  v_refund  public.xendit_refunds;
begin
  select * into v_request
  from public.return_requests
  where order_id = p_order_id and reason_code = 'order_cancelled'
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('kind', 'none');
  end if;

  select * into v_refund
  from public.xendit_refunds
  where return_request_id = v_request.id
  order by (status = 'succeeded') desc, (status = 'pending') desc, created_at desc
  limit 1;

  return jsonb_build_object(
    'kind', case when v_refund.id is not null then 'xendit' else 'manual' end,
    'return_request_id', v_request.id,
    'return_status', v_request.status,
    'refund_id', v_refund.id,
    'refund_status', v_refund.status,
    'failure_code', v_refund.failure_code,
    'amount_cents', coalesce(v_refund.amount_cents, v_request.refund_amount_cents),
    'currency', v_refund.currency,
    'needs_submission',
      (v_refund.id is not null and v_refund.status = 'pending' and v_refund.xendit_refund_id is null)
  );
end;
$$;

revoke all on function public._cancellation_refund_state(uuid) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- _open_cancellation_refund: opens the (single) automatic refund for a paid
-- payment on a cancelled order. Idempotent: if a cancellation refund already
-- exists for the order it returns its state and changes nothing.
-- -----------------------------------------------------------------------------
create or replace function public._open_cancellation_refund(
  p_order_id   uuid,
  p_payment_id uuid,
  p_note       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    public.orders;
  v_payment  public.payments;
  v_request  public.return_requests;
  v_already  integer;
  v_amount   integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_order.id is null or v_payment.id is null then
    return jsonb_build_object('kind', 'none');
  end if;

  -- Replay guard: a refund was already opened for this cancellation.
  if exists (
    select 1 from public.return_requests
    where order_id = p_order_id and reason_code = 'order_cancelled'
      and status in ('seller_accepted', 'refund_due', 'refunded')
  ) then
    return public._cancellation_refund_state(p_order_id);
  end if;

  select coalesce(sum(amount_cents), 0) into v_already
  from public.xendit_refunds
  where payment_id = v_payment.id and status = 'succeeded';

  v_amount := v_payment.amount_cents - v_already;
  if v_amount <= 0 then
    return jsonb_build_object('kind', 'none');
  end if;

  begin
    if v_payment.payment_method_type = 'xendit' and v_payment.xendit_payment_request_id is not null then
      -- Refund goes back through Xendit to the original payment method.
      insert into public.return_requests (
        order_id, buyer_id, seller_id, shop_id,
        reason, reason_code, request_type, status,
        seller_decision_note, seller_decided_at, restocked_at
      ) values (
        p_order_id, v_order.buyer_id, v_order.seller_id, v_order.shop_id,
        'Order cancelled', 'order_cancelled', 'money_refund', 'seller_accepted',
        p_note, now(), now()
      )
      returning * into v_request;

      insert into public.xendit_refunds (
        return_request_id, payment_id, xendit_payment_request_id, amount_cents, currency, status
      ) values (
        v_request.id, v_payment.id, v_payment.xendit_payment_request_id, v_amount, v_payment.currency, 'pending'
      );
    else
      -- COD collected / legacy / no Xendit reference: staff must pay the buyer
      -- back and record it (existing refund_due -> record_cod_refund_payout).
      insert into public.return_requests (
        order_id, buyer_id, seller_id, shop_id,
        reason, reason_code, request_type, status,
        seller_decision_note, seller_decided_at, refund_amount_cents, restocked_at
      ) values (
        p_order_id, v_order.buyer_id, v_order.seller_id, v_order.shop_id,
        'Order cancelled', 'order_cancelled', 'money_refund', 'refund_due',
        p_note, now(), v_amount, now()
      )
      returning * into v_request;
    end if;
  exception when unique_violation then
    -- An unrelated open return request already blocks the one-open-per-order
    -- index. Never fail the cancellation over it: report what exists.
    return public._cancellation_refund_state(p_order_id);
  end;

  return public._cancellation_refund_state(p_order_id);
end;
$$;

revoke all on function public._open_cancellation_refund(uuid, uuid, text) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Trigger: any pre-shipment cancellation of a paid order opens its refund.
-- -----------------------------------------------------------------------------
create or replace function public.open_refund_on_order_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment
  from public.payments
  where order_id = new.id and status in ('paid', 'partially_refunded')
  order by created_at desc
  limit 1;

  if found then
    perform public._open_cancellation_refund(
      new.id, v_payment.id, 'Automatic refund: the order was cancelled before it shipped.'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.open_refund_on_order_cancel() from public, anon, authenticated;

create trigger orders_open_refund_on_cancel
  after update of order_status on public.orders
  for each row
  when (
    new.order_status = 'cancelled'
    and old.order_status in ('pending', 'confirmed', 'processing')
  )
  execute function public.open_refund_on_order_cancel();


-- -----------------------------------------------------------------------------
-- cancel_order_with_refund: buyer's instant cancel (pending / confirmed).
-- Atomic: the order update fires the stock-restore and refund-opening
-- triggers in the same transaction. Idempotent for the same buyer.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_order_with_refund(
  p_order_id uuid,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_order  public.orders;
  v_reason text := nullif(trim(p_reason), '');
begin
  if v_uid is null then
    raise exception 'You must be signed in to cancel an order' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'Please give a cancellation reason (500 characters or fewer)' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.buyer_id <> v_uid then
    raise exception 'You do not have permission to cancel this order' using errcode = '42501';
  end if;

  if v_order.order_status = 'cancelled' then
    if v_order.cancelled_by = 'buyer' then
      return jsonb_build_object(
        'order_id', v_order.id, 'order_status', 'cancelled', 'already_cancelled', true,
        'refund', public._cancellation_refund_state(v_order.id)
      );
    end if;
    raise exception 'This order was already cancelled' using errcode = '23514';
  end if;

  if v_order.order_status = 'processing' then
    raise exception 'The seller has already started preparing this order. Please request cancellation instead.'
      using errcode = '22023';
  end if;
  if v_order.order_status not in ('pending', 'confirmed') then
    raise exception 'This order can no longer be cancelled' using errcode = '22023';
  end if;

  update public.orders
  set order_status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = 'buyer',
      cancellation_reason = v_reason
  where id = v_order.id;

  return jsonb_build_object(
    'order_id', v_order.id, 'order_status', 'cancelled', 'already_cancelled', false,
    'refund', public._cancellation_refund_state(v_order.id)
  );
end;
$$;

comment on function public.cancel_order_with_refund is
  'Buyer-only instant cancel for pending/confirmed orders. Restocks and (if the order was paid) opens the automatic refund through triggers in the same transaction. A repeat call by the same buyer returns the same result.';

revoke all on function public.cancel_order_with_refund(uuid, text) from public, anon;
grant execute on function public.cancel_order_with_refund(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- request_order_cancellation: buyer asks to cancel a processing order.
-- -----------------------------------------------------------------------------
create or replace function public.request_order_cancellation(
  p_order_id uuid,
  p_reason   text
)
returns public.cancellation_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_order   public.orders;
  v_request public.cancellation_requests;
  v_reason  text := nullif(trim(p_reason), '');
begin
  if v_uid is null then
    raise exception 'You must be signed in to request a cancellation' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'Please give a cancellation reason (500 characters or fewer)' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.buyer_id <> v_uid then
    raise exception 'You do not have permission to cancel this order' using errcode = '42501';
  end if;

  if v_order.order_status = 'cancelled' then
    raise exception 'This order is already cancelled' using errcode = '23514';
  end if;
  if v_order.order_status in ('pending', 'confirmed') then
    raise exception 'The seller has not started preparing this order yet, so you can cancel it right away.'
      using errcode = '22023';
  end if;
  if v_order.order_status <> 'processing' then
    raise exception 'This order has already shipped. Once you receive it you can request a return and refund.'
      using errcode = '22023';
  end if;

  select * into v_request
  from public.cancellation_requests
  where order_id = p_order_id and status = 'pending';
  if found then
    return v_request;
  end if;

  insert into public.cancellation_requests (order_id, buyer_id, seller_id, shop_id, reason)
  values (v_order.id, v_uid, v_order.seller_id, v_order.shop_id, v_reason)
  returning * into v_request;

  return v_request;
end;
$$;

comment on function public.request_order_cancellation is
  'Buyer-only. Opens a cancellation request for an order the seller has already marked Ready for Pickup (processing). Idempotent while a request is pending.';

revoke all on function public.request_order_cancellation(uuid, text) from public, anon;
grant execute on function public.request_order_cancellation(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- respond_to_cancellation_request: the order's seller, a shop member or an
-- admin approves (cancels the order -> automatic refund) or declines (the
-- order stays active; a reason is required).
-- -----------------------------------------------------------------------------
create or replace function public.respond_to_cancellation_request(
  p_request_id uuid,
  p_decision   text,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_request public.cancellation_requests;
  v_order   public.orders;
  v_note    text := nullif(trim(p_note), '');
  v_by      public.user_role;
begin
  if v_uid is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Note is too long' using errcode = '22023';
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'Please explain why the cancellation was declined' using errcode = '22023';
  end if;

  select * into v_request from public.cancellation_requests where id = p_request_id for update;
  if not found then
    raise exception 'Cancellation request not found' using errcode = 'P0002';
  end if;

  select * into v_order from public.orders where id = v_request.order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_uid <> v_order.seller_id
     and not public.is_shop_member(v_order.shop_id)
     and not public.is_admin()
  then
    raise exception 'You do not have permission to respond to this request' using errcode = '42501';
  end if;

  if v_request.status <> 'pending' then
    -- Same decision repeated (double click): report it, change nothing.
    if (v_request.status = 'approved' and p_decision = 'approve')
       or (v_request.status = 'rejected' and p_decision = 'reject') then
      return jsonb_build_object(
        'outcome', v_request.status, 'request_id', v_request.id, 'order_id', v_order.id,
        'already_decided', true,
        'refund', public._cancellation_refund_state(v_order.id)
      );
    end if;
    raise exception 'This request was already %', v_request.status using errcode = '23514';
  end if;

  if p_decision = 'reject' then
    update public.cancellation_requests
    set status = 'rejected', decision_note = v_note, decided_by = v_uid, decided_at = now()
    where id = v_request.id;
    return jsonb_build_object(
      'outcome', 'rejected', 'request_id', v_request.id, 'order_id', v_order.id,
      'already_decided', false, 'refund', jsonb_build_object('kind', 'none')
    );
  end if;

  -- Approve: only while the order is still in preparation. If it moved on
  -- (shipped) or was cancelled another way, the request is stale.
  if v_order.order_status <> 'processing' then
    update public.cancellation_requests
    set status = 'expired',
        decision_note = 'The order is no longer in preparation (' || v_order.order_status::text || ').',
        decided_by = v_uid, decided_at = now()
    where id = v_request.id;
    return jsonb_build_object(
      'outcome', 'expired', 'request_id', v_request.id, 'order_id', v_order.id,
      'order_status', v_order.order_status, 'already_decided', false,
      'refund', public._cancellation_refund_state(v_order.id)
    );
  end if;

  v_by := case
    when v_uid = v_order.seller_id or public.is_shop_member(v_order.shop_id) then 'seller'::public.user_role
    else 'admin'::public.user_role
  end;

  update public.orders
  set order_status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_by,
      cancellation_reason = v_request.reason
  where id = v_order.id;

  update public.cancellation_requests
  set status = 'approved', decision_note = v_note, decided_by = v_uid, decided_at = now()
  where id = v_request.id;

  return jsonb_build_object(
    'outcome', 'approved', 'request_id', v_request.id, 'order_id', v_order.id,
    'already_decided', false,
    'refund', public._cancellation_refund_state(v_order.id)
  );
end;
$$;

comment on function public.respond_to_cancellation_request is
  'Seller / shop member / admin decision on a buyer cancellation request. Approve cancels the order (stock restored, refund opened by trigger); reject requires a reason and leaves the order active. Repeating the same decision is a no-op.';

revoke all on function public.respond_to_cancellation_request(uuid, text, text) from public, anon;
grant execute on function public.respond_to_cancellation_request(uuid, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- _cancel_refund_new_attempt: opens a fresh pending Xendit attempt for a
-- cancellation refund whose previous attempt(s) failed. Never creates one
-- while another is pending or already succeeded, and never exceeds the amount
-- actually paid.
-- -----------------------------------------------------------------------------
create or replace function public._cancel_refund_new_attempt(p_return_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.return_requests;
  v_last    public.xendit_refunds;
  v_payment public.payments;
  v_already integer;
  v_amount  integer;
begin
  select * into v_request from public.return_requests where id = p_return_request_id for update;
  if not found or v_request.reason_code <> 'order_cancelled' then
    raise exception 'Cancellation refund not found' using errcode = 'P0002';
  end if;
  if v_request.status <> 'seller_accepted' then
    raise exception 'This refund is not waiting for a retry' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.xendit_refunds
    where return_request_id = v_request.id and status in ('pending', 'succeeded')
  ) then
    raise exception 'A refund is already in progress or completed for this order' using errcode = '23514';
  end if;

  select * into v_last
  from public.xendit_refunds
  where return_request_id = v_request.id
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'There is no failed refund attempt to retry' using errcode = '23514';
  end if;

  select * into v_payment from public.payments where id = v_last.payment_id for update;

  select coalesce(sum(amount_cents), 0) into v_already
  from public.xendit_refunds
  where payment_id = v_payment.id and status = 'succeeded';

  v_amount := v_payment.amount_cents - v_already;
  if v_amount <= 0 then
    raise exception 'This payment has already been fully refunded' using errcode = '23514';
  end if;

  insert into public.xendit_refunds (
    return_request_id, payment_id, xendit_payment_request_id, amount_cents, currency, status
  ) values (
    v_request.id, v_payment.id, v_payment.xendit_payment_request_id, v_amount, v_payment.currency, 'pending'
  );

  return public._cancellation_refund_state(v_request.order_id);
end;
$$;

revoke all on function public._cancel_refund_new_attempt(uuid) from public, anon, authenticated;


-- Manual recovery: the order's seller / shop member / admin retries a failed
-- cancellation refund (any failure reason).
create or replace function public.retry_order_refund(p_return_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_request public.return_requests;
  v_order   public.orders;
begin
  if v_uid is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;

  select * into v_request from public.return_requests where id = p_return_request_id;
  if not found or v_request.reason_code <> 'order_cancelled' then
    raise exception 'Cancellation refund not found' using errcode = 'P0002';
  end if;
  select * into v_order from public.orders where id = v_request.order_id;

  if v_uid <> v_order.seller_id
     and not public.is_shop_member(v_order.shop_id)
     and not public.is_admin()
  then
    raise exception 'You do not have permission to retry this refund' using errcode = '42501';
  end if;

  return public._cancel_refund_new_attempt(p_return_request_id);
end;
$$;

comment on function public.retry_order_refund is
  'Seller / shop member / admin recovery for a failed automatic cancellation refund. Refuses while an attempt is pending or already succeeded.';

revoke all on function public.retry_order_refund(uuid) from public, anon;
grant execute on function public.retry_order_refund(uuid) to authenticated;


-- Automatic recovery (service role, called by the sweep): only when OUR call to
-- Xendit failed (failure_code = 'submission_error') and fewer than
-- p_max_attempts attempts exist. A refund Xendit itself rejected needs a human.
create or replace function public.system_retry_cancellation_refund(
  p_return_request_id uuid,
  p_max_attempts      integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last     public.xendit_refunds;
  v_attempts integer;
begin
  if exists (
    select 1 from public.xendit_refunds
    where return_request_id = p_return_request_id and status in ('pending', 'succeeded')
  ) then
    return jsonb_build_object('retried', false);
  end if;

  select * into v_last
  from public.xendit_refunds
  where return_request_id = p_return_request_id
  order by created_at desc
  limit 1;

  if not found or v_last.status <> 'failed' or v_last.failure_code is distinct from 'submission_error' then
    return jsonb_build_object('retried', false);
  end if;

  select count(*) into v_attempts from public.xendit_refunds where return_request_id = p_return_request_id;
  if v_attempts >= p_max_attempts then
    return jsonb_build_object('retried', false, 'reason', 'max_attempts');
  end if;

  return jsonb_build_object('retried', true) || jsonb_build_object(
    'refund', public._cancel_refund_new_attempt(p_return_request_id)
  );
end;
$$;

revoke all on function public.system_retry_cancellation_refund(uuid, integer) from public, anon, authenticated;
grant execute on function public.system_retry_cancellation_refund(uuid, integer) to service_role;


-- -----------------------------------------------------------------------------
-- Service-role twins of record/fail_xendit_refund_submission. The originals
-- require is_admin() from auth.uid(); the buyer-triggered cancellation refund
-- is submitted by the server on the buyer's behalf, so it has no admin session.
-- The refund id only ever comes from an RPC that already authorized the caller.
-- -----------------------------------------------------------------------------
create or replace function public.system_record_xendit_refund_submission(
  p_refund_id        uuid,
  p_xendit_refund_id text,
  p_raw_response     jsonb
)
returns public.xendit_refunds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.xendit_refunds;
begin
  select * into v_refund from public.xendit_refunds where id = p_refund_id for update;
  if not found then
    raise exception 'Refund attempt not found' using errcode = 'P0002';
  end if;
  if v_refund.status <> 'pending' then
    return v_refund;  -- already settled by the webhook / sweep: nothing to record
  end if;

  update public.xendit_refunds
  set xendit_refund_id = coalesce(xendit_refund_id, p_xendit_refund_id),
      raw_response = p_raw_response
  where id = p_refund_id
  returning * into v_refund;

  return v_refund;
end;
$$;

revoke all on function public.system_record_xendit_refund_submission(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.system_record_xendit_refund_submission(uuid, text, jsonb) to service_role;

create or replace function public.system_fail_xendit_refund_submission(
  p_refund_id  uuid,
  p_error_note text
)
returns public.xendit_refunds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.xendit_refunds;
begin
  select * into v_refund from public.xendit_refunds where id = p_refund_id for update;
  if not found then
    raise exception 'Refund attempt not found' using errcode = 'P0002';
  end if;
  -- Only a never-submitted pending attempt can fail this way; once Xendit has
  -- an id for it, only the refund webhook / status sync may settle it.
  if v_refund.status <> 'pending' or v_refund.xendit_refund_id is not null then
    return v_refund;
  end if;

  update public.xendit_refunds
  set status = 'failed',
      failure_code = 'submission_error',
      raw_response = jsonb_build_object('error', left(p_error_note, 500))
  where id = p_refund_id
  returning * into v_refund;

  return v_refund;
end;
$$;

revoke all on function public.system_fail_xendit_refund_submission(uuid, text) from public, anon, authenticated;
grant execute on function public.system_fail_xendit_refund_submission(uuid, text) to service_role;


-- -----------------------------------------------------------------------------
-- refund_late_payment_on_cancelled_order: called (service role) after
-- process_xendit_webhook for every SUCCEEDED payment webhook. process_xendit_webhook
-- ignores a payment that lands on a cancelled order ('order_cancelled') or on a
-- row already marked failed ('duplicate_or_late'), which would keep the
-- buyer's money with nothing to show for it. This records the payment as paid
-- (it really was captured) and opens the automatic refund. Idempotent: once
-- the payment is 'paid' it is no longer a candidate.
-- -----------------------------------------------------------------------------
create or replace function public.refund_late_payment_on_cancelled_order(
  p_reference_id              uuid,
  p_xendit_payment_request_id text,
  p_xendit_payment_id         text,
  p_status                    text,
  p_amount_cents              integer,
  p_currency                  text,
  p_channel_code              text,
  p_raw_payload               jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_group boolean;
  v_row      record;
  v_state    jsonb;
  v_results  jsonb := '[]'::jsonb;
  v_total    integer := 0;
begin
  if p_status is distinct from 'SUCCEEDED' then
    return v_results;
  end if;

  select exists (select 1 from public.payments where checkout_group_id = p_reference_id)
  into v_is_group;

  -- Candidates: this reference's Xendit payments that are not paid yet but
  -- whose order is already cancelled.
  for v_row in
    select p.id as payment_id, p.amount_cents, p.currency, p.payment_channel,
           p.xendit_payment_request_id as stored_request_id, o.id as order_id
    from public.payments p
    join public.orders o on o.id = p.order_id
    where case when v_is_group then p.checkout_group_id = p_reference_id else p.id = p_reference_id end
      and p.payment_method_type = 'xendit'
      and p.status in ('pending', 'failed')
      and o.order_status = 'cancelled'
      and (p_channel_code is null or p.payment_channel is null or p.payment_channel = p_channel_code)
    order by p.created_at
    for update of p, o
  loop
    -- Same identity rules as process_xendit_webhook: wallets must match the
    -- stored payment request id; a card's id is only known once it succeeds.
    if v_row.payment_channel is distinct from 'CARD'
       and v_row.stored_request_id is distinct from p_xendit_payment_request_id then
      continue;
    end if;
    if v_row.currency is distinct from p_currency then
      continue;
    end if;
    -- A single payment must match exactly. A group payment covers several
    -- orders; the cancelled members' share can never exceed what was captured.
    if not v_is_group and v_row.amount_cents is distinct from p_amount_cents then
      continue;
    end if;
    v_total := v_total + v_row.amount_cents;
    if v_is_group and v_total > p_amount_cents then
      continue;
    end if;

    update public.payments
    set status = 'paid',
        payment_channel = coalesce(p_channel_code, payment_channel),
        xendit_payment_request_id = coalesce(nullif(p_xendit_payment_request_id, ''), xendit_payment_request_id),
        xendit_payment_id = nullif(p_xendit_payment_id, ''),
        failure_reason = null,
        provider_response = p_raw_payload,
        verified_at = now()
    where id = v_row.payment_id;

    update public.orders set payment_status = 'paid' where id = v_row.order_id;

    v_state := public._open_cancellation_refund(
      v_row.order_id, v_row.payment_id,
      'Automatic refund: the payment was received after the order was cancelled.'
    );

    insert into public.payment_webhook_events (
      xendit_payment_request_id, xendit_payment_id, reference_id,
      event_type, status, payment_row_id, processing_result, raw_payload
    ) values (
      p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
      'payment', p_status, v_row.payment_id, 'late_payment_refund_opened', p_raw_payload
    );

    v_results := v_results || jsonb_build_array(v_state || jsonb_build_object('order_id', v_row.order_id));
  end loop;

  return v_results;
end;
$$;

comment on function public.refund_late_payment_on_cancelled_order is
  'service_role ONLY. For a SUCCEEDED payment webhook whose order is already cancelled: marks the captured payment paid and opens the automatic refund. Idempotent. Returns one refund state per payment handled.';

revoke all on function public.refund_late_payment_on_cancelled_order(uuid, text, text, text, integer, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.refund_late_payment_on_cancelled_order(uuid, text, text, text, integer, text, text, jsonb)
  to service_role;


-- -----------------------------------------------------------------------------
-- process_xendit_refund_webhook: identical to 20260921000000 / the live body
-- except ONE condition -- a fully refunded order that is already CANCELLED
-- keeps order_status 'cancelled' (the refund is carried by payment_status).
-- Cancellation status and refund status stay separate, and reports keep
-- counting it as a cancelled order.
-- -----------------------------------------------------------------------------
create or replace function public.process_xendit_refund_webhook(
  p_xendit_refund_id text,
  p_status            text,
  p_failure_code      text,
  p_amount_cents      integer,
  p_raw_payload       jsonb
)
returns public.xendit_refunds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund         public.xendit_refunds;
  v_payment        public.payments;
  v_order          public.orders;
  v_new_status     public.payment_status;
  v_total_refunded integer;
begin
  select * into v_refund from public.xendit_refunds where xendit_refund_id = p_xendit_refund_id for update;

  if not found then
    insert into public.payment_webhook_events (
      xendit_payment_request_id, xendit_payment_id, reference_id, event_type, status, payment_row_id, processing_result, raw_payload
    ) values (
      null, null, null, 'refund', p_status, null, 'unknown_refund_reference', p_raw_payload
    );
    return null;
  end if;

  if v_refund.status <> 'pending' then
    insert into public.payment_webhook_events (
      xendit_payment_request_id, xendit_payment_id, reference_id, event_type, status, payment_row_id, processing_result, raw_payload
    ) values (
      v_refund.xendit_payment_request_id, p_xendit_refund_id, v_refund.id, 'refund', p_status, v_refund.payment_id, 'duplicate_or_late', p_raw_payload
    );
    return v_refund;
  end if;

  -- Defensive amount cross-check, same spirit as process_xendit_webhook's
  -- amount-mismatch guard: never silently apply a refund for a different
  -- amount than what was actually submitted.
  if p_amount_cents is not null and p_amount_cents <> 0 and p_amount_cents is distinct from v_refund.amount_cents then
    insert into public.payment_webhook_events (
      xendit_payment_request_id, xendit_payment_id, reference_id, event_type, status, payment_row_id, processing_result, raw_payload
    ) values (
      v_refund.xendit_payment_request_id, p_xendit_refund_id, v_refund.id, 'refund', p_status, v_refund.payment_id, 'refund_amount_mismatch', p_raw_payload
    );
    return v_refund;
  end if;

  if p_status = 'SUCCEEDED' then
    select * into v_payment from public.payments where id = v_refund.payment_id for update;
    select * into v_order from public.orders where id = v_payment.order_id for update;

    update public.xendit_refunds
    set status = 'succeeded', raw_response = p_raw_payload
    where id = v_refund.id;

    select coalesce(sum(amount_cents), 0) into v_total_refunded
    from public.xendit_refunds
    where payment_id = v_payment.id and status = 'succeeded';

    v_new_status := case
      when v_total_refunded < v_payment.amount_cents then 'partially_refunded'::public.payment_status
      else 'refunded'::public.payment_status
    end;

    update public.payments set status = v_new_status where id = v_payment.id;

    perform set_config('app.refund_in_progress', 'true', true);

    update public.orders
    set payment_status = v_new_status,
        order_status = case
          when v_new_status = 'refunded' and order_status <> 'cancelled'
            then 'refunded'::public.order_status
          else order_status
        end
    where id = v_order.id;

    update public.return_requests
    set status = 'refunded',
        refund_amount_cents = v_refund.amount_cents
    where id = v_refund.return_request_id;

    insert into public.payment_webhook_events (
      xendit_payment_request_id, xendit_payment_id, reference_id, event_type, status, payment_row_id, processing_result, raw_payload
    ) values (
      v_refund.xendit_payment_request_id, p_xendit_refund_id, v_refund.id, 'refund', p_status, v_refund.payment_id,
      case when v_total_refunded > v_payment.amount_cents then 'refund_overshoot_anomaly' else 'applied' end,
      p_raw_payload
    );

  elsif p_status in ('FAILED', 'CANCELLED') then
    update public.xendit_refunds
    set status = 'failed', failure_code = p_failure_code, raw_response = p_raw_payload
    where id = v_refund.id;
    -- return_requests/payments/orders intentionally untouched -- still
    -- exactly where they were before this attempt, safe to retry.

    insert into public.payment_webhook_events (
      xendit_payment_request_id, xendit_payment_id, reference_id, event_type, status, payment_row_id, processing_result, raw_payload
    ) values (
      v_refund.xendit_payment_request_id, p_xendit_refund_id, v_refund.id, 'refund', p_status, v_refund.payment_id, 'applied', p_raw_payload
    );
  else
    -- PENDING or an unrecognized status -- never safe to assume an outcome.
    insert into public.payment_webhook_events (
      xendit_payment_request_id, xendit_payment_id, reference_id, event_type, status, payment_row_id, processing_result, raw_payload
    ) values (
      v_refund.xendit_payment_request_id, p_xendit_refund_id, v_refund.id, 'refund', p_status, v_refund.payment_id, 'ignored_transient_status', p_raw_payload
    );
  end if;

  select * into v_refund from public.xendit_refunds where id = v_refund.id;
  return v_refund;
end;
$$;


-- -----------------------------------------------------------------------------
-- report_refund_pipeline: refunds that are in flight, for the seller/admin
-- sales report (same cohort and shop scoping as report_sales_summary).
--   pending_refunds   Xendit refunds awaiting provider confirmation, plus COD
--                     refunds waiting for staff to record the payout
--   attention_refunds refunds whose every Xendit attempt failed and need a
--                     retry or manual handling
-- Completed refunds and net revenue stay in report_sales_summary.
-- -----------------------------------------------------------------------------
create or replace function public.report_refund_pipeline(
  p_from    date,
  p_to      date,
  p_shop_id uuid default null
)
returns table(
  pending_refunds         bigint,
  pending_refund_cents    bigint,
  attention_refunds       bigint,
  attention_refund_cents  bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid            uuid := (select auth.uid());
  v_is_admin       boolean := public.is_admin();
  v_caller_shop_id uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to view reports' using errcode = '42501';
  end if;
  if not (v_is_admin or public.current_user_role() = 'seller') then
    raise exception 'You do not have permission to view reports' using errcode = '42501';
  end if;

  if not v_is_admin then
    select su.shop_id into v_caller_shop_id from public.shop_users su where su.user_id = v_uid;
  end if;

  return query
  with scoped as (
    select o.id
    from public.orders o
    where o.placed_at >= (p_from::timestamp at time zone 'Asia/Manila')
      and o.placed_at <  ((p_to + 1)::timestamp at time zone 'Asia/Manila')
      and case
            when v_is_admin then (
              p_shop_id is null
              or o.seller_id in (
                select su.user_id from public.shop_users su where su.shop_id = p_shop_id
              )
            )
            else (
              (v_caller_shop_id is not null and o.shop_id = v_caller_shop_id)
              or (o.shop_id is null and o.seller_id = v_uid)
            )
          end
  ),
  pending_x as (
    select count(*)::bigint as c, coalesce(sum(x.amount_cents), 0)::bigint as s
    from public.xendit_refunds x
    join public.return_requests rr on rr.id = x.return_request_id
    where rr.order_id in (select id from scoped) and x.status = 'pending'
  ),
  due_manual as (
    select count(*)::bigint as c, coalesce(sum(rr.refund_amount_cents), 0)::bigint as s
    from public.return_requests rr
    where rr.order_id in (select id from scoped) and rr.status = 'refund_due'
  ),
  attention as (
    select count(*)::bigint as c, coalesce(sum(a.amount_cents), 0)::bigint as s
    from (
      select distinct on (rr.id) rr.id, x.amount_cents
      from public.return_requests rr
      join public.xendit_refunds x on x.return_request_id = rr.id
      where rr.order_id in (select id from scoped)
        and rr.status = 'seller_accepted'
        and not exists (
          select 1 from public.xendit_refunds p
          where p.return_request_id = rr.id and p.status in ('pending', 'succeeded')
        )
      order by rr.id, x.created_at desc
    ) a
  )
  select
    (pending_x.c + due_manual.c)::bigint,
    (pending_x.s + due_manual.s)::bigint,
    attention.c,
    attention.s
  from pending_x, due_manual, attention;
end;
$$;

comment on function public.report_refund_pipeline is
  'Seller/admin report: refunds pending (awaiting Xendit or a staff payout) and refunds needing attention (all attempts failed), scoped like report_sales_summary.';

revoke all on function public.report_refund_pipeline(date, date, uuid) from public, anon;
grant execute on function public.report_refund_pipeline(date, date, uuid) to authenticated;

commit;
