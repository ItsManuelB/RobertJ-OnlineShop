import Link from "next/link";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isOccasion } from "@/constants/occasions";
import { ROUTES } from "@/constants/routes";
import { GuidedAnswerChips } from "@/features/assistant/components/GuidedAnswerChips";
import { OCCASION_LABELS } from "@/features/assistant/constants/assistant.constants";
import { budgetLabel } from "@/features/assistant/lib/guided-overview";
import type { GuidedSelectionMatch } from "@/features/assistant/types/assistant.types";
import {
  STEP_FOR_ANSWER,
  answeredKeys,
  dropAnswer,
  guidedSearch,
  type GuidedAnswerKey,
  type GuidedAnswers,
} from "@/features/assistant/utils/guided-url";
import { ProductGrid } from "@/features/products/components/ProductGrid";
import { getGuidedSelectionResults, type GuidedSelectionResults } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils/cn";

export interface GuidedResultsProps {
  answers: GuidedAnswers;
  /** The answered category, for its name and a "browse all" link. */
  category: { name: string; slug: string } | null;
}

const RELAX_LABELS: Record<GuidedAnswerKey, string> = {
  category: "Any category",
  occasion: "Any occasion",
  size: "Any size",
  color: "Any color",
  material: "Any material",
  dimensions: "Any dimensions",
  budget: "Any budget",
};

const GROUPS: { fit: GuidedSelectionMatch["fit"]; title: string; describe: (count: number) => string }[] = [
  { fit: "exact", title: "Best matches", describe: (n) => `${n} product${n === 1 ? "" : "s"} fit every answer` },
  { fit: "close", title: "Close to your budget", describe: (n) => `${n} product${n === 1 ? "" : "s"}, just outside it` },
  {
    fit: "unconfirmed",
    title: "Check with the seller",
    describe: (n) => `${n} product${n === 1 ? "" : "s"} with a detail the shop has not listed`,
  },
];

function answerLabel(key: GuidedAnswerKey, answers: GuidedAnswers, categoryName: string | null): string {
  switch (key) {
    case "category":
      return categoryName ?? "Category";
    case "occasion":
      return answers.occasion && isOccasion(answers.occasion) ? OCCASION_LABELS[answers.occasion] : "Occasion";
    case "size":
      return `Size ${answers.size}`;
    case "budget":
      return budgetLabel(answers.minPrice ?? null, answers.maxPrice ?? null);
    default:
      return answers[key] ?? key;
  }
}

/** Green chips say why it fits; amber ones say what to know first. */
function ReasonChips({ match }: { match: GuidedSelectionMatch }) {
  const warnings = match.fit === "exact" || !match.note ? [] : [match.note];
  const reasons = match.reasons.slice(0, 3 - warnings.length);
  if (reasons.length === 0 && warnings.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Why this matched">
      {warnings.map((text) => (
        <li key={text} className="rounded-full bg-warning/15 px-2 py-0.5 text-[10.5px] font-semibold text-rj-black">
          {text}
        </li>
      ))}
      {reasons.map((text) => (
        <li key={text} className="rounded-full bg-rj-gray-100 px-2 py-0.5 text-[10.5px] font-semibold text-rj-red-dark">
          {text}
        </li>
      ))}
    </ul>
  );
}

/**
 * The `/assistant` results: answers as editable chips, then the matches in up to three
 * labelled groups, each card with the store's own tile plus its reasons. With no matches it
 * offers one-tap ways out (drop a single answer, browse the category). With no answers at all
 * it says so rather than presenting the newest products as matches.
 */
export async function GuidedResults({ answers, category }: GuidedResultsProps) {
  const keys = answeredKeys(answers);
  const categoryName = category?.name ?? null;
  const startOver = (
    <Link href={ROUTES.assistant} className="text-xs font-semibold text-rj-red-dark underline-offset-2 hover:underline">
      Start over
    </Link>
  );
  const chips = (
    <GuidedAnswerChips
      action={startOver}
      items={keys.map((key) => ({
        key,
        label: answerLabel(key, answers, categoryName),
        editHref: `${ROUTES.assistant}${guidedSearch(answers, { step: STEP_FOR_ANSWER[key] })}`,
        removeHref: `${ROUTES.assistant}${guidedSearch(dropAnswer(answers, key), { show: true })}`,
      }))}
    />
  );

  if (keys.length === 0) {
    return (
      <EmptyState
        title="You skipped every question"
        description="Answer at least one so there is something to match. Or browse everything in the shop."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={ROUTES.assistant} className={cn(buttonVariants({ variant: "rj", size: "rjSm" }))}>
              Answer the questions
            </Link>
            <Link href={ROUTES.products} className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}>
              Browse all products
            </Link>
          </div>
        }
      />
    );
  }

  let results: GuidedSelectionResults;
  try {
    results = await getGuidedSelectionResults({
      categoryId: answers.categoryId,
      occasion: answers.occasion && isOccasion(answers.occasion) ? answers.occasion : undefined,
      size: answers.size,
      color: answers.color,
      material: answers.material,
      dimensions: answers.dimensions,
      minPrice: answers.minPrice,
      maxPrice: answers.maxPrice,
    });
  } catch {
    return (
      <div className="flex flex-col gap-6">
        {chips}
        <ErrorState message="We couldn't load your matches right now. Try again in a moment." />
      </div>
    );
  }

  const { matches, capped, relax } = results;
  const browseHref = category ? ROUTES.categoryDetail(category.slug) : ROUTES.products;

  if (matches.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {chips}
        <p className="sr-only" role="status">
          No matches
        </p>
        <EmptyState
          title={`Nothing fits all ${keys.length === 1 ? "of your answer" : `${keys.length} answers`}`}
          description={
            relax.length > 0
              ? "Nothing in stock matches every answer. Drop one and see what is left."
              : "Nothing in stock matches these answers right now. Browse the shop or start over."
          }
          action={
            <div className="flex flex-col items-center gap-3">
              {relax.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {relax.map((option) => (
                    <Link
                      key={option.key}
                      href={`${ROUTES.assistant}${guidedSearch(dropAnswer(answers, option.key), { show: true })}`}
                      className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}
                    >
                      {RELAX_LABELS[option.key]} · {option.count} {option.count === 1 ? "match" : "matches"}
                    </Link>
                  ))}
                </div>
              ) : null}
              <Link href={browseHref} className={cn(buttonVariants({ variant: "rj", size: "rjSm" }))}>
                Browse all {categoryName ?? "products"}
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const groups = GROUPS.map((group) => ({ ...group, items: matches.filter((match) => match.fit === group.fit) })).filter(
    (group) => group.items.length > 0,
  );
  const editAnswersHref = `${ROUTES.assistant}${guidedSearch(answers)}`;

  return (
    <div className="flex flex-col gap-8 pb-20 md:pb-0">
      {chips}
      <p className="text-sm text-rj-gray-600" role="status">
        {capped
          ? `Showing the best ${matches.length} matches from what is in stock right now. Add an answer to narrow them.`
          : `${matches.length} ${matches.length === 1 ? "match" : "matches"} from what is in stock right now.`}
      </p>

      {groups.map((group) => (
        <section key={group.fit} aria-labelledby={`group-${group.fit}`} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id={`group-${group.fit}`} className="text-base font-semibold text-rj-black">
              {group.title}
            </h2>
            <p className="text-xs text-rj-gray-600">{group.describe(group.items.length)}</p>
          </div>
          <ProductGrid
            products={group.items.map((match) => match.product)}
            overrides={Object.fromEntries(
              group.items.map((match) => [
                match.product.id,
                { priceCents: match.matchedPriceCents, footer: <ReasonChips match={match} /> },
              ]),
            )}
          />
        </section>
      ))}

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-rj-gray-100 bg-rj-white px-4 py-3 md:hidden">
        <span className="text-sm font-semibold text-rj-black">
          {matches.length} {matches.length === 1 ? "match" : "matches"}
        </span>
        <Link href={editAnswersHref} className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}>
          Edit answers
        </Link>
      </div>
    </div>
  );
}

export function GuidedResultsSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status">
      <span className="sr-only">Finding your matches</span>
      <Skeleton className="h-14 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="aspect-[3/4] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
