import Link from "next/link";
import { ArrowRight, Check, LayoutGrid, ListChecks, Ruler, Sparkles, Wallet } from "lucide-react";

import { ROUTES } from "@/constants/routes";
import { ASSISTANT_BENEFITS, GUIDED_SELECTION_STEPS } from "@/features/landing/constants/landing.constants";

const STEP_ICONS = [LayoutGrid, Sparkles, Ruler, Wallet] as const;

/**
 * Landing-page showcase for Guided Product Selection (DECISIONS.md ADR-009 — rule-based, never
 * AI/ML), one of the project's headline features. A full-width dark band near the bottom of the
 * page: title, benefits and a call to action on the left, a preview of the four steps on the
 * right. Both buttons open the real `/assistant` page. Colours match the original showcase
 * (brand emerald on black). The copy states only what is true: matches come from what
 * is in stock now, the price is checked live, and every result says why it matched.
 */
export function SmartAssistantPreview() {
  return (
    <section aria-labelledby="guided-selection-heading" className="bg-rj-black py-24">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-5 md:px-8 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 id="guided-selection-heading" className="mb-6 font-serif text-4xl leading-[1.05] text-rj-white md:text-[52px]">
            Guided Product
            <br />
            <em className="not-italic text-rj-red">Selection</em>
          </h2>
          <p className="mb-8 max-w-xl text-[15px] leading-relaxed text-rj-gray-400">
            Not sure what to buy? Tell us what it is for, the details you care about and your budget. We match you
            with what is in stock right now and show why each product fits.
          </p>
          <ul className="mb-10 space-y-3">
            {ASSISTANT_BENEFITS.map((item) => (
              <li key={item} className="flex items-center gap-3 text-[14px] text-rj-gray-200">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-rj-red/15">
                  <Check className="h-2.5 w-2.5 text-rj-red" strokeWidth={2.5} aria-hidden="true" />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <Link
            href={ROUTES.assistant}
            className="inline-flex items-center gap-2 rounded-full bg-rj-red px-7 py-3.5 text-sm font-bold text-rj-white shadow-lg shadow-rj-red/25 transition-colors hover:bg-rj-red-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30 focus-visible:ring-offset-2"
          >
            Start Guided Selection
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="overflow-hidden rounded-3xl border border-rj-gray-800 bg-rj-gray-900 shadow-2xl">
          <div className="flex items-center gap-3 border-b border-rj-gray-800 bg-rj-gray-800 px-5 py-4">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rj-red to-rj-red-dark">
              <ListChecks className="h-[15px] w-[15px] text-rj-white" aria-hidden="true" />
            </span>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-rj-white">Find my match</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-rj-gray-600">
                <span className="h-1.5 w-1.5 rounded-full bg-rj-green" aria-hidden="true" />
                Four quick questions · In-stock matches
              </p>
            </div>
          </div>

          <ol className="space-y-3 px-5 py-6">
            {GUIDED_SELECTION_STEPS.map((step, index) => {
              const Icon = STEP_ICONS[index];
              return (
                <li
                  key={step.title}
                  className="flex items-center gap-3 rounded-2xl border border-rj-gray-800 bg-rj-gray-900/40 px-4 py-3.5"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-rj-red/15">
                    <Icon className="h-3.5 w-3.5 text-rj-red" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-rj-white">
                      <span className="sr-only">Step {index + 1}: </span>
                      {step.title}
                    </p>
                    <p className="truncate text-[11px] text-rj-gray-500">{step.hint}</p>
                  </div>
                  <span className="text-[11px] font-semibold text-rj-gray-500" aria-hidden="true">
                    {index + 1}/4
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="px-5 pb-6">
            <Link
              href={ROUTES.assistant}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-rj-red py-3 text-[13px] font-bold text-rj-white transition-colors hover:bg-rj-red-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
            >
              Find my match
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
