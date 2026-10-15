-- =============================================================================
-- CARD-only fix for the multi-seller (group) Xendit webhook cross-channel
-- deadlock documented in docs/xendit-multishop-card-payment-failure-audit.md.
--
-- Bug: process_xendit_webhook's group branch rejects a webhook for the
-- *entire* group ('reference_mismatch') if ANY other still-pending payment
-- row on a non-CARD channel doesn't share the incoming
-- xendit_payment_request_id -- even when that stale row belongs to a channel
-- the buyer abandoned before switching to Card. begin_xendit_group_payment_
-- attempt's own stale-row cleanup is channel-scoped, so an abandoned GCash/
-- Maya attempt is never retired and permanently blocks every future Card
-- webhook for that group. Confirmed live: checkout_group_id
-- 4982c4b1-485c-413c-9ef4-eea42b234852 (GCash/Maya only, no Card involved)
-- failed this exact guard on every daily Xendit webhook retry for 27 days.
--
-- Scope of this fix, per explicit instruction: CARD incoming webhooks only.
-- GCash/Maya incoming webhooks take the exact same code path as before --
-- the new conditions below are structured so they evaluate to the original
-- behavior whenever p_channel_code is not 'CARD' (including null, which
-- conservatively keeps the stricter existing behavior rather than loosening
-- it for a channel the webhook payload didn't identify).
--
-- Two spots change, both only for p_channel_code = 'CARD':
--   1. The cross-channel consistency guard is skipped entirely -- a stale
--      non-CARD pending row must never block a Card webhook from applying.
--   2. The group amount-mismatch sum is scoped to CARD-channel pending rows
--      only, so a stale non-CARD row's amount is never added into what a
--      Card webhook's charged amount is compared against.
--
-- The per-member resolution loop further down is already channel-scoped
-- (p.payment_channel = p_channel_code) from the earlier
-- xendit_phase2_channel_scoped_group_finalize migration -- unchanged here.
--
-- ROLLBACK: re-apply the prior CREATE OR REPLACE from the combined bodies of
--   20260914132906_xendit_phase2_multiseller_group_payment.sql and
--   20260915101406_xendit_phase2_channel_scoped_group_finalize.sql.
-- =============================================================================

create or replace function public.process_xendit_webhook(
  p_reference_id uuid,
  p_xendit_payment_request_id text,
  p_xendit_payment_id text,
  p_status text,
  p_amount_cents integer,
  p_currency text,
  p_raw_payload jsonb,
  p_channel_code text default null::text
)
returns public.payments
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_payment     public.payments;
  v_order       public.orders;
  v_new_status  public.payment_status;
  v_is_group    boolean;
  v_all_final   boolean;
  v_group_total integer;
  v_group_ccy   text;
  v_member      record;
  v_result      public.payments;
begin
  select exists(select 1 from public.payments where checkout_group_id = p_reference_id) into v_is_group;

  if v_is_group then
    -- CARD-only fix: a stale, abandoned non-CARD channel's pending row must
    -- never block an incoming Card webhook. GCash/Maya incoming webhooks
    -- (p_channel_code is distinct from 'CARD' is true for them, and for
    -- null) take the exact same guard as before this migration.
    if p_channel_code is distinct from 'CARD' and exists (
      select 1 from public.payments
      where checkout_group_id = p_reference_id
        and status = 'pending'
        and payment_channel <> 'CARD'
        and xendit_payment_request_id is distinct from p_xendit_payment_request_id
    ) then
      insert into public.payment_webhook_events (
        xendit_payment_request_id, xendit_payment_id, reference_id,
        event_type, status, payment_row_id, processing_result, raw_payload
      ) values (
        p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
        'payment', p_status, null, 'reference_mismatch', p_raw_payload
      );
      select * into v_result from public.payments where checkout_group_id = p_reference_id limit 1;
      return v_result;
    end if;

    select bool_and(status in ('paid', 'failed')) into v_all_final
    from public.payments where checkout_group_id = p_reference_id;

    if v_all_final then
      insert into public.payment_webhook_events (
        xendit_payment_request_id, xendit_payment_id, reference_id,
        event_type, status, payment_row_id, processing_result, raw_payload
      ) values (
        p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
        'payment', p_status, null, 'duplicate_or_late', p_raw_payload
      );
      select * into v_result from public.payments where checkout_group_id = p_reference_id limit 1;
      return v_result;
    end if;

    -- CARD-only fix: when the incoming webhook is for Card, only sum this
    -- attempt's CARD-channel pending rows -- a stale non-CARD pending row's
    -- amount must never be folded into what a Card webhook's charged amount
    -- is compared against. Unchanged for non-CARD incoming webhooks (the
    -- `p_channel_code is distinct from 'CARD'` side is true, so every
    -- pending row is summed exactly as before).
    select sum(amount_cents), max(currency) into v_group_total, v_group_ccy
    from public.payments
    where checkout_group_id = p_reference_id
      and status = 'pending'
      and (p_channel_code is distinct from 'CARD' or payment_channel = 'CARD');

    if p_amount_cents is distinct from v_group_total or p_currency is distinct from v_group_ccy then
      update public.payments
      set status = 'failed',
          failure_reason = 'amount_mismatch',
          payment_channel = coalesce(p_channel_code, payment_channel),
          xendit_payment_id = p_xendit_payment_id,
          provider_response = p_raw_payload,
          verified_at = now()
      where checkout_group_id = p_reference_id and status = 'pending';

      update public.orders o set payment_status = 'failed'
      from public.payments p
      where p.order_id = o.id and p.checkout_group_id = p_reference_id and o.payment_status = 'pending';

      insert into public.payment_webhook_events (
        xendit_payment_request_id, xendit_payment_id, reference_id,
        event_type, status, payment_row_id, processing_result, raw_payload
      ) values (
        p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
        'payment', p_status, null, 'amount_mismatch', p_raw_payload
      );
      select * into v_result from public.payments where checkout_group_id = p_reference_id limit 1;
      return v_result;
    end if;

    v_new_status := case
      when p_status = 'SUCCEEDED' then 'paid'::public.payment_status
      when p_status in ('FAILED', 'EXPIRED', 'CANCELED') then 'failed'::public.payment_status
      else null
    end;

    if v_new_status is null then
      insert into public.payment_webhook_events (
        xendit_payment_request_id, xendit_payment_id, reference_id,
        event_type, status, payment_row_id, processing_result, raw_payload
      ) values (
        p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
        'payment', p_status, null, 'ignored_transient_status', p_raw_payload
      );
      select * into v_result from public.payments where checkout_group_id = p_reference_id limit 1;
      return v_result;
    end if;

    for v_member in
      select p.id as payment_id, p.status as payment_status, o.id as order_id, o.order_status
      from public.payments p join public.orders o on o.id = p.order_id
      where p.checkout_group_id = p_reference_id
        and (p_channel_code is null or p.payment_channel = p_channel_code)
      for update of p, o
    loop
      if v_member.payment_status in ('paid', 'failed') then
        insert into public.payment_webhook_events (
          xendit_payment_request_id, xendit_payment_id, reference_id,
          event_type, status, payment_row_id, processing_result, raw_payload
        ) values (
          p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
          'payment', p_status, v_member.payment_id, 'duplicate_or_late', p_raw_payload
        );
        continue;
      end if;

      if v_member.order_status = 'cancelled' then
        insert into public.payment_webhook_events (
          xendit_payment_request_id, xendit_payment_id, reference_id,
          event_type, status, payment_row_id, processing_result, raw_payload
        ) values (
          p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
          'payment', p_status, v_member.payment_id, 'order_cancelled', p_raw_payload
        );
        continue;
      end if;

      update public.payments
      set status = v_new_status,
          payment_channel = coalesce(p_channel_code, payment_channel),
          xendit_payment_request_id = coalesce(p_xendit_payment_request_id, xendit_payment_request_id),
          xendit_payment_id = p_xendit_payment_id,
          failure_reason = case when v_new_status = 'failed' then 'xendit_status:' || p_status else null end,
          provider_response = p_raw_payload,
          verified_at = now()
      where id = v_member.payment_id;

      update public.orders set payment_status = v_new_status where id = v_member.order_id;

      insert into public.payment_webhook_events (
        xendit_payment_request_id, xendit_payment_id, reference_id,
        event_type, status, payment_row_id, processing_result, raw_payload
      ) values (
        p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
        'payment', p_status, v_member.payment_id, 'applied', p_raw_payload
      );
    end loop;

    select * into v_result from public.payments where checkout_group_id = p_reference_id limit 1;
    return v_result;
  end if;

  select * into v_payment
  from public.payments
  where id = p_reference_id
  for update;

  if not found then
    insert into public.payment_webhook_events (
      xendit_payment_request_id, xendit_payment_id, reference_id,
      event_type, status, payment_row_id, processing_result, raw_payload
    ) values (
      p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
      'payment', p_status, null, 'unknown_reference', p_raw_payload
    );
    return null;
  end if;

  select * into v_order
  from public.orders
  where id = v_payment.order_id
  for update;

  if v_payment.payment_channel <> 'CARD'
     and v_payment.xendit_payment_request_id is distinct from p_xendit_payment_request_id
  then
    insert into public.payment_webhook_events (
      xendit_payment_request_id, xendit_payment_id, reference_id,
      event_type, status, payment_row_id, processing_result, raw_payload
    ) values (
      p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
      'payment', p_status, v_payment.id, 'reference_mismatch', p_raw_payload
    );
    return v_payment;
  end if;

  if v_payment.status in ('paid', 'failed') then
    insert into public.payment_webhook_events (
      xendit_payment_request_id, xendit_payment_id, reference_id,
      event_type, status, payment_row_id, processing_result, raw_payload
    ) values (
      p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
      'payment', p_status, v_payment.id, 'duplicate_or_late', p_raw_payload
    );
    return v_payment;
  end if;

  if v_order.order_status = 'cancelled' then
    insert into public.payment_webhook_events (
      xendit_payment_request_id, xendit_payment_id, reference_id,
      event_type, status, payment_row_id, processing_result, raw_payload
    ) values (
      p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
      'payment', p_status, v_payment.id, 'order_cancelled', p_raw_payload
    );
    return v_payment;
  end if;

  if p_amount_cents is distinct from v_payment.amount_cents
     or p_currency is distinct from v_payment.currency
  then
    update public.payments
    set status = 'failed',
        failure_reason = 'amount_mismatch',
        payment_channel = coalesce(p_channel_code, payment_channel),
        xendit_payment_id = p_xendit_payment_id,
        provider_response = p_raw_payload,
        verified_at = now()
    where id = v_payment.id
    returning * into v_payment;

    update public.orders set payment_status = 'failed' where id = v_order.id;

    insert into public.payment_webhook_events (
      xendit_payment_request_id, xendit_payment_id, reference_id,
      event_type, status, payment_row_id, processing_result, raw_payload
    ) values (
      p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
      'payment', p_status, v_payment.id, 'amount_mismatch', p_raw_payload
    );
    return v_payment;
  end if;

  v_new_status := case
    when p_status = 'SUCCEEDED' then 'paid'::public.payment_status
    when p_status in ('FAILED', 'EXPIRED', 'CANCELED') then 'failed'::public.payment_status
    else null
  end;

  if v_new_status is null then
    insert into public.payment_webhook_events (
      xendit_payment_request_id, xendit_payment_id, reference_id,
      event_type, status, payment_row_id, processing_result, raw_payload
    ) values (
      p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
      'payment', p_status, v_payment.id, 'ignored_transient_status', p_raw_payload
    );
    return v_payment;
  end if;

  update public.payments
  set status = v_new_status,
      payment_channel = coalesce(p_channel_code, payment_channel),
      xendit_payment_request_id = coalesce(p_xendit_payment_request_id, xendit_payment_request_id),
      xendit_payment_id = p_xendit_payment_id,
      failure_reason = case when v_new_status = 'failed' then 'xendit_status:' || p_status else null end,
      provider_response = p_raw_payload,
      verified_at = now()
  where id = v_payment.id
  returning * into v_payment;

  update public.orders set payment_status = v_new_status where id = v_order.id;

  insert into public.payment_webhook_events (
    xendit_payment_request_id, xendit_payment_id, reference_id,
    event_type, status, payment_row_id, processing_result, raw_payload
  ) values (
    p_xendit_payment_request_id, p_xendit_payment_id, p_reference_id,
    'payment', p_status, v_payment.id, 'applied', p_raw_payload
  );

  return v_payment;
end;
$function$;

revoke all on function public.process_xendit_webhook(uuid, text, text, text, integer, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.process_xendit_webhook(uuid, text, text, text, integer, text, jsonb, text) to service_role;
