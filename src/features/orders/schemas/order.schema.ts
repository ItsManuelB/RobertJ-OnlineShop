import { z } from "zod";

import { ORDER_STATUS, type OrderStatus } from "@/constants/status";
import { ORDER_LIFECYCLE_TABS, type LifecycleTab } from "@/features/orders/constants/order-lifecycle.constants";
import {
  paginationSchema,
  uuidSchema,
} from "@/lib/validations/common.schema";

/** All order statuses as a Zod enum (single source: `ORDER_STATUS`). */
const orderStatusValues = Object.values(ORDER_STATUS) as [
  OrderStatus,
  ...OrderStatus[],
];
export const orderStatusSchema = z.enum(orderStatusValues);

/** All lifecycle tabs as a Zod enum (single source: `ORDER_LIFECYCLE_TABS`). "All" isn't listed here — it's simply the absence of `tab`. */
const lifecycleTabValues = ORDER_LIFECYCLE_TABS as [LifecycleTab, ...LifecycleTab[]];
export const lifecycleTabSchema = z.enum(lifecycleTabValues);

/** Validates and normalises search params for the buyer order listing. */
export const buyerOrderListParamsSchema = paginationSchema.extend({
  /** Order-ID search; capped well under the real order_number length. */
  search: z.string().trim().min(1).max(40).optional(),
  status: orderStatusSchema.optional(),
  /** Shopee-style lifecycle tab (`OrderLifecycleTabs`, buyer `/orders` only) — named `tab` in the URL, distinct from the raw `status` chip filter. */
  tab: lifecycleTabSchema.optional(),
});

/**
 * Dashboard-only extension of the buyer schema's fields — same
 * search/status/pagination shape, plus payment-method/date-range/attention
 * filters that only make sense for a seller/admin managing orders, never the
 * buyer's own history.
 */
const dashboardOrderListParamsObjectSchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(40).optional(),
  status: orderStatusSchema.optional(),
  paymentMethod: z.enum(["cod", "xendit"]).optional(),
  dateRange: z.enum(["today", "7d", "30d"]).optional(),
  /** Exact Manila calendar range, used by shop-dashboard metric drill-downs. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Current pending orders that meet the admin dashboard's confirmation rule. */
  confirmationRequired: z.string().optional().transform((value) => value === "true"),
  /** Admin-only shop filter (F-12) — a seller's own `listDashboardOrders` call is already shop-scoped by RLS, so this is simply ignored (harmless) if a non-admin URL ever carried it. */
  shopId: uuidSchema.optional(),
  // Deliberately not z.coerce.boolean() — Boolean("false") is true, which
  // would make ?attentionOnly=false behave identically to ?attentionOnly=true.
  attentionOnly: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

const validateDashboardOrderDateRange = (
  value: { from?: string; to?: string },
  context: z.RefinementCtx,
) => {
  if (Boolean(value.from) !== Boolean(value.to)) {
    context.addIssue({ code: "custom", message: "Both dates are required for a custom range." });
  } else if (value.from && value.to && value.from > value.to) {
    context.addIssue({ code: "custom", message: "The start date must be on or before the end date." });
  }
};

export const dashboardOrderListParamsSchema = dashboardOrderListParamsObjectSchema.superRefine(
  validateDashboardOrderDateRange,
);

/** Export filters share dashboard validation without pagination fields. */
export const dashboardOrderExportFiltersSchema = dashboardOrderListParamsObjectSchema
  .omit({ page: true, pageSize: true })
  .superRefine(validateDashboardOrderDateRange);

/** Shared id-list shape for the dashboard's bulk order actions. */
export const bulkOrderIdsSchema = z.array(uuidSchema).min(1, "Select at least one order.").max(100);

/** Payload for cancelling one of the buyer's own orders. */
export const cancelOrderSchema = z.object({
  orderId: uuidSchema,
  reason: z
    .string()
    .trim()
    .min(1, "Please select or enter a reason.")
    .max(500, "Reason must be 500 characters or fewer."),
});

/** Payload for the buyer's "Confirm Received" completion action. */
export const confirmOrderReceivedSchema = z.object({
  orderId: uuidSchema,
});

/**
 * Payload for a seller/admin advancing (or cancelling) an order from the
 * dashboard. `reason` is required specifically when `newStatus` is
 * `cancelled` (mirrors the buyer's own `cancelOrderSchema` requirement) —
 * optional/absent for every forward transition, which never uses it.
 */
export const advanceOrderStatusSchema = z
  .object({
    orderId: uuidSchema,
    newStatus: orderStatusSchema,
    reason: z.string().trim().max(500, "Reason must be 500 characters or fewer.").optional(),
  })
  .refine((data) => data.newStatus !== "cancelled" || !!data.reason, {
    message: "Please select or enter a cancellation reason.",
    path: ["reason"],
  });

/**
 * Courier + tracking captured at "Mark as shipped". Manual entry only (no
 * courier API) — validated at the action boundary and again inside the
 * `record_order_shipment` RPC. Lengths mirror the DB CHECK constraints.
 */
export const recordShipmentSchema = z.object({
  orderId: uuidSchema,
  courier: z
    .string()
    .trim()
    .min(1, "Please enter the courier.")
    .max(80, "Courier name must be 80 characters or fewer."),
  trackingNumber: z
    .string()
    .trim()
    .min(1, "Please enter the tracking number.")
    .max(120, "Tracking number must be 120 characters or fewer."),
});

/**
 * A decoded RobertJ order barcode. Format gate for the scanner resolver —
 * mirrors the `order_number` shape (`ORD-YYYYMMDD-NNNNNN`) generated by the
 * `orders_assign_order_number` trigger, so garbage / other barcodes are
 * rejected before any DB lookup.
 */
export const scanOrderNumberSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .regex(/^ORD-\d{8}-\d{6}$/, "That doesn't look like a RobertJ order barcode."),
});

export type BuyerOrderListParamsInput = z.input<typeof buyerOrderListParamsSchema>;
export type DashboardOrderListParamsInput = z.input<typeof dashboardOrderListParamsSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type AdvanceOrderStatusInput = z.infer<typeof advanceOrderStatusSchema>;
export type RecordShipmentInput = z.infer<typeof recordShipmentSchema>;
export type ScanOrderNumberInput = z.infer<typeof scanOrderNumberSchema>;
