/**
 * Pure helpers for variant-specific product photos (`product_images.variant_id`).
 * Structural types on purpose — `lib/utils` must not import from `features`.
 */

interface ColorVariant {
  id: string;
  color: string | null;
}

interface TaggableImage {
  variantId: string | null;
}

/**
 * One entry per distinct color, in variant order, each carrying the first
 * variant that has it. A color can span several variants (Blue/S, Blue/M);
 * a photo tagged to the representative variant counts for the whole color
 * (see `filterImagesForColor`).
 */
export function getColorOptions<V extends ColorVariant>(
  variants: V[],
): { color: string; variantId: string }[] {
  const seen = new Set<string>();
  const options: { color: string; variantId: string }[] = [];
  for (const variant of variants) {
    if (variant.color && !seen.has(variant.color)) {
      seen.add(variant.color);
      options.push({ color: variant.color, variantId: variant.id });
    }
  }
  return options;
}

/**
 * The gallery to show for the selected color. Never returns an empty list for
 * a non-empty input:
 *  - no color selected -> every image (today's behavior);
 *  - some images are tagged to that color's variant(s) -> only those;
 *  - none tagged for that color -> the shared (untagged) images, so photos
 *    reserved for a *different* color never show up here; and if there are no
 *    shared images either, every image.
 * A product that never tags a photo is therefore always shown in full.
 */
export function filterImagesForColor<I extends TaggableImage, V extends ColorVariant>(
  images: I[],
  variants: V[],
  color: string | null,
): I[] {
  if (!color) return images;
  const variantIds = new Set(variants.filter((v) => v.color === color).map((v) => v.id));
  const tagged = images.filter((image) => image.variantId !== null && variantIds.has(image.variantId));
  if (tagged.length > 0) return tagged;
  const shared = images.filter((image) => image.variantId === null);
  return shared.length > 0 ? shared : images;
}
