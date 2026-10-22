"use client";

import Image from "next/image";
import Link from "next/link";
import { Package, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { RJ_CARD } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";
import { useCart } from "@/features/cart/hooks/useCart";
import { getCartLineKey } from "@/features/cart/utils/cart-reducer";

const PREVIEW_LIMIT = 3;
const CLOSE_DELAY_MS = 150;

/**
 * Header cart icon plus a hover/focus preview of the most recently added
 * items — a pure convenience layer over the real cart link. The icon itself
 * always navigates to /cart on click, unchanged; hovering or focusing it
 * additionally opens a small popover reading the same `useCart()` state the
 * cart page uses, so it updates automatically as items are added/removed —
 * no separate data source, no change to cart/checkout logic.
 */
export function CartPreview() {
  const { items } = useCart();
  // Badge/aria count distinct product lines, not summed quantities — e.g. a
  // 7-quantity line plus a 1-quantity line reads as "2", not "8". Each row's
  // own `item.quantity` below is unaffected.
  const lineCount = items.length;
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => () => cancelClose(), []);

  // Most recently added first — `add` appends to the end of `items`.
  const recentItems = [...items].reverse().slice(0, PREVIEW_LIMIT);
  const extraCount = items.length - recentItems.length;
  const showPreview = open && items.length > 0;

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <Link
        href={ROUTES.cart}
        aria-label={`Cart, ${lineCount} item${lineCount === 1 ? "" : "s"}`}
        aria-haspopup={items.length > 0 ? "dialog" : undefined}
        aria-expanded={items.length > 0 ? showPreview : undefined}
        onFocus={() => setOpen(true)}
        onBlur={scheduleClose}
        className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-rj-gray-100"
      >
        <ShoppingBag className="h-[18px] w-[18px] text-rj-black" aria-hidden="true" />
        {lineCount > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rj-red px-0.5 text-[9px] font-bold text-rj-white"
            style={{ animation: "pop 0.2s ease" }}
          >
            {lineCount}
          </span>
        ) : null}
      </Link>

      {showPreview ? (
        <div
          role="dialog"
          aria-label="Recently added cart items"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onFocus={cancelClose}
          onBlur={scheduleClose}
          className={cn(
            RJ_CARD,
            "absolute right-0 top-full z-50 mt-2 w-[272px] max-w-[90vw] overflow-hidden p-3.5 shadow-lg",
          )}
        >
          <div className="flex items-center justify-between px-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-rj-gray-500">
              Recently Added
            </p>
            <span className="text-[10px] font-semibold text-rj-gray-400">
              {lineCount} item{lineCount === 1 ? "" : "s"}
            </span>
          </div>

          <ul className="mt-2.5 flex flex-col gap-2 divide-y divide-rj-gray-100">
            {recentItems.map((item) => (
              <li key={getCartLineKey(item)}>
                <Link
                  href={ROUTES.cart}
                  className="flex items-center gap-2.5 rounded-md py-3 first:pt-0 last:pb-0 hover:bg-rj-gray-50"
                >
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.title}
                      width={40}
                      height={40}
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rj-gray-100">
                      <Package className="h-4 w-4 text-rj-gray-400" aria-hidden="true" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium leading-tight text-rj-black">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-rj-gray-500">
                      {item.quantity} × {formatCurrency(item.unitPriceCents, item.currency)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-rj-red-dark">
                    {formatCurrency(item.unitPriceCents * item.quantity, item.currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {extraCount > 0 ? (
            <p className="mt-1 border-t border-rj-gray-100 pt-2 text-center text-[11px] text-rj-gray-500">
              +{extraCount} more item{extraCount === 1 ? "" : "s"} in your cart
            </p>
          ) : null}

          <Link
            href={ROUTES.cart}
            className={cn(buttonVariants({ variant: "rj", size: "rj" }), "mt-2 w-full py-2")}
          >
            View My Shopping Cart
          </Link>
        </div>
      ) : null}
    </div>
  );
}
