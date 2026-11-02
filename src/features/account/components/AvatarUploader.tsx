"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  removeAvatarAction,
  uploadAvatarAction,
} from "@/features/account/actions/account.actions";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";

const IMAGE_INPUT_ACCEPT = "image/jpeg,image/png";
/** Mirrors `uploadAvatarSchema` (1MB, JPEG/PNG) so a too-large photo is shrunk here instead of being rejected by the server. */
const MAX_AVATAR_BYTES = 1 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png"];

/**
 * Shrinks a photo that is over the upload limit to a JPEG under it (a circular
 * avatar needs far fewer pixels than a phone photo has). Returns the file
 * unchanged when it is already small enough or can't be decoded, so the
 * server's own validation still has the final say.
 */
async function fitToLimit(file: File): Promise<File> {
  if (file.size <= MAX_AVATAR_BYTES || !ALLOWED_TYPES.includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    let longSide = 1024;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.fillStyle = "#ffffff"; // JPEG has no transparency
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (blob && blob.size <= MAX_AVATAR_BYTES) {
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
      }
      longSide = Math.round(longSide * 0.75);
    }
  } catch {
    // Not decodable in this browser — let the server report it.
  }
  return file;
}

export interface AvatarUploaderProps {
  /** Current, real, persisted avatar URL — null when none is set yet. */
  currentUrl: string | null;
  /** Used only for the initials fallback and the image's alt text. */
  name: string;
  /** Portal surfaces (seller/admin): uses the theme tokens so it inverts correctly in dark mode. Buyer surfaces omit it. */
  themed?: boolean;
}

/**
 * Profile-picture upload — a real Supabase Storage upload (`avatars`
 * bucket), replacing the previous "paste a hosted image URL" field. Mirrors
 * `ShopImageUploader`'s logo mode (hidden file input, immediate upload, no
 * crop needed for a circular avatar) but saves independently of the rest of
 * `ProfileForm` — same as Shopee's own profile screen, where the photo
 * picker and the form's Save button are separate actions.
 */
export function AvatarUploader({ currentUrl, name, themed = false }: AvatarUploaderProps) {
  const [url, setUrl] = useState(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("image", await fitToLimit(file));
      const result = await uploadAvatarAction(formData);
      if (result.success) {
        setUrl(result.data);
      } else {
        // A validation failure carries the specific reason (type/size) in `fieldErrors`; the generic message alone hides it.
        setError(result.fieldErrors?.image?.[0] ?? result.error);
      }
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeAvatarAction();
      if (result.success) {
        setUrl(null);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Avatar
        src={url}
        name={name}
        size={96}
        className={cn(
          "h-24 w-24 text-xl",
          themed ? "bg-primary text-primary-foreground" : "bg-rj-black text-rj-white",
        )}
      />

      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          variant={themed ? "outline" : "rjOutline"}
          size={themed ? "sm" : "rjSm"}
          isLoading={isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {url ? "Change photo" : "Upload photo"}
        </Button>
        {url ? (
          <Button
            type="button"
            variant="ghost"
            size={themed ? "sm" : "rjSm"}
            isLoading={isPending}
            onClick={handleRemove}
          >
            Remove
          </Button>
        ) : null}
      </div>

      <p className={cn("text-xs", themed ? "text-muted-foreground" : "text-rj-gray-600")}>JPEG or PNG, up to 1MB.</p>
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
