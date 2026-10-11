-- =============================================================================
-- VERSION ORDERING NOTE: this file is dated 20260925050112 to match the live
-- applied version and, critically, to sort BEFORE the shop-scoping migrations
-- (20260927134519 / 134618 / 134801) that ALTER this table, widen its RLS, and
-- recreate record_order_shipment. Those files add `order_shipments.shop_id` and
-- the `is_shop_member` guards; if this creation file sorted after them (it was
-- previously mis-dated 20260928000000), a fresh `supabase db reset` would try
-- to alter a table that does not exist yet. Do not re-date this later than
-- 20260927134519. (Audit finding F-02.)
-- =============================================================================
-- Seller fulfillment: order_shipments — one lightweight tracking record per
-- seller order (never per checkout_group_id). Stores the manual courier +
-- tracking number captured at "Mark as shipped", plus a `packed_at` audit
-- timestamp recorded when the seller verifies items and moves an order from
-- To Pack (confirmed) -> Ready for Pickup (processing).
--
-- Design, deliberately narrow (capstone scope — no courier API, no courier
-- role, no ETA/GPS, no multi-parcel, no barcode/scanning):
--  * Separate table, NOT columns on `orders`: `orders`' UPDATE policy is
--    buyer-writable (buyer_id = auth.uid()) and `enforce_order_update_rules`
--    only guards enumerated columns, so a tracking column on `orders` would
--    be buyer-forgeable unless that sensitive financial/payment trigger were
--    extended. This table gets its own RLS and touches NEITHER `orders` RLS
--    NOR the trigger.
--  * `seller_id` is denormalized from the order at write time (same pattern as
--    `return_requests`/`inventory`/`stock_adjustments`) so write RLS can scope
--    with a direct column compare instead of a join.
--  * One row per order: `unique (order_id)`.
--  * Two write paths, both seller/admin-only, buyers read-only:
--      - `packed_at`: plain RLS-scoped upsert (advisory audit timestamp).
--      - courier + tracking + the `processing -> shipped` transition:
--        `record_order_shipment` RPC (SECURITY DEFINER), atomic. The RPC runs
--        with the caller's auth.uid(), so `enforce_order_update_rules`'s
--        "only the seller changes fulfilment status" rule passes unchanged.
--  * The order_status enum is NOT changed; inventory/payment behavior is NOT
--    touched.
--
-- ROLLBACK:
--   revoke execute on function public.record_order_shipment(uuid, text, text) from authenticated;
--   drop function public.record_order_shipment(uuid, text, text);
--   drop table public.order_shipments;
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- order_shipments
-- -----------------------------------------------------------------------------
create table if not exists public.order_shipments (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null unique references public.orders (id),
  seller_id        uuid not null references public.profiles (id),

  packed_at        timestamptz,
  courier          text,
  tracking_number  text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint order_shipments_courier_length
    check (courier is null or char_length(courier) between 1 and 80),
  constraint order_shipments_tracking_number_length
    check (tracking_number is null or char_length(tracking_number) between 1 and 120)
);

comment on table public.order_shipments is
  'One shipment/tracking record per seller order. Seller/admin write (packed_at via RLS upsert, courier+tracking via record_order_shipment RPC); buyer read-only. No courier API — manual entry only.';

-- `unique (order_id)` already indexes the primary access path
-- (getOrderShipment(orderId)); no seller-wide shipment screen exists in v1,
-- so no seller_id index is added.

create trigger order_shipments_set_updated_at
  before update on public.order_shipments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — participants read; seller/admin write; buyers never write.
-- -----------------------------------------------------------------------------
alter table public.order_shipments enable row level security;

create policy "participants read order shipments"
  on public.order_shipments for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.buyer_id = (select auth.uid())
          or o.seller_id = (select auth.uid())
          or public.is_admin()
        )
    )
  );

create policy "seller or admin insert own order shipment"
  on public.order_shipments for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      seller_id = (select auth.uid())
      and exists (
        select 1 from public.orders o
        where o.id = order_id and o.seller_id = (select auth.uid())
      )
    )
  );

create policy "seller or admin update own order shipment"
  on public.order_shipments for update
  to authenticated
  using (seller_id = (select auth.uid()) or public.is_admin())
  with check (seller_id = (select auth.uid()) or public.is_admin());

-- No DELETE policy: a fulfillment record is retained, never destroyed
-- (matches orders/payments financial-immutability convention).

grant select, insert, update on public.order_shipments to authenticated;
-- No delete grant — matches the absent DELETE policy above.

-- -----------------------------------------------------------------------------
-- RPC: record_order_shipment — seller (of the order) or admin only. Requires
-- the order to be in `processing` (Ready for Pickup), requires non-empty
-- courier + tracking, and atomically upserts the shipment AND flips
-- order_status to `shipped`. Mirrors advanceOrderStatus's unpaid-Xendit guard
-- so an unpaid online order can't be shipped.
-- -----------------------------------------------------------------------------
create or replace function public.record_order_shipment(
  p_order_id        uuid,
  p_courier         text,
  p_tracking_number text
)
returns public.order_shipments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_order    public.orders;
  v_shipment public.order_shipments;
begin
  if v_uid is null then
    raise exception 'You must be signed in to ship an order' using errcode = '42501';
  end if;

  if p_courier is null or char_length(trim(p_courier)) = 0 then
    raise exception 'A courier is required' using errcode = '22023';
  end if;
  if char_length(trim(p_courier)) > 80 then
    raise exception 'Courier name is too long' using errcode = '22023';
  end if;
  if p_tracking_number is null or char_length(trim(p_tracking_number)) = 0 then
    raise exception 'A tracking number is required' using errcode = '22023';
  end if;
  if char_length(trim(p_tracking_number)) > 120 then
    raise exception 'Tracking number is too long' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if not (public.is_admin() or v_order.seller_id = v_uid) then
    raise exception 'You do not have permission to ship this order' using errcode = '42501';
  end if;

  if v_order.order_status <> 'processing' then
    raise exception 'Only an order that is ready for pickup can be marked shipped'
      using errcode = '22023';
  end if;

  -- Same guard as advanceOrderStatus: a not-yet-paid online (Xendit) order
  -- cannot be moved forward until its payment succeeds. COD orders (which sit
  -- at pending until delivery) are unaffected.
  if v_order.payment_status <> 'paid' and exists (
    select 1 from public.payments
    where order_id = p_order_id and payment_method_type = 'xendit'
  ) then
    raise exception 'This order''s online payment hasn''t been completed yet. It can''t be shipped until the payment succeeds.'
      using errcode = '22023';
  end if;

  insert into public.order_shipments (order_id, seller_id, courier, tracking_number)
  values (p_order_id, v_order.seller_id, trim(p_courier), trim(p_tracking_number))
  on conflict (order_id) do update
    set courier = excluded.courier,
        tracking_number = excluded.tracking_number,
        updated_at = now()
  returning * into v_shipment;

  update public.orders
    set order_status = 'shipped'
    where id = p_order_id;

  return v_shipment;
end;
$$;

comment on function public.record_order_shipment is
  'Seller/admin only: atomically saves courier+tracking and advances a processing order to shipped. Requires processing status and a completed payment for Xendit orders.';

revoke all on function public.record_order_shipment(uuid, text, text) from public, anon;
grant execute on function public.record_order_shipment(uuid, text, text) to authenticated;

commit;
