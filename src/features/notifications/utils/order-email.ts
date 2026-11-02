// Types only on purpose: unit-tested with plain Node, which can't resolve the `@/` alias or sibling value imports.
import type { EmailMessage } from "@/lib/email/layout";

/** Mirrors the `kind` check constraint on `order_notification_log`. */
export const ORDER_EMAIL_KINDS = [
  "buyer_order_placed",
  "buyer_order_shipped",
  "buyer_order_delivered",
  "seller_new_order",
] as const;
export type OrderEmailKind = (typeof ORDER_EMAIL_KINDS)[number];
export type OrderEmailAudience = "buyer" | "seller";

export function isOrderEmailKind(value: string): value is OrderEmailKind {
  return (ORDER_EMAIL_KINDS as readonly string[]).includes(value);
}

export function getOrderEmailAudience(kind: OrderEmailKind): OrderEmailAudience {
  return kind.startsWith("seller_") ? "seller" : "buyer";
}

/** The seller's "order alerts" switch. A missing row means "never changed", which is on. */
export function isSellerOrderEmailAllowed(prefs: { alertOrders: boolean } | null): boolean {
  return prefs === null || prefs.alertOrders;
}

/** Why the person got the email, by audience. */
export const ORDER_EMAIL_REASON: Record<OrderEmailAudience, string> = {
  buyer: "You get this because order update emails are on for your account.",
  seller: "You get this because order alerts are on for your seller account.",
};

/** The order lines and shipment behind an email. Optional: an email without them still says what it must. */
export interface OrderEmailDetails {
  placedAt: string;
  shippingFeeCents: number;
  items: { name: string; variantLabel: string | null; quantity: number; amountCents: number }[];
  courier: string | null;
  trackingNumber: string | null;
}

export interface OrderEmailInput {
  kind: OrderEmailKind;
  orderNumber: string;
  /** Absolute link to the page where the recipient acts. */
  url: string;
  totalCents: number;
  currency: string;
  /** `cod` or `xendit` (online payment). */
  paymentMethod: string;
  paymentStatus: string;
  itemCount: number;
  /** The buyer's first name, for the greeting. Never used in a seller email. */
  firstName?: string | null;
  details?: OrderEmailDetails | null;
}

/** Most order lines an email lists; the rest are summarised so a big order does not make a huge email. */
export const ORDER_EMAIL_MAX_ITEMS = 10;

/** Integer cents to a display amount, e.g. "₱1,250.00". Falls back to a plain number for an unknown currency code. */
export function formatOrderTotal(totalCents: number, currency: string): string {
  const amount = totalCents / 100;
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** "2 Nov 2026, 4:12 pm" in Manila time. Written out here because a pure module cannot import its sibling's formatter. */
export function formatOrderPlaced(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function itemsLabel(count: number): string {
  return `${count} item${count === 1 ? "" : "s"}`;
}

function paymentLabel(isCod: boolean, isPaid: boolean): string {
  if (isCod) return "Cash on delivery";
  return isPaid ? "Online payment (paid)" : "Online payment (not paid yet)";
}

/** The order lines and the amounts under them, or just the item count and total when the lines are unknown. */
function orderBreakdown(input: OrderEmailInput): Pick<EmailMessage, "items" | "totals" | "rows"> {
  const total = formatOrderTotal(input.totalCents, input.currency);
  const { details } = input;
  if (!details || details.items.length === 0) {
    return { rows: [{ label: "Items", value: itemsLabel(input.itemCount) }, { label: "Total", value: total }] };
  }

  const items: NonNullable<EmailMessage["items"]> = details.items.slice(0, ORDER_EMAIL_MAX_ITEMS).map((item) => ({
    name: item.name,
    detail: item.variantLabel ?? undefined,
    quantity: item.quantity,
    amount: formatOrderTotal(item.amountCents, input.currency),
  }));
  const hidden = details.items.length - items.length;
  if (hidden > 0) items.push({ name: `and ${hidden} more ${hidden === 1 ? "item" : "items"}` });

  return {
    items,
    totals: [
      { label: "Shipping", value: formatOrderTotal(details.shippingFeeCents, input.currency) },
      { label: "Total", value: total, strong: true },
    ],
  };
}

/** The words of one order email. Pure: the caller supplies the link, the amounts and the lookups. */
export function orderEmailMessage(input: OrderEmailInput): EmailMessage {
  const { kind, orderNumber, url, details } = input;
  const total = formatOrderTotal(input.totalCents, input.currency);
  const isCod = input.paymentMethod === "cod";
  const isPaid = input.paymentStatus === "paid";
  const reason = ORDER_EMAIL_REASON[getOrderEmailAudience(kind)];
  const orderRow = { label: "Order", value: orderNumber };
  const paymentRow = { label: "Payment", value: paymentLabel(isCod, isPaid) };

  switch (kind) {
    case "buyer_order_placed": {
      const breakdown = orderBreakdown(input);
      return {
        subject: `We received your order ${orderNumber}`,
        preheader: isCod ? `Pay ${total} in cash when it arrives.` : isPaid ? "Your payment is confirmed." : "Complete your payment to start the order.",
        badge: { label: "Order received", tone: "brand" },
        headline: input.firstName ? `Thanks for your order, ${input.firstName}` : "Thanks for your order",
        paragraphs: [
          isCod
            ? "The seller will confirm and prepare it. You pay in cash when it arrives."
            : isPaid
              ? "Your payment is confirmed. The seller will confirm and prepare it."
              : "Please complete your online payment from your order page so the seller can start preparing it.",
        ],
        rows: [orderRow, ...(details ? [{ label: "Placed", value: formatOrderPlaced(details.placedAt) }] : []), paymentRow, ...(breakdown.rows ?? [])],
        items: breakdown.items,
        totals: breakdown.totals,
        cta: { label: "View my order", url },
        reason,
      };
    }
    case "buyer_order_shipped": {
      const shipment: { label: string; value: string }[] = [];
      if (details?.courier) shipment.push({ label: "Courier", value: details.courier });
      if (details?.trackingNumber) shipment.push({ label: "Tracking number", value: details.trackingNumber });
      return {
        subject: `Your order ${orderNumber} has been shipped`,
        preheader: isCod ? `Have ${total} ready when it arrives.` : "Follow its progress on your order page.",
        badge: { label: "On its way", tone: "info" },
        headline: "Your order is on its way",
        paragraphs: [`Order ${orderNumber} has left the seller. You can follow its progress on your order page.`],
        rows: [orderRow, ...shipment, ...(isCod ? [{ label: "To pay on arrival", value: `${total} in cash` }] : [])],
        cta: { label: "Follow my order", url },
        reason,
      };
    }
    case "buyer_order_delivered":
      return {
        subject: `Your order ${orderNumber} was delivered`,
        preheader: "Something wrong? You can ask for a return.",
        badge: { label: "Delivered", tone: "success" },
        headline: "Your order was delivered",
        paragraphs: [
          `Order ${orderNumber} was marked as delivered.`,
          "If something is wrong with it, you can request a return or refund from your order page.",
        ],
        cta: { label: "View my order", url },
        reason,
      };
    case "seller_new_order": {
      const breakdown = orderBreakdown(input);
      return {
        subject: `New order ${orderNumber}: ${total}`,
        preheader: `${itemsLabel(input.itemCount)}, ${isCod ? "cash on delivery" : "payment confirmed"}. Confirm it to start preparing.`,
        badge: { label: "New order", tone: "brand" },
        headline: "You have a new order",
        paragraphs: ["Open the order to confirm and prepare it."],
        rows: [orderRow, { label: "Payment", value: isCod ? "Cash on delivery" : "Paid online" }, ...(breakdown.rows ?? [])],
        items: breakdown.items,
        totals: breakdown.totals,
        cta: { label: "Open orders", url },
        reason,
      };
    }
  }
}
