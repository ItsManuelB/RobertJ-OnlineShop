/** Max length of a single order message — mirrored by the DB CHECK constraint
 * (`order_messages_body_length`) and the `send_order_message` RPC guard. */
export const MESSAGE_BODY_MAX_LENGTH = 2000;
