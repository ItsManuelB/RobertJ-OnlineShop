import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { CatalogHeader } from "@/features/products/components/CatalogHeader";
import { ProductGrid } from "@/features/products/components/ProductGrid";
import { LOW_STOCK_THRESHOLD } from "@/features/products/constants/product.constants";
import type { Product } from "@/features/products/types/product.types";
import { WishlistControls } from "@/features/wishlist/components/WishlistControls";
import { applyWishlistView, countByShow, parseWishlistView } from "@/features/wishlist/utils/wishlist-view";
import { listWishlistProducts, requireSessionUser } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Wishlist" };

interface WishlistPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Buyer-only: the account layout already redirects everyone else, so this only needs the user id. */
export default async function WishlistPage({ searchParams }: WishlistPageProps) {
  const params = await searchParams;
  const user = await requireSessionUser();
  const view = parseWishlistView(first(params.sort), first(params.show));

  let products: Product[] = [];
  let loadError = false;
  try {
    products = await listWishlistProducts(user.id);
  } catch {
    loadError = true;
  }

  const shown = applyWishlistView(products, view, LOW_STOCK_THRESHOLD);

  return (
    <div className="flex flex-col gap-8">
      <CatalogHeader
        eyebrow="My Account"
        title="Wishlist"
        description={
          loadError
            ? "Products you've saved for later."
            : `${products.length} saved item${products.length === 1 ? "" : "s"}. Tap the heart on any product to save it for later.`
        }
      />
      {loadError ? (
        <ErrorState message="We couldn't load your wishlist right now." />
      ) : products.length === 0 ? (
        <EmptyState
          title="Your wishlist is empty"
          description="Tap the heart on any product to save it here."
          action={
            <Link href={ROUTES.products} className={cn(buttonVariants({ variant: "rj", size: "rjSm" }))}>
              Browse products
            </Link>
          }
        />
      ) : (
        <>
          <WishlistControls
            sort={view.sort}
            show={view.show}
            counts={countByShow(products, LOW_STOCK_THRESHOLD)}
          />
          {shown.length === 0 ? (
            <EmptyState
              title="Nothing matches this filter"
              description="Try a different availability filter."
              action={
                <Link href={ROUTES.wishlist} className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}>
                  Show all
                </Link>
              }
            />
          ) : (
            <ProductGrid products={shown} />
          )}
        </>
      )}
    </div>
  );
}
