-- Demo reviews become presenter-only.
--
-- Demo (sample) reviews carry no visible tag, so they must never reach ordinary
-- visitors of the public store. From now on:
--  * Public RLS no longer returns demo rows to anyone but admins.
--  * A secret presenter key lives in `demo_access` (admin-only table). A browser
--    that opened the presentation link carries that key in an http-only cookie;
--    the app passes it to `list_presenter_demo_reviews`, which returns demo rows
--    only when demo content is switched on AND the key matches.
--  * Admins create or replace the key with `admin_rotate_demo_key`.
-- Real reviews are unaffected.
--
-- Rollback (manual): drop the functions below, drop table public.demo_access,
-- and recreate the "reviews are publicly readable" policy from
-- 20261029000000_reviews_replies_moderation_demo.sql.

begin;

create table if not exists public.demo_access (
  id            boolean primary key default true check (id),
  presenter_key text not null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null
);

comment on table public.demo_access is
  'Single row: the secret key a presenter''s browser carries to see demo reviews. Admin-only.';

alter table public.demo_access enable row level security;
revoke all on public.demo_access from anon, authenticated;

drop policy if exists "admins read demo access" on public.demo_access;
create policy "admins read demo access"
  on public.demo_access for select
  to authenticated
  using (public.is_admin());

-- Public: real, non-hidden reviews only. Demo rows reach the storefront solely
-- through list_presenter_demo_reviews below.
drop policy if exists "reviews are publicly readable" on public.reviews;
create policy "reviews are publicly readable"
  on public.reviews for select
  to anon, authenticated
  using (
    (hidden_at is null and not is_demo)
    or public.is_admin()
    or (not is_demo and buyer_id = (select auth.uid()))
    or (
      not is_demo
      and exists (
        select 1 from public.products p
        where p.id = reviews.product_id
          and (p.seller_id = (select auth.uid()) or public.is_shop_member(p.shop_id))
      )
    )
  );

-- True when demo content is on and the key matches the current presenter key.
create or replace function public.demo_reviews_unlocked(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.demo_content_enabled()
      and p_key is not null
      and length(p_key) >= 16
      and exists (select 1 from public.demo_access d where d.presenter_key = p_key),
    false
  );
$$;

revoke all on function public.demo_reviews_unlocked(text) from public;
grant execute on function public.demo_reviews_unlocked(text) to anon, authenticated;

-- Demo reviews for a presenter's browser; empty for everyone else.
create or replace function public.list_presenter_demo_reviews(
  p_key text,
  p_product_ids uuid[] default null,
  p_limit integer default 2000
)
returns setof public.reviews
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.reviews r
  where public.demo_reviews_unlocked(p_key)
    and r.is_demo
    and r.hidden_at is null
    and (p_product_ids is null or r.product_id = any (p_product_ids))
  order by r.created_at desc
  limit greatest(least(coalesce(p_limit, 2000), 5000), 0);
$$;

revoke all on function public.list_presenter_demo_reviews(text, uuid[], integer) from public;
grant execute on function public.list_presenter_demo_reviews(text, uuid[], integer) to anon, authenticated;

-- Admin: create or replace the presenter key (old links stop working).
create or replace function public.admin_rotate_demo_key()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_key text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to manage demo content' using errcode = '42501';
  end if;

  insert into public.demo_access (id, presenter_key, updated_at, updated_by)
  values (true, v_key, now(), v_uid)
  on conflict (id) do update
    set presenter_key = excluded.presenter_key,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  insert into public.admin_action_log (actor_id, action, metadata)
  values (v_uid, 'rotate_demo_key', '{}'::jsonb);

  return v_key;
end;
$$;

revoke all on function public.admin_rotate_demo_key() from public;
grant execute on function public.admin_rotate_demo_key() to authenticated;

commit;
