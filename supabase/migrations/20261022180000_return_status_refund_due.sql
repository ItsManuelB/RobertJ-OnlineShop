-- =============================================================================
-- New return_status value `refund_due`: a COD refund the admin has approved but
-- not yet paid out. Added on its own (and committed) before anything uses it,
-- because a new enum value cannot be referenced in the same transaction that
-- creates it. The columns, RPCs and index that use it are in
-- 20261022180100_cod_refund_payout.sql.
-- Additive and idempotent; enum values cannot be dropped, so there is no
-- rollback beyond leaving it unused.
-- =============================================================================

alter type public.return_status add value if not exists 'refund_due';
