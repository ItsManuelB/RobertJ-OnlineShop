"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useState } from "react";

import { ROUTES } from "@/constants/routes";
import { formatCurrency } from "@/lib/utils/currency";
import { useCart } from "@/features/cart/hooks/useCart";
import { useToast } from "@/providers/ToastProvider";
import { LOW_STOCK_THRESHOLD } from "@/features/products/constants/product.constants";
import { WishlistButton } from "@/features/wishlist/components/WishlistButton";
import type { WishlistState } from "@/features/wishlist/types/wishlist.types";

/** Common shape both the real catalog (`Product`) and the homepage's featured
 * grid (`FeaturedProductView`) map into, so they render one identical tile. */
export interface ProductTileItem {
  key: string;
  name: string;
  shopName: string;
  priceCents: number;
  /**
   * Real compare-at price, when a verified source for one exists. No such
   * source exists in the schema today (no compare-at-price column), so
   * every current caller passes null — see `discount` below, which never
   * renders a percentage/strikethrough without a value here that is also
   * strictly greater than `priceCents`.
   */
  originalPriceCents?: number | null;
  currency: string;
  imageUrl: string | null;
  href: string;
  isNew: boolean;
  isSale: boolean;
  /** Rendered next to the shop name when set (e.g. a non-"new" condition). Omitted for marketing placeholders. */
  conditionLabel?: string | null;
  /** Null when stock is unknown (e.g. a placeholder with no real product yet). */
  maxQuantity: number | null;
  /** Paid units sold — see `getProductSoldCounts`. 0 for a product with no paid sales yet (never shown). */
  soldCount: number;
  /** Add-to-cart payload; null disables quick-add and routes to the catalog instead. */
  addToCart: {
    productId: string;
    slug: string;
    sellerId: string;
    sellerName: string | null;
  } | null;
  /** True when the product has options to choose (color, size, …): quick-add then opens the product page instead of adding a plain line. */
  hasOptions?: boolean;
  /** Wishlist heart payload; null hides the button entirely (e.g. a
   * marketing placeholder with no real product behind it yet). */
  wishlist: WishlistState | null;
  /**
   * Whether the viewer may transact. Defaults to `true` (guests + buyers).
   * Set `false` for seller/admin so the quick-add and wishlist heart are
   * hidden — they browse the storefront but can't purchase (UX mirror of the
   * server/RLS block). Storefront browsing (image, name, price, link) is
   * unaffected.
   */
  canPurchase?: boolean;
}

export interface ProductTileProps {
  item: ProductTileItem;
  /** Optional entrance animation — used by the homepage's scroll-reveal grid. */
  style?: CSSProperties;
}

/**
 * The "Picked for You" product tile: image with a hover quick-add overlay,
 * New/Sale/Sold-out badges, and a price row. Shared by the homepage's
 * featured grid (`FeaturedProductsGrid`) and the real product catalog
 * (`ProductGrid`) so both surfaces render one design instead of two
 * divergent card components.
 */
export function ProductTile({ item, style }: ProductTileProps) {
  const router = useRouter();
  const { addItemChecked } = useCart();
  const { showToast } = useToast();
  const [hovered, setHovered] = useState(false);
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);

  const isOutOfStock = item.maxQuantity !== null && item.maxQuantity <= 0;
  const isLowStock =
    item.maxQuantity !== null &&
    !isOutOfStock &&
    item.maxQuantity <= LOW_STOCK_THRESHOLD;
  // Only a genuine price drop is ever shown as a discount: requires the
  // "sale" tag AND a real original price that is strictly greater than the
  // current price. Guards against ever rendering a fabricated, zero, or
  // negative "discount" if a bad value reaches this component.
  const hasVerifiedDiscount =
    item.isSale &&
    typeof item.originalPriceCents === "number" &&
    item.originalPriceCents > item.priceCents;
  const discount = hasVerifiedDiscount
    ? Math.round((1 - item.priceCents / (item.originalPriceCents as number)) * 100)
    : null;

  async function handleQuickAdd(event: React.MouseEvent) {
    // The whole tile is one <Link> (see below) — this button must never
    // trigger that navigation, same reasoning as WishlistButton's handler.
    event.preventDefault();
    event.stopPropagation();

    if (!item.addToCart) {
      router.push(ROUTES.products);
      return;
    }
    if (isOutOfStock || adding) return;
    // A product with options (color, size, …) can't be added blind: the buyer
    // chooses them on the product page, where the options sheet is.
    if (item.hasOptions) {
      router.push(item.href);
      return;
    }
    setAdding(true);
    try {
      const result = await addItemChecked({
        productId: item.addToCart.productId,
        slug: item.addToCart.slug,
        title: item.name,
        imageUrl: item.imageUrl,
        unitPriceCents: item.priceCents,
        currency: item.currency,
        quantity: 1,
        maxQuantity: item.maxQuantity ?? 0,
        sellerId: item.addToCart.sellerId,
        sellerName: item.addToCart.sellerName,
      });
      if (result.success) {
        setAdded(true);
        window.setTimeout(() => setAdded(false), 2000);
        showToast({
          message:
            result.quantityInCart > 1
              ? `Already in your cart (${result.quantityInCart - 1}). Added 1 more — you now have ${result.quantityInCart}.`
              : `Added to cart: ${item.name}`,
          action: { label: "View cart", href: ROUTES.cart },
        });
      } else {
        showToast({ tone: "error", message: result.error });
      }
    } catch {
      showToast({ tone: "error", message: "We couldn't add this to your cart. Please try again." });
    } finally {
      setAdding(false);
    }
  }

  return (
    <Link
      href={item.href}
      className="group block"
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="relative mb-3 overflow-hidden rounded-xl bg-rj-gray-100"
        style={{ aspectRatio: "3 / 4" }}
      >
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-rj-gray-400">
            No image
          </span>
        )}
        <div className="absolute inset-0 bg-rj-black/0 transition-colors group-hover:bg-rj-black/10" />

        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {isOutOfStock ? (
            <span className="rounded-full bg-rj-black px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rj-white">
              Sold out
            </span>
          ) : (
            <>
              {item.isNew ? (
                <span className="rounded-full bg-rj-black px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rj-white">
                  New
                </span>
              ) : null}
              {item.isSale ? (
                <span className="rounded-full bg-rj-red px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rj-white">
                  Sale
                </span>
              ) : null}
            </>
          )}
        </div>

        <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
          {item.wishlist && item.canPurchase !== false ? (
            <WishlistButton
              productId={item.wishlist.productId}
              initialSaved={item.wishlist.initialSaved}
              isAuthenticated={item.wishlist.isAuthenticated}
              variant="tile"
            />
          ) : null}
          {discount !== null ? (
            <div className="rounded-full bg-rj-white px-2 py-0.5 text-[9px] font-black text-rj-red">
              -{discount}%
            </div>
          ) : null}
        </div>

        {/* Quick add — hidden once sold out, and hidden entirely for
            seller/admin (canPurchase === false), who browse but can't buy;
            falls back to routing to the catalog for marketing placeholders. */}
        {!isOutOfStock && item.canPurchase !== false ? (
          <div
            className={`absolute inset-x-0 bottom-0 p-3 transition-all duration-300 ${
              hovered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            }`}
          >
            <button
              type="button"
              onClick={handleQuickAdd}
              disabled={adding}
              className="w-full rounded-full bg-rj-white/95 py-2.5 text-[11px] font-bold text-rj-black backdrop-blur-sm transition-colors hover:bg-rj-red hover:text-rj-white"
            >
              <span aria-live="polite">
                {item.hasOptions
                  ? "Choose options"
                  : adding
                    ? "Adding…"
                    : added
                      ? "Added to Cart"
                      : "+ Add to Cart"}
              </span>
            </button>
          </div>
        ) : null}
      </div>

      <div>
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-medium tracking-widest text-rj-gray-400">
            {item.shopName}
          </span>
          {item.conditionLabel ? (
            <span className="shrink-0 rounded-full border-[1.5px] border-rj-gray-200 px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-rj-gray-600">
              {item.conditionLabel}
            </span>
          ) : null}
        </div>
        <h4 className="mb-1 line-clamp-2 text-[13px] font-medium leading-snug text-rj-black">
          {item.name}
        </h4>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[14px] font-bold text-rj-black">
            {formatCurrency(item.priceCents, item.currency)}
          </span>
          {hasVerifiedDiscount ? (
            <span className="text-[11px] text-rj-gray-400 line-through">
              {formatCurrency(item.originalPriceCents as number, item.currency)}
            </span>
          ) : null}
          {isLowStock ? (
            <span className="text-[11px] font-bold text-rj-gold">
              Only {item.maxQuantity} left
            </span>
          ) : null}
          {item.soldCount > 0 ? (
            <span className="text-[11px] text-rj-gray-400">{item.soldCount} sold</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
