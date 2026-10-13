import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ROUTES } from "@/constants/routes";
import { getMarketplaceStats, resolveStatValue } from "@/lib/supabase/queries";
import { AnimatedCounter } from "@/features/landing/components/AnimatedCounter";
import { Reveal } from "@/features/landing/components/Reveal";
import { ABOUT_STATS } from "@/features/landing/constants/landing.constants";

const VALUES = [
  {
    title: "Verified sellers only",
    description: "Every shop is reviewed before it goes live on the marketplace.",
  },
  {
    title: "One cart, three shops",
    description: "Checkout once, even when items come from different sibling shops.",
  },
  {
    title: "Manually verified payments",
    description: "Cash on delivery or QR receipt uploads, checked by a human before an order ships.",
  },
] as const;

/**
 * Full "Our Story" page content — the real destination for the About
 * section's "Our Story" link (previously pointed at /products). Reuses the
 * same honest, live-stat approach as AboutSection rather than inventing
 * founder/milestone details that aren't established anywhere else.
 */
export async function OurStorySection() {
  const liveStats = await getMarketplaceStats();

  return (
    <>
      <section className="bg-rj-gray-50 py-20">
        <div className="mx-auto max-w-3xl px-5 text-center md:px-8">
          <Reveal direction="up">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-rj-red">
              Our Story
            </p>
            <h1 className="mb-6 font-serif text-4xl leading-[1.05] text-rj-black md:text-[52px]">
              More Than a Shop
            </h1>
            <p className="mb-4 text-[15px] leading-relaxed text-rj-gray-600">
              RobertJ Shop was built to give independent Filipino fashion shops the
              digital shelf they deserve — without the complexity of running their
              own storefront. We handle the platform; they focus on the craft.
            </p>
            <p className="text-[15px] leading-relaxed text-rj-gray-600">
              For shoppers, it means discovering a wide range of curated clothing —
              from everyday basics to statement pieces — all from verified,
              quality-checked sellers in one trusted place.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="bg-rj-white py-20">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-5 md:px-8 lg:grid-cols-2 lg:gap-16">
          <Reveal direction="left" className="relative h-72 overflow-hidden rounded-2xl bg-rj-gray-50 shadow-xl lg:h-[420px]">
            <Image
              src="/brand/logo-v2.png"
              alt="RobertJ Shop"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-contain p-16"
            />
            <div className="absolute bottom-6 left-6 rounded-2xl bg-white px-5 py-4 shadow-lg">
              <div className="font-serif text-3xl text-rj-black">2022</div>
              <div className="text-[11px] text-rj-gray-400">Founded in San Rafael, Bulacan</div>
            </div>
          </Reveal>

          <Reveal direction="right" delayMs={200}>
            <h2 className="mb-6 font-serif text-3xl leading-[1.1] text-rj-black md:text-4xl">
              What We Stand For
            </h2>
            <ul className="mb-10 space-y-6">
              {VALUES.map((value) => (
                <li key={value.title} className="border-l-2 border-rj-red pl-4">
                  <p className="font-serif text-lg text-rj-black">{value.title}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-rj-gray-600">
                    {value.description}
                  </p>
                </li>
              ))}
            </ul>

            <dl className="grid grid-cols-2 gap-5">
              {ABOUT_STATS.map((stat) => {
                const value = resolveStatValue(stat, liveStats);
                if (value === null) return null;
                return (
                  <div key={stat.label} className="border-l-2 border-rj-gray-200 pl-4">
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
          </Reveal>
        </div>
      </section>

      <section className="bg-rj-gray-50 py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-5 text-center md:px-8">
          <h2 className="font-serif text-2xl text-rj-black md:text-3xl">
            Ready to shop with us?
          </h2>
          <Link
            href={ROUTES.products}
            className="group inline-flex items-center gap-2 rounded-full bg-rj-black px-6 py-3 text-[13px] font-bold text-rj-white transition-colors hover:bg-rj-red"
          >
            Browse Products
            <ArrowRight
              className="h-[13px] w-[13px] transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        </div>
      </section>
    </>
  );
}
