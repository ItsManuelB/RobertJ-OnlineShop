-- =============================================================================
-- Units sold counts paid orders only.
--
-- Before: report_sales_summary.units_sold summed order_items for EVERY order
-- placed in the range — unpaid, failed and cancelled ones included — while
-- gross/net revenue, paid_orders and avg_order_value only count orders that
-- were ever paid. The two figures disagreed on the same report.
--
-- After: units_sold uses the same was_paid rule (paid / partially_refunded /
-- refunded). Nothing else in the function changes; signature, return type
-- and grants are identical, so `create or replace` is enough and
-- database.types.ts does not change. No data is changed.
-- ROLLBACK: re-run report_sales_summary from 20261022170000_refund_aware_sales_reports.sql.
-- =============================================================================

begin;

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
              or o.seller_id in (
                select su.user_id from public.shop_users su where su.shop_id = p_shop_id
              )
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

commit;
