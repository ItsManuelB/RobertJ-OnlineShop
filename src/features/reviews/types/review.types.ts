import type { RatingBreakdown } from "@/features/reviews/utils/review-format";

/**
 * One review as the app uses it. Real reviews come from a delivered purchase
 * (`submit_review`); demo reviews (`isDemo`) are presentation-only samples with no
 * order behind them and are never shown as verified. `reviewerName` is already
 * masked ("Mia S.") — the stored name is never sent to the page.
 */
export interface Review {
  id: string;
  orderItemId: string | null;
  productId: string;
  reviewerName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  /** Set when the buyer edited it. */
  editedAt: string | null;
  /** What was bought, e.g. "Black / M". */
  variantLabel: string | null;
  isDemo: boolean;
  /** True for a real, delivered purchase. */
  isVerified: boolean;
  sellerReply: string | null;
  sellerRepliedAt: string | null;
  /** Only visible to admins, the author and the shop. */
  hiddenAt: string | null;
  hiddenReason: string | null;
}

/** A product's visible reviews plus a live-computed summary — never denormalized. */
export interface ProductReviewSummary extends RatingBreakdown {
  reviews: Review[];
  /** How many of them have a written comment. */
  withComments: number;
  /** Average and count of real (non-demo) reviews only — what search engines may see. */
  verified: { average: number | null; count: number };
}

/** Average and count for one product's tile. */
export interface RatingSummary {
  average: number;
  count: number;
}

/** A review shown on the homepage, with the product it belongs to. */
export interface FeaturedReview extends Review {
  productTitle: string;
  productSlug: string;
  productImageUrl: string | null;
  shopName: string | null;
}

/** A delivered item the buyer has not reviewed yet. */
export interface ItemToReview {
  orderId: string;
  orderNumber: string;
  orderItemId: string;
  productId: string;
  productTitle: string;
  variantLabel: string | null;
  deliveredAt: string | null;
}

/** A review in the Seller or Admin portal, with its product. */
export interface ManagedReview extends Review {
  productTitle: string;
  productSlug: string;
  shopName: string | null;
}
