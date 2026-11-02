-- =============================================================================
-- Seller Preferences (Seller Portal > Settings > Alerts).
--
-- `seller_preferences`: one row per seller holding which kinds of task they want
-- surfaced in the dashboard's "Needs your attention" cards and the topbar bell.
-- Same shape and posture as `buyer_preferences`: plain RLS, user-owned row, no
-- cross-entity invariant. A missing row means "all alerts on", so a first save
-- is a plain upsert.
--
-- ROLLBACK:
--   drop table public.seller_preferences;
-- =============================================================================

begin;

create table if not exists public.seller_preferences (
  user_id          uuid primary key references public.profiles (id) on delete cascade,

  alert_orders     boolean not null default true,
  alert_returns    boolean not null default true,
  alert_payments   boolean not null default true,
  alert_low_stock  boolean not null default true,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.seller_preferences is
  'One row per seller: which task alerts show on the dashboard and bell. A missing row means all on.';

drop trigger if exists seller_preferences_set_updated_at on public.seller_preferences;
create trigger seller_preferences_set_updated_at
  before update on public.seller_preferences
  for each row execute function public.set_updated_at();

alter table public.seller_preferences enable row level security;

drop policy if exists "users read their own seller preferences" on public.seller_preferences;
create policy "users read their own seller preferences"
  on public.seller_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users insert their own seller preferences" on public.seller_preferences;
create policy "users insert their own seller preferences"
  on public.seller_preferences for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "users update their own seller preferences" on public.seller_preferences;
create policy "users update their own seller preferences"
  on public.seller_preferences for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.seller_preferences from anon, authenticated;
grant select, insert, update on public.seller_preferences to authenticated;

commit;
