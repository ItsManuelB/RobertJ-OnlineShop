-- =============================================================================
-- CARD-only companion to 20261016120000_xendit_card_only_webhook_cross_
-- channel_guard.sql -- closes the cross-channel deadlock at the source
-- instead of only defending against it in the webhook.
--
-- When a buyer starts a CARD group attempt, retire any OTHER channel's
-- still-pending row for the same eligible orders. Safe to do here because
-- the app-layer channel-switch guard (findFreshOtherChannelAttempt /
-- CHANNEL_SWITCH_BLOCKED_MESSAGE in xendit-reconciliation.ts) already
-- refuses to call this RPC with a new channel while another channel still
-- has a fresh, possibly-resolvable attempt -- by the time
-- begin_xendit_group_payment_attempt(groupId, 'CARD') runs, any other
-- channel's row is already confirmed stale/abandoned.
--
-- Scope, per explicit instruction: CARD only. Starting a GCash/Maya attempt
-- (p_channel_code <> 'CARD') takes the exact same path as before -- the new
-- block below is gated on p_channel_code = 'CARD' and does not run for them.
--
-- ROLLBACK: re-apply the prior CREATE OR REPLACE from
--   20260927040000_xendit_stale_pending_dedup.sql.
-- =============================================================================

create or replace function public.begin_xendit_group_payment_attempt(
  p_checkout_group_id uuid,
  p_channel_code text
)
returns public.payments
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid                uuid := (select auth.uid());
  v_order               public.orders;
  v_result              public.payments;
  v_has_valid           boolean;
  v_eligible_order_ids  uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'You must be signed in to start a payment' using errcode = '42501';
  end if;

  if p_channel_code not in ('GCASH', 'PAYMAYA', 'CARD') then
    raise exception 'Unsupported payment channel' using errcode = '22023';
  end if;

  perform 1 from public.orders where checkout_group_id = p_checkout_group_id for update;
  if not found then
    raise exception 'Checkout group not found' using errcode = 'P0002';
  end if;

  for v_order in
    select * from public.orders where checkout_group_id = p_checkout_group_id for update
  loop
    if v_order.buyer_id <> v_uid then
      raise exception 'You do not have permission to pay for this order' using errcode = '42501';
    end if;

    if v_order.payment_status = 'paid' or v_order.order_status = 'cancelled' then
      continue;
    end if;

    if v_order.payment_status not in ('pending', 'failed') then
      raise exception 'This order is not awaiting payment' using errcode = '22023';
    end if;

    v_eligible_order_ids := array_append(v_eligible_order_ids, v_order.id);
  end loop;

  if array_length(v_eligible_order_ids, 1) is null then
    raise exception 'This group has already been paid' using errcode = '22023';
  end if;

  -- CARD-only fix: see migration header. Does not run for GCash/Maya.
  if p_channel_code = 'CARD' then
    update public.payments
    set status = 'failed',
        failure_reason = 'superseded_by_channel_switch_to_card'
    where checkout_group_id = p_checkout_group_id
      and payment_channel <> 'CARD'
      and status = 'pending'
      and order_id = any(v_eligible_order_ids);
  end if;

  select exists (
    select 1 from public.payments
    where checkout_group_id = p_checkout_group_id
      and payment_channel = p_channel_code
      and order_id = any(v_eligible_order_ids)
      and status = 'pending'
      and (
        (xendit_payment_request_id is null and created_at > now() - interval '2 minutes')
        or (xendit_payment_request_id is not null and expires_at is not null and expires_at > now())
        or (
          xendit_payment_request_id is not null and expires_at is null
          and payment_channel in ('GCASH', 'PAYMAYA')
          and created_at > now() - interval '20 minutes'
        )
        or (
          xendit_payment_request_id is not null and expires_at is null
          and payment_channel = 'CARD'
          and created_at > now() - interval '30 minutes'
        )
      )
  ) into v_has_valid;

  if not v_has_valid then
    update public.payments
    set status = 'failed',
        failure_reason = 'superseded_by_new_attempt'
    where checkout_group_id = p_checkout_group_id
      and payment_channel = p_channel_code
      and status = 'pending'
      and xendit_payment_request_id is null
      and order_id = any(v_eligible_order_ids);

    insert into public.payments (
      order_id, payment_method_type, payment_channel, amount_cents, currency, status, checkout_group_id
    )
    select o.id, 'xendit', p_channel_code, o.total_cents, o.currency, 'pending', p_checkout_group_id
    from public.orders o
    where o.checkout_group_id = p_checkout_group_id
      and o.id = any(v_eligible_order_ids);
  end if;

  select * into v_result
  from public.payments
  where checkout_group_id = p_checkout_group_id
    and payment_channel = p_channel_code
    and order_id = any(v_eligible_order_ids)
  order by created_at desc
  limit 1;

  return v_result;
end;
$function$;

revoke all on function public.begin_xendit_group_payment_attempt(uuid, text) from public, anon;
grant execute on function public.begin_xendit_group_payment_attempt(uuid, text) to authenticated, service_role;
