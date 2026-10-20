-- =============================================================================
-- Cleanup: `CREATE OR REPLACE FUNCTION` only replaces a function with an
-- identical parameter list. `20261020020000_return_request_taxonomy.sql`
-- and `20261020030000_return_overdue_admin_escalation.sql` widened
-- `request_return`'s and `decide_return`'s signatures, which meant the
-- *old* signatures were left behind as separate, still-callable overloads
-- running the pre-fix logic (no shipped/item_not_received carve-out, no
-- structured reason, no overdue-pending override, no replacement branch) —
-- caught via the security advisor after applying, not before.
--
-- Confirmed safe to drop: `src/lib/supabase/queries.ts`'s `requestReturn`/
-- `decideReturn` always call with the full new named-argument set (which
-- the old overloads don't have parameters for, so they could never
-- accidentally resolve to them) — but a raw PostgREST caller supplying only
-- the old parameter names could have silently hit stale logic. Dropping the
-- old overloads removes that path entirely, leaving exactly one version of
-- each function.
--
-- ROLLBACK: recreate the old-signature functions from
--   20261011174440_return_request_eligibility_window.sql (request_return)
--   20260930070000_refund_sets_order_status.sql (decide_return)
-- =============================================================================

begin;

drop function if exists public.request_return(uuid, uuid, text, text);
drop function if exists public.decide_return(uuid, text, text);

commit;
