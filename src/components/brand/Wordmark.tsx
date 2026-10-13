import Image from "next/image";
import Link from "next/link";

import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils/cn";

export interface WordmarkProps {
  /**
   * Unused by the image mark (it carries its own background/contrast) —
   * kept so existing `onDark` call sites don't need to change.
   */
  onDark?: boolean;
  className?: string;
}

/**
 * Shared RobertJ logo mark: the brand image plus the "RobertJ Shop"
 * wordmark, matching `SiteFooter`'s brand lockup. Extracted from
 * `LandingNavbar`'s private `Logo` into the reusable branding library so the
 * landing, auth, and dashboard headers all render a single source of truth.
 */
export function Wordmark({ className }: WordmarkProps) {
  return (
    <Link
      href={ROUTES.home}
      className={cn("inline-flex flex-shrink-0 items-center gap-2.5", className)}
    >
      <Image
        src="/brand/logo-v2.png"
        alt="RobertJ Shop"
        width={1254}
        height={1254}
        priority
        className="h-11 w-11 flex-shrink-0 rounded-lg object-cover"
      />
      <span className="hidden items-baseline gap-1.5 sm:flex">
        <span className="font-serif text-2xl text-rj-black">RobertJ</span>
        <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-rj-red">
          Shop
        </span>
      </span>
    </Link>
  );
}
