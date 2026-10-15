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
  cancelOrderSchema,
  confirmOrderReceivedSchema,
  dashboardOrderListParamsSchema,
  recordShipmentSchema,
  scanOrderNumberSchema,
} from "@/features/orders/schemas/order.schema";
import type { Order, OrderListParams } from "@/features/orders/types/order.types";

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
): Promise<ActionResult<null>> {
  const parsed = cancelOrderSchema.safeParse({ orderId, reason });
  if (!parsed.success) {
    return fromZodError(parsed.error);
  }

  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`cancelOrder:${user.id}`, 10, 60);

    const blocked = await blockCancellationIfXenditUnresolved(parsed.data.orderId);
    if (blocked) return blocked;

    await queries.cancelBuyerOrder(parsed.data.orderId, user.id, parsed.data.reason);
    // Cancellation is visible to the seller/admin too (order disappears from
    // their active queues, stock restores) — revalidate all three surfaces,
    // not just the buyer's own.
    await revalidateOrderSurfaces(parsed.data.orderId);
    revalidatePath(ROUTES.account, "layout");
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not cancel the order.",
    );
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

/** Filters accepted by `exportOrdersAction` — the same dashboard list filters, minus pagination (the export has its own row cap). */
const orderExportFiltersSchema = dashboardOrderListParamsSchema.omit({ page: true, pageSize: true });

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
  const parsed = orderExportFiltersSchema.safeParse(filters);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`exportOrders:${user.id}`, 10, 60);
    const orders = await queries.listOrdersForExport(parsed.data as OrderListParams);
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
): Promise<ActionResult<{ orderId: string; status: OrderStatus }>> {
  const parsed = scanOrderNumberSchema.safeParse({ orderNumber });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole([USER_ROLES.seller]);
    await queries.requireRateLimit(`scanOrder:${user.id}`, 30, 60);

    const order = await queries.getDashboardOrderByNumber(
      parsed.data.orderNumber,
      { sellerId: user.id, shopId: await queries.getOwnShopId(user.id) },
    );
    if (!order) {
      return fail("Order not found, or it isn't in your shop.");
    }
    return ok({ orderId: order.id, status: order.status });
  } catch {
    return fail("Could not look up that order. Please try again.");
  }
}
