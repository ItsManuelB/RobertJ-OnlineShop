import {
  createProductVariantAction,
  deleteProductVariantAction,
  updateProductVariantAction,
} from "@/features/products/actions/product-variant.actions";
import type {
  ProductVariantFormInput,
  UpdateProductVariantInput,
} from "@/features/products/schemas/product-variant.schema";
import type { ProductVariant } from "@/features/products/types/product.types";
import { fail, ok } from "@/lib/utils/result";
import { toCents } from "@/lib/utils/currency";
import type { ActionResult } from "@/types/action.types";

/**
 * What the option (variant) editor does to its list. Two implementations
 * share one UI:
 *  - `liveVariantOps` saves each change to the server immediately (an
 *    existing product);
 *  - `draftVariantOps` keeps changes in memory (a product that does not exist
 *    yet) until the whole product is saved — see `product-save-flow`.
 */
export interface VariantOps {
  /** `current` is the list as the editor shows it now. The draft ops use it for the duplicate check; the live ops (checked by the server) ignore it. */
  create(input: ProductVariantFormInput, current: ProductVariant[]): Promise<ActionResult<ProductVariant>>;
  update(input: UpdateProductVariantInput, current: ProductVariant[]): Promise<ActionResult<ProductVariant>>;
  remove(id: string): Promise<ActionResult<null>>;
}

export const liveVariantOps: VariantOps = {
  create: (input) => createProductVariantAction(input),
  update: (input) => updateProductVariantAction(input),
  remove: (id) => deleteProductVariantAction({ id }),
};

/** Draft variants carry this id prefix until the server assigns a real one. */
export const DRAFT_VARIANT_PREFIX = "draft:";

const DUPLICATE_MESSAGE = "This combination of options already exists for this product.";

const AXES = ["color", "size", "material", "dimensions"] as const;

function sameCombination(
  a: Pick<ProductVariant, (typeof AXES)[number]>,
  b: Pick<ProductVariant, (typeof AXES)[number]>,
): boolean {
  return AXES.every((key) => (a[key] || null) === (b[key] || null));
}

/** In-memory ops. They mirror the server's duplicate rule (the unique combination index) so a draft can never hold two identical options. */
export const draftVariantOps: VariantOps = {
  async create(input, current) {
    const now = new Date().toISOString();
    const draft: ProductVariant = {
      id: `${DRAFT_VARIANT_PREFIX}${crypto.randomUUID()}`,
      productId: input.productId,
      sellerId: null,
      shopId: null,
      sku: input.sku || null,
      color: input.color || null,
      size: input.size || null,
      material: input.material || null,
      dimensions: input.dimensions || null,
      priceCents: input.price !== undefined ? toCents(input.price) : null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    if (current.some((existing) => sameCombination(existing, draft))) return fail(DUPLICATE_MESSAGE);
    return ok(draft);
  },

  async update(input, current) {
    const existing = current.find((variant) => variant.id === input.id);
    if (!existing) return fail("Option not found.");
    const next: ProductVariant = {
      ...existing,
      sku: input.sku || null,
      color: input.color || null,
      size: input.size || null,
      material: input.material || null,
      dimensions: input.dimensions || null,
      priceCents: input.price !== undefined ? toCents(input.price) : null,
      status: input.status ?? existing.status,
      updatedAt: new Date().toISOString(),
    };
    if (current.some((other) => other.id !== next.id && sameCombination(other, next))) return fail(DUPLICATE_MESSAGE);
    return ok(next);
  },

  async remove() {
    return ok(null);
  },
};
