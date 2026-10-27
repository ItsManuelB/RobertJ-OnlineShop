-- =============================================================================
-- Admin dashboard: service speed.
--
-- report_service_speed (new, admin only, read only): how long the marketplace
-- takes to ship an order and to decide a return, for work that started in the
-- Asia/Manila date range.
--   * Order to shipped: orders placed in the range that have a shipped_at.
--   * Return decided:   return requests filed in the range that have been decided
--                       (seller decision, or the admin's when the seller never answered).
-- There is no confirmed_at column, so "order to confirmed" is not measurable and
-- is deliberately not reported.
--
-- Averages are returned in seconds (null when there is nothing to average) with
-- the number of rows behind each one, so the UI can say "based on N orders".
-- No tables change; no data is changed. Safe to re-run.
-- ROLLBACK: drop function public.report_service_speed(date, date);
-- =============================================================================

begin;

create or replace function public.report_service_speed(p_from date, p_to date)
returns table(
  shipped_orders bigint,
  avg_ship_seconds bigint,
  decided_returns bigint,
  avg_return_decision_seconds bigint
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
    raise exception 'Only administrators can view service speed' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.orders o
      where o.shipped_at is not null
        and o.placed_at >= (p_from::timestamp at time zone 'Asia/Manila')
        and o.placed_at <  ((p_to + 1)::timestamp at time zone 'Asia/Manila'))::bigint,
    (select round(avg(extract(epoch from (o.shipped_at - o.placed_at))))::bigint from public.orders o
      where o.shipped_at is not null
        and o.placed_at >= (p_from::timestamp at time zone 'Asia/Manila')
        and o.placed_at <  ((p_to + 1)::timestamp at time zone 'Asia/Manila')),
    (select count(*) from public.return_requests rr
      where coalesce(rr.seller_decided_at, rr.admin_decided_at) is not null
        and rr.created_at >= (p_from::timestamp at time zone 'Asia/Manila')
        and rr.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Manila'))::bigint,
    (select round(avg(extract(epoch from (coalesce(rr.seller_decided_at, rr.admin_decided_at) - rr.created_at))))::bigint
      from public.return_requests rr
      where coalesce(rr.seller_decided_at, rr.admin_decided_at) is not null
        and rr.created_at >= (p_from::timestamp at time zone 'Asia/Manila')
        and rr.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Manila'));
end;
$$;

revoke all on function public.report_service_speed(date, date) from public, anon;
grant execute on function public.report_service_speed(date, date) to authenticated;

commit;
