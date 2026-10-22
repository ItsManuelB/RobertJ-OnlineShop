import { RETURN_STATUS } from "@/constants/status";
import { DecideReturnPanel } from "@/features/returns/components/DecideReturnPanel";
import { ReceiveReturnPanel } from "@/features/returns/components/ReceiveReturnPanel";
import { ShipReturnPanel } from "@/features/returns/components/ShipReturnPanel";
import type { ReturnRequest } from "@/features/returns/types/return.types";

export interface ReturnShippingActionsProps {
  request: ReturnRequest;
  viewer: "buyer" | "seller" | "admin";
}

/**
 * The action (if any) the viewer owns during the ship-back leg of a Return and
 * Refund — one place so the buyer page, seller/admin order pages and the queue
 * can't drift apart. Authorization is enforced by the RPCs; this only decides
 * what to offer:
 *   awaiting_return -> buyer ships it; admin may cancel
 *   return_shipped  -> seller (or admin) confirms receipt + inspects; admin may cancel
 *   return_received -> admin confirms the refund (or rejects)
 */
export function ReturnShippingActions({ request, viewer }: ReturnShippingActionsProps) {
  const isAdmin = viewer === "admin";

  switch (request.status) {
    case RETURN_STATUS.awaitingReturn:
      if (viewer === "buyer") {
        return <ShipReturnPanel returnId={request.id} deadlineAt={request.returnDeadlineAt} />;
      }
      return isAdmin ? (
        <DecideReturnPanel returnId={request.id} sellerRejected={false} requestedType={request.requestType} stage="in_transit" />
      ) : null;
    case RETURN_STATUS.returnShipped:
      if (viewer === "buyer") return null;
      return (
        <div className="flex flex-col gap-3">
          <ReceiveReturnPanel returnId={request.id} />
          {isAdmin ? (
            <DecideReturnPanel returnId={request.id} sellerRejected={false} requestedType={request.requestType} stage="in_transit" />
          ) : null}
        </div>
      );
    case RETURN_STATUS.returnReceived:
      return isAdmin ? (
        <DecideReturnPanel returnId={request.id} sellerRejected={false} requestedType={request.requestType} stage="received" />
      ) : null;
    default:
      return null;
  }
}
