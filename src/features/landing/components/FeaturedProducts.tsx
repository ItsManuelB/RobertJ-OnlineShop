import { USER_ROLES, type UserRole } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { canPurchase } from "@/lib/auth/permissions";
import { FeaturedProductsGrid } from "@/features/landing/components/FeaturedProductsGrid";
import type { FeaturedProductView } from "@/features/landing/types/landing.types";
import { getCoverImage } from "@/features/products/types/product.types";
import type { Product } from "@/features/products/types/product.types";
import {
  getProductSoldCounts,
  listProductIdsWithVariants,
  getSessionUser,
  getShopNamesBySellerIds,
  listFeaturedProducts,
  listWishlistProductIds,
} from "@/lib/supabase/queries";

/** Shown for a real product with no uploaded photo yet — not a fabricated product image. */
const FALLBACK_IMAGE = "/landing/product-knit-pullover.jpg";

/**
 * "Picked for You" featured products. Fetches active, `featured` products
 * from Supabase and maps them into the grid's view model. There is no
 * placeholder/fallback content: when nothing is flagged featured yet, the
 * grid renders its own empty state rather than showing fabricated products
 * (this project doesn't fabricate marketplace signals — see `FeaturedShop`).
 * Sale/New are derived from the `tags` convention (no compare-at column
 * exists in the schema, so a discount is only ever shown when real,
 * verifiable original-price data does — see `ProductTile`).
 */
export async function FeaturedProducts() {
  let products: Product[] = [];
  try {
    products = await listFeaturedProducts(8);
  } catch {
    // Degrade to the grid's empty state rather than surfacing a broken
    // homepage — matches the resilience pattern used by `ProductCategories`.
    products = [];
  }

  const sellerIds = [
    ...new Set(
      products
        .map((product) => product.sellerId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const shopNames =
    sellerIds.length > 0
      ? await getShopNamesBySellerIds(sellerIds).catch(() => new Map<string, string>())
      : new Map<string, string>();

  const soldCounts =
    products.length > 0
      ? await getProductSoldCounts(products.map((product) => product.id)).catch(
          () => new Map<string, number>(),
        )
      : new Map<string, number>();

  const optionProductIds =
    products.length > 0
      ? await listProductIdsWithVariants(products.map((product) => product.id)).catch(
          () => new Set<string>(),
        )
      : new Set<string>();

  const views: FeaturedProductView[] = products.map((product) => ({
    key: product.id,
    name: product.title,
    // See ProductGrid.tsx's toTileItem for why sellerName is gated
    // on role: only a genuine `seller` account is ever a real shop owner.
    shop:
      (product.sellerId ? shopNames.get(product.sellerId) : null) ??
      (product.sellerRole === USER_ROLES.seller ? product.sellerName : null) ??
      "RobertJ Seller",
    priceCents: product.priceCents,
    originalPriceCents: null,
    imageUrl: getCoverImage(product)?.url ?? FALLBACK_IMAGE,
    category: product.categoryName ?? "",
    isNew: product.tags.includes("new"),
    isSale: product.tags.includes("sale"),
    href: ROUTES.productDetail(product.slug),
    productId: product.id,
    slug: product.slug,
    currency: product.currency,
    maxQuantity: product.quantity,
    sellerId: product.sellerId,
    soldCount: soldCounts.get(product.id) ?? 0,
    hasOptions: optionProductIds.has(product.id),
  }));

  const user = await getSessionUser();
  const wishlistedProductIds = user
    ? await listWishlistProductIds(user.id).catch(() => [])
    : [];

  return (
    <section className="bg-rj-white py-24">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <FeaturedProductsGrid
          products={views}
          wishlistedProductIds={wishlistedProductIds}
          isAuthenticated={user !== null}
          canPurchase={user === null || canPurchase(user.role as UserRole)}
        />
      </div>
    </section>
  );
}
