import { RJ_CARD } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date";

export interface ReceiptConfirmedNoticeProps {
  confirmedAt: string;
}

/**
 * Acknowledges the buyer's own "Confirm Received" action on return visits to
 * the order page — without this, the page silently fell back to
 * `ReportProblemPanel` with no record that the buyer had already confirmed.
 */
export function ReceiptConfirmedNotice({ confirmedAt }: ReceiptConfirmedNoticeProps) {
  return (
    <div className={cn(RJ_CARD, "flex items-center gap-2 p-4")}>
      <span aria-hidden="true">✅</span>
      <p className="text-xs text-rj-gray-600">
        You confirmed receipt of this order on {formatDateTime(confirmedAt)}.
      </p>
    </div>
  );
}
