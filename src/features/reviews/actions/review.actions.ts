"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { USER_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import type { ActionResult } from "@/types/action.types";
import {
  replyToReviewSchema,
  setReviewHiddenSchema,
  submitReviewSchema,
  updateReviewSchema,
} from "@/features/reviews/schemas/review.schema";
import type { Review } from "@/features/reviews/types/review.types";

/** Reviews show on the homepage, every product page and both portals. */
function revalidateReviewSurfaces() {
  revalidatePath("/", "layout");
}

/**
 * Submits a verified-purchase review. Ownership + the delivered-order rule
 * are enforced server-side inside `submit_review` — this action only
 * validates shape and forwards the call. `orderId` rides along as a hidden
 * field purely so this can revalidate the right order detail page; it plays
 * no role in authorization.
 */
export async function submitReviewAction(
  prevState: ActionResult<Review> | undefined,
  formData: FormData,
): Promise<ActionResult<Review>> {
  const parsed = submitReviewSchema.safeParse({
    orderId: formData.get("orderId"),
    orderItemId: formData.get("orderItemId"),
    rating: formData.get("rating"),
    comment: formData.get("comment") || undefined,
  });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`submitReview:${user.id}`, 20, 60);
    const review = await queries.submitReview(
      parsed.data.orderItemId,
      parsed.data.rating,
      parsed.data.comment ?? null,
    );
    revalidatePath(ROUTES.orderDetail(parsed.data.orderId), "layout");
    revalidateReviewSurfaces();
    return ok(review);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not submit your review.",
    );
  }
}

/** Edits the buyer's own review within 30 days — ownership and the window are checked in `update_review`. */
export async function updateReviewAction(
  prevState: ActionResult<Review> | undefined,
  formData: FormData,
): Promise<ActionResult<Review>> {
  const parsed = updateReviewSchema.safeParse({
    orderId: formData.get("orderId"),
    reviewId: formData.get("reviewId"),
    rating: formData.get("rating"),
    comment: formData.get("comment") || undefined,
  });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`updateReview:${user.id}`, 20, 60);
    const review = await queries.updateReview(parsed.data.reviewId, parsed.data.rating, parsed.data.comment ?? null);
    revalidatePath(ROUTES.orderDetail(parsed.data.orderId), "layout");
    revalidateReviewSurfaces();
    return ok(review);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update your review.");
  }
}

/** A shop's reply under a review. Only members of the product's shop may reply (`reply_to_review`). */
export async function replyToReviewAction(
  prevState: ActionResult<Review> | undefined,
  formData: FormData,
): Promise<ActionResult<Review>> {
  const parsed = replyToReviewSchema.safeParse({
    reviewId: formData.get("reviewId"),
    reply: formData.get("reply"),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole([USER_ROLES.seller]);
    await queries.requireRateLimit(`replyToReview:${user.id}`, 30, 60);
    const review = await queries.replyToReview(parsed.data.reviewId, parsed.data.reply);
    revalidatePath(ROUTES.sellerReviews);
    revalidateReviewSurfaces();
    return ok(review);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not post your reply.");
  }
}

/** Admin: hide a review with a reason, or show it again. */
export async function setReviewHiddenAction(input: unknown): Promise<ActionResult<Review>> {
  const parsed = setReviewHiddenSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const admin = await queries.requireRole([USER_ROLES.admin]);
    await queries.requireRateLimit(`moderateReview:${admin.id}`, 60, 60);
    const review = await queries.setReviewHidden(parsed.data.reviewId, parsed.data.hidden, parsed.data.reason ?? null);
    revalidatePath(ROUTES.adminReviews);
    revalidateReviewSurfaces();
    return ok(review);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update this review.");
  }
}

/** Admin: show or hide every demo review. */
export async function setDemoContentAction(enabled: unknown): Promise<ActionResult<boolean>> {
  const parsed = z.boolean().safeParse(enabled);
  if (!parsed.success) return fail("Choose on or off.");

  try {
    const admin = await queries.requireRole([USER_ROLES.admin]);
    await queries.requireRateLimit(`demoContent:${admin.id}`, 20, 60);
    const result = await queries.setDemoContent(parsed.data);
    revalidateReviewSurfaces();
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not change the demo content setting.");
  }
}

/** Admin: delete every demo review for good. */
export async function deleteDemoReviewsAction(): Promise<ActionResult<number>> {
  try {
    const admin = await queries.requireRole([USER_ROLES.admin]);
    await queries.requireRateLimit(`demoContent:${admin.id}`, 20, 60);
    const deleted = await queries.deleteDemoReviews();
    revalidateReviewSurfaces();
    return ok(deleted);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not remove the demo content.");
  }
}
