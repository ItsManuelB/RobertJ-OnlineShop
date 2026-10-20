-- =============================================================================
-- Refund form/dispute workflow: a buyer could ask for a replacement
-- (`request_type = 'replacement_exchange'`), but there was no system path
-- for the seller/admin to actually fulfill one — `decide_return`'s only
-- outcome was a monetary refund. Adds the `replacement_approved` status and
-- the columns `record_return_replacement_shipment` (next migration) writes.
--
-- `ALTER TYPE ... ADD VALUE` kept in its own migration/transaction, same
-- reason as `20260930050000_return_restock_reason_enum.sql`: a newly added
-- enum value cannot be referenced by a function body created in the same
-- transaction that added it. `decide_return`'s `p_resolution_type` param
-- and `record_return_replacement_shipment` (which both reference this
-- value) are the next migration.
--
-- ROLLBACK:
--   alter table public.return_requests
--     drop column replacement_courier,
--     drop column replacement_tracking_number,
--     drop column replacement_shipped_at;
--   -- 'replacement_approved' cannot be dropped from an enum type; if ever
--   -- needed, recreate public.return_status without it and migrate rows.
-- =============================================================================

begin;

alter type public.return_status add value if not exists 'replacement_approved';

alter table public.return_requests
  add column if not exists replacement_courier text null,
  add column if not exists replacement_tracking_number text null,
  add column if not exists replacement_shipped_at timestamptz null;

commit;
