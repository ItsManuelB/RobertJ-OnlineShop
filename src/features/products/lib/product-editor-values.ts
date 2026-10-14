import { isOccasion, type Occasion } from "@/constants/occasions";
import { PRODUCT_CONDITION, PRODUCT_STATUS, type ProductCondition, type ProductStatus } from "@/constants/status";
import type { CategoryAttribute, ProductAttributeKey } from "@/features/categories/types/category.types";
import type { Product } from "@/features/products/types/product.types";
import { fromCents } from "@/lib/utils/currency";

/** Every field the product editor edits, as plain form values. */
export interface ProductEditorValues {
  title: string;
  description: string;
  /** Major-unit pesos, as typed. */
  price: string;
  quantity: string;
  condition: ProductCondition;
  status: ProductStatus;
  featured: boolean;
  categoryId: string;
  location: string;
  material: string;
  dimensions: string;
  /** "Good for" occasions — stored as product tags, read by Guided Selection. */
  occasions: Occasion[];
}

type SpecKey = Extract<ProductAttributeKey, "material" | "dimensions">;

export interface SpecAttribute extends CategoryAttribute {
  attributeKey: SpecKey;
}

export function valuesFromProduct(product?: Product): ProductEditorValues {
  return {
    title: product?.title ?? "",
    description: product?.description ?? "",
    price: product ? String(fromCents(product.priceCents)) : "",
    quantity: String(product?.quantity ?? 0),
    condition: product?.condition ?? PRODUCT_CONDITION.new,
    status: product?.status ?? PRODUCT_STATUS.draft,
    featured: product?.featured ?? false,
    categoryId: product?.categoryId ?? "",
    location: product?.location ?? "",
    material: product?.material ?? "",
    dimensions: product?.dimensions ?? "",
    occasions: (product?.tags ?? []).filter(isOccasion),
  };
}

/**
 * The spec-only attributes (material/dimensions) the selected category asks
 * for. Variant-eligible attributes are an Options concern, and color/size have
 * no column on `products` (they only exist per option), so neither belongs here.
 */
export function getSpecAttributes(attributes: CategoryAttribute[], categoryId: string): SpecAttribute[] {
  return attributes
    .filter(
      (attribute) =>
        attribute.categoryId === categoryId &&
        !attribute.isVariantEligible &&
        (attribute.attributeKey === "material" || attribute.attributeKey === "dimensions"),
    )
    .sort((a, b) => a.displayOrder - b.displayOrder) as SpecAttribute[];
}

/**
 * Builds the exact FormData `createProductAction` / `updateProductAction`
 * parse. Built from values, never read off the DOM, so nothing else on the
 * page can leak into the request. `enabledSpecs` are the optional specs the
 * seller switched on; an optional spec that is off is sent as an empty string
 * so saving actually clears a previously set value (an absent field would read
 * as "no change" to the partial update schema). A spec the category does not
 * ask for is not sent at all.
 *
 * `saved` (editing): the spec values already stored on the product. A spec
 * whose value is unchanged is left out of the request, so saving an edit
 * never rewrites columns the seller did not touch.
 */
export function toProductFormData(
  values: ProductEditorValues,
  specs: SpecAttribute[],
  enabledSpecs: ReadonlySet<SpecKey>,
  extra: Record<string, string> = {},
  saved?: Partial<Record<SpecKey, string | null>>,
): FormData {
  const formData = new FormData();
  formData.set("title", values.title);
  formData.set("description", values.description);
  formData.set("price", values.price);
  formData.set("quantity", values.quantity);
  formData.set("condition", values.condition);
  formData.set("status", values.status);
  formData.set("location", values.location);
  if (values.featured) formData.set("featured", "on");
  if (values.categoryId) formData.set("categoryId", values.categoryId);
  formData.set("occasions", values.occasions.join(","));
  for (const spec of specs) {
    const active = spec.isRequired || enabledSpecs.has(spec.attributeKey);
    const next = active ? values[spec.attributeKey] : "";
    if (saved && next === (saved[spec.attributeKey] ?? "")) continue;
    formData.set(spec.attributeKey, next);
  }
  for (const [key, value] of Object.entries(extra)) formData.set(key, value);
  return formData;
}
