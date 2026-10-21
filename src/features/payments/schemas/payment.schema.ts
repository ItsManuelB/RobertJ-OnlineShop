import { z } from "zod";

import { PAYMENT_STATUS, type PaymentStatus } from "@/constants/status";
import { PAYMENT_SOURCE_FILTER_VALUES } from "@/features/payments/lib/payment-source";
import { paginationSchema, uuidSchema } from "@/lib/validations/common.schema";

const paymentStatusValues = Object.values(PAYMENT_STATUS) as [PaymentStatus, ...PaymentStatus[]];

export const markCodPaymentCollectedSchema = z.object({
  orderId: uuidSchema,
});

/** Validates and normalises search params for the Seller/Admin dashboard payment listing. */
export const dashboardPaymentListParamsSchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(40).optional(),
  status: z.enum(paymentStatusValues).optional(),
  paymentMethodType: z.enum(["cod", "card", "qr_upload", "xendit"]).optional(),
  // Ignore retired source-filter values in old bookmarked URLs.
  paymentSource: z.enum(PAYMENT_SOURCE_FILTER_VALUES).optional().catch(undefined),
  staleOnly: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

/** Shared order-id-list shape for the bulk "Mark COD collected" action. */
export const bulkMarkCodCollectedSchema = z.object({
  orderIds: z.array(uuidSchema).min(1, "Select at least one payment.").max(100),
});

export type MarkCodPaymentCollectedInput = z.infer<typeof markCodPaymentCollectedSchema>;
export type DashboardPaymentListParamsInput = z.input<typeof dashboardPaymentListParamsSchema>;
export type BulkMarkCodCollectedInput = z.infer<typeof bulkMarkCodCollectedSchema>;
