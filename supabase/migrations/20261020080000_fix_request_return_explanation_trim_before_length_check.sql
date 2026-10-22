-- =============================================================================
-- Bug found during E2E testing (2026-10-20): request_return's "Other"
-- explanation length check compared the RAW, untrimmed string against 500
-- characters -- but the client's Zod schema (requestReturnSchema) trims
-- first, then checks .max(500) on the trimmed value. A submission the
-- client-side form considers valid (<=500 meaningful characters, with
-- incidental leading/trailing whitespace from a textarea) could be rejected
-- by the server with "Explanation is too long" even though the eventually-
-- stored, trimmed text was well under the limit.
--
-- Reproduced live (rolled-back, pre-fix): an explanation trimming to 498
-- characters (2 leading + 2 trailing spaces) was rejected as too long.
--
-- Fix: trim once, check the trimmed value's length, store that same
-- trimmed value -- no behavior change for the required-explanation check
-- (already correctly used trim) or for anything outside reason_code='other'.
--
-- ROLLBACK:
--   -- restore request_return's previous body from
--   -- 20261020020000_return_request_taxonomy.sql
-- =============================================================================

begin;

create or replace function public.request_return(
  p_order_id uuid,
  p_order_item_id uuid default null,
  p_reason text default null,
  p_evidence_path text default null,
  p_reason_code public.return_reason_code default 'other',
  p_request_type public.return_request_type default 'money_refund',
  p_explanation text default null
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
  v_reason  text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to request a return' using errcode = '42501';
  end if;

  if p_reason_code = 'other' then
    if p_explanation is null or char_length(trim(p_explanation)) = 0 then
      raise exception 'An explanation is required when selecting Other' using errcode = '22023';
    end if;
    v_reason := trim(p_explanation);
    if char_length(v_reason) > 500 then
      raise exception 'Explanation is too long' using errcode = '22023';
    end if;
  else
    v_reason := case p_reason_code
      when 'damaged_item' then 'Damaged item'
      when 'defective_item' then 'Defective item'
      when 'wrong_item' then 'Wrong item'
      when 'missing_item' then 'Missing item/parts'
      when 'item_not_received' then 'Item not received'
    end;
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
    or (v_order.order_status = 'shipped' and p_reason_code = 'item_not_received')
  ) then
    raise exception 'Only a delivered order, a cancelled order that was already paid, or a shipped order reported as not received, can be returned'
      using errcode = '22023';
  end if;

  if v_order.order_status = 'delivered' then
    if v_order.delivered_at is not null and now() > v_order.delivered_at + interval '7 days' then
      raise exception 'The return window for this order has closed.' using errcode = '22023';
    end if;
  elsif v_order.order_status = 'cancelled' then
    if v_order.cancelled_at is not null and now() > v_order.cancelled_at + interval '7 days' then
      raise exception 'The return window for this order has closed.' using errcode = '22023';
    end if;
  else
    if v_order.shipped_at is null or now() < v_order.shipped_at + interval '3 days' then
      raise exception 'Please wait a few more days before reporting this order as not received — it may still be in transit.'
        using errcode = '22023';
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
    order_id, order_item_id, buyer_id, seller_id, shop_id, reason, reason_code, request_type, evidence_path
  )
  values (
    p_order_id, p_order_item_id, v_uid, v_order.seller_id, v_order.shop_id,
    v_reason, p_reason_code, p_request_type, p_evidence_path
  )
  returning * into v_request;

  return v_request;
end;
$$;

commit;
