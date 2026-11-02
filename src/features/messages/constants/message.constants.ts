/** Max length of a single order message — mirrored by the DB CHECK constraint
 * (`order_messages_body_length`) and the `send_order_message` RPC guard. */
export const MESSAGE_BODY_MAX_LENGTH = 2000;

/** Which side of the conversation a chat dock belongs to — keeps the persisted
 * open/minimized preference separate for the buyer dock vs. the seller/admin
 * dock even when both are viewed in the same browser. */
export type ChatDockScope = "buyer" | "dashboard";

/**
 * localStorage key for a chat dock's open/minimized preference, scoped per
 * order and per side. Built inline (not stored in a constants map) exactly like
 * the cart's `getCartStorageKey` — it's a client-only UI preference, never a DB
 * key. Purely frontend; nothing here touches Supabase.
 */
export function chatDockMinimizedStorageKey(
  scope: ChatDockScope,
  orderId: string,
): string {
  return `rj:chat-dock-open:${scope}:${orderId}`;
}
