-- =============================================================================
-- New enum values for the Replacement/Exchange flow, added on their own (and
-- committed) before anything uses them:
--   return_status.replacement_shipped    : the seller shipped the replacement
--   return_status.replacement_completed  : the buyer confirmed receipt, or it
--                                          auto-completed 7 days after shipping
--   stock_adjustment_reason.replacement_shipment : stock deducted when a
--                                          replacement ships (not a sale)
-- The columns, index and RPCs that use them are in
-- 20261023010100_replacement_shipping_and_completion.sql.
-- Additive and idempotent; enum values cannot be dropped.
-- =============================================================================

alter type public.return_status add value if not exists 'replacement_shipped';
alter type public.return_status add value if not exists 'replacement_completed';
alter type public.stock_adjustment_reason add value if not exists 'replacement_shipment';
