import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Maps Postgres error codes (SQLSTATE) thrown by the service layer to friendly
 * copy, so a raw constraint/index message never reaches the UI (mirrors the
 * `mapAuthError` pattern in `features/auth/constants/auth-errors.ts`, keyed on
 * `.code` instead of a `.message` regex since these come from PostgREST/`pg`,
 * not Supabase Auth). Rules are checked in order; the first matching `code`
 * (and `test`, if present) wins.
 */
const KNOWN_ERRORS: Array<{
  code: string;
  test?: (error: PostgrestError) => boolean;
  message: string;
}> = [
  {
    code: "23505",
    test: (error) => /username/i.test(error.message),
    message: "That username is already taken.",
  },
  { code: "23505", message: "That value is already in use." },
  {
    // Raised by `profiles_enforce_username_change_once` — the trigger's
    // message is already friendly, so pass it through verbatim instead of
    // falling into the generic 23514 copy below.
    code: "23514",
    test: (error) => /username can only be changed once/i.test(error.message),
    message: "Username can only be changed once.",
  },
  { code: "23514", message: "That value isn't valid." },
  { code: "23503", message: "That item no longer exists." },
];

/**
 * Error codes this app's own `SECURITY DEFINER` RPCs use for `RAISE
 * EXCEPTION` business-rule messages (ownership, state preconditions, "sign in
 * required," not-found) — e.g. `confirm_order_received`,
 * `record_order_shipment`, `request_return`, `decide_return`,
 * `mark_cod_payment_collected`. Every such message is hand-written,
 * human-readable copy (never a raw constraint/column name), so passing it
 * through verbatim is exactly the "friendly copy" this function exists to
 * produce — unlike the codes above, these don't have one fixed message
 * because the same code is reused for many distinct preconditions.
 */
const PASSTHROUGH_CODES = new Set(["42501", "22023", "P0002", "28000"]);

/** Maps a Postgres error to friendly copy, or `fallback` when nothing matches. */
export function mapPostgresError(
  error: PostgrestError,
  fallback: string,
): string {
  for (const rule of KNOWN_ERRORS) {
    if (error.code === rule.code && (!rule.test || rule.test(error))) {
      return rule.message;
    }
  }
  if (error.code && PASSTHROUGH_CODES.has(error.code) && error.message) {
    return error.message;
  }
  return fallback;
}
