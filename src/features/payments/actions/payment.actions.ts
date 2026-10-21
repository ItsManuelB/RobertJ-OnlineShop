"use server";

import { revalidatePath } from "next/cache";

import { DASHBOARD_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import type { ActionResult } from "@/types/action.types";
import {
  bulkMarkCodCollectedSchema,
  dashboardPaymentListParamsSchema,
  markCodPaymentCollectedSchema,
} from "@/features/payments/schemas/payment.schema";
import type { DashboardPaymentListParams } from "@/features/payments/types/payment.types";

/**
 * Seller (of the order) or admin marks a COD order's cash as collected.
 * Authorization is enforced inside the `mark_cod_payment_collected` RPC (own
 * order or `is_admin()`) — this action just validates input and delegates.
 * COD never auto-marks paid at order creation; this is the only path.
 */
export async function markCodPaymentCollectedAction(
  orderId: string,
): Promise<ActionResult<null>> {
  const parsed = markCodPaymentCollectedSchema.safeParse({ orderId });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireSessionUser();
    await queries.markCodPaymentCollected(parsed.data.orderId);
    revalidatePath(ROUTES.orderDetail(parsed.data.orderId));
    revalidatePath(ROUTES.orders, "layout");
    revalidatePath(ROUTES.adminPayments);
    revalidatePath(ROUTES.sellerPayments);
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not mark this payment as collected.",
    );
  }
}

/**
 * Bulk counterpart to `markCodPaymentCollectedAction` — applies the same
 * `mark_cod_payment_collected` RPC to every selected order, one at a time.
 * Partial failure is expected (e.g. a row was already marked collected by
 * another session) and reported back per order rather than aborting the rest.
 */
export async function bulkMarkCodPaymentCollectedAction(
  orderIds: string[],
): Promise<ActionResult<{ updated: number; failed: Array<{ orderId: string; error: string }> }>> {
  const parsed = bulkMarkCodCollectedSchema.safeParse({ orderIds });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`bulkMarkCodCollected:${user.id}`, 10, 60);

    const failed: Array<{ orderId: string; error: string }> = [];
    let updated = 0;
    for (const orderId of parsed.data.orderIds) {
      try {
        await queries.markCodPaymentCollected(orderId);
        updated += 1;
      } catch (error) {
        failed.push({
          orderId,
          error: error instanceof Error ? error.message : "Could not mark this payment as collected.",
        });
      }
    }

    if (updated > 0) {
      revalidatePath(ROUTES.orders, "layout");
      revalidatePath(ROUTES.adminPayments);
      revalidatePath(ROUTES.sellerPayments);
    }
    return ok({ updated, failed });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not mark the selected payments as collected.");
  }
}

/** Filters accepted by `exportPaymentsAction` — the dashboard list filters, minus pagination (the export has its own row cap). */
const paymentExportFiltersSchema = dashboardPaymentListParamsSchema.omit({ page: true, pageSize: true });

export interface PaymentExportRow {
  orderNumber: string;
  buyerName: string | null;
  paymentMethodType: string;
  paymentChannel: string | null;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
}

/** Exports every payment matching the dashboard table's current filters (not just the visible page) as plain rows — the client turns this into a CSV download. */
export async function exportPaymentsAction(
  filters: Record<string, unknown>,
): Promise<ActionResult<PaymentExportRow[]>> {
  const parsed = paymentExportFiltersSchema.safeParse(filters);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`exportPayments:${user.id}`, 10, 60);
    const payments = await queries.listPaymentsForExport(parsed.data as DashboardPaymentListParams);
    return ok(
      payments.map((payment) => ({
        orderNumber: payment.orderNumber,
        buyerName: payment.buyerName,
        paymentMethodType: payment.paymentMethodType,
        paymentChannel: payment.paymentChannel,
        amountCents: payment.amountCents,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.createdAt,
      })),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not export payments.");
  }
}
