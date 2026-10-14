import { z } from "zod";

import { CHECKOUT_CONSTANTS } from "@/features/checkout/constants/checkout.constants";
import { uuidSchema } from "@/lib/validations/common.schema";

/**
 * Shipping address (camelCase domain shape). The DB snapshot CHECK requires
 * `full_name, line1, city, postal_code, country`; line2/phone are optional and
 * are mapped to snake_case at the service boundary (`queries.createOrder`).
 */
export const shippingAddressSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name is required.")
    .max(120, "Full name must be 120 characters or fewer."),
  line1: z
    .string()
    .trim()
    .min(1, "Street address is required.")
    .max(120, "Street address must be 120 characters or fewer."),
  line2: z.string().trim().max(120).optional().default(""),
  // Optional structured fields (Phase 2 — saved addresses carry these; a
  // manually-typed checkout address may leave them blank). Carried through
  // to the order's `shipping_address` jsonb snapshot as extra keys — the
  // snapshot's CHECK constraint only requires fullName/line1/city/postalCode/
  // country to be present, not that the object contains only those.
  barangay: z.string().trim().max(120).optional().default(""),
  province: z.string().trim().max(120).optional().default(""),
  region: z.string().trim().max(120).optional().default(""),
  city: z.string().trim().min(1, "City is required.").max(120),
  postalCode: z
    .string()
    .trim()
    .min(1, "Postal code is required.")
    .max(20, "Postal code must be 20 characters or fewer."),
  // Domestic-only marketplace (no courier/shipping API) — locked server-side,
  // not just in the UI, since the client is never trusted for this.
  country: z.literal(CHECKOUT_CONSTANTS.shippingCountry),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number.")
    // Without this, an empty string (the field's own default/empty state,
    // not `undefined`) fails the regex instead of being treated as "not
    // provided" — matches account.schema.ts's `phone`, the same fix already
    // established in this codebase.
    .or(z.literal(""))
    .default(""),
});

/** One line to order: product + quantity, optionally a specific variant. The RPC re-validates stock/price. */
export const checkoutItemSchema = z.object({
  productId: uuidSchema,
  variantId: uuidSchema.optional(),
  quantity: z.number().int().min(1).max(999),
});

export const checkoutGroupSchema = z.object({
  sellerId: uuidSchema,
  sellerName: z.string().nullable().optional(),
  items: z.array(checkoutItemSchema).min(1, "A group must contain at least one item."),
});

/**
 * Optional buyer message, applied identically to every seller order created
 * from this checkout — `orders.notes` already exists and `create_order`
 * already accepts `p_notes`; this is the first UI path that populates it.
 */
export const orderNotesSchema = z
  .string()
  .trim()
  .max(500, "Notes must be 500 characters or fewer.")
  .optional();

/**
 * Channel sub-selection under Online Payment. Only meaningful when
 * `paymentMethod === "xendit"`; ignored (and not required) for COD.
 */
export const xenditChannelSchema = z.enum(["GCASH", "PAYMAYA", "CARD"]);

/**
 * Payload for `placeOrderAction`. The buyer now makes the GCash/Maya/Card
 * choice at checkout itself (inline submenu under Online Payment), not
 * afterward on the order page — `xenditChannel` is required whenever
 * `paymentMethod` is `"xendit"` so a crafted/bypassed client request can't
 * place an online-payment order with no channel selected. `create_order` /
 * `create_order_group` don't take this value (they never gated on payment
 * method); the action only validates it here and the client uses its own
 * selection to immediately continue into the matching Xendit action.
 */
export const placeOrderSchema = z
  .object({
    address: shippingAddressSchema,
    groups: z.array(checkoutGroupSchema).min(1, "Your cart is empty."),
    notes: orderNotesSchema,
    paymentMethod: z.enum(["cod", "xendit"]).default("cod"),
    xenditChannel: xenditChannelSchema.optional(),
    // Per-checkout-attempt idempotency key (client-generated, stable across
    // retries of the same attempt). Threaded into create_order/
    // create_order_group so a duplicate submission replays the existing
    // order(s) instead of creating new ones. Optional: an older client that
    // omits it keeps today's behaviour.
    idempotencyKey: uuidSchema.optional(),
  })
  .refine(
    (data) => data.paymentMethod !== "xendit" || data.xenditChannel !== undefined,
    {
      message: "Choose GCash, Maya, or Card to pay online.",
      path: ["xenditChannel"],
    },
  );

/** `/checkout?buyNow=<productId>&variant=<variantId>&qty=<n>` — validated before anything is read from the database. */
export const buyNowParamsSchema = z.object({
  buyNow: uuidSchema,
  variant: uuidSchema.optional(),
  qty: z.coerce.number().int().min(1).max(999).default(1),
});

export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;
export type CheckoutItemInput = z.infer<typeof checkoutItemSchema>;
export type CheckoutGroupInput = z.infer<typeof checkoutGroupSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type XenditChannel = z.infer<typeof xenditChannelSchema>;
