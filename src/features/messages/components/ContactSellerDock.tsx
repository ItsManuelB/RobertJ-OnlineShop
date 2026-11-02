"use client";

import Image from "next/image";

import { MessageThreadBody } from "@/features/messages/components/MessageThreadBody";
import { OrderChatDock } from "@/features/messages/components/OrderChatDock";
import { chatDockMinimizedStorageKey } from "@/features/messages/constants/message.constants";
import type { OrderMessageView } from "@/features/messages/types/message.types";

export interface ContactSellerDockProps {
  orderId: string;
  messages: OrderMessageView[];
  /** Shop name shown in the panel context card (the buyer never sees individual staff names). */
  shopName: string | null;
  orderNumber: string;
  /** e.g. "Delivered" / "Shipped" — the order's current status label. */
  statusLabel: string;
  /** e.g. "1 item". */
  itemSummary: string;
  /** Pre-formatted order total, e.g. "₱685.00". */
  totalLabel: string;
  /** First item's image, or null for a placeholder. */
  thumbnailUrl: string | null;
}

/**
 * Buyer-facing "Contact Seller" chat: a bottom-right launcher pill that expands
 * into the shared `OrderChatDock` panel (order-context card + conversation +
 * composer). One shared `MessageThreadBody` powers both this dock and the
 * seller's. The buyer always sees the shop name, never an individual staff
 * member.
 */
export function ContactSellerDock({
  orderId,
  messages,
  shopName,
  orderNumber,
  statusLabel,
  itemSummary,
  totalLabel,
  thumbnailUrl,
}: ContactSellerDockProps) {
  return (
    <OrderChatDock
      badgeCount={messages.length}
      storageKey={chatDockMinimizedStorageKey("buyer", orderId)}
      contextCard={
        <div className="flex items-center gap-3 border-b border-rj-gray-100 bg-rj-gray-50 px-4 py-3">
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 shrink-0 rounded object-cover"
            />
          ) : (
            <div className="h-11 w-11 shrink-0 rounded bg-rj-gray-200" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-rj-black">{shopName ?? "Seller"}</p>
            <p className="truncate text-xs text-rj-gray-600">
              {itemSummary} · Order Total {totalLabel}
            </p>
            <p className="truncate text-[10px] text-rj-gray-400">
              {statusLabel} · {orderNumber}
            </p>
          </div>
        </div>
      }
    >
      <MessageThreadBody
        orderId={orderId}
        messages={messages}
        className="min-h-0 flex-1 p-4"
        listClassName="min-h-0 flex-1"
      />
    </OrderChatDock>
  );
}
