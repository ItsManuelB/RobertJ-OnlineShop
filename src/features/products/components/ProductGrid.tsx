import Image from "next/image";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { USER_ROLES, type UserRole } from "@/constants/roles";
import { PRODUCT_CONDITION, PRODUCT_CONDITION_LABELS } from "@/constants/status";
import { ROUTES } from "@/constants/routes";
import { EmptyState } from "@/components/feedback/EmptyState";
import { canPurchase } from "@/lib/auth/permissions";
import { formatCurrency } from "@/lib/utils/currency";
import {
  getProductSoldCounts,
  listProductIdsWithVariants,
  getSessionUser,
  getShopNamesByIds,
  getShopNamesBySellerIds,
  listWishlistProductIds,
} from "@/lib/supabase/queries";
import { ProductTile, type ProductTileItem } from "@/features/products/components/ProductTile";
import { WishlistButton } from "@/features/wishlist/components/WishlistButton";
import { GuidedSelectionPromo } from "@/features/assistant";
import { getCoverImage, type Product } from "@/features/products/types/product.types";

export interface ProductGridProps {
  products: Product[];
  /** Defaults to "grid". "list" renders compact horizontal rows instead —
   * same underlying tile data, just a denser layout for scanning many items. */
  viewMode?: "grid" | "list";
  /** When set, the empty state names the search term instead of a generic message. */
  searchTerm?: string;
  /** Real shop name when the listing is filtered by `?shopId=` (e.g. from the
   * homepage's "Visit Shop"). Names the shop in the empty state instead of a
   * generic "no products" message — never fabricated, always the caller's
   * already-resolved shop. */
  shopName?: string;
  /** Per-product tweaks keyed by product id: the price to show (e.g. a matched option's price) and a line under it. */
  overrides?: Record<string, { priceCents?: number; footer?: ReactNode }>;
}

/** One row in the "list" view — same fields as `ProductTile`, laid out horizontally. */
function ProductListRow({ item }: { item: ProductTileItem }) {
  return (
    <li>
      <Link
        href={item.href}
        className="flex items-center gap-4 rounded-xl border border-rj-gray-100 bg-rj-white p-3 transition-colors hover:border-rj-gray-200"
      >
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-rj-gray-100">
          {item.imageUrl ? (
            <Image src={item.imageUrl} alt={item.name} fill sizes="64px" className="object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-medium tracking-widest text-rj-gray-400">
            {item.shopName}
          </p>
          <p className="line-clamp-1 text-sm font-medium text-rj-black">{item.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm font-bold text-rj-black">
            {formatCurrency(item.priceCents, item.currency)}
          </span>
          {item.wishlist ? (
            <WishlistButton
              productId={item.wishlist.productId}
              initialSaved={item.wishlist.initialSaved}
              isAuthenticated={item.wishlist.isAuthenticated}
              variant="tile"
            />
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function toTileItem(
  product: Product,
  wishlistedIds: ReadonlySet<string>,
  isAuthenticated: boolean,
  shopNames: ReadonlyMap<string, string>,
  shopNamesByShopId: ReadonlyMap<string, string>,
  soldCounts: ReadonlyMap<string, number>,
  canPurchase: boolean,
  hasOptions: boolean,
  override?: { priceCents?: number; footer?: ReactNode },
): ProductTileItem {
  // Real shop name when the seller belongs to one (see
  // `resolve_shop_membership`); next, the product's own `shop_id` directly
  // (covers a product whose seller account was hard-deleted — `seller_id`
  // goes null but `shop_id` survives, see `getShopNamesByIds`); then falls
  // back to the seller's own profile name for a legacy/unassigned seller —
  // but only when `seller_id` actually resolves to a `seller` account. An
  // admin-authored or demoted-account product has no shop and no business
  // showing that account's personal name on the storefront, so it goes
  // straight to the generic label instead.
  const shopName =
    (product.sellerId ? shopNames.get(product.sellerId) : null) ??
    (product.shopId ? shopNamesByShopId.get(product.shopId) : null) ??
    (product.sellerRole === USER_ROLES.seller ? product.sellerName : null) ??
    "RobertJ Seller";

  return {
    key: product.id,
    name: product.title,
    shopName,
    priceCents: override?.priceCents ?? product.priceCents,
    originalPriceCents: null,
    currency: product.currency,
    imageUrl: getCoverImage(product)?.url ?? null,
    href: ROUTES.productDetail(product.slug),
    isNew: product.tags.includes("new"),
    isSale: product.tags.includes("sale"),
    conditionLabel:
      product.condition !== PRODUCT_CONDITION.new
        ? PRODUCT_CONDITION_LABELS[product.condition]
        : null,
    maxQuantity: product.quantity,
    soldCount: soldCounts.get(product.id) ?? 0,
    // Null when the product's seller account has since been permanently
    // deleted — disables quick-add the same way a placeholder-with-no-product
    // already does, matching AddToCartButton/BuyNowButton's own guard.
    addToCart: product.sellerId
      ? {
          productId: product.id,
          slug: product.slug,
          sellerId: product.sellerId,
          // Same resolved label as `shopName` above — the cart/checkout must
          // show the same "who sold this" identity as the catalog, not the raw
          // personal name (see the shop-name fix this mirrors).
          sellerName: shopName,
        }
      : null,
    wishlist: {
      productId: product.id,
      initialSaved: wishlistedIds.has(product.id),
      isAuthenticated,
    },
    hasOptions,
    canPurchase,
    footer: override?.footer,
  };
}

export async function ProductGrid({
  products,
  viewMode = "grid",
  searchTerm,
  shopName,
  overrides,
}: ProductGridProps) {
  if (products.length === 0) {
    if (searchTerm) {
      return (
        <div className="flex flex-col gap-6">
          <EmptyState
            title={`No results for "${searchTerm}"`}
            description="Check the spelling, try a shorter term, or browse by category instead."
          />
          <GuidedSelectionPromo />
        </div>
      );
    }

    if (shopName) {
      return (
        <EmptyState
          title={`No products from ${shopName} yet`}
          description="This shop hasn't listed anything yet. Check back soon, or browse the full catalog."
          action={
            <Link
              href={ROUTES.products}
              className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-rj-black px-8 py-3.5 text-[13px] font-bold text-rj-black transition-colors hover:bg-rj-black hover:text-rj-white"
            >
              Browse All Products
              <ArrowRight className="h-[13px] w-[13px]" aria-hidden="true" />
            </Link>
          }
        />
      );
    }

    return (
      <div className="flex flex-col gap-6">
        <EmptyState
          title="No products found"
          description="Try adjusting your filters or browse another category."
        />
        <GuidedSelectionPromo />
      </div>
    );
  }

  // A couple of extra bulk queries per grid render, not per tile — same
  // shape as the existing `getSessionUser`/`listFeaturedProducts` pattern.
  // Either failing degrades gracefully (no hearts saved / seller-name
  // fallback) rather than breaking the grid.
  const user = await getSessionUser();
  const sellerIds = [
    ...new Set(
      products.map((product) => product.sellerId).filter((id): id is string => id !== null),
    ),
  ];
  const shopIds = [
    ...new Set(
      products.map((product) => product.shopId).filter((id): id is string => id !== null),
    ),
  ];
  const productIds = products.map((product) => product.id);
  const [wishlistedIds, shopNames, shopNamesByShopId, soldCounts, optionProductIds] =
    await Promise.all([
      user
        ? listWishlistProductIds(user.id)
            .then((ids) => new Set(ids))
            .catch(() => new Set<string>())
        : Promise.resolve(new Set<string>()),
      getShopNamesBySellerIds(sellerIds).catch(() => new Map<string, string>()),
      getShopNamesByIds(shopIds).catch(() => new Map<string, string>()),
      getProductSoldCounts(productIds).catch(() => new Map<string, number>()),
      // Degrades to "no options known" (quick-add as before) if this lookup fails.
      listProductIdsWithVariants(productIds).catch(() => new Set<string>()),
    ]);

  // Guests + buyers can transact; seller/admin browse read-only, so their
  // tiles hide the quick-add and wishlist heart.
  const viewerCanPurchase = user === null || canPurchase(user.role as UserRole);
  const items = products.map((product) =>
    toTileItem(
      product,
      wishlistedIds,
      user !== null,
      shopNames,
      shopNamesByShopId,
      soldCounts,
      viewerCanPurchase,
      optionProductIds.has(product.id),
      overrides?.[product.id],
    ),
  );

  if (viewMode === "list") {
    return (
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <ProductListRow key={item.key} item={item} />
        ))}
      </ul>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-5 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
      {items.map((item) => (
        <li key={item.key}>
          <ProductTile item={item} />
        </li>
      ))}
    </ul>
  );
}
