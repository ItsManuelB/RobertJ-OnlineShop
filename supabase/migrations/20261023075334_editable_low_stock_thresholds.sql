-- Editable platform default plus seller-owned per-inventory overrides.
-- The existing low_stock_threshold column remains the effective value so
-- existing list filters and report reads can compare it efficiently.

begin;

alter table public.platform_settings
  add column if not exists default_low_stock_threshold integer not null default 5;
alter table public.platform_settings
  add constraint platform_settings_default_low_stock_threshold_range
    check (default_low_stock_threshold between 0 and 10000);
grant select (default_low_stock_threshold) on public.platform_settings to anon, authenticated;

alter table public.inventory
  add column if not exists low_stock_threshold_override integer;
alter table public.inventory
  add column if not exists stock_status text generated always as (
    case
      when quantity <= 0 then 'out_of_stock'
      when quantity <= low_stock_threshold then 'low_stock'
      else 'in_stock'
    end
  ) stored;
create index if not exists inventory_stock_status_updated_idx
  on public.inventory (stock_status, updated_at desc);
alter table public.inventory
  add constraint inventory_low_stock_threshold_override_range
    check (low_stock_threshold_override is null or low_stock_threshold_override between 0 and 10000);

-- Values matching the former database default inherit the new platform
-- default. Any distinct value is preserved as an existing custom override.
update public.inventory
set low_stock_threshold_override = null
where low_stock_threshold = 5;
update public.inventory
set low_stock_threshold_override = low_stock_threshold
where low_stock_threshold <> 5;

create or replace function public.apply_inventory_low_stock_threshold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_default integer;
begin
  if tg_op = 'INSERT'
     or new.low_stock_threshold_override is distinct from old.low_stock_threshold_override then
    select default_low_stock_threshold into v_default
    from public.platform_settings
    where id;

    new.low_stock_threshold := coalesce(new.low_stock_threshold_override, v_default, 5);
  end if;
  return new;
end;
$$;

create trigger inventory_apply_low_stock_threshold
  before insert or update of low_stock_threshold_override on public.inventory
  for each row execute function public.apply_inventory_low_stock_threshold();

revoke execute on function public.apply_inventory_low_stock_threshold() from public, anon, authenticated;

create or replace function public.sync_inventory_low_stock_threshold_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.default_low_stock_threshold is distinct from old.default_low_stock_threshold then
    update public.inventory
    set low_stock_threshold = coalesce(low_stock_threshold_override, new.default_low_stock_threshold)
    where low_stock_threshold_override is null;
  end if;
  return new;
end;
$$;

create trigger platform_settings_sync_low_stock_threshold
  after update of default_low_stock_threshold on public.platform_settings
  for each row execute function public.sync_inventory_low_stock_threshold_default();

revoke execute on function public.sync_inventory_low_stock_threshold_default() from public, anon, authenticated;

create or replace function public.admin_update_default_low_stock_threshold(p_threshold integer)
returns public.platform_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_previous integer;
  v_result public.platform_settings;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to change platform settings' using errcode = '42501';
  end if;
  if p_threshold is null or p_threshold < 0 or p_threshold > 10000 then
    raise exception 'Threshold must be between 0 and 10000' using errcode = '22023';
  end if;

  select default_low_stock_threshold into v_previous
  from public.platform_settings where id for update;

  update public.platform_settings
  set default_low_stock_threshold = p_threshold,
      updated_at = now(),
      updated_by = v_uid
  where id
  returning * into v_result;

  insert into public.admin_action_log (actor_id, action, metadata)
  values (
    v_uid,
    'update_platform_settings',
    jsonb_build_object(
      'previous_low_stock_threshold', v_previous,
      'new_low_stock_threshold', v_result.default_low_stock_threshold
    )
  );

  return v_result;
end;
$$;

revoke all on function public.admin_update_default_low_stock_threshold(integer) from public, anon;
grant execute on function public.admin_update_default_low_stock_threshold(integer) to authenticated;

create or replace function public.update_inventory_low_stock_threshold(
  p_product_id uuid,
  p_variant_id uuid,
  p_threshold integer
)
returns public.inventory
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_product public.products;
  v_inventory public.inventory;
  v_previous_override integer;
  v_previous_effective integer;
begin
  if v_uid is null or coalesce(public.current_user_role()::text, '') not in ('seller', 'admin') then
    raise exception 'You do not have permission to change inventory thresholds' using errcode = '42501';
  end if;
  if p_threshold is not null and (p_threshold < 0 or p_threshold > 10000) then
    raise exception 'Threshold must be between 0 and 10000, or empty to use the default' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id;
  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if not public.is_admin()
     and v_product.seller_id is distinct from v_uid
     and not public.is_shop_member(v_product.shop_id) then
    raise exception 'You do not have permission to change this product' using errcode = '42501';
  end if;

  select * into v_inventory
  from public.inventory
  where product_id = p_product_id
    and variant_id is not distinct from p_variant_id
  for update;
  if not found then
    raise exception 'Inventory row not found' using errcode = 'P0002';
  end if;

  v_previous_override := v_inventory.low_stock_threshold_override;
  v_previous_effective := v_inventory.low_stock_threshold;

  update public.inventory
  set low_stock_threshold_override = p_threshold
  where id = v_inventory.id
  returning * into v_inventory;

  insert into public.admin_action_log (actor_id, action, target_shop_id, metadata)
  values (
    v_uid,
    'update_inventory_threshold',
    v_inventory.shop_id,
    jsonb_build_object(
      'product_id', p_product_id,
      'product_title', v_product.title,
      'variant_id', p_variant_id,
      'previous_override', v_previous_override,
      'new_override', p_threshold,
      'previous_effective', v_previous_effective,
      'new_effective', v_inventory.low_stock_threshold
    )
  );

  return v_inventory;
end;
$$;

revoke all on function public.update_inventory_low_stock_threshold(uuid, uuid, integer) from public, anon;
grant execute on function public.update_inventory_low_stock_threshold(uuid, uuid, integer) to authenticated;

commit;
