import Image from "next/image";

export interface EditorialPanelProps {
  imageSrc?: string;
}

const DEFAULT_IMAGE_SRC = "/landing/auth-editorial-banner.png";

/**
 * Desktop-only photo block: a contained (not full-bleed/full-height)
 * lifestyle image matching the reference sign-in layout's inset photo
 * treatment. The aspect ratio matches the default image's native
 * proportions (1386x1135) so `object-cover` never has to crop it; a custom
 * `imageSrc` with different proportions will be cropped to this same ratio.
 */
export function EditorialPanel({ imageSrc = DEFAULT_IMAGE_SRC }: EditorialPanelProps) {
  return (
    <div className="relative aspect-[1386/1135] w-full overflow-hidden rounded-3xl">
      <Image src={imageSrc} alt="" fill priority sizes="58vw" className="object-cover" />
    </div>
  );
}
