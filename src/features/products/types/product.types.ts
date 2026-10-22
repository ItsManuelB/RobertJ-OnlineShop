import type { UserRole } from "@/constants/roles";
import type { ProductCondition, ProductStatus } from "@/constants/status";

/** One image belonging to a product, ordered by `sortOrder` (0 is the cover). */
export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  /** Optional variant this photo is tagged to; null = shared across every variant (the default). */
  variantId: string | null;
}

/** Domain model returned by the product service to the rest of the app. */
export interface Product {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  quantity: number;
  condition: ProductCondition;
  status: ProductStatus;
  featured: boolean;
  location: string | null;
  tags: string[];
  images: ProductImage[];
  categoryId: string | null;
  /** Category display name from the joined categories row, or null. */
  categoryName: string | null;
  /** Category slug from the joined categories row (for linking), or null. */
  categorySlug: string | null;
  /** Null when the product's original seller account has since been permanently deleted (see `admin_hard_delete_seller_account`) — the product itself survives so its order_items keep a valid reference. */
  sellerId: string | null;
  /** Seller's display name (full name, falling back to username), or "Former Seller" once the account is gone, or null. */
  sellerName: string | null;
  /**
   * The `seller_id` profile's current role. Only `seller` is ever a genuine
   * shop owner — `admin`-authored or legacy/demoted-account products have no
   * shop to display, so UI resolving a "shop" label should gate `sellerName`
   * behind `sellerRole === 'seller'` rather than showing it unconditionally.
   */
  sellerRole: UserRole | null;
  /** Owning shop, or null for a legacy/unassigned product awaiting admin assignment. */
  shopId: string | null;
  /** Default/spec material (e.g. "100% Combed Cotton"), overridable per variant — see `ProductVariant.material`. */
  material: string | null;
  /** Default/spec physical dimensions as free text (e.g. "30 x 20 x 5 cm"), overridable per variant — see `ProductVariant.dimensions`. */
  dimensions: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Filters accepted by the product listing query. */
export interface ProductListParams {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: string;
  status?: ProductStatus;
  sellerId?: string;
  /** Resolved server-side to the shop's member seller ids — see `listProducts`. */
  shopId?: string;
  sort?: ProductSort;
  /** Matches products tagged "sale" — the same seller-set tag convention ProductCard already reads. */
  onSale?: boolean;
  /** Major-unit pesos (not cents) — converted to price_cents inside listProducts. */
  minPrice?: number;
  maxPrice?: number;
  /** Category-driven attribute filters (§7 of the implementation plan) — matches if ANY of a product's variants has that value. */
  color?: string;
  size?: string;
  material?: string;
  dimensions?: string;
}

export type ProductSort = "recommended" | "newest" | "price-asc" | "price-desc" | "title-asc";

/**
 * Filters accepted by the Seller/Admin dashboard product listing — a
 * separate shape from `ProductListParams` (the buyer catalog) because the
 * dashboard filters by lifecycle `status`, never `onSale`/`minPrice`/
 * `maxPrice`, and has no `shopId` (the owner scope is resolved server-side,
 * not taken from the URL).
 */
export interface DashboardProductListParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: ProductStatus;
  categoryId?: string;
}

/** Convenience accessor — the cover image, or null when a product has none. */
export function getCoverImage(product: Product): ProductImage | null {
  return product.images[0] ?? null;
}

/**
 * An optional color/size variant of a product (Phase 3b). A product with no
 * variant rows is a plain single-SKU listing — nothing else in the schema
 * requires this to be populated. Stock lives in `inventory`
 * (`variant_id`-keyed), never here — see `adjustStock`.
 */
export interface ProductVariant {
  id: string;
  productId: string;
  /** Null when the seller account was hard-deleted (order history is preserved; attribution is not) — see `admin_hard_delete_seller_account`. */
  sellerId: string | null;
  shopId: string | null;
  sku: string | null;
  color: string | null;
  size: string | null;
  /** null = inherits the parent product's price_cents. */
  priceCents: number | null;
  /** null = inherits the parent product's material. */
  material: string | null;
  /** null = inherits the parent product's dimensions. */
  dimensions: string | null;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}
