"use client";

import { Check, ListChecks, Ruler, Sparkles, Wallet } from "lucide-react";

import { GuidedSelectorQuiz } from "@/features/assistant";
import { GUIDED_SELECTION_SIZES } from "@/features/assistant/constants/assistant.constants";
import { ASSISTANT_BENEFITS } from "@/features/landing/constants/landing.constants";

const CRITERIA = [
  { icon: Sparkles, label: "Occasion", hint: "Casual, formal, work, party…" },
  { icon: Ruler, label: "Size", hint: GUIDED_SELECTION_SIZES.join(", ") },
  { icon: Wallet, label: "Budget", hint: "Your price range" },
] as const;

/**
 * Guided Product Selection preview (DECISIONS.md ADR-009 — rule-based, never
 * AI/ML). Replaces the earlier canned-chat mock (which simulated free-text
 * natural-language understanding and a scripted reply — a real
 * inconsistency with ADR-009, flagged when the schema/admin UI shipped) with
 * a truthful preview of the real mechanism, wired to the actual
 * `GuidedSelectorQuiz` modal.
 */
export function SmartAssistantPreview() {
  return (
    <section className="bg-rj-black py-24">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-5 md:px-8 lg:grid-cols-2">
        {/* Text */}
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-rj-red/30 bg-rj-red/12 px-4 py-1.5">
            <ListChecks className="h-[11px] w-[11px] text-rj-red" aria-hidden="true" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-rj-red">
              Rule-Based
            </span>
          </div>
          <h2 className="mb-6 font-serif text-4xl leading-[1.05] text-rj-white md:text-[52px]">
            Guided Product
            <br />
            <em className="not-italic text-rj-red">Selection</em>
          </h2>
          <p className="mb-8 text-[15px] leading-relaxed text-rj-gray-400">
            Pick your occasion, size, and budget — Guided Selection matches
            you against what is in stock right now across every shop.
            Deterministic and explainable, never an AI guess.
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
          <GuidedSelectorQuiz
            trigger={({ onClick }) => (
              <button
                type="button"
                onClick={onClick}
                className="rounded-full bg-rj-red px-7 py-3.5 text-sm font-bold text-rj-white shadow-lg shadow-rj-red/25 transition-colors hover:bg-rj-red-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30 focus-visible:ring-offset-2"
              >
                Start Guided Selection
              </button>
            )}
          />
        </div>

        {/* Preview */}
        <div>
          <div className="overflow-hidden rounded-3xl border border-rj-gray-800 bg-rj-gray-900 shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-rj-gray-800 bg-rj-gray-800 px-5 py-4">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rj-red to-rj-red-dark">
                <ListChecks className="h-[15px] w-[15px] text-rj-white" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-rj-white">Guided Selection</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-rj-gray-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-rj-green" />
                  Deterministic · In-stock matches, not AI
                </div>
              </div>
            </div>

            {/* Criteria preview */}
            <div className="space-y-3 px-5 py-6">
              {CRITERIA.map(({ icon: Icon, label, hint }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-2xl border border-rj-gray-800 bg-rj-gray-900/40 px-4 py-3.5"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-rj-red/15">
                    <Icon className="h-3.5 w-3.5 text-rj-red" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-rj-white">{label}</p>
                    <p className="truncate text-[11px] text-rj-gray-500">{hint}</p>
                  </div>
                </div>
              ))}
              <GuidedSelectorQuiz
                trigger={({ onClick }) => (
                  <button
                    type="button"
                    onClick={onClick}
                    className="mt-1 w-full rounded-full bg-rj-red py-3 text-[13px] font-bold text-rj-white transition-colors hover:bg-rj-red-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
                  >
                    Find My Match
                  </button>
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
