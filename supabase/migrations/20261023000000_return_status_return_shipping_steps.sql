-- =============================================================================
-- New return_status values for the "Return and Refund" flow (ship the item back
-- before the refund). Added on their own, and committed, before anything uses
-- them: a new enum value cannot be referenced in the transaction that creates
-- it. The columns, index and RPCs that use them are in
-- 20261023000100_return_and_refund_shipping.sql.
--   awaiting_return : admin approved; the buyer must ship the item back
--   return_shipped  : buyer entered courier + tracking
--   return_received : seller received and inspected it; ready for refund
--   return_expired  : buyer did not ship in time (terminal)
-- Additive and idempotent; enum values cannot be dropped.
-- =============================================================================

alter type public.return_status add value if not exists 'awaiting_return';
alter type public.return_status add value if not exists 'return_shipped';
alter type public.return_status add value if not exists 'return_received';
alter type public.return_status add value if not exists 'return_expired';
