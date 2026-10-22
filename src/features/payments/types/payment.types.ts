import type { PaymentStatus } from "@/constants/status";
import type { PaymentSourceFilter } from "@/features/payments/lib/payment-source";

/** A payment attempt (COD collection, or Xendit online payment), as seen in payment history views. */
export interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  /** Buyer display name (full name, falling back to username), or null. */
  buyerName: string | null;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  paymentMethodType: PaymentMethodType;
  /** GCASH / PAYMAYA / CARD — set once Xendit confirms the channel actually used. Null for COD. */
  paymentChannel: string | null;
  /** Xendit's hosted redirect/session URL, so an interrupted attempt can resume. Null for COD. */
  checkoutUrl: string | null;
  expiresAt: string | null;
  /** Supabase Storage object path for legacy QR receipts — historical only, never created for new payments. */
  receiptPath: string | null;
  failureReason: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  /** Xendit's own reference for this attempt. Null until finalized, always null for COD/legacy QR. Phase 4B: surfaced so Admin can spot a stale-but-unresolved attempt (same field `isStaleXenditAttempt` reads). */
  xenditPaymentRequestId: string | null;
  /** Set only for a combined multi-seller payment; null for a single-order attempt. Phase 4B: surfaced so Admin can tell a row is one leg of a shared charge. */
  checkoutGroupId: string | null;
  createdAt: string;
}

/** Mirrors the DB `payment_method_type` enum. */
export type PaymentMethodType = "cod" | "card" | "qr_upload" | "xendit";

/** Filters accepted by the Seller/Admin dashboard payment history listing. */
export interface DashboardPaymentListParams {
  page: number;
  pageSize: number;
  /** Order-number search (ilike `orders.order_number`). */
  search?: string;
  status?: PaymentStatus;
  paymentMethodType?: PaymentMethodType;
  /** Fine-grained source filter shared by Seller and Admin. */
  paymentSource?: PaymentSourceFilter;
  /** Admin-only: narrows to stale, still-pending Xendit attempts awaiting reconciliation — see `isStaleXenditAttempt`. */
  staleOnly?: boolean;
}

/** Full filtered payment-history summary, independent of table pagination. */
export interface PaymentHistorySummary {
  paymentCount: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  refundedCount: number;
  paidAmountCents: number;
}

/**
 * The raw `payments` row returned directly by the Xendit/COD RPCs (no order
 * join) — used by the buyer-facing payment-creation flow, as opposed to
 * `Payment`, which is joined with order/buyer info for history views.
 */
export interface PaymentAttempt {
  id: string;
  orderId: string;
  status: PaymentStatus;
  paymentMethodType: PaymentMethodType;
  paymentChannel: string | null;
  amountCents: number;
  currency: string;
  checkoutUrl: string | null;
  expiresAt: string | null;
  xenditPaymentRequestId: string | null;
  failureReason: string | null;
  /** Set only for a combined multi-seller payment; null for a single-order attempt. */
  checkoutGroupId: string | null;
  createdAt: string;
}
