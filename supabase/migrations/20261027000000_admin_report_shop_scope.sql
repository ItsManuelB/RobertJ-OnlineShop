-- =============================================================================
-- Admin reports: one shop-scoping rule + per-shop comparison reads.
--
-- 1. Scoping fix. The admin "Shop" filter used two different rules:
--      report_sales_summary / report_sales_timeseries / report_order_status_breakdown /
--      report_top_products   -> orders whose SELLER belongs to the shop (shop_users)
--      report_payment_source_summary / report_revenue_by_category
--                            -> orders whose shop_id equals the shop
--    shop_users is one-shop-per-seller, so moving or removing a seller changed one
--    set of figures and not the other, and a shop's Payment source total could stop
--    matching its Gross sales. All six now use report_order_shop(): the order's own
--    shop_id, falling back to its seller's shop only for legacy rows without one.
--    Seller-side scoping is unchanged. Signatures, return types and grants are unchanged.
--
-- 2. report_sales_by_shop (new, admin only): one row per shop plus an "Unassigned"
--    row when orders belong to no shop, so the rows add up to the All-shops figures.
--    Same cohort rules as report_sales_summary (orders placed in the Asia/Manila
--    range; gross/net/units over ever-paid orders; refunds capped at the order total).
--
-- 3. report_sales_timeseries_by_shop (new, admin only): per-shop net-sales trend.
--
-- No tables change; no data is changed. Safe to re-run.
-- ROLLBACK: drop function public.report_sales_by_shop(date, date);
--           drop function public.report_sales_timeseries_by_shop(date, date, text);
--           drop function public.report_order_shop(uuid, uuid);
--           then re-run the six functions from 20261022170000_refund_aware_sales_reports.sql,
--           20261023120000_units_sold_paid_orders_only.sql,
--           20260927134801_shop_member_order_rpc_stamping.sql (status breakdown) and
--           20261024000400_seller_report_accuracy.sql.
-- =============================================================================

begin;

create or replace function public.report_order_shop(p_order_shop_id uuid, p_order_seller_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_order_shop_id,
    (select su.shop_id from public.shop_users su where su.user_id = p_order_seller_id limit 1)
  );
$$;

revoke all on function public.report_order_shop(uuid, uuid) from public, anon, authenticated;

-- --- report_sales_summary ----------------------------------------------------
create or replace function public.report_sales_summary(p_from date, p_to date, p_shop_id uuid default null)
returns table(
  total_orders bigint,
  paid_orders bigint,
  cancelled_orders bigint,
  revenue_cents bigint,
  units_sold bigint,
  avg_order_value_cents bigint,
  cod_paid_orders bigint,
  qr_paid_orders bigint,
  xendit_paid_orders bigint,
  pending_payment_orders bigint,
  gross_revenue_cents bigint,
  refunds_cents bigint,
  refunded_orders bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean := public.is_admin();
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
    select
      o.id, o.total_cents, o.order_status, o.payment_status,
      (o.payment_status in ('paid', 'partially_refunded', 'refunded')) as was_paid,
      least(
        o.total_cents,
        coalesce((
          select sum(rr.refund_amount_cents)
          from public.return_requests rr
          where rr.order_id = o.id and rr.status = 'refunded'
        ), 0)
      )::bigint as refunded_cents
    from public.orders o
    where o.placed_at >= (p_from::timestamp at time zone 'Asia/Manila')
      and o.placed_at <  ((p_to + 1)::timestamp at time zone 'Asia/Manila')
      and case
            when v_is_admin then (
              p_shop_id is null
              or public.report_order_shop(o.shop_id, o.seller_id) = p_shop_id
            )
            else (
              (v_caller_shop_id is not null and o.shop_id = v_caller_shop_id)
              or (o.shop_id is null and o.seller_id = v_uid)
            )
          end
  ),
  agg as (
    select
      count(*)::bigint as total_orders,
      count(*) filter (where s.was_paid)::bigint as paid_orders,
      count(*) filter (where s.order_status = 'cancelled')::bigint as cancelled_orders,
      coalesce(sum(s.total_cents) filter (where s.was_paid), 0)::bigint as gross_revenue_cents,
      coalesce(sum(s.refunded_cents) filter (where s.was_paid), 0)::bigint as refunds_cents,
      coalesce(round(avg(s.total_cents) filter (where s.was_paid)), 0)::bigint as avg_order_value_cents,
      count(*) filter (where s.payment_status = 'pending')::bigint as pending_payment_orders,
      count(*) filter (where s.was_paid and s.refunded_cents > 0)::bigint as refunded_orders
    from scoped s
  ),
  units as (
    select coalesce(sum(oi.quantity), 0)::bigint as units_sold
    from public.order_items oi
    where oi.order_id in (select s.id from scoped s where s.was_paid)
  ),
  methods as (
    select
      count(*) filter (where m.method = 'cod')::bigint as cod_paid_orders,
      count(*) filter (where m.method = 'qr_upload')::bigint as qr_paid_orders,
      count(*) filter (where m.method = 'xendit')::bigint as xendit_paid_orders
    from (
      select coalesce(paid_pm.payment_method_type::text, 'cod') as method
      from scoped s
      left join lateral (
        select pm.payment_method_type
        from public.payments pm
        where pm.order_id = s.id
          and pm.status in ('paid', 'partially_refunded', 'refunded')
        order by pm.created_at desc
        limit 1
      ) paid_pm on true
      where s.was_paid
    ) m
  )
  select
    agg.total_orders,
    agg.paid_orders,
    agg.cancelled_orders,
    (agg.gross_revenue_cents - agg.refunds_cents)::bigint,
    units.units_sold,
    agg.avg_order_value_cents,
    methods.cod_paid_orders,
    methods.qr_paid_orders,
    methods.xendit_paid_orders,
    agg.pending_payment_orders,
    agg.gross_revenue_cents,
    agg.refunds_cents,
    agg.refunded_orders
  from agg, units, methods;
end;
$$;

revoke all on function public.report_sales_summary(date, date, uuid) from public, anon;
grant execute on function public.report_sales_summary(date, date, uuid) to authenticated, service_role;

-- --- report_sales_timeseries -------------------------------------------------
create or replace function public.report_sales_timeseries(
  p_from date, p_to date, p_granularity text default 'day', p_shop_id uuid default null
)
returns table(bucket date, order_count bigint, revenue_cents bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean := public.is_admin();
  v_caller_shop_id uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to view reports' using errcode = '42501';
  end if;
  if not (v_is_admin or public.current_user_role() = 'seller') then
    raise exception 'You do not have permission to view reports' using errcode = '42501';
  end if;
  if p_granularity not in ('day', 'week', 'month') then
    raise exception 'Invalid granularity' using errcode = '22023';
  end if;

  if not v_is_admin then
    select su.shop_id into v_caller_shop_id from public.shop_users su where su.user_id = v_uid;
  end if;

  return query
  with scoped as (
    select
      o.placed_at, o.total_cents,
      (o.payment_status in ('paid', 'partially_refunded', 'refunded')) as was_paid,
      least(
        o.total_cents,
        coalesce((
          select sum(rr.refund_amount_cents)
          from public.return_requests rr
          where rr.order_id = o.id and rr.status = 'refunded'
        ), 0)
      )::bigint as refunded_cents
    from public.orders o
    where o.placed_at >= (p_from::timestamp at time zone 'Asia/Manila')
      and o.placed_at <  ((p_to + 1)::timestamp at time zone 'Asia/Manila')
      and case
            when v_is_admin then (
              p_shop_id is null
              or public.report_order_shop(o.shop_id, o.seller_id) = p_shop_id
            )
            else (
              (v_caller_shop_id is not null and o.shop_id = v_caller_shop_id)
              or (o.shop_id is null and o.seller_id = v_uid)
            )
          end
  )
  select
    (date_trunc(p_granularity, (s.placed_at at time zone 'Asia/Manila')))::date as bucket,
    count(*)::bigint as order_count,
    coalesce(sum(s.total_cents - s.refunded_cents) filter (where s.was_paid), 0)::bigint as revenue_cents
  from scoped s
  group by 1
  order by 1;
end;
$$;

-- --- report_order_status_breakdown -------------------------------------------
create or replace function public.report_order_status_breakdown(
  p_from date,
  p_to date,
  p_shop_id uuid default null
)
returns table (
  status order_status,
  order_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean := public.is_admin();
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
  select o.order_status, count(*)::bigint
  from public.orders o
  where o.placed_at >= (p_from::timestamp at time zone 'Asia/Manila')
    and o.placed_at <  ((p_to + 1)::timestamp at time zone 'Asia/Manila')
    and case
          when v_is_admin then (
            p_shop_id is null
            or public.report_order_shop(o.shop_id, o.seller_id) = p_shop_id
          )
          else (
            (v_caller_shop_id is not null and o.shop_id = v_caller_shop_id)
            or (o.shop_id is null and o.seller_id = v_uid)
          )
        end
  group by o.order_status
  order by o.order_status;
end;
$$;

-- --- report_top_products -----------------------------------------------------
create or replace function public.report_top_products(p_from date, p_to date, p_limit integer default 5, p_shop_id uuid default null)
returns table(product_id uuid, product_title text, units_sold bigint, revenue_cents bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean := public.is_admin();
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
  select
    oi.product_id,
    max(oi.product_title) as product_title,
    sum(oi.quantity)::bigint as units_sold,
    coalesce(sum(oi.subtotal_cents), 0)::bigint as revenue_cents
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.payment_status in ('paid', 'partially_refunded', 'refunded')
    and o.placed_at >= (p_from::timestamp at time zone 'Asia/Manila')
    and o.placed_at <  ((p_to + 1)::timestamp at time zone 'Asia/Manila')
    and case
          when v_is_admin then (
            p_shop_id is null
            or public.report_order_shop(o.shop_id, o.seller_id) = p_shop_id
          )
          else (
            (v_caller_shop_id is not null and o.shop_id = v_caller_shop_id)
            or (o.shop_id is null and o.seller_id = v_uid)
          )
        end
  group by oi.product_id
  order by units_sold desc, revenue_cents desc
  limit greatest(coalesce(p_limit, 5), 0);
end;
$$;

revoke all on function public.report_top_products(date, date, integer, uuid) from public, anon;
grant execute on function public.report_top_products(date, date, integer, uuid) to authenticated;

-- --- report_payment_source_summary -------------------------------------------
create or replace function public.report_payment_source_summary(p_from date, p_to date, p_shop_id uuid default null)
returns table(source_key text, order_count bigint, amount_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean := public.is_admin();
begin
  if v_uid is null then
    raise exception 'You must be signed in to view reports' using errcode = '42501';
  end if;
  if not (v_is_admin or public.current_user_role() = 'seller') then
    raise exception 'You do not have permission to view reports' using errcode = '42501';
  end if;

  return query
  with scoped as (
    select o.id, o.total_cents, o.payment_method::text as order_payment_method
    from public.orders o
    where o.payment_status in ('paid', 'partially_refunded', 'refunded')
      and o.placed_at >= (p_from::timestamp at time zone 'Asia/Manila')
      and o.placed_at < ((p_to + 1)::timestamp at time zone 'Asia/Manila')
      and case
        when v_is_admin then (
          p_shop_id is null
          or public.report_order_shop(o.shop_id, o.seller_id) = p_shop_id
        )
        else public.can_manage_shop_resource(o.shop_id, o.seller_id)
      end
  ),
  classified as (
    select
      s.total_cents,
      case
        when coalesce(paid_pm.payment_method_type::text, s.order_payment_method) = 'cod'
          then 'cod'
        when paid_pm.payment_method_type::text = 'xendit' then
          case upper(btrim(coalesce(paid_pm.payment_channel, '')))
            when 'GCASH' then 'gcash'
            when 'PAYMAYA' then 'paymaya'
            when 'MAYA' then 'paymaya'
            when 'CARD' then 'xendit_card'
            when '' then 'online_unrecorded'
            else 'online_other'
          end
        when coalesce(paid_pm.payment_method_type::text, s.order_payment_method) = 'qr_upload'
          then 'qr_upload_legacy'
        when coalesce(paid_pm.payment_method_type::text, s.order_payment_method) = 'card'
          then 'card_legacy'
        when coalesce(paid_pm.payment_method_type::text, s.order_payment_method) = 'xendit'
          then 'online_unrecorded'
        when coalesce(paid_pm.payment_method_type::text, s.order_payment_method) is null
          then 'not_recorded'
        else 'other'
      end as source_key
    from scoped s
    left join lateral (
      select pm.payment_method_type, pm.payment_channel
      from public.payments pm
      where pm.order_id = s.id
        and pm.status in ('paid', 'partially_refunded', 'refunded')
      order by pm.created_at desc
      limit 1
    ) paid_pm on true
  )
  select
    c.source_key,
    count(*)::bigint,
    coalesce(sum(c.total_cents), 0)::bigint
  from classified c
  group by c.source_key
  order by c.source_key;
end;
$$;

revoke all on function public.report_payment_source_summary(date, date, uuid) from public, anon;
grant execute on function public.report_payment_source_summary(date, date, uuid) to authenticated;

-- --- report_revenue_by_category ----------------------------------------------
create or replace function public.report_revenue_by_category(p_from date, p_to date, p_shop_id uuid default null)
returns table(category_id uuid, category_name text, units_sold bigint, revenue_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean := public.is_admin();
begin
  if v_uid is null then
    raise exception 'You must be signed in to view reports' using errcode = '42501';
  end if;
  if not (v_is_admin or public.current_user_role() = 'seller') then
    raise exception 'You do not have permission to view reports' using errcode = '42501';
  end if;

  return query
  select
    c.id as category_id,
    coalesce(c.name, 'Uncategorized') as category_name,
    sum(oi.quantity)::bigint as units_sold,
    coalesce(sum(oi.subtotal_cents), 0)::bigint as revenue_cents
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  left join public.products p on p.id = oi.product_id
  left join public.categories c on c.id = p.category_id
  where o.payment_status in ('paid', 'partially_refunded', 'refunded')
    and o.placed_at >= (p_from::timestamp at time zone 'Asia/Manila')
    and o.placed_at <  ((p_to + 1)::timestamp at time zone 'Asia/Manila')
    and case
      when v_is_admin then (
        p_shop_id is null
        or public.report_order_shop(o.shop_id, o.seller_id) = p_shop_id
      )
      else public.can_manage_shop_resource(o.shop_id, o.seller_id)
    end
  group by c.id, coalesce(c.name, 'Uncategorized')
  order by revenue_cents desc, category_name;
end;
$$;

revoke all on function public.report_revenue_by_category(date, date, uuid) from public, anon;
grant execute on function public.report_revenue_by_category(date, date, uuid) to authenticated;

-- --- report_sales_by_shop (new) ----------------------------------------------
create or replace function public.report_sales_by_shop(p_from date, p_to date)
returns table(
  shop_id uuid,
  shop_name text,
  total_orders bigint,
  paid_orders bigint,
  cancelled_orders bigint,
  gross_revenue_cents bigint,
  refunds_cents bigint,
  revenue_cents bigint,
  avg_order_value_cents bigint,
  units_sold bigint,
  refunded_orders bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in to view reports' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Only administrators can compare shops' using errcode = '42501';
  end if;

  return query
  with scoped as (
    select
      o.id,
      public.report_order_shop(o.shop_id, o.seller_id) as shop_key,
      o.total_cents,
      o.order_status,
      (o.payment_status in ('paid', 'partially_refunded', 'refunded')) as was_paid,
      least(
        o.total_cents,
        coalesce((
          select sum(rr.refund_amount_cents)
          from public.return_requests rr
          where rr.order_id = o.id and rr.status = 'refunded'
        ), 0)
      )::bigint as refunded_cents
    from public.orders o
    where o.placed_at >= (p_from::timestamp at time zone 'Asia/Manila')
      and o.placed_at <  ((p_to + 1)::timestamp at time zone 'Asia/Manila')
  ),
  item_units as (
    select oi.order_id, sum(oi.quantity)::bigint as qty
    from public.order_items oi
    where oi.order_id in (select s.id from scoped s where s.was_paid)
    group by oi.order_id
  ),
  agg as (
    select
      s.shop_key,
      count(*)::bigint as total_orders,
      count(*) filter (where s.was_paid)::bigint as paid_orders,
      count(*) filter (where s.order_status = 'cancelled')::bigint as cancelled_orders,
      coalesce(sum(s.total_cents) filter (where s.was_paid), 0)::bigint as gross_cents,
      coalesce(sum(s.refunded_cents) filter (where s.was_paid), 0)::bigint as refund_cents,
      coalesce(round(avg(s.total_cents) filter (where s.was_paid)), 0)::bigint as aov_cents,
      coalesce(sum(iu.qty), 0)::bigint as units,
      count(*) filter (where s.was_paid and s.refunded_cents > 0)::bigint as refunded_count
    from scoped s
    left join item_units iu on iu.order_id = s.id
    group by s.shop_key
  ),
  combined as (
    select
      sh.id as c_shop_id,
      sh.name::text as c_shop_name,
      coalesce(a.total_orders, 0)::bigint as c_total,
      coalesce(a.paid_orders, 0)::bigint as c_paid,
      coalesce(a.cancelled_orders, 0)::bigint as c_cancelled,
      coalesce(a.gross_cents, 0)::bigint as c_gross,
      coalesce(a.refund_cents, 0)::bigint as c_refunds,
      coalesce(a.aov_cents, 0)::bigint as c_aov,
      coalesce(a.units, 0)::bigint as c_units,
      coalesce(a.refunded_count, 0)::bigint as c_refunded
    from public.shops sh
    left join agg a on a.shop_key = sh.id
    union all
    select
      null::uuid, 'Unassigned'::text,
      a.total_orders, a.paid_orders, a.cancelled_orders,
      a.gross_cents, a.refund_cents, a.aov_cents, a.units, a.refunded_count
    from agg a
    where a.shop_key is null
  )
  select
    x.c_shop_id,
    x.c_shop_name,
    x.c_total,
    x.c_paid,
    x.c_cancelled,
    x.c_gross,
    x.c_refunds,
    (x.c_gross - x.c_refunds)::bigint,
    x.c_aov,
    x.c_units,
    x.c_refunded
  from combined x
  order by (x.c_gross - x.c_refunds) desc, x.c_shop_name;
end;
$$;

revoke all on function public.report_sales_by_shop(date, date) from public, anon;
grant execute on function public.report_sales_by_shop(date, date) to authenticated;

-- --- report_sales_timeseries_by_shop (new) -----------------------------------
create or replace function public.report_sales_timeseries_by_shop(
  p_from date, p_to date, p_granularity text default 'day'
)
returns table(shop_id uuid, bucket date, order_count bigint, revenue_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in to view reports' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Only administrators can compare shops' using errcode = '42501';
  end if;
  if p_granularity not in ('day', 'week', 'month') then
    raise exception 'Invalid granularity' using errcode = '22023';
  end if;

  return query
  with scoped as (
    select
      public.report_order_shop(o.shop_id, o.seller_id) as shop_key,
      o.placed_at, o.total_cents,
      (o.payment_status in ('paid', 'partially_refunded', 'refunded')) as was_paid,
      least(
        o.total_cents,
        coalesce((
          select sum(rr.refund_amount_cents)
          from public.return_requests rr
          where rr.order_id = o.id and rr.status = 'refunded'
        ), 0)
      )::bigint as refunded_cents
    from public.orders o
    where o.placed_at >= (p_from::timestamp at time zone 'Asia/Manila')
      and o.placed_at <  ((p_to + 1)::timestamp at time zone 'Asia/Manila')
  )
  select
    s.shop_key,
    (date_trunc(p_granularity, (s.placed_at at time zone 'Asia/Manila')))::date,
    count(*)::bigint,
    coalesce(sum(s.total_cents - s.refunded_cents) filter (where s.was_paid), 0)::bigint
  from scoped s
  group by 1, 2
  order by 1, 2;
end;
$$;

revoke all on function public.report_sales_timeseries_by_shop(date, date, text) from public, anon;
grant execute on function public.report_sales_timeseries_by_shop(date, date, text) to authenticated;

commit;
