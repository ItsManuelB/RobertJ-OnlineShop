-- =============================================================================
-- Forensic capture for Xendit Card *session-creation* call failures --
-- the outbound counterpart to log_unrecognized_xendit_webhook_payload
-- (20260925015850), which only covers inbound webhook payloads we can't
-- parse. Closes the gap documented in
-- docs/xendit-multishop-card-payment-failure-audit.md root cause #2:
-- createXenditCardSessionAction/createXenditGroupCardSessionAction currently
-- swallow a failed Xendit /sessions call into a bare `catch { return
-- fail(error.message) }` -- nothing is persisted, so once Vercel's 1-hour
-- (Hobby plan) log retention rolls over, the actual cause is gone. Confirmed
-- live: checkout_group_id ff81a380-443c-49ef-86c6-b33fc430c515 failed to
-- ever acquire a session across 4 consecutive attempts, with the real error
-- unrecoverable by the time this was investigated.
--
-- Scope, per explicit instruction: CARD only. No change to any GCash/Maya
-- code path or table.
--
-- ROLLBACK:
--   drop function public.log_xendit_card_session_failure(uuid, text);
--   drop table public.xendit_card_session_failures;
-- =============================================================================

create table public.xendit_card_session_failures (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  payment_id  uuid not null references public.payments(id),
  order_id    uuid not null references public.orders(id),
  checkout_group_id uuid,
  error_message text not null
);

comment on table public.xendit_card_session_failures is
  'Forensic log of failed Xendit Card /sessions creation calls. Written only by log_xendit_card_session_failure.';

alter table public.xendit_card_session_failures enable row level security;
-- No policies: service_role bypasses RLS for admin/ops review; all other
-- access goes through the narrow SECURITY DEFINER function below.

create or replace function public.log_xendit_card_session_failure(
  p_payment_id   uuid,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_order_id uuid;
  v_group_id uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;

  select p.order_id, p.checkout_group_id into v_order_id, v_group_id
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.id = p_payment_id
    and o.buyer_id = v_uid
    and p.payment_channel = 'CARD';

  if v_order_id is null then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;

  insert into public.xendit_card_session_failures (
    payment_id, order_id, checkout_group_id, error_message
  ) values (
    p_payment_id, v_order_id, v_group_id, left(p_error_message, 2000)
  );
end;
$$;

revoke all on function public.log_xendit_card_session_failure(uuid, text) from public, anon;
grant execute on function public.log_xendit_card_session_failure(uuid, text) to authenticated;
