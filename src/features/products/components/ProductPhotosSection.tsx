"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition, type DragEvent } from "react";
import { ImagePlus, X } from "lucide-react";

import { ChoiceGroup } from "@/components/ui/choice-group";
import {
  deleteProductImageAction,
  setProductImageVariantAction,
  uploadProductImageAction,
} from "@/features/products/actions/product.actions";
import {
  ALLOWED_PRODUCT_IMAGE_TYPES,
  MAX_PRODUCT_IMAGE_BYTES,
} from "@/features/products/schemas/product.schema";
import type { StepStatus } from "@/features/products/lib/product-save-flow";
import type { ProductImage, ProductVariant } from "@/features/products/types/product.types";
import { getColorOptions } from "@/lib/utils/variant-images";

const ACCEPT = ALLOWED_PRODUCT_IMAGE_TYPES.join(",");
const ALL_COLORS = "";

/** A photo picked for a product that does not exist yet — held in the browser until the product is saved. */
export interface PendingPhoto {
  key: string;
  file: File;
  previewUrl: string;
  /** The color the seller tagged this photo with ("Shows for"), or null for every color. */
  color: string | null;
}

export interface PhotoSaveStatus {
  status: StepStatus;
  error?: string;
  tagError?: string;
}

export interface ProductPhotosSectionProps {
  mode: "create" | "edit";
  /** Edit mode: the product the photos belong to. */
  productId?: string;
  /** Edit mode: the product's saved photos. */
  initialImages?: ProductImage[];
  /** The product's options (saved ones in edit mode, drafts in create mode) — only their colors matter here. */
  variants: ProductVariant[];
  /** Create mode: photos waiting to be saved with the product. */
  pending?: PendingPhoto[];
  onPendingChange?: (next: PendingPhoto[]) => void;
  /** Locks the controls (while saving, or once the product has been created and only retries remain). */
  disabled?: boolean;
  /** Create mode, after a save attempt: per-photo outcome keyed by `PendingPhoto.key`. */
  saveStatus?: Record<string, PhotoSaveStatus>;
}

interface Tile {
  key: string;
  src: string;
  alt: string;
  unoptimized: boolean;
  /** Selected tag value: "" = all colors, otherwise a variant id (edit) or a color name (create). */
  tag: string;
  onTag: (value: string) => void;
  onRemove: () => void;
  status?: PhotoSaveStatus;
}

function checkFiles(files: File[]): { accepted: File[]; errors: string[] } {
  const accepted: File[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (!ALLOWED_PRODUCT_IMAGE_TYPES.includes(file.type)) {
      errors.push(`${file.name} isn't a JPG, PNG or WebP image.`);
    } else if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      errors.push(`${file.name} is larger than ${MAX_PRODUCT_IMAGE_BYTES / (1024 * 1024)} MB.`);
    } else {
      accepted.push(file);
    }
  }
  return { accepted, errors };
}

const STATUS_COPY: Record<StepStatus, string> = { pending: "Waiting", done: "Saved", failed: "Not saved" };

/**
 * Photos for the product editor — one section for both modes. Edit mode
 * uploads, removes and tags photos on the server as soon as the seller acts;
 * create mode holds them in the browser (`pending`) and the editor saves them
 * after the product itself. The first photo is the cover in both.
 */
export function ProductPhotosSection({
  mode,
  productId,
  initialImages = [],
  variants,
  pending = [],
  onPendingChange,
  disabled = false,
  saveStatus,
}: ProductPhotosSectionProps) {
  const isEdit = mode === "edit";
  const [images, setImages] = useState<ProductImage[]>(initialImages);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Free the browser's preview memory when the section goes away.
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(
    () => () => {
      for (const photo of pendingRef.current) URL.revokeObjectURL(photo.previewUrl);
    },
    [],
  );

  const colorOptions = getColorOptions(variants);
  const colorByVariantId = new Map(variants.map((variant) => [variant.id, variant.color]));
  const tagChoices = [
    { value: ALL_COLORS, label: "All colors" },
    ...colorOptions.map((option) => ({ value: isEdit ? option.variantId : option.color, label: option.color })),
  ];

  function addFiles(list: FileList | File[] | null) {
    if (!list || disabled) return;
    const { accepted, errors } = checkFiles(Array.from(list));
    setError(errors.length > 0 ? errors.join(" ") : null);
    if (accepted.length === 0) return;

    if (isEdit && productId) {
      startTransition(async () => {
        for (const file of accepted) {
          const formData = new FormData();
          formData.append("image", file);
          const result = await uploadProductImageAction(productId, formData);
          if (result.success) setImages((current) => [...current, result.data]);
          else {
            setError(result.error);
            break; // keep the order: don't upload later files past a failed one
          }
        }
      });
    } else {
      onPendingChange?.([
        ...pending,
        ...accepted.map((file) => ({
          key: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          color: null,
        })),
      ]);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  function removeSaved(image: ProductImage) {
    if (!productId) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteProductImageAction(image.id, productId);
      if (result.success) setImages((current) => current.filter((item) => item.id !== image.id));
      else setError(result.error);
    });
  }

  function tagSaved(image: ProductImage, variantId: string) {
    setError(null);
    startTransition(async () => {
      const result = await setProductImageVariantAction({ imageId: image.id, variantId: variantId || null });
      if (result.success) setImages((current) => current.map((item) => (item.id === image.id ? result.data : item)));
      else setError(result.error);
    });
  }

  function removePending(photo: PendingPhoto) {
    URL.revokeObjectURL(photo.previewUrl);
    onPendingChange?.(pending.filter((item) => item.key !== photo.key));
  }

  const tiles: Tile[] = isEdit
    ? images.map((image) => {
        const tagColor = image.variantId ? colorByVariantId.get(image.variantId) : null;
        const tag = colorOptions.find((option) => option.color === tagColor)?.variantId ?? ALL_COLORS;
        return {
          key: image.id,
          src: image.url,
          alt: image.altText ?? "",
          unoptimized: false,
          tag,
          onTag: (value) => tagSaved(image, value),
          onRemove: () => removeSaved(image),
        };
      })
    : pending.map((photo) => ({
        key: photo.key,
        src: photo.previewUrl,
        alt: photo.file.name,
        unoptimized: true,
        // A tag whose color no longer has an option behind it falls back to "All colors".
        tag: colorOptions.some((option) => option.color === photo.color) ? (photo.color ?? ALL_COLORS) : ALL_COLORS,
        onTag: (value) =>
          onPendingChange?.(pending.map((item) => (item.key === photo.key ? { ...item, color: value || null } : item))),
        onRemove: () => removePending(photo),
        status: saveStatus?.[photo.key],
      }));

  const locked = disabled || isPending;

  return (
    <div className="flex flex-col gap-4">
      <label
        onDragOver={(event) => {
          event.preventDefault();
          if (!locked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-within:ring-2 focus-within:ring-ring/40 ${
          dragging ? "border-primary bg-primary/10" : "border-border bg-muted/50 hover:border-primary/60"
        } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <ImagePlus className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">Drag photos here, or choose files</span>
        <span className="text-xs text-muted-foreground">
          JPG, PNG or WebP, up to {MAX_PRODUCT_IMAGE_BYTES / (1024 * 1024)} MB each. The first photo is the cover.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={locked}
          onChange={(event) => addFiles(event.target.files)}
          className="sr-only"
        />
      </label>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {isPending ? (
        <p role="status" className="text-xs text-muted-foreground">
          Saving photos…
        </p>
      ) : null}

      {tiles.length === 0 ? (
        <p className="text-xs text-muted-foreground">No photos yet. Products with photos get far more views.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {tiles.map((tile, index) => (
            <li key={tile.key} className="flex min-w-0 flex-col gap-2">
              <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                <Image
                  src={tile.src}
                  alt={tile.alt}
                  fill
                  unoptimized={tile.unoptimized}
                  sizes="(min-width: 1280px) 160px, (min-width: 640px) 30vw, 45vw"
                  className="object-cover"
                />
                {index === 0 ? (
                  <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                    Cover
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={tile.onRemove}
                  disabled={locked}
                  aria-label="Remove photo"
                  className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/85 disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {tile.status ? (
                <p
                  className={`text-xs ${tile.status.status === "failed" ? "text-danger" : "text-muted-foreground"}`}
                  role={tile.status.status === "failed" ? "alert" : undefined}
                >
                  {STATUS_COPY[tile.status.status]}
                  {tile.status.error ? `: ${tile.status.error}` : ""}
                  {tile.status.tagError ? ` Color tag not applied: ${tile.status.tagError}` : ""}
                </p>
              ) : null}
              {colorOptions.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Shows for</span>
                  <ChoiceGroup
                    label="Shows for"
                    options={tagChoices}
                    value={tile.tag}
                    onChange={tile.onTag}
                    disabled={locked}
                    className="gap-1.5"
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
