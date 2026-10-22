-- Restrict platform settings to public reads and the admin-only RPC write path.

begin;

revoke all on public.platform_settings from anon, authenticated;
grant select (id, support_email, support_phone, updated_at) on public.platform_settings to anon, authenticated;

commit;
