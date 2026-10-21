import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, Heart, Star } from "lucide-react";

import { ROUTES } from "@/constants/routes";
import { getMarketplaceStats, resolveStatValue } from "@/lib/supabase/queries";
import { AnimatedCounter } from "@/features/landing/components/AnimatedCounter";
import { HERO_STATS } from "@/features/landing/constants/landing.constants";

/**
 * Landing hero. Server-rendered; the entrance uses CSS keyframes (no JS) and the
 * headline stats hydrate as small AnimatedCounter islands. Active Shops and
 * Products Listed use live Supabase counts (falling back to the constant); Happy
 * Buyers is a marketing placeholder.
 */
export async function Hero() {
  const liveStats = await getMarketplaceStats();

  return (
    <section className="relative overflow-hidden bg-rj-black" style={{ minHeight: "92vh" }}>
      {/* Background */}
      <div className="absolute inset-0">
        <Image
          src="/landing/hero-v2.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-rj-black via-rj-black/75 to-rj-black/10" />
        <div className="absolute bottom-0 left-0 h-[40%] w-[40%] rounded-full bg-rj-red/10 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-[92vh] w-full max-w-7xl grid-cols-1 items-center gap-12 px-5 md:px-8 lg:grid-cols-2">
        {/* Left */}
        <div style={{ animation: "fadeSlideIn 0.7s ease both" }}>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-rj-red/40 bg-rj-red/10 px-4 py-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rj-red" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-rj-red">
              Philippines&apos; Multi-Shop Marketplace
            </span>
          </div>

          <h1 className="mb-6 font-serif text-[clamp(3rem,8vw,5.5rem)] leading-[1.03] text-rj-white">
            One Place.
            <br />
            <em className="not-italic text-rj-red">Every</em> Style.
          </h1>

          <p className="mb-10 max-w-sm text-base leading-relaxed text-rj-gray-400 md:text-lg">
            Discover the finest independent clothing shops in the Philippines —
            curated, verified, and brought together in one seamless experience.
          </p>

          <div className="mb-10 flex flex-wrap gap-3">
            <Link
              href={ROUTES.products}
              className="rounded-full bg-rj-red px-7 py-3.5 text-sm font-bold text-rj-white shadow-lg shadow-rj-red/25 transition-all hover:bg-rj-red-dark active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-white focus-visible:ring-offset-2 focus-visible:ring-offset-rj-black"
            >
              Shop Now
            </Link>
            <a
              href="#shops"
              className="flex items-center gap-2 rounded-full border border-rj-white/20 px-7 py-3.5 text-sm font-medium text-rj-white transition-colors hover:border-rj-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-white focus-visible:ring-offset-2 focus-visible:ring-offset-rj-black"
            >
              Explore Shops
              <ArrowRight className="h-[13px] w-[13px]" aria-hidden="true" />
            </a>
          </div>

          {/* Simplified editorial image — mobile/tablet only; the full stacked
              composition (below) is desktop-only, but the brand moment shouldn't
              disappear entirely for the majority-mobile audience. */}
          <div
            className="relative mb-10 h-56 w-full overflow-hidden rounded-2xl shadow-2xl sm:h-64 lg:hidden"
            style={{ animation: "fadeSlideIn 0.7s ease 0.15s both" }}
          >
            <Image
              src="/landing/hero-v2.png"
              alt="Featured Autumn Linen collection"
              fill
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-rj-black/70 via-transparent to-transparent" />
            <div className="absolute inset-x-5 bottom-4">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-rj-gray-200">
                Featured Drop
              </div>
              <div className="font-semibold text-rj-white">Autumn Linen Edit</div>
              <div className="mt-1 text-sm font-bold text-rj-red">From ₱1,200</div>
            </div>
          </div>

          {/* Stats — a stat whose live query failed is omitted rather than
              shown as a fabricated or misleading "0+" (see resolveStatValue). */}
          <dl className="flex gap-7 border-t border-rj-white/10 pt-8">
            {HERO_STATS.map((stat) => {
              const value = resolveStatValue(stat, liveStats);
              if (value === null) return null;
              return (
                <div key={stat.label}>
                  <dd className="font-serif text-2xl text-rj-white md:text-3xl">
                    <AnimatedCounter to={value} suffix={stat.suffix} />
                  </dd>
                  <dt className="mt-0.5 text-[11px] text-rj-gray-600">{stat.label}</dt>
                </div>
              );
            })}
          </dl>
        </div>

        {/* Right — stacked editorial cards */}
        <div
          className="hidden items-center justify-end lg:flex"
          style={{ animation: "fadeSlideIn 0.7s ease 0.2s both" }}
        >
          <div className="relative w-80">
            {/* Back card */}
            <div
              className="absolute -left-6 -top-6 h-72 w-56 overflow-hidden rounded-2xl opacity-60"
              style={{ transform: "rotate(-4deg)" }}
            >
              <Image
                src="/landing/hero-v2.png"
                alt=""
                fill
                sizes="224px"
                className="object-cover"
              />
            </div>

            {/* Main card */}
            <div className="relative h-[420px] w-80 overflow-hidden rounded-3xl shadow-2xl">
              <Image
                src="/landing/hero-v2.png"
                alt="Featured Autumn Linen collection"
                fill
                sizes="320px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-rj-black/70 via-transparent to-transparent" />
              <div className="absolute inset-x-5 bottom-5">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-rj-gray-200">
                  Featured Drop
                </div>
                <div className="font-semibold text-rj-white">Autumn Linen Edit</div>
                <div className="mt-1 text-sm font-bold text-rj-red">From ₱1,200</div>
              </div>
            </div>

            {/* Floating badge — top right */}
            <div
              className="absolute -right-5 -top-4 rounded-2xl bg-rj-white px-4 py-3 shadow-xl"
              style={{ animation: "float 3s ease-in-out infinite" }}
            >
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rj-red/15">
                  <Heart className="h-3 w-3 fill-rj-red text-rj-red" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-[9px] leading-none text-rj-gray-400">Saved</div>
                  <div className="text-xs font-bold text-rj-black">2,840</div>
                </div>
              </div>
            </div>

            {/* Floating badge — bottom left */}
            <div
              className="absolute -bottom-5 -left-7 rounded-2xl border border-rj-gray-800 bg-rj-black px-4 py-3 shadow-2xl"
              style={{ animation: "float 3s ease-in-out 1.5s infinite" }}
            >
              <div className="mb-1 text-[9px] uppercase tracking-widest text-rj-gray-600">
                Trending Now
              </div>
              <div className="text-xs font-semibold text-rj-white">Linen Co-ords</div>
              <div className="mt-1 flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-[9px] w-[9px] fill-rj-gold text-rj-gold" aria-hidden="true" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll cue */}
      <div
        className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 opacity-40"
        style={{ animation: "bounce 2s ease-in-out infinite" }}
        aria-hidden="true"
      >
        <div className="text-[10px] uppercase tracking-widest text-rj-white">Scroll</div>
        <ArrowDown className="h-4 w-4 text-rj-white" />
      </div>
    </section>
  );
}
