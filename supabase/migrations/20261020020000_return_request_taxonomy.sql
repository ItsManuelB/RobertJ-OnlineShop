-- =============================================================================
-- Fulfillment/returns audit:
--  * Finding A1/A3: a buyer could not report "I never received this" until
--    the order was already marked `delivered` -- self-contradictory for the
--    one case it's meant to cover. `request_return` now also accepts a
--    `shipped` order, but ONLY when the reason is `item_not_received`, and
--    only once a short grace period has passed since `shipped_at` (so a
--    courier running a day or two late doesn't immediately trigger a
--    dispute). Every other reason still requires `delivered` (or a paid
--    cancellation), unchanged -- you can't claim "wrong item"/"damaged"
--    before anything has actually arrived.
--  * Finding B3: the buyer's reason was a single opaque free-text column,
--    composed client-side from a checkbox list -- no structured value an
--    admin could report on, and no server-side authorship of the text.
--    Adds `reason_code` (closed set) and `request_type` (the buyer's
--    requested resolution -- money refund / return-and-refund /
--    replacement; `decide_return`'s actual decision, added in a later
--    migration, is independent of this and has the final say). The server
--    now authors the canonical `reason` text itself from `reason_code` (a
--    fixed label, or the buyer's own trimmed/length-checked explanation for
--    `other`) -- it no longer trusts a client-composed string.
--
-- Both new types are brand new (not a value added to an existing type), so
-- -- unlike `return_status` in a later migration -- they're safe to create
-- and reference from a function body in this same transaction.
--
-- Additive only: `reason`/`evidence_path`/`p_reason`/`p_evidence_path` are
-- all unchanged in shape; `p_reason` is still accepted for signature
-- stability but its content is no longer trusted (kept null by the current,
-- updated caller).
--
-- ROLLBACK:
--   -- restore request_return's previous body from
--   -- 20261011174440_return_request_eligibility_window.sql
--   alter table public.return_requests drop column reason_code, drop column request_type;
--   drop type public.return_reason_code;
--   drop type public.return_request_type;
-- =============================================================================

begin;

do $$ begin
  create type public.return_reason_code as enum (
    'damaged_item', 'defective_item', 'wrong_item', 'missing_item', 'item_not_received', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.return_request_type as enum (
    'money_refund', 'return_and_refund', 'replacement_exchange'
  );
exception when duplicate_object then null; end $$;

alter table public.return_requests
  add column if not exists reason_code public.return_reason_code not null default 'other',
  add column if not exists request_type public.return_request_type not null default 'money_refund';

-- Grace period before a `shipped` order can be reported as not-received —
-- a standalone constant so it only has one place to change.
comment on column public.return_requests.reason_code is
  'Structured reason the buyer selected. Drives both the server-authored reason text and the shipped-order non-delivery carve-out below.';
comment on column public.return_requests.request_type is
  'The resolution the BUYER asked for (money refund / return-and-refund / replacement). Independent of what the seller/admin actually decides.';

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
    if char_length(p_explanation) > 500 then
      raise exception 'Explanation is too long' using errcode = '22023';
    end if;
    v_reason := trim(p_explanation);
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
    -- shipped + item_not_received: no outer deadline (the order hasn't
    -- resolved yet), but a short grace period so a courier running a day or
    -- two late doesn't itself read as a dispute.
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
