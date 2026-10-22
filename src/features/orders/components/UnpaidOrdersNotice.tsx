import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { UNPAID_ORDER_EXPIRY_MINUTES } from "@/features/orders/constants/order-lifecycle.constants";
import { cn } from "@/lib/utils/cn";

export interface UnpaidOrdersNoticeProps {
  /** Orders in the "To Pay" lifecycle bucket (`getBuyerOrderLifecycleCounts().to_pay`). */
  count: number;
  /** True when the buyer is already looking at the To Pay tab — the notice would only repeat what's on screen. */
  onToPayTab: boolean;
}

/**
 * Reminder above the buyer's order list: an online-payment order that was
 * placed but not paid is held only briefly. Links to the existing To Pay tab,
 * where each order already has "Complete Payment" and "Cancel" — nothing here
 * starts or cancels a payment itself.
 */
export function UnpaidOrdersNotice({ count, onToPayTab }: UnpaidOrdersNoticeProps) {
  if (count === 0 || onToPayTab) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3"
    >
      <p className="flex-1 text-sm font-semibold text-foreground">
        {count === 1 ? "You have 1 order" : `You have ${count} orders`} waiting for payment. Unpaid online
        orders are cancelled automatically after {UNPAID_ORDER_EXPIRY_MINUTES} minutes.
      </p>
      <Link
        href={`${ROUTES.orders}?tab=to_pay`}
        className={cn(buttonVariants({ variant: "outline", size: "rjSm" }), "text-foreground")}
      >
        Pay or cancel
      </Link>
    </div>
  );
}
