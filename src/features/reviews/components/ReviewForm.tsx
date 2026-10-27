"use client";

import { Star } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { StarRating } from "@/features/reviews/components/StarRating";
import { submitReviewAction, updateReviewAction } from "@/features/reviews/actions/review.actions";
import type { Review } from "@/features/reviews/types/review.types";
import { REVIEW_EDIT_WINDOW_DAYS } from "@/features/reviews/utils/review-format";
import { cn } from "@/lib/utils/cn";

export interface ReviewFormProps {
  orderId: string;
  orderItemId: string;
  productTitle: string;
  /** How the buyer will be shown, e.g. "Mia S.". */
  publicName: string;
  /** The buyer's existing review of this item, if any. */
  existing?: Review | null;
  /** Whether the existing review is still inside the 30-day edit window. */
  editable?: boolean;
  /** Open the form straight away (arriving from "Items to review"). */
  defaultOpen?: boolean;
}

const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

/**
 * Write or edit a review for one delivered item. Tap a star first; the comment is optional.
 * The verified-purchase rule, ownership and the 30-day edit window are all enforced in the
 * database (`submit_review`, `update_review`); this only renders the entry point for an item
 * the order page already found eligible.
 */
export function ReviewForm({
  orderId,
  orderItemId,
  productTitle,
  publicName,
  existing = null,
  editable = false,
  defaultOpen = false,
}: ReviewFormProps) {
  const [open, setOpen] = useState(defaultOpen && !existing);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hoverRating, setHoverRating] = useState(0);
  // Set when the form is sent; the form closes only once that send succeeded, so errors stay visible.
  const [submitted, setSubmitted] = useState(false);
  const [submitState, submitAction, isSubmitting] = useActionState(submitReviewAction, undefined);
  const [updateState, updateAction, isUpdating] = useActionState(updateReviewAction, undefined);

  const saved = existing ? updateState : submitState;
  const isPending = isSubmitting || isUpdating;
  const current = saved?.success ? saved.data : existing;

  const closed = !open || (submitted && Boolean(saved?.success));

  if (current && closed) {
    return (
      <div className="flex flex-col gap-1.5 rounded-xl border border-rj-gray-100 bg-rj-gray-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-rj-black">
            {saved?.success ? "Thanks, your review is posted." : "Your review"}
          </p>
          <StarRating rating={current.rating} />
        </div>
        {current.comment ? <p className="text-sm text-rj-gray-700">{current.comment}</p> : null}
        {current.hiddenAt ? (
          <p className="text-xs text-warning">Hidden from the store by an administrator.</p>
        ) : editable ? (
          <button
            type="button"
            onClick={() => {
              setRating(current.rating);
              setSubmitted(false);
              setOpen(true);
            }}
            className="self-start text-xs font-semibold text-rj-red-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
          >
            Edit review
          </button>
        ) : null}
      </div>
    );
  }

  if (closed) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-semibold text-rj-red-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
      >
        Write a Review
      </button>
    );
  }

  const displayRating = hoverRating || rating;
  const error = saved && !saved.success ? saved.error : null;

  return (
    <form
      action={current ? updateAction : submitAction}
      onSubmit={() => setSubmitted(true)}
      className="flex flex-col gap-3 rounded-xl border border-rj-gray-100 bg-rj-gray-50 p-3"
    >
      <input type="hidden" name="orderId" value={orderId} />
      {current ? (
        <input type="hidden" name="reviewId" value={current.id} />
      ) : (
        <input type="hidden" name="orderItemId" value={orderItemId} />
      )}
      <input type="hidden" name="rating" value={rating} />

      <div>
        <p className="text-xs font-semibold text-rj-black">How would you rate {productTitle}?</p>
        <div className="mt-1 flex items-center gap-2">
          <div
            className="flex items-center gap-1"
            role="radiogroup"
            aria-label="Rating"
            onMouseLeave={() => setHoverRating(0)}
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={rating === star}
                aria-label={`${star} star${star === 1 ? "" : "s"}, ${RATING_WORDS[star]}`}
                onMouseEnter={() => setHoverRating(star)}
                onClick={() => setRating(star)}
                className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
              >
                <Star
                  className={cn(
                    "h-7 w-7 transition-colors",
                    star <= displayRating ? "fill-rj-gold text-rj-gold" : "text-rj-gray-300",
                  )}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
          <span className="text-xs font-semibold text-rj-gray-600" aria-live="polite">
            {RATING_WORDS[displayRating]}
          </span>
        </div>
      </div>

      <div>
        <label htmlFor={`review-comment-${orderItemId}`} className="text-xs font-semibold text-rj-black">
          Tell other buyers more (optional)
        </label>
        <textarea
          id={`review-comment-${orderItemId}`}
          name="comment"
          rows={3}
          maxLength={1000}
          defaultValue={current?.comment ?? ""}
          placeholder="Fit, fabric, color, delivery…"
          className="mt-1 w-full resize-none rounded-lg border border-rj-gray-200 bg-rj-white px-3 py-2 text-sm outline-none focus:border-rj-black"
        />
        <p className="text-[11px] text-rj-gray-600">
          Shown as “{publicName}”. You can edit it for {REVIEW_EDIT_WINDOW_DAYS} days.
        </p>
      </div>

      {error ? (
        <p className="text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="rj" size="rjSm" disabled={rating === 0 || isPending} isLoading={isPending}>
          {current ? "Save changes" : "Post review"}
        </Button>
      </div>
    </form>
  );
}
