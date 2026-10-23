"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { USER_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import type { SelectedVariantInfo } from "@/features/cart/components/AddToCartButton";
import { useCart } from "@/features/cart/hooks/useCart";
import { getCoverImage, type Product } from "@/features/products/types/product.types";
import { useToast } from "@/providers/ToastProvider";

export type PurchaseOutcome = { success: true } | { success: false; error: string };

type PendingAction = "cart" | "added" | "buy" | null;

// One in-flight purchase action for the whole page, shared by every button
// and the options sheet: a synchronous flag (so two clicks in the same tick
// can't both pass) plus a subscription so all of them disable together.
let inFlight: PendingAction = null;
const listeners = new Set<() => void>();
function setInFlight(next: PendingAction) {
  inFlight = next;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** After a successful add the buttons stay locked this long, so a double click can't add twice. */
const ADD_COOLDOWN_MS = 700;

/** How long "Buy now" keeps its buttons locked while the page navigates away, before it gives up and unlocks. */
const BUY_NOW_UNLOCK_MS = 10_000;

/**
 * The two purchase actions on a product — "Add to cart" and "Buy now" — with
 * one shared in-flight lock, so a double click, or tapping both buttons, can
 * never submit twice.
 *
 *  - `addToCart` validates stock (counting what is already in the cart),
 *    waits for the cart to confirm, then shows a success toast and leaves the
 *    buyer where they are.
 *  - `buyNow` validates the choice and goes straight to checkout for this one
 *    product and quantity (`/checkout?buyNow=…`); the cart is not touched, and
 *    checkout re-reads price and stock from the server.
 *
 * Both return the outcome so a caller that shows errors inline (the options
 * sheet) can do so; `notifyErrors` turns the same errors into a toast for
 * callers that have nowhere inline to put them.
 */
export function usePurchaseActions(product: Product, sellerName?: string | null) {
  const router = useRouter();
  const { addItemChecked, removeItem, setQuantity } = useCart();
  const { showToast } = useToast();
  const pending = useSyncExternalStore(subscribe, () => inFlight, () => null);
  const unlockTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (unlockTimer.current !== null) {
        window.clearTimeout(unlockTimer.current);
        // The page this "Buy now" started on is gone — don't leave the next page's buttons locked.
        if (inFlight === "buy") setInFlight(null);
      }
    },
    [],
  );

  function release() {
    setInFlight(null);
  }

  /** Why this choice can't be bought yet, or null when it can. */
  function validate(variant: SelectedVariantInfo | null | undefined, quantity: number): string | null {
    if (!product.sellerId) return "This product is no longer available.";
    if (variant === null) return "Please choose your options first.";
    const stock = variant ? variant.stock : product.quantity;
    if (stock <= 0) return "This item is sold out.";
    if (!Number.isInteger(quantity) || quantity < 1) return "Please enter a quantity of at least 1.";
    if (quantity > stock) return `Only ${stock} available.`;
    return null;
  }

  async function addToCart(
    variant: SelectedVariantInfo | null | undefined,
    quantity: number,
    options: { notifyErrors?: boolean } = {},
  ): Promise<PurchaseOutcome> {
    const problem = validate(variant, quantity);
    if (problem) {
      if (options.notifyErrors) showToast({ tone: "error", message: problem });
      return { success: false, error: problem };
    }
    if (inFlight !== null) return { success: false, error: "One moment — your last request is still going." };
    setInFlight("cart");
    let released = true;
    try {
      const result = await addItemChecked({
        productId: product.id,
        variantId: variant?.id,
        variantLabel: variant?.label ?? null,
        slug: product.slug,
        title: product.title,
        imageUrl: getCoverImage(product)?.url ?? null,
        unitPriceCents: variant ? variant.priceCents : product.priceCents,
        currency: product.currency,
        quantity,
        maxQuantity: variant ? variant.stock : product.quantity,
        sellerId: product.sellerId as string,
        sellerName: sellerName ?? (product.sellerRole === USER_ROLES.seller ? product.sellerName : null),
      });
      if (result.success) {
        const stock = variant ? variant.stock : product.quantity;
        const previous = result.quantityInCart - quantity;
        const named = `${product.title}${variant?.label ? ` (${variant.label})` : ""}`;
        // Say what the cart now holds, so a repeat add is never a silent one.
        const message =
          previous > 0
            ? `Already in your cart (${previous}). Added ${quantity} more — you now have ${result.quantityInCart}.`
            : `Added to cart: ${named} × ${quantity}`;
        showToast({
          message: result.quantityInCart >= stock ? `${message} That's all we have.` : message,
          action: { label: "View cart", href: ROUTES.cart },
          // A mis-tap is one tap to reverse: back to what the cart held before this add.
          undo: {
            label: "Undo",
            onClick: () => {
              const line = { productId: product.id, variantId: variant?.id };
              if (previous > 0) setQuantity(line, previous);
              else removeItem(line);
            },
          },
        });
        // Hold the lock briefly (shown as "Added to cart") instead of releasing at once.
        setInFlight("added");
        window.setTimeout(release, ADD_COOLDOWN_MS);
        released = false;
        return { success: true };
      }
      if (options.notifyErrors) showToast({ tone: "error", message: result.error });
      return { success: false, error: result.error };
    } catch {
      const error = "We couldn't add this to your cart. Please try again.";
      if (options.notifyErrors) showToast({ tone: "error", message: error });
      return { success: false, error };
    } finally {
      if (released) release();
    }
  }

  function buyNow(
    variant: SelectedVariantInfo | null | undefined,
    quantity: number,
    options: { notifyErrors?: boolean } = {},
  ): PurchaseOutcome {
    const problem = validate(variant, quantity);
    if (problem) {
      if (options.notifyErrors) showToast({ tone: "error", message: problem });
      return { success: false, error: problem };
    }
    if (inFlight !== null) return { success: false, error: "One moment — your last request is still going." };
    setInFlight("buy");
    // Stays locked while the browser navigates; unlocks itself if it never does.
    unlockTimer.current = window.setTimeout(release, BUY_NOW_UNLOCK_MS);
    router.push(ROUTES.checkoutBuyNow({ productId: product.id, variantId: variant?.id, quantity }));
    return { success: true };
  }

  return { addToCart, buyNow, pending, isBusy: pending !== null };
}
