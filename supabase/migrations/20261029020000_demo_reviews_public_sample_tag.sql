-- Demo reviews go back to being public with a "Sample" tag.
--
-- Replaces the presenter-only setup from 20261029010000_demo_reviews_presenter_only.sql:
-- while Admin > Settings > Demo content is on, every visitor sees the demo reviews, each
-- tagged "Sample" by the app; when it is off, nobody but admins can read them. They still
-- never count as verified, never change sales or stock, and are never sent to search engines.
-- The presentation key, its table and its functions are removed.
--
-- Rollback (manual): re-run 20261029010000_demo_reviews_presenter_only.sql.

begin;

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

drop function if exists public.list_presenter_demo_reviews(text, uuid[], integer);
drop function if exists public.demo_reviews_unlocked(text);
drop function if exists public.admin_rotate_demo_key();
drop table if exists public.demo_access;

commit;
