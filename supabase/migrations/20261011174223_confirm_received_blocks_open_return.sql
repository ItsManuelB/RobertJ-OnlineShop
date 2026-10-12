-- =============================================================================
-- Audit finding F-08 (Medium): `confirm_order_received` and `request_return`
-- were made mutually exclusive only by the order-detail page's own rendering
-- logic (`showDeliveryResolution`) — a direct RPC call (or a second open tab)
-- could confirm receipt while a return request is still under active
-- seller/admin review, muddying that review's record-keeping.
--
-- Fix: `confirm_order_received` now re-derives this itself (same
-- self-contained-precondition style the function already uses for every
-- other check) — reject if an OPEN return request (`status in ('pending',
-- 'seller_accepted')`) exists for this order. A terminal return
-- (seller_rejected/admin_rejected/refunded) no longer blocks confirmation.
-- `request_return` is intentionally left unchanged — filing a return after
-- confirming receipt remains allowed (a later-discovered defect is a
-- distinct, legitimate case from the one this finding flagged).
--
-- Same signature, CREATE OR REPLACE — no grant reset.
-- =============================================================================

begin;

create or replace function public.confirm_order_received(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if v_order.buyer_id <> v_uid then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if v_order.order_status <> 'delivered' then
    raise exception 'Only a delivered order can be confirmed received.' using errcode = '22023';
  end if;
  if v_order.buyer_confirmed_received_at is not null then
    raise exception 'This order has already been confirmed received.' using errcode = '22023';
  end if;

  -- F-08: an open return request takes precedence over receipt confirmation.
  if exists (
    select 1 from public.return_requests
    where order_id = p_order_id and status in ('pending', 'seller_accepted')
  ) then
    raise exception 'This order has an open return request — it must be resolved before confirming receipt.'
      using errcode = '22023';
  end if;

  update public.orders
    set buyer_confirmed_received_at = now()
    where id = p_order_id
    returning * into v_order;

  return v_order;
end;
$$;

commit;
