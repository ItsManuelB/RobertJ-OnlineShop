import type {
  OrderMessage,
  OrderMessageView,
} from "@/features/messages/types/message.types";

export interface MessageViewContext {
  /** The viewing user's id — their own messages become "You" and right-align. */
  viewerId: string;
  /** True when the viewer is the order's buyer (sees the shop name for staff). */
  viewerIsBuyer: boolean;
  /** Shop display name (shown to the buyer for any seller/admin message). */
  shopName: string;
  /** Buyer display name (shown to seller/admin for the buyer's messages). */
  buyerName: string;
}

/**
 * Resolves raw messages into display-ready views for one viewer — the same
 * attribution rule the buyer and seller/admin order-detail pages apply inline,
 * centralised here so the global inbox reuses it: the buyer sees seller/admin
 * messages as the shop name (never individual staff), while seller/admin see
 * the buyer's name and each shop-mate's individual name.
 */
export function toConversationMessageViews(
  messages: OrderMessage[],
  { viewerId, viewerIsBuyer, shopName, buyerName }: MessageViewContext,
): OrderMessageView[] {
  return messages.map((message) => ({
    id: message.id,
    body: message.body,
    createdAt: message.createdAt,
    isOwn: message.senderId === viewerId,
    authorLabel:
      message.senderId === viewerId
        ? "You"
        : viewerIsBuyer
          ? message.senderRole === "buyer"
            ? "Buyer"
            : shopName
          : message.senderRole === "buyer"
            ? buyerName
            : (message.senderName ?? "Shop staff"),
  }));
}
