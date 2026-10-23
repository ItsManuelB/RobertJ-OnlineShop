-- =============================================================================
-- Order-cancellation refunds, step 1 of 2: a new return reason code.
--
-- A refund opened automatically because an order was cancelled (or because a
-- payment arrived after the order was cancelled) is recorded as a system-
-- approved row in `return_requests`, so the existing refund pipeline
-- (xendit_refunds, process_xendit_refund_webhook, the admin retry path, the
-- refund-aware reports) handles it with no parallel system. That row needs a
-- reason code that is not one of the buyer-selectable ones.
--
-- Kept in its own migration: a value added to an enum cannot be referenced
-- inside the same transaction that adds it (same precedent as
-- 20261022180000_return_status_refund_due.sql). Additive and idempotent.
--
-- ROLLBACK: enum values cannot be dropped. Leaving 'order_cancelled' in place
-- is harmless; the buyer-facing return form never offers it.
-- =============================================================================

alter type public.return_reason_code add value if not exists 'order_cancelled';
