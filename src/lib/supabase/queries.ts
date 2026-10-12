import "server-only";

import { cache } from "react";
import type { UserIdentity } from "@supabase/supabase-js";

import { USER_ROLES, type UserRole } from "@/constants/roles";
import { publicEnv } from "@/config/env";
import { DATABASE_TABLES } from "@/constants/database";
import { ROUTES } from "@/constants/routes";
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
  PRODUCT_STATUS,
  RETURN_STATUS,
  type OrderStatus,
  type PaymentStatus,
  type ProductCondition,
  type ProductStatus,
  type ReturnStatus,
} from "@/constants/status";
import {
  createSupabaseAdminClient,
  createSupabaseAnonClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { mapPostgresError } from "@/lib/supabase/postgres-errors";
import { curatedRpcError, groupOrderError, queryError, rpcError } from "@/lib/supabase/query-error";
import type { Database, Json } from "@/lib/supabase/database.types";
import { slugify } from "@/lib/utils/format";
import { toCents } from "@/lib/utils/currency";
import { compareNatural } from "@/lib/utils/sort";
import { toRange, type PaginatedResult, type PaginationParams } from "@/types/pagination.types";
import type { SessionUser } from "@/types/common.types";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "@/features/products/schemas/product.schema";
import type {
  DashboardProductListParams,
  Product,
  ProductImage,
  ProductListParams,
  ProductVariant,
} from "@/features/products/types/product.types";
import type { Category } from "@/features/categories/types/category.types";
import type { LandingStat } from "@/features/landing/types/landing.types";
import type {
  GuidedSelectionMatch,
  RecommendationOccasion,
  RecommendationRule,
} from "@/features/assistant/types/assistant.types";
import {
  ACTIVE_ORDER_STATUSES,
  CANCELLABLE_ORDER_STATUSES,
  ORDER_STATUS_FLOW,
  ORDER_STATUS_TRANSITIONS,
  getOrderStatusLabel,
} from "@/features/orders/constants/order.constants";
import {
  ORDER_LIFECYCLE_TABS,
  type LifecycleTab,
} from "@/features/orders/constants/order-lifecycle.constants";
import type {
  Order,
  OrderListParams,
  OrderShipment,
  OrderSummary,
  ShippingAddress,
} from "@/features/orders/types/order.types";
import type { UpdateProfileInput } from "@/features/account/schemas/account.schema";
import type { OAuthProvider } from "@/features/auth/schemas/auth.schema";
import type { BuyerPreferences, Profile } from "@/features/account/types/account.types";
import type {
  DashboardPaymentListParams,
  Payment,
  PaymentAttempt,
} from "@/features/payments/types/payment.types";
import type { Shop, ShopWithMember } from "@/features/shops/types/shop.types";
import type { AdminUser } from "@/features/users/types/user.types";
import type { AdjustStockInput } from "@/features/inventory/schemas/inventory.schema";
import type { AddressInput } from "@/features/addresses/schemas/address.schema";
import type { Address } from "@/features/addresses/types/address.types";
import {
  getStockStatus,
  type DashboardInventoryListParams,
  type InventoryItem,
  type StockAdjustment,
} from "@/features/inventory/types/inventory.types";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "@/features/inventory/constants/inventory.constants";
import type {
  CategoryRevenue,
  OrderStatusCount,
  ReportGranularity,
  RepeatCustomerStats,
  RestockPriorityItem,
  SalesSummary,
  SalesTrendPoint,
  TopProduct,
} from "@/features/reports/types/report.types";
import type {
  ProductReviewSummary,
  Review,
} from "@/features/reviews/types/review.types";
import type { BuyerActivityEvent } from "@/features/notifications/types/notification.types";
import type {
  AdminReturnDecision,
  PendingXenditRefund,
  ReturnItemCondition,
  ReturnRequest,
  SellerReturnDecision,
} from "@/features/returns/types/return.types";
import type { AdminActionLogEntry } from "@/features/audit-log/types/audit-log.types";

/**
 * Centralized, reusable Supabase data-access layer.
 *
 * Every query the app makes against the database lives in this one file, so
 * there is a single place to look when tracing what a feature reads or writes.
 * Callers (Server Components, Server Actions) import the functions they need —
 * nothing here is feature-specific, and every function is safe to reuse from
 * any feature. The connection itself is still centralized one level further
 * down, in `lib/supabase/{server,client,session}.ts`; this file is the layer
 * above that turns raw Supabase calls into typed, reusable query functions.
 *
 * Organized in sections: Products, Categories, Landing stats, Auth/session.
 */

// ============================================================================
// Products
// ============================================================================

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type ProductImageRow = Database["public"]["Tables"]["product_images"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * `search_vector` is deliberately excluded: it is a generated tsvector that has
 * no client-side use and would bloat every payload. The seller profile is
 * embedded so the UI can show the shop/seller name without a second query.
 *
 * Table names here are intentionally literal, not `DATABASE_TABLES.X` /
 * `embed(...)`: Supabase's generated types parse this exact string at the type
 * level to infer the joined row shape, and that parser only works against a
 * literal template — interpolating a constant widens it to `string` and the
 * inferred type collapses to an untyped fallback. `DATABASE_TABLES` is used
 * everywhere else in this file (every `.from()` / `.eq()` call below); this
 * `.select()` string is the one documented exception.
 */
const PRODUCT_COLUMNS = `
  id, slug, title, description, price_cents, currency, quantity, condition,
  status, featured, location, tags, category_id, seller_id, shop_id, published_at,
  created_at, updated_at,
  product_images ( id, url, alt_text, sort_order ),
  seller:profiles!products_seller_id_fkey ( full_name, username, role ),
  category:categories!products_category_id_fkey ( name, slug )
`;

/**
 * Display fallback for a seller identity that has been permanently deleted
 * (`admin_hard_delete_seller_account` sets `seller_id` to null via the FK's
 * `on delete set null` — see 20260928054321_seller_hard_delete_support.sql).
 * `sellerId` is the raw column, not the joined profile, so this is reachable
 * even though the join itself already resolves to `null` in that case.
 */
const FORMER_SELLER_LABEL = "Former Seller";
function sellerDisplayName(
  sellerId: string | null,
  seller: Pick<ProfileRow, "full_name" | "username"> | null | undefined,
): string | null {
  if (seller?.full_name) return seller.full_name;
  if (seller?.username) return seller.username;
  return sellerId ? null : FORMER_SELLER_LABEL;
}

type ProductRowWithImages = Omit<ProductRow, "search_vector"> & {
  product_images: Pick<
    ProductImageRow,
    "id" | "url" | "alt_text" | "sort_order"
  >[];
  seller: Pick<ProfileRow, "full_name" | "username" | "role"> | null;
  category: { name: string; slug: string } | null;
};

/** Maps a database row onto the domain model the app consumes. */
function toProduct(row: ProductRowWithImages): Product {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    priceCents: row.price_cents,
    currency: row.currency,
    quantity: row.quantity,
    condition: row.condition as ProductCondition,
    status: row.status as ProductStatus,
    featured: row.featured,
    location: row.location,
    tags: row.tags,
    images: [...(row.product_images ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((image) => ({
        id: image.id,
        url: image.url,
        altText: image.alt_text,
        sortOrder: image.sort_order,
      })),
    categoryId: row.category_id,
    categoryName: row.category?.name ?? null,
    categorySlug: row.category?.slug ?? null,
    sellerId: row.seller_id,
    sellerName: sellerDisplayName(row.seller_id, row.seller),
    // Only a genuine `seller` is ever a shop owner — a product whose
    // `seller_id` resolves to an admin or (legacy/demoted) buyer profile has
    // no shop to display, and showing that account's personal name in its
    // place would be misleading, not just unbranded. Callers that render a
    // "shop" label check this before falling back to `sellerName`.
    sellerRole: (row.seller?.role as UserRole | undefined) ?? null,
    shopId: row.shop_id,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Paginated, filtered product listing. */
export async function listProducts(
  params: ProductListParams,
): Promise<PaginatedResult<Product>> {
  const supabase = await createSupabaseServerClient();

  // `shopId` isn't reliably populated on every historical row (TD-1 legacy
  // products) — resolve it to the shop's member seller ids first via
  // `resolve_shop_membership`, same as the dedicated shop filter. A shop with
  // zero members short-circuits to an empty page instead of querying
  // products at all.
  let shopSellerIds: string[] | null = null;
  if (params.shopId) {
    shopSellerIds = await getShopSellerIds(params.shopId);
    if (shopSellerIds.length === 0) {
      return {
        items: [],
        total: 0,
        page: params.page,
        pageSize: params.pageSize,
        totalPages: 1,
      };
    }
  }

  // Hide products whose shop has been deactivated by an admin (shops is a
  // tiny, admin-controlled table — this is a cheap lookup). A product with
  // no shop_id at all (a handful of legacy pre-shop-scoping rows) has no
  // shop to be deactivated, so it stays visible either way.
  const { data: inactiveShopRows } = await supabase
    .from(DATABASE_TABLES.SHOPS)
    .select("id")
    .eq("active", false);
  const inactiveShopIds = (inactiveShopRows ?? []).map((row) => row.id);

  // Built via a closure so an out-of-range page can be refetched (below) with
  // the identical filters/sort — a Supabase builder can't be re-ranged once
  // awaited, and duplicating the filter chain would violate DRY. `head` skips
  // row transfer for a count-only probe.
  const buildQuery = (head = false) => {
    let query = supabase
      .from(DATABASE_TABLES.PRODUCTS)
      .select(PRODUCT_COLUMNS, { count: "exact", head })
      .eq("status", params.status ?? PRODUCT_STATUS.active);

    if (shopSellerIds) {
      query = query.in("seller_id", shopSellerIds);
    }

    if (inactiveShopIds.length > 0) {
      query = query.or(`shop_id.is.null,shop_id.not.in.(${inactiveShopIds.join(",")})`);
    }

    if (params.search) {
      // Postgres's `.or()` filter mini-DSL treats "," and "()" as syntax, not
      // literal characters, so strip them before interpolating — otherwise a
      // search term containing one would break the filter string.
      const term = params.search.replace(/[,()]/g, " ").trim();
      if (term) {
        // Trigram substring match on the title (typo/partial-tolerant, backed
        // by products_title_trgm_idx) OR'd with full-text search across the
        // generated `search_vector` column (title + description, backed by
        // products_search_vector_idx — see initial_schema.sql), so a
        // description-only match is now findable too.
        query = query.or(
          `title.ilike.%${term}%,search_vector.wfts(english).${term}`,
        );
      }
    }
    if (params.categoryId) {
      query = query.eq("category_id", params.categoryId);
    }
    if (params.onSale) {
      // Same seller-set "sale" tag convention ProductCard/FeaturedProductsGrid
      // already read — no compare-at-price column exists to filter on instead.
      query = query.contains("tags", ["sale"]);
    }
    if (params.sellerId) {
      query = query.eq("seller_id", params.sellerId);
    }
    if (params.minPrice !== undefined) {
      // Backed by products_active_price_idx (price_cents where status='active').
      query = query.gte("price_cents", toCents(params.minPrice));
    }
    if (params.maxPrice !== undefined) {
      query = query.lte("price_cents", toCents(params.maxPrice));
    }

    switch (params.sort) {
      case "price-asc":
        query = query.order("price_cents", { ascending: true });
        break;
      case "price-desc":
        query = query.order("price_cents", { ascending: false });
        break;
      case "title-asc":
        query = query.order("title", { ascending: true });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }
    return query;
  };

  // Common path: one round-trip for the requested page.
  const { from, to } = toRange(params);
  const firstPass = await buildQuery().range(from, to);

  if (!firstPass.error) {
    const total = firstPass.count ?? 0;
    return {
      items: (firstPass.data ?? []).map((row) => toProduct(row as ProductRowWithImages)),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  // A page past the last one (e.g. hand-edited ?page=999) makes PostgREST
  // reject the out-of-range offset rather than return an empty list — it
  // only rejects when the requested *offset itself* exceeds the row count,
  // so an in-range or merely-partial last page never reaches this branch.
  // Recovery costs two more round-trips: a head-only probe to find the real
  // last page, then a refetch of it. (Investigated collapsing this further —
  // PostgREST's 416 response carries the true count in its error body, but
  // postgrest-js only parses `Content-Range` into `count` on a 2xx response,
  // so it's unavailable here; and probing unconditionally before every
  // request would regress the common in-range case from one round-trip to
  // two. Three round-trips for this rare, recoverable case is the floor
  // without either a fragile error-string parse or that regression.)
  // For page 1 (or if the probe shows the page was actually in range), the
  // error is genuine: rethrow.
  if (params.page > 1) {
    const probe = await buildQuery(true);
    const probeTotal = probe.count ?? 0;
    const probeTotalPages = Math.max(1, Math.ceil(probeTotal / params.pageSize));

    if (!probe.error && probeTotal > 0 && params.page > probeTotalPages) {
      const clamped = toRange({ page: probeTotalPages, pageSize: params.pageSize });
      const lastPage = await buildQuery().range(clamped.from, clamped.to);
      if (!lastPage.error) {
        // Recomputed from THIS query's own count, not the earlier probe's —
        // so the returned total/totalPages can never disagree with the
        // items actually returned, even if a row was inserted or deleted
        // between the two round-trips.
        const total = lastPage.count ?? probeTotal;
        const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
        return {
          items: (lastPage.data ?? []).map((row) => toProduct(row as ProductRowWithImages)),
          total,
          page: totalPages,
          pageSize: params.pageSize,
          totalPages,
        };
      }
    }
  }

  throw queryError("Failed to load products", firstPass.error);
}

/**
 * Featured products for the landing page: active listings flagged `featured`,
 * newest first. Returns an empty array when nothing is featured yet, so the
 * section can render a placeholder instead of failing.
 */
export async function listFeaturedProducts(limit = 8): Promise<Product[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .select(PRODUCT_COLUMNS)
    .eq("status", PRODUCT_STATUS.active)
    .eq("featured", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw queryError("Failed to load featured products", error);
  }

  return (data ?? []).map((row) => toProduct(row as ProductRowWithImages));
}

/**
 * Single product lookup by public slug. Returns null when not found.
 * `cache()`d so `generateMetadata` and the page share one fetch per request.
 */
export const getProductBySlug = cache(
  async (slug: string): Promise<Product | null> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from(DATABASE_TABLES.PRODUCTS)
      .select(PRODUCT_COLUMNS)
      .eq("slug", slug)
      .eq("status", PRODUCT_STATUS.active)
      .maybeSingle();

    if (error) {
      throw queryError("Failed to load product", error);
    }

    return data ? toProduct(data as ProductRowWithImages) : null;
  },
);

/**
 * Related products for a detail page: same category, active, excluding the
 * product itself, newest first. Returns `[]` when the product has no category.
 */
export async function listRelatedProducts(
  product: Product,
  limit = 4,
): Promise<Product[]> {
  if (!product.categoryId) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .select(PRODUCT_COLUMNS)
    .eq("status", PRODUCT_STATUS.active)
    .eq("category_id", product.categoryId)
    .neq("id", product.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw queryError("Failed to load related products", error);
  }

  return (data ?? []).map((row) => toProduct(row as ProductRowWithImages));
}

/**
 * Same-category, active, newest-first products for `anchorProductId`,
 * excluding every id in `excludeIds` — the shared rule behind both
 * `listCartRecommendations` and `listSimilarProducts` (same rule
 * `listRelatedProducts` uses on the PDP; not a personalized engine).
 * Returns `[]` when the anchor has no category or no longer exists (e.g. it
 * sold out/was archived after being added to the cart).
 */
async function listSameCategoryProducts(
  anchorProductId: string,
  excludeIds: string[],
  limit: number,
): Promise<Product[]> {
  const supabase = await createSupabaseServerClient();
  const { data: anchor, error: anchorError } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .select("category_id")
    .eq("id", anchorProductId)
    .maybeSingle();

  if (anchorError) {
    throw queryError("Failed to load similar products", anchorError);
  }
  if (!anchor?.category_id) return [];

  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .select(PRODUCT_COLUMNS)
    .eq("status", PRODUCT_STATUS.active)
    .eq("category_id", anchor.category_id)
    .not("id", "in", `(${excludeIds.join(",")})`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw queryError("Failed to load similar products", error);
  }

  return (data ?? []).map((row) => toProduct(row as ProductRowWithImages));
}

/** Cart-page "You may also like" — anchored on the first item in the cart,
 * excluding every product already in it, not just the anchor. */
export async function listCartRecommendations(
  cartProductIds: string[],
  limit = 4,
): Promise<Product[]> {
  if (cartProductIds.length === 0) return [];
  return listSameCategoryProducts(cartProductIds[0], cartProductIds, limit);
}

/** Cart-row "Find Similar" — same-category matches for one specific line,
 * excluding only that product itself. */
export async function listSimilarProducts(
  productId: string,
  limit = 6,
): Promise<Product[]> {
  return listSameCategoryProducts(productId, [productId], limit);
}

export interface ProductSuggestion {
  id: string;
  title: string;
  slug: string;
}

/**
 * Lightweight title-only matches for the header search's suggestions
 * dropdown. Deliberately not the full `listProducts` search (no
 * description/full-text match, no pagination) — this only needs to be fast
 * and narrow. Never triggers navigation itself; the header decides what to
 * do with a click.
 */
export async function searchProductSuggestions(
  term: string,
  limit = 5,
): Promise<ProductSuggestion[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .select("id, title, slug")
    .eq("status", PRODUCT_STATUS.active)
    .ilike("title", `%${trimmed.replace(/[%_]/g, "")}%`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw queryError("Failed to search products", error);
  }
  return data ?? [];
}

/** Live price/stock snapshot for one product, used to revalidate a cached cart line. */
export interface ProductPriceAndStock {
  id: string;
  priceCents: number;
  quantity: number;
  status: ProductStatus;
}

/**
 * Batch re-check of current price/stock/status for a set of product ids — the
 * read-side counterpart to `create_order`'s re-pricing, used to flag stale
 * cart lines before checkout. Public (no auth): the cart is a guest-accessible
 * client-side feature (ADR-013), so this must work without a session.
 *
 * The `products` SELECT RLS policy scopes anonymous/non-owner reads to
 * `status = 'active'` (see initial_schema.sql), so a product that has sold
 * out, been archived, or gone back to draft simply will not come back in the
 * result set — callers must treat an id **missing** from the returned array
 * as "no longer available," not as a fetch bug.
 */
export async function getProductsPriceAndStock(
  ids: string[],
): Promise<ProductPriceAndStock[]> {
  if (ids.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .select("id, price_cents, quantity, status")
    .in("id", ids);

  if (error) {
    throw queryError("Failed to check product availability", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    priceCents: row.price_cents,
    quantity: row.quantity,
    status: row.status as ProductStatus,
  }));
}

/** Live price/stock snapshot for one variant, resolved against its parent product. */
export interface VariantPriceAndStock {
  id: string;
  productId: string;
  /** The variant's own price override, or the parent product's price when it has none. */
  priceCents: number;
  quantity: number;
  status: ProductStatus;
}

/**
 * Batch stock lookup for variants — the counterpart to `products.quantity`
 * for a variant-level line, since `inventory` itself is not publicly
 * readable (see `get_variant_stock`'s migration comment). Returns 0 for any
 * id the RPC didn't return a row for (not found, inactive, or its parent
 * product inactive) rather than throwing — mirrors `getProductsPriceAndStock`'s
 * "missing = unavailable" convention.
 */
export async function getVariantStock(
  variantIds: string[],
): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_variant_stock", {
    p_variant_ids: variantIds,
  });

  if (error) {
    throw queryError("Failed to check variant stock", error);
  }

  return new Map((data ?? []).map((row) => [row.variant_id, row.quantity]));
}

/**
 * Batch re-check of current price/stock/status for a set of variant ids — the
 * variant-level counterpart to `getProductsPriceAndStock`. Public (no auth):
 * same guest-cart reasoning as the product version. A variant missing from
 * the result (inactive, deleted, or its parent product no longer active) must
 * be treated as "no longer available" by the caller, same convention as the
 * product version.
 */
export async function getVariantsPriceAndStock(
  variantIds: string[],
): Promise<VariantPriceAndStock[]> {
  if (variantIds.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  const { data: variants, error } = await supabase
    .from(DATABASE_TABLES.PRODUCT_VARIANTS)
    .select("id, product_id, price_cents")
    .in("id", variantIds);

  if (error) {
    throw queryError("Failed to check variant availability", error);
  }
  if (!variants || variants.length === 0) return [];

  const productIds = [...new Set(variants.map((row) => row.product_id))];
  const [products, stock] = await Promise.all([
    getProductsPriceAndStock(productIds),
    getVariantStock(variantIds),
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));

  return variants.flatMap((row) => {
    const product = productById.get(row.product_id);
    // The parent product isn't in the (active-only) result — treat the
    // variant as unavailable too, rather than fabricating a price.
    if (!product) return [];
    return [
      {
        id: row.id,
        productId: row.product_id,
        priceCents: row.price_cents ?? product.priceCents,
        quantity: stock.get(row.id) ?? 0,
        status: product.status,
      },
    ];
  });
}

/** One cart line to revalidate: a plain product, or a specific variant of one. */
export interface CartAvailabilityQuery {
  productId: string;
  variantId?: string;
}

/** Live price/stock snapshot for one cart line — product- or variant-level. */
export interface CartAvailabilityEntry {
  productId: string;
  variantId: string | null;
  priceCents: number;
  quantity: number;
  status: ProductStatus;
}

/**
 * Revalidates a client-side cart against the live database — the merged,
 * variant-aware counterpart to calling `getProductsPriceAndStock` alone.
 * Non-variant lines are checked against `products`; variant lines are
 * checked against `product_variants` + variant-level `inventory` (via
 * `getVariantsPriceAndStock`). A line missing from the result means "no
 * longer available" — same convention both underlying functions already use.
 */
export async function checkCartAvailability(
  lines: CartAvailabilityQuery[],
): Promise<CartAvailabilityEntry[]> {
  const productIds = [
    ...new Set(lines.filter((line) => !line.variantId).map((line) => line.productId)),
  ];
  const variantIds = [
    ...new Set(
      lines
        .filter((line): line is CartAvailabilityQuery & { variantId: string } =>
          Boolean(line.variantId),
        )
        .map((line) => line.variantId),
    ),
  ];

  const [products, variants] = await Promise.all([
    getProductsPriceAndStock(productIds),
    getVariantsPriceAndStock(variantIds),
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));

  return lines.flatMap((line): CartAvailabilityEntry[] => {
    if (line.variantId) {
      const variant = variantById.get(line.variantId);
      if (!variant) return [];
      return [
        {
          productId: line.productId,
          variantId: line.variantId,
          priceCents: variant.priceCents,
          quantity: variant.quantity,
          status: variant.status,
        },
      ];
    }
    const product = productById.get(line.productId);
    if (!product) return [];
    return [
      {
        productId: line.productId,
        variantId: null,
        priceCents: product.priceCents,
        quantity: product.quantity,
        status: product.status,
      },
    ];
  });
}

/**
 * Slug + last-modified for every active product, for `sitemap.ts` only.
 * Uses the cookie-free `createSupabaseAnonClient()` (not the usual
 * cookie-bound client) so the sitemap route stays static/ISR-eligible — see
 * that function's doc comment.
 */
export async function listActiveProductSlugsForSitemap(): Promise<
  { slug: string; updatedAt: string }[]
> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .select("slug, updated_at")
    .eq("status", PRODUCT_STATUS.active);

  if (error) {
    throw queryError("Failed to load product slugs", error);
  }

  return (data ?? []).map((row) => ({
    slug: row.slug,
    updatedAt: row.updated_at,
  }));
}

/**
 * Inserts a product owned by the given seller, in the given shop. `shopId`
 * is always a server-resolved value (the caller's own shop via
 * `requireOwnShopId()`, or an admin's explicit selection from `listShops()`)
 * — never taken from `input.shopId` directly, so a client can't submit an
 * arbitrary shop even though RLS would reject a mismatched one anyway.
 */
export async function createProduct(
  input: CreateProductInput,
  sellerId: string,
  shopId: string,
): Promise<Product> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .insert({
      slug: `${slugify(input.title)}-${Date.now().toString(36)}`,
      title: input.title,
      description: input.description ?? null,
      price_cents: toCents(input.price),
      quantity: input.quantity,
      condition: input.condition,
      status: input.status,
      location: input.location ?? null,
      tags: input.tags,
      category_id: input.categoryId ?? null,
      seller_id: sellerId,
      shop_id: shopId,
      featured: input.featured ?? false,
    })
    .select(PRODUCT_COLUMNS)
    .single();

  if (error) {
    throw queryError("Failed to create product", error);
  }

  return toProduct(data as ProductRowWithImages);
}

/**
 * Applies a partial update. RLS enforces seller ownership.
 *
 * `quantity` is handled separately: `products.quantity` is a trigger-synced
 * mirror of `inventory.quantity` (see the Inventory module's migration), and
 * `authenticated` no longer has UPDATE privilege on that column directly. A
 * submitted `quantity` is converted to a delta against the current stock and
 * routed through `adjustStock()` — the audited, authorization-checked RPC —
 * *before* the rest of the row is updated, so a partial failure never leaves
 * stock silently wrong while cosmetic fields succeed.
 */
/**
 * `owner`: the caller's own scope for a non-admin request (`null` = admin,
 * no extra filter — RLS's `is_admin()` is already the complete boundary
 * there). For a seller, mirrors the live RLS policy exactly: their own
 * products, or any product belonging to a shop they're a member of.
 * Defense-in-depth alongside RLS, not a replacement for it — see the
 * 2026-08-20 audit (this table's UPDATE previously relied on RLS alone).
 */
export async function updateProduct(
  input: UpdateProductInput,
  owner: { sellerId: string; shopId: string | null } | null,
): Promise<Product> {
  const supabase = await createSupabaseServerClient();
  const { id, price, categoryId, description, location, quantity, ...rest } = input;

  if (owner) {
    const ownerFilter = owner.shopId
      ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
      : `seller_id.eq.${owner.sellerId}`;
    const { data: existing, error: readError } = await supabase
      .from(DATABASE_TABLES.PRODUCTS)
      .select("id")
      .eq("id", id)
      .or(ownerFilter)
      .maybeSingle();

    if (readError) {
      throw new Error(`Failed to load product: ${readError.message}`);
    }
    if (!existing) {
      throw new Error("Product not found.");
    }
  }

  if (quantity !== undefined) {
    const current = await getInventoryForProduct(id);
    const delta = quantity - (current?.quantity ?? 0);
    if (delta !== 0) {
      await adjustStock({ productId: id, delta, reason: "correction" });
    }
  }

  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .update({
      ...rest,
      ...(description !== undefined ? { description: description || null } : {}),
      ...(location !== undefined ? { location: location || null } : {}),
      ...(price !== undefined ? { price_cents: toCents(price) } : {}),
      ...(categoryId !== undefined ? { category_id: categoryId ?? null } : {}),
    })
    .eq("id", id)
    .select(PRODUCT_COLUMNS)
    .single();

  if (error) {
    throw queryError("Failed to update product", error);
  }

  return toProduct(data as ProductRowWithImages);
}

/**
 * Soft delete: archived products stay queryable so historical order items keep
 * resolving. The order_items -> products FK is ON DELETE RESTRICT for the same
 * reason, so a hard delete of a sold product is refused by the database.
 */
/** `owner`: same defense-in-depth scope as `updateProduct` above. */
export async function archiveProduct(
  id: string,
  owner: { sellerId: string; shopId: string | null } | null,
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  if (owner) {
    const ownerFilter = owner.shopId
      ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
      : `seller_id.eq.${owner.sellerId}`;
    const { data: existing, error: readError } = await supabase
      .from(DATABASE_TABLES.PRODUCTS)
      .select("id")
      .eq("id", id)
      .or(ownerFilter)
      .maybeSingle();

    if (readError) {
      throw new Error(`Failed to load product: ${readError.message}`);
    }
    if (!existing) {
      throw new Error("Product not found.");
    }
  }

  const { error } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .update({ status: PRODUCT_STATUS.archived })
    .eq("id", id);

  if (error) {
    throw queryError("Failed to archive product", error);
  }
}

/**
 * Restores an archived product. The target status is computed, not chosen by
 * the caller, because `products_active_requires_stock`/
 * `products_active_requires_published_at` (initial_schema.sql) reject
 * `active` for a zero-stock or never-published row — the same fallback
 * `sync_products_quantity_from_inventory` already applies when stock hits
 * zero (active -> sold). Restoring goes to `active` only when both
 * conditions hold, else `draft`, so this can never violate those
 * constraints. `owner`: same defense-in-depth scope as `archiveProduct`.
 *
 * Stock is read from `inventory` (summed by `product_id`), not
 * `products.quantity` directly: `sync_products_quantity_from_inventory` only
 * keeps that mirror in sync for non-variant stock changes, so for any
 * variant-parent product it's frozen at whatever value existed when the
 * product was created — reading it here could restore a well-stocked
 * variant product to `draft`, or a sold-out one to `active`. Summing
 * `inventory` works uniformly for both simple and variant-parent products
 * (one row vs. one row per variant), and is written back to
 * `products.quantity` in the same update so the mirror is accurate going
 * forward too, not just for this decision.
 */
export async function restoreProduct(
  id: string,
  owner: { sellerId: string; shopId: string | null } | null,
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  let existingQuery = supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .select("id, status, published_at")
    .eq("id", id);

  if (owner) {
    const ownerFilter = owner.shopId
      ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
      : `seller_id.eq.${owner.sellerId}`;
    existingQuery = existingQuery.or(ownerFilter);
  }

  const { data: existing, error: readError } = await existingQuery.maybeSingle();

  if (readError) {
    throw new Error(`Failed to load product: ${readError.message}`);
  }
  if (!existing) {
    throw new Error("Product not found.");
  }
  if (existing.status !== PRODUCT_STATUS.archived) {
    throw new Error("Only archived products can be restored.");
  }

  const { data: inventoryRows, error: inventoryError } = await supabase
    .from(DATABASE_TABLES.INVENTORY)
    .select("quantity")
    .eq("product_id", id);

  if (inventoryError) {
    throw queryError("Failed to load stock", inventoryError);
  }

  const totalQuantity = (inventoryRows ?? []).reduce((sum, row) => sum + row.quantity, 0);

  const targetStatus =
    totalQuantity > 0 && existing.published_at !== null
      ? PRODUCT_STATUS.active
      : PRODUCT_STATUS.draft;

  const { error } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .update({ status: targetStatus, quantity: totalQuantity })
    .eq("id", id);

  if (error) {
    throw queryError("Failed to restore product", error);
  }
}

/**
 * Cheap ownership check for a seller before an image write — same "own it,
 * or it's in my shop" rule as `updateProduct`/`archiveProduct` (and, since
 * the accompanying migration, the `product_images`/storage RLS policies
 * too). A shop's product can have a `seller_id` that predates shop
 * assignment or belongs to a different shop member; checking `seller_id`
 * alone rejected uploads on products the seller can otherwise see and edit.
 */
export async function productBelongsToOwner(
  productId: string,
  owner: { sellerId: string; shopId: string | null },
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const ownerFilter = owner.shopId
    ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
    : `seller_id.eq.${owner.sellerId}`;
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .select("id")
    .eq("id", productId)
    .or(ownerFilter)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to verify product ownership", error);
  }
  return Boolean(data);
}

/**
 * Resolves a product's own `seller_id`/`shop_id` — used when creating a
 * variant, so the variant is attributed to the product's *actual* owner
 * (never the acting admin's own id) while still verifying the caller
 * (owner = null for admin) is authorized to touch this product at all.
 */
export async function getProductOwnerInfo(
  productId: string,
  owner: { sellerId: string; shopId: string | null } | null,
): Promise<{ sellerId: string; shopId: string | null }> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .select("seller_id, shop_id")
    .eq("id", productId);

  if (owner) {
    const ownerFilter = owner.shopId
      ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
      : `seller_id.eq.${owner.sellerId}`;
    query = query.or(ownerFilter);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw queryError("Failed to load product", error);
  }
  if (!data) {
    throw new Error("Product not found.");
  }
  // `product_variants.seller_id` stays NOT NULL by design — a product whose
  // seller account has since been permanently deleted (`seller_id` set null
  // by `admin_hard_delete_seller_account`) has no valid owner left to
  // attribute a new variant to.
  if (!data.seller_id) {
    throw new Error("This product's seller account no longer exists.");
  }
  return { sellerId: data.seller_id, shopId: data.shop_id };
}

/**
 * Uploads one product photo to the public `product-images` bucket and
 * returns its public URL — mirrors `uploadReturnEvidence`'s path convention
 * (`{parent_id}/{uuid}.{ext}`), except this bucket is public (product photos
 * must be visible to guests) so the URL, not a private path, is what
 * `product_images.url` stores (see the `product_images_url_scheme` check
 * constraint, which requires a full `https?://` value).
 */
export async function uploadProductImage(
  productId: string,
  file: File,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${productId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type });

  if (error) {
    throw queryError("Failed to upload image", error);
  }

  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Attaches an already-uploaded image to a product. `sort_order` is
 * server-computed (one past the current max) so callers never have to track
 * ordering themselves, respecting the `unique (product_id, sort_order)`
 * constraint without a client-supplied index that could collide.
 */
export async function addProductImage(
  productId: string,
  url: string,
): Promise<ProductImage> {
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: readError } = await supabase
    .from(DATABASE_TABLES.PRODUCT_IMAGES)
    .select("sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) {
    throw new Error(`Failed to load existing images: ${readError.message}`);
  }

  const nextSortOrder = existing ? existing.sort_order + 1 : 0;

  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCT_IMAGES)
    .insert({ product_id: productId, url, sort_order: nextSortOrder })
    .select("id, url, alt_text, sort_order")
    .single();

  if (error) {
    throw queryError("Failed to save image", error);
  }

  return {
    id: data.id,
    url: data.url,
    altText: data.alt_text,
    sortOrder: data.sort_order,
  };
}

/**
 * Removes a product image row and its Storage object.
 * `owner`: same defense-in-depth scope as `updateProduct`/`archiveProduct`
 * (`null` = admin, RLS is the complete boundary; otherwise re-verify the
 * image's parent product belongs to this seller or their shop before
 * deleting anything).
 */
export async function deleteProductImage(
  imageId: string,
  owner: { sellerId: string; shopId: string | null } | null,
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: image, error: readError } = await supabase
    .from(DATABASE_TABLES.PRODUCT_IMAGES)
    .select("id, url, product_id, products!inner ( seller_id, shop_id )")
    .eq("id", imageId)
    .maybeSingle<{
      id: string;
      url: string;
      product_id: string;
      products: { seller_id: string; shop_id: string | null };
    }>();

  if (readError) {
    throw new Error(`Failed to load image: ${readError.message}`);
  }
  if (!image) {
    throw new Error("Image not found.");
  }
  if (
    owner &&
    image.products.seller_id !== owner.sellerId &&
    !(owner.shopId && image.products.shop_id === owner.shopId)
  ) {
    throw new Error("Image not found.");
  }

  const { error: deleteError } = await supabase
    .from(DATABASE_TABLES.PRODUCT_IMAGES)
    .delete()
    .eq("id", imageId);

  if (deleteError) {
    throw new Error(`Failed to delete image: ${deleteError.message}`);
  }

  const path = new URL(image.url).pathname.split("/product-images/")[1];
  if (path) {
    await supabase.storage.from("product-images").remove([path]);
  }
}

/**
 * Paid units sold per product, for the catalog's "N sold" badge — via
 * `get_product_sold_counts` (public/anon-callable, see its migration).
 * Returns a `productId -> unitsSold` map; products with no paid sales are
 * simply absent, same empty-input short-circuit as `getShopNamesBySellerIds`.
 */
export async function getProductSoldCounts(
  productIds: string[],
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_product_sold_counts", {
    p_product_ids: productIds,
  });

  if (error) {
    throw queryError("Failed to load product sales", error);
  }
  return new Map((data ?? []).map((row) => [row.product_id, row.units_sold]));
}

// ============================================================================
// Wishlist
// ============================================================================

/** Ids of every product the given user has saved — a cheap bulk check so a
 * listing/grid page can mark hearts as filled without one query per tile. */
export async function listWishlistProductIds(userId: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.WISHLISTS)
    .select("product_id")
    .eq("user_id", userId);

  if (error) {
    throw queryError("Failed to load wishlist", error);
  }
  return (data ?? []).map((row) => row.product_id);
}

/** Whether the given user has saved one specific product — used on the PDP. */
export async function isProductWishlisted(
  userId: string,
  productId: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.WISHLISTS)
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to check wishlist", error);
  }
  return data !== null;
}

/**
 * The signed-in user's saved products, newest-saved first, for the
 * `/wishlist` page. Fetched as two plain, literal-select queries (rather than
 * one embedded `wishlists -> products` join) so the `PRODUCT_COLUMNS` select
 * string stays a direct, uninterpolated literal — the one form Supabase's
 * generated-type parser can actually infer (see the comment above
 * `PRODUCT_COLUMNS`).
 */
export async function listWishlistProducts(userId: string): Promise<Product[]> {
  const supabase = await createSupabaseServerClient();

  const { data: wishlistRows, error: wishlistError } = await supabase
    .from(DATABASE_TABLES.WISHLISTS)
    .select("product_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (wishlistError) {
    throw new Error(`Failed to load wishlist: ${wishlistError.message}`);
  }

  const orderedIds = (wishlistRows ?? []).map((row) => row.product_id);
  if (orderedIds.length === 0) return [];

  const { data: productRows, error: productsError } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .select(PRODUCT_COLUMNS)
    .in("id", orderedIds);

  if (productsError) {
    throw new Error(`Failed to load wishlist: ${productsError.message}`);
  }

  // `.in()` does not preserve argument order, and RLS silently omits a
  // product that's no longer `active` (and not the caller's own) — resort to
  // the wishlist's own saved-order and drop whatever didn't come back rather
  // than surfacing a "missing product" error for a legitimately sold-out item.
  const byId = new Map(
    (productRows ?? []).map((row) => [
      row.id,
      toProduct(row as ProductRowWithImages),
    ]),
  );
  return orderedIds
    .map((id) => byId.get(id))
    .filter((product): product is Product => product !== undefined);
}

/**
 * Saves a product to the user's wishlist. Idempotent by design — re-saving
 * an already-saved product (e.g. a duplicate optimistic click) is a silent
 * no-op rather than an error; `wishlists_unique_item` (23505) is the only
 * thing that would otherwise reject it.
 */
export async function addWishlistItem(
  userId: string,
  productId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from(DATABASE_TABLES.WISHLISTS)
    .insert({ user_id: userId, product_id: productId });

  if (error && error.code !== "23505") {
    throw new Error(mapPostgresError(error, "Could not save this item."));
  }
}

/** Removes a product from the user's wishlist. A no-op if it wasn't saved. */
export async function removeWishlistItem(
  userId: string,
  productId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from(DATABASE_TABLES.WISHLISTS)
    .delete()
    .eq("user_id", userId)
    .eq("product_id", productId);

  if (error) {
    throw new Error(mapPostgresError(error, "Could not remove this item."));
  }
}

// ============================================================================
// Reviews
// ============================================================================

type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];

function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    orderItemId: row.order_item_id,
    productId: row.product_id,
    reviewerDisplayName: row.reviewer_display_name,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

/**
 * Public reviews for one product, newest first, with a live-computed
 * average — never denormalized onto `products` (see DECISIONS.md ADR-018).
 */
export async function listProductReviews(
  productId: string,
): Promise<ProductReviewSummary> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.REVIEWS)
    .select(
      "id, order_item_id, product_id, buyer_id, reviewer_display_name, rating, comment, created_at",
    )
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) {
    throw queryError("Failed to load reviews", error);
  }

  const reviews = (data ?? []).map((row) => toReview(row as ReviewRow));
  const reviewCount = reviews.length;
  const averageRating =
    reviewCount === 0
      ? null
      : reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount;

  return { reviews, averageRating, reviewCount };
}

/**
 * Submits a verified-purchase review via the `submit_review` RPC, which
 * re-checks ownership + `order_status = 'delivered'` itself — this function
 * never trusts the caller's claim about which order the item belongs to.
 */
export async function submitReview(
  orderItemId: string,
  rating: number,
  comment: string | null,
): Promise<Review> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_review", {
    p_order_item_id: orderItemId,
    p_rating: rating,
    // The RPC has no `default null` for p_comment, so codegen types it as
    // non-nullable even though the function body already normalizes ''
    // back to NULL via `nullif(trim(p_comment), '')` — passing '' here is
    // behaviorally identical to null, not a change in what gets stored.
    p_comment: comment ?? "",
  });

  if (error) {
    throw new Error(mapPostgresError(error, "Could not submit your review."));
  }
  return toReview(data as ReviewRow);
}

/**
 * Which of the given order items already have a review — used to hide
 * "Write a Review" for items the buyer has already covered.
 */
export async function listReviewedOrderItemIds(
  orderItemIds: string[],
): Promise<Set<string>> {
  if (orderItemIds.length === 0) return new Set();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.REVIEWS)
    .select("order_item_id")
    .in("order_item_id", orderItemIds);

  if (error) {
    throw queryError("Failed to check existing reviews", error);
  }
  return new Set((data ?? []).map((row) => row.order_item_id));
}

// ============================================================================
// Buyer Activity Feed
// ============================================================================

/**
 * Derived, read-only notification feed via `get_buyer_activity_feed` — no
 * `notifications` table, no triggers, no realtime (see DECISIONS.md
 * ADR-018). "Confirmed"/"processing" are not represented: `orders` has no
 * timestamp column for those transitions, and this deliberately doesn't
 * guess one.
 */
export async function getBuyerActivityFeed(
  limit = 20,
): Promise<BuyerActivityEvent[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_buyer_activity_feed", {
    p_limit: limit,
  });

  if (error) {
    throw queryError("Failed to load activity", error);
  }

  return (data ?? []).map((row) => ({
    eventType: row.event_type as BuyerActivityEvent["eventType"],
    orderId: row.order_id,
    orderNumber: row.order_number,
    occurredAt: row.occurred_at,
  }));
}

// ============================================================================
// Categories
// ============================================================================

/**
 * Category columns plus an aggregate count of the category's active products.
 * The `products(count)` embed is filtered to active listings (see the
 * `products.status` filter on the query), so the label reflects what a shopper
 * can actually buy — drafts and archived rows are excluded.
 */
// Literal for the same reason as PRODUCT_COLUMNS above — this string is parsed
// at the type level by Supabase's generated types and must not be interpolated.
const CATEGORY_COLUMNS = `id, name, slug, description, image_url, sort_order, products(count)`;

/** Category columns without the `products(count)` embed (see `getCategoryBySlug`). */
const CATEGORY_BASE_COLUMNS = `id, name, slug, description, image_url, sort_order`;

type CategoryRowWithCount = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  products: { count: number }[];
};

function toCategory(row: CategoryRowWithCount): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.image_url,
    productCount: row.products?.[0]?.count ?? 0,
  };
}

/**
 * Active categories ordered by `sort_order`, each with its active-product count.
 * Omit `limit` to return every active category (the `/categories` index); the
 * landing passes `4`. Returns an empty array when the taxonomy has not been
 * seeded yet, so callers can fall back to a placeholder rather than crash.
 */
export async function listActiveCategories(limit?: number): Promise<Category[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from(DATABASE_TABLES.CATEGORIES)
    .select(CATEGORY_COLUMNS)
    .eq("active", true)
    .eq(`${DATABASE_TABLES.PRODUCTS}.status`, PRODUCT_STATUS.active)
    .order("sort_order", { ascending: true });

  if (limit != null) query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    throw queryError("Failed to load categories", error);
  }

  return (data ?? []).map((row) => toCategory(row as CategoryRowWithCount));
}

/**
 * Single active category by slug. Uses base columns (NOT the `products(count)`
 * embed): the embed's nested `status = active` filter behaves like an inner
 * join, so a category with zero active products would return no row and falsely
 * 404. The page's live active count comes from the listing's `total` instead;
 * `productCount` is defaulted to 0 to satisfy the `Category` shape.
 */
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from(DATABASE_TABLES.CATEGORIES)
    .select(CATEGORY_BASE_COLUMNS)
    .eq("active", true)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to load category", error);
  }

  return data
    ? {
        id: data.id,
        name: data.name,
        slug: data.slug,
        description: data.description,
        imageUrl: data.image_url,
        productCount: 0,
      }
    : null;
}

/**
 * Slug + last-modified for every active category, for `sitemap.ts` only.
 * Uses the cookie-free `createSupabaseAnonClient()` — see that function's
 * doc comment for why.
 */
export async function listActiveCategorySlugsForSitemap(): Promise<
  { slug: string; updatedAt: string }[]
> {
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.CATEGORIES)
    .select("slug, updated_at")
    .eq("active", true);

  if (error) {
    throw queryError("Failed to load category slugs", error);
  }

  return (data ?? []).map((row) => ({
    slug: row.slug,
    updatedAt: row.updated_at,
  }));
}

// ============================================================================
// Landing stats
// ============================================================================

/**
 * Live marketplace counts that back the landing stats. A `null` value means the
 * query failed — callers fall back to the hardcoded marketing number. These are
 * the only two headline stats that are truly derivable from the current schema;
 * buyers, sales, and average rating stay marketing placeholders until orders /
 * reviews / analytics data exist.
 */
export interface MarketplaceStats {
  /** Count of `profiles` with role `seller`. */
  sellerCount: number | null;
  /** Count of `products` with status `active`. */
  productCount: number | null;
  /** Count of `profiles` with role `buyer`. */
  buyerCount: number | null;
  /** Count of `orders` that reached `delivered` — real "orders fulfilled". */
  fulfilledOrderCount: number | null;
}

/**
 * Fetches the derivable headline counts via `get_marketplace_stats`, a
 * `SECURITY DEFINER` RPC (see its migration) that computes all four counts
 * server-side in one round-trip. Deliberately NOT four separate RLS-scoped
 * queries: `profiles` SELECT RLS hides buyer-role rows from anon/other
 * buyers, and `orders` has no anon table grant at all, so reading these
 * aggregates through the normal session client would silently return 0 (or
 * error) for virtually every real visitor — the RPC bypasses that per-viewer
 * visibility to return the true platform totals, exposing only counts, never
 * row data. Wrapped in React `cache()` so multiple sections rendering in the
 * same request share a single round-trip. Never throws — on any failure
 * every count comes back `null` so the UI shows its fallback. We deliberately
 * do NOT expose aggregate ₱ sales totals or fabricated figures on a public page.
 */
export const getMarketplaceStats = cache(async (): Promise<MarketplaceStats> => {
  const empty: MarketplaceStats = {
    sellerCount: null,
    productCount: null,
    buyerCount: null,
    fulfilledOrderCount: null,
  };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_marketplace_stats");
    const row = data?.[0];
    if (error || !row) return empty;

    return {
      sellerCount: row.seller_count,
      productCount: row.product_count,
      buyerCount: row.buyer_count,
      fulfilledOrderCount: row.fulfilled_order_count,
    };
  } catch {
    return empty;
  }
});

/**
 * Resolves the number to display for a stat, or `null` if it shouldn't be
 * shown at all. A `live` stat shows its real count whenever the query
 * succeeded — including a legitimate zero (so an empty marketplace reads
 * "0", never a fabricated number). When the query itself failed (`null`),
 * this returns `null` too — callers should omit the stat rather than fall
 * back to a hardcoded number, which would misrepresent a DB outage as either
 * a measured "0" or a fabricated placeholder figure. `placeholder` stats
 * always use their hardcoded value — but every headline stat is `live` now,
 * so a placeholder figure is never presented as measured fact.
 */
export function resolveStatValue(
  stat: LandingStat,
  stats: MarketplaceStats,
): number | null {
  if (stat.source === "live" && stat.metric) {
    return stats[stat.metric];
  }
  return stat.value;
}

// ============================================================================
// Orders (buyer)
// ============================================================================

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];

/**
 * Order columns plus the line items and the seller display name. Literal for
 * the same reason as `PRODUCT_COLUMNS`: Supabase's generated types parse this
 * exact string at the type level and must not be interpolated. `product` is an
 * RLS-gated live join — a sold/archived product resolves to `null`, so order
 * items keep their immutable title/price snapshots either way.
 */
const ORDER_COLUMNS = `
  id, order_number, buyer_id, seller_id, shop_id, subtotal_cents, shipping_fee_cents,
  total_cents, currency, payment_status, payment_method, order_status, shipping_address, notes,
  placed_at, paid_at, shipped_at, delivered_at, cancelled_at, checkout_group_id,
  cancellation_reason, cancelled_by, buyer_confirmed_received_at,
  buyer:profiles!orders_buyer_id_fkey ( full_name, username ),
  seller:profiles!orders_seller_id_fkey ( full_name, username, role ),
  shop:shops!orders_shop_id_fkey ( name ),
  order_items (
    id, product_id, product_title, quantity, unit_price_cents, subtotal_cents,
    variant_id, variant_label,
    product:products!order_items_product_id_fkey ( slug, product_images ( url ) )
  )
`;

type OrderRowWithItems = Omit<OrderRow, "shipping_address"> & {
  shipping_address: Json;
  buyer: Pick<ProfileRow, "full_name" | "username"> | null;
  shop: { name: string } | null;
  seller: Pick<ProfileRow, "full_name" | "username" | "role"> | null;
  order_items: Array<
    OrderItemRow & {
      product: { slug: string; product_images: { url: string }[] } | null;
    }
  >;
};

/** Maps the `shipping_address` jsonb snapshot onto the domain model. */
function toShippingAddress(value: Json): ShippingAddress | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.full_name !== "string") return null;
  const str = (key: string): string | null =>
    typeof record[key] === "string" ? (record[key] as string) : null;
  return {
    fullName: record.full_name,
    line1: str("line1") ?? "",
    line2: str("line2"),
    barangay: str("barangay"),
    city: str("city") ?? "",
    province: str("province"),
    region: str("region"),
    postalCode: str("postal_code") ?? "",
    country: str("country") ?? "",
    phone: str("phone"),
  };
}

/** Maps a database row onto the order domain model the app consumes. */
function toOrder(row: OrderRowWithItems): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.order_status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    subtotalCents: row.subtotal_cents,
    shippingFeeCents: row.shipping_fee_cents,
    totalCents: row.total_cents,
    currency: row.currency,
    shippingAddress: toShippingAddress(row.shipping_address),
    notes: row.notes,
    buyerId: row.buyer_id,
    buyerName: row.buyer?.full_name ?? row.buyer?.username ?? null,
    sellerId: row.seller_id,
    sellerName: sellerDisplayName(row.seller_id, row.seller),
    sellerRole: (row.seller?.role as UserRole | undefined) ?? null,
    shopId: row.shop_id,
    shopName: row.shop?.name ?? null,
    items: (row.order_items ?? []).map((item) => ({
      id: item.id,
      productId: item.product_id,
      productTitle: item.product_title,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      subtotalCents: item.subtotal_cents,
      productSlug: item.product?.slug ?? null,
      imageUrl: item.product?.product_images?.[0]?.url ?? null,
      variantId: item.variant_id,
      variantLabel: item.variant_label,
    })),
    placedAt: row.placed_at,
    paidAt: row.paid_at,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
    cancellable: CANCELLABLE_ORDER_STATUSES.includes(row.order_status),
    checkoutGroupId: row.checkout_group_id,
    cancellationReason: row.cancellation_reason,
    cancelledBy: row.cancelled_by,
    buyerConfirmedReceivedAt: row.buyer_confirmed_received_at,
  };
}

/**
 * The signed-in buyer's order history: newest first, with an optional Order-ID
 * search (the proposal storyboard's "manually enter an Order ID") and an
 * optional status filter. RLS restricts rows to `buyer_id = auth.uid()`.
 */
export async function listBuyerOrders(
  buyerId: string,
  params: OrderListParams,
): Promise<PaginatedResult<Order>> {
  if (params.lifecycleTab) {
    return listBuyerOrdersByLifecycleTab(buyerId, params, params.lifecycleTab);
  }

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from(DATABASE_TABLES.ORDERS)
    .select(ORDER_COLUMNS, { count: "exact" })
    .eq("buyer_id", buyerId);

  if (params.search) {
    query = query.ilike("order_number", `%${params.search}%`);
  }
  if (params.status) {
    query = query.eq("order_status", params.status);
  }

  query = query.order("placed_at", { ascending: false });

  const { from, to } = toRange(params);
  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw queryError("Failed to load orders", error);
  }

  const total = count ?? 0;
  const items = await mergeLifecycleMeta(
    (data ?? []).map((row) => toOrder(row as OrderRowWithItems)),
  );
  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/**
 * Merges each order's own `lifecycle_tab` + `active_payment_channel` from
 * `buyer_order_lifecycle` onto the already-fetched `Order`s — lets the
 * buyer `/orders` list render the right per-card action row even in the
 * unfiltered "All" view, not only when a specific tab is selected. Failure
 * is non-fatal (logged, list still renders) — this is a presentational
 * enhancement, not core order data.
 */
async function mergeLifecycleMeta(orders: Order[]): Promise<Order[]> {
  if (orders.length === 0) return orders;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.BUYER_ORDER_LIFECYCLE)
    .select("order_id, lifecycle_tab, active_payment_channel")
    .in(
      "order_id",
      orders.map((order) => order.id),
    );

  if (error) {
    console.error("Failed to load order lifecycle metadata:", error);
    return orders;
  }

  const byId = new Map((data ?? []).map((row) => [row.order_id, row]));
  return orders.map((order) => {
    const meta = byId.get(order.id);
    if (!meta) return order;
    order.lifecycleTab = meta.lifecycle_tab as LifecycleTab;
    order.activePaymentChannel = meta.active_payment_channel as Order["activePaymentChannel"];
    return order;
  });
}

/**
 * Lifecycle-tab-filtered counterpart of `listBuyerOrders`, for the
 * Shopee-style `/orders` tab bar. Two queries rather than one embedded
 * select: `buyer_order_lifecycle` has no FK relationship Supabase's schema
 * cache can embed `order_items`/profiles through. First resolves every
 * order id in this buyer's tab from the view (narrow, two columns, scoped
 * to one buyer — bounded in practice), then runs the real search + sort +
 * pagination + `order_items` embed against `orders` directly, so `count`
 * and paging stay accurate even when `search` is combined with a tab.
 * `active_payment_channel` rides along from the first query and is merged
 * onto each `Order`, so the "To Pay" card never needs a per-order query.
 */
async function listBuyerOrdersByLifecycleTab(
  buyerId: string,
  params: OrderListParams,
  lifecycleTab: LifecycleTab,
): Promise<PaginatedResult<Order>> {
  const supabase = await createSupabaseServerClient();

  const { data: viewRows, error: viewError } = await supabase
    .from(DATABASE_TABLES.BUYER_ORDER_LIFECYCLE)
    .select("order_id, active_payment_channel")
    .eq("buyer_id", buyerId)
    .eq("lifecycle_tab", lifecycleTab);

  if (viewError) {
    throw queryError("Failed to load orders", viewError);
  }

  const orderIds = (viewRows ?? [])
    .map((row) => row.order_id)
    .filter((id): id is string => id !== null);
  if (orderIds.length === 0) {
    return { items: [], total: 0, page: params.page, pageSize: params.pageSize, totalPages: 1 };
  }
  const channelByOrderId = new Map(
    (viewRows ?? []).map((row) => [row.order_id, row.active_payment_channel]),
  );

  let query = supabase
    .from(DATABASE_TABLES.ORDERS)
    .select(ORDER_COLUMNS, { count: "exact" })
    .in("id", orderIds);

  if (params.search) {
    query = query.ilike("order_number", `%${params.search}%`);
  }

  query = query.order("placed_at", { ascending: false });

  const { from, to } = toRange(params);
  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw queryError("Failed to load orders", error);
  }

  const total = count ?? 0;
  const items = (data ?? []).map((row) => {
    const order = toOrder(row as OrderRowWithItems);
    // Every result here already matches `lifecycleTab` by construction
    // (it's the filter itself) — no need to look it up a second time.
    order.lifecycleTab = lifecycleTab;
    order.activePaymentChannel = channelByOrderId.get(order.id) as Order["activePaymentChannel"];
    return order;
  });

  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/**
 * Distinct lifecycle tab(s) for a specific set of just-created orders —
 * lets `placeOrderAction` tell `CheckoutForm` where to redirect without
 * duplicating `buyer_order_lifecycle`'s precedence rules on the client. An
 * id with no matching row (e.g. a query race) is simply omitted.
 *
 * `buyerId` is an explicit app-level ownership filter on top of the view's
 * own RLS (`security_invoker`) — defense-in-depth matching every other
 * buyer-scoped function in this file, even though the current caller
 * (`resolveRedirectTab`) only ever passes order ids the same request just
 * created for the authenticated buyer.
 */
export async function getOrderLifecycleTabs(
  orderIds: string[],
  buyerId: string,
): Promise<Record<string, LifecycleTab>> {
  if (orderIds.length === 0) return {};

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.BUYER_ORDER_LIFECYCLE)
    .select("order_id, lifecycle_tab")
    .eq("buyer_id", buyerId)
    .in("order_id", orderIds);

  if (error) {
    throw queryError("Failed to resolve order status", error);
  }

  return Object.fromEntries(
    (data ?? []).map((row) => [row.order_id, row.lifecycle_tab as LifecycleTab]),
  );
}

/**
 * Per-tab exact counts for the buyer `/orders` tab bar — mirrors
 * `getBuyerOrderSummary`'s existing head-only-count-per-bucket pattern,
 * against `buyer_order_lifecycle` instead of raw `order_status`. "All" isn't
 * included: it's just the unfiltered total `listBuyerOrders` already returns.
 */
export async function getBuyerOrderLifecycleCounts(
  buyerId: string,
): Promise<Record<LifecycleTab, number>> {
  const supabase = await createSupabaseServerClient();

  const counts = await Promise.all(
    ORDER_LIFECYCLE_TABS.map(async (tab) => {
      const { count, error } = await supabase
        .from(DATABASE_TABLES.BUYER_ORDER_LIFECYCLE)
        .select("order_id", { count: "exact", head: true })
        .eq("buyer_id", buyerId)
        .eq("lifecycle_tab", tab);
      return [tab, error ? 0 : (count ?? 0)] as const;
    }),
  );

  return Object.fromEntries(counts) as Record<LifecycleTab, number>;
}

/**
 * Single order by id for the signed-in buyer. Returns null when the order does
 * not belong to this buyer (RLS + the `buyer_id` filter). `cache()`d so the
 * page and its metadata share one fetch per request.
 */
export const getBuyerOrder = cache(
  async (orderId: string, buyerId: string): Promise<Order | null> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from(DATABASE_TABLES.ORDERS)
      .select(ORDER_COLUMNS)
      .eq("id", orderId)
      .eq("buyer_id", buyerId)
      .maybeSingle();

    if (error) {
      throw queryError("Failed to load order", error);
    }

    return data ? toOrder(data as OrderRowWithItems) : null;
  },
);

/**
 * Buyer confirms receipt of one of their own delivered orders — the sole
 * write path for `orders.buyer_confirmed_received_at`. Ownership, the
 * `delivered`-only precondition, and the "only once" rule are all
 * re-enforced inside the `confirm_order_received` RPC (and again by the
 * `enforce_order_update_rules` trigger as defense-in-depth) — this function
 * just calls it.
 */
export async function confirmOrderReceived(orderId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("confirm_order_received", {
    p_order_id: orderId,
  });

  if (error) {
    throw new Error(mapPostgresError(error, "Could not confirm receipt of this order."));
  }
}

/**
 * Overview-hub payload: an exact per-status count (7 head-only queries, no row
 * transfer) plus the 5 most recent orders.
 */
export async function getBuyerOrderSummary(
  buyerId: string,
): Promise<OrderSummary> {
  const supabase = await createSupabaseServerClient();

  const counts = await Promise.all(
    ORDER_STATUS_FLOW.map(async (status) => {
      const { count, error } = await supabase
        .from(DATABASE_TABLES.ORDERS)
        .select("id", { count: "exact", head: true })
        .eq("buyer_id", buyerId)
        .eq("order_status", status);
      return [status, error ? 0 : (count ?? 0)] as const;
    }),
  );

  const statusCounts = Object.fromEntries(counts) as Record<OrderStatus, number>;

  const recent = await listBuyerOrders(buyerId, { page: 1, pageSize: 5 });

  return { statusCounts, recentOrders: recent.items };
}

/**
 * Dashboard equivalent of `getBuyerOrderSummary` — same per-status-count +
 * 5-most-recent shape, but with no manual owner filter: matches
 * `listDashboardOrders`'s existing "RLS is the primary boundary" convention
 * (a seller's rows are scoped to `seller_id = auth.uid()`, an admin sees
 * every order).
 */
export async function getDashboardOrderSummary(): Promise<OrderSummary> {
  const supabase = await createSupabaseServerClient();

  const counts = await Promise.all(
    ORDER_STATUS_FLOW.map(async (status) => {
      const { count, error } = await supabase
        .from(DATABASE_TABLES.ORDERS)
        .select("id", { count: "exact", head: true })
        .eq("order_status", status);
      return [status, error ? 0 : (count ?? 0)] as const;
    }),
  );

  const statusCounts = Object.fromEntries(counts) as Record<OrderStatus, number>;

  const recent = await listDashboardOrders({ page: 1, pageSize: 5 });

  return { statusCounts, recentOrders: recent.items };
}

/**
 * Cancels one of the buyer's own orders. Ownership is enforced by RLS and the
 * `buyer_id` filter; the cancellable-state rule (pending/confirmed) is enforced
 * here because the DB trigger permits a buyer to set `cancelled` from any state.
 */
export async function cancelBuyerOrder(
  orderId: string,
  buyerId: string,
  reason: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: readError } = await supabase
    .from(DATABASE_TABLES.ORDERS)
    .select("order_status")
    .eq("id", orderId)
    .eq("buyer_id", buyerId)
    .maybeSingle();

  if (readError) {
    throw new Error(`Failed to load order: ${readError.message}`);
  }
  if (!existing) {
    throw new Error("Order not found.");
  }
  if (!CANCELLABLE_ORDER_STATUSES.includes(existing.order_status)) {
    throw new Error("This order can no longer be cancelled.");
  }

  const { error } = await supabase
    .from(DATABASE_TABLES.ORDERS)
    .update({
      order_status: ORDER_STATUS.cancelled,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
      cancelled_by: "buyer",
    })
    .eq("id", orderId)
    .eq("buyer_id", buyerId);

  if (error) {
    throw queryError("Failed to cancel order", error);
  }
}

/**
 * Every order visible to the caller for management purposes — no manual
 * seller/admin filtering, matching `listDashboardInventory()`'s "RLS is the
 * primary boundary" pattern: a seller sees their own orders
 * (`seller_id = auth.uid()`), an admin sees every order. Safe to rely on RLS
 * alone here because `orders`' SELECT policy has no public/unscoped clause
 * (unlike `products` — see `listDashboardProducts()`'s owner-filter note).
 */
export async function listDashboardOrders(
  params: OrderListParams,
): Promise<PaginatedResult<Order>> {
  const supabase = await createSupabaseServerClient();

  if (params.attentionOnly) {
    return listDashboardOrdersNeedingAttention(supabase, params);
  }

  let query = supabase
    .from(DATABASE_TABLES.ORDERS)
    .select(ORDER_COLUMNS, { count: "exact" });

  if (params.search) {
    query = query.ilike("order_number", `%${params.search}%`);
  }
  if (params.status) {
    query = query.eq("order_status", params.status);
  }
  if (params.paymentMethod) {
    query = query.eq("payment_method", params.paymentMethod);
  }
  if (params.dateRange) {
    query = query.gte("placed_at", dateRangeBoundary(params.dateRange));
  }
  if (params.shopId) {
    query = query.eq("shop_id", params.shopId);
  }

  query = query.order("placed_at", { ascending: false });

  const { from, to } = toRange(params);
  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw queryError("Failed to load orders", error);
  }

  const total = count ?? 0;
  return {
    items: (data ?? []).map((row) => toOrder(row as OrderRowWithItems)),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/** Converts a dashboard date-range filter into a `placed_at` lower bound. "Today" is midnight UTC — an approximation, not a site-timezone boundary. */
function dateRangeBoundary(range: "today" | "7d" | "30d"): string {
  const now = new Date();
  if (range === "today") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  }
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * "Needs attention" spans two disjoint conditions — pending orders that
 * aren't blocked on an unpaid online payment, and COD orders that are
 * shipped/delivered but the cash hasn't been marked collected — see
 * `isOrderNeedingAttention()`. Expressed as two flat queries OR'd together
 * in application code rather than one nested `and()`-inside-`or()` filter
 * string: PostgREST supports that syntax, but every other filter in this
 * file is a flat `.eq()`/`.or()` chain, and a compound boolean expression is
 * exactly where a hand-written filter string is easiest to get subtly wrong
 * for financial/order data. Each side is capped at `ATTENTION_SCAN_LIMIT` —
 * generous for one seller's (or one admin's) actionable backlog.
 */
const ATTENTION_SCAN_LIMIT = 500;

async function listDashboardOrdersNeedingAttention(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  params: OrderListParams,
): Promise<PaginatedResult<Order>> {
  let needsConfirmation = supabase
    .from(DATABASE_TABLES.ORDERS)
    .select(ORDER_COLUMNS)
    .eq("order_status", ORDER_STATUS.pending)
    .or(`payment_method.eq.cod,payment_status.eq.${PAYMENT_STATUS.paid}`);
  let codAwaitingCollection = supabase
    .from(DATABASE_TABLES.ORDERS)
    .select(ORDER_COLUMNS)
    .eq("payment_method", "cod")
    .eq("payment_status", PAYMENT_STATUS.pending)
    .in("order_status", [ORDER_STATUS.shipped, ORDER_STATUS.delivered]);

  if (params.search) {
    needsConfirmation = needsConfirmation.ilike("order_number", `%${params.search}%`);
    codAwaitingCollection = codAwaitingCollection.ilike("order_number", `%${params.search}%`);
  }
  if (params.paymentMethod) {
    needsConfirmation = needsConfirmation.eq("payment_method", params.paymentMethod);
    codAwaitingCollection = codAwaitingCollection.eq("payment_method", params.paymentMethod);
  }
  if (params.dateRange) {
    const boundary = dateRangeBoundary(params.dateRange);
    needsConfirmation = needsConfirmation.gte("placed_at", boundary);
    codAwaitingCollection = codAwaitingCollection.gte("placed_at", boundary);
  }
  if (params.shopId) {
    needsConfirmation = needsConfirmation.eq("shop_id", params.shopId);
    codAwaitingCollection = codAwaitingCollection.eq("shop_id", params.shopId);
  }

  const [confirmResult, codResult] = await Promise.all([
    needsConfirmation.order("placed_at", { ascending: false }).limit(ATTENTION_SCAN_LIMIT),
    codAwaitingCollection.order("placed_at", { ascending: false }).limit(ATTENTION_SCAN_LIMIT),
  ]);

  if (confirmResult.error) throw queryError("Failed to load orders", confirmResult.error);
  if (codResult.error) throw queryError("Failed to load orders", codResult.error);

  const merged = [...(confirmResult.data ?? []), ...(codResult.data ?? [])]
    .map((row) => toOrder(row as OrderRowWithItems))
    .sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1));

  const total = merged.length;
  const from = (params.page - 1) * params.pageSize;
  return {
    items: merged.slice(from, from + params.pageSize),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/**
 * Exact counts for the dashboard's "Needs attention" summary strip — same
 * two conditions as `listDashboardOrdersNeedingAttention`, but a `head`
 * count-only query instead of fetching rows.
 */
export async function getOrderAttentionCounts(): Promise<{
  needsConfirmation: number;
  codAwaitingCollection: number;
  /**
   * F-10: a refunded return whose item condition (sellable/not-sellable) was
   * never recorded leaves stock permanently un-restored with nothing
   * reminding anyone the step exists. Counts `return_requests` stuck in
   * exactly that state — same head-count pattern as the other two.
   */
  returnsAwaitingRestock: number;
}> {
  const supabase = await createSupabaseServerClient();
  const [confirmResult, codResult, restockResult] = await Promise.all([
    supabase
      .from(DATABASE_TABLES.ORDERS)
      .select("id", { count: "exact", head: true })
      .eq("order_status", ORDER_STATUS.pending)
      .or(`payment_method.eq.cod,payment_status.eq.${PAYMENT_STATUS.paid}`),
    supabase
      .from(DATABASE_TABLES.ORDERS)
      .select("id", { count: "exact", head: true })
      .eq("payment_method", "cod")
      .eq("payment_status", PAYMENT_STATUS.pending)
      .in("order_status", [ORDER_STATUS.shipped, ORDER_STATUS.delivered]),
    supabase
      .from(DATABASE_TABLES.RETURN_REQUESTS)
      .select("id", { count: "exact", head: true })
      .eq("status", RETURN_STATUS.refunded)
      .is("restocked_at", null)
      .is("marked_unsellable_at", null),
  ]);

  if (confirmResult.error) throw queryError("Failed to load order counts", confirmResult.error);
  if (codResult.error) throw queryError("Failed to load order counts", codResult.error);
  if (restockResult.error) throw queryError("Failed to load order counts", restockResult.error);

  return {
    needsConfirmation: confirmResult.count ?? 0,
    codAwaitingCollection: codResult.count ?? 0,
    returnsAwaitingRestock: restockResult.count ?? 0,
  };
}

/**
 * Bulk-export counterpart to `listDashboardOrders` — same filters, no page
 * cap (bounded by `EXPORT_ROW_LIMIT` instead). Kept conservative (rather than
 * a larger "everything matching" number) since some PostgREST deployments
 * cap `.range()` at a configured max-rows value regardless of what's asked
 * for.
 */
const EXPORT_ROW_LIMIT = 1000;

export async function listOrdersForExport(
  params: Omit<OrderListParams, "page" | "pageSize">,
): Promise<Order[]> {
  const result = await listDashboardOrders({ ...params, page: 1, pageSize: EXPORT_ROW_LIMIT });
  return result.items;
}

/**
 * Single order by id for the dashboard (seller/admin) — no ownership filter;
 * RLS alone determines visibility. Kept distinct from `getBuyerOrder`, which
 * deliberately narrows to "orders where I'm the buyer" even though RLS would
 * already scope it — collapsing them would blur that intent.
 */
/**
 * `sellerId`: defense-in-depth beyond RLS, same precedent as `getBuyerOrder`'s
 * explicit `buyer_id` filter — pass the caller's own id for a seller, `null`
 * for an admin (unconditional access, matching RLS's own `is_admin()`
 * bypass). Deliberately just `seller_id`, not `is_shop_member`-aware: orders
 * are intentionally not shop-scoped yet (see the shop-scoping migrations'
 * own "orders are NOT touched here" notes) — this mirrors the existing RLS
 * boundary exactly rather than expanding or narrowing it.
 */
/**
 * `owner`: `null` = admin (no filter, sees every order); otherwise scoped to
 * the caller's own orders OR their shop's orders, matching
 * `listDashboardProducts`'s owner-filter shape — a reassigned shop manager
 * inherits access to the shop's historical orders (attributed to a
 * different, possibly former, seller_id) via the shop_id branch, without
 * rewriting seller_id.
 */
export const getDashboardOrder = cache(
  async (
    orderId: string,
    owner: { sellerId: string; shopId: string | null } | null,
  ): Promise<Order | null> => {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from(DATABASE_TABLES.ORDERS)
      .select(ORDER_COLUMNS)
      .eq("id", orderId);

    if (owner) {
      query = query.or(
        owner.shopId
          ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
          : `seller_id.eq.${owner.sellerId}`,
      );
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw queryError("Failed to load order", error);
    }

    return data ? toOrder(data as OrderRowWithItems) : null;
  },
);

/**
 * Resolves an order's id from its `order_number` (exact match), scoped to the
 * seller/shop for non-admins. Used by the barcode scanner to open the
 * seller's own order after decoding — read-only, returns only the id (never
 * row data), and `null` for a nonexistent OR non-owned order so the caller
 * can show one generic, non-enumerating message. RLS backs the scoping too.
 * `owner`: same shape as `getDashboardOrder`.
 */
export async function getDashboardOrderByNumber(
  orderNumber: string,
  owner: { sellerId: string; shopId: string | null } | null,
): Promise<{ id: string } | null> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from(DATABASE_TABLES.ORDERS)
    .select("id")
    .eq("order_number", orderNumber);

  if (owner) {
    query = query.or(
      owner.shopId
        ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
        : `seller_id.eq.${owner.sellerId}`,
    );
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw queryError("Failed to look up order", error);
  }

  return data ? { id: data.id } : null;
}

/**
 * Advances (or cancels) an order's fulfilment status from the dashboard.
 * Validates the transition against `ORDER_STATUS_TRANSITIONS` — the DB
 * trigger permits the seller/admin to set `order_status` to anything, so this
 * app-level check is the actual forward-flow guard (same shape as
 * `cancelBuyerOrder`'s `CANCELLABLE_ORDER_STATUSES` check). The second
 * `.eq("order_status", currentStatus)` on the write is a cheap optimistic-
 * concurrency guard: 0 rows affected means the status already changed
 * (e.g. a double-click), surfaced as a friendly retry error rather than a
 * silent no-op. Cancelling an order (newStatus = 'cancelled') restocks
 * automatically via the `orders_restock_on_cancel` trigger — no extra code
 * needed here.
 *
 * Forward transitions (anything but 'cancelled') additionally require the
 * order to actually be paid if it's a Xendit order — see the unpaid-Xendit
 * guard below. `orders.payment_status` starts 'pending' for COD orders too
 * (COD is settled on delivery via `mark_cod_payment_collected`), so `<> paid`
 * alone can't distinguish "COD, pay on delivery" from "Xendit attempt still
 * unresolved" — the guard only fires when a `payments` row for this order is
 * actually `payment_method_type = 'xendit'`.
 */
/**
 * `owner`: the caller's own scope for a non-admin request (`null` = admin,
 * no extra filter) — same shape as `getDashboardOrder`'s, letting a
 * reassigned shop manager advance a shop order they didn't originally sell.
 * Defense-in-depth alongside RLS — see the 2026-08-20 audit.
 */
export async function advanceOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  owner: { sellerId: string; shopId: string | null } | null,
  reason?: string,
): Promise<Order> {
  const supabase = await createSupabaseServerClient();

  const ownerFilter = owner
    ? owner.shopId
      ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
      : `seller_id.eq.${owner.sellerId}`
    : null;

  let readQuery = supabase
    .from(DATABASE_TABLES.ORDERS)
    .select("order_status, payment_status")
    .eq("id", orderId);
  if (ownerFilter) readQuery = readQuery.or(ownerFilter);

  const { data: existing, error: readError } = await readQuery.maybeSingle();

  if (readError) {
    throw new Error(`Failed to load order: ${readError.message}`);
  }
  if (!existing) {
    throw new Error("Order not found.");
  }

  const currentStatus = existing.order_status;
  const allowed = ORDER_STATUS_TRANSITIONS[currentStatus];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Cannot move an order from "${getOrderStatusLabel(currentStatus)}" to "${getOrderStatusLabel(newStatus)}".`,
    );
  }

  // Unpaid-Xendit guard: cancellation is exempt (unaffected by this fix), and
  // an already-paid order never needs the extra lookup. Only a forward step
  // on a not-yet-paid order pays the cost of checking whether it's a Xendit
  // order at all.
  if (newStatus !== "cancelled" && existing.payment_status !== "paid") {
    const { data: xenditPayment, error: xenditCheckError } = await supabase
      .from(DATABASE_TABLES.PAYMENTS)
      .select("id")
      .eq("order_id", orderId)
      .eq("payment_method_type", "xendit")
      .limit(1)
      .maybeSingle();

    if (xenditCheckError) {
      throw queryError("Failed to verify payment status", xenditCheckError);
    }
    if (xenditPayment) {
      throw new Error(
        "This order's online payment hasn't been completed yet. It can't be moved forward until the payment succeeds.",
      );
    }
  }

  // Cancelling also records who did it, when, and why — mirrors
  // `cancelBuyerOrder`'s own write shape, now including a reason on this
  // path too (COD workflow audit fix).
  const cancellationFields =
    newStatus === "cancelled"
      ? {
          cancelled_at: new Date().toISOString(),
          cancelled_by: (owner ? "seller" : "admin") as "seller" | "admin",
          cancellation_reason: reason ?? null,
        }
      : {};

  let writeQuery = supabase
    .from(DATABASE_TABLES.ORDERS)
    .update({ order_status: newStatus, ...cancellationFields })
    .eq("id", orderId)
    .eq("order_status", currentStatus);
  if (ownerFilter) writeQuery = writeQuery.or(ownerFilter);

  const { data, error } = await writeQuery.select(ORDER_COLUMNS).maybeSingle();

  if (error) {
    throw queryError("Failed to update order status", error);
  }
  if (!data) {
    throw new Error(
      "This order's status has already changed. Refresh and try again.",
    );
  }

  return toOrder(data as OrderRowWithItems);
}

// ---------------------------------------------------------------------------
// Order shipments (seller fulfillment: manual courier/tracking, one per order)
// ---------------------------------------------------------------------------

/** Maps an `order_shipments` row to the camelCase domain model. */
function toOrderShipment(row: {
  order_id: string;
  courier: string | null;
  tracking_number: string | null;
  packed_at: string | null;
}): OrderShipment {
  return {
    orderId: row.order_id,
    courier: row.courier,
    trackingNumber: row.tracking_number,
    packedAt: row.packed_at,
  };
}

/**
 * The shipment/tracking record for one order, or null if none exists yet
 * (e.g. an older order shipped before this feature, or one not yet packed).
 * RLS scopes visibility to the order's buyer, its seller, or an admin — so
 * this is safe to call from both the buyer and dashboard order-detail pages.
 */
export async function getOrderShipment(
  orderId: string,
): Promise<OrderShipment | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.ORDER_SHIPMENTS)
    .select("order_id, courier, tracking_number, packed_at")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to load shipment details", error);
  }
  if (!data) return null;
  return toOrderShipment(data);
}

/**
 * Records the `packed_at` audit timestamp when the seller verifies items and
 * moves an order To Pack → Ready for Pickup. Upserts on `order_id` (one row
 * per order); RLS restricts writes to the order's seller or an admin. The
 * transition itself is performed separately by `advanceOrderStatus` — this is
 * an advisory audit write only, deliberately not atomic with it. `sellerId`
 * is the order's seller (required to satisfy the insert policy on first pack);
 * for an admin caller, pass the order's seller_id.
 */
export async function markOrderPacked(
  orderId: string,
  sellerId: string | null,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from(DATABASE_TABLES.ORDER_SHIPMENTS)
    .upsert(
      { order_id: orderId, seller_id: sellerId, packed_at: new Date().toISOString() },
      { onConflict: "order_id" },
    );

  if (error) {
    throw queryError("Failed to record packing", error);
  }
}

/**
 * Atomically saves courier + tracking and advances a `processing` order to
 * `shipped`, via the `record_order_shipment` RPC (seller/admin only, ownership
 * + status + payment re-checked inside). Returns the saved shipment.
 */
export async function recordOrderShipment(
  orderId: string,
  courier: string,
  trackingNumber: string,
): Promise<OrderShipment> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_order_shipment", {
    p_order_id: orderId,
    p_courier: courier,
    p_tracking_number: trackingNumber,
  });

  if (error) {
    throw new Error(mapPostgresError(error, "Could not mark this order shipped."));
  }
  return toOrderShipment(data as {
    order_id: string;
    courier: string | null;
    tracking_number: string | null;
    packed_at: string | null;
  });
}

/** One seller-order to create. `shippingAddress` uses the DB's snake_case keys. */
export interface CreateOrderInput {
  sellerId: string;
  items: { productId: string; quantity: number; variantId?: string }[];
  shippingAddress: Json;
  shippingFeeCents: number;
  notes?: string | null;
  /** Durable record of buyer intent, written once at insert time — see `create_order`'s `p_payment_method`. Defaults to `'cod'` server-side when omitted. */
  paymentMethod?: "cod" | "xendit";
  /** Per-checkout-attempt key. A repeat call with the same key (and seller) replays the already-created order instead of creating a duplicate — see `create_order`'s `p_idempotency_key`. */
  idempotencyKey?: string;
}

/**
 * Creates one seller's order via the `create_order` RPC — the only sanctioned
 * order path (`database.md` §3.7). It is atomic (`FOR UPDATE`), re-prices from
 * live `products.price_cents`, decrements stock, and sets `sold` at 0; `buyer_id`
 * always comes from `auth.uid()`. Returns a light handle for the checkout result;
 * RPC errors (e.g. "Only 2 left of X") surface as thrown messages.
 */
export async function createOrder(
  input: CreateOrderInput,
): Promise<{ orderId: string; orderNumber: string; sellerId: string }> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("create_order", {
    p_seller_id: input.sellerId,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      variant_id: item.variantId ?? undefined,
    })),
    p_shipping_address: input.shippingAddress,
    p_shipping_fee_cents: input.shippingFeeCents,
    p_notes: input.notes ?? undefined,
    p_payment_method: input.paymentMethod ?? undefined,
    p_idempotency_key: input.idempotencyKey ?? undefined,
  });

  if (error) {
    // create_order RAISEs curated, user-facing messages ("Only 2 left of …",
    // "Product X is not available") — preserve them; log the raw error.
    throw rpcError("Could not place this order.", error);
  }
  if (!data || !data.seller_id) {
    throw new Error("Could not create the order.");
  }

  return {
    orderId: data.id,
    orderNumber: data.order_number,
    sellerId: data.seller_id,
  };
}

/** One seller's slice of a multi-seller checkout group. */
export interface CreateOrderGroupInput {
  groups: {
    sellerId: string;
    items: { productId: string; quantity: number; variantId?: string }[];
  }[];
  shippingAddress: Json;
  shippingFeeCents: number;
  notes?: string | null;
  /** Durable record of buyer intent, written once at insert time for every order in the group — see `create_order_group`'s `p_payment_method`. Defaults to `'cod'` server-side when omitted. */
  paymentMethod?: "cod" | "xendit";
  /** Per-checkout-attempt key. A repeat call with the same key replays the already-created order batch instead of creating duplicates — see `create_order_group`'s `p_idempotency_key`. */
  idempotencyKey?: string;
}

/**
 * Creates every seller's order for one multi-seller, one-combined-payment
 * checkout via the `create_order_group` RPC. The `checkout_group_id` is
 * minted by the database inside that RPC — never generated here or sent by
 * the client. All-or-nothing: any per-seller failure (stock, pricing) rolls
 * back every order in the batch, unlike the single-seller `createOrder` loop
 * in `placeOrderAction`, which stays partial-success and untouched.
 */
export async function createOrderGroup(
  input: CreateOrderGroupInput,
): Promise<{
  checkoutGroupId: string;
  orders: { orderId: string; orderNumber: string; sellerId: string }[];
}> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("create_order_group", {
    p_groups: input.groups.map((group) => ({
      seller_id: group.sellerId,
      items: group.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        variant_id: item.variantId ?? undefined,
      })),
    })),
    p_shipping_address: input.shippingAddress,
    p_shipping_fee_cents: input.shippingFeeCents,
    p_notes: input.notes ?? undefined,
    p_payment_method: input.paymentMethod ?? undefined,
    p_idempotency_key: input.idempotencyKey ?? undefined,
  });

  if (error) {
    // F-06: carries the failing seller's id (if `create_order_group`
    // identified one) so the caller can attribute a multi-seller rollback
    // to a specific seller instead of one opaque message.
    throw groupOrderError("Could not place this order.", error);
  }
  if (!data || data.length === 0 || !data[0].checkout_group_id) {
    throw new Error("Could not create the order.");
  }

  return {
    checkoutGroupId: data[0].checkout_group_id,
    orders: data.map((order) => {
      if (!order.seller_id) {
        throw new Error("Could not create the order.");
      }
      return {
        orderId: order.id,
        orderNumber: order.order_number,
        sellerId: order.seller_id,
      };
    }),
  };
}

/**
 * Order ids for a checkout group, RLS-scoped to the buyer's own orders —
 * used only to build the post-payment redirect URL back to the confirmation
 * page; ownership for any actual mutation is always re-verified inside the
 * relevant RPC regardless of this list.
 */
export async function getOrderIdsForCheckoutGroup(checkoutGroupId: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.ORDERS)
    .select("id")
    .eq("checkout_group_id", checkoutGroupId);

  if (error) {
    throw queryError("Failed to load checkout group orders", error);
  }
  return (data ?? []).map((row) => row.id);
}

// ============================================================================
// Profile (buyer account)
// ============================================================================

/** Maps a profiles row onto the account domain model. */
function toProfile(
  row: Pick<
    ProfileRow,
    | "id"
    | "full_name"
    | "username"
    | "username_changed_at"
    | "avatar_url"
    | "phone"
    | "gender"
    | "date_of_birth"
    | "bio"
    | "payment_qr_url"
    | "role"
  >,
): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    usernameChangedAt: row.username_changed_at,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    gender: row.gender,
    dateOfBirth: row.date_of_birth,
    bio: row.bio,
    paymentQrUrl: row.payment_qr_url,
    role: row.role,
  };
}

/**
 * The signed-in user's own profile row, including `phone`. Read via the
 * `get_my_profile()` SECURITY DEFINER RPC — the only path to `phone`, because
 * the column is not granted for direct SELECT (audit H1 remediation).
 */
export async function getMyProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_profile");

  if (error) {
    throw queryError("Failed to load profile", error);
  }

  return data ? toProfile(data) : null;
}

/**
 * Updates the signed-in user's own profile. RLS limits the write to their row,
 * the column grant covers these columns, and the `prevent_role_self_escalation`
 * trigger blocks any role tampering.
 */
export async function updateMyProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<Profile> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from(DATABASE_TABLES.PROFILES)
    .update({
      full_name: input.fullName || null,
      username: input.username || null,
      phone: input.phone || null,
      gender: input.gender || null,
      date_of_birth: input.dateOfBirth || null,
      bio: input.bio || null,
    })
    .eq("id", userId);

  if (error) {
    throw new Error(
      mapPostgresError(error, "Failed to update profile. Please try again."),
    );
  }

  // Re-read the authoritative row via the get_my_profile() RPC — the only path
  // that may return `phone`, which is withheld from direct SELECT for
  // authenticated (audit H1). Requesting it from this UPDATE's RETURNING clause
  // would be denied by the same column grant, so the update must not select it.
  const profile = await getMyProfile();
  if (!profile) {
    throw new Error("Failed to load your profile after saving.");
  }
  return profile;
}

function avatarPathFromUrl(url: string): string | undefined {
  return new URL(url).pathname.split("/avatars/")[1];
}

/**
 * Uploads a new avatar to the `avatars` bucket and makes it the caller's
 * `profiles.avatar_url`, then removes the previous file — same
 * upload-first-then-persist-then-cleanup ordering as `replaceShopImage`, so
 * a failure at any step never leaves the profile pointing at a file that
 * was never persisted, or an orphaned file nothing points to.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const supabase = await createSupabaseServerClient();

  const { data: current } = await supabase
    .from(DATABASE_TABLES.PROFILES)
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();
  const previousUrl = current?.avatar_url ?? null;

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    throw queryError("Failed to upload image", uploadError);
  }

  const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
  const newUrl = publicUrlData.publicUrl;

  const { error: updateError } = await supabase
    .from(DATABASE_TABLES.PROFILES)
    .update({ avatar_url: newUrl })
    .eq("id", userId);
  if (updateError) {
    await supabase.storage.from("avatars").remove([path]).catch(() => undefined);
    throw queryError("Failed to update your profile", updateError);
  }

  if (previousUrl) {
    const oldPath = avatarPathFromUrl(previousUrl);
    if (oldPath) {
      await supabase.storage.from("avatars").remove([oldPath]).catch(() => undefined);
    }
  }

  return newUrl;
}

/** Clears the caller's avatar and removes the file from Storage. */
export async function removeAvatar(userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: current } = await supabase
    .from(DATABASE_TABLES.PROFILES)
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();
  const previousUrl = current?.avatar_url ?? null;

  const { error } = await supabase
    .from(DATABASE_TABLES.PROFILES)
    .update({ avatar_url: null })
    .eq("id", userId);
  if (error) {
    throw queryError("Failed to update your profile", error);
  }

  if (previousUrl) {
    const oldPath = avatarPathFromUrl(previousUrl);
    if (oldPath) {
      await supabase.storage.from("avatars").remove([oldPath]).catch(() => undefined);
    }
  }
}

// ============================================================================
// Addresses (buyer saved shipping addresses — Phase 2 checkout improvement)
// ============================================================================

type AddressRow = Database["public"]["Tables"]["addresses"]["Row"];

function toAddress(row: AddressRow): Address {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipient_name,
    phone: row.phone,
    region: row.region,
    province: row.province,
    city: row.city,
    barangay: row.barangay,
    streetDetails: row.street_details,
    postalCode: row.postal_code,
    country: row.country,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ADDRESS_COLUMNS =
  "id, label, recipient_name, phone, region, province, city, barangay, street_details, postal_code, country, is_default, created_at, updated_at";

/**
 * The signed-in buyer's saved addresses, default first then newest. `userId`
 * is passed explicitly by the caller (already resolved via
 * `requireSessionUser()`), matching the rest of this file's buyer-scoped
 * reads (e.g. `listBuyerOrders`) — RLS (`user_id = auth.uid()`) is still the
 * actual enforcement, this is defense in depth, not the boundary itself.
 */
export async function listMyAddresses(userId: string): Promise<Address[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.ADDRESSES)
    .select(ADDRESS_COLUMNS)
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw queryError("Failed to load your addresses", error);
  }
  return (data ?? []).map((row) => toAddress(row as AddressRow));
}

/**
 * Creates a new saved address for the signed-in buyer. A buyer's very first
 * address becomes their default automatically (nothing else to default to);
 * every address after that starts non-default — the buyer must explicitly
 * use `setDefaultAddress` to change it, never an implicit side effect of
 * adding a new one.
 */
export async function createAddress(
  userId: string,
  input: AddressInput,
): Promise<Address> {
  const supabase = await createSupabaseServerClient();

  const { count, error: countError } = await supabase
    .from(DATABASE_TABLES.ADDRESSES)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countError) {
    throw queryError("Failed to save address", countError);
  }

  const { data, error } = await supabase
    .from(DATABASE_TABLES.ADDRESSES)
    .insert({
      user_id: userId,
      label: input.label,
      recipient_name: input.recipientName,
      phone: input.phone,
      region: input.region || null,
      province: input.province || null,
      city: input.city,
      barangay: input.barangay || null,
      street_details: input.streetDetails,
      postal_code: input.postalCode,
      is_default: (count ?? 0) === 0,
    })
    .select(ADDRESS_COLUMNS)
    .single();

  if (error) {
    throw queryError("Failed to save address", error);
  }
  return toAddress(data as AddressRow);
}

/**
 * Updates one of the signed-in buyer's own addresses. Never touches
 * `is_default` — editing an address must never silently change which one is
 * the default; `setDefaultAddress` is the only path for that. RLS scopes the
 * row to `auth.uid()`; the explicit `user_id` filter is defense in depth.
 */
export async function updateAddress(
  userId: string,
  addressId: string,
  input: AddressInput,
): Promise<Address> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.ADDRESSES)
    .update({
      label: input.label,
      recipient_name: input.recipientName,
      phone: input.phone,
      region: input.region || null,
      province: input.province || null,
      city: input.city,
      barangay: input.barangay || null,
      street_details: input.streetDetails,
      postal_code: input.postalCode,
    })
    .eq("id", addressId)
    .eq("user_id", userId)
    .select(ADDRESS_COLUMNS)
    .single();

  if (error) {
    throw queryError("Failed to update address", error);
  }
  return toAddress(data as AddressRow);
}

/** Deletes one of the signed-in buyer's own addresses. */
export async function deleteAddress(userId: string, addressId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from(DATABASE_TABLES.ADDRESSES)
    .delete()
    .eq("id", addressId)
    .eq("user_id", userId);

  if (error) {
    throw queryError("Failed to delete address", error);
  }
}

/**
 * Marks one address as the buyer's default. The `addresses_single_default`
 * trigger atomically unsets any other default for this user in the same
 * statement — no client-side "unset old, then set new" race.
 */
export async function setDefaultAddress(
  userId: string,
  addressId: string,
): Promise<Address> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.ADDRESSES)
    .update({ is_default: true })
    .eq("id", addressId)
    .eq("user_id", userId)
    .select(ADDRESS_COLUMNS)
    .single();

  if (error) {
    throw queryError("Failed to set default address", error);
  }
  return toAddress(data as AddressRow);
}

// ============================================================================
// Buyer Preferences (Privacy & Settings: notifications + default payment method)
// ============================================================================

type BuyerPreferencesRow = Database["public"]["Tables"]["buyer_preferences"]["Row"];

const BUYER_PREFERENCES_COLUMNS =
  "order_updates, promotions, push_enabled, email_enabled, sms_enabled, default_payment_method";

function defaultBuyerPreferences(): BuyerPreferences {
  return {
    orderUpdates: true,
    promotions: true,
    pushEnabled: false,
    emailEnabled: true,
    smsEnabled: false,
    defaultPaymentMethod: null,
  };
}

function toBuyerPreferences(row: BuyerPreferencesRow): BuyerPreferences {
  return {
    orderUpdates: row.order_updates,
    promotions: row.promotions,
    pushEnabled: row.push_enabled,
    emailEnabled: row.email_enabled,
    smsEnabled: row.sms_enabled,
    defaultPaymentMethod: (row.default_payment_method as "cod" | "xendit" | null) ?? null,
  };
}

/**
 * The signed-in buyer's notification/payment-method preferences. A buyer who
 * has never saved a preference has no row yet — that's "use defaults", not
 * an error, so a missing row resolves to `defaultBuyerPreferences()` rather
 * than throwing or auto-creating a row on read.
 */
export async function getMyBuyerPreferences(userId: string): Promise<BuyerPreferences> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.BUYER_PREFERENCES)
    .select(BUYER_PREFERENCES_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to load your preferences", error);
  }
  return data ? toBuyerPreferences(data as BuyerPreferencesRow) : defaultBuyerPreferences();
}

/**
 * Saves one or more of the signed-in buyer's preferences. `upsert` with a
 * partial payload is safe on both branches: the INSERT branch (first save)
 * fills any omitted column from the table's own DEFAULT, and the UPDATE
 * branch (`on conflict (user_id)`) only overwrites the columns present in
 * `input` — an omitted field is never reset to its default on an existing row.
 */
export async function updateMyBuyerPreferences(
  userId: string,
  input: Partial<BuyerPreferences>,
): Promise<BuyerPreferences> {
  const supabase = await createSupabaseServerClient();
  const payload: Database["public"]["Tables"]["buyer_preferences"]["Insert"] = {
    user_id: userId,
  };
  if (input.orderUpdates !== undefined) payload.order_updates = input.orderUpdates;
  if (input.promotions !== undefined) payload.promotions = input.promotions;
  if (input.pushEnabled !== undefined) payload.push_enabled = input.pushEnabled;
  if (input.emailEnabled !== undefined) payload.email_enabled = input.emailEnabled;
  if (input.smsEnabled !== undefined) payload.sms_enabled = input.smsEnabled;
  if (input.defaultPaymentMethod !== undefined) {
    payload.default_payment_method = input.defaultPaymentMethod;
  }

  const { data, error } = await supabase
    .from(DATABASE_TABLES.BUYER_PREFERENCES)
    .upsert(payload, { onConflict: "user_id" })
    .select(BUYER_PREFERENCES_COLUMNS)
    .single();

  if (error) {
    throw queryError("Failed to save your preferences", error);
  }
  return toBuyerPreferences(data as BuyerPreferencesRow);
}

/**
 * Deactivates the signed-in buyer's own account via the
 * `self_deactivate_account` RPC (the sole write path; see that function's
 * comment for why a plain client update can't do this). The RPC itself
 * rejects non-buyer callers and an already-inactive account, so those cases
 * surface as a friendly error here rather than needing a duplicate check.
 */
export async function selfDeactivateAccount(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("self_deactivate_account");

  if (error) {
    throw rpcError("Could not deactivate your account.", error);
  }
}

// ============================================================================
// Payments (COD collection + Xendit Online Payment)
// ============================================================================

type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

/**
 * Payment columns plus the parent order's number and buyer name, for
 * payment-history views. Literal for the same reason as
 * `PRODUCT_COLUMNS`/`ORDER_COLUMNS` — parsed at the type level, must not be
 * interpolated.
 */
/**
 * `order` is joined with `!inner` (not the default left join) so
 * `.ilike("order.order_number", …)` can filter the parent (payments) rows by
 * it — PostgREST only applies an embedded-resource filter to the top-level
 * result set when that embed is an inner join. Every payment row has an
 * order (`payments.order_id` is `NOT NULL`), so this never narrows results
 * on its own.
 */
const PAYMENT_COLUMNS = `
  id, order_id, receipt_path, failure_reason, payment_method_type,
  payment_channel, checkout_url, expires_at, amount_cents,
  currency, status, verified_by, verified_at, created_at,
  xendit_payment_request_id, checkout_group_id,
  order:orders!payments_order_id_fkey!inner (
    order_number,
    buyer:profiles!orders_buyer_id_fkey ( full_name, username )
  )
`;

type PaymentRowWithOrder = PaymentRow & {
  order: {
    order_number: string;
    buyer: Pick<ProfileRow, "full_name" | "username"> | null;
  } | null;
};

function toPayment(row: PaymentRowWithOrder): Payment {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order?.order_number ?? "",
    buyerName: row.order?.buyer?.full_name ?? row.order?.buyer?.username ?? null,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    paymentMethodType: row.payment_method_type,
    paymentChannel: row.payment_channel,
    checkoutUrl: row.checkout_url,
    expiresAt: row.expires_at,
    receiptPath: row.receipt_path,
    failureReason: row.failure_reason,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    xenditPaymentRequestId: row.xendit_payment_request_id,
    checkoutGroupId: row.checkout_group_id,
    createdAt: row.created_at,
  };
}

function toPaymentAttempt(row: PaymentRow): PaymentAttempt {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    paymentMethodType: row.payment_method_type,
    paymentChannel: row.payment_channel,
    amountCents: row.amount_cents,
    currency: row.currency,
    checkoutUrl: row.checkout_url,
    expiresAt: row.expires_at,
    xenditPaymentRequestId: row.xendit_payment_request_id,
    failureReason: row.failure_reason,
    checkoutGroupId: row.checkout_group_id,
    createdAt: row.created_at,
  };
}

/**
 * Idempotently reserves (or reuses) a Xendit payment attempt for an order via
 * the `begin_xendit_payment_attempt` RPC — the sole INSERT path into
 * `payments` for buyers. Re-prices from the order's own total; ownership and
 * pending-status checks happen inside the RPC.
 */
export async function beginXenditPaymentAttempt(
  orderId: string,
  channelCode: "GCASH" | "PAYMAYA" | "CARD",
): Promise<PaymentAttempt> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("begin_xendit_payment_attempt", {
    p_order_id: orderId,
    p_channel_code: channelCode,
  });

  if (error || !data) {
    throw rpcError("Could not start this payment. Please try again.", error);
  }
  return toPaymentAttempt(data as PaymentRow);
}

/**
 * Records Xendit's synchronous response against the exact payment attempt
 * `beginXenditPaymentAttempt` just reserved, via `finalize_xendit_payment_request`
 * — narrowly scoped to that one row (no direct UPDATE grant exists).
 */
export async function finalizeXenditPaymentRequest(input: {
  paymentId: string;
  xenditPaymentRequestId: string;
  checkoutUrl: string;
  expiresAt: string | null;
  status?: "pending" | "failed";
}): Promise<PaymentAttempt> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("finalize_xendit_payment_request", {
    p_payment_id: input.paymentId,
    p_xendit_payment_request_id: input.xenditPaymentRequestId,
    p_checkout_url: input.checkoutUrl,
    p_expires_at: input.expiresAt ?? undefined,
    p_status: input.status ?? "pending",
  });

  if (error || !data) {
    throw rpcError("Could not confirm this payment request.", error);
  }
  return toPaymentAttempt(data as PaymentRow);
}

/**
 * Idempotently reserves (or reuses) a combined Xendit payment attempt for
 * every order in a multi-seller checkout group, via
 * `begin_xendit_group_payment_attempt` — takes only the server-issued
 * `checkoutGroupId`; order ownership and membership are resolved and
 * re-validated entirely inside the RPC, never trusted from the caller.
 */
export async function beginXenditGroupPaymentAttempt(
  checkoutGroupId: string,
  channelCode: "GCASH" | "PAYMAYA" | "CARD",
): Promise<PaymentAttempt> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("begin_xendit_group_payment_attempt", {
    p_checkout_group_id: checkoutGroupId,
    p_channel_code: channelCode,
  });

  if (error || !data) {
    throw rpcError("Could not start this payment. Please try again.", error);
  }
  return toPaymentAttempt(data as PaymentRow);
}

/**
 * Records Xendit's synchronous response against the payment rows sharing
 * `checkoutGroupId` for one specific `channelCode`, via
 * `finalize_xendit_group_payment_request` — scoped so finalizing a Card
 * attempt never touches an abandoned GCash/Maya attempt's rows (or vice
 * versa) when the buyer switched channels without finishing the first one.
 */
export async function finalizeXenditGroupPaymentRequest(input: {
  checkoutGroupId: string;
  channelCode: "GCASH" | "PAYMAYA" | "CARD";
  xenditPaymentRequestId: string;
  checkoutUrl: string;
  expiresAt: string | null;
  status?: "pending" | "failed";
}): Promise<PaymentAttempt> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("finalize_xendit_group_payment_request", {
    p_checkout_group_id: input.checkoutGroupId,
    p_channel_code: input.channelCode,
    p_xendit_payment_request_id: input.xenditPaymentRequestId,
    p_checkout_url: input.checkoutUrl,
    p_expires_at: input.expiresAt ?? undefined,
    p_status: input.status ?? "pending",
  });

  if (error || !data) {
    throw rpcError("Could not confirm this payment request.", error);
  }
  return toPaymentAttempt(data as PaymentRow);
}

/**
 * The authoritative combined amount for a checkout group's specific payment
 * attempt — summed server-side from only that `channelCode`'s still-`pending`
 * payment rows (RLS-scoped to the caller's own orders), never accepted from
 * the client. Scoped by channel so an abandoned attempt on a different
 * channel (the buyer started GCash, then switched to Card without
 * finishing) is never folded into the amount charged, and scoped to
 * `status = 'pending'` so an already-paid sibling's row from an earlier,
 * separate group attempt (see `begin_xendit_group_payment_attempt`'s
 * per-member eligibility) is never folded in either — summing over every
 * historical row would overcharge the buyer by exactly that paid sibling's
 * total. Used immediately before calling Xendit to create the combined
 * payment request/session.
 */
export async function getXenditGroupPaymentTotal(
  checkoutGroupId: string,
  channelCode: "GCASH" | "PAYMAYA" | "CARD",
): Promise<{ amountCents: number; currency: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PAYMENTS)
    .select("amount_cents, currency")
    .eq("checkout_group_id", checkoutGroupId)
    .eq("payment_channel", channelCode)
    .eq("status", "pending");

  if (error) {
    throw queryError("Failed to load payment group total", error);
  }
  if (!data || data.length === 0) {
    throw new Error("Payment group not found.");
  }

  return {
    amountCents: data.reduce((sum, row) => sum + row.amount_cents, 0),
    currency: data[0].currency,
  };
}

/**
 * The most recent finalized-but-unresolved Xendit attempt for this order and
 * channel, if any — regardless of whether it's still within the fix #4
 * staleness window. `hasXenditPaymentAttempt`'s caller (the retry/reconcile
 * flow) decides what "stale" means; this just returns the raw candidate so
 * the action layer can check it with Xendit before letting
 * `beginXenditPaymentAttempt` decide to fabricate a fresh attempt.
 */
export async function getFinalizedPendingXenditPayment(
  orderId: string,
  channelCode: "GCASH" | "PAYMAYA" | "CARD",
): Promise<PaymentAttempt | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PAYMENTS)
    .select("*")
    .eq("order_id", orderId)
    .eq("payment_method_type", "xendit")
    .eq("payment_channel", channelCode)
    .eq("status", "pending")
    .not("xendit_payment_request_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to check for an existing payment attempt", error);
  }
  return data ? toPaymentAttempt(data as PaymentRow) : null;
}

/** Group counterpart of `getFinalizedPendingXenditPayment` — every member row shares one `xendit_payment_request_id`, so any one row represents the whole group's attempt. */
export async function getFinalizedPendingXenditGroupPayment(
  checkoutGroupId: string,
  channelCode: "GCASH" | "PAYMAYA" | "CARD",
): Promise<PaymentAttempt | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PAYMENTS)
    .select("*")
    .eq("checkout_group_id", checkoutGroupId)
    .eq("payment_method_type", "xendit")
    .eq("payment_channel", channelCode)
    .eq("status", "pending")
    .not("xendit_payment_request_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to check for an existing payment attempt", error);
  }
  return data ? toPaymentAttempt(data as PaymentRow) : null;
}

/**
 * Every OTHER channel's still-finalized pending Xendit attempt for this
 * order — unlike `getFinalizedPendingXenditPayment` (scoped to one channel),
 * this backs Checkout's "Change Payment Method" guard: before starting a
 * fresh attempt on a different channel, the caller must confirm no other
 * channel might still resolve successfully on its own. Only rows that
 * actually reached Xendit (`xendit_payment_request_id is not null`) are
 * relevant — a row that never got that far can't resolve independently and
 * is already superseded the moment a new attempt is reserved.
 */
export async function getOtherFinalizedPendingXenditPayments(
  orderId: string,
  excludeChannelCode: "GCASH" | "PAYMAYA" | "CARD",
): Promise<PaymentAttempt[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PAYMENTS)
    .select("*")
    .eq("order_id", orderId)
    .eq("payment_method_type", "xendit")
    .eq("status", "pending")
    .not("xendit_payment_request_id", "is", null)
    .neq("payment_channel", excludeChannelCode)
    .order("created_at", { ascending: false });

  if (error) {
    throw queryError("Failed to check for other in-progress payment attempts", error);
  }
  return (data ?? []).map((row) => toPaymentAttempt(row as PaymentRow));
}

/** Group counterpart of `getOtherFinalizedPendingXenditPayments`. */
export async function getOtherFinalizedPendingXenditGroupPayments(
  checkoutGroupId: string,
  excludeChannelCode: "GCASH" | "PAYMAYA" | "CARD",
): Promise<PaymentAttempt[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PAYMENTS)
    .select("*")
    .eq("checkout_group_id", checkoutGroupId)
    .eq("payment_method_type", "xendit")
    .eq("status", "pending")
    .not("xendit_payment_request_id", "is", null)
    .neq("payment_channel", excludeChannelCode)
    .order("created_at", { ascending: false });

  if (error) {
    throw queryError("Failed to check for other in-progress payment attempts", error);
  }
  return (data ?? []).map((row) => toPaymentAttempt(row as PaymentRow));
}

/**
 * Applies a Xendit status fetched via a synchronous reconciliation check
 * (fix #5A) through the exact same `process_xendit_webhook` RPC the real
 * webhook uses — never duplicates its terminal-state, reference, or amount
 * validation. Uses the admin client because the RPC is service_role-only,
 * same as the webhook route itself; called only from the narrow
 * reconcile-before-replace path in `xendit.actions.ts`, never exposed
 * directly to a client component.
 */
export async function reconcileXenditWebhookStatus(input: {
  referenceId: string;
  xenditPaymentRequestId: string;
  xenditPaymentId: string;
  status: string;
  channelCode: string;
  amountCents: number;
  currency: string;
}): Promise<PaymentAttempt | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("process_xendit_webhook", {
    p_reference_id: input.referenceId,
    p_xendit_payment_request_id: input.xenditPaymentRequestId,
    p_xendit_payment_id: input.xenditPaymentId,
    p_status: input.status,
    p_channel_code: input.channelCode,
    p_amount_cents: input.amountCents,
    p_currency: input.currency,
    p_raw_payload: { source: "reconciliation_check", status: input.status } as Json,
  });

  if (error) {
    throw rpcError("Could not confirm the status of your previous payment attempt.", error);
  }
  return data ? toPaymentAttempt(data as PaymentRow) : null;
}

/** One candidate found by `getFinalizedPendingXenditAttemptsForCancellation` — pairs a payment attempt with the exact id that must be used as `process_xendit_webhook`'s reference (see that function's docs for why single vs. group differ). */
export interface XenditCancellationCandidate {
  referenceId: string;
  channelCode: "GCASH" | "PAYMAYA" | "CARD";
  attempt: PaymentAttempt;
}

/**
 * Fix #5B: every finalized-pending Xendit payment relevant to a possible
 * cancellation of this order — its own rows if single-seller, or every
 * distinct channel's row sharing its `checkout_group_id` if part of a
 * multi-seller group. Staleness is NOT filtered here (this file must not
 * depend on the feature-level `isStaleXenditAttempt` helper — see
 * `src/features/payments/lib/xendit-reconciliation.ts`); the caller decides
 * which candidates are actually stale before reconciling them.
 *
 * `referenceId` matters and differs by shape: a single-order attempt's
 * `reference_id` sent to Xendit was the payment row's own id
 * (`beginXenditPaymentAttempt`'s caller uses `attempt.id`), so each row here
 * carries its own id. A group attempt's `reference_id` was the shared
 * `checkout_group_id` — every member row for one channel represents the
 * *same* combined charge, so they're collapsed to one candidate per channel
 * rather than reconciling the same Xendit payment request multiple times.
 */
/**
 * Shared by `getFinalizedPendingXenditAttemptsForCancellation` and its admin
 * (no-session) counterpart below: collapses raw payment rows into one
 * reconciliation candidate per channel — one row per channel for a single
 * order, or one row per channel across every order sharing a
 * `checkout_group_id` (every member row for one channel represents the same
 * combined charge, so they're never reconciled twice).
 */
function toXenditCancellationCandidates(
  rows: PaymentRow[],
  checkoutGroupId: string | null,
): XenditCancellationCandidate[] {
  if (!checkoutGroupId) {
    return rows
      .filter((row): row is PaymentRow & { payment_channel: string } => row.payment_channel !== null)
      .map((row) => ({
        referenceId: row.id,
        channelCode: row.payment_channel as "GCASH" | "PAYMAYA" | "CARD",
        attempt: toPaymentAttempt(row),
      }));
  }

  const oneRowPerChannel = new Map<string, PaymentRow>();
  for (const row of rows) {
    if (row.payment_channel && !oneRowPerChannel.has(row.payment_channel)) {
      oneRowPerChannel.set(row.payment_channel, row);
    }
  }
  return [...oneRowPerChannel.entries()].map(([channelCode, row]) => ({
    referenceId: checkoutGroupId,
    channelCode: channelCode as "GCASH" | "PAYMAYA" | "CARD",
    attempt: toPaymentAttempt(row),
  }));
}

export async function getFinalizedPendingXenditAttemptsForCancellation(
  orderId: string,
): Promise<XenditCancellationCandidate[]> {
  const supabase = await createSupabaseServerClient();

  const { data: order, error: orderError } = await supabase
    .from(DATABASE_TABLES.ORDERS)
    .select("checkout_group_id")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    throw queryError("Failed to load order", orderError);
  }
  if (!order) return [];

  const baseQuery = supabase
    .from(DATABASE_TABLES.PAYMENTS)
    .select("*")
    .eq("payment_method_type", "xendit")
    .eq("status", "pending")
    .not("xendit_payment_request_id", "is", null);

  const { data, error } = order.checkout_group_id
    ? await baseQuery.eq("checkout_group_id", order.checkout_group_id)
    : await baseQuery.eq("order_id", orderId);

  if (error) {
    throw queryError("Failed to check for existing payment attempts", error);
  }

  return toXenditCancellationCandidates((data ?? []) as PaymentRow[], order.checkout_group_id);
}

/**
 * Same shape as `getFinalizedPendingXenditAttemptsForCancellation`, for the
 * abandoned-order expiry sweep (the xendit-reconciliation cron's second
 * pass) — no authenticated caller exists in that context, so this must use
 * the admin client, same reasoning as `getStaleXenditPaymentsForReconciliationSweep`.
 */
export async function getFinalizedPendingXenditAttemptsForOrderAdmin(
  orderId: string,
  checkoutGroupId: string | null,
): Promise<XenditCancellationCandidate[]> {
  const admin = createSupabaseAdminClient();

  const baseQuery = admin
    .from(DATABASE_TABLES.PAYMENTS)
    .select("*")
    .eq("payment_method_type", "xendit")
    .eq("status", "pending")
    .not("xendit_payment_request_id", "is", null);

  const { data, error } = checkoutGroupId
    ? await baseQuery.eq("checkout_group_id", checkoutGroupId)
    : await baseQuery.eq("order_id", orderId);

  if (error) {
    throw queryError("Failed to check for existing payment attempts", error);
  }

  return toXenditCancellationCandidates((data ?? []) as PaymentRow[], checkoutGroupId);
}

export interface AbandonedXenditOrderCandidate {
  orderId: string;
  orderNumber: string;
  checkoutGroupId: string | null;
}

/**
 * TD-9: orders placed with `payment_method = 'xendit'`, still `order_status
 * = 'pending'` (the only status an unpaid Xendit order can ever be in —
 * `advanceOrderStatus` refuses to move it forward while unpaid), and
 * `payment_status` still `pending`/`failed`, past the abandonment
 * threshold — the "buyer never returned to retry or cancel" case. Includes
 * orders that never even reached Xendit (no `payments` row at all), which
 * `getStaleXenditPaymentsForReconciliationSweep` can't see since it only
 * reads rows with a real `xendit_payment_request_id`.
 */
export async function getAbandonedXenditOrdersForExpiry(
  thresholdHours: number,
  fetchLimit: number,
): Promise<AbandonedXenditOrderCandidate[]> {
  const admin = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from(DATABASE_TABLES.ORDERS)
    .select("id, order_number, checkout_group_id")
    .eq("payment_method", "xendit")
    .eq("order_status", "pending")
    .in("payment_status", ["pending", "failed"])
    .lte("placed_at", cutoff)
    .order("placed_at", { ascending: true })
    .limit(fetchLimit);

  if (error) {
    throw queryError("Failed to load abandoned Xendit orders for expiry", error);
  }

  return (data ?? []).map((row) => ({
    orderId: row.id,
    orderNumber: row.order_number,
    checkoutGroupId: row.checkout_group_id,
  }));
}

/**
 * System-actor cancellation of an abandoned, unpaid Xendit order — the sole
 * write path for the auto-expiry sweep. Calls `expire_unpaid_xendit_order`,
 * which re-derives every precondition itself (still pending, still unpaid,
 * still Xendit, actually past the threshold) rather than trusting the
 * caller; this function is not the authorization boundary, the RPC is.
 * `orders_restock_on_cancel` fires exactly as it does for a buyer/seller/
 * admin cancellation — same trigger, no parallel restock path.
 */
export async function expireAbandonedXenditOrder(orderId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("expire_unpaid_xendit_order", {
    p_order_id: orderId,
  });

  if (error) {
    throw rpcError("Could not auto-cancel this abandoned order.", error);
  }
}

/** Same shape as `XenditCancellationCandidate` — named separately because it's produced system-wide for the passive reconciliation sweep (phase #4A), not for one specific order/group's cancellation check. */
export interface XenditReconciliationCandidate {
  referenceId: string;
  channelCode: "GCASH" | "PAYMAYA" | "CARD";
  attempt: PaymentAttempt;
}

/**
 * Phase #4A: every finalized-pending Xendit payment across the whole system,
 * for the passive reconciliation sweep's cron route — NOT scoped to any one
 * user, so (unlike `getFinalizedPendingXenditAttemptsForCancellation`) this
 * must use the admin client; there is no authenticated caller whose RLS
 * scope would otherwise limit the read. `fetchLimit` bounds the raw row
 * fetch (oldest first, most likely stale); the caller is still responsible
 * for filtering by `isStaleXenditAttempt` and capping the batch it actually
 * reconciles — this function only avoids scanning the whole table.
 *
 * Same single-vs-group `referenceId` rule as the cancellation candidate
 * function: a single order's own payment row id, or the shared
 * `checkout_group_id` for a combined multi-seller payment (deduplicated to
 * one candidate per group+channel, since every member row represents the
 * same underlying Xendit charge).
 */
export async function getStaleXenditPaymentsForReconciliationSweep(
  fetchLimit: number,
): Promise<XenditReconciliationCandidate[]> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from(DATABASE_TABLES.PAYMENTS)
    .select("*")
    .eq("payment_method_type", "xendit")
    .eq("status", "pending")
    .not("xendit_payment_request_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(fetchLimit);

  if (error) {
    throw queryError("Failed to load pending payments for reconciliation sweep", error);
  }

  const rows = (data ?? []) as PaymentRow[];
  const singleRows = rows.filter((row) => !row.checkout_group_id);
  const groupRows = rows.filter((row) => row.checkout_group_id);

  const candidates: XenditReconciliationCandidate[] = singleRows
    .filter((row): row is PaymentRow & { payment_channel: string } => row.payment_channel !== null)
    .map((row) => ({
      referenceId: row.id,
      channelCode: row.payment_channel as "GCASH" | "PAYMAYA" | "CARD",
      attempt: toPaymentAttempt(row),
    }));

  const oneRowPerGroupChannel = new Map<string, PaymentRow>();
  for (const row of groupRows) {
    if (!row.payment_channel || !row.checkout_group_id) continue;
    const key = `${row.checkout_group_id}:${row.payment_channel}`;
    if (!oneRowPerGroupChannel.has(key)) {
      oneRowPerGroupChannel.set(key, row);
    }
  }
  for (const row of oneRowPerGroupChannel.values()) {
    candidates.push({
      referenceId: row.checkout_group_id as string,
      channelCode: row.payment_channel as "GCASH" | "PAYMAYA" | "CARD",
      attempt: toPaymentAttempt(row),
    });
  }

  return candidates;
}

/**
 * Seller (of the order) or admin marks a COD order's cash as collected via
 * the `mark_cod_payment_collected` RPC — the sole path by which a COD
 * `orders.payment_status` ever becomes `paid` (never at order creation).
 * Writes a real `payments` row so COD collections appear in the same ledger
 * as Xendit payments.
 */
export async function markCodPaymentCollected(orderId: string): Promise<PaymentAttempt> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("mark_cod_payment_collected", {
    p_order_id: orderId,
  });

  if (error || !data) {
    throw rpcError("Could not mark this payment as collected.", error);
  }
  return toPaymentAttempt(data as PaymentRow);
}

/**
 * Short-lived signed URL for a legacy QR receipt image — the bucket is
 * private, so there is no public URL to store or render directly. Read-only:
 * no new receipts are ever created; this only serves historical orders.
 */
export async function getPaymentReceiptSignedUrl(path: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from("payment-receipts")
    .createSignedUrl(path, 60 * 10);

  if (error || !data) {
    throw new Error(`Failed to load receipt: ${error?.message ?? "unknown error"}`);
  }
  return data.signedUrl;
}

/**
 * Paginated/filtered payment history for the Seller/Admin dashboard. No
 * manual `seller_id` filtering here — RLS alone restricts visible rows to
 * the caller's own orders-as-seller, or all rows for an admin (same "RLS is
 * the primary boundary" pattern as everywhere else in this file). Xendit
 * payments settle themselves via webhook — nothing here requires manual
 * action, unlike the retired QR verification queue.
 *
 * `staleOnly` (Admin-only) narrows to still-pending Xendit attempts older
 * than a fixed 30-minute fallback window — a conservative proxy for
 * `isStaleXenditAttempt()`'s real per-row logic (which also considers each
 * attempt's own `expiresAt`). PostgREST filters compare a column against a
 * literal, not another column, so the exact per-row check isn't expressible
 * here; the row's own "stale" badge in the UI still uses the precise
 * `isStaleXenditAttempt()` — this filter only narrows the SQL query and may
 * occasionally disagree with that badge at the margin.
 */
export async function listPaymentHistory(
  params: DashboardPaymentListParams,
): Promise<PaginatedResult<Payment>> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from(DATABASE_TABLES.PAYMENTS)
    .select(PAYMENT_COLUMNS, { count: "exact" });

  if (params.search) {
    const term = params.search.replace(/[,()]/g, " ").trim();
    if (term) query = query.ilike("order.order_number", `%${term}%`);
  }
  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.paymentMethodType) {
    query = query.eq("payment_method_type", params.paymentMethodType);
  }
  if (params.staleOnly) {
    const staleBoundary = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    query = query
      .eq("payment_method_type", "xendit")
      .eq("status", PAYMENT_STATUS.pending)
      .not("xendit_payment_request_id", "is", null)
      .lt("created_at", staleBoundary);
  }

  query = query.order("created_at", { ascending: false });

  const { from, to } = toRange(params);
  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw queryError("Failed to load payment history", error);
  }

  const total = count ?? 0;
  return {
    items: (data ?? []).map((row) => toPayment(row as PaymentRowWithOrder)),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/**
 * Exact count for the Admin Payments dashboard's "Needs reconciliation"
 * summary strip — same conservative 30-minute proxy `listPaymentHistory`'s
 * `staleOnly` filter uses, see its doc comment.
 */
export async function getStalePaymentCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const staleBoundary = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from(DATABASE_TABLES.PAYMENTS)
    .select("id", { count: "exact", head: true })
    .eq("payment_method_type", "xendit")
    .eq("status", PAYMENT_STATUS.pending)
    .not("xendit_payment_request_id", "is", null)
    .lt("created_at", staleBoundary);

  if (error) throw queryError("Failed to load payment counts", error);
  return count ?? 0;
}

/** Bulk-export counterpart to `listPaymentHistory` — same filters, no page cap. */
export async function listPaymentsForExport(
  params: Omit<DashboardPaymentListParams, "page" | "pageSize">,
): Promise<Payment[]> {
  const result = await listPaymentHistory({ ...params, page: 1, pageSize: EXPORT_ROW_LIMIT });
  return result.items;
}

// ============================================================================
// Returns & Refunds
// ============================================================================

/**
 * Literal for the same reason as `PRODUCT_COLUMNS`/`PAYMENT_COLUMNS` —
 * Supabase's generated types parse embedded-resource joins at the type
 * level. `buyer` is joined directly off `return_requests.buyer_id` (not via
 * `orders`) since the row already carries its own snapshot of who filed it.
 */
const RETURN_REQUEST_COLUMNS = `
  id, order_id, order_item_id, buyer_id, seller_id, reason, evidence_path, status,
  seller_decision_note, seller_decided_at, seller_decided_by,
  admin_decision_note, admin_decided_at, admin_decided_by,
  refund_amount_cents, restocked_at, marked_unsellable_at, condition_note, created_at, updated_at,
  order:orders!return_requests_order_id_fkey ( order_number, currency ),
  buyer:profiles!return_requests_buyer_id_fkey ( full_name, username ),
  order_item:order_items!return_requests_order_item_id_fkey ( product_title )
`;

type ReturnRequestRow = Database["public"]["Tables"]["return_requests"]["Row"];
type ReturnRequestRowWithJoins = ReturnRequestRow & {
  order: { order_number: string; currency: string } | null;
  buyer: Pick<ProfileRow, "full_name" | "username"> | null;
  order_item: { product_title: string } | null;
};

function toReturnRequest(row: ReturnRequestRowWithJoins): ReturnRequest {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order?.order_number ?? "",
    currency: row.order?.currency ?? "PHP",
    orderItemId: row.order_item_id,
    orderItemTitle: row.order_item?.product_title ?? null,
    buyerId: row.buyer_id,
    buyerName: row.buyer?.full_name ?? row.buyer?.username ?? null,
    sellerId: row.seller_id,
    reason: row.reason,
    evidencePath: row.evidence_path,
    status: row.status,
    sellerDecisionNote: row.seller_decision_note,
    sellerDecidedAt: row.seller_decided_at,
    adminDecisionNote: row.admin_decision_note,
    adminDecidedAt: row.admin_decided_at,
    refundAmountCents: row.refund_amount_cents,
    restockedAt: row.restocked_at,
    markedUnsellableAt: row.marked_unsellable_at,
    conditionNote: row.condition_note,
    createdAt: row.created_at,
  };
}

/**
 * Uploads a return's evidence photo to the `payment-receipts` bucket —
 * private, RLS-gated by order ownership, the same scoping shape a return
 * request itself needs (see the migration's comment for why this bucket is
 * reused rather than a new one). `return-` prefix keeps it visually
 * distinguishable from an actual payment receipt in the same folder.
 */
export async function uploadReturnEvidence(
  orderId: string,
  file: File,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${orderId}/return-${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("payment-receipts")
    .upload(path, file, { contentType: file.type });

  if (error) {
    throw queryError("Failed to upload evidence photo", error);
  }
  return path;
}

/** Signed URL for a return's evidence photo — mirrors `getPaymentReceiptSignedUrl`. */
export async function getReturnEvidenceSignedUrl(path: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from("payment-receipts")
    .createSignedUrl(path, 60 * 10);

  if (error || !data) {
    throw new Error(`Failed to load evidence photo: ${error?.message ?? "unknown error"}`);
  }
  return data.signedUrl;
}

/**
 * Buyer-only: opens a return/refund request via the `request_return` RPC —
 * the sole write path (no direct INSERT grant on `return_requests`).
 * Ownership, order status, and duplicate-request checks all happen inside
 * the RPC itself.
 */
export async function requestReturn(
  orderId: string,
  orderItemId: string | null,
  reason: string,
  evidencePath: string | null,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_return", {
    p_order_id: orderId,
    p_order_item_id: orderItemId ?? undefined,
    p_reason: reason,
    p_evidence_path: evidencePath ?? undefined,
  });

  if (error) {
    throw new Error(mapPostgresError(error, "Could not submit your return request."));
  }
}

/**
 * The order's own seller, or admin, accepts/rejects a pending return
 * request via the `respond_to_return` RPC — the sole write path. Ownership
 * and state-transition checks happen inside the RPC.
 */
export async function respondToReturn(
  returnId: string,
  decision: SellerReturnDecision,
  note: string | null,
): Promise<{ orderId: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("respond_to_return", {
    p_return_id: returnId,
    p_decision: decision,
    p_note: note ?? undefined,
  });

  if (error) {
    throw new Error(mapPostgresError(error, "Could not respond to this return request."));
  }
  return { orderId: (data as { order_id: string }).order_id };
}

/**
 * Admin-only: approves or rejects a return request via the `decide_return`
 * RPC. For a COD (or retired legacy) payment this immediately finalizes to
 * `refunded`/`partially_refunded`, exactly as before. For a Xendit payment,
 * approving only submits a pending refund attempt (row in `xendit_refunds`)
 * — the caller must follow up with `getPendingXenditRefundForReturn` to
 * check whether one was created and needs to actually be sent to Xendit.
 * State-transition and duplicate-refund checks happen inside the RPC.
 */
export async function decideReturn(
  returnId: string,
  decision: AdminReturnDecision,
  note: string | null,
): Promise<{ orderId: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("decide_return", {
    p_return_id: returnId,
    p_decision: decision,
    p_note: note ?? undefined,
  });

  if (error) {
    throw new Error(mapPostgresError(error, "Could not decide this return request."));
  }
  return { orderId: (data as { order_id: string }).order_id };
}

/**
 * The order's own seller (or shop member) or an admin records whether a
 * refunded return's item is actually sellable — the sole write path for
 * `return_requests.restocked_at`/`marked_unsellable_at`. Only 'sellable'
 * restocks inventory (via `record_return_item_condition`'s own
 * `restock_on_order_cancel`-mirrored logic); 'not_sellable' just closes out
 * the step. Deliberately a separate step from `decideReturn` — restocking
 * does not happen automatically on refund approval.
 */
export async function recordReturnItemCondition(
  returnId: string,
  condition: ReturnItemCondition,
  note: string | null,
): Promise<{ orderId: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_return_item_condition", {
    p_return_id: returnId,
    p_condition: condition,
    p_note: note ?? undefined,
  });

  if (error) {
    throw new Error(mapPostgresError(error, "Could not record this item's condition."));
  }
  return { orderId: (data as { order_id: string }).order_id };
}

/**
 * Phase 5B: the most recent still-`pending` Xendit refund attempt for a
 * return request, or null. Two uses: (1) `decideReturnAction` calls this
 * right after `decideReturn` to find out whether a refund now needs to be
 * submitted to Xendit; (2) the UI calls this to show "refund submitted,
 * awaiting confirmation" instead of silently looking like nothing happened
 * — `return_requests.status` deliberately doesn't change until the webhook
 * confirms, so this is the explicit "still pending" signal.
 */
export async function getPendingXenditRefundForReturn(
  returnRequestId: string,
): Promise<PendingXenditRefund | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.XENDIT_REFUNDS)
    .select("id, xendit_payment_request_id, amount_cents, currency")
    .eq("return_request_id", returnRequestId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to check for a pending refund", error);
  }
  if (!data) return null;

  return {
    id: data.id,
    xenditPaymentRequestId: data.xendit_payment_request_id,
    amountCents: data.amount_cents,
    currency: data.currency,
  };
}

/**
 * Records Xendit's synchronous response to the refund submission (id + raw
 * body) via the `record_xendit_refund_submission` RPC. Never changes the
 * attempt's status away from `pending` — only `process_xendit_refund_webhook`
 * (triggered by the real `refund.succeeded`/`refund.failed` webhook) does
 * that, so a "SUCCEEDED" synchronous response is never trusted here.
 */
export async function recordXenditRefundSubmission(
  refundId: string,
  xenditRefundId: string,
  rawResponse: Json,
): Promise<void> {
  // The admin's own authenticated session, not the service-role client —
  // record_xendit_refund_submission re-derives is_admin() from auth.uid(),
  // which is null under the admin client (no session context at all).
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_xendit_refund_submission", {
    p_refund_id: refundId,
    p_xendit_refund_id: xenditRefundId,
    p_raw_response: rawResponse,
  });

  if (error) {
    throw rpcError("Could not record the refund submission.", error);
  }
}

/**
 * The outbound call to Xendit itself failed (no refund id was ever
 * returned) — marks the attempt `failed` immediately via
 * `fail_xendit_refund_submission` so the admin can safely retry. Nothing on
 * `return_requests`/`payments`/`orders` needs reverting: `decide_return`
 * never moved them in the first place.
 */
export async function failXenditRefundSubmission(
  refundId: string,
  errorNote: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("fail_xendit_refund_submission", {
    p_refund_id: refundId,
    p_error_note: errorNote,
  });

  if (error) {
    throw rpcError("Could not record the refund failure.", error);
  }
}

/**
 * Most recent return request for an order (optionally scoped to one line
 * item), or null — used by the buyer's and seller's order-detail pages to
 * show status/hide the "Request Return" action rather than a separate
 * existence check. RLS alone restricts visible rows (buyer/seller/admin of
 * that request), matching the "no manual filter" pattern used throughout
 * this file.
 */
export async function getReturnRequestForOrder(
  orderId: string,
  orderItemId: string | null = null,
): Promise<ReturnRequest | null> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from(DATABASE_TABLES.RETURN_REQUESTS)
    .select(RETURN_REQUEST_COLUMNS)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1);

  query = orderItemId ? query.eq("order_item_id", orderItemId) : query.is("order_item_id", null);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw queryError("Failed to load return request", error);
  }
  return data ? toReturnRequest(data as ReturnRequestRowWithJoins) : null;
}

/**
 * Every return request visible to the caller, newest first, optionally
 * filtered by status — powers the admin Returns & Refunds queue. No manual
 * `seller_id`/`buyer_id` filtering: RLS alone scopes visible rows (buyer's
 * own, seller's own-shop's, or all for admin), the same "RLS is the primary
 * boundary" pattern as `listPaymentHistory`/`listDashboardOrders`.
 */
export async function listReturnRequests(status?: ReturnStatus): Promise<ReturnRequest[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from(DATABASE_TABLES.RETURN_REQUESTS)
    .select(RETURN_REQUEST_COLUMNS)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw queryError("Failed to load return requests", error);
  }
  return (data ?? []).map((row) => toReturnRequest(row as ReturnRequestRowWithJoins));
}

// ============================================================================
// Audit Log
// ============================================================================

const ADMIN_ACTION_LOG_COLUMNS = `
  id, actor_id, action, target_user_id, target_shop_id, metadata, created_at,
  actor:profiles!admin_action_log_actor_id_fkey ( full_name, username ),
  target_user:profiles!admin_action_log_target_user_id_fkey ( full_name, username ),
  target_shop:shops!admin_action_log_target_shop_id_fkey ( name )
`;

type AdminActionLogRow = Database["public"]["Tables"]["admin_action_log"]["Row"];
type AdminActionLogRowWithJoins = AdminActionLogRow & {
  actor: Pick<ProfileRow, "full_name" | "username"> | null;
  target_user: Pick<ProfileRow, "full_name" | "username"> | null;
  target_shop: { name: string } | null;
};

function toAdminActionLogEntry(row: AdminActionLogRowWithJoins): AdminActionLogEntry {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor?.full_name ?? row.actor?.username ?? null,
    action: row.action,
    targetUserId: row.target_user_id,
    targetUserName: row.target_user?.full_name ?? row.target_user?.username ?? null,
    targetShopId: row.target_shop_id,
    targetShopName: row.target_shop?.name ?? null,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.created_at,
  };
}

/**
 * Every logged high-stakes admin action, newest first — admin-only (RLS
 * already gates SELECT to `is_admin()`, matching the "no manual filter"
 * pattern elsewhere in this file). Deliberately narrow: only whatever the
 * opted-in RPCs actually write (`admin_assign_seller_shop`,
 * `admin_demote_seller_to_buyer`, `admin_set_user_active`, `decide_return`)
 * — this reads what exists, it is not a place to add retroactive logging
 * for unrelated actions.
 *
 * L3: paginated + optionally filtered by `action`, mirroring
 * `listDashboardOrders`'s exact shape (`{ count: "exact" }` + `.range()`).
 * Ordering (`created_at desc`) and the underlying records are unchanged —
 * only how much of the list is fetched at once.
 */
export async function listAdminActionLog(
  params: PaginationParams & { action?: string },
): Promise<PaginatedResult<AdminActionLogEntry>> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from(DATABASE_TABLES.ADMIN_ACTION_LOG)
    .select(ADMIN_ACTION_LOG_COLUMNS, { count: "exact" });

  if (params.action) {
    query = query.eq("action", params.action);
  }

  query = query.order("created_at", { ascending: false });

  const { from, to } = toRange(params);
  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw queryError("Failed to load audit log", error);
  }

  const total = count ?? 0;
  return {
    items: (data ?? []).map((row) => toAdminActionLogEntry(row as AdminActionLogRowWithJoins)),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

// ============================================================================
// Shops
// ============================================================================

type ShopRow = Database["public"]["Tables"]["shops"]["Row"];

/** Full column list for every read that maps through `toShop` — keeping this
 * in one place means widening `Shop` (e.g. adding a branding field) can never
 * silently omit a column from an individual `.select()` call. */
const SHOP_COLUMNS =
  "id, name, slug, active, created_at, updated_at, logo_url, banner_url, description";

function toShop(row: ShopRow): Shop {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    logoUrl: row.logo_url,
    bannerUrl: row.banner_url,
    description: row.description,
  };
}

/**
 * Shops visible to the caller. No manual membership filtering here — RLS
 * alone restricts visible rows to the caller's own shop(s) via
 * `is_shop_member()`, or every shop for an admin (same "RLS is the primary
 * boundary" pattern as `listPaymentHistory`).
 */
export async function listShops(): Promise<Shop[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.SHOPS)
    .select(SHOP_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) {
    throw queryError("Failed to load shops", error);
  }

  // Natural-sort by name (not insertion order) so every shop picker that
  // consumes this list — product filters, reports, admin shop assignment —
  // shows shops in a stable, human-expected order.
  return (data ?? [])
    .map((row) => toShop(row as ShopRow))
    .sort((a, b) => compareNatural(a.name, b.name));
}

/** Single shop by id, or null if it doesn't exist / isn't visible to the
 * caller under RLS (e.g. an inactive shop to a guest). Used by the buyer
 * catalog's shop-branding header and the seller "My Shop" page. */
export async function getShopById(shopId: string): Promise<Shop | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.SHOPS)
    .select(SHOP_COLUMNS)
    .eq("id", shopId)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to load shop", error);
  }
  return data ? toShop(data as ShopRow) : null;
}

type ShopMembershipRow = {
  seller_id: string;
  shop_id: string;
  shop_name: string;
};

/**
 * Resolves real shop identity for buyer-facing product surfaces via the
 * `resolve_shop_membership` RPC — `products.shop_id` is unpopulated on every
 * live row (TD-1), and `shop_users` (the table that actually holds this
 * mapping) is member/admin-only RLS, so a buyer/guest cannot read it
 * directly (see the RPC's migration comment). Returns a `sellerId ->
 * shopName` map; empty input short-circuits without a round trip.
 */
export async function getShopNamesBySellerIds(
  sellerIds: string[],
): Promise<Map<string, string>> {
  if (sellerIds.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_shop_membership", {
    p_seller_ids: sellerIds,
  });

  if (error) {
    throw queryError("Failed to resolve shop names", error);
  }
  return new Map(
    ((data ?? []) as ShopMembershipRow[]).map((row) => [
      row.seller_id,
      row.shop_name,
    ]),
  );
}

/**
 * Like `getShopNamesBySellerIds`, but also returns each seller's `shop_id` —
 * for "View Shop" links that need to filter `/products?shopId=` rather than
 * just display a name. Same RPC, same empty-input short-circuit; kept as a
 * separate function rather than widening `getShopNamesBySellerIds`'s return
 * shape, so its existing callers are unaffected.
 */
export async function getShopMembershipBySellerIds(
  sellerIds: string[],
): Promise<Map<string, { shopId: string; shopName: string }>> {
  if (sellerIds.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_shop_membership", {
    p_seller_ids: sellerIds,
  });

  if (error) {
    throw queryError("Failed to resolve shop membership", error);
  }
  return new Map(
    ((data ?? []) as ShopMembershipRow[]).map((row) => [
      row.seller_id,
      { shopId: row.shop_id, shopName: row.shop_name },
    ]),
  );
}

/** Every seller id belonging to one shop — used to filter the catalog by shop. */
export async function getShopSellerIds(shopId: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_shop_membership", {
    p_shop_ids: [shopId],
  });

  if (error) {
    throw queryError("Failed to resolve shop members", error);
  }
  return ((data ?? []) as ShopMembershipRow[]).map((row) => row.seller_id);
}

export interface FeaturedShopView {
  id: string;
  name: string;
  slug: string;
  productCount: number;
  /** Real, seller-uploaded logo — null renders the existing letter-avatar
   * fallback. Never fabricated. */
  logoUrl: string | null;
}

/**
 * Active shops with a real active-product count, for the homepage's Featured
 * Shops carousel. Composed from two already-public reads (`listShops`,
 * `resolve_shop_membership`) plus one lightweight `products` read — no new
 * RPC beyond `resolve_shop_membership`. Which shops qualify as "featured" is
 * still ranked by active-product count — unaffected by shop branding, only
 * real product activity decides placement — but the final, already-selected
 * set is then natural-sorted by name for a stable display order.
 */
export async function getFeaturedShops(limit = 4): Promise<FeaturedShopView[]> {
  const shops = await listShops();
  if (shops.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  const [membershipResult, productsResult] = await Promise.all([
    supabase.rpc("resolve_shop_membership", {
      p_shop_ids: shops.map((shop) => shop.id),
    }),
    supabase
      .from(DATABASE_TABLES.PRODUCTS)
      .select("seller_id")
      .eq("status", PRODUCT_STATUS.active),
  ]);

  if (membershipResult.error) {
    throw new Error(
      `Failed to resolve shop members: ${membershipResult.error.message}`,
    );
  }
  if (productsResult.error) {
    throw new Error(
      `Failed to count shop products: ${productsResult.error.message}`,
    );
  }

  const countsBySeller = new Map<string, number>();
  for (const row of productsResult.data ?? []) {
    // A product whose seller account has since been permanently deleted has
    // no shop_users membership left to attribute it to — skip it here.
    if (!row.seller_id) continue;
    countsBySeller.set(
      row.seller_id,
      (countsBySeller.get(row.seller_id) ?? 0) + 1,
    );
  }

  const countsByShop = new Map<string, number>();
  for (const row of (membershipResult.data ?? []) as ShopMembershipRow[]) {
    const current = countsByShop.get(row.shop_id) ?? 0;
    countsByShop.set(
      row.shop_id,
      current + (countsBySeller.get(row.seller_id) ?? 0),
    );
  }

  return shops
    .map((shop) => ({
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      productCount: countsByShop.get(shop.id) ?? 0,
      logoUrl: shop.logoUrl,
    }))
    .sort((a, b) => b.productCount - a.productCount)
    .slice(0, limit)
    .sort((a, b) => compareNatural(a.name, b.name));
}

/** Payload for creating a shop — `slug` is always server-derived from `name`, never client-submitted. */
export interface CreateShopInput {
  name: string;
}

/** Admin-only: creates a shop. RLS (`is_admin()`) is the authorization boundary — no RPC needed, unlike cross-user writes. */
export async function createShop(input: CreateShopInput): Promise<Shop> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.SHOPS)
    .insert({
      name: input.name,
      slug: `${slugify(input.name)}-${Date.now().toString(36)}`,
    })
    .select(SHOP_COLUMNS)
    .single();

  if (error) {
    throw new Error(mapPostgresError(error, "Failed to create shop."));
  }

  return toShop(data as ShopRow);
}

/** Payload for editing a shop's name and/or active status. */
export interface UpdateShopInput {
  id: string;
  name?: string;
  active?: boolean;
}

/**
 * Admin-only: edits a shop's name/active status, via the `admin_update_shop`
 * RPC — the sole write path for those columns. `shops`' UPDATE grant to
 * `authenticated` is scoped to description/logo_url/banner_url only (a
 * seller's own-row RLS policy is row-level, not column-level, so the grant
 * is what actually keeps a seller from writing name/active/slug); a plain
 * client `.update()` call here would be silently rejected by Postgres for
 * these columns regardless of RLS.
 */
export async function updateShop(input: UpdateShopInput): Promise<Shop> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_update_shop", {
    p_shop_id: input.id,
    p_name: input.name,
    p_active: input.active,
  });

  if (error) {
    throw curatedRpcError(
      "Could not update the shop.",
      error,
      ADMIN_USER_RPC_SAFE_ERROR_CODES,
    );
  }

  return toShop(data as ShopRow);
}

/**
 * Seller-scoped: writes ONLY `description`. Never touches `name`/`active`/
 * `slug`/image columns — the RLS policy ("shop members update own shop
 * profile") is row-level and would technically permit more, so this
 * function, not RLS, is what keeps the actual write surface narrow. `shopId`
 * must come from `requireOwnShopId()`, never a client-submitted value.
 */
export async function updateOwnShopDescription(
  shopId: string,
  description: string | null,
): Promise<Shop> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.SHOPS)
    .update({ description })
    .eq("id", shopId)
    .select(SHOP_COLUMNS)
    .single();

  if (error) {
    throw queryError("Failed to update your shop", error);
  }

  return toShop(data as ShopRow);
}

type ShopImageKind = "logo" | "banner";

/** Extracts the Storage object path out of a public `shop-images` URL, the
 * same way `deleteProductImage` does for `product-images`. */
function shopImagePathFromUrl(url: string): string | undefined {
  return new URL(url).pathname.split("/shop-images/")[1];
}

/**
 * Uploads a new shop logo/banner, persists it, and only then removes the
 * previous one — never any other order:
 *
 * 1. Upload the new file. If this fails, nothing else has happened yet — the
 *    previous DB value and previous file are both untouched.
 * 2. Only once the upload succeeds, update `shops.{kind}_url` to the new
 *    file's URL. If THIS fails, the just-uploaded file is removed
 *    (best-effort) and the previous DB value is left exactly as it was —
 *    the shop is never left pointing at a file that was never persisted.
 * 3. Only once the DB write succeeds — the new image is now the shop's
 *    source of truth — the previous file is removed from Storage
 *    (best-effort; a cleanup failure here must never surface as an error,
 *    since the shop is already in a fully correct, consistent state).
 *
 * `shopId` must come from `requireOwnShopId()`, never a client-submitted
 * value. The uploaded path is always `{shopId}/{kind}/{uuid}.{ext}` —
 * server-controlled, never derived from client input beyond the file itself.
 */
export async function replaceShopImage(
  shopId: string,
  kind: ShopImageKind,
  file: File,
): Promise<Shop> {
  const supabase = await createSupabaseServerClient();

  const { data: current, error: readError } = await supabase
    .from(DATABASE_TABLES.SHOPS)
    .select("logo_url, banner_url")
    .eq("id", shopId)
    .single();
  if (readError) {
    throw queryError("Failed to load your shop", readError);
  }
  const previousUrl = kind === "logo" ? current.logo_url : current.banner_url;

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${shopId}/${kind}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("shop-images")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    throw queryError("Failed to upload image", uploadError);
  }

  const { data: publicUrlData } = supabase.storage.from("shop-images").getPublicUrl(path);
  const newUrl = publicUrlData.publicUrl;

  const { data, error: updateError } = await supabase
    .from(DATABASE_TABLES.SHOPS)
    .update(kind === "logo" ? { logo_url: newUrl } : { banner_url: newUrl })
    .eq("id", shopId)
    .select(SHOP_COLUMNS)
    .single();

  if (updateError) {
    // The new file was never made the shop's source of truth — remove the
    // orphan and leave the previous, still-valid image/DB value untouched.
    await supabase.storage.from("shop-images").remove([path]).catch(() => undefined);
    throw queryError("Failed to update your shop", updateError);
  }

  if (previousUrl) {
    const oldPath = shopImagePathFromUrl(previousUrl);
    if (oldPath) {
      await supabase.storage.from("shop-images").remove([oldPath]).catch(() => undefined);
    }
  }

  return toShop(data as ShopRow);
}

/**
 * Nulls the column and removes its Storage object — same DB-write-first
 * ordering as `replaceShopImage`: if the DB write fails, the previous file is
 * left in place and the shop keeps its previous, still-valid image.
 */
export async function removeShopImage(shopId: string, kind: ShopImageKind): Promise<Shop> {
  const supabase = await createSupabaseServerClient();

  const { data: current, error: readError } = await supabase
    .from(DATABASE_TABLES.SHOPS)
    .select("logo_url, banner_url")
    .eq("id", shopId)
    .single();
  if (readError) {
    throw queryError("Failed to load your shop", readError);
  }
  const previousUrl = kind === "logo" ? current.logo_url : current.banner_url;

  const { data, error: updateError } = await supabase
    .from(DATABASE_TABLES.SHOPS)
    .update(kind === "logo" ? { logo_url: null } : { banner_url: null })
    .eq("id", shopId)
    .select(SHOP_COLUMNS)
    .single();
  if (updateError) {
    throw queryError("Failed to update your shop", updateError);
  }

  if (previousUrl) {
    const oldPath = shopImagePathFromUrl(previousUrl);
    if (oldPath) {
      await supabase.storage.from("shop-images").remove([oldPath]).catch(() => undefined);
    }
  }

  return toShop(data as ShopRow);
}

type ShopRowWithMembers = ShopRow & {
  shop_users: Array<{
    user_id: string;
    member: Pick<ProfileRow, "full_name" | "username"> | null;
  }>;
};

function toShopWithMember(row: ShopRowWithMembers): ShopWithMember {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    logoUrl: row.logo_url,
    bannerUrl: row.banner_url,
    description: row.description,
    // Every member, not just the first — a shop can have more than one
    // (co-sellers), and the admin Users screen already correctly shows each
    // user's own assignment; dropping extras here made this screen disagree
    // with that one for any shop with 2+ members.
    members: (row.shop_users ?? []).flatMap((su) =>
      su.member
        ? [{ id: su.user_id, name: su.member.full_name ?? su.member.username ?? "Unnamed" }]
        : [],
    ),
  };
}

/**
 * Every shop plus its current member, for the admin Shops management screen —
 * distinct from `listShops()` (kept unchanged, id/name/slug/active only, used
 * by the Products/Inventory admin shop-picker) so that screen's shape never
 * has to change to support this one's richer needs.
 */
export async function listShopsWithMembers(): Promise<ShopWithMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.SHOPS)
    .select(`
      ${SHOP_COLUMNS},
      shop_users ( user_id, member:profiles!shop_users_user_id_fkey ( full_name, username ) )
    `)
    .order("name", { ascending: true });

  if (error) {
    throw queryError("Failed to load shops", error);
  }

  return (data ?? []).map((row) => toShopWithMember(row as ShopRowWithMembers));
}

/** The exact `errcode`s `admin_hard_delete_shop` is documented to `raise
 * exception ... using errcode` with — see that RPC's own migration
 * (20260928072046_shop_hard_delete_support.sql). */
const SHOP_DELETE_RPC_SAFE_ERROR_CODES = ["42501", "22023", "P0002"] as const;

/**
 * Permanently deletes an already-deactivated, member-free, history-free shop
 * via the `admin_hard_delete_shop` RPC — the sole delete path (no DELETE
 * grant/policy exists on `shops`). The RPC snapshots identity into
 * `admin_action_log` and detaches (never deletes) the shop's
 * products/variants/inventory/stock_adjustments/recommendation_rules by
 * setting their `shop_id` to null; it blocks with a curated error if the
 * shop still has a member or any historical order/return/shipment. Once the
 * RPC succeeds, this also best-effort removes the shop's `shop-images`
 * Storage objects (never FK-linked, so nothing else cleans these up) —
 * failures there are swallowed, mirroring `replaceShopImage`'s cleanup.
 */
export async function hardDeleteShop(shopId: string, reason?: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_hard_delete_shop", {
    p_shop_id: shopId,
    p_reason: reason ?? undefined,
  });

  if (error) {
    throw curatedRpcError(
      "Could not delete this shop.",
      error,
      SHOP_DELETE_RPC_SAFE_ERROR_CODES,
    );
  }

  for (const kind of ["logo", "banner"] as const) {
    const { data: files } = await supabase.storage
      .from("shop-images")
      .list(`${shopId}/${kind}`)
      .catch(() => ({ data: null }));
    if (files && files.length > 0) {
      await supabase.storage
        .from("shop-images")
        .remove(files.map((file) => `${shopId}/${kind}/${file.name}`))
        .catch(() => undefined);
    }
  }
}

// ============================================================================
// Admin: Users
// ============================================================================

/**
 * L4: the exact `errcode`s `admin_assign_seller_shop`, `admin_demote_seller_to_buyer`,
 * and `admin_set_user_active` are documented to `raise exception ... using errcode`
 * with — see each RPC's own migration. Shared by their three query wrappers below
 * so `curatedRpcError` only ever surfaces one of these RPCs' own curated business
 * messages, never an unrelated raw Postgres error.
 */
const ADMIN_USER_RPC_SAFE_ERROR_CODES = ["42501", "22023", "P0002"] as const;

type AdminUserRpcRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  role: AdminUser["role"];
  avatar_url: string | null;
  created_at: string;
  shop_id: string | null;
  shop_name: string | null;
  is_active: boolean;
};

function toAdminUser(row: AdminUserRpcRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    username: row.username,
    role: row.role,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    shopId: row.shop_id,
    shopName: row.shop_name,
    isActive: row.is_active,
  };
}

/**
 * Every user, admin-only, via the `admin_list_users` RPC — the sole path to
 * see email (never otherwise joinable from `public.profiles`; mirrors
 * `get_my_profile()`'s shape but admin- rather than self-scoped). Authorization
 * is re-checked inside the RPC itself, not just relied on via the caller's
 * `requireRole` gate.
 */
export async function listAdminUsers(): Promise<AdminUser[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_users");

  if (error) {
    throw rpcError("Could not load users.", error);
  }

  return (data ?? []).map((row) => toAdminUser(row as AdminUserRpcRow));
}

/**
 * Single user for the admin detail/drill-in view (L1) — calls
 * `admin_list_users` with its optional `p_user_id` filter instead of
 * fetching every user just to find one.
 */
export async function getAdminUserById(userId: string): Promise<AdminUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_users", { p_user_id: userId });

  if (error) {
    throw rpcError("Could not load this user.", error);
  }

  const row = data?.[0];
  return row ? toAdminUser(row as AdminUserRpcRow) : null;
}

/**
 * Which of the given buyer ids currently have an order in a non-terminal
 * state — used only to warn an admin before promoting a buyer to seller
 * (M2), never to block it. Scoped to the caller-supplied ids (the current
 * page of buyers) rather than a full-table scan. Relies on the existing
 * `orders` SELECT RLS (admin reads every row); no RPC needed.
 */
export async function listBuyerIdsWithActiveOrders(
  buyerIds: string[],
): Promise<Set<string>> {
  if (buyerIds.length === 0) return new Set();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.ORDERS)
    .select("buyer_id")
    .in("buyer_id", buyerIds)
    .in("order_status", ACTIVE_ORDER_STATUSES);

  if (error) {
    throw queryError("Failed to check buyers' active orders", error);
  }

  return new Set((data ?? []).map((row) => row.buyer_id));
}

/**
 * Promotes a buyer to seller and/or (re)assigns their shop via the
 * `admin_assign_seller_shop` RPC — the sole write path (no direct UPDATE
 * grant exists for writing another user's `profiles.role`, and RLS never
 * exposes another user's row to an admin for a plain client update). Atomic:
 * role change + shop membership + audit log row, one transaction.
 */
export async function assignSellerShop(
  userId: string,
  shopId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_assign_seller_shop", {
    p_user_id: userId,
    p_shop_id: shopId,
  });

  if (error) {
    // L4: only trust the RPC's own curated codes (42501/22023/P0002) — see
    // that RPC's `raise ... using errcode` calls — anything else falls
    // back to a safe generic message instead of leaking raw Postgres text.
    throw curatedRpcError(
      "Could not assign the seller to a shop.",
      error,
      ADMIN_USER_RPC_SAFE_ERROR_CODES,
    );
  }
}

/**
 * Reversibly demotes a seller back to buyer via the
 * `admin_demote_seller_to_buyer` RPC — the sole write path (M3). Atomic:
 * role change + shop membership removal + audit log row, one transaction.
 * Never touches products/orders; the RPC itself rejects any non-seller
 * target.
 */
export async function demoteSellerToBuyer(userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_demote_seller_to_buyer", {
    p_user_id: userId,
  });

  if (error) {
    throw curatedRpcError(
      "Could not demote this seller to buyer.",
      error,
      ADMIN_USER_RPC_SAFE_ERROR_CODES,
    );
  }
}

/**
 * Activates/deactivates a buyer or seller via the `admin_set_user_active`
 * RPC — the sole write path (`is_active` has no client UPDATE grant, and
 * RLS never exposes another user's row to an admin for a plain client
 * update). The RPC itself rejects self-targeting and any `role = 'admin'`
 * target, and logs the call to `admin_action_log`.
 */
export async function setUserActive(
  userId: string,
  isActive: boolean,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_user_active", {
    p_user_id: userId,
    p_is_active: isActive,
  });

  if (error) {
    // admin_set_user_active RAISEs curated messages ("Cannot deactivate an
    // admin", "You cannot deactivate your own account") — preserve only
    // those (L4), not any other Postgres error this RPC didn't intend.
    throw curatedRpcError(
      "Could not update the user's status.",
      error,
      ADMIN_USER_RPC_SAFE_ERROR_CODES,
    );
  }
}

/**
 * Every product visible to the caller for management purposes — no status
 * filter (unlike `listProducts`, built for the storefront).
 *
 * Unlike `listDashboardOrders`/`listDashboardInventory`, this **cannot**
 * rely on RLS alone: `products`' SELECT policy has a standalone
 * `status = 'active' or seller_id = auth.uid() or is_admin()` clause (it
 * also has to serve the public storefront), so "no manual filter" here would
 * return every *active* product from every seller platform-wide, not just
 * the caller's own — a seller's dashboard list would silently include other
 * sellers' listings (discovered 2026-08-21: this let a seller "Edit" a
 * product that wasn't theirs, then fail confusingly on save/image-upload).
 * `owner`: `null` = admin (no filter, sees everything); otherwise scoped to
 * the caller's own products or shop, matching `updateProduct`/`archiveProduct`'s
 * owner-filter shape.
 */
export async function listDashboardProducts(
  owner: { sellerId: string; shopId: string | null } | null,
): Promise<Product[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from(DATABASE_TABLES.PRODUCTS).select(PRODUCT_COLUMNS);

  if (owner) {
    query = query.or(
      owner.shopId
        ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
        : `seller_id.eq.${owner.sellerId}`,
    );
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw queryError("Failed to load products", error);
  }

  return (data ?? []).map((row) => toProduct(row as ProductRowWithImages));
}

/**
 * Count-only counterpart to `listDashboardProducts` — same owner-filter
 * shape, but a `head: true` probe instead of fetching every row. For a
 * "how many products" KPI tile, which only ever read `.length` off the full
 * fetch before.
 */
export async function getProductCount(
  owner: { sellerId: string; shopId: string | null } | null,
): Promise<number> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .select("id", { count: "exact", head: true });

  if (owner) {
    query = query.or(
      owner.shopId
        ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
        : `seller_id.eq.${owner.sellerId}`,
    );
  }

  const { count, error } = await query;

  if (error) {
    throw queryError("Failed to count products", error);
  }

  return count ?? 0;
}

/**
 * Paginated/filtered counterpart to `listDashboardProducts` — powers the
 * Products table (search/status/category + page). Kept as a separate
 * function rather than changing `listDashboardProducts`'s signature: that
 * one is also called unpaginated by `SellerKpiRow`/`AdminKpiRow` for a plain
 * total count, which this would have broken.
 */
export async function listDashboardProductsPage(
  owner: { sellerId: string; shopId: string | null } | null,
  params: DashboardProductListParams,
): Promise<PaginatedResult<Product>> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .select(PRODUCT_COLUMNS, { count: "exact" });

  if (owner) {
    query = query.or(
      owner.shopId
        ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
        : `seller_id.eq.${owner.sellerId}`,
    );
  }
  if (params.search) {
    const term = params.search.replace(/[,()]/g, " ").trim();
    if (term) query = query.ilike("title", `%${term}%`);
  }
  if (params.status) {
    query = query.eq("status", params.status);
  } else {
    // The default/"All" view excludes archived products — they get their
    // own explicit `?status=archived` view (the dashboard's Recycle Bin),
    // same as they're excluded from the public storefront. Archiving never
    // deletes the row, so this is purely a default-visibility choice; the
    // explicit status filter above still shows them on request.
    query = query.neq("status", PRODUCT_STATUS.archived);
  }
  if (params.categoryId) {
    query = query.eq("category_id", params.categoryId);
  }

  query = query.order("created_at", { ascending: false });

  const { from, to } = toRange(params);
  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw queryError("Failed to load products", error);
  }

  const total = count ?? 0;
  return {
    items: (data ?? []).map((row) => toProduct(row as ProductRowWithImages)),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/**
 * Applies one status to every id in `ids` at once (dashboard bulk action).
 * Same owner-scoping precedent as `updateProduct`/`archiveProduct`: `owner`
 * is `null` for an admin (no filter), otherwise the caller's own products or
 * their shop's. Returns only the ids that actually matched (already-foreign
 * ids in `ids` are silently dropped, matching `.in()`'s normal behaviour).
 */
export async function bulkUpdateProductStatus(
  ids: string[],
  status: ProductStatus,
  owner: { sellerId: string; shopId: string | null } | null,
): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .update({ status })
    .in("id", ids);

  if (owner) {
    query = query.or(
      owner.shopId
        ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
        : `seller_id.eq.${owner.sellerId}`,
    );
  }

  const { data, error } = await query.select("id");
  if (error) {
    throw queryError("Failed to update products", error);
  }
  return (data ?? []).map((row) => row.id);
}

/** Same shape as `bulkUpdateProductStatus`, for the category-reassignment bulk action. */
export async function bulkAssignProductCategory(
  ids: string[],
  categoryId: string,
  owner: { sellerId: string; shopId: string | null } | null,
): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .update({ category_id: categoryId })
    .in("id", ids);

  if (owner) {
    query = query.or(
      owner.shopId
        ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
        : `seller_id.eq.${owner.sellerId}`,
    );
  }

  const { data, error } = await query.select("id");
  if (error) {
    throw queryError("Failed to update products", error);
  }
  return (data ?? []).map((row) => row.id);
}

/**
 * Admin-only: assigns a shop to a legacy/unassigned product (`shop_id`
 * currently `null`). Relies on `is_admin()` in RLS — the caller's admin
 * status is the actual authorization boundary, not this function.
 */
export async function assignProductShop(
  productId: string,
  shopId: string,
): Promise<Product> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCTS)
    .update({ shop_id: shopId })
    .eq("id", productId)
    .select(PRODUCT_COLUMNS)
    .single();

  if (error) {
    throw queryError("Failed to assign shop", error);
  }

  return toProduct(data as ProductRowWithImages);
}

/**
 * The most recent non-refunded payment attempt for one of the buyer's own
 * orders, or null if none exists yet. Used by the order detail page to
 * decide whether to show Xendit payment options, a "confirming your
 * payment" state, or — for `failed` — the failure reason.
 */
export async function getActivePaymentForOrder(
  orderId: string,
): Promise<Payment | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PAYMENTS)
    .select(PAYMENT_COLUMNS)
    .eq("order_id", orderId)
    .in("status", [PAYMENT_STATUS.pending, PAYMENT_STATUS.paid, PAYMENT_STATUS.failed])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to load payment", error);
  }
  return data ? toPayment(data as PaymentRowWithOrder) : null;
}

/**
 * Mirrors `getActivePaymentForOrder` for a checkout group — the confirmation
 * page uses this to detect an already-in-flight combined payment (a prior
 * click, a page refresh, or another tab) and show a resume link instead of
 * starting a second one. RLS-scoped to the buyer's own orders, same as
 * `getActivePaymentForOrder`.
 */
export async function getActivePaymentForGroup(
  checkoutGroupId: string,
): Promise<Payment | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PAYMENTS)
    .select(PAYMENT_COLUMNS)
    .eq("checkout_group_id", checkoutGroupId)
    .in("status", [PAYMENT_STATUS.pending, PAYMENT_STATUS.paid, PAYMENT_STATUS.failed])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to load payment", error);
  }
  return data ? toPayment(data as PaymentRowWithOrder) : null;
}

/**
 * Whether an order has ever had a Xendit payment attempt (any status) — the
 * same signal `advanceOrderStatus` uses to distinguish "Xendit order not yet
 * paid" (fulfilment blocked) from a COD order sitting at `payment_status =
 * 'pending'` until delivery (fulfilment unaffected). Used by the seller/admin
 * order-detail pages to decide whether `OrderStatusControl` should show the
 * payment-required message instead of the advance button.
 */
export async function hasXenditPaymentAttempt(orderId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PAYMENTS)
    .select("id")
    .eq("order_id", orderId)
    .eq("payment_method_type", "xendit")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to check payment attempts", error);
  }
  return data !== null;
}

// ============================================================================
// Inventory
// ============================================================================

type InventoryRow = Database["public"]["Tables"]["inventory"]["Row"];
type StockAdjustmentRow = Database["public"]["Tables"]["stock_adjustments"]["Row"];
type ProductVariantRow = Database["public"]["Tables"]["product_variants"]["Row"];

/**
 * Inventory columns plus the parent product's title/slug/status, the owning
 * shop's name, and — when this row is variant-level — the variant's own
 * sku/color/size, so the dashboard list can label it distinctly from the
 * product's own row. Literal for the same reason as
 * `PRODUCT_COLUMNS`/`PAYMENT_COLUMNS`.
 */
const INVENTORY_COLUMNS = `
  id, product_id, variant_id, shop_id, quantity, low_stock_threshold, created_at, updated_at,
  product:products!inventory_product_id_fkey ( title, slug, status ),
  shop:shops!inventory_shop_id_fkey ( name ),
  variant:product_variants!inventory_variant_id_fkey ( sku, color, size )
`;

type InventoryRowWithJoins = InventoryRow & {
  product: Pick<ProductRow, "title" | "slug" | "status"> | null;
  shop: { name: string } | null;
  variant: Pick<ProductVariantRow, "sku" | "color" | "size"> | null;
};

function toInventoryItem(row: InventoryRowWithJoins): InventoryItem {
  return {
    id: row.id,
    productId: row.product_id,
    productTitle: row.product?.title ?? "",
    productSlug: row.product?.slug ?? "",
    productStatus: (row.product?.status ?? PRODUCT_STATUS.draft) as ProductStatus,
    shopId: row.shop_id,
    shopName: row.shop?.name ?? null,
    variantId: row.variant_id,
    variantLabel: row.variant
      ? [row.variant.color, row.variant.size].filter(Boolean).join(" / ") || null
      : null,
    quantity: row.quantity,
    lowStockThreshold: row.low_stock_threshold,
    stockStatus: getStockStatus(row.quantity, row.low_stock_threshold),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Every inventory row visible to the caller — no manual shop/seller
 * filtering. Safe to rely on RLS alone here (unlike `listDashboardProducts()`,
 * which needs an explicit owner filter): `inventory`'s SELECT policy has no
 * public/unscoped clause, so a shop member sees only their own shop's stock,
 * an admin sees every shop's.
 */
export async function listDashboardInventory(): Promise<InventoryItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.INVENTORY)
    .select(INVENTORY_COLUMNS)
    .order("updated_at", { ascending: false });

  if (error) {
    throw queryError("Failed to load inventory", error);
  }

  return (data ?? []).map((row) => toInventoryItem(row as InventoryRowWithJoins));
}

/**
 * Paginated/filtered counterpart to `listDashboardInventory` — powers the
 * Inventory table (search/stock-status + page). Kept separate rather than
 * changing `listDashboardInventory`'s signature: that one is also called
 * unpaginated by `getLowStockReport` (KPI tiles, low-stock report), which
 * this would have broken.
 *
 * The stock-status filter compares `quantity` against the *default*
 * low-stock threshold (`DEFAULT_LOW_STOCK_THRESHOLD`), not each row's own
 * `low_stock_threshold` column — PostgREST filters take a literal value, not
 * another column, so a per-row threshold comparison isn't expressible here
 * without a database view/RPC. Every row is created with the same default
 * today (there's no UI to change it per-row), so this matches
 * `getStockStatus()` exactly in practice; if a per-row override is ever
 * introduced, this filter needs to move into a computed column or RPC.
 */
export async function listDashboardInventoryPage(
  params: DashboardInventoryListParams,
): Promise<PaginatedResult<InventoryItem>> {
  const supabase = await createSupabaseServerClient();

  // `!inner` so `.ilike("product.title", …)` can filter the parent
  // (inventory) rows by the joined product's title — PostgREST only applies
  // an embedded-resource filter to the top-level result set when that embed
  // is an inner join. Every inventory row has a product, so this never
  // narrows results on its own.
  let query = supabase
    .from(DATABASE_TABLES.INVENTORY)
    .select(
      `
        id, product_id, variant_id, shop_id, quantity, low_stock_threshold, created_at, updated_at,
        product:products!inventory_product_id_fkey!inner ( title, slug, status ),
        shop:shops!inventory_shop_id_fkey ( name ),
        variant:product_variants!inventory_variant_id_fkey ( sku, color, size )
      `,
      { count: "exact" },
    );

  if (params.search) {
    const term = params.search.replace(/[,()]/g, " ").trim();
    if (term) query = query.ilike("product.title", `%${term}%`);
  }
  if (params.stockStatus === "out_of_stock") {
    query = query.lte("quantity", 0);
  } else if (params.stockStatus === "low_stock") {
    query = query.gt("quantity", 0).lte("quantity", DEFAULT_LOW_STOCK_THRESHOLD);
  } else if (params.stockStatus === "in_stock") {
    query = query.gt("quantity", DEFAULT_LOW_STOCK_THRESHOLD);
  }

  query = query.order("updated_at", { ascending: false });

  const { from, to } = toRange(params);
  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw queryError("Failed to load inventory", error);
  }

  const total = count ?? 0;
  return {
    items: (data ?? []).map((row) => toInventoryItem(row as InventoryRowWithJoins)),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/**
 * Single product-level inventory row, or null if none exists yet. Explicitly
 * scoped to `variant_id is null` — since Phase 3a, a product with variants
 * has one inventory row *per variant* sharing the same `product_id`, so a
 * plain `.eq("product_id", ...)` would ambiguously match more than one row
 * (and `.maybeSingle()` would throw) the moment that product gets a variant.
 */
export async function getInventoryForProduct(
  productId: string,
): Promise<InventoryItem | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.INVENTORY)
    .select(INVENTORY_COLUMNS)
    .eq("product_id", productId)
    .is("variant_id", null)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to load inventory", error);
  }
  return data ? toInventoryItem(data as InventoryRowWithJoins) : null;
}

/** Single variant-level inventory row, or null if none exists yet. */
export async function getVariantInventory(
  variantId: string,
): Promise<InventoryItem | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.INVENTORY)
    .select(INVENTORY_COLUMNS)
    .eq("variant_id", variantId)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to load inventory", error);
  }
  return data ? toInventoryItem(data as InventoryRowWithJoins) : null;
}

/**
 * Manually adjusts one product's stock via the `adjust_stock` RPC — the sole
 * write path for restock/correction/shrinkage/other changes (no direct
 * UPDATE grant exists on `inventory`). Authorization (shop membership or
 * admin) is re-checked inside the RPC itself, not just by RLS. The RPC's
 * raised messages (e.g. "Cannot reduce stock below zero") are already
 * friendly, so the error is surfaced as-is, mirroring `createOrder()`.
 */
export async function adjustStock(input: AdjustStockInput): Promise<InventoryItem> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("adjust_stock", {
    p_product_id: input.productId,
    p_delta: input.delta,
    p_reason: input.reason,
    p_note: input.note ?? undefined,
    p_variant_id: input.variantId ?? undefined,
  });

  if (error) {
    // adjust_stock RAISEs curated messages ("Cannot reduce stock below zero
    // (currently N)") — preserve them; log the raw error.
    throw rpcError("Could not adjust stock.", error);
  }

  const item = input.variantId
    ? await getVariantInventory(input.variantId)
    : await getInventoryForProduct(input.productId);
  if (!item) {
    throw new Error("Could not load the updated inventory record.");
  }
  return item;
}

/**
 * Stock adjustment columns plus the acting profile's display name — the
 * `note` explains *why* an adjustment happened, this explains *who* made it
 * (null for system-driven rows: sale, cancellation restock).
 */
const STOCK_ADJUSTMENT_COLUMNS = `
  id, product_id, shop_id, delta, previous_quantity, new_quantity, reason,
  note, related_order_id, created_by, created_at,
  actor:profiles!stock_adjustments_created_by_fkey ( full_name, username )
`;

type StockAdjustmentRowWithActor = StockAdjustmentRow & {
  actor: Pick<ProfileRow, "full_name" | "username"> | null;
};

function toStockAdjustment(row: StockAdjustmentRowWithActor): StockAdjustment {
  return {
    id: row.id,
    productId: row.product_id,
    shopId: row.shop_id,
    delta: row.delta,
    previousQuantity: row.previous_quantity,
    newQuantity: row.new_quantity,
    reason: row.reason,
    note: row.note,
    relatedOrderId: row.related_order_id,
    createdBy: row.created_by,
    createdByName: row.actor?.full_name ?? row.actor?.username ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Recent stock movement history, newest first. RLS scopes it identically to
 * `inventory`. Scoped to exactly one row's worth of history: pass
 * `variantId` for a variant's own history, omit it for the product-level
 * row's history only (`variant_id is null`) — never a mix of both, so a
 * product with variants doesn't get its own history panel polluted with
 * every variant's movements. For a product with no variants this filter is
 * a no-op (no variant rows exist to exclude), preserving today's exact
 * behavior.
 */
export async function listStockAdjustments(
  productId: string,
  variantId?: string | null,
  limit = 20,
): Promise<StockAdjustment[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from(DATABASE_TABLES.STOCK_ADJUSTMENTS)
    .select(STOCK_ADJUSTMENT_COLUMNS)
    .eq("product_id", productId);
  query = variantId ? query.eq("variant_id", variantId) : query.is("variant_id", null);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw queryError("Failed to load stock history", error);
  }

  return (data ?? []).map((row) =>
    toStockAdjustment(row as StockAdjustmentRowWithActor),
  );
}

// ============================================================================
// Product Variants (Phase 3b — optional color/size variants of a product)
// ============================================================================

const PRODUCT_VARIANT_COLUMNS = `
  id, product_id, seller_id, shop_id, sku, color, size, price_cents, status,
  created_at, updated_at
`;

function toProductVariant(row: ProductVariantRow): ProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    sellerId: row.seller_id,
    shopId: row.shop_id,
    sku: row.sku,
    color: row.color,
    size: row.size,
    priceCents: row.price_cents,
    status: row.status as ProductStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** A product's own variants, oldest first (creation order). */
export async function listProductVariants(
  productId: string,
): Promise<ProductVariant[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCT_VARIANTS)
    .select(PRODUCT_VARIANT_COLUMNS)
    .eq("product_id", productId)
    .order("created_at", { ascending: true });

  if (error) {
    throw queryError("Failed to load variants", error);
  }
  return (data ?? []).map((row) => toProductVariant(row as ProductVariantRow));
}

/**
 * Every variant visible to the caller — no manual filter, mirrors
 * `listDashboardInventory()`/`listDashboardProducts()`'s "RLS alone is the
 * boundary" pattern. Fetched once by the dashboard page and grouped by
 * `productId` client-side, avoiding one query per listed product.
 */
export async function listDashboardProductVariants(): Promise<ProductVariant[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCT_VARIANTS)
    .select(PRODUCT_VARIANT_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) {
    throw queryError("Failed to load variants", error);
  }
  return (data ?? []).map((row) => toProductVariant(row as ProductVariantRow));
}

export interface ProductVariantInput {
  sku?: string;
  color?: string;
  size?: string;
  /** Major-unit pesos; omitted/undefined = inherit the parent product's price. */
  price?: number;
}

/** Creates a variant for a product the caller owns. Starts with 0 stock — see `product_variants_seed_inventory`; bring it up via `adjustStock`. */
export async function createProductVariant(
  productId: string,
  sellerId: string,
  shopId: string | null,
  input: ProductVariantInput,
): Promise<ProductVariant> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCT_VARIANTS)
    .insert({
      product_id: productId,
      seller_id: sellerId,
      shop_id: shopId,
      sku: input.sku || null,
      color: input.color || null,
      size: input.size || null,
      price_cents: input.price !== undefined ? toCents(input.price) : null,
    })
    .select(PRODUCT_VARIANT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("This color/size combination already exists for this product.");
    }
    throw queryError("Failed to create variant", error);
  }
  return toProductVariant(data as ProductVariantRow);
}

/**
 * Updates a variant's catalog attributes. Never touches stock (see
 * `adjustStock`) or, when `owner` is set, a variant outside the caller's own
 * scope — same defense-in-depth pattern as `updateProduct`.
 */
export async function updateProductVariant(
  id: string,
  owner: { sellerId: string; shopId: string | null } | null,
  input: ProductVariantInput & { status?: ProductStatus },
): Promise<ProductVariant> {
  const supabase = await createSupabaseServerClient();

  if (owner) {
    const ownerFilter = owner.shopId
      ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
      : `seller_id.eq.${owner.sellerId}`;
    const { data: existing, error: readError } = await supabase
      .from(DATABASE_TABLES.PRODUCT_VARIANTS)
      .select("id")
      .eq("id", id)
      .or(ownerFilter)
      .maybeSingle();
    if (readError) {
      throw new Error(`Failed to load variant: ${readError.message}`);
    }
    if (!existing) {
      throw new Error("Variant not found.");
    }
  }

  const { data, error } = await supabase
    .from(DATABASE_TABLES.PRODUCT_VARIANTS)
    .update({
      sku: input.sku || null,
      color: input.color || null,
      size: input.size || null,
      price_cents: input.price !== undefined ? toCents(input.price) : null,
      ...(input.status !== undefined ? { status: input.status } : {}),
    })
    .eq("id", id)
    .select(PRODUCT_VARIANT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("This color/size combination already exists for this product.");
    }
    throw queryError("Failed to update variant", error);
  }
  return toProductVariant(data as ProductVariantRow);
}

/**
 * Deletes a variant. `order_items.variant_id` is `ON DELETE RESTRICT`
 * (20260912010000_product_variants.sql) — a variant that has ever been
 * ordered cannot be deleted, by design, to protect historical order data.
 * That Postgres error (23503) is caught here and turned into a clear,
 * actionable message instead of a raw constraint error.
 */
export async function deleteProductVariant(
  id: string,
  owner: { sellerId: string; shopId: string | null } | null,
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  if (owner) {
    const ownerFilter = owner.shopId
      ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
      : `seller_id.eq.${owner.sellerId}`;
    const { data: existing, error: readError } = await supabase
      .from(DATABASE_TABLES.PRODUCT_VARIANTS)
      .select("id")
      .eq("id", id)
      .or(ownerFilter)
      .maybeSingle();
    if (readError) {
      throw new Error(`Failed to load variant: ${readError.message}`);
    }
    if (!existing) {
      throw new Error("Variant not found.");
    }
  }

  const { error } = await supabase
    .from(DATABASE_TABLES.PRODUCT_VARIANTS)
    .delete()
    .eq("id", id);

  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "This variant has already been ordered and can't be deleted — set it to Archived instead.",
      );
    }
    throw queryError("Failed to delete variant", error);
  }
}

// ============================================================================
// Reports & analytics
// ============================================================================
//
// All four reads call the matching `report_*` SECURITY DEFINER RPC, which
// re-enforces scoping internally (seller → own orders; admin → all, or one shop
// via `shopId`). No manual seller/shop filtering here, and no `.from()` on
// orders — the RPC does the aggregation DB-side. Amounts stay integer cents.
// `shopId` is only meaningful for admins; the RPC ignores it for sellers.

const EMPTY_SALES_SUMMARY: SalesSummary = {
  totalOrders: 0,
  paidOrders: 0,
  cancelledOrders: 0,
  revenueCents: 0,
  unitsSold: 0,
  avgOrderValueCents: 0,
  codPaidOrders: 0,
  qrPaidOrders: 0,
  xenditPaidOrders: 0,
  pendingPaymentOrders: 0,
};

/** KPI summary for a Manila date range. Always resolves (zeros when no orders). */
export const getSalesSummary = cache(async function getSalesSummary(
  from: string,
  to: string,
  shopId: string | null = null,
): Promise<SalesSummary> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("report_sales_summary", {
    p_from: from,
    p_to: to,
    p_shop_id: shopId ?? undefined,
  });

  if (error) {
    throw queryError("Failed to load sales summary", error);
  }

  const row = data?.[0];
  if (!row) return EMPTY_SALES_SUMMARY;
  return {
    totalOrders: row.total_orders,
    paidOrders: row.paid_orders,
    cancelledOrders: row.cancelled_orders,
    revenueCents: row.revenue_cents,
    unitsSold: row.units_sold,
    avgOrderValueCents: row.avg_order_value_cents,
    codPaidOrders: row.cod_paid_orders,
    qrPaidOrders: row.qr_paid_orders,
    xenditPaidOrders: row.xendit_paid_orders,
    pendingPaymentOrders: row.pending_payment_orders,
  };
});

/** Order count + paid revenue per time bucket (only non-empty buckets). */
export const getSalesTimeseries = cache(async function getSalesTimeseries(
  from: string,
  to: string,
  granularity: ReportGranularity,
  shopId: string | null = null,
): Promise<SalesTrendPoint[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("report_sales_timeseries", {
    p_from: from,
    p_to: to,
    p_granularity: granularity,
    p_shop_id: shopId ?? undefined,
  });

  if (error) {
    throw queryError("Failed to load sales trend", error);
  }

  return (data ?? []).map((row) => ({
    bucket: row.bucket,
    orderCount: row.order_count,
    revenueCents: row.revenue_cents,
  }));
});

/** Order counts grouped by fulfilment status within the range. */
export const getOrderStatusBreakdown = cache(
  async function getOrderStatusBreakdown(
    from: string,
    to: string,
    shopId: string | null = null,
  ): Promise<OrderStatusCount[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "report_order_status_breakdown",
      { p_from: from, p_to: to, p_shop_id: shopId ?? undefined },
    );

    if (error) {
      throw queryError("Failed to load status breakdown", error);
    }

    return (data ?? []).map((row) => ({
      status: row.status,
      orderCount: row.order_count,
    }));
  },
);

/** Best-selling products by units (revenue over the paid subset). */
export const getTopProducts = cache(async function getTopProducts(
  from: string,
  to: string,
  limit: number,
  shopId: string | null = null,
): Promise<TopProduct[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("report_top_products", {
    p_from: from,
    p_to: to,
    p_limit: limit,
    p_shop_id: shopId ?? undefined,
  });

  if (error) {
    throw queryError("Failed to load top products", error);
  }

  return (data ?? []).map((row) => ({
    productId: row.product_id,
    productTitle: row.product_title,
    unitsSold: row.units_sold,
    revenueCents: row.revenue_cents,
  }));
});

/**
 * Low- and out-of-stock rows for the report, reusing the existing RLS-scoped
 * inventory read (no new SQL). A seller sees their own shop's stock; an admin
 * sees every shop's — optionally narrowed to one shop via `shopId` (the
 * admin Reports page's shop filter; every other caller omits it and keeps
 * today's unfiltered behavior unchanged).
 */
export async function getLowStockReport(shopId?: string | null): Promise<InventoryItem[]> {
  const items = await listDashboardInventory();
  return items
    .filter((item) => item.stockStatus !== "in_stock")
    .filter((item) => !shopId || item.shopId === shopId)
    .sort((a, b) => a.quantity - b.quantity);
}

type RestockOrderRow = {
  payment_status: PaymentStatus;
  order_items: Array<{
    product_id: string;
    variant_id: string | null;
    quantity: number;
    subtotal_cents: number;
  }>;
};

/**
 * Cross-references the caller's low/out-of-stock items (see
 * `getLowStockReport`) with their sales in `[from, to]`, ranked by revenue
 * earned — "your best-seller is about to run out." Seller Dashboard/Reports
 * only. Relies on RLS alone for the `orders`/`order_items` read, same "RLS is
 * the primary boundary" pattern as `listDashboardOrders`.
 */
export async function getRestockPriorityReport(
  from: string,
  to: string,
  limit = 5,
): Promise<RestockPriorityItem[]> {
  const lowStockItems = await getLowStockReport();
  if (lowStockItems.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  const productIds = Array.from(new Set(lowStockItems.map((item) => item.productId)));

  const { data, error } = await supabase
    .from(DATABASE_TABLES.ORDERS)
    .select(
      `
        payment_status,
        order_items!inner ( product_id, variant_id, quantity, subtotal_cents )
      `,
    )
    .in("order_items.product_id", productIds)
    .gte("placed_at", `${from}T00:00:00Z`)
    .lte("placed_at", `${to}T23:59:59Z`);

  if (error) {
    throw queryError("Failed to load restock priority", error);
  }

  const key = (productId: string, variantId: string | null) => `${productId}:${variantId ?? ""}`;
  const perVariant = new Map<string, { units: number; revenueCents: number }>();

  for (const order of (data ?? []) as RestockOrderRow[]) {
    for (const item of order.order_items) {
      if (!productIds.includes(item.product_id)) continue;
      const k = key(item.product_id, item.variant_id);
      const entry = perVariant.get(k) ?? { units: 0, revenueCents: 0 };
      entry.units += item.quantity;
      if (order.payment_status === PAYMENT_STATUS.paid) entry.revenueCents += item.subtotal_cents;
      perVariant.set(k, entry);
    }
  }

  return lowStockItems
    .map((item) => {
      const stats = perVariant.get(key(item.productId, item.variantId)) ?? { units: 0, revenueCents: 0 };
      return {
        productId: item.productId,
        variantId: item.variantId,
        productTitle: item.productTitle,
        variantLabel: item.variantLabel,
        quantity: item.quantity,
        stockStatus: item.stockStatus,
        unitsSoldInRange: stats.units,
        revenueCentsInRange: stats.revenueCents,
      };
    })
    .sort((a, b) => b.revenueCentsInRange - a.revenueCentsInRange)
    .slice(0, limit);
}

type CategoryRevenueOrderRow = {
  order_items: Array<{
    quantity: number;
    subtotal_cents: number;
    product: {
      category_id: string | null;
      category: { name: string } | null;
    } | null;
  }>;
};

/**
 * Revenue/units rollup per category for paid orders in `[from, to]`. Seller
 * Reports only. Relies on RLS alone, same pattern as `getRestockPriorityReport`.
 */
export async function getRevenueByCategory(from: string, to: string): Promise<CategoryRevenue[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.ORDERS)
    .select(
      `
        order_items!inner (
          quantity, subtotal_cents,
          product:products!order_items_product_id_fkey (
            category_id,
            category:categories!products_category_id_fkey ( name )
          )
        )
      `,
    )
    .eq("payment_status", PAYMENT_STATUS.paid)
    .gte("placed_at", `${from}T00:00:00Z`)
    .lte("placed_at", `${to}T23:59:59Z`);

  if (error) {
    throw queryError("Failed to load revenue by category", error);
  }

  const perCategory = new Map<string, { name: string; revenueCents: number; units: number }>();
  for (const order of (data ?? []) as CategoryRevenueOrderRow[]) {
    for (const item of order.order_items) {
      const categoryId = item.product?.category_id ?? "uncategorized";
      const categoryName = item.product?.category?.name ?? "Uncategorized";
      const entry = perCategory.get(categoryId) ?? { name: categoryName, revenueCents: 0, units: 0 };
      entry.revenueCents += item.subtotal_cents;
      entry.units += item.quantity;
      perCategory.set(categoryId, entry);
    }
  }

  return Array.from(perCategory.entries())
    .map(([categoryId, v]) => ({
      categoryId: categoryId === "uncategorized" ? null : categoryId,
      categoryName: v.name,
      revenueCents: v.revenueCents,
      unitsSold: v.units,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents);
}

/** Safety cap on the unbounded per-buyer history scan below — generous for one seller's real buyer base. */
const REPEAT_CUSTOMER_HISTORY_LIMIT = 5000;

/**
 * Returning- vs. new-buyer split for orders placed in `[from, to]` — a
 * buyer counts as "returning" if they have more than one order with this
 * seller across all time (not just within the range). Seller Dashboard only.
 * Two round trips, both relying on RLS alone: the range itself, then every
 * historical order (any date) for just the buyers found in that range.
 */
export async function getRepeatCustomerRate(from: string, to: string): Promise<RepeatCustomerStats> {
  const supabase = await createSupabaseServerClient();

  const { data: rangeOrders, error: rangeError } = await supabase
    .from(DATABASE_TABLES.ORDERS)
    .select("buyer_id")
    .gte("placed_at", `${from}T00:00:00Z`)
    .lte("placed_at", `${to}T23:59:59Z`);

  if (rangeError) {
    throw queryError("Failed to load repeat customer stats", rangeError);
  }

  const totalOrders = (rangeOrders ?? []).length;
  if (totalOrders === 0) {
    return { totalOrders: 0, returningOrders: 0, newOrders: 0, ratePercent: 0 };
  }

  const buyerIds = Array.from(new Set((rangeOrders ?? []).map((row) => row.buyer_id)));

  const { data: historyOrders, error: historyError } = await supabase
    .from(DATABASE_TABLES.ORDERS)
    .select("buyer_id")
    .in("buyer_id", buyerIds)
    .limit(REPEAT_CUSTOMER_HISTORY_LIMIT);

  if (historyError) {
    throw queryError("Failed to load repeat customer stats", historyError);
  }

  const totalCountByBuyer = new Map<string, number>();
  for (const row of historyOrders ?? []) {
    totalCountByBuyer.set(row.buyer_id, (totalCountByBuyer.get(row.buyer_id) ?? 0) + 1);
  }

  let returningOrders = 0;
  for (const row of rangeOrders ?? []) {
    if ((totalCountByBuyer.get(row.buyer_id) ?? 0) > 1) returningOrders += 1;
  }

  const newOrders = totalOrders - returningOrders;
  return {
    totalOrders,
    returningOrders,
    newOrders,
    ratePercent: Math.round((returningOrders / totalOrders) * 100),
  };
}

// ============================================================================
// Auth / session
// ============================================================================

/** Absolute URL of the PKCE callback, optionally forwarding a post-auth path. */
function callbackUrl(next?: string) {
  const base = `${publicEnv.NEXT_PUBLIC_SITE_URL}${ROUTES.authCallback}`;
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}

/**
 * Current user with the profile row merged in, or null when signed out.
 * `cache()`-wrapped so the layout, page, and metadata share one auth + profile
 * round-trip per request (audit H3 remediation).
 */
export const getSessionUser = cache(
  async (): Promise<SessionUser | null> => {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: profile } = await supabase
      .from(DATABASE_TABLES.PROFILES)
      .select("full_name, avatar_url, role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    return {
      id: user.id,
      email: user.email ?? "",
      fullName: profile?.full_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      role: profile?.role ?? USER_ROLES.buyer,
      // No profile row is not the same as deactivated — fail open only for
      // the "row missing" edge case (e.g. mid-signup), never for is_active's
      // own value.
      isActive: profile?.is_active ?? true,
    };
  },
);

/**
 * True only when the current session's JWT records a "recovery" auth method
 * — i.e. it was established by clicking a password-recovery email link, not
 * an ordinary sign-in. `getClaims()` verifies the JWT itself (unlike
 * `getSession()`), so this is safe to use as an authorization gate.
 * Used by the reset-password screen so a hijacked ordinary session can't
 * reach the password-change form without going through recovery.
 */
export async function hasRecoverySession(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return false;

  const amr = data.claims.amr ?? [];
  return amr.some((entry) =>
    typeof entry === "string" ? entry === "recovery" : entry.method === "recovery",
  );
}

/**
 * Throws unless the current session came from a password-recovery link.
 * Use at the top of `updatePasswordAction` — the page-level check in
 * `reset-password/page.tsx` is the primary UX gate, this is the
 * belt-and-suspenders re-check at the Server Action boundary.
 */
export async function requireRecoverySession(): Promise<void> {
  if (!(await hasRecoverySession())) {
    throw new Error("This password reset link has expired. Please request a new one.");
  }
}

/**
 * Throws when unauthenticated, or when the session belongs to a deactivated
 * account — the sole enforcement point for `profiles.is_active` across the
 * app. A deactivated user's Supabase Auth session stays cryptographically
 * valid (this never touches auth.users); this is the application-layer
 * check that treats it as unauthorized anyway. Every protected Server
 * Action and `requireRole()` call goes through this, so nothing else needs
 * its own is_active check.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("You must be signed in to perform this action.");
  }
  if (!user.isActive) {
    throw new Error("Your account has been deactivated. Contact support for assistance.");
  }
  return user;
}

/** Throws when the user lacks one of the allowed roles. */
export async function requireRole(
  allowed: readonly UserRole[],
): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (!allowed.includes(user.role as UserRole)) {
    throw new Error("You do not have permission to perform this action.");
  }
  return user;
}

/**
 * Resolves the caller's own shop via `shop_users` — never trusts a
 * client-submitted shop id. Throws a friendly error for a seller with no
 * shop membership yet (an admin has no shop of their own; callers needing an
 * admin-selectable shop should use `listShops()` instead).
 */
/** Nullable variant of `requireOwnShopId` — a seller may legitimately have no shop. */
export async function getOwnShopId(userId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.SHOP_USERS)
    .select("shop_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to resolve your shop", error);
  }
  return data?.shop_id ?? null;
}

export async function requireOwnShopId(): Promise<string> {
  const user = await requireSessionUser();
  const shopId = await getOwnShopId(user.id);
  if (!shopId) {
    throw new Error("Your account isn't linked to a shop yet. Contact an administrator.");
  }
  return shopId;
}

/**
 * Throws when `key` has been hit more than `maxHits` times within
 * `windowSeconds` — use at the top of a Server Action, after
 * `requireSessionUser()`/`requireRole()`, right before the mutation. Backed
 * by the `check_rate_limit` Postgres function (fixed-window counter; see its
 * migration for the concurrency/tradeoff notes).
 */
export async function requireRateLimit(
  key: string,
  maxHits: number,
  windowSeconds: number,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_max_hits: maxHits,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // Fail open on infrastructure errors — a broken rate limiter should never
    // itself take down profile updates/order cancellation/cart checks.
    return;
  }
  if (data === false) {
    throw new Error("Too many attempts. Please try again in a moment.");
  }
}

export async function signInWithPassword(
  email: string,
  password: string,
  captchaToken: string,
) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });
  if (error) throw new Error(error.message);
}

/**
 * Verifies a password for the *already-authenticated* caller (Change
 * Password's "confirm your current password" step) — there is no separate
 * "verify password" API, so this re-runs the same sign-in grant Supabase
 * uses to prove identity. No captcha token, unlike the public
 * `signInWithPassword` above: the caller here is already a rate-limited,
 * signed-in session (see `changePasswordAction`), not the anonymous public
 * sign-in surface captcha protects — same proportionate, rate-limit-only
 * posture already used by `updatePasswordAction`'s recovery-session path.
 */
export async function reauthenticateWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

/**
 * Starts the PKCE OAuth flow for `provider` and returns the provider's
 * consent-screen URL. Does not redirect itself — there is no `window` in a
 * Server Action, so `signInWithOAuth` never auto-navigates here regardless;
 * the caller must `redirect(url)` explicitly.
 *
 * Whether this reuses an existing account or creates a new one is decided
 * server-side by Supabase Auth (GoTrue) before this call returns — it links
 * to an existing user only when the incoming identity's email is verified by
 * the provider, and never on a bare email-string match. Do not add
 * email-based matching logic anywhere in this app; that would bypass
 * Supabase's own pre-account-takeover safeguard.
 */
export async function signInWithOAuth(provider: OAuthProvider, next?: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl(next) },
  });
  if (error) throw new Error(error.message);
  if (!data.url) throw new Error("The sign-in provider did not return a redirect URL.");
  return data.url;
}

export async function signUpWithPassword(
  email: string,
  password: string,
  fullName: string,
  captchaToken: string,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      // Confirmation link lands on the PKCE callback, which sets the session.
      emailRedirectTo: callbackUrl(),
      captchaToken,
    },
  });
  if (error) throw new Error(error.message);
  // Supabase's anti-enumeration design for signUp(): calling it with an
  // email that already has an account returns success (no `error`), but
  // `data.user.identities` comes back empty and — critically — no new
  // confirmation email is sent. Without this check the caller sees
  // "success" and shows "check your email" even though nothing was sent.
  // Matches the existing `already registered` copy in mapAuthError, which
  // stays enumeration-safe ("couldn't create your account", not "that email
  // exists").
  if (data.user && data.user.identities?.length === 0) {
    throw new Error("already registered");
  }
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    // Local cookies are still cleared in virtually all failure modes — this
    // is observability (so a failed server-side revoke doesn't silently
    // leave a session a race/second tab could still present as valid), not
    // a change in sign-out's user-facing behavior.
    console.error("[auth] signOut failed to fully revoke session:", error.message);
  }
}

/**
 * Sends a password-recovery email. The link returns to the PKCE callback, which
 * establishes a session and forwards to the reset-password screen (built in the
 * auth phase).
 */
export async function sendPasswordResetEmail(email: string, captchaToken: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl(ROUTES.resetPassword),
    captchaToken,
  });
  if (error) throw new Error(error.message);
}

/**
 * Sets a new password for the currently-authenticated (recovery) session,
 * then revokes every *other* session on the account. A successful password
 * recovery is a strong proof of ownership — this is the right moment to
 * shake loose any other session (a stale device, or one an attacker
 * obtained through a different vector) rather than leaving it valid.
 */
export async function updatePassword(newPassword: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);

  // Read back the (now-updated) session's access token purely to identify
  // it to the admin API below — not used for any auth decision, so this is
  // a safe, narrow exception to the "use getUser(), not getSession()" rule.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    try {
      // Best-effort: a failure here (including a missing service-role key
      // in local dev) must not fail the password change itself.
      const admin = createSupabaseAdminClient();
      await admin.auth.admin.signOut(session.access_token, "others");
    } catch {
      // Swallowed deliberately — see comment above.
    }
  }
}

/** Re-sends the sign-up confirmation email for an unverified address. */
export async function resendVerificationEmail(email: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: callbackUrl() },
  });
  if (error) throw new Error(error.message);
}

/**
 * All identities (password, Google, Facebook, …) linked to the current
 * session's user. Requires an authenticated session — call behind
 * `requireSessionUser()`.
 */
export async function listUserIdentities(): Promise<UserIdentity[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw new Error(error.message);
  return data.identities;
}

/**
 * Manual identity linking (Supabase Dashboard → Authentication →
 * "Enable Manual Linking" must be on): attaches `provider` to the
 * *currently signed-in* user, regardless of whether its email matches or is
 * verified — safe specifically because the caller is already proven to own
 * the target account, unlike automatic linking, which only trusts a
 * provider-verified email. This is the sanctioned fallback for cases (e.g.
 * Facebook without a verified email) where `signInWithOAuth` cannot safely
 * auto-link on its own. Same PKCE round trip as `signInWithOAuth`; the
 * existing `/auth/callback` route completes it unchanged.
 */
export async function linkOAuthIdentity(provider: OAuthProvider, next?: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: callbackUrl(next) },
  });
  if (error) throw new Error(error.message);
  if (!data.url) throw new Error("The sign-in provider did not return a redirect URL.");
  return data.url;
}

/**
 * Detaches `identity` from the current user. Supabase requires at least 2
 * remaining identities on the account — surface that in the UI rather than
 * letting this throw as the first the user hears of it.
 */
export async function unlinkOAuthIdentity(identity: UserIdentity): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) throw new Error(error.message);
}

// ============================================================================
// Cart (authenticated — Phase 2B). Guest carts stay entirely client-side
// (CartProvider/localStorage, untouched); this is the server-persisted cart
// for signed-in users only, so the same account sees the same cart across
// browsers/devices. No price/stock is ever stored on a cart line or trusted
// from a caller — `quantity` is the only writable field, and every display
// field below is resolved live via join (checkCartAvailability, unchanged
// since Phase 3c, remains the sanctioned re-validation path before checkout).
//
// Every function here takes `userId` as an explicit parameter, always
// resolved by the caller via `requireSessionUser()` — never accept a
// client-supplied id for authorization. RLS (`carts`/`cart_items`, Phase 2A)
// is the real boundary; scoping every query through `getOrCreateCart(userId)`
// is defense-in-depth on top of it, same double-layer pattern as
// `updateProduct`'s `owner` filter.
// ============================================================================

type CartItemRow = Database["public"]["Tables"]["cart_items"]["Row"];

const CART_ITEM_COLUMNS = `
  id, cart_id, product_id, variant_id, quantity, created_at, updated_at,
  product:products!cart_items_product_id_fkey (
    title, slug, price_cents, currency, seller_id,
    product_images ( url ),
    seller:profiles!products_seller_id_fkey ( full_name, username, role )
  ),
  variant:product_variants!cart_items_variant_id_fkey ( color, size, price_cents )
`;

type CartItemRowWithJoins = CartItemRow & {
  product: {
    title: string;
    slug: string;
    price_cents: number;
    currency: string;
    seller_id: string | null;
    product_images: { url: string }[];
    seller: Pick<ProfileRow, "full_name" | "username" | "role"> | null;
  } | null;
  variant: {
    color: string | null;
    size: string | null;
    price_cents: number | null;
  } | null;
};

/** One line in an authenticated user's persistent cart, with live-joined display data. */
export interface CartLineItem {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  productTitle: string;
  productSlug: string;
  imageUrl: string | null;
  /** Variant price override, else the product's own price — always live, never stored. */
  unitPriceCents: number;
  currency: string;
  sellerId: string | null;
  sellerName: string | null;
  sellerRole: UserRole | null;
  variantLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * `null` when the joined product no longer resolves (sold/archived beyond
 * RLS's public visibility, or hard-deleted) — mirrors `getBuyerOrder`'s "a
 * sold/archived product resolves to null" note. Callers should treat a
 * `null` line the same way `checkCartAvailability` treats a missing id: no
 * longer available.
 */
function toCartLineItem(row: CartItemRowWithJoins): CartLineItem | null {
  if (!row.product) return null;
  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    quantity: row.quantity,
    productTitle: row.product.title,
    productSlug: row.product.slug,
    imageUrl: row.product.product_images?.[0]?.url ?? null,
    unitPriceCents: row.variant?.price_cents ?? row.product.price_cents,
    currency: row.product.currency,
    sellerId: row.product.seller_id,
    sellerName: sellerDisplayName(row.product.seller_id, row.product.seller),
    sellerRole: (row.product.seller?.role as UserRole | undefined) ?? null,
    variantLabel: row.variant
      ? [row.variant.color, row.variant.size].filter(Boolean).join(" / ") || null
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Returns the signed-in user's cart, creating it on first use (`carts` has
 * no other write path). `userId` must already be `requireSessionUser()`-
 * resolved. Races two concurrent first-time callers safely: the loser's
 * INSERT hits `carts_one_per_user` (23505) and re-reads the winner's row
 * instead of erroring.
 */
export async function getOrCreateCart(userId: string): Promise<{ id: string }> {
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: readError } = await supabase
    .from(DATABASE_TABLES.CARTS)
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    throw queryError("Failed to load cart", readError);
  }
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from(DATABASE_TABLES.CARTS)
    .insert({ user_id: userId })
    .select("id")
    .single();

  if (!insertError) return created;

  if (insertError.code === "23505") {
    const { data: raceWinner, error: raceReadError } = await supabase
      .from(DATABASE_TABLES.CARTS)
      .select("id")
      .eq("user_id", userId)
      .single();
    if (raceReadError) {
      throw queryError("Failed to load cart", raceReadError);
    }
    return raceWinner;
  }
  throw queryError("Failed to create cart", insertError);
}

/** The signed-in user's cart lines, oldest first, with live display data. */
export async function listCartItems(userId: string): Promise<CartLineItem[]> {
  const supabase = await createSupabaseServerClient();
  const cart = await getOrCreateCart(userId);

  const { data, error } = await supabase
    .from(DATABASE_TABLES.CART_ITEMS)
    .select(CART_ITEM_COLUMNS)
    .eq("cart_id", cart.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw queryError("Failed to load cart items", error);
  }

  return (data ?? [])
    .map((row) => toCartLineItem(row as CartItemRowWithJoins))
    .filter((item): item is CartLineItem => item !== null);
}

export interface AddCartItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

/**
 * Adds a line, or increments an existing one — same product+variant merges,
 * a different variant stays a separate line; `cart_items`'s partial unique
 * indexes (Phase 2A) are the real guarantee, not this function's control
 * flow. PostgREST's upsert can't target a *partial* unique index, so this
 * does the insert-or-increment dance explicitly: try the insert, and on the
 * expected unique-violation, increment the existing row instead. The unique
 * indexes make this race-safe regardless of which caller "wins" the insert —
 * two concurrent adds can never create a duplicate row, at worst one retries
 * once as an update.
 */
export async function addCartItem(
  userId: string,
  input: AddCartItemInput,
): Promise<CartLineItem> {
  const supabase = await createSupabaseServerClient();
  const cart = await getOrCreateCart(userId);

  const { data: inserted, error: insertError } = await supabase
    .from(DATABASE_TABLES.CART_ITEMS)
    .insert({
      cart_id: cart.id,
      product_id: input.productId,
      variant_id: input.variantId ?? null,
      quantity: input.quantity,
    })
    .select(CART_ITEM_COLUMNS)
    .single();

  if (!insertError) {
    const item = toCartLineItem(inserted as CartItemRowWithJoins);
    if (!item) throw new Error("This product is no longer available.");
    return item;
  }

  if (insertError.code !== "23505") {
    // Covers 23503 (product/variant FK no longer exists) and the
    // cart_items_validate_variant trigger's 23514 (variant belongs to a
    // different product) via mapPostgresError's existing rules, same
    // pattern as updateMyProfile.
    throw new Error(mapPostgresError(insertError, "Could not add this item to your cart."));
  }

  // Line already exists — increment it instead, scoped by the exact same
  // key the unique index protects, so this can never touch a sibling line.
  let existingQuery = supabase
    .from(DATABASE_TABLES.CART_ITEMS)
    .select("id, quantity")
    .eq("cart_id", cart.id)
    .eq("product_id", input.productId);
  existingQuery = input.variantId
    ? existingQuery.eq("variant_id", input.variantId)
    : existingQuery.is("variant_id", null);

  const { data: existing, error: readError } = await existingQuery.single();
  if (readError) {
    throw queryError("Failed to add item to cart", readError);
  }

  const { data: updated, error: updateError } = await supabase
    .from(DATABASE_TABLES.CART_ITEMS)
    .update({ quantity: existing.quantity + input.quantity })
    .eq("id", existing.id)
    .select(CART_ITEM_COLUMNS)
    .single();

  if (updateError) {
    throw queryError("Failed to add item to cart", updateError);
  }
  const item = toCartLineItem(updated as CartItemRowWithJoins);
  if (!item) throw new Error("This product is no longer available.");
  return item;
}

/**
 * Sets one line's quantity outright (not a delta). `cartItemId` is
 * client-supplied — the `.eq("cart_id", cart.id)` filter is what makes this
 * safe: `cart.id` is always resolved server-side from `userId`, never from
 * the caller, so a foreign cart's item id structurally cannot match, on top
 * of RLS already blocking it.
 */
export async function updateCartItemQuantity(
  userId: string,
  cartItemId: string,
  quantity: number,
): Promise<CartLineItem> {
  const supabase = await createSupabaseServerClient();
  const cart = await getOrCreateCart(userId);

  const { data, error } = await supabase
    .from(DATABASE_TABLES.CART_ITEMS)
    .update({ quantity })
    .eq("id", cartItemId)
    .eq("cart_id", cart.id)
    .select(CART_ITEM_COLUMNS)
    .maybeSingle();

  if (error) {
    throw queryError("Failed to update cart item", error);
  }
  if (!data) {
    throw new Error("Cart item not found.");
  }
  const item = toCartLineItem(data as CartItemRowWithJoins);
  if (!item) throw new Error("This product is no longer available.");
  return item;
}

/** Removes one line. Same `cart_id` defense-in-depth as `updateCartItemQuantity`. */
export async function removeCartItem(userId: string, cartItemId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const cart = await getOrCreateCart(userId);

  const { error, count } = await supabase
    .from(DATABASE_TABLES.CART_ITEMS)
    .delete({ count: "exact" })
    .eq("id", cartItemId)
    .eq("cart_id", cart.id);

  if (error) {
    throw queryError("Failed to remove cart item", error);
  }
  if (!count) {
    throw new Error("Cart item not found.");
  }
}

/**
 * Removes several lines at once — e.g. clearing exactly the items a
 * checkout just placed. Silently ignores ids that don't exist or don't
 * belong to this cart, rather than erroring, matching the client
 * `removeMany` reducer action's own "best effort" semantics.
 */
export async function removeManyCartItems(
  userId: string,
  cartItemIds: string[],
): Promise<void> {
  if (cartItemIds.length === 0) return;
  const supabase = await createSupabaseServerClient();
  const cart = await getOrCreateCart(userId);

  const { error } = await supabase
    .from(DATABASE_TABLES.CART_ITEMS)
    .delete()
    .eq("cart_id", cart.id)
    .in("id", cartItemIds);

  if (error) {
    throw queryError("Failed to remove cart items", error);
  }
}

/** Empties the signed-in user's cart entirely. */
export async function clearCart(userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const cart = await getOrCreateCart(userId);

  const { error } = await supabase
    .from(DATABASE_TABLES.CART_ITEMS)
    .delete()
    .eq("cart_id", cart.id);

  if (error) {
    throw queryError("Failed to clear cart", error);
  }
}

export interface MergeGuestCartResult {
  mergedCount: number;
  failedCount: number;
}

/**
 * Folds a just-authenticated guest cart into the signed-in user's persistent
 * cart — one call to the existing `addCartItem` per line, so the same
 * product+variant merges into an existing line (summed) exactly the way a
 * normal "add to cart" already does; a new variant becomes a new line the
 * same way too. Deliberately does **not** re-check stock/availability here:
 * a line that's gone stale (archived product, insufficient stock) is already
 * handled, uniformly, by the existing `checkCartAvailability` + `CartSummary`
 * "no longer available" / "only N left" banners the moment the merged cart
 * is displayed — duplicating that check here would just be the same logic
 * twice. A single bad line (e.g. a hard-deleted product, which `addCartItem`
 * surfaces as a friendly error) is caught and counted, not allowed to abort
 * the rest of the merge.
 */
export async function mergeGuestCart(
  userId: string,
  items: AddCartItemInput[],
): Promise<MergeGuestCartResult> {
  let mergedCount = 0;
  let failedCount = 0;

  for (const item of items) {
    try {
      await addCartItem(userId, item);
      mergedCount++;
    } catch {
      failedCount++;
    }
  }

  return { mergedCount, failedCount };
}

// ============================================================================
// Guided Product Selection — recommendation rules (schema + admin/seller
// authoring only; the buyer-facing matching query is a separate, later
// phase). Rule-based per DECISIONS.md ADR-009 — never AI/ML. A rule never
// stores budget — see the migration's header comment; budget is matched
// against a product's/variant's live price, not duplicated here.
// ============================================================================

type RecommendationRuleRow = Database["public"]["Tables"]["recommendation_rules"]["Row"];

const RECOMMENDATION_RULE_COLUMNS = `
  id, product_id, variant_id, seller_id, shop_id, occasion, size, active,
  created_at, updated_at,
  product:products!recommendation_rules_product_id_fkey ( title, slug ),
  variant:product_variants!recommendation_rules_variant_id_fkey ( color, size )
`;

type RecommendationRuleRowWithJoins = RecommendationRuleRow & {
  product: { title: string; slug: string } | null;
  variant: { color: string | null; size: string | null } | null;
};

function toRecommendationRule(row: RecommendationRuleRowWithJoins): RecommendationRule {
  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    sellerId: row.seller_id,
    shopId: row.shop_id,
    occasion: row.occasion as RecommendationOccasion | null,
    size: row.size,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    productTitle: row.product?.title ?? "",
    productSlug: row.product?.slug ?? "",
    variantLabel: row.variant
      ? [row.variant.color, row.variant.size].filter(Boolean).join(" / ") || null
      : null,
  };
}

/** A product's own Guided Selection rules, oldest first. */
export async function listProductRecommendationRules(
  productId: string,
): Promise<RecommendationRule[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.RECOMMENDATION_RULES)
    .select(RECOMMENDATION_RULE_COLUMNS)
    .eq("product_id", productId)
    .order("created_at", { ascending: true });

  if (error) {
    throw queryError("Failed to load recommendation rules", error);
  }
  return (data ?? []).map((row) => toRecommendationRule(row as RecommendationRuleRowWithJoins));
}

/**
 * Every rule visible to the caller — no manual filter, mirrors
 * `listDashboardProductVariants()`'s "RLS alone is the boundary" pattern.
 * Fetched once by the dashboard page and grouped by `productId` client-side.
 */
export async function listDashboardRecommendationRules(): Promise<RecommendationRule[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.RECOMMENDATION_RULES)
    .select(RECOMMENDATION_RULE_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) {
    throw queryError("Failed to load recommendation rules", error);
  }
  return (data ?? []).map((row) => toRecommendationRule(row as RecommendationRuleRowWithJoins));
}

export interface RecommendationRuleInput {
  variantId?: string;
  occasion?: RecommendationOccasion;
  size?: string;
}

/** Creates a rule for a product the caller owns (or, for admin, any product — moderation, not ownership). */
export async function createRecommendationRule(
  productId: string,
  sellerId: string,
  shopId: string | null,
  input: RecommendationRuleInput,
): Promise<RecommendationRule> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(DATABASE_TABLES.RECOMMENDATION_RULES)
    .insert({
      product_id: productId,
      seller_id: sellerId,
      shop_id: shopId,
      variant_id: input.variantId ?? null,
      occasion: input.occasion ?? null,
      size: input.size || null,
    })
    .select(RECOMMENDATION_RULE_COLUMNS)
    .single();

  if (error) {
    throw new Error(mapPostgresError(error, "Failed to create recommendation rule."));
  }
  return toRecommendationRule(data as RecommendationRuleRowWithJoins);
}

/** Updates a rule's match criteria/active flag. Ownership re-checked beyond RLS, same pattern as `updateProductVariant`. */
export async function updateRecommendationRule(
  id: string,
  owner: { sellerId: string; shopId: string | null } | null,
  input: RecommendationRuleInput & { active?: boolean },
): Promise<RecommendationRule> {
  const supabase = await createSupabaseServerClient();

  if (owner) {
    const ownerFilter = owner.shopId
      ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
      : `seller_id.eq.${owner.sellerId}`;
    const { data: existing, error: readError } = await supabase
      .from(DATABASE_TABLES.RECOMMENDATION_RULES)
      .select("id")
      .eq("id", id)
      .or(ownerFilter)
      .maybeSingle();
    if (readError) {
      throw new Error(`Failed to load recommendation rule: ${readError.message}`);
    }
    if (!existing) {
      throw new Error("Recommendation rule not found.");
    }
  }

  const { data, error } = await supabase
    .from(DATABASE_TABLES.RECOMMENDATION_RULES)
    .update({
      variant_id: input.variantId ?? null,
      occasion: input.occasion ?? null,
      size: input.size || null,
      ...(input.active !== undefined ? { active: input.active } : {}),
    })
    .eq("id", id)
    .select(RECOMMENDATION_RULE_COLUMNS)
    .single();

  if (error) {
    throw new Error(mapPostgresError(error, "Failed to update recommendation rule."));
  }
  return toRecommendationRule(data as RecommendationRuleRowWithJoins);
}

/** Deletes a rule. No historical/financial dependency (unlike a variant), so this never needs a friendly FK-restrict message. */
export async function deleteRecommendationRule(
  id: string,
  owner: { sellerId: string; shopId: string | null } | null,
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  if (owner) {
    const ownerFilter = owner.shopId
      ? `seller_id.eq.${owner.sellerId},shop_id.eq.${owner.shopId}`
      : `seller_id.eq.${owner.sellerId}`;
    const { data: existing, error: readError } = await supabase
      .from(DATABASE_TABLES.RECOMMENDATION_RULES)
      .select("id")
      .eq("id", id)
      .or(ownerFilter)
      .maybeSingle();
    if (readError) {
      throw new Error(`Failed to load recommendation rule: ${readError.message}`);
    }
    if (!existing) {
      throw new Error("Recommendation rule not found.");
    }
  }

  const { error } = await supabase
    .from(DATABASE_TABLES.RECOMMENDATION_RULES)
    .delete()
    .eq("id", id);

  if (error) {
    throw queryError("Failed to delete recommendation rule", error);
  }
}

// ============================================================================
// Guided Product Selection — buyer-facing matching query. Public (no
// `requireSessionUser()`) — a guest can use Guided Selection with no
// account, same as the rest of the catalog/cart reads (ADR-013's precedent).
// ============================================================================

// Literal for the same reason as `PRODUCT_COLUMNS`/`RECOMMENDATION_RULE_COLUMNS`
// above: the embedded product select must repeat `PRODUCT_COLUMNS`' column
// list as its own literal, not `${PRODUCT_COLUMNS}` — interpolating a
// constant widens the string and Supabase's generated-type parser can no
// longer infer the joined shape.
const GUIDED_SELECTION_MATCH_COLUMNS = `
  id, variant_id, size,
  variant:product_variants!recommendation_rules_variant_id_fkey ( color, size, price_cents ),
  product:products!recommendation_rules_product_id_fkey!inner (
    id, slug, title, description, price_cents, currency, quantity, condition,
    status, featured, location, tags, category_id, seller_id, shop_id, published_at,
    created_at, updated_at,
    product_images ( id, url, alt_text, sort_order ),
    seller:profiles!products_seller_id_fkey ( full_name, username, role ),
    category:categories!products_category_id_fkey ( name, slug )
  )
`;

type GuidedSelectionMatchRow = {
  variant_id: string | null;
  size: string | null;
  variant: { color: string | null; size: string | null; price_cents: number | null } | null;
  product: ProductRowWithImages;
};

export interface GuidedSelectionMatchInput {
  occasion?: RecommendationOccasion;
  /** Free text, same convention as `product_variants.size`/`recommendation_rules.size`. */
  size?: string;
  /** Major-unit pesos (not cents) — converted to price_cents below. */
  minPrice?: number;
  maxPrice?: number;
}

/**
 * Matches active rules of active products against the buyer's occasion/size
 * answers (an unanswered criterion matches anything) and checks each match's
 * *live* price — the variant's price when the rule targets one, else the
 * product's own price — against the buyer's budget window. Budget is never
 * compared to a stored value (see the `recommendation_rules` migration's
 * header comment).
 *
 * Occasion is filtered in SQL (a fixed enum, safe to interpolate). Size and
 * budget are applied in application code instead: size is free text — unsafe
 * to interpolate into a PostgREST `.or()` filter string, the same concern
 * `listProducts`'s `params.search` sanitizes for — and budget needs the
 * per-row variant-or-product price resolution above, which SQL can't express
 * as a single column filter here. The admin-authored rule table is small, so
 * filtering the fetched rows in memory (rather than a second round trip) is
 * the simplest correct option (KISS).
 */
export async function listGuidedSelectionMatches(
  input: GuidedSelectionMatchInput,
  limit = 24,
): Promise<GuidedSelectionMatch[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from(DATABASE_TABLES.RECOMMENDATION_RULES)
    .select(GUIDED_SELECTION_MATCH_COLUMNS)
    .eq("active", true)
    .eq("product.status", PRODUCT_STATUS.active);

  if (input.occasion) {
    query = query.or(`occasion.is.null,occasion.eq.${input.occasion}`);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw queryError("Failed to load Guided Selection matches", error);
  }

  const wantedSize = input.size?.trim().toLowerCase();
  const minCents = input.minPrice !== undefined ? toCents(input.minPrice) : null;
  const maxCents = input.maxPrice !== undefined ? toCents(input.maxPrice) : null;

  const seen = new Set<string>();
  const matches: GuidedSelectionMatch[] = [];

  for (const row of (data ?? []) as unknown as GuidedSelectionMatchRow[]) {
    if (!row.product) continue;
    if (row.size && wantedSize && row.size.trim().toLowerCase() !== wantedSize) continue;

    const matchedPriceCents = row.variant?.price_cents ?? row.product.price_cents;
    if (minCents !== null && matchedPriceCents < minCents) continue;
    if (maxCents !== null && matchedPriceCents > maxCents) continue;

    const dedupeKey = `${row.product.id}:${row.variant_id ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    matches.push({
      product: toProduct(row.product),
      variantId: row.variant_id,
      variantLabel: row.variant
        ? [row.variant.color, row.variant.size].filter(Boolean).join(" / ") || null
        : null,
      matchedPriceCents,
    });

    if (matches.length >= limit) break;
  }

  return matches;
}
