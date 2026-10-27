-- Reviews: seller replies, buyer edits, admin moderation, and a separate demo set.
--
-- Additive. Existing verified-purchase reviews are unchanged; `submit_review`
-- keeps working as before and still only accepts the buyer of a delivered order.
--
--  * Demo reviews (`is_demo`) exist only for presentations. They have no order
--    and no buyer behind them, so they never touch sales, stock or "sold"
--    counts. The app never marks them "Verified purchase" or sends them to
--    search engines, and they are shown only while
--    `platform_settings.demo_content_enabled` is on. An admin can delete them all
--    in one call.
--  * Hidden reviews (`hidden_at`) are removed from public view and from the
--    average by an admin, with a reason. Nothing is deleted.
--  * One seller reply per review (`seller_reply`), editable by the shop.
--  * A buyer may edit their own review for 30 days (`updated_at` marks it edited).
--  * `variant_label` snapshots what was bought ("Black / M"), so the public can
--    see it without reading order_items (which only the buyer and shop may).
--    `submit_review` now fills it; the existing real reviews are backfilled.
--
-- Rollback (manual):
--   drop function if exists public.update_review(uuid, smallint, text);
--   drop function if exists public.reply_to_review(uuid, text);
--   drop function if exists public.admin_set_review_hidden(uuid, boolean, text);
--   drop function if exists public.admin_set_demo_content(boolean);
--   drop function if exists public.admin_delete_demo_reviews();
--   drop function if exists public.demo_content_enabled();
--   (and restore submit_review from 20260822000000_reviews.sql)
--   delete from public.reviews where is_demo;
--   alter table public.reviews drop column is_demo, drop column variant_label,
--     drop column updated_at, drop column seller_reply, drop column seller_replied_at,
--     drop column hidden_at, drop column hidden_reason;
--   alter table public.reviews alter column order_item_id set not null, alter column buyer_id set not null;
--   alter table public.platform_settings drop column demo_content_enabled;
--   (and restore the original "reviews are publicly readable" policy: using (true))

begin;

-- 1. Columns -----------------------------------------------------------------

alter table public.reviews add column if not exists is_demo boolean not null default false;
alter table public.reviews add column if not exists variant_label text;
alter table public.reviews add column if not exists updated_at timestamptz;
alter table public.reviews add column if not exists seller_reply text;
alter table public.reviews add column if not exists seller_replied_at timestamptz;
alter table public.reviews add column if not exists hidden_at timestamptz;
alter table public.reviews add column if not exists hidden_reason text;

-- A demo review has no order and no buyer; a real one always has both.
alter table public.reviews alter column order_item_id drop not null;
alter table public.reviews alter column buyer_id drop not null;

alter table public.reviews drop constraint if exists reviews_demo_shape;
alter table public.reviews add constraint reviews_demo_shape check (
  (is_demo and order_item_id is null and buyer_id is null)
  or (not is_demo and order_item_id is not null and buyer_id is not null)
);
alter table public.reviews drop constraint if exists reviews_seller_reply_length;
alter table public.reviews add constraint reviews_seller_reply_length
  check (seller_reply is null or char_length(seller_reply) <= 1000);
alter table public.reviews drop constraint if exists reviews_hidden_reason_length;
alter table public.reviews add constraint reviews_hidden_reason_length
  check (hidden_reason is null or char_length(hidden_reason) <= 300);
alter table public.reviews drop constraint if exists reviews_variant_label_length;
alter table public.reviews add constraint reviews_variant_label_length
  check (variant_label is null or char_length(variant_label) <= 120);

create index if not exists reviews_is_demo_idx on public.reviews (product_id) where is_demo;

alter table public.platform_settings
  add column if not exists demo_content_enabled boolean not null default false;

-- 2. Visibility --------------------------------------------------------------

create or replace function public.demo_content_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.demo_content_enabled from public.platform_settings s limit 1), false);
$$;

revoke all on function public.demo_content_enabled() from public;
grant execute on function public.demo_content_enabled() to anon, authenticated;

-- Public: visible, non-hidden reviews (demo ones only while demo content is on).
-- The author and the product's shop also see their own real reviews when hidden,
-- so a hidden review never silently disappears for them. Admin sees everything.
drop policy if exists "reviews are publicly readable" on public.reviews;
create policy "reviews are publicly readable"
  on public.reviews for select
  to anon, authenticated
  using (
    (hidden_at is null and (not is_demo or public.demo_content_enabled()))
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

-- 3. Buyer edits their own review (30 days) ------------------------------------

create or replace function public.update_review(
  p_review_id uuid,
  p_rating smallint,
  p_comment text
)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_review public.reviews;
begin
  if v_uid is null then
    raise exception 'You must be signed in to edit a review' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;
  if p_comment is not null and char_length(p_comment) > 1000 then
    raise exception 'Review is too long' using errcode = '22023';
  end if;

  select * into v_review from public.reviews where id = p_review_id for update;
  if not found or v_review.is_demo or v_review.buyer_id is distinct from v_uid then
    raise exception 'You do not have permission to edit this review' using errcode = '42501';
  end if;
  if v_review.hidden_at is not null then
    raise exception 'This review was hidden by an administrator and can no longer be edited'
      using errcode = '22023';
  end if;
  if v_review.created_at < now() - interval '30 days' then
    raise exception 'Reviews can only be edited within 30 days' using errcode = '22023';
  end if;

  update public.reviews
  set rating = p_rating,
      comment = nullif(trim(p_comment), ''),
      updated_at = now()
  where id = p_review_id
  returning * into v_review;

  return v_review;
end;
$$;

revoke all on function public.update_review(uuid, smallint, text) from public;
grant execute on function public.update_review(uuid, smallint, text) to authenticated;

-- 4. Seller reply (one per review, editable) ----------------------------------

create or replace function public.reply_to_review(
  p_review_id uuid,
  p_reply text
)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_review public.reviews;
  v_reply text := nullif(trim(p_reply), '');
begin
  if v_uid is null then
    raise exception 'You must be signed in to reply' using errcode = '42501';
  end if;
  if v_reply is null then
    raise exception 'Write a reply first' using errcode = '22023';
  end if;
  if char_length(v_reply) > 1000 then
    raise exception 'Reply is too long' using errcode = '22023';
  end if;

  select * into v_review from public.reviews where id = p_review_id for update;
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  if v_review.is_demo then
    raise exception 'Sample reviews cannot be replied to' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.products p
    where p.id = v_review.product_id
      and (p.seller_id = v_uid or public.is_shop_member(p.shop_id))
  ) then
    raise exception 'You can only reply to reviews of your own shop''s products' using errcode = '42501';
  end if;

  update public.reviews
  set seller_reply = v_reply,
      seller_replied_at = now()
  where id = p_review_id
  returning * into v_review;

  return v_review;
end;
$$;

revoke all on function public.reply_to_review(uuid, text) from public;
grant execute on function public.reply_to_review(uuid, text) to authenticated;

-- 5. Admin: hide / show a review ----------------------------------------------

create or replace function public.admin_set_review_hidden(
  p_review_id uuid,
  p_hidden boolean,
  p_reason text
)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_review public.reviews;
  v_reason text := nullif(trim(p_reason), '');
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to moderate reviews' using errcode = '42501';
  end if;
  if p_hidden and v_reason is null then
    raise exception 'Give a reason for hiding this review' using errcode = '22023';
  end if;
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'Reason is too long' using errcode = '22023';
  end if;

  update public.reviews
  set hidden_at = case when p_hidden then now() else null end,
      hidden_reason = case when p_hidden then v_reason else null end
  where id = p_review_id
  returning * into v_review;
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;

  insert into public.admin_action_log (actor_id, action, metadata)
  values (
    v_uid,
    case when p_hidden then 'hide_review' else 'unhide_review' end,
    jsonb_build_object('review_id', p_review_id, 'product_id', v_review.product_id, 'reason', v_reason)
  );

  return v_review;
end;
$$;

revoke all on function public.admin_set_review_hidden(uuid, boolean, text) from public;
grant execute on function public.admin_set_review_hidden(uuid, boolean, text) to authenticated;

-- 6. Admin: demo content switch and removal ----------------------------------

create or replace function public.admin_set_demo_content(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to change platform settings' using errcode = '42501';
  end if;

  update public.platform_settings
  set demo_content_enabled = coalesce(p_enabled, false),
      updated_at = now(),
      updated_by = v_uid
  where id;

  insert into public.admin_action_log (actor_id, action, metadata)
  values (v_uid, 'set_demo_content', jsonb_build_object('enabled', coalesce(p_enabled, false)));

  return coalesce(p_enabled, false);
end;
$$;

revoke all on function public.admin_set_demo_content(boolean) from public;
grant execute on function public.admin_set_demo_content(boolean) to authenticated;

create or replace function public.admin_delete_demo_reviews()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to remove demo content' using errcode = '42501';
  end if;

  delete from public.reviews where is_demo;
  get diagnostics v_count = row_count;

  update public.platform_settings
  set demo_content_enabled = false,
      updated_at = now(),
      updated_by = v_uid
  where id;

  insert into public.admin_action_log (actor_id, action, metadata)
  values (v_uid, 'delete_demo_reviews', jsonb_build_object('deleted', v_count));

  return v_count;
end;
$$;

revoke all on function public.admin_delete_demo_reviews() from public;
grant execute on function public.admin_delete_demo_reviews() to authenticated;

-- 7. submit_review also snapshots what was bought -----------------------------
-- Same checks as 20260822000000_reviews.sql; only `variant_label` is new.

create or replace function public.submit_review(
  p_order_item_id uuid,
  p_rating smallint,
  p_comment text
)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_order_item public.order_items;
  v_order public.orders;
  v_profile public.profiles;
  v_review public.reviews;
begin
  if v_uid is null then
    raise exception 'You must be signed in to write a review' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;
  if p_comment is not null and char_length(p_comment) > 1000 then
    raise exception 'Review is too long' using errcode = '22023';
  end if;

  select * into v_order_item from public.order_items where id = p_order_item_id;
  if not found then
    raise exception 'Order item not found' using errcode = 'P0002';
  end if;
  select * into v_order from public.orders where id = v_order_item.order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.buyer_id <> v_uid then
    raise exception 'You do not have permission to review this item' using errcode = '42501';
  end if;
  if v_order.order_status <> 'delivered' then
    raise exception 'You can only review items from delivered orders' using errcode = '22023';
  end if;
  if exists (select 1 from public.reviews where order_item_id = p_order_item_id) then
    raise exception 'You have already reviewed this item' using errcode = '23505';
  end if;

  select * into v_profile from public.profiles where id = v_uid;

  insert into public.reviews (
    order_item_id, product_id, buyer_id, reviewer_display_name, rating, comment, variant_label
  )
  values (
    p_order_item_id,
    v_order_item.product_id,
    v_uid,
    coalesce(v_profile.full_name, v_profile.username, 'RobertJ Customer'),
    p_rating,
    nullif(trim(p_comment), ''),
    left(nullif(trim(v_order_item.variant_label), ''), 120)
  )
  returning * into v_review;

  return v_review;
end;
$$;

revoke all on function public.submit_review(uuid, smallint, text) from public;
grant execute on function public.submit_review(uuid, smallint, text) to authenticated;

update public.reviews r
set variant_label = left(nullif(trim(oi.variant_label), ''), 120)
from public.order_items oi
where oi.id = r.order_item_id
  and r.variant_label is null;

comment on column public.reviews.is_demo is
  'Presentation-only sample review: no order or buyer, never "verified", shown only while platform_settings.demo_content_enabled is on.';

commit;
