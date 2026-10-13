import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ROUTES } from "@/constants/routes";
import { getMarketplaceStats, resolveStatValue } from "@/lib/supabase/queries";
import { AnimatedCounter } from "@/features/landing/components/AnimatedCounter";
import { Reveal } from "@/features/landing/components/Reveal";
import { ABOUT_STATS } from "@/features/landing/constants/landing.constants";

/**
 * "More Than a Shop" story section with an image collage and metrics.
 * Verified Shops uses a live seller count (falling back to the constant); sales,
 * buyers, and rating are marketing placeholders.
 */
export async function AboutSection() {
  const liveStats = await getMarketplaceStats();

  return (
    <section className="bg-rj-gray-50 py-24">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-5 md:px-8 lg:grid-cols-2 lg:gap-16">
        {/* Simplified image — mobile/tablet only; the full collage (below) is
            desktop-only, but the section shouldn't be text-only for most visitors. */}
        <Reveal direction="left" className="relative h-64 overflow-hidden rounded-2xl shadow-xl lg:hidden">
          <Image
            src="/landing/about-shorts.png"
            alt="Folded printed shorts from a RobertJ Shop seller"
            fill
            sizes="100vw"
            className="object-cover"
          />
        </Reveal>

        {/* Image collage */}
        <Reveal direction="left" className="relative hidden h-[500px] lg:block">
          <div className="absolute left-0 top-0 h-[68%] w-[58%] overflow-hidden rounded-2xl shadow-xl">
            <Image
              src="/landing/about-shorts.png"
              alt="Folded printed shorts from a RobertJ Shop seller"
              fill
              sizes="(min-width: 1024px) 29vw, 50vw"
              className="object-cover"
            />
          </div>
          <div className="absolute bottom-0 right-0 h-[58%] w-[52%] overflow-hidden rounded-2xl shadow-xl">
            <Image
              src="/landing/about-pants.png"
              alt="Folded wide-leg pants from a RobertJ Shop seller"
              fill
              sizes="(min-width: 1024px) 26vw, 50vw"
              className="object-cover"
            />
          </div>
          <div className="absolute bottom-6 left-[38%] rounded-2xl bg-white px-5 py-4 shadow-lg">
            <div className="font-serif text-3xl text-rj-black">2022</div>
            <div className="text-[11px] text-rj-gray-400">Founded in San Rafael, Bulacan</div>
          </div>
          <div className="absolute right-4 top-4 h-20 w-20 rounded-full bg-rj-red/15 blur-2xl" />
        </Reveal>

        {/* Text */}
        <Reveal direction="right" delayMs={200}>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-rj-red">
            About RobertJ
          </p>
          <h2 className="mb-6 font-serif text-4xl leading-[1.05] text-rj-black md:text-[52px]">
            More Than a
            <br />
            Shop
          </h2>
          <p className="mb-4 text-[15px] leading-relaxed text-rj-gray-600">
            RobertJ Shop was built to give independent Filipino fashion
            shops the digital shelf they deserve — without the complexity of
            running their own storefront. We handle the platform; they focus on
            the craft.
          </p>
          <p className="mb-10 text-[15px] leading-relaxed text-rj-gray-600">
            For shoppers, it means discovering a wide range of curated clothing —
            from everyday basics to statement pieces — all from verified,
            quality-checked sellers in one trusted place.
          </p>

          {/* A stat whose live query failed is omitted rather than shown as a
              fabricated or misleading "0+" (see resolveStatValue). */}
          <dl className="mb-10 grid grid-cols-2 gap-5">
            {ABOUT_STATS.map((stat) => {
              const value = resolveStatValue(stat, liveStats);
              if (value === null) return null;
              return (
                <div key={stat.label} className="border-l-2 border-rj-red pl-4">
                  <dd className="font-serif text-2xl text-rj-black">
                    <AnimatedCounter
                      to={value}
                      prefix={stat.prefix}
                      suffix={stat.suffix}
                      decimals={stat.decimals}
                    />
                  </dd>
                  <dt className="mt-0.5 text-[11px] text-rj-gray-400">{stat.label}</dt>
                </div>
              );
            })}
          </dl>

          <Link
            href={ROUTES.ourStory}
            className="group inline-flex items-center gap-2 text-[13px] font-bold text-rj-red"
          >
            Our Story
            <ArrowRight
              className="h-[13px] w-[13px] transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
