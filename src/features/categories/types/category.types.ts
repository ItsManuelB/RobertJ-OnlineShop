/** Domain model returned by the category service to the rest of the app. */
export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Cover image from `categories.image_url`; may be null (use a fallback). */
  imageUrl: string | null;
  /** Count of active products in this category, for the "N+ items" label. */
  productCount: number;
}

/**
 * Admin-only superset of `Category` — includes columns that already existed
 * on `categories` (`active`, `sortOrder`) but were never surfaced to the app
 * because no category management UI existed (see
 * docs/plans/product-specifications-and-variants-implementation.md Finding
 * F-1). Buyer-facing code keeps using the plain `Category` shape; this is
 * only for `/admin/categories`.
 */
export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
  productCount: number;
}

/** The four attributes `category_attributes` can configure per category. */
export type ProductAttributeKey = "color" | "size" | "material" | "dimensions";

/**
 * One row of `category_attributes` — per-category config for whether an
 * attribute is a hard-required spec, a seller opt-in variant axis, and/or
 * softly recommended. See the implementation plan §3.5 for the two-layer
 * requiredness model this encodes (`isRequired` and `isVariantEligible` are
 * mutually exclusive; `isRecommended` is only meaningful alongside
 * `isVariantEligible`).
 */
export interface CategoryAttribute {
  id: string;
  categoryId: string;
  attributeKey: ProductAttributeKey;
  isRequired: boolean;
  isVariantEligible: boolean;
  isRecommended: boolean;
  /** Admin-curated picklist (e.g. size: XS,S,M,L,XL); null = free text. */
  allowedValues: string[] | null;
  displayOrder: number;
}
