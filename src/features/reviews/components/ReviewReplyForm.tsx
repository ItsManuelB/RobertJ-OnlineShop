"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { replyToReviewAction } from "@/features/reviews/actions/review.actions";

/** The shop's one reply under a review (Seller Portal). Posting again replaces it. */
export function ReviewReplyForm({ reviewId, existingReply }: { reviewId: string; existingReply: string | null }) {
  const [open, setOpen] = useState(!existingReply);
  const [state, formAction, isPending] = useActionState(replyToReviewAction, undefined);

  if (state?.success && !open) return null;

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        Edit reply
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={() => {
        if (existingReply) setOpen(false);
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="reviewId" value={reviewId} />
      <label htmlFor={`reply-${reviewId}`} className="text-xs font-semibold text-foreground">
        {existingReply ? "Edit your reply" : "Reply as your shop"}
      </label>
      <textarea
        id={`reply-${reviewId}`}
        name="reply"
        rows={3}
        maxLength={1000}
        defaultValue={existingReply ?? ""}
        placeholder="Every buyer will see this under the review. Thank them, or say what you did to fix it."
        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      {state && !state.success ? (
        <p className="text-xs font-semibold text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-xs font-semibold text-success" role="status">
          Reply posted.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" isLoading={isPending}>
          {existingReply ? "Save reply" : "Post reply"}
        </Button>
        {existingReply ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
