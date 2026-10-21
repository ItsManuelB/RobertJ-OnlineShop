-- Aggregate settled order revenue by the customer's recorded payment source.
-- The latest successful payment attempt wins, matching Payments and Finance.
-- Amounts are gross order totals; this schema does not record provider fees.

begin;

create or replace function public.report_payment_source_summary(
  p_from date,
  p_to date,
  p_shop_id uuid default null
)
returns table (
  source_key text,
  order_count bigint,
  amount_cents bigint
)
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
    where o.payment_status = 'paid'
      and o.placed_at >= (p_from::timestamp at time zone 'Asia/Manila')
      and o.placed_at < ((p_to + 1)::timestamp at time zone 'Asia/Manila')
      and case
        when v_is_admin then (
          p_shop_id is null
          or o.seller_id in (
            select su.user_id from public.shop_users su where su.shop_id = p_shop_id
          )
        )
        else o.seller_id = v_uid
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
        and pm.status = 'paid'
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

commit;
