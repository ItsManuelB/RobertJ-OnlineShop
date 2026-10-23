"use server";

import { revalidatePath } from "next/cache";

import { ORDER_STATUS, type OrderStatus } from "@/constants/status";
import { DASHBOARD_ROLES, USER_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import type { ActionResult } from "@/types/action.types";
import {
  RECONCILIATION_RETRY_MESSAGE,
  isStaleXenditAttempt,
  reconcileStaleXenditAttempt,
} from "@/features/payments/lib/xendit-reconciliation";
import {
  advanceOrderStatusSchema,
  bulkOrderIdsSchema,
  bulkShipmentsSchema,
  cancelOrderSchema,
  confirmOrderReceivedSchema,
  dashboardOrderExportFiltersSchema,
  recordShipmentSchema,
  respondToCancellationSchema,
  retryOrderRefundSchema,
  scanOrderNumberSchema,
  scanOrderNumbersSchema,
} from "@/features/orders/schemas/order.schema";
import { submitCancellationRefundsSafely } from "@/features/payments/lib/cancellation-refund";
import { cancellationConfirmationMessage } from "@/features/orders/utils/cancellation-refund";
import { formatCurrency } from "@/lib/utils/currency";
import type { Order, OrderItem, OrderListParams } from "@/features/orders/types/order.types";

/** What the scan-to-pack popup shows for a To Pack order. */
export interface ScannedOrderSummary {
  orderNumber: string;
  buyerName: string | null;
  items: OrderItem[];
}

export interface ScannedOrderResolution {
  orderId: string;
  status: OrderStatus;
  /** Present only for a To Pack (`confirmed`) order. */
  summary?: ScannedOrderSummary;
}

/**
 * Fix #5B: before letting a cancellation through, resolve any stale (by the
 * fix #4 clock) finalized Xendit payment attached to this order or its
 * checkout group against Xendit's real status — reusing the exact fix #5A
 * building blocks, never duplicating payment-status logic. A still-active
 * (non-stale) attempt needs no Xendit call here at all; the existing
 * `enforce_order_update_rules` guard already blocks cancellation for it.
 *
 * Ordering matters: this MUST run, and complete, before the actual
 * `order_status = 'cancelled'` update is issued. `process_xendit_webhook`
 * has its own "order already cancelled" guard that silently no-ops once the
 * order is cancelled — reconciling afterward would be a permanent no-op and
 * defeat the entire point of this check.
 *
 * Returns an `ActionResult` (always `success: false`) if the cancellation
 * must be blocked, or `null` if it's safe to proceed.
 */
async function blockCancellationIfXenditUnresolved(
  orderId: string,
): Promise<ActionResult<never> | null> {
  const candidates = await queries.getFinalizedPendingXenditAttemptsForCancellation(orderId);

  for (const candidate of candidates) {
    if (!isStaleXenditAttempt(candidate.attempt)) continue;

    const outcome = await reconcileStaleXenditAttempt(
      candidate.referenceId,
      candidate.channelCode,
      candidate.attempt,
    );
    if (outcome === "blocked") {
      return fail(RECONCILIATION_RETRY_MESSAGE);
    }
    // "already_paid" or "cleared_for_retry": the ledger is now accurate for
    // this candidate (paid orders remain cancellable, unchanged from
    // today; a genuinely failed/expired attempt no longer blocks anything).
    // Continue checking any other stale candidate before proceeding.
  }

  return null;
}

/**
 * Cancels one of the signed-in buyer's own orders. Ownership + the
 * cancellable-state rule are enforced server-side in `queries.cancelBuyerOrder`
 * (RLS is the final boundary).
 */
export async function cancelOrderAction(
  orderId: string,
  reason: string,
): Promise<ActionResult<{ message: string }>> {
  const parsed = cancelOrderSchema.safeParse({ orderId, reason });
  if (!parsed.success) {
    return fromZodError(parsed.error);
  }

  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`cancelOrder:${user.id}`, 10, 60);

    const blocked = await blockCancellationIfXenditUnresolved(parsed.data.orderId);
    if (blocked) return blocked;

    // One transaction: cancel + restock + (if paid) open the automatic refund.
    const result = await queries.cancelBuyerOrder(parsed.data.orderId, parsed.data.reason);
    // Hand the refund to Xendit now; if that call fails the attempt stays
    // visible as "needs attention" and the sweep retries it.
    if (result.refund.needsSubmission) {
      await submitCancellationRefundsSafely(parsed.data.orderId);
    }
    // Cancellation is visible to the seller/admin too (order disappears from
    // their active queues, stock restores) — revalidate all three surfaces,
    // not just the buyer's own.
    await revalidateOrderSurfaces(parsed.data.orderId);
    revalidatePath(ROUTES.account, "layout");
    return ok({ message: cancellationConfirmationMessage(result.refund, formatCurrency) });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not cancel the order.",
    );
  }
}

/**
 * Buyer asks the seller to cancel an order that is already being prepared.
 * The `request_order_cancellation` RPC enforces ownership and the status rule
 * and is idempotent while a request is pending.
 */
export async function requestOrderCancellationAction(
  orderId: string,
  reason: string,
): Promise<ActionResult<{ message: string }>> {
  const parsed = cancelOrderSchema.safeParse({ orderId, reason });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`requestCancellation:${user.id}`, 10, 60);
    await queries.requestOrderCancellation(parsed.data.orderId, parsed.data.reason);
    await revalidateOrderSurfaces(parsed.data.orderId);
    return ok({
      message: "Cancellation requested. The shop will review it — you won't be charged extra, and a paid order is refunded automatically if it is approved.",
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not send your cancellation request.");
  }
}

/**
 * Seller / shop member / admin approves or declines a buyer's cancellation
 * request. Approval cancels the order in the database (stock restored, refund
 * opened by trigger); this then hands that refund to Xendit.
 */
export async function respondToCancellationRequestAction(
  requestId: string,
  decision: "approve" | "reject",
  note?: string,
): Promise<ActionResult<{ message: string }>> {
  const parsed = respondToCancellationSchema.safeParse({ requestId, decision, note });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`respondCancellation:${user.id}`, 30, 60);
    const result = await queries.respondToCancellationRequest(
      parsed.data.requestId,
      parsed.data.decision,
      parsed.data.note ?? null,
    );
    if (result.refund.needsSubmission) await submitCancellationRefundsSafely(result.orderId);
    await revalidateOrderSurfaces(result.orderId);

    const message =
      result.outcome === "approved"
        ? "Cancellation approved. The order is cancelled and any payment is being refunded."
        : result.outcome === "rejected"
          ? "Cancellation declined. The buyer can see your reason."
          : "This request is out of date: the order is no longer being prepared.";
    return ok({ message });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not respond to this request.");
  }
}

/**
 * Seller / shop member / admin recovery for a refund that failed: opens one new
 * attempt (refused by the database while one is pending or already succeeded, so
 * it can never double-refund) and sends it to Xendit.
 */
export async function retryOrderRefundAction(
  returnRequestId: string,
  orderId: string,
): Promise<ActionResult<null>> {
  const parsed = retryOrderRefundSchema.safeParse({ returnRequestId });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`retryOrderRefund:${user.id}`, 10, 60);
    const state = await queries.retryOrderRefund(parsed.data.returnRequestId);
    if (state.needsSubmission) await submitCancellationRefundsSafely(orderId);
    await revalidateOrderSurfaces(orderId);
    return ok(null);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not retry this refund.");
  }
}

/**
 * Buyer confirms receipt of one of their own delivered orders — the
 * "everything arrived as expected" completion path, kept separate from
 * `requestReturnAction` (the "something's wrong" path). Ownership and the
 * delivered/not-already-confirmed preconditions are enforced inside
 * `confirm_order_received` itself.
 */
export async function confirmOrderReceivedAction(orderId: string): Promise<ActionResult<null>> {
  const parsed = confirmOrderReceivedSchema.safeParse({ orderId });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`confirmOrderReceived:${user.id}`, 10, 60);
    await queries.confirmOrderReceived(parsed.data.orderId);
    await revalidateOrderSurfaces(parsed.data.orderId);
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not confirm receipt of this order.",
    );
  }
}

/**
 * Revalidates every surface that renders an order's status/tracking.
 * `async` (despite no `await` in its body) because every export from a
 * `"use server"` file is treated as a Server Action, and Next.js requires
 * Server Actions to be async — even this internal, cache-invalidation-only
 * helper shared with `return.actions.ts`.
 */
export async function revalidateOrderSurfaces(orderId: string): Promise<void> {
  revalidatePath(ROUTES.adminOrders, "layout");
  revalidatePath(ROUTES.adminOrderDetail(orderId), "layout");
  revalidatePath(ROUTES.sellerOrders, "layout");
  revalidatePath(ROUTES.sellerOrderDetail(orderId), "layout");
  revalidatePath(ROUTES.orderDetail(orderId), "layout");
  revalidatePath(ROUTES.orders, "layout");
}

/**
 * Advances (or cancels) an order's fulfilment status from the dashboard — the
 * single user-facing status write path. One action for every transition:
 *
 *  - `shipped`: requires `shipment` (courier + tracking). Routes to the
 *    `record_order_shipment` RPC, which saves tracking **and** flips the
 *    status to `shipped` atomically. No parallel shipment action exists.
 *  - `processing`: after advancing, records a `packed_at` audit timestamp
 *    (the To Pack item-verification gate is enforced in the UI + the fact
 *    that only a `confirmed` order can transition here).
 *  - everything else (`confirmed`, `delivered`, `cancelled`): the existing
 *    `advanceOrderStatus` path unchanged.
 *
 * Revalidates the dashboard list/detail *and* the buyer-facing detail page so
 * neither side shows a stale status/tracking.
 */
export async function advanceOrderStatusAction(
  orderId: string,
  newStatus: string,
  shipment?: { courier: string; trackingNumber: string },
  reason?: string,
): Promise<ActionResult<Order>> {
  const parsed = advanceOrderStatusSchema.safeParse({ orderId, newStatus, reason });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`advanceOrderStatus:${user.id}`, 30, 60);

    // Shipped carries tracking data and must save it atomically with the
    // status flip — handled by the record_order_shipment RPC.
    if (parsed.data.newStatus === "shipped") {
      const parsedShipment = recordShipmentSchema.safeParse({
        orderId,
        courier: shipment?.courier,
        trackingNumber: shipment?.trackingNumber,
      });
      if (!parsedShipment.success) return fromZodError(parsedShipment.error);

      await queries.recordOrderShipment(
        parsedShipment.data.orderId,
        parsedShipment.data.courier,
        parsedShipment.data.trackingNumber,
      );
      const order = await queries.getDashboardOrder(
        parsed.data.orderId,
        user.role === USER_ROLES.admin
          ? null
          : { sellerId: user.id, shopId: await queries.getOwnShopId(user.id) },
      );
      if (!order) return fail("Could not load the updated order.");
      await revalidateOrderSurfaces(order.id);
      return ok(order);
    }

    if (parsed.data.newStatus === "cancelled") {
      const blocked = await blockCancellationIfXenditUnresolved(parsed.data.orderId);
      if (blocked) return blocked;
    }

    // Defense-in-depth beyond RLS: a non-admin's own seller_id/shop_id is
    // enforced again here.
    const order = await queries.advanceOrderStatus(
      parsed.data.orderId,
      parsed.data.newStatus,
      user.role === USER_ROLES.admin
        ? null
        : { sellerId: user.id, shopId: await queries.getOwnShopId(user.id) },
      parsed.data.reason,
    );

    // A seller/admin cancellation of a paid order opened its refund in the
    // database (trigger); hand it to Xendit. No-op when nothing is pending.
    if (parsed.data.newStatus === "cancelled") {
      await submitCancellationRefundsSafely(order.id);
    }

    // Ready for Pickup: record the packing audit timestamp (advisory; the
    // transition above is the authoritative state change).
    if (parsed.data.newStatus === "processing") {
      await queries.markOrderPacked(order.id, order.sellerId);
    }

    await revalidateOrderSurfaces(order.id);
    return ok(order);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not update the order.",
    );
  }
}

/**
 * Bulk-confirms every selected order (pending → confirmed) from the
 * dashboard table's bulk-actions bar. Each order goes through the same
 * `queries.advanceOrderStatus` write as the single-order path — just without
 * calling `advanceOrderStatusAction` itself, since its own per-call rate
 * limit (30/60s) would start rejecting rows partway through a legitimately
 * large batch. Partial failure is expected (e.g. another session already
 * moved an order out of "pending") and reported back per order rather than
 * aborting the rest.
 */
export async function bulkConfirmOrdersAction(
  orderIds: string[],
): Promise<ActionResult<{ updated: number; failed: Array<{ orderId: string; error: string }> }>> {
  const parsed = bulkOrderIdsSchema.safeParse(orderIds);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`bulkConfirmOrders:${user.id}`, 10, 60);
    const owner =
      user.role === USER_ROLES.admin
        ? null
        : { sellerId: user.id, shopId: await queries.getOwnShopId(user.id) };

    const failed: Array<{ orderId: string; error: string }> = [];
    let updated = 0;
    for (const orderId of parsed.data) {
      try {
        await queries.advanceOrderStatus(orderId, ORDER_STATUS.confirmed, owner);
        updated += 1;
      } catch (error) {
        failed.push({
          orderId,
          error: error instanceof Error ? error.message : "Could not confirm this order.",
        });
      }
    }

    if (updated > 0) {
      revalidatePath(ROUTES.adminOrders, "layout");
      revalidatePath(ROUTES.sellerOrders, "layout");
      revalidatePath(ROUTES.orders, "layout");
    }
    return ok({ updated, failed });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not confirm the selected orders.");
  }
}

/**
 * Bulk To Pack → Ready for Pickup from the dashboard table's bulk-actions bar.
 * Each order goes through the same `queries.advanceOrderStatus` transition and
 * `markOrderPacked` audit stamp as the single-order path (`advanceOrderStatusAction`
 * with `processing`) — minus that action's per-call rate limit, which would
 * reject rows partway through a legitimate batch. The seller's batch-level
 * "I've checked these items" acknowledgement happens in the UI; the server only
 * ever moves orders that are still To Pack (the transition table rejects the
 * rest), and reports each failure per order instead of aborting the batch.
 */
export async function bulkMarkReadyForPickupAction(
  orderIds: string[],
): Promise<ActionResult<{ updated: number; failed: Array<{ orderId: string; error: string }> }>> {
  const parsed = bulkOrderIdsSchema.safeParse(orderIds);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`bulkReadyForPickup:${user.id}`, 10, 60);
    const owner =
      user.role === USER_ROLES.admin
        ? null
        : { sellerId: user.id, shopId: await queries.getOwnShopId(user.id) };

    const failed: Array<{ orderId: string; error: string }> = [];
    let updated = 0;
    for (const orderId of parsed.data) {
      try {
        const order = await queries.advanceOrderStatus(orderId, ORDER_STATUS.processing, owner);
        updated += 1;
        // Advisory audit timestamp — the transition above is authoritative, so
        // a failure here must not report the order as failed.
        try {
          await queries.markOrderPacked(order.id, order.sellerId);
        } catch {
          // packed_at is best-effort, same as the single-order path's intent.
        }
      } catch (error) {
        failed.push({
          orderId,
          error: error instanceof Error ? error.message : "Could not mark this order ready for pickup.",
        });
      }
    }

    if (updated > 0) {
      revalidatePath(ROUTES.adminOrders, "layout");
      revalidatePath(ROUTES.sellerOrders, "layout");
      revalidatePath(ROUTES.orders, "layout");
    }
    return ok({ updated, failed });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update the selected orders.");
  }
}

/**
 * Bulk Shipped → Delivered from the dashboard table's bulk-actions bar. Each
 * order goes through the same `queries.advanceOrderStatus` transition as the
 * single-order path (`advanceOrderStatusAction` with `delivered`), which only
 * allows it from `shipped`. Delivery is final, so the seller's review and
 * acknowledgement happen in the UI before this is called. Failures are
 * reported per order instead of aborting the batch. COD cash collection is a
 * separate action (`markCodPaymentCollectedAction`) and is NOT touched here —
 * the courier may remit the money later.
 */
export async function bulkMarkDeliveredAction(
  orderIds: string[],
): Promise<ActionResult<{ updated: number; failed: Array<{ orderId: string; error: string }> }>> {
  const parsed = bulkOrderIdsSchema.safeParse(orderIds);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`bulkMarkDelivered:${user.id}`, 10, 60);
    const owner =
      user.role === USER_ROLES.admin
        ? null
        : { sellerId: user.id, shopId: await queries.getOwnShopId(user.id) };

    const failed: Array<{ orderId: string; error: string }> = [];
    let updated = 0;
    for (const orderId of parsed.data) {
      try {
        await queries.advanceOrderStatus(orderId, ORDER_STATUS.delivered, owner);
        updated += 1;
      } catch (error) {
        failed.push({
          orderId,
          error: error instanceof Error ? error.message : "Could not mark this order delivered.",
        });
      }
    }

    if (updated > 0) {
      revalidatePath(ROUTES.adminOrders, "layout");
      revalidatePath(ROUTES.sellerOrders, "layout");
      revalidatePath(ROUTES.orders, "layout");
    }
    return ok({ updated, failed });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update the selected orders.");
  }
}

/**
 * Bulk Ready for Pickup → Shipped. Each entry carries its own courier and
 * tracking number (tracking is unique per parcel, so it can't be shared across
 * orders), and each goes through the same `record_order_shipment` RPC as the
 * single-order path — ownership, status and payment are re-checked inside it
 * per order. No new rule: tracking is still required. Failures are reported
 * per order instead of aborting the batch; the per-call rate limit of the
 * single-order action is deliberately not reused (it would reject rows
 * partway through a legitimate batch).
 */
export async function bulkMarkShippedAction(
  shipments: Array<{ orderId: string; courier: string; trackingNumber: string }>,
): Promise<ActionResult<{ updated: number; failed: Array<{ orderId: string; error: string }> }>> {
  const parsed = bulkShipmentsSchema.safeParse(shipments);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`bulkMarkShipped:${user.id}`, 10, 60);

    const failed: Array<{ orderId: string; error: string }> = [];
    let updated = 0;
    for (const entry of parsed.data) {
      try {
        await queries.recordOrderShipment(entry.orderId, entry.courier, entry.trackingNumber);
        updated += 1;
      } catch (error) {
        failed.push({
          orderId: entry.orderId,
          error: error instanceof Error ? error.message : "Could not mark this order shipped.",
        });
      }
    }

    if (updated > 0) {
      revalidatePath(ROUTES.adminOrders, "layout");
      revalidatePath(ROUTES.sellerOrders, "layout");
      revalidatePath(ROUTES.orders, "layout");
    }
    return ok({ updated, failed });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update the selected orders.");
  }
}

/**
 * Bulk-cancels every selected order from the dashboard table's bulk-actions
 * bar. Same per-order Xendit-reconciliation guard as the single-order path
 * (`blockCancellationIfXenditUnresolved`) — an order still resolves its own
 * in-flight payment before being cancelled, one at a time.
 */
export async function bulkCancelOrdersAction(
  orderIds: string[],
): Promise<ActionResult<{ updated: number; failed: Array<{ orderId: string; error: string }> }>> {
  const parsed = bulkOrderIdsSchema.safeParse(orderIds);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`bulkCancelOrders:${user.id}`, 10, 60);
    const owner =
      user.role === USER_ROLES.admin
        ? null
        : { sellerId: user.id, shopId: await queries.getOwnShopId(user.id) };

    const failed: Array<{ orderId: string; error: string }> = [];
    let updated = 0;
    for (const orderId of parsed.data) {
      try {
        const blocked = await blockCancellationIfXenditUnresolved(orderId);
        if (blocked) {
          failed.push({ orderId, error: blocked.success ? "Could not cancel this order." : blocked.error });
          continue;
        }
        await queries.advanceOrderStatus(orderId, ORDER_STATUS.cancelled, owner);
        updated += 1;
        await submitCancellationRefundsSafely(orderId);
      } catch (error) {
        failed.push({
          orderId,
          error: error instanceof Error ? error.message : "Could not cancel this order.",
        });
      }
    }

    if (updated > 0) {
      revalidatePath(ROUTES.adminOrders, "layout");
      revalidatePath(ROUTES.sellerOrders, "layout");
      revalidatePath(ROUTES.orders, "layout");
    }
    return ok({ updated, failed });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not cancel the selected orders.");
  }
}

export interface OrderExportRow {
  orderNumber: string;
  buyerName: string | null;
  /** Admin-only column in the exported CSV (F-12) — carried here regardless of caller role, same as `Order.shopName` itself. */
  shopName: string | null;
  itemCount: number;
  totalCents: number;
  currency: string;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  placedAt: string;
}

/** Exports every order matching the dashboard table's current filters (not just the visible page) as plain rows — the client turns this into a CSV download. */
export async function exportOrdersAction(
  filters: Record<string, unknown>,
): Promise<ActionResult<OrderExportRow[]>> {
  const parsed = dashboardOrderExportFiltersSchema.safeParse(filters);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`exportOrders:${user.id}`, 10, 60);
    const owner =
      user.role === USER_ROLES.seller
        ? { sellerId: user.id, shopId: await queries.getOwnShopId(user.id) }
        : null;
    const orders = await queries.listOrdersForExport(parsed.data as OrderListParams, owner);
    return ok(
      orders.map((order) => ({
        orderNumber: order.orderNumber,
        buyerName: order.buyerName,
        shopName: order.shopName,
        itemCount: order.items.length,
        totalCents: order.totalCents,
        currency: order.currency,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        status: order.status,
        placedAt: order.placedAt,
      })),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not export orders.");
  }
}

/**
 * Resolves a scanned RobertJ order barcode (`order_number`) to the seller's own
 * order id so the client can open the existing order-detail page. Read-only —
 * it changes no order/inventory/payment/shipment state and is NOT a fulfilment
 * write path. Seller-scoped: a nonexistent OR another seller's order both
 * return the same generic failure (no existence disclosure). Rate-limited to
 * blunt scan-enumeration.
 */
export async function resolveSellerOrderByNumberAction(
  orderNumber: string,
): Promise<ActionResult<ScannedOrderResolution>> {
  const parsed = scanOrderNumberSchema.safeParse({ orderNumber });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole([USER_ROLES.seller]);
    await queries.requireRateLimit(`scanOrder:${user.id}`, 30, 60);

    const owner = { sellerId: user.id, shopId: await queries.getOwnShopId(user.id) };
    const resolution = await lookupScannedOrder(parsed.data.orderNumber, owner);
    if (!resolution) {
      return fail("Order not found, or it isn't in your shop.");
    }
    return ok(resolution);
  } catch {
    return fail("Could not look up that order. Please try again.");
  }
}

/** One barcode's lookup result in a batch: the order, or why there is none. */
export type ScannedOrderLookup =
  | ({ orderNumber: string; found: true } & ScannedOrderResolution)
  | { orderNumber: string; found: false; error: string };

/**
 * Resolves several decoded order barcodes (the "Upload barcode photos" flow)
 * in one round trip. Read-only, same shop scoping and the same generic
 * "not found" copy as the single lookup, so it discloses nothing about
 * orders in other shops. One rate-limit hit per call, so a batch of up to
 * `MAX_SCAN_BATCH` (see the order schema) photos doesn't exhaust the per-minute scan allowance.
 */
export async function resolveSellerOrdersByNumbersAction(
  orderNumbers: string[],
): Promise<ActionResult<ScannedOrderLookup[]>> {
  const parsed = scanOrderNumbersSchema.safeParse({ orderNumbers });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole([USER_ROLES.seller]);
    await queries.requireRateLimit(`scanOrder:${user.id}`, 30, 60);

    const owner = { sellerId: user.id, shopId: await queries.getOwnShopId(user.id) };
    const unique = Array.from(new Set(parsed.data.orderNumbers));
    const results = await Promise.all(
      unique.map(async (orderNumber): Promise<ScannedOrderLookup> => {
        const resolution = await lookupScannedOrder(orderNumber, owner);
        return resolution
          ? { orderNumber, found: true, ...resolution }
          : { orderNumber, found: false, error: "Order not found, or it isn't in your shop." };
      }),
    );
    return ok(results);
  } catch {
    return fail("Could not look up those orders. Please try again.");
  }
}

/**
 * Read-only lookup shared by the single and batch scan actions. A To Pack
 * order also returns what its confirm popup shows; every other status just
 * navigates. Returns null when the order isn't the seller's own.
 */
async function lookupScannedOrder(
  orderNumber: string,
  owner: { sellerId: string; shopId: string | null },
): Promise<ScannedOrderResolution | null> {
  const order = await queries.getDashboardOrderByNumber(orderNumber, owner);
  if (!order) return null;

  let summary: ScannedOrderSummary | undefined;
  if (order.status === ORDER_STATUS.confirmed) {
    const full = await queries.getDashboardOrder(order.id, owner);
    if (full) {
      summary = {
        orderNumber: full.orderNumber,
        buyerName: full.buyerName ?? full.shippingAddress?.fullName ?? null,
        items: full.items,
      };
    }
  }
  return { orderId: order.id, status: order.status, summary };
}
