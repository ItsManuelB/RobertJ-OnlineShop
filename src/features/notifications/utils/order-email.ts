// Types only on purpose: unit-tested with plain Node, which can't resolve the `@/` alias or sibling value imports.
import type { EmailParts } from "./return-email";

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

export const ORDER_EMAIL_FOOTER: Record<OrderEmailAudience, string> = {
  buyer: "You receive this because order update emails are on in your account notification settings.",
  seller: "You receive this because order alerts are on in your seller notification settings.",
};

export interface OrderEmailInput {
  kind: OrderEmailKind;
  orderNumber: string;
  totalCents: number;
  currency: string;
  /** `cod` or `xendit` (online payment). */
  paymentMethod: string;
  paymentStatus: string;
  itemCount: number;
}

/** Integer cents to a display amount, e.g. "₱1,250.00". Falls back to a plain number for an unknown currency code. */
export function formatOrderTotal(totalCents: number, currency: string): string {
  const amount = totalCents / 100;
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function itemsLabel(count: number): string {
  return `${count} item${count === 1 ? "" : "s"}`;
}

/** The words of one order email. Pure: the caller supplies the link and renders it. */
export function orderEmailParts(input: OrderEmailInput): EmailParts {
  const { kind, orderNumber } = input;
  const total = formatOrderTotal(input.totalCents, input.currency);
  const summary = `${itemsLabel(input.itemCount)}, total ${total}`;
  const isCod = input.paymentMethod === "cod";
  const isPaid = input.paymentStatus === "paid";

  switch (kind) {
    case "buyer_order_placed":
      return {
        subject: `We received your order ${orderNumber}`,
        intro: `Thank you for your order ${orderNumber}: ${summary}.`,
        detail: isCod
          ? "You chose cash on delivery, so you pay when it arrives. The seller will confirm and prepare your order."
          : isPaid
            ? "Your payment is confirmed. The seller will confirm and prepare your order."
            : "Please complete your online payment from your order page so the seller can start preparing it.",
        cta: "View my order",
      };
    case "buyer_order_shipped":
      return {
        subject: `Your order ${orderNumber} has been shipped`,
        intro: `Your order ${orderNumber} is on its way.`,
        detail: isCod
          ? `You chose cash on delivery, so please have ${total} ready when it arrives. You can follow its progress on your order page.`
          : "You can follow its progress on your order page.",
        cta: "View my order",
      };
    case "buyer_order_delivered":
      return {
        subject: `Your order ${orderNumber} was delivered`,
        intro: `Your order ${orderNumber} was marked as delivered.`,
        detail: "If something is wrong with it, you can request a return or refund from your order page.",
        cta: "View my order",
      };
    case "seller_new_order":
      return {
        subject: `New order ${orderNumber}`,
        intro: `You have a new order ${orderNumber}: ${summary}.`,
        detail: `${isCod ? "Payment is cash on delivery." : "Payment is confirmed."} Open the order to confirm and prepare it.`,
        cta: "Open orders",
      };
  }
}
