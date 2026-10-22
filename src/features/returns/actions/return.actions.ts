"use server";

import { revalidatePath } from "next/cache";

import { DASHBOARD_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import { createRefund } from "@/lib/xendit/client";
import { reconcileXenditRefund } from "@/features/payments/lib/xendit-refund-reconciliation";
import type { Json } from "@/lib/supabase/database.types";
import type { ActionResult } from "@/types/action.types";
import { revalidateOrderSurfaces } from "@/features/orders";
import {
  confirmReplacementReceivedSchema,
  decideReturnSchema,
  recordCodRefundPayoutSchema,
  recordReturnItemConditionSchema,
  recordReturnReceivedSchema,
  recordReturnReplacementShipmentSchema,
  recordReturnShipmentSchema,
  requestReturnSchema,
  respondToReturnSchema,
} from "@/features/returns/schemas/return.schema";
import type {
  AdminReturnDecision,
  CodRefundMethod,
  ReturnItemCondition,
  ReturnRequestType,
  SellerReturnDecision,
} from "@/features/returns/types/return.types";

/**
 * Buyer submits a return/refund/replacement request for one of their own
 * orders, with an optional evidence photo. Ownership, order status
 * (`delivered`, a paid cancellation, or — fulfillment/returns audit finding
 * A1/A3 — a `shipped` order reported `item_not_received` past a short grace
 * period), the "Other" explanation's required-and-length validation, and
 * duplicate-request checks all happen inside the `request_return` RPC
 * (`queries.requestReturn`) — this action validates input and uploads the
 * file, nothing more.
 */
export async function requestReturnAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = requestReturnSchema.safeParse({
    orderId: formData.get("orderId"),
    orderItemId: formData.get("orderItemId") || undefined,
    requestType: formData.get("requestType"),
    reasonCode: formData.get("reasonCode"),
    explanation: formData.get("explanation") || undefined,
    evidence: formData.get("evidence"),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    // Throws when unauthenticated — the action never trusts the client,
    // even though the RPC re-checks ownership independently.
    await queries.requireSessionUser();

    const evidencePath = parsed.data.evidence
      ? await queries.uploadReturnEvidence(parsed.data.orderId, parsed.data.evidence)
      : null;

    await queries.requestReturn(
      parsed.data.orderId,
      parsed.data.orderItemId ?? null,
      parsed.data.reasonCode,
      parsed.data.requestType,
      parsed.data.explanation ?? null,
      evidencePath,
    );

    // A newly filed return is visible to the seller/admin too (their order
    // detail page, plus the admin queue), not just the buyer.
    await revalidateOrderSurfaces(parsed.data.orderId);
    revalidatePath(ROUTES.adminReturns);
    revalidatePath(ROUTES.sellerReturns);
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not submit your return request.",
    );
  }
}

/**
 * The order's own seller, or admin, accepts/rejects a pending return
 * request. Authorization is enforced inside the `respond_to_return` RPC
 * (own order or `is_admin()`); `requireRole` here is defense-in-depth, not
 * the primary boundary.
 */
export async function respondToReturnAction(
  returnId: string,
  decision: SellerReturnDecision,
  note?: string,
): Promise<ActionResult<null>> {
  const parsed = respondToReturnSchema.safeParse({ returnId, decision, note });
  if (!parsed.success) return fail("Invalid request.");

  try {
    await queries.requireRole(DASHBOARD_ROLES);
    const { orderId } = await queries.respondToReturn(
      parsed.data.returnId,
      parsed.data.decision,
      parsed.data.note ?? null,
    );
    // The buyer sees the seller's response on their own order page too, not
    // just seller/admin surfaces.
    await revalidateOrderSurfaces(orderId);
    revalidatePath(ROUTES.adminReturns);
    revalidatePath(ROUTES.sellerReturns);
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not respond to this return request.",
    );
  }
}

/**
 * Admin-only: approves or rejects a return request. Authorization is
 * enforced inside the `decide_return` RPC itself (`is_admin()` re-derived,
 * never trusted from the caller's role claim); `requireRole` here is
 * defense-in-depth, not the primary boundary.
 *
 * Phase 5B: for a COD (or legacy) payment, `decide_return` finalizes
 * immediately exactly as before — nothing else to do here. For a Xendit
 * payment, `decide_return` only submits a pending refund attempt; this
 * action then makes the actual `POST /refunds` call and records the
 * outcome. If Xendit's call itself fails (never even got a response), the
 * attempt is marked failed immediately so the admin can safely retry —
 * `return_requests`/`payments`/`orders` were never touched by the approval
 * step, so there is nothing to undo. If the call succeeds, the attempt
 * stays "pending" from our own database's point of view until the real
 * `refund.succeeded`/`refund.failed` webhook confirms it — this action
 * never marks anything refunded itself.
 *
 * `resolutionType` is only consulted when `decision === "approve"`.
 * `money_refund`/`return_and_refund` run the exact refund logic above,
 * unchanged. `replacement_exchange` skips payment/order_status entirely —
 * `decide_return` moves the request to `replacement_approved` instead, so
 * `getPendingXenditRefundForReturn` below naturally finds nothing and the
 * Xendit branch is a no-op for that outcome.
 */
export async function decideReturnAction(
  returnId: string,
  decision: AdminReturnDecision,
  note?: string,
  resolutionType?: ReturnRequestType,
): Promise<ActionResult<null>> {
  const parsed = decideReturnSchema.safeParse({ returnId, decision, note, resolutionType });
  if (!parsed.success) return fail("Invalid request.");

  try {
    await queries.requireRole(DASHBOARD_ROLES);
    const { orderId } = await queries.decideReturn(
      parsed.data.returnId,
      parsed.data.decision,
      parsed.data.note ?? null,
      parsed.data.resolutionType,
    );

    if (parsed.data.decision === "approve") {
      const pendingRefund = await queries.getPendingXenditRefundForReturn(parsed.data.returnId);
      if (pendingRefund) {
        try {
          const response = await createRefund({
            paymentRequestId: pendingRefund.xenditPaymentRequestId,
            amountCents: pendingRefund.amountCents,
            currency: pendingRefund.currency,
            idempotencyKey: pendingRefund.id,
          });
          await queries.recordXenditRefundSubmission(
            pendingRefund.id,
            response.id,
            response as unknown as Json,
          );
          // Don't wait on the webhook alone: ask Xendit for the refund's real status now (best-effort; the webhook and the 15-minute sweep still settle it if this can't).
          await reconcileXenditRefund(response.id);
        } catch (error) {
          await queries.failXenditRefundSubmission(
            pendingRefund.id,
            error instanceof Error ? error.message : "Xendit refund request failed.",
          );
          return fail(
            "Could not submit the refund to Xendit. Nothing was charged or refunded — you can safely try again.",
          );
        }
      }
    }

    // The buyer sees the refund/rejection on their own order page too, not
    // just seller/admin surfaces.
    revalidatePath(ROUTES.adminReturns);
    revalidatePath(ROUTES.sellerReturns);
    await revalidateOrderSurfaces(orderId);
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not decide this return request.",
    );
  }
}

/**
 * Admin-only: records how a COD buyer was actually paid back (GCash, bank
 * transfer or cash, plus a reference) and finalises the refund. Cash can't be
 * returned through the app, so `decide_return` leaves a COD approval at
 * `refund_due`; this is the step that marks it refunded (payment, order and
 * reports follow). Authorization and every precondition are enforced inside
 * `record_cod_refund_payout`; `requireRole` here is defense-in-depth.
 */
export async function recordCodRefundPayoutAction(
  returnId: string,
  method: CodRefundMethod,
  reference: string,
  note?: string,
): Promise<ActionResult<null>> {
  const parsed = recordCodRefundPayoutSchema.safeParse({ returnId, method, reference, note });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole(DASHBOARD_ROLES);
    const { orderId } = await queries.recordCodRefundPayout(
      parsed.data.returnId,
      parsed.data.method,
      parsed.data.reference,
      parsed.data.note ?? null,
    );
    revalidatePath(ROUTES.adminReturns);
    revalidatePath(ROUTES.sellerReturns);
    await revalidateOrderSurfaces(orderId);
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not record this refund payout.",
    );
  }
}

/**
 * The order's own seller (or admin) records whether a refunded return's
 * item is actually sellable — a separate, deliberate step from
 * `decideReturnAction`: approval never restocks by itself. Authorization is
 * enforced inside `record_return_item_condition` itself (own order's
 * seller_id, shop member, or admin); `requireRole` here is defense-in-depth,
 * not the primary boundary.
 */
export async function recordReturnItemConditionAction(
  returnId: string,
  condition: ReturnItemCondition,
  note?: string,
): Promise<ActionResult<null>> {
  const parsed = recordReturnItemConditionSchema.safeParse({ returnId, condition, note });
  if (!parsed.success) return fail("Invalid request.");

  try {
    await queries.requireRole(DASHBOARD_ROLES);
    const { orderId } = await queries.recordReturnItemCondition(
      parsed.data.returnId,
      parsed.data.condition,
      parsed.data.note ?? null,
    );
    await revalidateOrderSurfaces(orderId);
    revalidatePath(ROUTES.adminReturns);
    revalidatePath(ROUTES.sellerReturns);
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not record this item's condition.",
    );
  }
}

/**
 * The order's own seller (or admin) ships the replacement item for a
 * `replacement_approved` return request — the sole write path for
 * `record_return_replacement_shipment`. Authorization and the
 * `replacement_approved`/not-already-shipped preconditions are enforced
 * inside the RPC itself; `requireRole` here is defense-in-depth.
 */
export async function recordReturnReplacementShipmentAction(
  returnId: string,
  courier: string,
  trackingNumber: string,
): Promise<ActionResult<null>> {
  const parsed = recordReturnReplacementShipmentSchema.safeParse({
    returnId,
    courier,
    trackingNumber,
  });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole(DASHBOARD_ROLES);
    const { orderId } = await queries.recordReturnReplacementShipment(
      parsed.data.returnId,
      parsed.data.courier,
      parsed.data.trackingNumber,
    );
    await revalidateOrderSurfaces(orderId);
    revalidatePath(ROUTES.adminReturns);
    revalidatePath(ROUTES.sellerReturns);
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not record this replacement shipment.",
    );
  }
}

/**
 * The BUYER enters the courier + tracking number of the parcel they are sending
 * back for an approved Return and Refund. Ownership, the `awaiting_return`
 * state and the 5-day deadline are enforced inside `record_return_shipment`;
 * this action only needs a signed-in user (not a dashboard role).
 */
export async function recordReturnShipmentAction(
  returnId: string,
  courier: string,
  trackingNumber: string,
): Promise<ActionResult<null>> {
  const parsed = recordReturnShipmentSchema.safeParse({ returnId, courier, trackingNumber });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireSessionUser();
    const { orderId } = await queries.recordReturnShipment(
      parsed.data.returnId,
      parsed.data.courier,
      parsed.data.trackingNumber,
    );
    await revalidateOrderSurfaces(orderId);
    revalidatePath(ROUTES.adminReturns);
    revalidatePath(ROUTES.sellerReturns);
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not record your return shipment.",
    );
  }
}

/**
 * The order's seller (or shop member / admin) confirms the returned parcel
 * arrived and records whether the item is sellable. A sellable item is
 * restocked inside `record_return_received`; the request then waits for the
 * admin to confirm the refund. `requireRole` is defense-in-depth — ownership is
 * enforced inside the RPC.
 */
export async function recordReturnReceivedAction(
  returnId: string,
  condition: ReturnItemCondition,
  note?: string,
): Promise<ActionResult<null>> {
  const parsed = recordReturnReceivedSchema.safeParse({ returnId, condition, note });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole(DASHBOARD_ROLES);
    const { orderId } = await queries.recordReturnReceived(
      parsed.data.returnId,
      parsed.data.condition,
      parsed.data.note ?? null,
    );
    await revalidateOrderSurfaces(orderId);
    revalidatePath(ROUTES.adminReturns);
    revalidatePath(ROUTES.sellerReturns);
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not record this received return.",
    );
  }
}

/**
 * The BUYER confirms the replacement arrived, completing the request. Ownership
 * and the `replacement_shipped` state are enforced inside
 * `confirm_replacement_received`; this only needs a signed-in user.
 */
export async function confirmReplacementReceivedAction(
  returnId: string,
): Promise<ActionResult<null>> {
  const parsed = confirmReplacementReceivedSchema.safeParse({ returnId });
  if (!parsed.success) return fail("Invalid request.");

  try {
    await queries.requireSessionUser();
    const { orderId } = await queries.confirmReplacementReceived(parsed.data.returnId);
    await revalidateOrderSurfaces(orderId);
    revalidatePath(ROUTES.adminReturns);
    revalidatePath(ROUTES.sellerReturns);
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not confirm your replacement.",
    );
  }
}
