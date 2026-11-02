import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { RJ_CARD } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { formatHoldLeft } from "@/features/account/utils/account-attention";
import { cn } from "@/lib/utils/cn";

export interface AccountAttentionPanelProps {
  toPayCount: number;
  /** Minutes left on the oldest unpaid order's hold, or null when none is waiting. */
  holdMinutesLeft: number | null;
  toReceiveCount: number;
  returnCount: number;
  /** Delivered items without a review yet. */
  toReviewCount: number;
}

interface AttentionItem {
  key: string;
  title: string;
  detail: string;
  href: string;
  action: string;
}

/**
 * "Needs your attention": what the buyer can act on right now (pay, confirm a parcel, follow
 * a return). Counts come from the same lifecycle view as the Orders tabs, so they always
 * match. Shows a calm "all caught up" line when there is nothing to do.
 */
export function AccountAttentionPanel({
  toPayCount,
  holdMinutesLeft,
  toReceiveCount,
  returnCount,
  toReviewCount,
}: AccountAttentionPanelProps) {
  const items: AttentionItem[] = [];

  if (toPayCount > 0) {
    items.push({
      key: "to_pay",
      title: toPayCount === 1 ? "1 order waiting for payment" : `${toPayCount} orders waiting for payment`,
      detail: holdMinutesLeft === null ? "Unpaid orders are cancelled automatically." : formatHoldLeft(holdMinutesLeft),
      href: `${ROUTES.orders}?tab=to_pay`,
      action: "Pay or cancel",
    });
  }
  if (toReceiveCount > 0) {
    items.push({
      key: "to_receive",
      title: toReceiveCount === 1 ? "1 parcel on its way" : `${toReceiveCount} parcels on their way`,
      detail: "Confirm receipt once it arrives.",
      href: `${ROUTES.orders}?tab=to_receive`,
      action: "View parcels",
    });
  }
  if (returnCount > 0) {
    items.push({
      key: "return_refund",
      title: returnCount === 1 ? "1 return or refund in progress" : `${returnCount} returns or refunds in progress`,
      detail: "Check the latest update.",
      href: `${ROUTES.orders}?tab=return_refund`,
      action: "View updates",
    });
  }

  if (toReviewCount > 0) {
    items.push({
      key: "to_review",
      title: toReviewCount === 1 ? "1 item to review" : `${toReviewCount} items to review`,
      detail: "Tell other buyers what you think.",
      href: "#items-to-review",
      action: "Rate items",
    });
  }

  return (
    <section aria-label="Needs your attention" className="flex flex-col gap-3">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-400">Needs your attention</h2>
      {items.length === 0 ? (
        <p className={cn(RJ_CARD, "flex items-center gap-2 p-4 text-sm text-rj-gray-600")}>
          <CheckCircle2 className="h-4 w-4 shrink-0 text-rj-gray-400" aria-hidden="true" />
          You&apos;re all caught up. Nothing needs your attention right now.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className={cn(
                  RJ_CARD,
                  "flex h-full flex-col gap-1 p-4 transition-all hover:border-rj-black hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30",
                )}
              >
                <span className="text-sm font-bold text-rj-black">{item.title}</span>
                <span className="text-xs text-rj-gray-600">{item.detail}</span>
                <span className="mt-2 text-xs font-semibold text-rj-red-dark">{item.action} →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
