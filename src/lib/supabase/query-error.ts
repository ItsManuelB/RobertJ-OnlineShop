import "server-only";

/**
 * Error-hygiene helpers for the service layer (audit finding F-B1).
 *
 * Raw PostgREST / `pg` / Storage error messages expose DB internals — table,
 * column and constraint names, "permission denied for table …", RLS-violation
 * text — which must never reach the client through `ActionResult.error`. These
 * helpers log the full raw error server-side (for diagnostics) and return an
 * Error whose message is safe to surface.
 */

/** Fields we log; common to Postgrest/Storage/Auth error objects. */
type LoggableError = {
  message: string | null;
  code: string | number | null;
  details: string | null;
  hint: string | null;
};

function extract(error: unknown): LoggableError {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    return {
      message: typeof e.message === "string" ? e.message : null,
      code:
        typeof e.code === "string" || typeof e.code === "number"
          ? e.code
          : null,
      details: typeof e.details === "string" ? e.details : null,
      hint: typeof e.hint === "string" ? e.hint : null,
    };
  }
  return { message: typeof error === "string" ? error : null, code: null, details: null, hint: null };
}

/**
 * Logs the full raw error server-side and returns an Error carrying ONLY
 * `context` — a friendly, caller-authored message. Use for table/PostgREST and
 * Storage errors, whose raw `.message` is never appropriate for the client.
 */
export function queryError(context: string, error: unknown): Error {
  console.error(`[queries] ${context}`, extract(error));
  return new Error(context);
}

/**
 * Like `queryError`, but preserves the raw `.message` in the returned Error —
 * for SECURITY DEFINER RPCs that intentionally `RAISE EXCEPTION` with curated,
 * user-facing business messages ("Only 2 left of …", "Cannot deactivate an
 * admin"). Falls back to `context` when the RPC returned no message.
 */
export function rpcError(context: string, error: unknown): Error {
  const e = extract(error);
  console.error(`[queries] ${context}`, e);
  return new Error(e.message && e.message.trim().length > 0 ? e.message : context);
}

/**
 * Thrown by `createOrderGroup` when `create_order_group`'s per-seller
 * attribution (F-06) identifies which seller's item caused the all-or-nothing
 * group checkout to fail. `sellerId` is `null` when the RPC failed for a
 * reason that was never seller-specific (e.g. "Duplicate order submission"),
 * in which case the caller should fall back to the generic message.
 */
export class GroupOrderError extends Error {
  constructor(
    message: string,
    public readonly sellerId: string | null,
  ) {
    super(message);
    this.name = "GroupOrderError";
  }
}

/**
 * Like `rpcError`, but for `create_order_group` specifically: preserves the
 * raw `.message` (same curated-business-message trust as `rpcError`) and
 * additionally extracts the failing seller's id from the Postgres `DETAIL`
 * field `create_order_group` attaches on a per-seller failure, so the caller
 * can attribute the error back to one seller group instead of showing one
 * opaque message for the whole multi-seller checkout.
 */
export function groupOrderError(context: string, error: unknown): GroupOrderError {
  const e = extract(error);
  console.error(`[queries] ${context}`, e);
  const message = e.message && e.message.trim().length > 0 ? e.message : context;
  const sellerId = e.details && e.details.trim().length > 0 ? e.details : null;
  return new GroupOrderError(message, sellerId);
}

/**
 * Like `rpcError`, but only trusts the RPC's raised `.message` when its
 * error code is in `allowedCodes` — the exact `errcode`s that specific RPC
 * is documented to `RAISE EXCEPTION ... using errcode = '…'` with for its
 * own curated, user-facing business messages (e.g. "Only sellers can be
 * demoted to buyer"). Any other code — an unexpected constraint violation,
 * a connection error, an internal Postgres failure — falls back to
 * `context` instead of leaking raw Postgres text. `rpcError` alone trusts
 * every RPC-raised message unconditionally, which is only safe for an RPC
 * that truly never raises anything else; this is for ones where that
 * guarantee needs to be explicit rather than assumed.
 */
export function curatedRpcError(
  context: string,
  error: unknown,
  allowedCodes: readonly string[],
): Error {
  const e = extract(error);
  console.error(`[queries] ${context}`, e);
  const trusted = e.code != null && allowedCodes.includes(String(e.code));
  return new Error(trusted && e.message && e.message.trim().length > 0 ? e.message : context);
}
