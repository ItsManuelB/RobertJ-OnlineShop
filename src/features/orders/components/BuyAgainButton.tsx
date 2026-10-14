"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { USER_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { useCart } from "@/features/cart/hooks/useCart";
import type { Order } from "@/features/orders/types/order.types";
import { useToast } from "@/providers/ToastProvider";

export interface BuyAgainButtonProps {
  order: Order;
  /** Resolved shop/seller label — see `AddToCartButton`'s prop of the same name. */
  sellerName?: string | null;
}

/**
 * Re-adds every re-orderable line from a past order to the cart, then goes
 * to the cart (not straight to checkout) so the buyer can review quantities
 * first. Items whose product no longer resolves (`productSlug` is null —
 * sold/archived, per `OrderItem`'s doc comment) are skipped. A line that is
 * now out of stock (or beyond what is left) is not added, and the buyer is told
 * which ones; the cart page's availability check still catches price changes.
 * A line keeps the option it was bought with (`variantId`), so a color/size
 * order is re-added as that same option, not as a plain product.
 */
export function BuyAgainButton({ order, sellerName }: BuyAgainButtonProps) {
  const router = useRouter();
  const { addItemChecked } = useCart();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  // Nothing to re-add if the seller account has since been permanently
  // deleted — there's no one to place a new order against (see
  // AddToCartButton's identical guard).
  if (!order.sellerId) return null;
  const sellerId = order.sellerId;

  const reorderableItems = order.items.filter((item) => item.productSlug !== null);
  if (reorderableItems.length === 0) return null;

  const resolvedSellerName =
    sellerName ?? (order.sellerRole === USER_ROLES.seller ? order.sellerName : null);

  async function handleBuyAgain() {
    if (busy) return;
    setBusy(true);
    const skipped: string[] = [];
    try {
      for (const item of reorderableItems) {
        const result = await addItemChecked({
          productId: item.productId,
          variantId: item.variantId ?? undefined,
          variantLabel: item.variantLabel,
          // Non-null asserted: `reorderableItems` already filtered these out.
          slug: item.productSlug!,
          title: item.productTitle,
          imageUrl: item.imageUrl,
          unitPriceCents: item.unitPriceCents,
          currency: order.currency,
          quantity: item.quantity,
          maxQuantity: item.quantity,
          sellerId,
          sellerName: resolvedSellerName,
        });
        if (!result.success) skipped.push(item.productTitle);
      }
      if (skipped.length > 0) {
        showToast({
          tone: "error",
          message: `Couldn't add ${skipped.join(", ")} — it may be sold out or have less stock now.`,
        });
      }
      router.push(ROUTES.cart);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="rjOutline" size="rjSm" disabled={busy} onClick={() => void handleBuyAgain()}>
      🔄 Buy Again
    </Button>
  );
}
