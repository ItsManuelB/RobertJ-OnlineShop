-- =============================================================================
-- Admin daily digest: a claim log so each admin gets at most one digest a day.
--
-- The sweep (every ~15 minutes) asks to CLAIM (date, admin) before sending, so
-- overlapping runs cannot send the same admin two digests, and a day's digest is
-- "handled" once claimed (a day with nothing late keeps the claim too, so the
-- sweep does not recompute the lateness query all day). A failed send releases
-- the claim so the next run retries. `digest_date` is the Philippine calendar
-- date, which the server computes; the database only stores it.
--
-- Service-role only. RLS on, no policies, no grants on the table.
-- ROLLBACK: drop the two functions and the table (nothing else depends on them).
-- =============================================================================

begin;

create table if not exists public.admin_digest_log (
  digest_date date not null,
  admin_id uuid not null references public.profiles (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (digest_date, admin_id)
);

alter table public.admin_digest_log enable row level security;
revoke all on table public.admin_digest_log from public, anon, authenticated;

create or replace function public.claim_admin_digest(p_date date, p_admin_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.admin_digest_log (digest_date, admin_id)
  values (p_date, p_admin_id)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.release_admin_digest(p_date date, p_admin_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.admin_digest_log
  where digest_date = p_date and admin_id = p_admin_id;
$$;

revoke all on function public.claim_admin_digest(date, uuid) from public, anon, authenticated;
revoke all on function public.release_admin_digest(date, uuid) from public, anon, authenticated;

grant execute on function public.claim_admin_digest(date, uuid) to service_role;
grant execute on function public.release_admin_digest(date, uuid) to service_role;

commit;
