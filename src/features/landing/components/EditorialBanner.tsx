import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ROUTES } from "@/constants/routes";
import { Reveal } from "@/features/landing/components/Reveal";

/** Full-width "New Season" editorial call-to-action band. */
export function EditorialBanner() {
  return (
    <section className="relative flex h-[52vh] min-h-[320px] items-center overflow-hidden bg-rj-black">
      <Image
        src="/landing/editorial-banner-v2.png"
        alt=""
        fill
        sizes="100vw"
        className="object-contain opacity-30"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-rj-black/90 via-rj-black/60 to-transparent" />
      <Reveal
        direction="left"
        className="relative z-10 mx-auto w-full max-w-7xl px-5 md:px-8"
      >
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.3em] text-rj-red">
          New Season
        </p>
        <h2 className="mb-6 font-serif text-4xl leading-tight text-rj-white md:text-6xl">
          Fresh Drops.
          <br />
          Local Designers.
        </h2>
        <Link
          href={ROUTES.products}
          className="inline-flex items-center gap-2 rounded-full bg-rj-red px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-rj-red/30 transition-colors hover:bg-rj-red-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-rj-black"
        >
          Explore New Arrivals
          <ArrowRight className="h-[13px] w-[13px]" aria-hidden="true" />
        </Link>
      </Reveal>
    </section>
  );
}
