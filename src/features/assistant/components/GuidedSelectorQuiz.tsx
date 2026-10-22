"use client";

import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { FormField } from "@/components/forms/FormField";
import { ROUTES } from "@/constants/routes";
import { formatCurrency } from "@/lib/utils/currency";
import { useScrollLock } from "@/hooks/useScrollLock";
import {
  getGuidedSelectionAttributeQuestionsAction,
  getGuidedSelectionCategoriesAction,
  getGuidedSelectionMatchesAction,
} from "@/features/assistant/actions/quiz.actions";
import { OCCASION_LABELS } from "@/features/assistant/constants/assistant.constants";
import { guidedSelectionQuerySchema } from "@/features/assistant/schemas/quiz.schema";
import { OCCASIONS } from "@/features/assistant/schemas/rule.schema";
import type { GuidedSelectionMatch } from "@/features/assistant/types/assistant.types";
import type { GuidedSelectionCategoryOption, ProductFilterOption } from "@/lib/supabase/queries";
import { getCoverImage } from "@/features/products/types/product.types";

type View = "form" | "results";
type FieldErrors = Record<string, string[] | undefined>;
/** The new, generalized attribute answers — resolved against variant/product data, never a `recommendation_rules` column. `size` is deliberately excluded here; it keeps its own legacy state (see the component doc comment). */
type AttributeAnswers = Partial<Record<"color" | "material" | "dimensions", string>>;

export interface GuidedSelectorQuizProps {
  /** Renders the trigger — the quiz owns its own open/close state internally,
   * so any caller can drop this in without lifting modal state up. */
  trigger: (props: { onClick: () => void }) => ReactNode;
}

const CHIP_ACTIVE =
  "rounded-full border-[1.5px] border-rj-black bg-rj-black px-4 py-2 text-xs font-bold text-rj-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30";
const CHIP_IDLE =
  "rounded-full border-[1.5px] border-rj-gray-200 bg-transparent px-4 py-2 text-xs font-bold text-rj-gray-600 transition-colors hover:border-rj-black hover:text-rj-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30";

function emptyFieldErrors(): FieldErrors {
  return {};
}

/**
 * Buyer-facing Guided Product Selection (DECISIONS.md ADR-009 — rule-based,
 * never AI/ML): category/occasion/size/attribute/budget answers, matched
 * against explicit `recommendation_rules` rows via
 * `getGuidedSelectionMatchesAction`. Every criterion is optional — skipping
 * one just means it isn't filtered on.
 *
 * Generalized per docs/plans/product-specifications-and-variants-
 * implementation.md §6: a category step now comes first, Occasion is
 * skipped for categories that opt out (`supports_occasion_matching`), and
 * the Size/Color/Material/Dimensions questions are driven per-category by
 * `category_attributes` (via `getGuidedSelectionAttributeQuestionsAction`,
 * the same resolver the catalog's own attribute filters use) instead of a
 * hardcoded apparel-only vocabulary — so "Any category" now asks only
 * Occasion + Budget, and the Size/Color/Material/Dimensions questions only
 * appear once a specific category narrows which of those actually apply.
 * `size` itself still matches against the rule's own `size` field exactly
 * as before a live-data audit found no safe way to migrate it onto
 * variant/product data without breaking existing rules — only the brand
 * new color/material/dimensions questions use the new resolution path.
 *
 * Owns its own open/close state (render-prop trigger) so it can be dropped
 * into any page without lifting modal state. Focus/Escape handling mirrors
 * `ProductLightbox`'s established full-screen dialog pattern.
 */
export function GuidedSelectorQuiz({ trigger }: GuidedSelectorQuizProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("form");

  const [categories, setCategories] = useState<GuidedSelectionCategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [attributeQuestions, setAttributeQuestions] = useState<ProductFilterOption[]>([]);
  const [isLoadingQuestions, startLoadingQuestions] = useTransition();

  const [occasion, setOccasion] = useState<string | undefined>(undefined);
  const [size, setSize] = useState<string | undefined>(undefined);
  const [attributeAnswers, setAttributeAnswers] = useState<AttributeAnswers>({});
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyFieldErrors());
  const [formError, setFormError] = useState<string | null>(null);
  const [matches, setMatches] = useState<GuidedSelectionMatch[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Stop the page behind the full-screen quiz from scrolling on touch.
  useScrollLock(open);

  function handleOpen() {
    setOpen(true);
  }

  function resetQuiz() {
    setView("form");
    setCategoryId(undefined);
    setAttributeQuestions([]);
    setOccasion(undefined);
    setSize(undefined);
    setAttributeAnswers({});
    setMinPrice("");
    setMaxPrice("");
    setMatches(null);
    setFormError(null);
    setFieldErrors(emptyFieldErrors());
  }

  function handleClose() {
    setOpen(false);
    previousFocusRef.current?.focus();
    resetQuiz();
  }

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
  }, [open]);

  // Load the category step's options once, the first time the quiz opens.
  useEffect(() => {
    if (!open || categories.length > 0) return;
    getGuidedSelectionCategoriesAction().then((result) => {
      if (result.success) setCategories(result.data);
    });
  }, [open, categories.length]);

  // Re-resolve which attribute questions to show whenever the category
  // selection changes — "Any category" (undefined) asks none, matching
  // `resolveFilterableAttributes`'s own "ambiguous across categories" rule.
  function handleSelectCategory(nextCategoryId: string | undefined) {
    setCategoryId(nextCategoryId);
    setSize(undefined);
    setAttributeAnswers({});
    if (!nextCategoryId) {
      setAttributeQuestions([]);
      return;
    }
    startLoadingQuestions(async () => {
      const result = await getGuidedSelectionAttributeQuestionsAction(nextCategoryId);
      setAttributeQuestions(result.success ? result.data : []);
    });
  }

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleClose();
        return;
      }
      if (event.key === "Tab") {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // Re-bind per view so Tab wrapping always sees the current panel content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view]);

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const showOccasion = !categoryId || selectedCategory?.supportsOccasionMatching !== false;

  const exactCount = matches?.filter((match) => match.fit === "exact").length ?? 0;
  const closeCount = matches?.filter((match) => match.fit === "close").length ?? 0;
  const unconfirmedCount = matches?.filter((match) => match.fit === "unconfirmed").length ?? 0;

  function handleSearch() {
    setFormError(null);
    const parsed = guidedSelectionQuerySchema.safeParse({
      occasion: showOccasion ? occasion || undefined : undefined,
      size: size || undefined,
      categoryId: categoryId || undefined,
      color: attributeAnswers.color || undefined,
      material: attributeAnswers.material || undefined,
      dimensions: attributeAnswers.dimensions || undefined,
      minPrice: minPrice === "" ? undefined : Number(minPrice),
      maxPrice: maxPrice === "" ? undefined : Number(maxPrice),
    });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
      return;
    }
    setFieldErrors(emptyFieldErrors());
    startTransition(async () => {
      const result = await getGuidedSelectionMatchesAction(parsed.data);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      setMatches(result.data);
      setView("results");
    });
  }

  return (
    <>
      {trigger({ onClick: handleOpen })}
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Guided Selection"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-rj-black/60 p-4"
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-rj-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-rj-gray-100 px-6 py-4">
              <div>
                <p className="text-sm font-bold text-rj-black">Guided Selection</p>
                <p className="text-xs text-rj-gray-600">
                  Matched from what&apos;s in stock right now.
                </p>
              </div>
              <button
                type="button"
                ref={closeButtonRef}
                onClick={handleClose}
                aria-label="Close Guided Selection"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-rj-gray-500 transition-colors hover:bg-rj-gray-100 hover:text-rj-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {view === "form" ? (
                <div className="flex flex-col gap-5">
                  {categories.length > 0 ? (
                    <div>
                      <p className="mb-2 text-sm font-semibold text-rj-black">What are you shopping for?</p>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
                        <button
                          type="button"
                          aria-pressed={!categoryId}
                          className={!categoryId ? CHIP_ACTIVE : CHIP_IDLE}
                          onClick={() => handleSelectCategory(undefined)}
                        >
                          Any category
                        </button>
                        {categories.map((category) => (
                          <button
                            key={category.id}
                            type="button"
                            aria-pressed={categoryId === category.id}
                            className={categoryId === category.id ? CHIP_ACTIVE : CHIP_IDLE}
                            onClick={() => handleSelectCategory(category.id)}
                          >
                            {category.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {showOccasion ? (
                    <div>
                      <p className="mb-2 text-sm font-semibold text-rj-black">Occasion</p>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Occasion">
                        <button
                          type="button"
                          aria-pressed={!occasion}
                          className={!occasion ? CHIP_ACTIVE : CHIP_IDLE}
                          onClick={() => setOccasion(undefined)}
                        >
                          Any
                        </button>
                        {OCCASIONS.map((value) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={occasion === value}
                            className={occasion === value ? CHIP_ACTIVE : CHIP_IDLE}
                            onClick={() => setOccasion(value)}
                          >
                            {OCCASION_LABELS[value]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {isLoadingQuestions ? (
                    <p className="text-xs text-rj-gray-400">Loading options…</p>
                  ) : (
                    attributeQuestions.map((option) => {
                      const isSize = option.attributeKey === "size";
                      const current = isSize ? size : attributeAnswers[option.attributeKey as "color" | "material" | "dimensions"];
                      function select(value: string | undefined) {
                        if (isSize) setSize(value);
                        else
                          setAttributeAnswers((prev) => ({
                            ...prev,
                            [option.attributeKey]: value,
                          }));
                      }
                      return (
                        <div key={option.attributeKey}>
                          <p className="mb-2 text-sm font-semibold text-rj-black">{option.label} (optional)</p>
                          <div className="flex flex-wrap gap-2" role="group" aria-label={option.label}>
                            <button
                              type="button"
                              aria-pressed={!current}
                              className={!current ? CHIP_ACTIVE : CHIP_IDLE}
                              onClick={() => select(undefined)}
                            >
                              Any
                            </button>
                            {option.values.map((value) => (
                              <button
                                key={value}
                                type="button"
                                aria-pressed={current === value}
                                className={current === value ? CHIP_ACTIVE : CHIP_IDLE}
                                onClick={() => select(value)}
                              >
                                {value}
                              </button>
                            ))}
                          </div>
                          {isSize && fieldErrors.size ? (
                            <p className="mt-1.5 text-xs text-rj-red-dark">{fieldErrors.size[0]}</p>
                          ) : null}
                        </div>
                      );
                    })
                  )}

                  <div>
                    <p className="mb-2 text-sm font-semibold text-rj-black">Budget (optional)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        label="Min"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder="Min ₱"
                        value={minPrice}
                        onChange={(event) => setMinPrice(event.target.value)}
                        errors={fieldErrors.minPrice}
                      />
                      <FormField
                        label="Max"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder="Max ₱"
                        value={maxPrice}
                        onChange={(event) => setMaxPrice(event.target.value)}
                        errors={fieldErrors.maxPrice}
                      />
                    </div>
                  </div>

                  {formError ? <ErrorState title="Couldn't load matches" message={formError} /> : null}

                  <Button type="button" variant="rj" isLoading={isPending} onClick={handleSearch}>
                    Find My Match
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-rj-gray-600" aria-live="polite">
                      {exactCount} match{exactCount === 1 ? "" : "es"}
                      {closeCount > 0 ? ` · ${closeCount} close` : ""}
                      {unconfirmedCount > 0 ? ` · ${unconfirmedCount} to confirm` : ""}
                    </p>
                    <button
                      type="button"
                      onClick={() => setView("form")}
                      className="text-xs font-semibold text-rj-red-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
                    >
                      Refine search
                    </button>
                  </div>

                  {!matches || matches.length === 0 ? (
                    <EmptyState
                      title="No matches yet"
                      description="Nothing in stock fits all of your answers. Try a different size or color, a wider budget, or Any category."
                    />
                  ) : (
                    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {matches.map((match) => {
                        const cover = getCoverImage(match.product);
                        return (
                          <li key={`${match.product.id}:${match.variantId ?? ""}`}>
                            <Link
                              href={ROUTES.productDetail(match.product.slug)}
                              onClick={handleClose}
                              className="group block"
                            >
                              <div
                                className="relative mb-2 overflow-hidden rounded-xl bg-rj-gray-100"
                                style={{ aspectRatio: "3 / 4" }}
                              >
                                {cover ? (
                                  <Image
                                    src={cover.url}
                                    alt={match.product.title}
                                    fill
                                    sizes="(min-width: 640px) 33vw, 50vw"
                                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                                  />
                                ) : (
                                  <span className="flex h-full items-center justify-center text-xs text-rj-gray-400">
                                    No image
                                  </span>
                                )}
                              </div>
                              <p className="line-clamp-2 text-xs font-medium text-rj-black">
                                {match.product.title}
                              </p>
                              {match.fit === "close" && match.note ? (
                                <p className="text-[11px] font-semibold text-rj-red-dark">Close: {match.note}</p>
                              ) : null}
                              {match.fit === "unconfirmed" && match.note ? (
                                <p className="text-[11px] font-semibold text-rj-gray-600">
                                  {match.note} — check with the seller
                                </p>
                              ) : null}
                              {match.variantLabel ? (
                                <p className="text-[11px] text-rj-gray-500">{match.variantLabel}</p>
                              ) : null}
                              <p className="text-xs font-bold text-rj-black">
                                {formatCurrency(match.matchedPriceCents, match.product.currency)}
                              </p>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
