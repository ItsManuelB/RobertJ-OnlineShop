import { Suspense } from "react";
import type { Metadata } from "next";

import { getShopById, listActiveCategories, listShops, resolveFilterableAttributes } from "@/lib/supabase/queries";
import { CatalogHeader } from "@/features/products/components/CatalogHeader";
import { ProductFilters } from "@/features/products/components/ProductFilters";
import { ProductGridSkeleton } from "@/features/products/components/ProductGridSkeleton";
import { ProductListSection } from "@/features/products/components/ProductListSection";
import { ProductSearchInput } from "@/features/products/components/ProductSearchInput";
import { ShopIdentityHeader } from "@/features/shops";

export const metadata: Metadata = { title: "Products" };

interface ProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const shopIdParam = typeof params.shopId === "string" ? params.shopId : undefined;
  const categoryIdParam = typeof params.categoryId === "string" ? params.categoryId : undefined;
  // Categories feed the filter chips, shops feed the shop dropdown, the
  // filtered shop (if any) feeds its real branding header, and — only when
  // exactly one category is selected — attributeFilters feed the
  // category-driven Size/Color/Material/Dimensions controls (§7 of the
  // implementation plan). Any fetch failure just hides that piece rather
  // than breaking the page.
  const [categories, shops, shop, attributeFilters] = await Promise.all([
    listActiveCategories().catch(() => []),
    listShops().catch(() => []),
    shopIdParam ? getShopById(shopIdParam).catch(() => null) : Promise.resolve(null),
    categoryIdParam ? resolveFilterableAttributes(categoryIdParam).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-8">
      {shop ? <ShopIdentityHeader shop={shop} /> : null}
      <CatalogHeader
        eyebrow="The Collection"
        title="Products"
        description="Everything currently available on the marketplace."
      />

      <div className="flex flex-col gap-4">
        <Suspense fallback={null}>
          <ProductSearchInput />
        </Suspense>
        <Suspense fallback={null}>
          <ProductFilters categories={categories} shops={shops} attributeFilters={attributeFilters} />
        </Suspense>
      </div>

      {/* Keyed so a new search restarts the suspense boundary. */}
      <Suspense key={JSON.stringify(params)} fallback={<ProductGridSkeleton />}>
        <ProductListSection searchParams={params} shopName={shop?.name} />
      </Suspense>
    </div>
  );
}
