/**
 * Checkout constants.
 *
 * `shippingFeeCentsPerSeller` is the shipping-fee source for checkout. The
 * schema has `orders.shipping_fee_cents` but **no shipping-rate table**, so the
 * fee is a flat constant per seller order (default 0 = free shipping). This is a
 * documented mapping, not a schema back-fill (see the module plan §7).
 *
 * Audit finding F-11, re-assessed: this fee applies ONCE PER SELLER'S
 * ORDER/PARCEL — by design, not a per-checkout total to be divided across a
 * multi-seller cart. Each seller's order gets its own `order_shipments` row,
 * courier, and tracking number, and is packed/shipped entirely
 * independently (`create_order_group` intentionally passes the same value
 * to every seller's inner `create_order` call, unsplit). When a non-zero
 * fee is introduced, size it as "the cost of shipping one seller's parcel,"
 * not "total checkout shipping" — a 3-seller cart is 3 real parcels.
 */
export const CHECKOUT_CONSTANTS = {
  shippingFeeCentsPerSeller: 0,
  /**
   * This marketplace is domestic-only (no courier/shipping API — see SAD Out
   * of Scope), so the shipping-address "Country" field is locked to this
   * value rather than free text. Single source of truth for the schema
   * (`checkout.schema.ts`) and the form's default/locked value.
   */
  shippingCountry: "Philippines",
  /**
   * Single source of truth for the checkout delivery-method display
   * (`ShippingMethodCard`). There's only one method today — no courier API,
   * no live tracking (SAD Out of Scope) — so this is a static estimate, not
   * data sourced from a real logistics integration.
   */
  standardDeliveryLabel: "Standard Delivery",
  standardDeliveryEstimate: "Estimated delivery: 3–5 business days",
} as const;

export const CHECKOUT_COPY = {
  placeOrder: "Place order",
  placingOrder: "Placing order…",
  codLabel: "Cash on Delivery",
  codDescription: "Pay when your order arrives. The seller marks it collected once received.",
  onlineLabel: "Online Payment",
  onlineDescription: "Pay securely via GCash, Maya, or Card — choose one below.",
  channelSectionLabel: "Choose how you'll pay",
  gcashLabel: "GCash",
  gcashDescription: "Redirects to GCash to complete payment.",
  mayaLabel: "Maya",
  mayaDescription: "Redirects to Maya to complete payment.",
  cardLabel: "Card",
  cardDescription: "Pay with a debit or credit card.",
  channelRequiredError: "Choose GCash, Maya, or Card to pay online.",
  orderSectionTitle: "Your Order",
  deliveryAddressSectionTitle: "Delivery Address",
  paymentSectionTitle: "Payment",
  shippingSectionTitle: "Shipping",
  shippingFreeLabel: "Free",
  notesSectionTitle: "Order Notes",
  notesPlaceholder: "Optional message to the seller (e.g. delivery instructions)…",
  emptyTitle: "Your cart is empty",
  emptyDescription: "Add items to your cart before checking out.",
  nothingSelectedTitle: "Nothing selected",
  nothingSelectedDescription:
    "Go back to your cart and check the items you'd like to order.",
  agreeNote: "Cash on Delivery needs no action. Paying online continues right after you place your order.",
  multiShopNoticePrefix: "This will be placed as",
  multiShopNoticeSuffix: "separate orders — one per shop.",
  /** Shown instead of multiShopNotice* when Online Payment is selected for a multi-seller cart — orders are still one per shop, but paid for together in one combined Xendit payment. */
  multiShopOnlinePaymentNotice:
    "One combined online payment will cover all shops in this checkout.",
  addressPrefilledNote:
    "Using the address from your last order — edit any field if this delivery is going somewhere else.",
  defaultAddressNote:
    "Using your default saved address — edit any field, or tap Change to pick another.",
  changeAddressLabel: "Change",
  addNewAddressNote: "Enter a delivery address below.",
  saveAddressLabel: "Save this address to my account",
} as const;
