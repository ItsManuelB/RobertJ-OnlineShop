-- =============================================================================
-- Shorten the unpaid online-payment order expiry from 24 hours to 60 minutes.
-- An abandoned GCash/Maya/Card order otherwise holds its stock for a day or
-- more. Business-rule change approved by the owner (2026-10-22); 60 minutes
-- comfortably outlasts the 30-minute Card session and the 20-minute e-wallet
-- window, and the sweep still re-checks Xendit's real status before cancelling,
-- so a payment that is still resolvable is never discarded. COD is untouched
-- (the function only accepts payment_method = 'xendit').
--
-- Body is identical to 20260930040000_expire_unpaid_xendit_orders.sql except
-- the threshold and the cancellation reason; grants are unchanged.
-- =============================================================================

begin;

create or replace function public.expire_unpaid_xendit_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  if v_order.payment_method <> 'xendit' then
    raise exception 'Only an unpaid online-payment order can be auto-expired.'
      using errcode = '22023';
  end if;
  if v_order.payment_status = 'paid' then
    raise exception 'This order has already been paid.' using errcode = '22023';
  end if;
  if v_order.order_status <> 'pending' then
    raise exception 'Only a pending order can be auto-expired.' using errcode = '22023';
  end if;
  if v_order.placed_at > now() - interval '60 minutes' then
    raise exception 'This order has not yet reached the abandonment threshold.'
      using errcode = '22023';
  end if;

  update public.orders
  set order_status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = 'Automatically cancelled — online payment was not completed within 60 minutes.'
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

commit;
