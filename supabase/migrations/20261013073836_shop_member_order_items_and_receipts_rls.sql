-- =============================================================================
-- Shop-seller access audit: close two RLS gaps found while verifying that
-- shop-mates have EQUAL access regardless of who the literal seller_id is
-- on a record. Both predate the shop-scoping effort entirely (initial
-- schema / 20260807030000) and were missed by
-- 20260927134618_shop_member_order_rls_widening.sql, which widened
-- orders/payments/return_requests/order_shipments but not these two.
--
-- Confirmed live, empirically, before writing this fix: a shop member who
-- is NOT the literal seller_id on an order (but has full access to the
-- order itself via is_shop_member(orders.shop_id)) got ZERO rows back for:
--
-- 1. `order_items` — the order's own line items (fetched as a PostgREST
--    embed inside `ORDER_COLUMNS`/`getDashboardOrder`/`listDashboardOrders`;
--    the embedded child table's RLS is evaluated independently of the
--    parent `orders` row's visibility). Net effect: the order itself was
--    visible and even actionable (Mark as Delivered etc. all still worked,
--    since those don't touch order_items), but the dashboard would have
--    rendered it with an empty items list — the buyer-facing side has the
--    identical bug for a buyer, but buyers aren't shop-scoped so it never
--    surfaced there.
--
-- 2. `storage.objects` for the `payment-receipts` bucket — which, since
--    20260826000000_returns_and_refunds.sql, is also reused for buyer-
--    uploaded return-evidence photos (getReturnEvidenceSignedUrl /
--    uploadReturnEvidence in queries.ts). A shop member responding to a
--    return request on a shop-mate's order could not view the buyer's
--    evidence photo.
--
-- Both fixes are the same additive OR-widening shape used everywhere else
-- in this codebase for this exact purpose — never narrows existing access.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
drop policy if exists "order items follow parent order" on public.order_items;
create policy "order items follow parent order"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.buyer_id = (select auth.uid())
          or o.seller_id = (select auth.uid())
          or public.is_shop_member(o.shop_id)
          or public.is_admin()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- storage.objects (payment-receipts bucket)
-- ---------------------------------------------------------------------------
drop policy if exists "order participants read payment receipts" on storage.objects;
create policy "order participants read payment receipts"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and (o.buyer_id = (select auth.uid())
             or o.seller_id = (select auth.uid())
             or public.is_shop_member(o.shop_id)
             or public.is_admin())
    )
  );

commit;
