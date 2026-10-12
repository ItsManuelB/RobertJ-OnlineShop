import { Badge } from "@/components/ui/badge";
import type { OrderStatus, PaymentStatus } from "@/constants/status";
import {
  getOrderStatusLabel,
  getOrderStatusTone,
} from "@/features/orders/constants/order.constants";

export interface OrderStatusBadgeProps {
  status: OrderStatus;
  /**
   * F-07: a successfully paid online order still sits at `order_status:
   * 'pending'` until the seller confirms it — identical to an unpaid COD
   * order's own 'pending' — because the seller always confirms every order,
   * regardless of payment method (see `ORDER_STATUS_TRANSITIONS`'s own
   * comment; this is deliberately NOT changed here). Passing `paymentStatus`
   * + `paymentMethod` lets this one specific combination read as "Paid —
   * awaiting seller" instead of a bare "Pending" that, sitting next to an
   * already-"Paid" `PaymentStatusBadge`, reads as if something's stuck.
   * Both optional — omitting them keeps the plain label (dashboard contexts
   * that don't have this data on hand yet).
   */
  paymentStatus?: PaymentStatus;
  paymentMethod?: "cod" | "xendit";
}

/**
 * Order status pill. The customer-facing label is the primary signal; the tone
 * is secondary so colour is never the only differentiator (WCAG 2.2 AA).
 */
export function OrderStatusBadge({ status, paymentStatus, paymentMethod }: OrderStatusBadgeProps) {
  const isPaidAwaitingSeller =
    status === "pending" && paymentMethod === "xendit" && paymentStatus === "paid";

  return (
    <Badge tone={isPaidAwaitingSeller ? "success" : getOrderStatusTone(status)}>
      {isPaidAwaitingSeller ? "Paid — awaiting seller" : getOrderStatusLabel(status)}
    </Badge>
  );
}
