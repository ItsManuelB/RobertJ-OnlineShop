/**
 * Bundled photos for categories that have no `image_url` of their own — the
 * one place that decides which picture a category shows, so the homepage's
 * "Shop Every Style" tiles and the /categories page always agree.
 */
export const CATEGORY_FALLBACK_IMAGES = [
  "/landing/category-shirts-tops.png",
  "/landing/category-bottoms.png",
  "/landing/category-outerwear.png",
  "/landing/category-decors-v2.jpg",
] as const;

/** Matched by category slug first, so the right photo follows the category even if the list order changes. */
const CATEGORY_IMAGE_BY_SLUG: Record<string, (typeof CATEGORY_FALLBACK_IMAGES)[number]> = {
  "shirts-tops": CATEGORY_FALLBACK_IMAGES[0],
  bottoms: CATEGORY_FALLBACK_IMAGES[1],
  outerwear: CATEGORY_FALLBACK_IMAGES[2],
  decors: CATEGORY_FALLBACK_IMAGES[3],
};

/**
 * The picture for a category tile: its own uploaded image if it has one,
 * otherwise the bundled photo for its slug, otherwise a bundled photo by
 * position (so a newly added category still gets an image).
 */
export function resolveCategoryImage(
  category: { slug: string; imageUrl: string | null },
  index: number,
): string {
  return (
    category.imageUrl ??
    CATEGORY_IMAGE_BY_SLUG[category.slug] ??
    CATEGORY_FALLBACK_IMAGES[index % CATEGORY_FALLBACK_IMAGES.length]
  );
}
