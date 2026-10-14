"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import { useProductSelection } from "@/features/products/components/ProductSelectionProvider";
import { ProductLightbox } from "@/features/products/components/ProductLightbox";
import type { ProductImage, ProductVariant } from "@/features/products/types/product.types";
import { filterImagesForColor } from "@/lib/utils/variant-images";

export interface ProductGalleryProps {
  images: ProductImage[];
  title: string;
  /** Active variants — only used to narrow the photos to the selected color. Omit for a plain gallery. */
  variants?: ProductVariant[];
}

/** Main image + thumbnail switcher, with a click-to-open full-screen lightbox. */
export function ProductGallery({ images: allImages, title, variants = [] }: ProductGalleryProps) {
  const selectedColor = useProductSelection()?.selectedColor ?? null;
  const images = filterImagesForColor(allImages, variants, selectedColor);
  // Tracked by image id (not index) so the active photo is re-derived — falling
  // back to the first — whenever the color filter changes the visible set.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeIndex = Math.max(0, images.findIndex((image) => image.id === activeId));
  const active = images[activeIndex] ?? null;
  const setActiveIndex = (index: number) => setActiveId(images[index]?.id ?? null);

  function closeLightbox() {
    setLightboxOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div role="group" aria-label="Product images">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => active && setLightboxOpen(true)}
        disabled={!active}
        aria-label="View full image"
        className="relative mb-3 block aspect-[3/4] w-full overflow-hidden rounded-xl bg-rj-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30 disabled:cursor-default"
      >
        {active ? (
          <Image
            src={active.url}
            alt={active.altText ?? title}
            fill
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-rj-gray-400">
            No image available
          </span>
        )}
      </button>

      {images.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="list" aria-label="Product image thumbnails">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-pressed={index === activeIndex}
              aria-label={`View image ${index + 1}`}
              className={`relative aspect-[3/4] w-16 overflow-hidden rounded-lg border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30 ${
                index === activeIndex
                  ? "border-rj-black"
                  : "border-rj-gray-200 hover:border-rj-gray-400"
              }`}
            >
              <Image
                src={image.url}
                alt={image.altText ?? `${title} ${index + 1}`}
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      {lightboxOpen ? (
        <ProductLightbox
          images={images}
          activeIndex={activeIndex}
          onIndexChange={setActiveIndex}
          onClose={closeLightbox}
          title={title}
        />
      ) : null}
    </div>
  );
}
