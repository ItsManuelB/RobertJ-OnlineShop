import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import type { UserRole } from "@/constants/roles";
import { CheckoutResumePanel } from "@/features/checkout/components/CheckoutResumePanel";
import type { XenditChannel } from "@/features/checkout/schemas/checkout.schema";
import { PaymentStatusWatcher } from "@/features/payments/components/PaymentStatusWatcher";
import { reconcileReturnedXenditPayment } from "@/features/payments/lib/xendit-reconciliation";
import { canPurchase } from "@/lib/auth/permissions";
import * as queries from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Complete Payment" };

interface CheckoutResumePageProps {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Checkout's payment workspace for an order that already exists — the ONLY
 * place buyer payment initiation, retry, resume, or channel-switching is
 * allowed to happen (see docs/payment-ux-architecture-audit.md). Orders may
 * only navigate here; it never renders `PaymentRecoveryPanel` itself.
 */
export default async function CheckoutResumePage({ params, searchParams }: CheckoutResumePageProps) {
  const [{ orderId }, query] = await Promise.all([params, searchParams]);
  const user = await queries.requireSessionUser();
  // Buyer-only payment workspace — seller/admin can't initiate/resume payment.
  if (!canPurchase(user.role as UserRole)) redirect(ROUTES.home);
  const order = await queries.getBuyerOrder(orderId, user.id);

  if (!order) notFound();

  // Nothing to resume for COD, a cancelled order, or a payment that's
  // already resolved (paid/refunded) — land on the order's own page instead
  // of a payment workspace with nothing left to do. Mirrors the same
  // conditions `buyer_order_lifecycle`'s "to_pay" bucket already gates on.
  if (
    order.paymentMethod !== "xendit" ||
    order.status === "cancelled" ||
    !(order.paymentStatus === "pending" || order.paymentStatus === "failed")
  ) {
    redirect(ROUTES.orderDetail(order.id));
  }

  const [activePayment, groupSize] = await Promise.all([
    queries.getActivePaymentForOrder(order.id).catch(() => null),
    order.checkoutGroupId
      ? queries
          .getOrderIdsForCheckoutGroup(order.checkoutGroupId)
          .then((ids) => ids.length)
          .catch(() => 1)
      : Promise.resolve(1),
  ]);

  // Back from Xendit's hosted page: confirm the result with Xendit now rather
  // than waiting only for the webhook. A paid result leaves this workspace.
  if (query.xendit_return === "1") {
    const outcome = await reconcileReturnedXenditPayment(
      { id: order.id, checkoutGroupId: activePayment?.checkoutGroupId ?? null },
      activePayment?.paymentChannel ?? null,
    ).catch(() => null);
    if (outcome === "already_paid") {
      redirect(`${ROUTES.orderDetail(order.id)}?xendit_return=1`);
    }
  }

  const initialChannel: XenditChannel =
    (activePayment?.paymentChannel as XenditChannel | null) ?? "GCASH";
  // Safe to offer a different payment method only once the current channel
  // is definitively resolved (failed) or nothing has ever reached Xendit yet
  // (no payments row at all) — never while an attempt might still be
  // in-flight and could still resolve successfully on its own. The action
  // layer (`createXendit*Action`) enforces this same rule server-side too —
  // this only controls whether the picker is offered.
  const canChangeChannel = order.paymentStatus === "failed" || activePayment === null;

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-rj-gray-100 pb-3">
        <h1 className="text-xl font-semibold text-rj-black">Checkout</h1>
      </div>
      {/* Back from Xendit but not confirmed yet: keep checking in real time. */}
      {query.xendit_return === "1" && activePayment?.xenditPaymentRequestId ? (
        <PaymentStatusWatcher
          {...(activePayment.checkoutGroupId
            ? { checkoutGroupId: activePayment.checkoutGroupId }
            : { orderId: order.id })}
        />
      ) : null}
      <CheckoutResumePanel
        orderId={order.id}
        checkoutGroupId={order.checkoutGroupId}
        groupSize={groupSize}
        orderNumber={order.orderNumber}
        paymentStatus={order.paymentStatus as "pending" | "failed"}
        initialChannel={initialChannel}
        canChangeChannel={canChangeChannel}
        failureReason={activePayment?.failureReason ?? null}
        subtotalCents={order.subtotalCents}
        shippingFeeCents={order.shippingFeeCents}
        totalCents={order.totalCents}
        currency={order.currency}
        ordersUrl={ROUTES.orders}
      />
    </div>
  );
}
