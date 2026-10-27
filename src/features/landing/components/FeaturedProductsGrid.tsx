"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ROUTES } from "@/constants/routes";
import { useReveal } from "@/features/landing/hooks/useReveal";
import { ProductTile, type ProductTileItem } from "@/features/products/components/ProductTile";
import type { FeaturedProductView } from "@/features/landing/types/landing.types";

/** Always available — "show everything currently featured." */
const ALL_FILTER = "All";
/** Derived from `product.tags`, not a real category — always last when present. */
const SALE_FILTER = "Sale";

export interface FeaturedProductsGridProps {
  products: FeaturedProductView[];
  /** Ids of the current user's saved products; empty for a guest. */
  wishlistedProductIds?: readonly string[];
  isAuthenticated?: boolean;
  /** Guests + buyers can transact; seller/admin browse read-only (hides quick-add + heart). Defaults to true. */
  canPurchase?: boolean;
}

function toTileItem(
  view: FeaturedProductView,
  wishlistedIds: ReadonlySet<string>,
  isAuthenticated: boolean,
  canPurchase: boolean,
): ProductTileItem {
  return {
    key: view.key,
    name: view.name,
    shopName: view.shop,
    priceCents: view.priceCents,
    originalPriceCents: view.originalPriceCents,
    currency: view.currency,
    imageUrl: view.imageUrl,
    href: view.href,
    isNew: view.isNew,
    isSale: view.isSale,
    conditionLabel: null,
    maxQuantity: view.maxQuantity,
    soldCount: view.soldCount,
    rating: view.rating,
    // Every view is a real, purchasable product — see FeaturedProductView.
    // Null when the seller account has since been permanently deleted,
    // disabling quick-add (same guard as ProductGrid.tsx's toTileItem).
    addToCart: view.sellerId
      ? {
          productId: view.productId,
          slug: view.slug,
          sellerId: view.sellerId,
          // Marketing quick-add has no seller name; checkout falls back to "Seller".
          sellerName: null,
        }
      : null,
    wishlist: {
      productId: view.productId,
      initialSaved: wishlistedIds.has(view.productId),
      isAuthenticated,
    },
    hasOptions: view.hasOptions,
    canPurchase,
  };
}

export function FeaturedProductsGrid({
  products,
  wishlistedProductIds = [],
  isAuthenticated = false,
  canPurchase = true,
}: FeaturedProductsGridProps) {
  const wishlistedIds = useMemo(
    () => new Set(wishlistedProductIds),
    [wishlistedProductIds],
  );
  const [activeFilter, setActiveFilter] = useState<string>(ALL_FILTER);
  const { ref: gridRef, inView } = useReveal<HTMLDivElement>({ amount: 0.1 });

  // Derived from whatever is actually featured right now, so a filter chip
  // can never reference a category name that doesn't exist in the database
  // (e.g. a fictional "Women's"/"Men's" split the real catalog doesn't use).
  const filters = useMemo(() => {
    const categories = [
      ...new Set(
        products
          .map((p) => p.category)
          .filter((category): category is string => category.length > 0),
      ),
    ].sort((a, b) => a.localeCompare(b));
    const hasSale = products.some((p) => p.isSale);
    return [ALL_FILTER, ...categories, ...(hasSale ? [SALE_FILTER] : [])];
  }, [products]);

  const filtered = useMemo(() => {
    if (activeFilter === ALL_FILTER) return products;
    if (activeFilter === SALE_FILTER) return products.filter((p) => p.isSale);
    return products.filter((p) => p.category === activeFilter);
  }, [activeFilter, products]);

  return (
    <>
      {/* Header row: heading left, filter chips right (design layout) */}
      <div className="mb-12 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-rj-red">
            Featured Products
          </p>
          <h2 className="font-serif text-4xl leading-[1.05] text-rj-black md:text-[52px]">
            Picked for You
          </h2>
        </div>
        {/* Nothing meaningful to filter by with 0 or 1 option (just "All"). */}
        {products.length > 0 && filters.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={activeFilter === filter}
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full border-[1.5px] px-4 py-1.5 text-[11px] font-bold transition-all ${
                  activeFilter === filter
                    ? "border-rj-black bg-rj-black text-rj-white"
                    : "border-rj-gray-200 bg-transparent text-rj-gray-600 hover:border-rj-black hover:text-rj-black"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="No featured products yet"
          description="Sellers haven't marked any products as featured. Check back soon, or browse the full catalog."
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
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No products match this filter"
          description="Try a different category, or view everything that's featured."
        />
      ) : (
        <>
          <div
            ref={gridRef}
            className="grid grid-cols-2 gap-5 md:grid-cols-3 md:gap-6 lg:grid-cols-4"
          >
            {filtered.map((item, i) => (
              <ProductTile
                key={item.key}
                item={toTileItem(item, wishlistedIds, isAuthenticated, canPurchase)}
                style={{
                  animation: inView ? `fadeSlideIn 0.5s ease ${i * 60}ms both` : "none",
                }}
              />
            ))}
          </div>

          <div className="mt-14 text-center">
            <Link
              href={ROUTES.products}
              className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-rj-black px-8 py-3.5 text-[13px] font-bold text-rj-black transition-colors hover:bg-rj-black hover:text-rj-white"
            >
              View All Products
              <ArrowRight className="h-[13px] w-[13px]" aria-hidden="true" />
            </Link>
          </div>
        </>
      )}
    </>
  );
}
