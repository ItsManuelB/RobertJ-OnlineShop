"use client";

import { cn } from "@/lib/utils/cn";
import { MessageThreadBody } from "@/features/messages/components/MessageThreadBody";
import { OrderChatDock } from "@/features/messages/components/OrderChatDock";
import { chatDockMinimizedStorageKey } from "@/features/messages/constants/message.constants";
import type { OrderMessageView } from "@/features/messages/types/message.types";

export interface OrderMessageThreadProps {
  orderId: string;
  /** Display-ready messages, oldest-first, author resolved per viewer on the server. */
  messages: OrderMessageView[];
  /** Context-card heading — e.g. "Messages". */
  title?: string;
  /** Helper copy under the heading. */
  description?: string;
  /** Renders through the Admin/Seller portal tokens; omit for the buyer view. */
  themed?: boolean;
}

/**
 * Seller/admin order conversation — the same Shopee-style floating chat dock the
 * buyer uses (`ContactSellerDock`), themed for the portal and docked clear of
 * the phone tab bar. Both wrap the shared `MessageThreadBody` so the send logic
 * lives in one place.
 */
export function OrderMessageThread({
  orderId,
  messages,
  title = "Messages",
  description,
  themed = false,
}: OrderMessageThreadProps) {
  return (
    <OrderChatDock
      themed={themed}
      badgeCount={messages.length}
      storageKey={chatDockMinimizedStorageKey("dashboard", orderId)}
      contextCard={
        title || description ? (
          <div
            className={cn(
              "border-b px-4 py-3",
              themed ? "border-border bg-muted/40" : "border-rj-gray-100 bg-rj-gray-50",
            )}
          >
            {title ? (
              <p className={cn("text-xs font-bold", themed ? "text-foreground" : "text-rj-black")}>
                {title}
              </p>
            ) : null}
            {description ? (
              <p
                className={cn(
                  "mt-0.5 text-[11px] leading-snug",
                  themed ? "text-muted-foreground" : "text-rj-gray-600",
                )}
              >
                {description}
              </p>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <MessageThreadBody
        orderId={orderId}
        messages={messages}
        themed={themed}
        className="min-h-0 flex-1 p-4"
        listClassName="min-h-0 flex-1"
      />
    </OrderChatDock>
  );
}
