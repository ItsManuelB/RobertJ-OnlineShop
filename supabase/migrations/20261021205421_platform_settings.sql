-- platform_settings: admin-editable storefront contact details (singleton row).
--
-- Scope is deliberately narrow: only values the app actually reads from this
-- table (footer support contact). Policy windows (return window, unpaid-order
-- expiry, ...) are still hardcoded inside their RPCs and are NOT configurable
-- here — see ARCHITECTURE.md Technical Debt Register.
--
-- Rollback:
--   drop function if exists public.admin_update_platform_settings(text, text);
--   drop table if exists public.platform_settings;

begin;

create table if not exists public.platform_settings (
  id             boolean primary key default true,
  support_email  text not null default 'support@roberj.example',
  support_phone  text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id) on delete set null,

  constraint platform_settings_singleton check (id),
  constraint platform_settings_support_email_format
    check (support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(support_email) <= 254),
  constraint platform_settings_support_phone_format
    check (support_phone is null or support_phone ~ '^\+?[0-9 ()-]{7,20}$')
);

comment on table public.platform_settings is
  'Singleton (id = true) of admin-editable storefront settings. Writes are RPC-only via admin_update_platform_settings.';

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

-- Contact details are shown in the public footer, so reads are open.
drop policy if exists "anyone reads platform settings" on public.platform_settings;
create policy "anyone reads platform settings"
  on public.platform_settings for select
  to anon, authenticated
  using (true);

-- No INSERT/UPDATE/DELETE policy: writes are RPC-only.
revoke all on public.platform_settings from anon, authenticated;
grant select (id, support_email, support_phone, updated_at) on public.platform_settings to anon, authenticated;

create or replace function public.admin_update_platform_settings(
  p_support_email text,
  p_support_phone text
)
returns public.platform_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_previous  public.platform_settings;
  v_result    public.platform_settings;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to change platform settings'
      using errcode = '42501';
  end if;

  select * into v_previous from public.platform_settings where id for update;

  update public.platform_settings
  set support_email = p_support_email,
      support_phone = nullif(btrim(p_support_phone), ''),
      updated_at    = now(),
      updated_by    = v_uid
  where id
  returning * into v_result;

  insert into public.admin_action_log (actor_id, action, metadata)
  values (
    v_uid, 'update_platform_settings',
    jsonb_build_object(
      'previous_support_email', v_previous.support_email,
      'new_support_email', v_result.support_email,
      'previous_support_phone', v_previous.support_phone,
      'new_support_phone', v_result.support_phone
    )
  );

  return v_result;
end;
$$;

comment on function public.admin_update_platform_settings is
  'Sole write path for platform_settings. Admin-only; logs every call to admin_action_log.';

revoke all on function public.admin_update_platform_settings(text, text) from public, anon;
grant execute on function public.admin_update_platform_settings(text, text) to authenticated;

commit;
