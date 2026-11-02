-- =============================================================================
-- Email suppression list: addresses that must not be emailed again.
--
-- Fed by Resend's webhook (`email.bounced` with a PERMANENT bounce, and
-- `email.complained`). The email senders look an address up here before every
-- send and skip it, so a dead mailbox is not retried forever and a person who
-- reported us as spam is left alone. A temporary bounce does NOT suppress: the
-- mailbox may recover.
--
-- Addresses are stored lowercased (the primary key), so a lookup does not depend
-- on how the address was typed. Service-role only: RLS is on, there are no
-- policies and no grants, and both functions are executable by service_role
-- alone. This table holds personal data (an email address), so it is never
-- readable from the browser.
-- ROLLBACK: drop the two functions and the table (nothing else depends on them).
-- =============================================================================

begin;

create table if not exists public.email_suppressions (
  email text primary key check (email = lower(email)),
  reason text not null check (reason in ('bounced', 'complained')),
  detail text,
  first_event_at timestamptz not null default now(),
  last_event_at timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;
revoke all on table public.email_suppressions from public, anon, authenticated;

-- Idempotent: Resend (via Svix) retries deliveries, so the same event can arrive twice.
create or replace function public.record_email_suppression(
  p_email text,
  p_reason text,
  p_detail text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.email_suppressions (email, reason, detail)
  values (lower(btrim(p_email)), p_reason, left(p_detail, 500))
  on conflict (email) do update
    set last_event_at = now(),
        -- A complaint outranks a bounce: it is the stronger signal not to write again.
        reason = case when excluded.reason = 'complained' then 'complained' else public.email_suppressions.reason end,
        detail = coalesce(excluded.detail, public.email_suppressions.detail);
$$;

create or replace function public.is_email_suppressed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.email_suppressions where email = lower(btrim(p_email))
  );
$$;

revoke all on function public.record_email_suppression(text, text, text) from public, anon, authenticated;
revoke all on function public.is_email_suppressed(text) from public, anon, authenticated;

grant execute on function public.record_email_suppression(text, text, text) to service_role;
grant execute on function public.is_email_suppressed(text) to service_role;

commit;
