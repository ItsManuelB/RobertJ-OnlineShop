"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { ErrorState } from "@/components/feedback/ErrorState";
import { FormField } from "@/components/forms/FormField";
import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { getGuidedSelectionStepDataAction } from "@/features/assistant/actions/quiz.actions";
import { GuidedAnswerChips } from "@/features/assistant/components/GuidedAnswerChips";
import { GuidedOptionCards, type GuidedOption } from "@/features/assistant/components/GuidedOptionCards";
import { OCCASION_LABELS } from "@/features/assistant/constants/assistant.constants";
import { budgetLabel } from "@/features/assistant/lib/guided-overview";
import { OCCASIONS } from "@/features/assistant/schemas/rule.schema";
import {
  STEP_FOR_ANSWER,
  dropAnswer,
  guidedSearch,
  type DetailKey,
  type GuidedAnswerKey,
  type GuidedAnswers,
  type GuidedStep,
} from "@/features/assistant/utils/guided-url";
import type { GuidedSelectionOverview } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils/cn";

export interface GuidedCategory {
  id: string;
  name: string;
  supportsOccasionMatching: boolean;
  /** Purchasable products in it right now. */
  count: number;
}

export interface GuidedSelectionWizardProps {
  categories: GuidedCategory[];
  /** Purchasable products across every category. */
  anyCount: number;
  initialAnswers: GuidedAnswers;
  initialStep?: GuidedStep;
  /** Step data for `initialAnswers.categoryId` (or any category). */
  initialOverview: GuidedSelectionOverview;
}

/** How long a tapped choice stays visible before the next question slides in. */
const AUTO_ADVANCE_MS = 250;

const STEP_COPY: Record<GuidedStep, { title: string; helper: (categoryName: string | null) => string }> = {
  category: { title: "What are you shopping for?", helper: () => "Pick one. You can change it later." },
  occasion: { title: "What is it for?", helper: () => "Only occasions with products in stock are shown." },
  details: {
    title: "Any details?",
    helper: (name) => `Choices for ${name ?? "this category"}. Skip any that do not matter.`,
  },
  budget: {
    title: "What is your budget?",
    helper: (name) => (name ? `Ranges are based on prices in ${name} right now.` : "Ranges are based on prices right now."),
  },
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Steps worth asking for this category: Occasion only when something in stock is tagged, Details only when there are choices. */
function stepsFor(category: GuidedCategory | undefined, overview: GuidedSelectionOverview): GuidedStep[] {
  const occasionUseful =
    (!category || category.supportsOccasionMatching) && Object.values(overview.occasionCounts).some((count) => count > 0);
  return [
    "category",
    ...(occasionUseful ? (["occasion"] as const) : []),
    ...(overview.questions.length > 0 ? (["details"] as const) : []),
    "budget",
  ];
}

/**
 * Guided Product Selection as a short, step-by-step conversation (DECISIONS.md ADR-009 —
 * rule-based, never AI/ML). One question per step with progress, Back and Skip; single-choice
 * steps move on by themselves after a tap. Every choice shows how many products it leads to,
 * and choices that lead nowhere are not offered. The answers end up in the `/assistant`
 * address, where the server renders the results.
 */
export function GuidedSelectionWizard({
  categories,
  anyCount,
  initialAnswers,
  initialStep,
  initialOverview,
}: GuidedSelectionWizardProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<GuidedAnswers>(initialAnswers);
  const [overview, setOverview] = useState(initialOverview);
  const [step, setStep] = useState<GuidedStep>(initialStep ?? "category");
  const [customBudget, setCustomBudget] = useState(
    () =>
      (initialAnswers.minPrice !== undefined || initialAnswers.maxPrice !== undefined) &&
      !initialOverview.budgetPresets.some(
        (preset) =>
          (preset.minPesos ?? undefined) === initialAnswers.minPrice &&
          (preset.maxPesos ?? undefined) === initialAnswers.maxPrice,
      ),
  );
  const [customMin, setCustomMin] = useState(initialAnswers.minPrice?.toString() ?? "");
  const [customMax, setCustomMax] = useState(initialAnswers.maxPrice?.toString() ?? "");
  const [budgetError, setBudgetError] = useState<string | null>(null);
  // "Any" leaves no answer behind, so remember it was picked to keep its card checked.
  const [anyChosen, setAnyChosen] = useState<Partial<Record<"category" | "occasion" | "budget", boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();
  const [isFinishing, startFinishing] = useTransition();

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const category = categories.find((entry) => entry.id === answers.categoryId);
  const steps = stepsFor(category, overview);
  // A step can disappear after a category change; fall back to the nearest one still asked.
  const current = steps.includes(step) ? step : steps[Math.min(steps.length - 1, 1)];
  const index = steps.indexOf(current);
  const isLast = index === steps.length - 1;

  // Move focus to the new question so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [current]);

  function finish(final: GuidedAnswers) {
    startFinishing(() => {
      router.push(`${ROUTES.assistant}${guidedSearch(final, { show: true })}`);
    });
  }

  function goNext(nextSteps: GuidedStep[], from: GuidedStep, final: GuidedAnswers) {
    const position = nextSteps.indexOf(from);
    if (position === nextSteps.length - 1) finish(final);
    else setStep(nextSteps[position + 1]);
  }

  function later(run: () => void, viaPointer: boolean) {
    if (viaPointer) window.setTimeout(run, AUTO_ADVANCE_MS);
  }

  function loadCategory(next: GuidedAnswers, viaPointer: boolean) {
    setError(null);
    startLoading(async () => {
      const result = await getGuidedSelectionStepDataAction(next.categoryId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOverview(result.data);
      if (viaPointer) {
        const nextCategory = categories.find((entry) => entry.id === next.categoryId);
        later(() => goNext(stepsFor(nextCategory, result.data), "category", next), true);
      }
    });
  }

  function selectCategory(value: string | null, viaPointer: boolean) {
    // Details and budget ranges belong to one category, so they reset with it.
    const next: GuidedAnswers = { occasion: answers.occasion, categoryId: value ?? undefined };
    setAnswers(next);
    setAnyChosen((previous) => ({ ...previous, category: value === null, budget: false }));
    setCustomBudget(false);
    setCustomMin("");
    setCustomMax("");
    loadCategory(next, viaPointer);
  }

  function selectOccasion(value: string | null, viaPointer: boolean) {
    const next = { ...answers, occasion: value ?? undefined };
    setAnswers(next);
    setAnyChosen((previous) => ({ ...previous, occasion: value === null }));
    later(() => goNext(steps, "occasion", next), viaPointer);
  }

  function selectDetail(key: DetailKey, value: string | null) {
    setAnswers((previous) => ({ ...previous, [key]: value ?? undefined }));
  }

  function selectBudget(value: string | null, viaPointer: boolean) {
    setBudgetError(null);
    if (value === "custom") {
      setCustomBudget(true);
      return;
    }
    setCustomBudget(false);
    setAnyChosen((previous) => ({ ...previous, budget: value === null }));
    const preset = value === null ? null : overview.budgetPresets[Number(value)];
    const next = {
      ...answers,
      minPrice: preset?.minPesos ?? undefined,
      maxPrice: preset?.maxPesos ?? undefined,
    };
    setAnswers(next);
    later(() => goNext(steps, "budget", next), viaPointer);
  }

  /** The answers including a typed custom range, or null when the range is not valid. */
  function withCustomBudget(): GuidedAnswers | null {
    if (current !== "budget" || !customBudget) return answers;
    const min = customMin.trim() === "" ? undefined : Number(customMin);
    const max = customMax.trim() === "" ? undefined : Number(customMax);
    if ((min !== undefined && (!Number.isFinite(min) || min < 0)) || (max !== undefined && (!Number.isFinite(max) || max <= 0))) {
      setBudgetError("Enter amounts in pesos, like 100.");
      return null;
    }
    if (min !== undefined && max !== undefined && min > max) {
      setBudgetError("The lowest amount must not be more than the highest.");
      return null;
    }
    return { ...answers, minPrice: min, maxPrice: max };
  }

  function handleNext() {
    const final = withCustomBudget();
    if (!final) return;
    setAnswers(final);
    goNext(steps, current, final);
  }

  function handleSkip() {
    const cleared: GuidedAnswerKey[] =
      current === "details" ? ["size", "color", "material", "dimensions"] : [current as GuidedAnswerKey];
    let next = answers;
    for (const key of cleared) next = dropAnswer(next, key);
    if (current === "budget") setCustomBudget(false);
    setAnswers(next);
    if (current === "category") loadCategory(next, false);
    goNext(steps, current, next);
  }

  function removeAnswer(key: GuidedAnswerKey) {
    const next = dropAnswer(answers, key);
    setAnswers(next);
    if (key === "budget") setCustomBudget(false);
    if (key === "category") loadCategory(next, false);
  }

  const categoryName = category?.name ?? null;
  const copy = STEP_COPY[current];
  const selectedBudget = customBudget
    ? "custom"
    : answers.minPrice === undefined && answers.maxPrice === undefined
      ? undefined
      : String(
          overview.budgetPresets.findIndex(
            (preset) =>
              (preset.minPesos ?? undefined) === answers.minPrice && (preset.maxPesos ?? undefined) === answers.maxPrice,
          ),
        );

  const labels: Partial<Record<GuidedAnswerKey, string>> = {
    category: categoryName ?? undefined,
    occasion: answers.occasion ? OCCASION_LABELS[answers.occasion as keyof typeof OCCASION_LABELS] : undefined,
    size: answers.size ? `Size ${answers.size}` : undefined,
    color: answers.color,
    material: answers.material,
    dimensions: answers.dimensions,
    budget:
      answers.minPrice !== undefined || answers.maxPrice !== undefined
        ? budgetLabel(answers.minPrice ?? null, answers.maxPrice ?? null)
        : undefined,
  };

  const anyOr = (value: string | undefined, key: "category" | "occasion" | "budget") =>
    value ?? (anyChosen[key] ? null : undefined);

  let body: ReactNode = null;
  if (current === "category") {
    const options: GuidedOption[] = [
      ...categories
        .filter((entry) => entry.count > 0)
        .map((entry) => ({ value: entry.id, label: entry.name, detail: `${entry.count} in stock` })),
      { value: null, label: "Any category", detail: `${anyCount} in stock` },
    ];
    body = (
      <GuidedOptionCards
        legend="Category"
        options={options}
        selected={anyOr(answers.categoryId, "category")}
        onSelect={selectCategory}
      />
    );
  } else if (current === "occasion") {
    const options: GuidedOption[] = [
      ...OCCASIONS.filter((occasion) => (overview.occasionCounts[occasion] ?? 0) > 0).map((occasion) => ({
        value: occasion,
        label: OCCASION_LABELS[occasion],
        detail: plural(overview.occasionCounts[occasion], "product"),
      })),
      { value: null, label: "Any occasion", detail: `${overview.inStock} in stock` },
    ];
    body = <GuidedOptionCards legend="Occasion" options={options} selected={anyOr(answers.occasion, "occasion")} onSelect={selectOccasion} />;
  } else if (current === "details") {
    body = (
      <div className="flex flex-col gap-6">
        {overview.questions.map((question) => {
          const key = question.attributeKey as DetailKey;
          return (
            <div key={key} className="flex flex-col gap-2">
              <p aria-hidden="true" className="text-sm font-semibold text-rj-black">
                {question.label}
              </p>
              <GuidedOptionCards
                legend={question.label}
                options={[
                  ...question.values.map((entry) => ({
                    value: entry.value,
                    label: entry.value,
                    detail: `${entry.count} in stock`,
                  })),
                  { value: null, label: "Any", detail: "No preference" },
                ]}
                selected={answers[key] ?? null}
                onSelect={(value) => selectDetail(key, value)}
              />
            </div>
          );
        })}
      </div>
    );
  } else {
    const options: GuidedOption[] = [
      ...overview.budgetPresets.map((preset, position) => ({
        value: String(position),
        label: budgetLabel(preset.minPesos, preset.maxPesos),
        detail: plural(preset.count, "product"),
      })),
      { value: "custom", label: "Custom range", detail: "Enter your own" },
      { value: null, label: "Any budget", detail: "No limit" },
    ];
    body = (
      <div className="flex flex-col gap-4">
        <GuidedOptionCards
          legend="Budget"
          options={options}
          selected={anyOr(selectedBudget, "budget")}
          onSelect={selectBudget}
          columns="two"
        />
        {customBudget ? (
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="From (₱)"
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0"
              value={customMin}
              onChange={(event) => setCustomMin(event.target.value)}
            />
            <FormField
              label="Up to (₱)"
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="No limit"
              value={customMax}
              onChange={(event) => setCustomMax(event.target.value)}
            />
          </div>
        ) : null}
        {budgetError ? (
          <p className="text-xs font-semibold text-danger" role="alert">
            {budgetError}
          </p>
        ) : null}
      </div>
    );
  }

  const singleChoice = current === "category" || current === "occasion" || (current === "budget" && !customBudget);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-bold uppercase tracking-[0.12em] text-rj-red">
            Step {index + 1} of {steps.length}
          </span>
          <span className="text-rj-gray-600">Skip any question</span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-rj-gray-100"
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
        >
          <div
            className="h-full rounded-full bg-rj-red transition-[width] duration-300"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <div key={current} className="flex flex-col gap-5 motion-safe:animate-[fadeSlideIn_150ms_ease-out]">
        <div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-serif text-[26px] leading-tight text-rj-black outline-none md:text-[32px]"
          >
            {copy.title}
          </h1>
          <p className="mt-1.5 text-sm text-rj-gray-600">{copy.helper(categoryName)}</p>
        </div>

        <div aria-busy={isLoading}>{body}</div>

        {singleChoice ? <p className="text-xs text-rj-gray-600">Tap a card to continue. Back is always there.</p> : null}
        {isLoading ? (
          <p className="text-xs text-rj-gray-600" role="status">
            Loading the next question…
          </p>
        ) : null}
        {error ? <ErrorState title="Couldn't load the next question" message={error} /> : null}
      </div>

      {index > 0 ? (
        <GuidedAnswerChips
          items={(Object.keys(labels) as GuidedAnswerKey[])
            .filter((key) => labels[key])
            .map((key) => ({
              key,
              label: labels[key] as string,
              onEdit: () => setStep(STEP_FOR_ANSWER[key]),
              onRemove: () => removeAnswer(key),
            }))}
        />
      ) : null}

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-rj-gray-100 bg-rj-white px-4 py-3",
          "md:static md:border-0 md:bg-transparent md:p-0",
        )}
      >
        {index === 0 ? (
          <Link href={ROUTES.products} className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}>
            Cancel
          </Link>
        ) : (
          <Button type="button" variant="rjOutline" size="rjSm" onClick={() => setStep(steps[index - 1])}>
            Back
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="rjSm" onClick={handleSkip} disabled={isLoading}>
            Skip
          </Button>
          <Button
            type="button"
            variant="rj"
            size="rjSm"
            onClick={handleNext}
            disabled={isLoading}
            isLoading={isFinishing}
          >
            {isLast ? "Show matches" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
