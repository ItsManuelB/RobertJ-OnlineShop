"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date";
import type { ActionResult } from "@/types/action.types";
import { sendOrderMessageAction } from "@/features/messages/actions/message.actions";
import { MESSAGE_BODY_MAX_LENGTH } from "@/features/messages/constants/message.constants";
import type { OrderMessageView } from "@/features/messages/types/message.types";

export interface MessageThreadBodyProps {
  orderId: string;
  messages: OrderMessageView[];
  themed?: boolean;
  /** Root wrapper classes — e.g. `min-h-0 flex-1` to fill a fixed-height panel. */
  className?: string;
  /** Message-list classes — `max-h-96` inline, or `min-h-0 flex-1` to fill a dock. */
  listClassName?: string;
  /** Autofocus the composer on mount (used when the dock opens). */
  autoFocus?: boolean;
  /**
   * Fired after a message is sent successfully. The order-detail pages leave
   * this unset (they refresh via server revalidation); the client-driven global
   * inbox uses it to re-fetch the thread + conversation list.
   */
  onSent?: () => void;
}

/**
 * The shared conversation body — message bubbles + composer + the
 * `sendOrderMessageAction` wiring. Chrome-less so both the buyer and the
 * seller/admin chat docks reuse one copy of the send logic. Author identity is
 * already resolved per-viewer on the server (the buyer never receives an
 * individual staff name).
 */
export function MessageThreadBody({
  orderId,
  messages,
  themed = false,
  className,
  listClassName = "max-h-96",
  autoFocus = false,
  onSent,
}: MessageThreadBodyProps) {
  const [body, setBody] = useState("");
  const fieldId = useId();
  const listRef = useRef<HTMLOListElement>(null);

  // Clear the composer after a successful send (errors keep the text). Done in
  // the action wrapper rather than an effect, so the reset lines up with the
  // revalidation that brings the new message into the list.
  const [state, formAction, isPending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(async (prev, formData) => {
    const result = await sendOrderMessageAction(prev, formData);
    if (result.success) {
      setBody("");
      onSent?.();
    }
    return result;
  }, null);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const fieldErrors = state && !state.success ? state.fieldErrors : undefined;
  const formError = state && !state.success && !state.fieldErrors ? state.error : undefined;

  const muted = themed ? "text-muted-foreground" : "text-rj-gray-600";
  const trimmed = body.trim();

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {messages.length > 0 ? (
        <ol
          ref={listRef}
          className={cn("flex flex-col gap-3 overflow-y-auto", listClassName)}
        >
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn("flex flex-col gap-0.5", message.isOwn ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                  message.isOwn
                    ? themed
                      ? "bg-primary text-primary-foreground"
                      : "bg-rj-red text-rj-white"
                    : themed
                      ? "bg-muted text-foreground"
                      : "bg-rj-gray-100 text-rj-black",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
              </div>
              <p className={cn("px-1 text-[10px]", muted)}>
                {message.authorLabel} · {formatDateTime(message.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <div className={cn("flex items-center justify-center", listClassName)}>
          <p className={cn("text-sm", muted)}>No messages yet. Start the conversation below.</p>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-2" aria-busy={isPending}>
        <input type="hidden" name="orderId" value={orderId} />
        <label htmlFor={fieldId} className="sr-only">
          Write a message
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id={fieldId}
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, MESSAGE_BODY_MAX_LENGTH))}
            rows={2}
            maxLength={MESSAGE_BODY_MAX_LENGTH}
            placeholder="Type a message here"
            autoFocus={autoFocus}
            aria-describedby={`${fieldId}-count`}
            className={cn(
              "min-h-10 flex-1 resize-none rounded-md border px-3 py-2 text-sm outline-none transition-colors",
              themed
                ? "border-border bg-background text-foreground focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
                : "border-rj-gray-200 bg-rj-white text-rj-black focus-visible:border-rj-black focus-visible:ring-2 focus-visible:ring-rj-red/30",
            )}
          />
          <Button
            type="submit"
            variant={themed ? "primary" : "rj"}
            size="rjSm"
            isLoading={isPending}
            disabled={trimmed.length === 0}
          >
            {isPending ? "Sending…" : "Send"}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p id={`${fieldId}-count`} className={cn("text-[11px]", muted)}>
            {body.length}/{MESSAGE_BODY_MAX_LENGTH}
          </p>
          {fieldErrors?.body ? (
            <p role="alert" className={cn("text-xs", themed ? "text-danger" : "text-rj-red-dark")}>
              {fieldErrors.body[0]}
            </p>
          ) : null}
        </div>
        {formError ? <ErrorState title="Couldn't send your message" message={formError} /> : null}
      </form>
    </div>
  );
}
