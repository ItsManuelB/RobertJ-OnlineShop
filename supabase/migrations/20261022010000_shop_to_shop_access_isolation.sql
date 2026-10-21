-- Shop-to-shop isolation hardening.
-- Shop membership is authoritative for shop-assigned rows. seller_id is
-- attribution only for legacy rows whose shop_id is NULL; it never grants
-- access to a row assigned to a different shop.

begin;

create or replace function public.is_active_seller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'seller'::public.user_role
      and p.is_active
  );
$function$;

revoke all on function public.is_active_seller() from public;
grant execute on function public.is_active_seller() to anon, authenticated;

-- Membership is current, direct, and active. This deliberately does not
-- traverse other sellers, and it immediately blocks inactive sellers or
-- inactive shops even while a previously issued JWT remains valid.
create or replace function public.is_shop_member(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_shop_id is not null
    and public.is_active_seller()
    and exists (
      select 1
      from public.shop_users su
      join public.shops s on s.id = su.shop_id
      where su.shop_id = p_shop_id
        and su.user_id = (select auth.uid())
        and s.active
    );
$function$;

revoke all on function public.is_shop_member(uuid) from public;
grant execute on function public.is_shop_member(uuid) to anon, authenticated;

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
    when (select auth.uid()) is null or not public.is_active_seller() then false
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

-- Prevent a variant from claiming a different shop than its parent product,
-- including on INSERT (the existing shop transfer trigger covers UPDATE).
create or replace function public.enforce_product_variant_parent_shop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_parent_shop_id uuid;
begin
  select p.shop_id into v_parent_shop_id
  from public.products p
  where p.id = new.product_id;

  if not found then
    raise exception 'Product not found for variant' using errcode = '23503';
  end if;

  if new.shop_id is distinct from v_parent_shop_id then
    raise exception 'Variant shop must match its parent product shop'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_product_variant_parent_shop() from public, anon, authenticated;
drop trigger if exists product_variants_enforce_parent_shop on public.product_variants;
create trigger product_variants_enforce_parent_shop
  before insert or update of product_id, shop_id on public.product_variants
  for each row execute function public.enforce_product_variant_parent_shop();

-- Repair any old variant denormalization before enforcement is relied upon.
select set_config('app.product_shop_transfer_in_progress', 'true', true);
update public.product_variants v
set shop_id = p.shop_id
from public.products p
where p.id = v.product_id
  and v.shop_id is distinct from p.shop_id;

update public.recommendation_rules r
set shop_id = p.shop_id
from public.products p
where p.id = r.product_id
  and r.shop_id is distinct from p.shop_id;

-- seller_id must not be writable as an authorization grant. Products already
-- use column-level UPDATE grants; variants and rules previously had table
-- UPDATE, so replace those with least-privilege mutable-column grants.
revoke update (seller_id) on public.products from authenticated;

revoke update on public.product_variants from authenticated;
grant update (sku, color, size, price_cents, status, material, dimensions)
  on public.product_variants to authenticated;

revoke update on public.recommendation_rules from authenticated;
grant update (product_id, variant_id, occasion, size, active)
  on public.recommendation_rules to authenticated;

-- Products: public active catalog remains readable. Private CRUD follows the
-- shop when assigned, and the seller attribution only for legacy NULL-shop rows.
drop policy if exists "buyers read active products, sellers read their own" on public.products;
create policy "buyers read active products, sellers read their own"
  on public.products for select to authenticated
  using (
    status = 'active'
    or public.can_manage_shop_resource(shop_id, seller_id)
    or public.is_admin()
  );

drop policy if exists "sellers insert their own products" on public.products;
create policy "sellers insert their own products"
  on public.products for insert to authenticated
  with check (
    public.is_admin()
    or (
      seller_id = (select auth.uid())
      and public.is_active_seller()
      and (
        (shop_id is not null and public.is_shop_member(shop_id))
        or (
          shop_id is null
          and not exists (
            select 1 from public.shop_users su
            where su.user_id = (select auth.uid())
          )
        )
      )
    )
  );

drop policy if exists "sellers update their own products" on public.products;
create policy "sellers update their own products"
  on public.products for update to authenticated
  using (public.can_manage_shop_resource(shop_id, seller_id) or public.is_admin())
  with check (public.can_manage_shop_resource(shop_id, seller_id) or public.is_admin());

drop policy if exists "sellers delete their own products" on public.products;
create policy "sellers delete their own products"
  on public.products for delete to authenticated
  using (public.can_manage_shop_resource(shop_id, seller_id) or public.is_admin());

-- Variants.
drop policy if exists "buyers read active variants, sellers read their own" on public.product_variants;
create policy "buyers read active variants, sellers read their own"
  on public.product_variants for select to authenticated
  using (
    (
      status = 'active'
      and exists (
        select 1 from public.products p
        where p.id = product_variants.product_id and p.status = 'active'
      )
    )
    or public.can_manage_shop_resource(shop_id, seller_id)
    or public.is_admin()
  );

drop policy if exists "sellers insert their own variants" on public.product_variants;
create policy "sellers insert their own variants"
  on public.product_variants for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_seller()
      and exists (
        select 1 from public.products p
        where p.id = product_variants.product_id
          and p.seller_id = product_variants.seller_id
          and p.shop_id is not distinct from product_variants.shop_id
          and public.can_manage_shop_resource(p.shop_id, p.seller_id)
      )
    )
  );

drop policy if exists "sellers update their own variants" on public.product_variants;
create policy "sellers update their own variants"
  on public.product_variants for update to authenticated
  using (public.can_manage_shop_resource(shop_id, seller_id) or public.is_admin())
  with check (
    (public.can_manage_shop_resource(shop_id, seller_id) or public.is_admin())
    and exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and p.seller_id = product_variants.seller_id
        and p.shop_id is not distinct from product_variants.shop_id
    )
  );

drop policy if exists "sellers delete their own variants" on public.product_variants;
create policy "sellers delete their own variants"
  on public.product_variants for delete to authenticated
  using (public.can_manage_shop_resource(shop_id, seller_id) or public.is_admin());

-- Inventory and stock history are always authorized through the parent product.
drop policy if exists "shop members and admins read inventory" on public.inventory;
create policy "shop members and admins read inventory"
  on public.inventory for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.products p
      where p.id = inventory.product_id
        and public.can_manage_shop_resource(p.shop_id, p.seller_id)
    )
  );

drop policy if exists "shop members and admins read stock history" on public.stock_adjustments;
create policy "shop members and admins read stock history"
  on public.stock_adjustments for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.products p
      where p.id = stock_adjustments.product_id
        and public.can_manage_shop_resource(p.shop_id, p.seller_id)
    )
  );

-- Recommendation rules stay aligned with their parent product for every write.
drop policy if exists "buyers read active rules, sellers read their own" on public.recommendation_rules;
create policy "buyers read active rules, sellers read their own"
  on public.recommendation_rules for select to authenticated
  using (
    (
      active
      and exists (
        select 1 from public.products p
        where p.id = recommendation_rules.product_id and p.status = 'active'
      )
    )
    or public.can_manage_shop_resource(shop_id, seller_id)
    or public.is_admin()
  );

drop policy if exists "sellers insert their own rules" on public.recommendation_rules;
create policy "sellers insert their own rules"
  on public.recommendation_rules for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.is_active_seller()
      and exists (
        select 1 from public.products p
        where p.id = recommendation_rules.product_id
          and p.seller_id = recommendation_rules.seller_id
          and p.shop_id is not distinct from recommendation_rules.shop_id
          and public.can_manage_shop_resource(p.shop_id, p.seller_id)
      )
    )
  );

drop policy if exists "sellers update their own rules" on public.recommendation_rules;
create policy "sellers update their own rules"
  on public.recommendation_rules for update to authenticated
  using (public.can_manage_shop_resource(shop_id, seller_id) or public.is_admin())
  with check (
    (public.can_manage_shop_resource(shop_id, seller_id) or public.is_admin())
    and exists (
      select 1 from public.products p
      where p.id = recommendation_rules.product_id
        and p.seller_id = recommendation_rules.seller_id
        and p.shop_id is not distinct from recommendation_rules.shop_id
    )
  );

drop policy if exists "sellers delete their own rules" on public.recommendation_rules;
create policy "sellers delete their own rules"
  on public.recommendation_rules for delete to authenticated
  using (public.can_manage_shop_resource(shop_id, seller_id) or public.is_admin());

-- Product image metadata and image storage writes follow the product's shop.
drop policy if exists "product images follow product visibility" on public.product_images;
create policy "product images follow product visibility"
  on public.product_images for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (
          p.status = 'active'
          or public.can_manage_shop_resource(p.shop_id, p.seller_id)
          or public.is_admin()
        )
    )
  );

drop policy if exists "sellers insert images for their products" on public.product_images;
create policy "sellers insert images for their products"
  on public.product_images for insert to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (public.can_manage_shop_resource(p.shop_id, p.seller_id) or public.is_admin())
    )
  );

drop policy if exists "sellers update images for their products" on public.product_images;
create policy "sellers update images for their products"
  on public.product_images for update to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (public.can_manage_shop_resource(p.shop_id, p.seller_id) or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (public.can_manage_shop_resource(p.shop_id, p.seller_id) or public.is_admin())
    )
  );

drop policy if exists "sellers delete images for their products" on public.product_images;
create policy "sellers delete images for their products"
  on public.product_images for delete to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (public.can_manage_shop_resource(p.shop_id, p.seller_id) or public.is_admin())
    )
  );

drop policy if exists "product image owners write to storage" on storage.objects;
create policy "product image owners write to storage"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.products p
      where p.id::text = (storage.foldername(name))[1]
        and (public.can_manage_shop_resource(p.shop_id, p.seller_id) or public.is_admin())
    )
  );

drop policy if exists "product image owners delete from storage" on storage.objects;
create policy "product image owners delete from storage"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.products p
      where p.id::text = (storage.foldername(name))[1]
        and (public.can_manage_shop_resource(p.shop_id, p.seller_id) or public.is_admin())
    )
  );

-- Orders and their dependent records. Buyer access remains tied to the buyer;
-- seller operations require active membership in the order's shop.
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated
  using (
    role in ('seller', 'admin')
    or id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.buyer_id = profiles.id
        and public.can_manage_shop_resource(o.shop_id, o.seller_id)
    )
  );

drop policy if exists "buyers and sellers read their own orders" on public.orders;
create policy "buyers and sellers read their own orders"
  on public.orders for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or public.can_manage_shop_resource(shop_id, seller_id)
    or public.is_admin()
  );

drop policy if exists "buyers and sellers update their own orders" on public.orders;
create policy "buyers and sellers update their own orders"
  on public.orders for update to authenticated
  using (
    buyer_id = (select auth.uid())
    or public.can_manage_shop_resource(shop_id, seller_id)
    or public.is_admin()
  )
  with check (
    buyer_id = (select auth.uid())
    or public.can_manage_shop_resource(shop_id, seller_id)
    or public.is_admin()
  );

drop policy if exists "order items follow parent order" on public.order_items;
create policy "order items follow parent order"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (
          o.buyer_id = (select auth.uid())
          or public.can_manage_shop_resource(o.shop_id, o.seller_id)
          or public.is_admin()
        )
    )
  );

drop policy if exists "payments readable by order participants" on public.payments;
create policy "payments readable by order participants"
  on public.payments for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = payments.order_id
        and (
          o.buyer_id = (select auth.uid())
          or public.can_manage_shop_resource(o.shop_id, o.seller_id)
          or public.is_admin()
        )
    )
  );

drop policy if exists "buyers sellers and admins read their return requests" on public.return_requests;
create policy "buyers sellers and admins read their return requests"
  on public.return_requests for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or public.can_manage_shop_resource(shop_id, seller_id)
    or public.is_admin()
  );

drop policy if exists "participants read order shipments" on public.order_shipments;
create policy "participants read order shipments"
  on public.order_shipments for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_shipments.order_id
        and (
          o.buyer_id = (select auth.uid())
          or public.can_manage_shop_resource(o.shop_id, o.seller_id)
          or public.is_admin()
        )
    )
  );

drop policy if exists "seller or admin insert own order shipment" on public.order_shipments;
create policy "seller or admin insert own order shipment"
  on public.order_shipments for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.can_manage_shop_resource(shop_id, seller_id)
      and exists (
        select 1 from public.orders o
        where o.id = order_shipments.order_id
          and o.shop_id is not distinct from order_shipments.shop_id
          and o.seller_id = order_shipments.seller_id
          and public.can_manage_shop_resource(o.shop_id, o.seller_id)
      )
    )
  );

drop policy if exists "seller or admin update own order shipment" on public.order_shipments;
create policy "seller or admin update own order shipment"
  on public.order_shipments for update to authenticated
  using (public.can_manage_shop_resource(shop_id, seller_id) or public.is_admin())
  with check (
    public.is_admin()
    or (
      public.can_manage_shop_resource(shop_id, seller_id)
      and exists (
        select 1 from public.orders o
        where o.id = order_shipments.order_id
          and o.shop_id is not distinct from order_shipments.shop_id
          and o.seller_id = order_shipments.seller_id
          and public.can_manage_shop_resource(o.shop_id, o.seller_id)
      )
    )
  );

-- Private receipt/evidence objects belong to the order's buyer and active
-- shop staff. A stale seller attribution alone cannot open another shop's file.
drop policy if exists "order participants read payment receipts" on storage.objects;
create policy "order participants read payment receipts"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and (
          o.buyer_id = (select auth.uid())
          or public.can_manage_shop_resource(o.shop_id, o.seller_id)
          or public.is_admin()
        )
    )
  );

-- Shop image upload/delete checks must also respect active membership. Keep
-- string path matching so malformed folder segments never cause UUID casts.
drop policy if exists "shop members write shop images" on storage.objects;
create policy "shop members write shop images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'shop-images'
    and (storage.foldername(storage.objects.name))[2] = any (array['logo', 'banner'])
    and exists (
      select 1 from public.shops s
      where s.id::text = (storage.foldername(storage.objects.name))[1]
        and (public.is_shop_member(s.id) or public.is_admin())
    )
  );

drop policy if exists "shop members delete shop images" on storage.objects;
create policy "shop members delete shop images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'shop-images'
    and exists (
      select 1 from public.shops s
      where s.id::text = (storage.foldername(storage.objects.name))[1]
        and (public.is_shop_member(s.id) or public.is_admin())
    )
  );

-- Existing SECURITY DEFINER RPCs bypass RLS. Rewrite their known seller-ID
-- guards to call the same shop-aware authorization helper so direct RPC calls
-- cannot bypass the table policies. Only function definitions that contain
-- these specific guards are changed; all business logic stays byte-for-byte.
do $rewrite_shop_guards$
declare
  r record;
  v_definition text;
  v_rewritten text;
  v_count integer := 0;
begin
  for r in
    select p.oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosecdef
      and (
        p.prosrc like '%v_order.seller_id%'
        or p.prosrc like '%v_request.seller_id%'
        or p.prosrc like '%v_product.seller_id%'
        or p.prosrc like '%old.seller_id%'
        or (
          p.prosrc like '%public.current_user_role() = ''seller''%'
          and p.prosrc like '%public.shop_users%'
        )
      )
  loop
    v_definition := pg_catalog.pg_get_functiondef(r.oid);
    v_rewritten := v_definition;

    v_rewritten := regexp_replace(v_rewritten,
      $re$if[[:space:]]+v_uid[[:space:]]*<>[[:space:]]*v_order\.seller_id[[:space:]]+and[[:space:]]+not[[:space:]]+public\.is_admin\(\)[[:space:]]+and[[:space:]]+not[[:space:]]+public\.is_shop_member\(v_order\.shop_id\)[[:space:]]+then$re$,
      'if not public.is_admin() and not public.can_manage_shop_resource(v_order.shop_id, v_order.seller_id) then', 'gi');

    v_rewritten := regexp_replace(v_rewritten,
      $re$if[[:space:]]+v_uid[[:space:]]*<>[[:space:]]*v_request\.seller_id[[:space:]]+and[[:space:]]+not[[:space:]]+public\.is_admin\(\)[[:space:]]+and[[:space:]]+not[[:space:]]+public\.is_shop_member\(v_request\.shop_id\)[[:space:]]+then$re$,
      'if not public.is_admin() and not public.can_manage_shop_resource(v_request.shop_id, v_request.seller_id) then', 'gi');

    v_rewritten := regexp_replace(v_rewritten,
      $re$if[[:space:]]+not[[:space:]]+\(public\.is_admin\(\)[[:space:]]+or[[:space:]]+v_order\.seller_id[[:space:]]*=[[:space:]]*v_uid[[:space:]]+or[[:space:]]+public\.is_shop_member\(v_order\.shop_id\)\)[[:space:]]+then$re$,
      'if not (public.is_admin() or public.can_manage_shop_resource(v_order.shop_id, v_order.seller_id)) then', 'gi');

    v_rewritten := regexp_replace(v_rewritten,
      $re$v_product\.seller_id[[:space:]]*<>[[:space:]]*v_uid[[:space:]]+and[[:space:]]+not[[:space:]]+public\.is_shop_member\(v_product\.shop_id\)[[:space:]]+and[[:space:]]+not[[:space:]]+public\.is_admin\(\)$re$,
      'not public.can_manage_shop_resource(v_product.shop_id, v_product.seller_id) and not public.is_admin()', 'gi');

    v_rewritten := regexp_replace(v_rewritten,
      $re$v_uid[[:space:]]*<>[[:space:]]*old\.seller_id[[:space:]]+and[[:space:]]+not[[:space:]]+public\.is_shop_member\(old\.shop_id\)[[:space:]]+and[[:space:]]+not[[:space:]]+public\.is_admin\(\)$re$,
      'not public.can_manage_shop_resource(old.shop_id, old.seller_id) and not public.is_admin()', 'gi');

    v_rewritten := regexp_replace(v_rewritten,
      $re$\(v_uid[[:space:]]*=[[:space:]]*old\.seller_id[[:space:]]+or[[:space:]]+public\.is_shop_member\(old\.shop_id\)\)$re$,
      'public.can_manage_shop_resource(old.shop_id, old.seller_id)', 'gi');

    v_rewritten := regexp_replace(v_rewritten,
      $re$\(v_uid[[:space:]]*=[[:space:]]*old\.seller_id[[:space:]]+or[[:space:]]+public\.is_shop_member\(old\.shop_id\)[[:space:]]+or[[:space:]]+public\.is_admin\(\)\)$re$,
      '(public.can_manage_shop_resource(old.shop_id, old.seller_id) or public.is_admin())', 'gi');

    v_rewritten := regexp_replace(v_rewritten,
      $re$not[[:space:]]+\(v_is_admin[[:space:]]+or[[:space:]]+public\.current_user_role\(\)[[:space:]]*=[[:space:]]*'seller'\)$re$,
      'not (v_is_admin or public.is_active_seller())', 'gi');

    v_rewritten := regexp_replace(v_rewritten,
      $re$\(o\.shop_id[[:space:]]+is[[:space:]]+null[[:space:]]+and[[:space:]]+o\.seller_id[[:space:]]*=[[:space:]]*v_uid\)$re$,
      'public.can_manage_shop_resource(o.shop_id, o.seller_id)', 'gi');

    v_rewritten := regexp_replace(v_rewritten,
      $re$from[[:space:]]+public\.shop_users[[:space:]]+su[[:space:]]+where[[:space:]]+su\.user_id[[:space:]]*=[[:space:]]*v_uid$re$,
      'from public.shop_users su join public.shops s on s.id = su.shop_id and s.active where su.user_id = v_uid', 'gi');

    if v_rewritten is distinct from v_definition then
      execute v_rewritten;
      v_count := v_count + 1;
    end if;
  end loop;

  if v_count <> 11 then
    raise exception 'Expected to harden 11 seller-authorized RPCs/triggers/reports; changed %', v_count;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        p.prosrc ~* 'v_uid[[:space:]]*<>[[:space:]]*v_order\.seller_id[[:space:]]+and[[:space:]]+not[[:space:]]+public\.is_admin'
        or p.prosrc ~* 'v_uid[[:space:]]*<>[[:space:]]*v_request\.seller_id[[:space:]]+and[[:space:]]+not[[:space:]]+public\.is_admin'
        or p.prosrc ~* 'v_product\.seller_id[[:space:]]*<>[[:space:]]*v_uid[[:space:]]+and[[:space:]]+not[[:space:]]+public\.is_shop_member'
        or p.prosrc ~* 'v_uid[[:space:]]*<>[[:space:]]*old\.seller_id[[:space:]]+and[[:space:]]+not[[:space:]]+public\.is_shop_member'
        or p.prosrc ~* 'v_uid[[:space:]]*=[[:space:]]*old\.seller_id[[:space:]]+or[[:space:]]+public\.is_shop_member'
        or p.prosrc ~* 'public\.current_user_role\(\)[[:space:]]*=[[:space:]]*''seller'''
        or p.prosrc ~* '\(o\.shop_id[[:space:]]+is[[:space:]]+null[[:space:]]+and[[:space:]]+o\.seller_id[[:space:]]*=[[:space:]]*v_uid\)'
      )
  ) then
    raise exception 'A seller-only authorization guard remains in a SECURITY DEFINER function';
  end if;
end;
$rewrite_shop_guards$;

-- Recommendation rules describe the product's current catalog placement,
-- so move them with the product. Order/payment/return records are historical
-- snapshots and intentionally keep their original shop attribution.
create or replace function public.admin_transfer_product_shop(
  p_product_id uuid,
  p_shop_id uuid
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid          uuid := (select auth.uid());
  v_product      public.products;
  v_shop         public.shops;
  v_from_shop_id uuid;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to transfer a product to another shop'
      using errcode = '42501';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  select * into v_shop from public.shops where id = p_shop_id for update;
  if not found then
    raise exception 'Shop not found' using errcode = 'P0002';
  end if;
  if not v_shop.active then
    raise exception 'Cannot transfer a product to an inactive shop' using errcode = '22023';
  end if;

  v_from_shop_id := v_product.shop_id;
  if v_from_shop_id = p_shop_id then
    raise exception 'This product is already assigned to that shop' using errcode = '22023';
  end if;

  perform set_config('app.product_shop_transfer_in_progress', 'true', true);

  update public.products
  set shop_id = p_shop_id
  where id = p_product_id
  returning * into v_product;

  update public.product_variants
  set shop_id = p_shop_id
  where product_id = p_product_id;

  update public.recommendation_rules
  set shop_id = p_shop_id
  where product_id = p_product_id;

  insert into public.admin_action_log (
    actor_id, action, target_shop_id, metadata
  )
  values (
    v_uid, 'transfer_product_shop', p_shop_id,
    jsonb_build_object(
      'product_id', p_product_id,
      'product_title', v_product.title,
      'from_shop_id', v_from_shop_id,
      'to_shop_id', p_shop_id
    )
  );

  return v_product;
end;
$function$;

comment on function public.admin_transfer_product_shop(uuid, uuid) is
  'Admin-only transfer of current product catalog data. Moves variants, inventory (via trigger), and recommendation rules with the product; preserves historical order, payment, return, and stock-adjustment shop snapshots.';

commit;
