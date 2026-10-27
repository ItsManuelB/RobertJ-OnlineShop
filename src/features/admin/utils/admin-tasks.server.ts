import "server-only";

import { cache } from "react";

import { ROUTES } from "@/constants/routes";
import { RETURN_STATUS } from "@/constants/status";
import type { PortalNotification } from "@/components/portal/portal.types";
import {
  getLowStockReport,
  getOrderAttentionCounts,
  getOverduePendingReturnCount,
  getStalePaymentCount,
  listReturnRequests,
} from "@/lib/supabase/queries";

/**
 * Real pending-work signals surfaced as notifications — no mock data, no
 * separate notifications table. The "Pending orders" count uses
 * `getOrderAttentionCounts().needsConfirmation` — the same definition as
 * the Dashboard's attention list and the menu badges — so this bell
 * never disagrees with the rest of the dashboard.
 *
 * Fulfillment/returns audit finding B1: "Returns overdue" is distinct from
 * "Returns awaiting decision" below — it's requests still `pending` (the
 * seller hasn't responded at all) that have crossed `decide_return`'s own
 * overdue threshold, which is the one case admin previously had NO way to
 * even see, let alone act on (the RPC refused anything still `pending`).
 */
async function loadAdminNotifications(): Promise<PortalNotification[]> {
  const [attentionCounts, lowStock, pendingReturns, payoutReturns, receivedReturns, overdueReturns, stalePayments] = await Promise.all([
    getOrderAttentionCounts(),
    getLowStockReport(),
    listReturnRequests(RETURN_STATUS.sellerAccepted),
    listReturnRequests(RETURN_STATUS.refundDue),
    listReturnRequests(RETURN_STATUS.returnReceived),
    getOverduePendingReturnCount(),
    // A failed count must not take the whole bell down.
    getStalePaymentCount().catch(() => 0),
  ]);

  const notifications: PortalNotification[] = [];

  if (attentionCounts.needsConfirmation > 0) {
    notifications.push({
      id: "pending-orders",
      title: "Pending orders",
      description: `${attentionCounts.needsConfirmation} order${attentionCounts.needsConfirmation === 1 ? "" : "s"} awaiting confirmation`,
      href: ROUTES.adminOrders,
      tone: "warning",
      count: attentionCounts.needsConfirmation,
    });
  }
  if (lowStock.length > 0) {
    notifications.push({
      id: "low-stock",
      title: "Low stock",
      description: `${lowStock.length} product${lowStock.length === 1 ? "" : "s"} running low or out of stock`,
      href: ROUTES.adminInventory,
      tone: "danger",
      count: lowStock.length,
    });
  }
  if (pendingReturns.length > 0) {
    notifications.push({
      id: "pending-returns",
      title: "Returns awaiting decision",
      description: `${pendingReturns.length} return request${pendingReturns.length === 1 ? "" : "s"} need your review`,
      href: ROUTES.adminReturns,
      tone: "warning",
      count: pendingReturns.length,
    });
  }
  if (payoutReturns.length > 0) {
    notifications.push({
      id: "pending-cod-refund-payouts",
      title: "COD refunds to pay out",
      description: `${payoutReturns.length} approved COD refund${payoutReturns.length === 1 ? "" : "s"} waiting for the payout to be recorded`,
      href: ROUTES.adminReturns,
      tone: "warning",
      count: payoutReturns.length,
    });
  }
  if (receivedReturns.length > 0) {
    notifications.push({
      id: "returns-ready-for-refund",
      title: "Returned items ready for refund",
      description: `${receivedReturns.length} returned item${receivedReturns.length === 1 ? "" : "s"} received by the seller — confirm the refund`,
      href: ROUTES.adminReturns,
      tone: "warning",
      count: receivedReturns.length,
    });
  }
  if (overdueReturns > 0) {
    notifications.push({
      id: "overdue-returns",
      title: "Returns overdue",
      description: `${overdueReturns} return request${overdueReturns === 1 ? "" : "s"} unanswered by the seller — you can decide ${overdueReturns === 1 ? "it" : "them"} directly`,
      href: ROUTES.adminReturns,
      tone: "danger",
      count: overdueReturns,
    });
  }
  if (stalePayments > 0) {
    notifications.push({
      id: "stale-payments",
      title: "Payments to reconcile",
      description: `${stalePayments} online payment${stalePayments === 1 ? " has" : "s have"} been pending for over 30 minutes`,
      href: `${ROUTES.adminPayments}?staleOnly=true`,
      tone: "warning",
      count: stalePayments,
    });
  }

  return notifications;
}

/**
 * The admin's pending-work list, shared by the topbar bell, the menu badges and
 * the Dashboard's "Needs your attention" panel so they can never disagree.
 * Cached per request, so rendering all three costs one set of reads.
 */
export const getAdminNotifications = cache(loadAdminNotifications);
