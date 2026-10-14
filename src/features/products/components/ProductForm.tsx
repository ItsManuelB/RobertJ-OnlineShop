"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/feedback/ErrorState";
import { FormField } from "@/components/forms/FormField";
import { PRODUCT_CONDITION_LABELS, PRODUCT_STATUS_LABELS } from "@/constants/status";
import {
  createProductAction,
  deleteProductImageAction,
  setProductImageVariantAction,
  updateProductAction,
  uploadProductImageAction,
} from "@/features/products/actions/product.actions";
import type { Category, CategoryAttribute, ProductAttributeKey } from "@/features/categories/types/category.types";
import type { Product, ProductImage, ProductVariant } from "@/features/products/types/product.types";
import { fromCents } from "@/lib/utils/currency";
import { getColorOptions } from "@/lib/utils/variant-images";
import type { ActionResult } from "@/types/action.types";

const IMAGE_INPUT_ACCEPT = "image/jpeg,image/png,image/webp";

/** A file picked in create mode, held client-side until the product exists. */
interface PendingImage {
  file: File;
  previewUrl: string;
}

const selectClasses =
  "h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
const textareaClasses =
  "min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

const SPEC_FIELD_LABELS: Record<ProductAttributeKey, string> = {
  color: "Color",
  size: "Size",
  material: "Material",
  dimensions: "Dimensions",
};

export interface ProductFormProps {
  categories: Category[];
  /** Every category's attribute config — filtered internally to the currently-selected category. See §8.2 of the implementation plan. */
  categoryAttributes: CategoryAttribute[];
  /** Omit for create mode; pass the product being edited for edit mode. */
  product?: Product;
  /** The product's variants (edit mode) — drives the optional per-photo "Applies to" color picker. */
  variants?: ProductVariant[];
  onDone?: () => void;
}

/**
 * Shared create/edit form. Only sellers ever create (see
 * `createProductAction` — admin is excluded server-side, not just in the
 * UI, so there's no shop-picker here anymore: a seller's shop is always
 * resolved server-side via `requireOwnShopId()`). Both seller (own product)
 * and admin (any product, moderating rather than owning) can reach edit
 * mode, where every field — including "Featured" — is identical regardless
 * of who's using it.
 */
export function ProductForm({ categories, categoryAttributes, product, variants = [], onDone }: ProductFormProps) {
  const isEdit = Boolean(product);
  const [state, formAction, isPending] = useActionState<
    ActionResult<Product> | null,
    FormData
  >(isEdit ? updateProductAction : createProductAction, null);

  const fieldErrors = state && !state.success ? state.fieldErrors : undefined;
  const formError = state && !state.success && !state.fieldErrors ? state.error : undefined;

  // Category drives which spec-only attributes (material/dimensions, per
  // category_attributes) show below — the select must be controlled so
  // changing it re-renders that section. Variant-eligible attributes are
  // deliberately NOT handled here — they're exclusively a Variant Manager
  // concern (§8.3), since enabling one is a decision about adding variant
  // rows, not a plain product field.
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  // Only `material`/`dimensions` have a backing column on `products` (color/
  // size are variant-only — see the implementation plan §3.2); a category
  // misconfigured to mark color/size as a spec rather than a variant axis
  // has nowhere to store that value here, so it's filtered out defensively.
  const specAttrs = categoryAttributes
    .filter(
      (attribute) =>
        attribute.categoryId === categoryId &&
        !attribute.isVariantEligible &&
        (attribute.attributeKey === "material" || attribute.attributeKey === "dimensions"),
    )
    .sort((a, b) => a.displayOrder - b.displayOrder) as (CategoryAttribute & {
    attributeKey: "material" | "dimensions";
  })[];
  const [enabledSpecs, setEnabledSpecs] = useState<Set<ProductAttributeKey>>(
    () => new Set(specAttrs.filter((attribute) => Boolean(product?.[attribute.attributeKey])).map((a) => a.attributeKey)),
  );

  function toggleSpec(key: ProductAttributeKey, checked: boolean) {
    setEnabledSpecs((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // Edit mode: images already exist server-side, managed against the live list.
  const [images, setImages] = useState<ProductImage[]>(product?.images ?? []);
  // Create mode: the product doesn't exist yet, so files are held client-side
  // and uploaded once `createProductAction` returns an id (see the effect below).
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isImagePending, startImageTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state?.success) return;

    if (!isEdit && pendingImages.length > 0) {
      const newProductId = state.data.id;
      startImageTransition(async () => {
        for (const pending of pendingImages) {
          const formData = new FormData();
          formData.append("image", pending.file);
          const result = await uploadProductImageAction(newProductId, formData);
          if (!result.success) setImageError(result.error);
          URL.revokeObjectURL(pending.previewUrl);
        }
        setPendingImages([]);
        onDone?.();
      });
      return;
    }

    onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setImageError(null);

    if (isEdit && product) {
      startImageTransition(async () => {
        for (const file of files) {
          const formData = new FormData();
          formData.append("image", file);
          const result = await uploadProductImageAction(product.id, formData);
          if (result.success) {
            setImages((current) => [...current, result.data]);
          } else {
            setImageError(result.error);
          }
        }
      });
    } else {
      setPendingImages((current) => [
        ...current,
        ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
      ]);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleRemovePendingImage(previewUrl: string) {
    setPendingImages((current) => current.filter((image) => image.previewUrl !== previewUrl));
    URL.revokeObjectURL(previewUrl);
  }

  // One option per distinct color; only offered once a variant actually has a color.
  const colorOptions = getColorOptions(variants);
  const variantColorById = new Map(variants.map((variant) => [variant.id, variant.color]));

  /** A photo tagged to any variant of a color shows that color's option as selected. */
  function selectedColorOption(image: ProductImage): string {
    const color = image.variantId ? variantColorById.get(image.variantId) : null;
    return colorOptions.find((option) => option.color === color)?.variantId ?? "";
  }

  function handleImageVariantChange(imageId: string, variantId: string) {
    setImageError(null);
    startImageTransition(async () => {
      const result = await setProductImageVariantAction({ imageId, variantId: variantId || null });
      if (result.success) {
        setImages((current) => current.map((image) => (image.id === imageId ? result.data : image)));
      } else {
        setImageError(result.error);
      }
    });
  }

  function handleDeleteImage(imageId: string) {
    if (!product) return;
    setImageError(null);
    startImageTransition(async () => {
      const result = await deleteProductImageAction(imageId, product.id);
      if (result.success) {
        setImages((current) => current.filter((image) => image.id !== imageId));
      } else {
        setImageError(result.error);
      }
    });
  }

  return (
    <form action={formAction} noValidate aria-busy={isPending} className="flex flex-col gap-4">
      {formError ? <ErrorState title="Couldn't save the product" message={formError} /> : null}

      {product ? <input type="hidden" name="id" value={product.id} /> : null}

      <FormField
        name="title"
        label="Title"
        defaultValue={product?.title ?? ""}
        placeholder="e.g. Vintage Denim Jacket"
        errors={fieldErrors?.title}
        required
        themed
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="product-description" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="product-description"
          name="description"
          defaultValue={product?.description ?? ""}
          placeholder="Describe the item…"
          className={textareaClasses}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Photos</span>

        {images.length > 0 || pendingImages.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {images.map((image) => (
              <div key={image.id} className="flex flex-col gap-1">
                <div className="group relative aspect-square overflow-hidden rounded-md border border-border">
                  <Image
                    src={image.url}
                    alt={image.altText ?? ""}
                    fill
                    className="object-cover"
                    sizes="120px"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteImage(image.id)}
                    disabled={isImagePending}
                    aria-label="Remove image"
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-opacity hover:bg-black/80 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                {colorOptions.length > 0 ? (
                  <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                    Shows for
                    <select
                      value={selectedColorOption(image)}
                      onChange={(event) => handleImageVariantChange(image.id, event.target.value)}
                      disabled={isImagePending}
                      className="h-8 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
                    >
                      <option value="">All colors</option>
                      {colorOptions.map((option) => (
                        <option key={option.variantId} value={option.variantId}>
                          {option.color}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ))}
            {pendingImages.map((pending) => (
              <div
                key={pending.previewUrl}
                className="group relative aspect-square overflow-hidden rounded-md border border-border"
              >
                <Image
                  src={pending.previewUrl}
                  alt=""
                  fill
                  unoptimized
                  className="object-cover"
                  sizes="120px"
                />
                <button
                  type="button"
                  onClick={() => handleRemovePendingImage(pending.previewUrl)}
                  aria-label="Remove image"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-opacity hover:bg-black/80"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_INPUT_ACCEPT}
          multiple
          onChange={(event) => handleFilesSelected(event.target.files)}
          disabled={isImagePending}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground"
        />
        {imageError ? (
          <p role="alert" className="text-xs text-danger">
            {imageError}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          name="price"
          label="Price (PHP)"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={product ? fromCents(product.priceCents) : undefined}
          errors={fieldErrors?.price}
          required
          themed
        />
        <FormField
          name="quantity"
          label="Quantity"
          type="number"
          min="0"
          step="1"
          defaultValue={product?.quantity ?? 0}
          errors={fieldErrors?.quantity}
          required
          themed
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="product-condition" className="text-sm font-medium">
            Condition
          </label>
          <select
            id="product-condition"
            name="condition"
            defaultValue={product?.condition ?? "new"}
            className={selectClasses}
          >
            {Object.entries(PRODUCT_CONDITION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="product-status" className="text-sm font-medium">
            Status
          </label>
          <select
            id="product-status"
            name="status"
            defaultValue={product?.status ?? "draft"}
            className={selectClasses}
          >
            {Object.entries(PRODUCT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2.5 text-sm font-medium">
        <input
          type="checkbox"
          name="featured"
          defaultChecked={product?.featured ?? false}
          className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        Featured on homepage
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="product-category" className="text-sm font-medium">
          Category
        </label>
        <select
          id="product-category"
          name="categoryId"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={selectClasses}
        >
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {specAttrs.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
          <p className="text-xs font-medium text-muted-foreground">Specifications</p>
          {specAttrs.map((attribute) => {
            const label = SPEC_FIELD_LABELS[attribute.attributeKey];
            if (attribute.isRequired) {
              return (
                <FormField
                  key={attribute.id}
                  name={attribute.attributeKey}
                  label={label}
                  defaultValue={product?.[attribute.attributeKey] ?? ""}
                  errors={fieldErrors?.[attribute.attributeKey]}
                  required
                  themed
                />
              );
            }
            const checked = enabledSpecs.has(attribute.attributeKey);
            return (
              <div key={attribute.id} className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={checked}
                    onChange={(event) => toggleSpec(attribute.attributeKey, event.target.checked)}
                  />
                  Add {label.toLowerCase()} details
                </label>
                {checked ? (
                  <FormField
                    name={attribute.attributeKey}
                    label={label}
                    defaultValue={product?.[attribute.attributeKey] ?? ""}
                    errors={fieldErrors?.[attribute.attributeKey]}
                    themed
                  />
                ) : (
                  // Submitted as an explicit empty value so unchecking and saving
                  // actually clears a previously-set spec (see §8.2) — an absent
                  // field would be read as "no change" by the partial update
                  // schema instead.
                  <input type="hidden" name={attribute.attributeKey} value="" />
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      <FormField
        name="location"
        label="Location"
        defaultValue={product?.location ?? ""}
        placeholder="e.g. Quezon City"
        errors={fieldErrors?.location}
        themed
      />

      <Button type="submit" variant="primary" size="rj" isLoading={isPending} className="w-full sm:w-auto">
        {isPending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
      </Button>
    </form>
  );
}
