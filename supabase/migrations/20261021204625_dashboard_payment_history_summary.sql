-- Dashboard-wide payment summary, matching the Payments list filters while
-- remaining independent of table pagination. Runs as the caller so payments
-- row-level security continues to scope Seller/Admin results.

begin;

create or replace function public.dashboard_payment_history_summary(
  p_payment_source text default null,
  p_payment_method_type text default null,
  p_status text default null,
  p_search text default null,
  p_stale_only boolean default false
)
returns table (
  payment_count bigint,
  paid_count bigint,
  pending_count bigint,
  failed_count bigint,
  refunded_count bigint,
  paid_amount_cents bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in to view payments' using errcode = '42501';
  end if;
  if not ((select public.is_admin()) or (select public.current_user_role()) = 'seller') then
    raise exception 'You do not have permission to view payments' using errcode = '42501';
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where p.status::text = 'paid')::bigint,
    count(*) filter (where p.status::text = 'pending')::bigint,
    count(*) filter (where p.status::text = 'failed')::bigint,
    count(*) filter (where p.status::text in ('refunded', 'partially_refunded'))::bigint,
    coalesce(sum(p.amount_cents) filter (where p.status::text = 'paid'), 0)::bigint
  from public.payments p
  where (
      p_payment_source is null
      or case p_payment_source
        when 'cod' then p.payment_method_type::text = 'cod'
        when 'gcash' then p.payment_method_type::text = 'xendit'
          and upper(btrim(coalesce(p.payment_channel, ''))) = 'GCASH'
        when 'paymaya' then p.payment_method_type::text = 'xendit'
          and upper(btrim(coalesce(p.payment_channel, ''))) in ('PAYMAYA', 'MAYA')
        when 'xendit_card' then p.payment_method_type::text = 'xendit'
          and upper(btrim(coalesce(p.payment_channel, ''))) = 'CARD'
        else false
      end
    )
    and (
      p_payment_source is not null
      or p_payment_method_type is null
      or p.payment_method_type::text = p_payment_method_type
    )
    and (p_status is null or p.status::text = p_status)
    and (
      p_search is null
      or exists (
        select 1
        from public.orders o
        where o.id = p.order_id
          and o.order_number ilike '%' || regexp_replace(p_search, '[,()]', ' ', 'g') || '%'
      )
    )
    and (
      not coalesce(p_stale_only, false)
      or (
        p.payment_method_type::text = 'xendit'
        and p.status::text = 'pending'
        and p.xendit_payment_request_id is not null
        and p.created_at < now() - interval '30 minutes'
      )
    );
end;
$$;

revoke all on function public.dashboard_payment_history_summary(text, text, text, text, boolean) from public, anon;
grant execute on function public.dashboard_payment_history_summary(text, text, text, text, boolean) to authenticated;

commit;
