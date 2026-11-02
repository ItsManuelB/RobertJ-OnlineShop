"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils/cn";
import { getInitials } from "@/lib/utils/format";

export interface AvatarProps {
  /** Photo URL, or null/empty to show initials. */
  src: string | null | undefined;
  /** Used for the initials fallback. */
  name: string;
  /** Pixel size of the photo request; the visible size comes from `className`. */
  size: number;
  /** Size, background and text classes for the circle, e.g. `h-11 w-11 bg-rj-black text-rj-white text-[13px]`. */
  className?: string;
}

/**
 * Round profile picture that always shows something. Google and Facebook profile photos are
 * hot-linked and often refuse to load (they reject requests that carry a referrer, and rate
 * limit), so a failed photo falls back to the initials instead of leaving an empty circle.
 * `referrerPolicy="no-referrer"` avoids most of those refusals in the first place.
 */
export function Avatar({ src, name, size, className }: AvatarProps) {
  // Remember which URL failed, so a new photo (a new `src`) gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = Boolean(src) && failedSrc !== src;

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold",
        className,
      )}
    >
      {showPhoto && src ? (
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          unoptimized
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span aria-hidden="true">{getInitials(name) || "?"}</span>
      )}
    </span>
  );
}
