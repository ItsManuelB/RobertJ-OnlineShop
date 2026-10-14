-- =============================================================================
-- Cart — one atomic "add to cart" that cannot exceed stock.
--
-- Until now the app read the cart line, compared it with stock, then wrote —
-- three steps. Two adds at the same moment (two tabs, two devices) could both
-- pass the check and leave more in the cart than exists. (Checkout and
-- create_order re-check and lock stock, so nothing could be oversold; the cart
-- was just wrong.)
--
-- public.add_cart_item does the whole thing in one statement per cart:
--   * takes a transaction-scoped advisory lock keyed on the buyer's cart, so
--     concurrent adds for the same cart run one after another;
--   * checks the product (and option) is active, that an option was chosen
--     when the product has options, and that the existing quantity plus this
--     add does not exceed live stock;
--   * inserts the line or increases its quantity, and returns the new total.
--
-- SECURITY INVOKER on purpose: it runs as the signed-in buyer, so the existing
-- RLS on carts/cart_items still decides what they can touch, and it reads
-- stock only through what a buyer can already read (products.quantity for a
-- plain product, the SECURITY DEFINER get_variant_stock for an option). No
-- table grants change. Error messages are prefixed "CART: " and are written
-- to be shown to the buyer as they are.
--
-- The guest-cart merge on sign-in keeps using direct inserts (it must keep
-- every line, flagged later, as before) — this function is for explicit adds.
--
-- LIVE-DATA CHECK: none needed — adds a function only, no data or table change.
--
-- ROLLBACK:
--   drop function public.add_cart_item(uuid, uuid, integer);
-- =============================================================================

begin;

create or replace function public.add_cart_item(
  p_product_id uuid,
  p_variant_id uuid,
  p_quantity   integer
)
returns table (line_id uuid, total_quantity integer, stock_available integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user      uuid := (select auth.uid());
  v_cart      uuid;
  v_status    public.product_status;
  v_stock     integer;
  v_existing  integer;
  v_line      uuid;
begin
  if v_user is null then
    raise exception 'CART: Please sign in to add items to your cart.' using errcode = '28000';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 999 then
    raise exception 'CART: Choose a quantity between 1 and 999.' using errcode = '22023';
  end if;

  -- The buyer's cart (created on first use; RLS applies as the invoker).
  select c.id into v_cart from public.carts c where c.user_id = v_user;
  if v_cart is null then
    insert into public.carts (user_id) values (v_user)
    on conflict (user_id) do nothing
    returning id into v_cart;
    if v_cart is null then
      select c.id into v_cart from public.carts c where c.user_id = v_user;
    end if;
  end if;

  -- Serialise concurrent adds for this cart until the transaction ends.
  perform pg_advisory_xact_lock(hashtextextended(v_cart::text, 0));

  select p.status, p.quantity into v_status, v_stock
  from public.products p
  where p.id = p_product_id;
  if not found or v_status <> 'active' then
    raise exception 'CART: This item is no longer available.' using errcode = '22023';
  end if;

  if p_variant_id is null then
    if exists (
      select 1 from public.product_variants v
      where v.product_id = p_product_id and v.status = 'active'
    ) then
      raise exception 'CART: Please choose an option first.' using errcode = '22023';
    end if;
  else
    if not exists (
      select 1 from public.product_variants v
      where v.id = p_variant_id and v.product_id = p_product_id and v.status = 'active'
    ) then
      raise exception 'CART: That option is no longer available.' using errcode = '22023';
    end if;
    select coalesce(
      (select g.quantity from public.get_variant_stock(array[p_variant_id]) g limit 1), 0
    ) into v_stock;
  end if;

  v_stock := coalesce(v_stock, 0);
  if v_stock <= 0 then
    raise exception 'CART: This item is sold out.' using errcode = '23514';
  end if;

  select ci.id, ci.quantity into v_line, v_existing
  from public.cart_items ci
  where ci.cart_id = v_cart
    and ci.product_id = p_product_id
    and ci.variant_id is not distinct from p_variant_id;
  v_existing := coalesce(v_existing, 0);

  if v_existing + p_quantity > v_stock then
    if v_existing > 0 then
      raise exception 'CART: You already have % in your cart. Only % available in total.', v_existing, v_stock
        using errcode = '23514';
    end if;
    raise exception 'CART: Only % available.', v_stock using errcode = '23514';
  end if;

  if v_line is null then
    insert into public.cart_items (cart_id, product_id, variant_id, quantity)
    values (v_cart, p_product_id, p_variant_id, p_quantity)
    returning id into v_line;
  else
    update public.cart_items set quantity = v_existing + p_quantity where id = v_line;
  end if;

  return query select v_line, v_existing + p_quantity, v_stock;
end;
$$;

comment on function public.add_cart_item(uuid, uuid, integer) is
  'Atomic add-to-cart for the signed-in buyer: serialised per cart, refuses anything beyond live stock, returns the new line total. SECURITY INVOKER — RLS on carts/cart_items still applies. Messages prefixed "CART: " are buyer-safe.';

revoke all on function public.add_cart_item(uuid, uuid, integer) from public;
grant execute on function public.add_cart_item(uuid, uuid, integer) to authenticated;

commit;
