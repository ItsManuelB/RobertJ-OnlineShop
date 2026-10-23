import { RJ_CARD } from "@/components/ui/card";
import type { CancellationRequest } from "@/features/orders/types/cancellation.types";
import { cn } from "@/lib/utils/cn";

/**
 * Buyer-facing state of their "please cancel" request: waiting, or declined
 * with the shop's reason (the order stays active). An approved request needs no
 * notice here — the order is cancelled and the refund card takes over.
 */
export function CancellationRequestNotice({ request }: { request: CancellationRequest }) {
  if (request.status === "approved") return null;

  const copy =
    request.status === "pending"
      ? {
          title: "Cancellation requested",
          body: "The shop is reviewing your request. Your order stays active until they respond.",
        }
      : request.status === "rejected"
        ? {
            title: "Cancellation declined",
            body: `The shop could not cancel this order${request.decisionNote ? `: “${request.decisionNote}”` : "."} Your order will continue as normal.`,
          }
        : {
            title: "Cancellation request closed",
            body: "The order moved on before the shop responded, so this request is no longer needed.",
          };

  return (
    <section aria-label="Cancellation request" className={cn(RJ_CARD, "flex flex-col gap-1 p-5")}>
      <h2 className="text-sm font-semibold text-rj-black">{copy.title}</h2>
      <p className="text-xs text-rj-gray-600">{copy.body}</p>
      <p className="text-xs text-rj-gray-500">Your reason: “{request.reason}”</p>
    </section>
  );
}
