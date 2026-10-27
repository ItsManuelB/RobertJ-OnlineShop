import Image from "next/image";
import Link from "next/link";

import { RJ_CARD } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import type { Product } from "@/features/products/types/product.types";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

export interface WishlistPreviewProps {
  /** The first few saved products. */
  products: Product[];
  /** Everything saved, for the heading. */
  total: number;
}

/** A short look at the buyer's wishlist; hidden when nothing is saved. */
export function WishlistPreview({ products, total }: WishlistPreviewProps) {
  if (total === 0) return null;

  return (
    <section aria-label="From your wishlist" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-400">
          From your wishlist · {total} saved
        </h2>
        <Link
          href={ROUTES.wishlist}
          className="text-xs font-semibold text-rj-red-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
        >
          View wishlist
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {products.map((product) => {
          const cover = product.images[0];
          return (
            <li key={product.id}>
              <Link
                href={ROUTES.productDetail(product.slug)}
                className={cn(
                  RJ_CARD,
                  "flex items-center gap-3 p-3 transition-all hover:border-rj-black hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30",
                )}
              >
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-rj-gray-50">
                  {cover ? (
                    <Image src={cover.url} alt="" fill sizes="56px" className="object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-rj-black">{product.title}</span>
                  <span className="block text-xs text-rj-gray-600">
                    {product.quantity <= 0 ? "Sold out" : formatCurrency(product.priceCents)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
