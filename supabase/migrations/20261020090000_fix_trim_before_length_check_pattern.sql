-- =============================================================================
-- Broader instance of the bug fixed in 20261020080000: measuring a text
-- field's length BEFORE trimming it, while every client-side Zod schema for
-- these same fields trims first then checks the same limit. Found by
-- grepping the live schema for every remaining `char_length(p_...)  > N`
-- check after fixing request_return's explanation field. A direct
-- PostgREST caller (bypassing the Zod-validated Server Action) hitting the
-- exact boundary -- N meaningful characters plus incidental whitespace --
-- would get a confusing false rejection. No security or data-integrity
-- risk either way (this only makes the server stricter than intended,
-- never looser) -- this is a robustness/consistency fix, not a security
-- fix.
--
-- Six functions, same shape of change in each: compute the trimmed value
-- once, check ITS length, store THAT value (where the field is stored at
-- all) -- instead of checking the raw parameter and (sometimes) trimming
-- separately at the point of storage, which is where the inconsistency
-- lived. Optional reason/note/comment fields that are empty after
-- trimming are normalized to NULL, matching the existing pattern already
-- used for submit_review's own comment field (`nullif(trim(p_comment), '')`).
--
-- Every other check, every authorization rule, every business-logic branch
-- in each function is byte-for-byte unchanged.
--
-- ROLLBACK:
--   -- restore each function's previous body from:
--   -- respond_to_return:                 20260927140113_respond_to_return_status_cast_fix.sql
--   -- record_return_item_condition:       20260930060000_return_item_condition_restock.sql
--   -- decide_return:                      20261020050000_return_replacement_resolution.sql
--   -- record_return_replacement_shipment: 20261020050000_return_replacement_resolution.sql
--   -- admin_hard_delete_seller_account:   20260928054321_seller_hard_delete_support.sql
--   -- admin_hard_delete_shop:             20260928072046_shop_hard_delete_support.sql
--   -- submit_review:                      20260822000000_reviews.sql
-- =============================================================================

begin;

create or replace function public.respond_to_return(p_return_id uuid, p_decision text, p_note text default null)
returns public.return_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_request public.return_requests;
  v_note    text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to respond to a return request'
      using errcode = '42501';
  end if;

  if p_decision not in ('accept', 'reject') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  if p_note is not null then
    v_note := nullif(trim(p_note), '');
    if v_note is not null and char_length(v_note) > 500 then
      raise exception 'Note is too long' using errcode = '22023';
    end if;
  end if;

  select * into v_request from public.return_requests where id = p_return_id for update;
  if not found then
    raise exception 'Return request not found' using errcode = 'P0002';
  end if;

  if v_uid <> v_request.seller_id
     and not public.is_admin()
     and not public.is_shop_member(v_request.shop_id) then
    raise exception 'You do not have permission to respond to this return request'
      using errcode = '42501';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'This return request has already been responded to'
      using errcode = '23514';
  end if;

  update public.return_requests
  set status = case when p_decision = 'accept' then 'seller_accepted' else 'seller_rejected' end::public.return_status,
      seller_decision_note = v_note,
      seller_decided_at = now(),
      seller_decided_by = v_uid
  where id = p_return_id
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.record_return_item_condition(p_return_id uuid, p_condition text, p_note text default null)
returns public.return_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_request   public.return_requests;
  v_order     public.orders;
  v_item      record;
  v_inventory public.inventory;
  v_note      text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to record item condition' using errcode = '42501';
  end if;

  if p_condition not in ('sellable', 'not_sellable') then
    raise exception 'Invalid condition' using errcode = '22023';
  end if;
  if p_note is not null then
    v_note := nullif(trim(p_note), '');
    if v_note is not null and char_length(v_note) > 500 then
      raise exception 'Note is too long' using errcode = '22023';
    end if;
  end if;

  select * into v_request from public.return_requests where id = p_return_id for update;
  if not found then
    raise exception 'Return request not found' using errcode = 'P0002';
  end if;

  if v_request.status <> 'refunded' then
    raise exception 'Only a refunded return request can have its item condition recorded'
      using errcode = '23514';
  end if;

  if v_request.restocked_at is not null or v_request.marked_unsellable_at is not null then
    raise exception 'This return''s item condition has already been recorded'
      using errcode = '23514';
  end if;

  select * into v_order from public.orders where id = v_request.order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_uid <> v_order.seller_id
     and not public.is_admin()
     and not public.is_shop_member(v_order.shop_id)
  then
    raise exception 'You do not have permission to record this return''s item condition'
      using errcode = '42501';
  end if;

  if p_condition = 'not_sellable' then
    update public.return_requests
    set marked_unsellable_at = now(),
        condition_note = v_note,
        condition_recorded_by = v_uid
    where id = p_return_id
    returning * into v_request;

    return v_request;
  end if;

  if v_request.order_item_id is null then
    for v_item in
      select product_id, variant_id, quantity
      from public.order_items
      where order_id = v_request.order_id
    loop
      if v_item.variant_id is not null then
        select * into v_inventory from public.inventory where variant_id = v_item.variant_id for update;
      else
        select * into v_inventory from public.inventory
          where product_id = v_item.product_id and variant_id is null for update;
      end if;

      if not found then
        continue;
      end if;

      update public.inventory
      set quantity = v_inventory.quantity + v_item.quantity
      where id = v_inventory.id;

      insert into public.stock_adjustments (
        product_id, variant_id, shop_id, delta, previous_quantity, new_quantity,
        reason, note, related_order_id, created_by
      ) values (
        v_item.product_id, v_item.variant_id, v_inventory.shop_id, v_item.quantity,
        v_inventory.quantity, v_inventory.quantity + v_item.quantity,
        'return_restock', 'Restocked from approved return on order ' || v_order.order_number,
        v_order.id, v_uid
      );
    end loop;
  else
    select product_id, variant_id, quantity into v_item
    from public.order_items
    where id = v_request.order_item_id;

    if v_item.variant_id is not null then
      select * into v_inventory from public.inventory where variant_id = v_item.variant_id for update;
    else
      select * into v_inventory from public.inventory
        where product_id = v_item.product_id and variant_id is null for update;
    end if;

    if found then
      update public.inventory
      set quantity = v_inventory.quantity + v_item.quantity
      where id = v_inventory.id;

      insert into public.stock_adjustments (
        product_id, variant_id, shop_id, delta, previous_quantity, new_quantity,
        reason, note, related_order_id, created_by
      ) values (
        v_item.product_id, v_item.variant_id, v_inventory.shop_id, v_item.quantity,
        v_inventory.quantity, v_inventory.quantity + v_item.quantity,
        'return_restock', 'Restocked from approved return on order ' || v_order.order_number,
        v_order.id, v_uid
      );
    end if;
  end if;

  update public.return_requests
  set restocked_at = now(),
      condition_note = v_note,
      condition_recorded_by = v_uid
  where id = p_return_id
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.decide_return(
  p_return_id uuid,
  p_decision text,
  p_note text default null,
  p_resolution_type public.return_request_type default 'money_refund'
)
returns public.return_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid              uuid := (select auth.uid());
  v_request          public.return_requests;
  v_order            public.orders;
  v_payment          public.payments;
  v_refund_amount    integer;
  v_already_refunded integer;
  v_total_refunded   integer;
  v_new_status       public.payment_status;
  v_note             text;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to decide a return request'
      using errcode = '42501';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  if p_note is not null then
    v_note := nullif(trim(p_note), '');
    if v_note is not null and char_length(v_note) > 500 then
      raise exception 'Note is too long' using errcode = '22023';
    end if;
  end if;

  select * into v_request from public.return_requests where id = p_return_id for update;
  if not found then
    raise exception 'Return request not found' using errcode = 'P0002';
  end if;

  if not (
    v_request.status in ('seller_accepted', 'seller_rejected')
    or (v_request.status = 'pending' and v_request.created_at < now() - interval '3 days')
  ) then
    raise exception 'This return request is not ready for a final decision'
      using errcode = '23514';
  end if;

  if p_decision = 'reject' then
    update public.return_requests
    set status = 'admin_rejected',
        admin_decision_note = v_note,
        admin_decided_at = now(),
        admin_decided_by = v_uid
    where id = p_return_id
    returning * into v_request;

    insert into public.admin_action_log (actor_id, action, target_user_id, metadata)
    values (
      v_uid, 'reject_refund', v_request.buyer_id,
      jsonb_build_object('return_id', p_return_id, 'order_id', v_request.order_id)
    );

    return v_request;
  end if;

  if p_resolution_type = 'replacement_exchange' then
    update public.return_requests
    set status = 'replacement_approved',
        admin_decision_note = v_note,
        admin_decided_at = now(),
        admin_decided_by = v_uid
    where id = p_return_id
    returning * into v_request;

    insert into public.admin_action_log (actor_id, action, target_user_id, metadata)
    values (
      v_uid, 'approve_refund', v_request.buyer_id,
      jsonb_build_object(
        'return_id', p_return_id, 'order_id', v_request.order_id,
        'resolution', 'replacement_exchange'
      )
    );

    return v_request;
  end if;

  select * into v_order from public.orders where id = v_request.order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  select * into v_payment
  from public.payments
  where order_id = v_request.order_id and status in ('paid', 'partially_refunded')
  for update;
  if not found then
    raise exception 'No paid payment found for this order' using errcode = '23514';
  end if;

  if v_request.order_item_id is null then
    v_refund_amount := v_order.total_cents;
  else
    select subtotal_cents into v_refund_amount
    from public.order_items
    where id = v_request.order_item_id;
  end if;

  if v_payment.payment_method_type <> 'xendit' then
    select coalesce(sum(refund_amount_cents), 0) into v_already_refunded
    from public.return_requests
    where order_id = v_request.order_id and status = 'refunded';

    v_total_refunded := v_already_refunded + v_refund_amount;

    if v_total_refunded > v_payment.amount_cents then
      raise exception 'This refund would exceed the amount actually paid for this order'
        using errcode = '23514';
    end if;

    v_new_status := case
      when v_total_refunded < v_payment.amount_cents then 'partially_refunded'::public.payment_status
      else 'refunded'::public.payment_status
    end;

    update public.payments set status = v_new_status where id = v_payment.id;

    perform set_config('app.refund_in_progress', 'true', true);

    update public.orders
    set payment_status = v_new_status,
        order_status = case when v_new_status = 'refunded' then 'refunded'::public.order_status else order_status end
    where id = v_order.id;

    update public.return_requests
    set status = 'refunded',
        admin_decision_note = v_note,
        admin_decided_at = now(),
        admin_decided_by = v_uid,
        refund_amount_cents = v_refund_amount
    where id = p_return_id
    returning * into v_request;

    insert into public.admin_action_log (actor_id, action, target_user_id, metadata)
    values (
      v_uid, 'approve_refund', v_request.buyer_id,
      jsonb_build_object(
        'return_id', p_return_id, 'order_id', v_request.order_id,
        'refund_amount_cents', v_refund_amount,
        'payment_status', v_new_status
      )
    );

    return v_request;
  end if;

  if v_payment.xendit_payment_request_id is null then
    raise exception 'This payment has no Xendit reference to refund' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.xendit_refunds
    where return_request_id = p_return_id and status = 'pending'
  ) then
    raise exception 'A refund is already being processed for this request' using errcode = '23514';
  end if;

  select coalesce(sum(amount_cents), 0) into v_already_refunded
  from public.xendit_refunds
  where payment_id = v_payment.id and status = 'succeeded';

  v_total_refunded := v_already_refunded + v_refund_amount;

  if v_total_refunded > v_payment.amount_cents then
    raise exception 'This refund would exceed the amount actually paid for this order'
      using errcode = '23514';
  end if;

  insert into public.xendit_refunds (
    return_request_id, payment_id, xendit_payment_request_id, amount_cents, currency, status
  ) values (
    p_return_id, v_payment.id, v_payment.xendit_payment_request_id, v_refund_amount, v_payment.currency, 'pending'
  );

  update public.return_requests
  set admin_decision_note = v_note,
      admin_decided_at = now(),
      admin_decided_by = v_uid
  where id = p_return_id
  returning * into v_request;

  insert into public.admin_action_log (actor_id, action, target_user_id, metadata)
  values (
    v_uid, 'approve_refund', v_request.buyer_id,
    jsonb_build_object(
      'return_id', p_return_id, 'order_id', v_request.order_id,
      'refund_amount_cents', v_refund_amount,
      'status', 'submitted_to_xendit'
    )
  );

  return v_request;
end;
$$;

create or replace function public.record_return_replacement_shipment(
  p_return_id uuid,
  p_courier text,
  p_tracking_number text
)
returns public.return_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_request  public.return_requests;
  v_order    public.orders;
  v_courier  text;
  v_tracking text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to record a shipment' using errcode = '42501';
  end if;

  v_courier := trim(p_courier);
  if char_length(v_courier) = 0 then
    raise exception 'Courier is required' using errcode = '22023';
  end if;
  if char_length(v_courier) > 80 then
    raise exception 'Courier name is too long' using errcode = '22023';
  end if;

  v_tracking := trim(p_tracking_number);
  if char_length(v_tracking) = 0 then
    raise exception 'Tracking number is required' using errcode = '22023';
  end if;
  if char_length(v_tracking) > 120 then
    raise exception 'Tracking number is too long' using errcode = '22023';
  end if;

  select * into v_request from public.return_requests where id = p_return_id for update;
  if not found then
    raise exception 'Return request not found' using errcode = 'P0002';
  end if;

  if v_request.status <> 'replacement_approved' then
    raise exception 'Only an approved replacement can have its shipment recorded'
      using errcode = '23514';
  end if;
  if v_request.replacement_shipped_at is not null then
    raise exception 'This replacement has already been shipped' using errcode = '23514';
  end if;

  select * into v_order from public.orders where id = v_request.order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_uid <> v_order.seller_id
     and not public.is_admin()
     and not public.is_shop_member(v_order.shop_id)
  then
    raise exception 'You do not have permission to record this replacement shipment'
      using errcode = '42501';
  end if;

  update public.return_requests
  set replacement_courier = v_courier,
      replacement_tracking_number = v_tracking,
      replacement_shipped_at = now()
  where id = p_return_id
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.admin_hard_delete_seller_account(p_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_profile   public.profiles;
  v_email     text;
  v_shop_id   uuid;
  v_shop_name text;
  v_summary   jsonb;
  v_reason    text;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to delete this account'
      using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  if v_profile.role = 'admin' then
    raise exception 'Cannot hard-delete an administrator account' using errcode = '22023';
  end if;

  if v_profile.is_active then
    raise exception 'Deactivate this account before permanently deleting it'
      using errcode = '22023';
  end if;

  if p_reason is not null then
    v_reason := nullif(trim(p_reason), '');
    if v_reason is not null and char_length(v_reason) > 200 then
      raise exception 'Reason is too long' using errcode = '22023';
    end if;
  end if;

  select email into v_email from auth.users where id = p_user_id;

  select su.shop_id, s.name into v_shop_id, v_shop_name
  from public.shop_users su
  join public.shops s on s.id = su.shop_id
  where su.user_id = p_user_id;

  delete from public.shop_users where user_id = p_user_id;

  v_summary := jsonb_build_object(
    'email', v_email,
    'full_name', v_profile.full_name,
    'username', v_profile.username,
    'previous_role', v_profile.role,
    'shop_id', v_shop_id,
    'shop_name', v_shop_name,
    'reason', v_reason
  );

  insert into public.admin_action_log (
    actor_id, action, target_user_id, target_shop_id, metadata
  )
  values (
    v_uid, 'hard_delete_seller_account', p_user_id, v_shop_id, v_summary
  );

  return v_summary;
end;
$$;

create or replace function public.admin_hard_delete_shop(p_shop_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid              uuid := (select auth.uid());
  v_shop             public.shops;
  v_member_count     bigint;
  v_history_count    bigint;
  v_products_count   bigint;
  v_variants_count   bigint;
  v_inventory_count  bigint;
  v_stock_adj_count  bigint;
  v_reco_rules_count bigint;
  v_summary          jsonb;
  v_reason           text;
begin
  if v_uid is null or not public.is_admin() then
    raise exception 'You do not have permission to delete this shop'
      using errcode = '42501';
  end if;

  select * into v_shop from public.shops where id = p_shop_id for update;
  if not found then
    raise exception 'Shop not found' using errcode = 'P0002';
  end if;

  if v_shop.active then
    raise exception 'Deactivate this shop before permanently deleting it'
      using errcode = '22023';
  end if;

  if p_reason is not null then
    v_reason := nullif(trim(p_reason), '');
    if v_reason is not null and char_length(v_reason) > 200 then
      raise exception 'Reason is too long' using errcode = '22023';
    end if;
  end if;

  select count(*) into v_member_count
  from public.shop_users
  where shop_id = p_shop_id;
  if v_member_count > 0 then
    raise exception 'This shop still has % assigned seller(s) — reassign or remove them first',
      v_member_count
      using errcode = '22023';
  end if;

  select count(*) into v_history_count
  from public.orders
  where shop_id = p_shop_id;
  if v_history_count = 0 then
    select count(*) into v_history_count
    from public.return_requests
    where shop_id = p_shop_id;
  end if;
  if v_history_count = 0 then
    select count(*) into v_history_count
    from public.order_shipments
    where shop_id = p_shop_id;
  end if;
  if v_history_count = 0 then
    select count(*) into v_history_count
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where p.shop_id = p_shop_id;
  end if;
  if v_history_count > 0 then
    raise exception 'This shop has historical orders and cannot be permanently deleted — deactivate it instead'
      using errcode = '22023';
  end if;

  select count(*) into v_products_count from public.products where shop_id = p_shop_id;
  select count(*) into v_variants_count from public.product_variants where shop_id = p_shop_id;
  select count(*) into v_inventory_count from public.inventory where shop_id = p_shop_id;
  select count(*) into v_stock_adj_count from public.stock_adjustments where shop_id = p_shop_id;
  select count(*) into v_reco_rules_count from public.recommendation_rules where shop_id = p_shop_id;

  v_summary := jsonb_build_object(
    'name', v_shop.name,
    'slug', v_shop.slug,
    'description', v_shop.description,
    'logo_url', v_shop.logo_url,
    'banner_url', v_shop.banner_url,
    'reason', v_reason,
    'detached_products_count', v_products_count,
    'detached_variants_count', v_variants_count,
    'detached_inventory_count', v_inventory_count,
    'detached_stock_adjustments_count', v_stock_adj_count,
    'detached_recommendation_rules_count', v_reco_rules_count
  );

  insert into public.admin_action_log (
    actor_id, action, target_shop_id, metadata
  )
  values (
    v_uid, 'hard_delete_shop', p_shop_id, v_summary
  );

  delete from public.shops where id = p_shop_id;

  return v_summary;
end;
$$;

create or replace function public.submit_review(p_order_item_id uuid, p_rating smallint, p_comment text)
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
  v_comment text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to write a review' using errcode = '42501';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;

  if p_comment is not null then
    v_comment := nullif(trim(p_comment), '');
    if v_comment is not null and char_length(v_comment) > 1000 then
      raise exception 'Review is too long' using errcode = '22023';
    end if;
  end if;

  select * into v_order_item
  from public.order_items
  where id = p_order_item_id;

  if not found then
    raise exception 'Order item not found' using errcode = 'P0002';
  end if;

  select * into v_order
  from public.orders
  where id = v_order_item.order_id;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.buyer_id <> v_uid then
    raise exception 'You do not have permission to review this item'
      using errcode = '42501';
  end if;

  if v_order.order_status <> 'delivered' then
    raise exception 'You can only review items from delivered orders' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.reviews where order_item_id = p_order_item_id
  ) then
    raise exception 'You have already reviewed this item' using errcode = '23505';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_uid;

  insert into public.reviews (
    order_item_id, product_id, buyer_id, reviewer_display_name, rating, comment
  )
  values (
    p_order_item_id,
    v_order_item.product_id,
    v_uid,
    coalesce(v_profile.full_name, v_profile.username, 'RobertJ Customer'),
    p_rating,
    v_comment
  )
  returning * into v_review;

  return v_review;
end;
$$;

commit;
