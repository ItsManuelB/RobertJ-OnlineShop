-- platform_settings: add business address and hours (shown in the storefront
-- footer) and extend the sole write RPC to take them.
--
-- Apply before deploying the matching app code: the app selects the new columns.
--
-- Rollback:
--   drop function if exists public.admin_update_platform_settings(text, text, text, text);
--   alter table public.platform_settings drop column if exists business_address, drop column if exists business_hours;
--   (then re-create the 2-argument function from 20261021205421_platform_settings.sql)

begin;

alter table public.platform_settings
  add column if not exists business_address text,
  add column if not exists business_hours   text;

alter table public.platform_settings
  drop constraint if exists platform_settings_business_address_length,
  drop constraint if exists platform_settings_business_hours_length;
alter table public.platform_settings
  add constraint platform_settings_business_address_length
    check (business_address is null or char_length(business_address) <= 300),
  add constraint platform_settings_business_hours_length
    check (business_hours is null or char_length(business_hours) <= 200);

-- Column-level SELECT grant (table-level privileges were revoked earlier).
grant select (business_address, business_hours) on public.platform_settings to anon, authenticated;

drop function if exists public.admin_update_platform_settings(text, text);

create or replace function public.admin_update_platform_settings(
  p_support_email    text,
  p_support_phone    text,
  p_business_address text,
  p_business_hours   text
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
  set support_email    = p_support_email,
      support_phone    = nullif(btrim(p_support_phone), ''),
      business_address = nullif(btrim(p_business_address), ''),
      business_hours   = nullif(btrim(p_business_hours), ''),
      updated_at       = now(),
      updated_by       = v_uid
  where id
  returning * into v_result;

  insert into public.admin_action_log (actor_id, action, metadata)
  values (
    v_uid, 'update_platform_settings',
    jsonb_build_object(
      'previous_support_email', v_previous.support_email,
      'new_support_email', v_result.support_email,
      'previous_support_phone', v_previous.support_phone,
      'new_support_phone', v_result.support_phone,
      'previous_business_address', v_previous.business_address,
      'new_business_address', v_result.business_address,
      'previous_business_hours', v_previous.business_hours,
      'new_business_hours', v_result.business_hours
    )
  );

  return v_result;
end;
$$;

comment on function public.admin_update_platform_settings is
  'Sole write path for platform_settings. Admin-only; logs every call to admin_action_log.';

revoke all on function public.admin_update_platform_settings(text, text, text, text) from public, anon;
grant execute on function public.admin_update_platform_settings(text, text, text, text) to authenticated;

commit;
