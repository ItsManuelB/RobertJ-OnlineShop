import { Suspense } from "react";
import type { Metadata } from "next";

import { ErrorState } from "@/components/feedback/ErrorState";
import { GuidedResults, GuidedResultsSkeleton } from "@/features/assistant/components/GuidedResults";
import { GuidedSelectionWizard } from "@/features/assistant/components/GuidedSelectionWizard";
import { guidedSelectionPageParamsSchema } from "@/features/assistant/schemas/quiz.schema";
import { OCCASIONS } from "@/features/assistant/schemas/rule.schema";
import { CatalogHeader } from "@/features/products/components/CatalogHeader";
import {
  getGuidedSelectionOverview,
  listGuidedSelectionCategories,
  requireRateLimit,
} from "@/lib/supabase/queries";
import { getClientIp } from "@/lib/utils/request";

export const metadata: Metadata = {
  title: "Find my match",
  description: "Answer up to four quick questions and see what is in stock that fits.",
};

interface AssistantPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Guided Product Selection (DECISIONS.md ADR-009, ADR-022 — rule-based, never AI/ML). Public:
 * guests can use it. The answers live in the address, so Back works and a result can be shared.
 * Without `show=1` the page asks the questions; with it, the server renders the matches.
 */
export default async function AssistantPage({ searchParams }: AssistantPageProps) {
  const raw = await searchParams;
  const { answers, step, show } = guidedSelectionPageParamsSchema.parse(
    Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, first(value)])),
  );

  try {
    const ip = await getClientIp();
    await requireRateLimit(`guidedSelection:${ip}`, 30, 60);
  } catch {
    return (
      <div className="flex flex-col gap-8">
        <CatalogHeader eyebrow="Guided Selection" title="Find my match" />
        <ErrorState message="That was a lot of searches in a short time. Wait a minute, then try again." />
      </div>
    );
  }

  let categories: Awaited<ReturnType<typeof listGuidedSelectionCategories>>;
  try {
    categories = await listGuidedSelectionCategories();
  } catch {
    return (
      <div className="flex flex-col gap-8">
        <CatalogHeader eyebrow="Guided Selection" title="Find my match" />
        <ErrorState message="We couldn't load Guided Selection right now. Try again in a moment." />
      </div>
    );
  }
  const category = categories.find((entry) => entry.id === answers.categoryId) ?? null;
  // An unknown or inactive category in an old link is dropped, not an error.
  const safeAnswers = category ? answers : { ...answers, categoryId: undefined };

  if (show) {
    return (
      <div className="flex flex-col gap-8">
        <CatalogHeader
          eyebrow="Guided Selection"
          title="Your matches"
          description="Matched from what is in stock right now. Prices are live. Rule-based, not AI."
        />
        <Suspense key={JSON.stringify(safeAnswers)} fallback={<GuidedResultsSkeleton />}>
          <GuidedResults answers={safeAnswers} category={category ? { name: category.name, slug: category.slug } : null} />
        </Suspense>
      </div>
    );
  }

  let overviews: Awaited<ReturnType<typeof getGuidedSelectionOverview>>[];
  try {
    overviews = await Promise.all([
      getGuidedSelectionOverview(undefined, OCCASIONS),
      ...(category ? [getGuidedSelectionOverview(category.id, OCCASIONS)] : []),
    ]);
  } catch {
    return (
      <div className="flex flex-col gap-8">
        <CatalogHeader eyebrow="Guided Selection" title="Find my match" />
        <ErrorState message="We couldn't load the questions right now. Try again in a moment." />
      </div>
    );
  }
  const [anyOverview, categoryOverview] = overviews;

  return (
    <GuidedSelectionWizard
      key={JSON.stringify(raw)}
      categories={categories.map((entry) => ({
        id: entry.id,
        name: entry.name,
        supportsOccasionMatching: entry.supportsOccasionMatching,
        count: anyOverview.categoryCounts[entry.id] ?? 0,
      }))}
      anyCount={anyOverview.inStock}
      initialAnswers={safeAnswers}
      initialStep={step}
      initialOverview={categoryOverview ?? anyOverview}
    />
  );
}
