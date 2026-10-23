import { z } from "zod";

import { uuidSchema } from "@/lib/validations/common.schema";

export const createXenditEwalletPaymentSchema = z.object({
  orderId: uuidSchema,
  channelCode: z.enum(["GCASH", "PAYMAYA"]),
});

export const createXenditCardSessionSchema = z.object({
  orderId: uuidSchema,
});

/** Client passes only the server-issued checkout_group_id — never order ids. */
export const createXenditGroupEwalletPaymentSchema = z.object({
  checkoutGroupId: uuidSchema,
  channelCode: z.enum(["GCASH", "PAYMAYA"]),
});

export const createXenditGroupCardSessionSchema = z.object({
  checkoutGroupId: uuidSchema,
});

/** Asks the server to confirm one payment with Xendit — an order, or a whole checkout group (exactly one). */
export const confirmXenditPaymentSchema = z
  .object({
    orderId: uuidSchema.optional(),
    checkoutGroupId: uuidSchema.optional(),
  })
  .refine((value) => (value.orderId === undefined) !== (value.checkoutGroupId === undefined), {
    message: "Provide either an order or a checkout group.",
  });

export type ConfirmXenditPaymentInput = z.infer<typeof confirmXenditPaymentSchema>;

export type CreateXenditEwalletPaymentInput = z.infer<typeof createXenditEwalletPaymentSchema>;
export type CreateXenditCardSessionInput = z.infer<typeof createXenditCardSessionSchema>;
export type CreateXenditGroupEwalletPaymentInput = z.infer<typeof createXenditGroupEwalletPaymentSchema>;
export type CreateXenditGroupCardSessionInput = z.infer<typeof createXenditGroupCardSessionSchema>;
