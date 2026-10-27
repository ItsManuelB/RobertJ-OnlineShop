"use client";

import Image from "next/image";
import { ImageIcon, ImageOff } from "lucide-react";
import { useRef, useState, useTransition, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { BannerCropEditor } from "@/features/shops/components/BannerCropEditor";
import {
  removeShopImageAction,
  uploadShopImageAction,
} from "@/features/shops/actions/shop.actions";

const IMAGE_INPUT_ACCEPT = "image/jpeg,image/png,image/webp";

export interface ShopImageUploaderProps {
  kind: "logo" | "banner";
  label: string;
  /** Current, real, persisted image URL — null when the shop hasn't set one
   * yet. Never a placeholder/fabricated value. */
  currentUrl: string | null;
  /** Used only for the image's alt text (e.g. "Shop One logo"). */
  shopName: string;
  /** Lets a parent mirror the persisted URL (e.g. a live buyer preview). */
  onUrlChange?: (url: string | null) => void;
}

/**
 * One uploader, parameterized by `kind`, serves both the logo and the
 * banner rather than forking two near-identical components. Mirrors
 * `ProductPhotosSection`'s upload pattern (hidden file input, `useTransition`,
 * inline error) but simpler — a shop always already exists by the time this
 * renders, so there's no "create mode" staging to handle.
 *
 * Banner selection routes through `BannerCropEditor` — the seller drags/
 * zooms to choose exactly what appears in the 3:1 window, and only the
 * resulting already-3:1 cropped image is ever uploaded. Logo selection is
 * unchanged (uploads immediately) — a circular avatar has no comparable
 * "wrong part got cropped" failure mode.
 */
export function ShopImageUploader({ kind, label, currentUrl, shopName, onUrlChange }: ShopImageUploaderProps) {
  const [url, setUrl] = useState(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Banner-only: the file staged for the crop editor, not yet uploaded.
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function uploadFile(file: File) {
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("image", file);
      const result = await uploadShopImageAction(kind, formData);
      if (result.success) {
        const nextUrl = kind === "logo" ? result.data.logoUrl : result.data.bannerUrl;
        setUrl(nextUrl);
        onUrlChange?.(nextUrl);
        setJustSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setJustSaved(false);

    if (kind === "banner") {
      setPendingFile(file);
      return;
    }

    uploadFile(file);
  }

  function handleCropConfirm(croppedFile: File) {
    setPendingFile(null);
    uploadFile(croppedFile);
  }

  function handleRemove() {
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const result = await removeShopImageAction(kind);
      if (result.success) {
        setUrl(null);
        onUrlChange?.(null);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="text-sm font-medium">{label}</span>
        {kind === "banner" ? (
          <p className="text-xs text-muted-foreground">
            Recommended: 1500×500px (3:1 ratio) for the sharpest result.
          </p>
        ) : null}
      </div>

      {kind === "banner" && pendingFile ? (
        <BannerCropEditor
          file={pendingFile}
          isSaving={isPending}
          onConfirm={handleCropConfirm}
          onCancel={() => setPendingFile(null)}
        />
      ) : (
        <>
          <div
            className={`relative overflow-hidden border border-border bg-muted ${
              kind === "banner" ? "aspect-[3/1] w-full rounded-md" : "h-24 w-24 rounded-full"
            }`}
          >
            {url ? (
              <Image
                src={url}
                alt={`${shopName} ${label.toLowerCase()}`}
                fill
                className="object-cover"
                sizes="240px"
              />
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
                <ImageIcon className="h-5 w-5" aria-hidden="true" />
                {kind === "banner" ? <span className="text-xs">No banner yet</span> : null}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              isLoading={isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {url ? "Replace" : "Upload"}
            </Button>
            {url ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                isLoading={isPending}
                onClick={handleRemove}
              >
                <ImageOff className="h-3.5 w-3.5" aria-hidden="true" />
                Remove
              </Button>
            ) : null}
            {justSaved && !isPending ? (
              <span className="text-xs font-medium text-success" role="status">
                Saved
              </span>
            ) : null}
          </div>
        </>
      )}

      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_INPUT_ACCEPT}
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
