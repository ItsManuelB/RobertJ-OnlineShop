"use server";

import { fail, fromZodError, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import type { ActionResult } from "@/types/action.types";
import { uuidSchema } from "@/lib/validations/common.schema";
import { revalidateOrderSurfaces } from "@/features/orders";
import { sendOrderMessageSchema } from "@/features/messages/schemas/message.schema";
import { toConversationMessageViews } from "@/features/messages/utils/message-view";
import type {
  ConversationContext,
  ConversationSummary,
  OrderMessageView,
} from "@/features/messages/types/message.types";

/**
 * Sends a message in an order's buyer<->shop conversation. Authorization
 * (caller is an order participant) and the sender identity/role derivation all
 * happen inside the `send_order_message` RPC — this action validates input and
 * delegates. `requireSessionUser` here is defense-in-depth; the RPC re-checks
 * `auth.uid()` independently. Revalidates every order-detail surface so the new
 * message appears for the buyer and the shop's sellers/admin alike.
 */
export async function sendOrderMessageAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = sendOrderMessageSchema.safeParse({
    orderId: formData.get("orderId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireSessionUser();
    await queries.sendOrderMessage(parsed.data.orderId, parsed.data.body);
    await revalidateOrderSurfaces(parsed.data.orderId);
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not send your message.",
    );
  }
}

/**
 * Global inbox: the viewer's conversation list (one per order with messages),
 * for the launcher badge + list pane. Authorization lives in the
 * `list_my_conversations` RPC; `requireSessionUser` is defense-in-depth.
 */
export async function listConversationsAction(): Promise<
  ActionResult<ConversationSummary[]>
> {
  try {
    await queries.requireSessionUser();
    const conversations = await queries.listMyConversations();
    return ok(conversations);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not load your conversations.",
    );
  }
}

/**
 * Loads one conversation for the inbox's detail pane: its header context + the
 * per-viewer resolved messages, and marks it read. Works for an order with no
 * messages yet (deep-linked "Message"). Access is enforced by the context RPC
 * (returns null → no access).
 */
export async function loadConversationAction(
  orderId: string,
): Promise<
  ActionResult<{ context: ConversationContext; messages: OrderMessageView[] }>
> {
  const parsedId = uuidSchema.safeParse(orderId);
  if (!parsedId.success) return fail("Invalid conversation.");

  try {
    const user = await queries.requireSessionUser();
    const context = await queries.getConversationContext(parsedId.data);
    if (!context) return fail("You do not have access to this conversation.");

    const messages = await queries.listOrderMessages(parsedId.data);
    const views = toConversationMessageViews(messages, {
      viewerId: user.id,
      viewerIsBuyer: context.viewerIsBuyer,
      shopName: context.shopName,
      buyerName: context.buyerName,
    });

    // Opening a conversation marks it read; a failure here is non-fatal (the
    // unread badge simply lingers until the next open).
    await queries.markConversationRead(parsedId.data).catch(() => {});

    return ok({ context, messages: views });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not load this conversation.",
    );
  }
}

/** Pins/unpins a conversation for the signed-in user. */
export async function toggleConversationPinAction(
  orderId: string,
  pinned: boolean,
): Promise<ActionResult<null>> {
  const parsedId = uuidSchema.safeParse(orderId);
  if (!parsedId.success) return fail("Invalid conversation.");

  try {
    await queries.requireSessionUser();
    await queries.setConversationPinned(parsedId.data, pinned);
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not update the conversation.",
    );
  }
}
