-- =============================================================================
-- Restore the buyer's ability to upload a return-evidence photo.
--
-- Root cause: 20260905155806_remove_qr_manual_verification_flow.sql dropped the
-- INSERT policy "buyers upload receipts for their own orders" on
-- storage.objects to stop new QR receipts. But return requests reuse the same
-- private `payment-receipts` bucket for evidence photos
-- (`uploadReturnEvidence`), so since then every upload was rejected by RLS and
-- "Submit report" failed with "Failed to upload evidence photo".
--
-- Fix: a narrower INSERT policy than the original. It only allows the order's
-- own buyer to write objects named `<order id>/return-<...>` — the exact shape
-- `uploadReturnEvidence` produces — so QR-style receipt uploads stay closed.
-- Bucket limits (5 MB; jpeg/png/webp) still apply. No UPDATE/DELETE policy.
--
-- ROLLBACK: drop policy "buyers upload return evidence for their own orders"
-- on storage.objects;
-- =============================================================================

begin;

drop policy if exists "buyers upload return evidence for their own orders" on storage.objects;
create policy "buyers upload return evidence for their own orders"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and storage.filename(name) like 'return-%'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.buyer_id = (select auth.uid())
    )
  );

commit;
