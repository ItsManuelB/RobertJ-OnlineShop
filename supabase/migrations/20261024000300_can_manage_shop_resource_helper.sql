-- The deployed report_payment_source_summary (20261022080108) calls
-- public.can_manage_shop_resource, which only exists in
-- 20261022010000_shop_to_shop_access_isolation.sql. That migration was never
-- applied to the live database, so the Seller Reports payment-source panel failed
-- with "function public.can_manage_shop_resource(uuid, uuid) does not exist".
--
-- This adds just that helper (additive, no policy changes). It does not depend on
-- public.is_active_seller(), which is also missing live. Same rule as the original:
-- a shop-assigned row needs active shop membership; a legacy NULL-shop row is
-- reachable by its own seller only while that seller has no shop assignment.

begin;

create or replace function public.can_manage_shop_resource(
  p_shop_id uuid,
  p_seller_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when (select auth.uid()) is null then false
    when not exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'seller'::public.user_role
        and p.is_active
    ) then false
    when p_shop_id is not null then public.is_shop_member(p_shop_id)
    else p_seller_id = (select auth.uid())
      and not exists (
        select 1 from public.shop_users su
        where su.user_id = (select auth.uid())
      )
  end;
$function$;

revoke all on function public.can_manage_shop_resource(uuid, uuid) from public;
grant execute on function public.can_manage_shop_resource(uuid, uuid) to anon, authenticated;

comment on function public.can_manage_shop_resource(uuid, uuid) is
  'Seller authorization: active direct membership is required when shop_id is set; a NULL-shop legacy row is accessible by its active seller only while that seller has no shop assignment.';

commit;
