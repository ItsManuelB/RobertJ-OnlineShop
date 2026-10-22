import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/date";

export interface BuyerReceiptConfirmationProps {
  confirmedAt: string;
}

/**
 * Seller/admin-facing readout of the buyer's "Confirm Received" action — the
 * counterpart to `ConfirmReceivedButton`/`DeliveryResolutionChoice` on the
 * buyer's own order page. Without this, a seller had no way to tell whether
 * a delivered order was ever actually confirmed by the buyer.
 */
export function BuyerReceiptConfirmation({ confirmedAt }: BuyerReceiptConfirmationProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="success">Receipt confirmed</Badge>
      <span className="text-xs text-muted-foreground">{formatDateTime(confirmedAt)}</span>
    </div>
  );
}
