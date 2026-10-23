-- =============================================================================
-- Report accuracy: top products, payment source, sales by category.
--
-- 1. report_top_products: units_sold summed order_items for EVERY order placed
--    in the range (unpaid, failed, cancelled included) while revenue_cents only
--    counted status 'paid'. Both now use the same "was paid" rule as
--    report_sales_summary: paid / partially_refunded / refunded. Signature,
--    return type and grants are unchanged.
-- 2. report_payment_source_summary: only counted status 'paid', so orders that
--    were later (partly) refunded dropped out and the total could not match
--    Gross sales. It now counts the same ever-paid orders. Signature unchanged.
-- 3. report_revenue_by_category (new): sales by category, scoped to the caller's
--    shop (same rule as report_payment_source_summary), Asia/Manila day
--    boundary, ever-paid orders. Replaces a client-side read that was neither
--    shop-scoped nor Manila-aware.
--
-- No tables change; no data is changed. Safe to re-run.
-- ROLLBACK: re-run report_top_products from 20260927134801_shop_member_order_rpc_stamping.sql,
-- report_payment_source_summary from 20261022080108_report_payment_source_shop_scope.sql,
-- and `drop function public.report_revenue_by_category(date, date, uuid);`.
-- =============================================================================

begin;

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
            or o.seller_id in (
              select su.user_id from public.shop_users su where su.shop_id = p_shop_id
            )
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
          or o.shop_id = p_shop_id
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
        or o.shop_id = p_shop_id
      )
      else public.can_manage_shop_resource(o.shop_id, o.seller_id)
    end
  group by c.id, coalesce(c.name, 'Uncategorized')
  order by revenue_cents desc, category_name;
end;
$$;

revoke all on function public.report_revenue_by_category(date, date, uuid) from public, anon;
grant execute on function public.report_revenue_by_category(date, date, uuid) to authenticated;

commit;
