-- =============================================================================
-- Audit finding F-06 (Medium): a failed multi-seller online-payment checkout
-- (`create_order_group`) rolls back the whole all-or-nothing transaction
-- correctly, but the raised error carries no indication of which seller/item
-- caused it — the buyer sees one opaque message with zero attribution.
--
-- Fix: wrap the existing per-seller `create_order(...)` call in its own
-- BEGIN/EXCEPTION block. On failure, re-raise the SAME message and SQLSTATE
-- (so curatedRpcError's error-code trust logic is unaffected) but attach the
-- failing seller's `seller_id` as the exception's DETAIL field. The whole
-- transaction still aborts exactly as before — this only makes the failure
-- attributable, it changes no transactional behavior.
--
-- Same signature, CREATE OR REPLACE — no grant reset.
-- =============================================================================

begin;

create or replace function public.create_order_group(
  p_groups jsonb,
  p_shipping_address jsonb,
  p_shipping_fee_cents integer default 0,
  p_notes text default null,
  p_payment_method text default 'cod',
  p_idempotency_key uuid default null
)
returns setof public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid := gen_random_uuid();
  v_group    jsonb;
  v_buyer    uuid := (select auth.uid());
  v_order    public.orders;
  v_created  uuid[] := '{}';
  v_scope    constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then
    raise exception 'At least one seller group is required' using errcode = '22023';
  end if;

  if p_idempotency_key is not null and v_buyer is not null then
    insert into public.order_idempotency_keys (buyer_id, idempotency_key, scope)
    values (v_buyer, p_idempotency_key, v_scope)
    on conflict (buyer_id, idempotency_key, scope) do nothing;

    if not found then
      if not exists (
        select 1
        from public.order_idempotency_keys k
        where k.buyer_id = v_buyer
          and k.idempotency_key = p_idempotency_key
          and k.scope = v_scope
          and coalesce(array_length(k.order_ids, 1), 0) > 0
      ) then
        raise exception 'Duplicate order submission' using errcode = '23505';
      end if;

      return query
        select o.*
        from public.orders o
        join public.order_idempotency_keys k
          on k.buyer_id = v_buyer
         and k.idempotency_key = p_idempotency_key
         and k.scope = v_scope
        where o.id = any (k.order_ids)
        order by o.placed_at, o.id;
      return;
    end if;
  end if;

  for v_group in select value from jsonb_array_elements(p_groups) loop
    begin
      v_order := public.create_order(
        p_seller_id          := (v_group ->> 'seller_id')::uuid,
        p_items              := v_group -> 'items',
        p_shipping_address   := p_shipping_address,
        p_shipping_fee_cents := p_shipping_fee_cents,
        p_notes              := p_notes,
        p_checkout_group_id  := v_group_id,
        p_payment_method     := p_payment_method
      );
    exception when others then
      -- F-06: attribute the failure to the seller whose item caused it,
      -- without changing the message, sqlstate, or the fact that this
      -- still aborts the whole transaction.
      raise exception '%', sqlerrm
        using errcode = sqlstate, detail = (v_group ->> 'seller_id');
    end;
    v_created := v_created || v_order.id;
    return next v_order;
  end loop;

  if p_idempotency_key is not null and v_buyer is not null then
    update public.order_idempotency_keys
    set order_ids = v_created
    where buyer_id = v_buyer
      and idempotency_key = p_idempotency_key
      and scope = v_scope;
  end if;

  return;
end;
$$;

commit;
