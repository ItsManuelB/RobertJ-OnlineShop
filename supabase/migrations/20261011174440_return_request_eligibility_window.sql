-- =============================================================================
-- Audit finding F-09 (Medium): `request_return` had no eligibility time
-- window — a return could be filed on an order delivered a year ago.
--
-- Fix: a 7-day window (RETURN_WINDOW_DAYS, src/features/returns/constants/
-- return.constants.ts — keep both in sync), measured from `delivered_at` for
-- the `delivered` path and from `cancelled_at` for the `cancelled AND
-- payment_status = 'paid'` path (that second path was just as unbounded and
-- is closed here too, for consistency — both are "the event that started the
-- clock" for their respective eligibility branch). A null anchor timestamp
-- (shouldn't happen given the status, but defensive) never blocks — only a
-- genuinely-expired window does.
--
-- Same signature, CREATE OR REPLACE — no grant reset.
-- =============================================================================

begin;

create or replace function public.request_return(
  p_order_id uuid,
  p_order_item_id uuid default null,
  p_reason text default null,
  p_evidence_path text default null
)
returns public.return_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_order   public.orders;
  v_request public.return_requests;
begin
  if v_uid is null then
    raise exception 'You must be signed in to request a return' using errcode = '42501';
  end if;

  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if char_length(p_reason) > 500 then
    raise exception 'Reason is too long' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.buyer_id <> v_uid then
    raise exception 'You do not have permission to request a return for this order'
      using errcode = '42501';
  end if;

  if not (
    v_order.order_status = 'delivered'
    or (v_order.order_status = 'cancelled' and v_order.payment_status = 'paid')
  ) then
    raise exception 'Only a delivered order, or a cancelled order that was already paid, can be returned'
      using errcode = '22023';
  end if;

  -- F-09: a 7-day return window, anchored to whichever event made this
  -- order eligible in the first place.
  if v_order.order_status = 'delivered' then
    if v_order.delivered_at is not null and now() > v_order.delivered_at + interval '7 days' then
      raise exception 'The return window for this order has closed.' using errcode = '22023';
    end if;
  else
    if v_order.cancelled_at is not null and now() > v_order.cancelled_at + interval '7 days' then
      raise exception 'The return window for this order has closed.' using errcode = '22023';
    end if;
  end if;

  if p_order_item_id is not null then
    if not exists (
      select 1 from public.order_items
      where id = p_order_item_id and order_id = p_order_id
    ) then
      raise exception 'This item does not belong to this order' using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1 from public.return_requests
    where order_id = p_order_id
      and coalesce(order_item_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(p_order_item_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and status in ('pending', 'seller_accepted')
  ) then
    raise exception 'A return request is already open for this order' using errcode = '23514';
  end if;

  insert into public.return_requests (
    order_id, order_item_id, buyer_id, seller_id, shop_id, reason, evidence_path
  )
  values (
    p_order_id, p_order_item_id, v_uid, v_order.seller_id, v_order.shop_id, trim(p_reason), p_evidence_path
  )
  returning * into v_request;

  return v_request;
end;
$$;

commit;
