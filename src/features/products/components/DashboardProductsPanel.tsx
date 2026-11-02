import { Archive } from "lucide-react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { PRODUCT_STATUS } from "@/constants/status";
import { DashboardProductViewToggle } from "@/features/products/components/DashboardProductViewToggle";
import { PaginationControls } from "@/features/products/components/PaginationControls";
import { ProductsDataTable } from "@/features/products/components/ProductsDataTable";
import { dashboardProductListParamsSchema } from "@/features/products/schemas/product.schema";
import type { Category } from "@/features/categories/types/category.types";
import type { Product, ProductVariant } from "@/features/products/types/product.types";
import type { Shop } from "@/features/shops/types/shop.types";
import {
  getVariantStock,
  getInventoryThresholdsForProducts,
  listActiveCategories,
  listDashboardProductVariants,
  listDashboardProductsPage,
} from "@/lib/supabase/queries";
import type { PaginatedResult } from "@/types/pagination.types";

export interface DashboardProductsPanelProps {
  searchParams: Record<string, string | string[] | undefined>;
  /** `null` for an admin (no ownership filter — RLS + moderation scope only); the caller's own seller/shop id otherwise. */
  owner: { sellerId: string; shopId: string | null } | null;
  /** Populated only for an admin (from `listShops()`); empty for a seller. */
  shops: Shop[];
  isAdmin: boolean;
}

/**
 * Dashboard equivalent of `ProductListSection` (the buyer catalog) — reads
 * its own `searchParams` and fetches a paginated/filtered page of products
 * directly, rather than the page pre-fetching everything and passing it
 * down. Mirrors `DashboardOrdersPanel`'s exact shape.
 */
export async function DashboardProductsPanel({
  searchParams,
  owner,
  shops,
  isAdmin,
}: DashboardProductsPanelProps) {
  const parsed = dashboardProductListParamsSchema.safeParse(searchParams);
  if (!parsed.success) {
    return <ErrorState message="Those filters aren't valid. Try clearing your search." />;
  }

  // `view` is presentation-only (Grid/List), so it's read from the raw
  // params rather than added to `dashboardProductListParamsSchema` — it
  // never affects the query. No `?view=` or anything but "grid" defaults
  // to List, matching the existing table/card layout.
  const rawView = Array.isArray(searchParams.view) ? searchParams.view[0] : searchParams.view;
  const view: "grid" | "list" = rawView === "grid" ? "grid" : "list";

  // The Recycle Bin is the same table/grid, filtered to `status=archived` via
  // the existing `DashboardProductStatusFilter` chip — not a separate page,
  // so it keeps every other active filter (search/category) intact.
  const isArchivedView = parsed.data.status === PRODUCT_STATUS.archived;

  let data: {
    result: PaginatedResult<Product>;
    categories: Category[];
    variants: ProductVariant[];
    variantStock: Record<string, number>;
    inventoryThresholds: { byItem: Record<string, number>; defaultThreshold: number };
  };
  try {
    const [result, categories, variants] = await Promise.all([
      listDashboardProductsPage(owner, parsed.data),
      listActiveCategories(),
      listDashboardProductVariants(),
    ]);
    // One batched lookup for the options of this page's products, for the Stock column. A failure
    // only leaves those counts blank (treated as 0); it must not take the whole list down.
    const pageProductIds = new Set(result.items.map((product) => product.id));
    const [variantStockMap, inventoryThresholds] = await Promise.all([
      getVariantStock(variants.filter((variant) => pageProductIds.has(variant.productId)).map((variant) => variant.id)).catch(
        () => new Map<string, number>(),
      ),
      getInventoryThresholdsForProducts([...pageProductIds]),
    ]);
    const variantStock = Object.fromEntries(variantStockMap);
    data = { result, categories, variants, variantStock, inventoryThresholds };
  } catch {
    return <ErrorState message="We couldn't load products right now." />;
  }

  const { result, categories, variants, variantStock, inventoryThresholds } = data;
  const { items, page, totalPages, total } = result;

  if (items.length === 0) {
    const otherFiltering = Boolean(parsed.data.search || parsed.data.categoryId || parsed.data.shopId);
    if (isArchivedView) {
      return (
        <EmptyState
          title={otherFiltering ? "No matching archived products" : "No archived products"}
          description={
            otherFiltering
              ? "Try a different search term or clear a filter."
              : "Products you archive will show up here, and can be restored at any time."
          }
        />
      );
    }
    const filtering = Boolean(
      parsed.data.search || parsed.data.status || parsed.data.categoryId || parsed.data.shopId,
    );
    return (
      <EmptyState
        title={filtering ? "No matching products" : "No products yet"}
        description={
          filtering
            ? "Try a different search term or clear a filter."
            : "Create your first product to get started."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {isArchivedView ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted p-4">
          <Archive className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">Archived products</p>
            <p className="text-sm text-muted-foreground">
              Hidden from buyers and kept out of your normal product list. Restore a product to
              make it available again — nothing is deleted while it&apos;s archived.
            </p>
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {total} {isArchivedView ? "archived " : ""}product{total === 1 ? "" : "s"}
        </p>
        <DashboardProductViewToggle />
      </div>
      <ProductsDataTable
        products={items}
        categories={categories}
        shops={shops}
        isAdmin={isAdmin}
        variants={variants}
        variantStock={variantStock}
        inventoryThresholds={inventoryThresholds}
        view={view}
        isArchivedView={isArchivedView}
      />
      {totalPages > 1 ? <PaginationControls page={page} totalPages={totalPages} themed /> : null}
    </div>
  );
}
