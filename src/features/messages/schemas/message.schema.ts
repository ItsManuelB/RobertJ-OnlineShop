import { z } from "zod";

import { uuidSchema } from "@/lib/validations/common.schema";
import { MESSAGE_BODY_MAX_LENGTH } from "@/features/messages/constants/message.constants";

/**
 * Payload for sending an order message. `body` is trimmed then length-checked —
 * mirroring the `send_order_message` RPC's own server-side validation exactly
 * (never trust the client alone for the empty/whitespace rejection or the
 * 2,000-character cap).
 */
export const sendOrderMessageSchema = z.object({
  orderId: uuidSchema,
  body: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(
      MESSAGE_BODY_MAX_LENGTH,
      `Message must be ${MESSAGE_BODY_MAX_LENGTH} characters or fewer.`,
    ),
});

export type SendOrderMessageInput = z.infer<typeof sendOrderMessageSchema>;
