/**
 * One display/category mapping for payment rows across Seller and Admin.
 * Xendit is the payment method; its channel is the customer's chosen source.
 * Legacy Stripe-card and QR rows stay distinct from current Xendit channels.
 */
export type PaymentSourceKey =
  | "cod"
  | "gcash"
  | "paymaya"
  | "xendit_card"
  | "online_unrecorded"
  | "online_other"
  | "qr_upload_legacy"
  | "card_legacy"
  | "other"
  | "not_recorded";

export interface PaymentSource {
  key: PaymentSourceKey;
  label: string;
  detail?: string;
}

export interface PaymentSourceInput {
  paymentMethodType?: string | null;
  paymentChannel?: string | null;
}

export const PAYMENT_SOURCE_LABELS: Record<PaymentSourceKey, string> = {
  cod: "Cash on Delivery",
  gcash: "GCash",
  paymaya: "Maya (PayMaya)",
  xendit_card: "Card",
  online_unrecorded: "Online payment (channel not recorded)",
  online_other: "Online payment (other channel)",
  qr_upload_legacy: "QR transfer (legacy)",
  card_legacy: "Card (legacy)",
  other: "Other payment",
  not_recorded: "Payment method not recorded",
};

export const PAYMENT_SOURCE_DOT: Record<PaymentSourceKey, string> = {
  cod: "bg-success",
  gcash: "bg-info",
  paymaya: "bg-primary",
  xendit_card: "bg-warning",
  online_unrecorded: "bg-muted-foreground/50",
  online_other: "bg-muted-foreground",
  qr_upload_legacy: "bg-muted-foreground",
  card_legacy: "bg-muted-foreground",
  other: "bg-muted-foreground",
  not_recorded: "bg-muted-foreground/50",
};

export const PAYMENT_SOURCE_FILTER_OPTIONS = [
  { value: "cod", label: "Cash on Delivery" },
  { value: "gcash", label: "GCash" },
  { value: "paymaya", label: "Maya (PayMaya)" },
  { value: "xendit_card", label: "Card" },
] as const;

export type PaymentSourceFilter = (typeof PAYMENT_SOURCE_FILTER_OPTIONS)[number]["value"];
export const PAYMENT_SOURCE_FILTER_VALUES = PAYMENT_SOURCE_FILTER_OPTIONS.map(({ value }) => value) as [
  PaymentSourceFilter,
  ...PaymentSourceFilter[],
];

export function isPaymentSourceFilter(value: string | null | undefined): value is PaymentSourceFilter {
  return PAYMENT_SOURCE_FILTER_OPTIONS.some((option) => option.value === value);
}

/** Provider channel codes accepted for each normalized finance filter. */
export function channelsForPaymentSourceFilter(filter: PaymentSourceFilter): string[] {
  switch (filter) {
    case "gcash":
      return ["GCASH"];
    case "paymaya":
      return ["PAYMAYA", "MAYA"];
    case "xendit_card":
      return ["CARD"];
    default:
      return [];
  }
}

export function paymentSourceOf(input: PaymentSourceInput): PaymentSource {
  const method = (input.paymentMethodType ?? "").trim().toLowerCase();
  const channel = (input.paymentChannel ?? "").trim().toUpperCase();

  if (method === "cod") return { key: "cod", label: "Cash on Delivery" };
  if (method === "xendit") {
    if (channel === "GCASH") return { key: "gcash", label: "GCash", detail: "via Xendit" };
    if (channel === "PAYMAYA" || channel === "MAYA") {
      return { key: "paymaya", label: "Maya (PayMaya)", detail: "via Xendit" };
    }
    if (channel === "CARD") return { key: "xendit_card", label: "Card", detail: "via Xendit" };
    if (!channel) {
      return { key: "online_unrecorded", label: "Online payment", detail: "Channel not recorded" };
    }
    return { key: "online_other", label: "Online payment (other channel)", detail: "via Xendit" };
  }
  if (method === "qr_upload") return { key: "qr_upload_legacy", label: "QR transfer (legacy)" };
  if (method === "card") return { key: "card_legacy", label: "Card (legacy)" };
  if (method) return { key: "other", label: "Other payment" };
  return { key: "not_recorded", label: "Payment method not recorded" };
}

export function paymentSourceCsvLabel(input: PaymentSourceInput): string {
  const source = paymentSourceOf(input);
  return source.detail ? `${source.label} · ${source.detail}` : source.label;
}
