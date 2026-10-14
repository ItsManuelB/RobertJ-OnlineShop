import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Truck } from "lucide-react";

import { USER_ROLES, type UserRole } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { PRODUCT_CONDITION_LABELS } from "@/constants/status";
import { canPurchase } from "@/lib/auth/permissions";
import { formatCurrency } from "@/lib/utils/currency";
import { absoluteUrl } from "@/lib/utils/url";
import { CHECKOUT_CONSTANTS } from "@/features/checkout";
import {
  getProductBySlug,
  getSessionUser,
  getShopNamesBySellerIds,
  getVariantStock,
  isProductWishlisted,
  listCategoryAttributes,
  listProductReviews,
  listProductVariants,
} from "@/lib/supabase/queries";
import { Breadcrumbs } from "@/features/products/components/Breadcrumbs";
import { LOW_STOCK_THRESHOLD } from "@/features/products/constants/product.constants";
import { ProductGallery } from "@/features/products/components/ProductGallery";
import { ProductJsonLd } from "@/features/products/components/ProductJsonLd";
import { ProductQuantityAndAddToCart } from "@/features/products/components/ProductQuantityAndAddToCart";
import { RelatedProducts } from "@/features/products/components/RelatedProducts";
import { ProductReviews } from "@/features/reviews/components/ProductReviews";
import { StarRating } from "@/features/reviews/components/StarRating";

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  return {
    title: product?.title ?? "Product not found",
    description: product?.description ?? undefined,
  };
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) notFound();

  const user = await getSessionUser();
  const isWishlisted = user
    ? await isProductWishlisted(user.id, product.id).catch(() => false)
    : false;
  const shopNames = await getShopNamesBySellerIds(
    product.sellerId ? [product.sellerId] : [],
  ).catch(() => new Map<string, string>());
  // See ProductGrid.tsx's toTileItem for why sellerName is gated on role:
  // only a genuine `seller` account is ever a real shop owner.
  const shopName =
    (product.sellerId ? shopNames.get(product.sellerId) : null) ??
    (product.sellerRole === USER_ROLES.seller ? product.sellerName : null);
  const reviewSummary = await listProductReviews(product.id).catch(() => ({
    reviews: [],
    averageRating: null,
    reviewCount: 0,
  }));
  const variants = await listProductVariants(product.id).catch(() => []);
  const variantStockMap =
    variants.length > 0
      ? await getVariantStock(variants.map((variant) => variant.id)).catch(
          () => new Map<string, number>(),
        )
      : new Map<string, number>();
  const variantStock = Object.fromEntries(variantStockMap);
  const hasVariants = variants.length > 0;
  const categoryAttributes = product.categoryId
    ? await listCategoryAttributes(product.categoryId).catch(() => [])
    : [];

  const breadcrumbItems = [
    { label: "Home", href: ROUTES.home },
    { label: "Products", href: ROUTES.products },
    ...(product.categoryName
      ? [
          {
            label: product.categoryName,
            href: product.categorySlug
              ? ROUTES.categoryDetail(product.categorySlug)
              : undefined,
          },
        ]
      : []),
    { label: product.title },
  ];

  return (
    <article className="flex flex-col gap-10">
      <ProductJsonLd
        product={product}
        url={absoluteUrl(ROUTES.productDetail(product.slug))}
        reviewSummary={reviewSummary}
      />
      <Breadcrumbs items={breadcrumbItems} />

      <div className="grid gap-8 md:grid-cols-2 lg:gap-12">
        <ProductGallery images={product.images} title={product.title} />

        <div className="flex flex-col gap-5">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.3em] text-rj-red-dark">
              {product.categoryName ?? "New arrival"}
            </p>
            <h1 className="font-serif text-3xl leading-[1.05] text-rj-black md:text-4xl">
              {product.title}
            </h1>
            {shopName ? (
              <p className="mt-2 text-sm text-rj-gray-600">
                Sold by <span className="font-semibold text-rj-black">{shopName}</span>
              </p>
            ) : null}
          </div>

          {/* Ratings — real, verified-purchase reviews (see ProductReviews
              below); jumps straight to that section rather than duplicating
              the review list up here. */}
          {reviewSummary.reviewCount > 0 && reviewSummary.averageRating !== null ? (
            <a href="#reviews" className="flex w-fit items-center gap-2">
              <StarRating rating={reviewSummary.averageRating} size="md" />
              <span className="text-sm font-semibold text-rj-black">
                {reviewSummary.averageRating.toFixed(1)}
              </span>
              <span className="text-sm text-rj-gray-400 underline-offset-2 hover:underline">
                ({reviewSummary.reviewCount} review{reviewSummary.reviewCount === 1 ? "" : "s"})
              </span>
            </a>
          ) : (
            <p className="text-sm text-rj-gray-400">No reviews yet</p>
          )}

          {hasVariants ? null : (
            <p className="text-2xl font-bold text-rj-black">
              {formatCurrency(product.priceCents, product.currency)}
            </p>
          )}

          {hasVariants ? null : (
            <div>
              {product.quantity > LOW_STOCK_THRESHOLD ? (
                <span className="rounded-full bg-rj-green/10 px-3 py-1 text-[11px] font-bold text-rj-green">
                  {product.quantity} in stock
                </span>
              ) : product.quantity > 0 ? (
                <span className="rounded-full bg-rj-gold/10 px-3 py-1 text-[11px] font-bold text-rj-gold">
                  Only {product.quantity} left
                </span>
              ) : (
                <span className="rounded-full bg-rj-black px-3 py-1 text-[11px] font-bold text-rj-white">
                  Sold out
                </span>
              )}
            </div>
          )}

          {/* Shipping — this marketplace is domestic-only, flat-rate, single
              delivery method (no courier API), so this is the same real,
              static info the checkout Shipping step already shows, surfaced
              here for a buyer deciding whether to buy — not a fabricated
              per-product estimate. */}
          <div className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-rj-gray-100 px-3.5 py-3 text-sm">
            <Truck className="h-4 w-4 shrink-0 text-rj-gray-500" aria-hidden="true" />
            <span className="text-rj-black">
              {CHECKOUT_CONSTANTS.shippingFeeCentsPerSeller === 0 ? (
                <span className="font-semibold text-rj-green">Free Shipping</span>
              ) : (
                formatCurrency(CHECKOUT_CONSTANTS.shippingFeeCentsPerSeller, product.currency)
              )}
              <span className="text-rj-gray-400"> · {CHECKOUT_CONSTANTS.standardDeliveryLabel} — </span>
              <span className="text-rj-gray-600">
                {CHECKOUT_CONSTANTS.standardDeliveryEstimate.replace("Estimated delivery: ", "")}
              </span>
            </span>
          </div>

          <ProductQuantityAndAddToCart
            product={product}
            wishlist={{
              productId: product.id,
              initialSaved: isWishlisted,
              isAuthenticated: user !== null,
            }}
            shopName={shopName}
            variants={variants}
            variantStock={variantStock}
            categoryAttributes={categoryAttributes}
            canPurchase={user === null || canPurchase(user.role as UserRole)}
          />

          {/* Secondary info — condition/location tags and the free-text
              description, below the purchase panel so the buy box (price,
              shipping, variants, quantity, actions) stays uninterrupted.
              Condition is always real (every product has one); location and
              description are the only genuinely optional parts. */}
          <div className="flex flex-col gap-2.5 border-t border-rj-gray-100 pt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-rj-gray-500">
              Product Details
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border-[1.5px] border-rj-gray-200 px-3 py-1 text-[11px] font-bold text-rj-gray-600">
                {PRODUCT_CONDITION_LABELS[product.condition]}
              </span>
              {product.location ? (
                <span className="rounded-full border-[1.5px] border-rj-gray-200 px-3 py-1 text-[11px] font-bold text-rj-gray-600">
                  {product.location}
                </span>
              ) : null}
            </div>
            {product.description ? (
              <p className="text-sm leading-relaxed text-rj-gray-600">
                {product.description}
              </p>
            ) : null}

            {/* Category-driven specs (§9.1 of the implementation plan) — the
                product's own material/dimensions are the effective value
                here because only a *variant-eligible* attribute ever gets a
                per-variant override, and this block only ever shows an
                attribute that is NOT variant-eligible for this product's
                category (the variant-eligible ones are selectable pills
                above, in ProductQuantityAndAddToCart, instead). */}
            {product.material || product.dimensions ? (
              <dl className="flex flex-col gap-1.5 border-t border-rj-gray-100 pt-3">
                {product.material ? (
                  <div className="flex gap-2 text-sm">
                    <dt className="font-semibold text-rj-black">Material</dt>
                    <dd className="text-rj-gray-600">{product.material}</dd>
                  </div>
                ) : null}
                {product.dimensions ? (
                  <div className="flex gap-2 text-sm">
                    <dt className="font-semibold text-rj-black">Dimensions</dt>
                    <dd className="text-rj-gray-600">{product.dimensions}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
        </div>
      </div>

      <div id="reviews">
        <ProductReviews summary={reviewSummary} />
      </div>

      <Suspense fallback={null}>
        <RelatedProducts product={product} />
      </Suspense>
    </article>
  );
}
