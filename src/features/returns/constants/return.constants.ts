/**
 * Audit finding F-09: how long after delivery (or a paid cancellation) a
 * buyer may still file a return. The authoritative enforcement is the
 * `request_return` RPC (see `supabase/migrations/
 * 20261011174440_return_request_eligibility_window.sql`) — this constant is
 * the single source for any UI copy that needs to state the policy, kept in
 * sync with that migration's literal `interval '7 days'`.
 */
export const RETURN_WINDOW_DAYS = 7;
