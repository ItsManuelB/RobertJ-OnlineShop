import { z } from "zod";

import { uuidSchema } from "@/lib/validations/common.schema";

/** Payload for writing a verified-purchase review. `orderId` is carried as a
 * hidden field purely so the action knows which page to revalidate. */
export const submitReviewSchema = z.object({
  orderId: uuidSchema,
  orderItemId: uuidSchema,
  rating: z.coerce.number().int().min(1, "Choose a rating.").max(5),
  comment: z.string().trim().max(1000).optional(),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

/** Editing the caller's own review; the 30-day window and ownership are checked in `update_review`. */
export const updateReviewSchema = z.object({
  orderId: uuidSchema,
  reviewId: uuidSchema,
  rating: z.coerce.number().int().min(1, "Choose a rating.").max(5),
  comment: z.string().trim().max(1000).optional(),
});

/** A shop's reply under a review. */
export const replyToReviewSchema = z.object({
  reviewId: uuidSchema,
  reply: z.string().trim().min(1, "Write a reply first.").max(1000, "Keep the reply under 1,000 characters."),
});

/** Admin hide / show. A reason is required when hiding. */
export const setReviewHiddenSchema = z
  .object({
    reviewId: uuidSchema,
    hidden: z.boolean(),
    reason: z.string().trim().max(300, "Keep the reason under 300 characters.").optional(),
  })
  .refine((value) => !value.hidden || Boolean(value.reason), {
    message: "Give a reason for hiding this review.",
    path: ["reason"],
  });
