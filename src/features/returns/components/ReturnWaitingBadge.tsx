import { Badge } from "@/components/ui/badge";
import {
  RETURN_ADMIN_DECISION_TARGET_DAYS,
  RETURN_SELLER_FULFILMENT_TARGET_DAYS,
} from "@/features/returns/constants/return.constants";
import type { ReturnRequest } from "@/features/returns/types/return.types";
import { getWaitingStatus } from "@/features/returns/utils/return-waiting";

const ACTOR_LABEL = { buyer: "buyer", seller: "seller", admin: "admin" } as const;

/**
 * "Waiting on admin · 3 days": who a request is waiting on and for how long, in
 * the seller and admin queues. Turns red once that person is past their target.
 * Renders nothing for closed requests and for the seller's first response,
 * which already has its own countdown (`ResponseDeadlineBadge`).
 */
export function ReturnWaitingBadge({ request }: { request: ReturnRequest }) {
  if (request.status === "pending") return null;
  const waiting = getWaitingStatus(request, {
    admin: RETURN_ADMIN_DECISION_TARGET_DAYS,
    seller: RETURN_SELLER_FULFILMENT_TARGET_DAYS,
  });
  if (!waiting) return null;

  const age = waiting.days === 0 ? "since today" : `${waiting.days} day${waiting.days === 1 ? "" : "s"}`;
  return (
    <Badge tone={waiting.pastTarget ? "danger" : "neutral"}>
      Waiting on {ACTOR_LABEL[waiting.actor]} · {age}
      {waiting.pastTarget ? " · late" : ""}
    </Badge>
  );
}
