import type { UserRole } from "@/constants/roles";

/**
 * One message in an order's conversation, as returned by the service layer.
 * `senderId`/`senderName` are kept for the seller-side view and for audit; the
 * buyer-facing UI never renders an individual staff name (it resolves
 * seller/admin messages to the shop name — see the order-detail pages).
 */
export interface OrderMessage {
  id: string;
  orderId: string;
  senderId: string;
  senderRole: UserRole;
  /** Individual author's display name (full name or username), or null. */
  senderName: string | null;
  body: string;
  createdAt: string;
}

/**
 * Display-ready message for the thread UI. Author identity is resolved
 * per-viewer on the server (so the buyer never receives a seller's individual
 * name), leaving the client component presentational only.
 */
export interface OrderMessageView {
  id: string;
  body: string;
  createdAt: string;
  /** Pre-resolved author label ("You", the shop name, or a buyer/staff name). */
  authorLabel: string;
  /** Whether the viewing user authored this message (right-aligned bubble). */
  isOwn: boolean;
}

/**
 * One row in the global inbox's conversation list (one per order with messages
 * the viewer can see). `title` is the counterpart's display name already
 * resolved for the viewer — the shop name for the buyer, the buyer name for
 * seller/admin. From `list_my_conversations`.
 */
export interface ConversationSummary {
  orderId: string;
  orderNumber: string;
  title: string;
  viewerIsBuyer: boolean;
  lastBody: string | null;
  lastCreatedAt: string | null;
  lastSenderId: string | null;
  unreadCount: number;
  pinned: boolean;
}

/**
 * Header/identity data for one conversation — also resolves for an order with
 * no messages yet (a deep-linked "Message" from an order page). From
 * `get_conversation_context`; `shopName`/`buyerName` drive per-viewer author
 * labelling.
 */
export interface ConversationContext {
  orderId: string;
  orderNumber: string;
  viewerIsBuyer: boolean;
  shopName: string;
  buyerName: string;
}
