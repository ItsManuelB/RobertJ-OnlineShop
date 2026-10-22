import { z } from "zod";

import { uuidSchema } from "@/lib/validations/common.schema";
import { RETURN_EXPLANATION_MAX_LENGTH } from "@/features/returns/constants/return.constants";

/** Mirrors the payment-receipts bucket's own file_size_limit/allowed_mime_types
 * (the return-evidence photo is uploaded to the same bucket) so the UI fails
 * fast instead of round-tripping to Storage only to be rejected there. */
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Structured request fields, mirroring `public.return_reason_code`/
 * `return_request_type`. `explanation` is required only for `other` — the
 * trim-then-length check here mirrors `request_return`'s own server-side
 * validation exactly (never trust the client alone for the 500-char cap or
 * the whitespace-only rejection).
 */
export const requestReturnSchema = z
  .object({
    orderId: uuidSchema,
    orderItemId: uuidSchema.optional(),
    requestType: z.enum(["money_refund", "return_and_refund", "replacement_exchange"]),
    reasonCode: z.enum([
      "damaged_item",
      "defective_item",
      "wrong_item",
      "missing_item",
      "item_not_received",
      "other",
    ]),
    explanation: z
      .string()
      .trim()
      .max(RETURN_EXPLANATION_MAX_LENGTH, `Explanation must be ${RETURN_EXPLANATION_MAX_LENGTH} characters or fewer.`)
      .optional(),
    // Optional: an empty file input submits a zero-byte File, not undefined —
    // normalize that to undefined before the size/type checks apply.
    evidence: z
      .instanceof(File)
      .optional()
      .transform((file) => (file && file.size > 0 ? file : undefined))
      .refine(
        (file) => !file || file.size <= MAX_EVIDENCE_BYTES,
        "Evidence photo must be 5MB or smaller.",
      )
      .refine(
        (file) => !file || ALLOWED_EVIDENCE_TYPES.includes(file.type),
        "Evidence photo must be a JPEG, PNG, or WebP image.",
      ),
  })
  .superRefine((data, ctx) => {
    if (data.reasonCode === "other" && (!data.explanation || data.explanation.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["explanation"],
        message: "Please explain the issue.",
      });
    }
  });

export const respondToReturnSchema = z.object({
  returnId: uuidSchema,
  decision: z.enum(["accept", "reject"]),
  note: z.string().trim().max(500, "Note is too long.").optional(),
});

export const decideReturnSchema = z.object({
  returnId: uuidSchema,
  decision: z.enum(["approve", "reject"]),
  // Only consulted when decision === "approve"; defaults to a money refund
  // (today's only behavior) so an omitted value is non-breaking.
  resolutionType: z.enum(["money_refund", "return_and_refund", "replacement_exchange"]).default("money_refund"),
  note: z.string().trim().max(500, "Note is too long.").optional(),
});

/** Payload for the seller/admin's post-refund "is this item sellable?" step. */
export const recordReturnItemConditionSchema = z.object({
  returnId: uuidSchema,
  condition: z.enum(["sellable", "not_sellable"]),
  note: z.string().trim().max(500, "Note is too long.").optional(),
});

/** Courier + tracking, shared by every manual shipment capture — mirrors `ShipmentCaptureForm`'s shape exactly. */
const courierTrackingFields = {
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
};

/** Payload for the seller/admin's "ship the replacement" step — only legal once `decide_return` approved `replacement_exchange`. */
export const recordReturnReplacementShipmentSchema = z.object({
  returnId: uuidSchema,
  ...courierTrackingFields,
});

/** Payload for the buyer's "I shipped it back" step — only legal while the return is `awaiting_return`. */
export const recordReturnShipmentSchema = z.object({
  returnId: uuidSchema,
  ...courierTrackingFields,
});

/** Payload for the buyer's "my replacement arrived" confirmation. */
export const confirmReplacementReceivedSchema = z.object({
  returnId: uuidSchema,
});

/** Payload for the seller's "I received the returned item" step — only legal once the buyer shipped it. */
export const recordReturnReceivedSchema = z.object({
  returnId: uuidSchema,
  condition: z.enum(["sellable", "not_sellable"]),
  note: z.string().trim().max(500, "Note is too long.").optional(),
});

/** Payload for an admin recording how a COD buyer was paid back — mirrors `record_cod_refund_payout`'s own checks. */
export const recordCodRefundPayoutSchema = z.object({
  returnId: uuidSchema,
  method: z.enum(["gcash", "bank_transfer", "cash"], { message: "Choose how the buyer was paid." }),
  reference: z
    .string()
    .trim()
    .min(1, "Please enter a reference number.")
    .max(120, "Reference must be 120 characters or fewer."),
  note: z.string().trim().max(500, "Note must be 500 characters or fewer.").optional(),
});

export type RequestReturnInput = z.infer<typeof requestReturnSchema>;
export type RespondToReturnInput = z.infer<typeof respondToReturnSchema>;
export type DecideReturnInput = z.infer<typeof decideReturnSchema>;
export type RecordReturnItemConditionInput = z.infer<typeof recordReturnItemConditionSchema>;
export type RecordCodRefundPayoutInput = z.infer<typeof recordCodRefundPayoutSchema>;
export type RecordReturnReplacementShipmentInput = z.infer<typeof recordReturnReplacementShipmentSchema>;
export type ConfirmReplacementReceivedInput = z.infer<typeof confirmReplacementReceivedSchema>;
export type RecordReturnShipmentInput = z.infer<typeof recordReturnShipmentSchema>;
export type RecordReturnReceivedInput = z.infer<typeof recordReturnReceivedSchema>;
