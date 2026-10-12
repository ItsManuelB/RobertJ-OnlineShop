"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/constants/routes";
import { USER_ROLES } from "@/constants/roles";
import { CHECKOUT_CONSTANTS } from "@/features/checkout/constants/checkout.constants";
import { placeOrderSchema } from "@/features/checkout/schemas/checkout.schema";
import type {
  FailedGroup,
  PlaceOrderResult,
  PlacedOrder,
} from "@/features/checkout/types/checkout.types";
import type { LifecycleTab } from "@/features/orders";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import { GroupOrderError } from "@/lib/supabase/query-error";
import type { ActionResult } from "@/types/action.types";

/**
 * Resolves where `CheckoutForm` should redirect after placing these orders —
 * read from the `buyer_order_lifecycle` view (see its migration), never
 * re-derived here, so the tab mapping has exactly one source of truth. Falls
 * back to `null` ("All") when the created orders don't all agree on one tab:
 * not reachable today since one checkout submission applies one payment
 * method to every seller group, but kept correct rather than assumed.
 */
async function resolveRedirectTab(orderIds: string[], buyerId: string): Promise<LifecycleTab | null> {
  if (orderIds.length === 0) return null;
  const tabs = await queries.getOrderLifecycleTabs(orderIds, buyerId);
  const distinct = new Set(Object.values(tabs));
  return distinct.size === 1 ? [...distinct][0] : null;
}

/**
 * Runs the given best-effort Xendit reservation once, and retries it exactly
 * once more on failure — the common transient case (a momentary DB hiccup)
 * self-heals immediately instead of ever needing the buyer-facing recovery
 * path (`orders.payment_method` + `buyer_order_lifecycle`'s "to_pay"
 * predicate). Still best-effort/non-blocking: order creation must never
 * fail because of this, and a persistent failure after both attempts is
 * only logged — the order remains correctly classified "To Pay" via
 * `payment_method`, so the buyer can always retry from there.
 */
async function reserveXenditAttemptWithRetry(
  fn: () => Promise<unknown>,
  logLabel: string,
): Promise<void> {
  try {
    await fn();
  } catch (firstError) {
    console.error(`${logLabel} failed, retrying once:`, firstError);
    try {
      await fn();
    } catch (secondError) {
      console.error(`${logLabel} retry also failed:`, secondError);
    }
  }
}

/**
 * Places the buyer's cart — one `create_order` call per seller group. The RPC is
 * atomic per seller and re-prices from the DB, so a group can fail independently
 * (e.g. "Only 2 left of X"). The result reports every created and failed group so
 * the client clears only placed items and keeps failed ones in the cart.
 */
export async function placeOrderAction(
  input: unknown,
): Promise<ActionResult<PlaceOrderResult>> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    // Strict role separation: only buyers may purchase. Throws when
    // unauthenticated or when a seller/admin attempts checkout (the DB's
    // create_order guard + orders INSERT RLS are the authoritative backstop).
    const user = await queries.requireRole([USER_ROLES.buyer]);
    // Throttle order creation per buyer, matching the other order mutations
    // (cancel/advance). Guards against order-spam and repeated stock-lock churn.
    await queries.requireRateLimit(`placeOrder:${user.id}`, 10, 60);

    // camelCase domain → snake_case jsonb keys. full_name/line1/city/
    // postal_code/country are the CHECK-required keys; barangay/province/
    // region are extra keys the constraint permits but doesn't require —
    // see `orders_shipping_address_required_keys` and this migration's
    // header comment (20260912000000_addresses.sql).
    const shippingAddress = {
      full_name: parsed.data.address.fullName,
      line1: parsed.data.address.line1,
      line2: parsed.data.address.line2 || null,
      barangay: parsed.data.address.barangay || null,
      city: parsed.data.address.city,
      province: parsed.data.address.province || null,
      region: parsed.data.address.region || null,
      postal_code: parsed.data.address.postalCode,
      country: parsed.data.address.country,
      phone: parsed.data.address.phone || null,
    };

    // Multi-seller cart + Online Payment: one combined payment will cover
    // every order, so creation must be all-or-nothing (create_order_group)
    // rather than the per-seller partial-success loop below — a combined
    // charge can't meaningfully cover a partial set of orders. Single-seller
    // Online Payment and COD are entirely unaffected and keep the existing
    // per-seller loop and partial-success behavior, unchanged.
    if (parsed.data.paymentMethod === "xendit" && parsed.data.groups.length > 1) {
      let group: Awaited<ReturnType<typeof queries.createOrderGroup>>;
      try {
        group = await queries.createOrderGroup({
          groups: parsed.data.groups.map((g) => ({ sellerId: g.sellerId, items: g.items })),
          shippingAddress,
          shippingFeeCents: CHECKOUT_CONSTANTS.shippingFeeCentsPerSeller,
          notes: parsed.data.notes || null,
          paymentMethod: parsed.data.paymentMethod,
          idempotencyKey: parsed.data.idempotencyKey,
        });
      } catch (error) {
        // F-06: the whole group is all-or-nothing (correct — one combined
        // charge can't cover a partial order), but attribute the failure to
        // the specific seller `create_order_group` identified, reusing the
        // exact same `failed` shape/UI the COD partial-success path already
        // has, instead of one opaque message with no attribution.
        if (error instanceof GroupOrderError && error.sellerId) {
          const sourceGroup = parsed.data.groups.find((g) => g.sellerId === error.sellerId);
          return ok({
            created: [],
            failed: [
              {
                sellerId: error.sellerId,
                sellerName: sourceGroup?.sellerName ?? null,
                reason: error.message,
              },
            ],
            redirectTab: null,
          });
        }
        throw error;
      }

      const created: PlacedOrder[] = group.orders.map((order) => {
        const sourceGroup = parsed.data.groups.find((g) => g.sellerId === order.sellerId);
        return {
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          sellerId: order.sellerId,
          sellerName: sourceGroup?.sellerName ?? null,
          lines: (sourceGroup?.items ?? []).map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
          })),
        };
      });

      // Eagerly reserve the shared Xendit attempt for every channel — not
      // just GCash/Maya's synchronous handoff — so a Card order is
      // immediately classified "To Pay" too (its payment session only
      // actually starts later, from the order card). Best-effort: these
      // orders are already created; a reservation hiccup here doesn't
      // affect them, and the buyer's subsequent Pay Now/Complete Card
      // Payment click retries this same, idempotent reservation anyway.
      const xenditChannel = parsed.data.xenditChannel;
      if (xenditChannel) {
        await reserveXenditAttemptWithRetry(
          () => queries.beginXenditGroupPaymentAttempt(group.checkoutGroupId, xenditChannel),
          "Eager Xendit group payment reservation",
        );
      }

      revalidatePath(ROUTES.orders, "layout");
      revalidatePath(ROUTES.account, "layout");

      const redirectTab = await resolveRedirectTab(created.map((order) => order.orderId), user.id);
      return ok({ created, failed: [], checkoutGroupId: group.checkoutGroupId, redirectTab });
    }

    const created: PlacedOrder[] = [];
    const failed: FailedGroup[] = [];

    for (const group of parsed.data.groups) {
      let orderId: string;
      try {
        const order = await queries.createOrder({
          sellerId: group.sellerId,
          items: group.items,
          shippingAddress,
          shippingFeeCents: CHECKOUT_CONSTANTS.shippingFeeCentsPerSeller,
          notes: parsed.data.notes || null,
          paymentMethod: parsed.data.paymentMethod,
          // Same attempt key for every group — create_order namespaces dedup by
          // seller internally, so a retry replays each already-created seller's
          // order while still creating any that previously failed.
          idempotencyKey: parsed.data.idempotencyKey,
        });
        orderId = order.orderId;
        created.push({
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          sellerId: order.sellerId,
          sellerName: group.sellerName ?? null,
          lines: group.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
          })),
        });
      } catch (error) {
        failed.push({
          sellerId: group.sellerId,
          sellerName: group.sellerName ?? null,
          reason:
            error instanceof Error
              ? error.message
              : "We couldn't place this order.",
        });
        continue;
      }

      // Eager, best-effort Xendit reservation — see the group branch above
      // for why this runs for every channel and is isolated from the
      // order-creation try/catch (a reservation hiccup must never mark an
      // already-created order as "failed").
      const orderXenditChannel = parsed.data.xenditChannel;
      if (parsed.data.paymentMethod === "xendit" && orderXenditChannel) {
        await reserveXenditAttemptWithRetry(
          () => queries.beginXenditPaymentAttempt(orderId, orderXenditChannel),
          "Eager Xendit payment reservation",
        );
      }
    }

    if (created.length > 0) {
      // Re-render the buyer's order history and overview so the new orders appear.
      revalidatePath(ROUTES.orders, "layout");
      revalidatePath(ROUTES.account, "layout");
    }

    const redirectTab = await resolveRedirectTab(created.map((order) => order.orderId), user.id);
    return ok({ created, failed, redirectTab });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not place your order.",
    );
  }
}
