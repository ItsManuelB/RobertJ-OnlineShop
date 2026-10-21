"use client";

import { LayoutGrid, List, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FILTER_CHIP_ACTIVE as CHIP_ACTIVE, FILTER_CHIP_IDLE as CHIP_IDLE } from "@/components/ui/filter-chip";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useScrollLock } from "@/hooks/useScrollLock";
import type { Category } from "@/features/categories/types/category.types";
import type { ProductSort } from "@/features/products/types/product.types";
import type { ProductFilterOption } from "@/lib/supabase/queries";
import type { Shop } from "@/features/shops/types/shop.types";

export interface ProductFiltersProps {
  /**
   * Category chips. Pass an empty array/omit to hide the chip row (used on
   * pinned category pages where the category is fixed server-side).
   */
  categories?: Category[];
  /** Shop dropdown options. Pass an empty array/omit to hide it. */
  shops?: Shop[];
  /**
   * Category-driven attribute filters (§7 of the implementation plan) —
   * resolved server-side for whichever single category is currently in
   * effect (the pinned category on a category page, or the URL's
   * `categoryId` on `/products`). Always `[]` when "All" categories are
   * shown — attribute filters are ambiguous across categories, so omitting
   * them is the correct default rather than unioning every category's.
   */
  attributeFilters?: ProductFilterOption[];
}

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "title-asc", label: "Title: A to Z" },
];

/** Category chips + attribute filters + shop + price range + sort control for the product listing. */
export function ProductFilters({ categories = [], shops = [], attributeFilters = [] }: ProductFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeCategoryId = searchParams.get("categoryId") ?? "";
  const activeShopId = searchParams.get("shopId") ?? "";
  const view = searchParams.get("view") === "list" ? "list" : "grid";
  const rawSort = searchParams.get("sort");
  const sort: ProductSort = SORT_OPTIONS.some((o) => o.value === rawSort)
    ? (rawSort as ProductSort)
    : "newest";
  const onSale = searchParams.get("onSale") === "true";

  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") ?? "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") ?? "");
  const debouncedMinPrice = useDebouncedValue(minPrice, 400);
  const debouncedMaxPrice = useDebouncedValue(maxPrice, 400);

  // Below `md` the On Sale / price / shop / sort cluster collapses into a
  // bottom sheet instead of wrapping into several rows above the product
  // grid — the trigger that opens it is itself `md:hidden`, so this state
  // can never matter at md+ regardless of window resizing while it's open.
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Lock background scroll while the mobile filter sheet is open.
  useScrollLock(sheetOpen);

  useEffect(() => {
    if (!sheetOpen) return;
    sheetRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSheetOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Push the debounced price values to the URL once they settle, so a drag/
  // keystroke doesn't trigger a navigation per tick (mirrors ProductSearchInput's
  // inline-params pattern, not the shared `updateParams` closure, so the effect's
  // dependency list stays exact).
  useEffect(() => {
    const current = searchParams.get("minPrice") ?? "";
    if (current === debouncedMinPrice) return;
    const params = new URLSearchParams(searchParams.toString());
    if (debouncedMinPrice) params.set("minPrice", debouncedMinPrice);
    else params.delete("minPrice");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [debouncedMinPrice, pathname, router, searchParams]);

  useEffect(() => {
    const current = searchParams.get("maxPrice") ?? "";
    if (current === debouncedMaxPrice) return;
    const params = new URLSearchParams(searchParams.toString());
    if (debouncedMaxPrice) params.set("maxPrice", debouncedMaxPrice);
    else params.delete("maxPrice");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [debouncedMaxPrice, pathname, router, searchParams]);

  function resetPrice() {
    setMinPrice("");
    setMaxPrice("");
    updateParams({ minPrice: null, maxPrice: null });
  }

  const hasPriceFilter = minPrice !== "" || maxPrice !== "";
  const activeAttributeFilterCount = attributeFilters.filter((option) =>
    Boolean(searchParams.get(option.attributeKey)),
  ).length;
  const activeAdvancedCount =
    (onSale ? 1 : 0) +
    (hasPriceFilter ? 1 : 0) +
    (activeShopId ? 1 : 0) +
    (sort !== "newest" ? 1 : 0) +
    activeAttributeFilterCount;

  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
      {categories.length > 0 ? (
        <div
          className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0"
          role="group"
          aria-label="Filter by category"
        >
          <button
            type="button"
            aria-pressed={!activeCategoryId}
            className={`shrink-0 ${!activeCategoryId ? CHIP_ACTIVE : CHIP_IDLE}`}
            onClick={() => updateParams({ categoryId: null })}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={activeCategoryId === category.id}
              className={`shrink-0 ${activeCategoryId === category.id ? CHIP_ACTIVE : CHIP_IDLE}`}
              onClick={() => updateParams({ categoryId: category.id })}
            >
              {category.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {/* Mobile-only trigger for the collapsed On Sale/price/shop/sort cluster below. */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          aria-controls="mobile-filters-sheet"
          className="flex h-11 items-center gap-2 rounded-full border-[1.5px] border-rj-gray-200 px-4 text-[11px] font-bold text-rj-black transition-colors hover:border-rj-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30 md:hidden"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Filters
          {activeAdvancedCount > 0 ? (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rj-red px-1 text-[9px] font-bold text-rj-white">
              {activeAdvancedCount}
            </span>
          ) : null}
        </button>

        <div
          className="flex overflow-hidden rounded-full border-[1.5px] border-rj-gray-200"
          role="group"
          aria-label="Layout"
        >
          <button
            type="button"
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            onClick={() => updateParams({ view: null })}
            className={`flex h-11 w-11 items-center justify-center transition-colors md:h-9 md:w-9 ${
              view === "grid" ? "bg-rj-black text-rj-white" : "text-rj-gray-400 hover:text-rj-black"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={view === "list"}
            aria-label="List view"
            onClick={() => updateParams({ view: "list" })}
            className={`flex h-11 w-11 items-center justify-center transition-colors md:h-9 md:w-9 ${
              view === "list" ? "bg-rj-black text-rj-white" : "text-rj-gray-400 hover:text-rj-black"
            }`}
          >
            <List className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {sheetOpen ? (
        <div
          className="fixed inset-0 z-40 bg-rj-black/40 md:hidden"
          aria-hidden="true"
          onClick={() => setSheetOpen(false)}
        />
      ) : null}

      {/* On Sale / price / shop / sort — inline on desktop (md:flex below
          always wins regardless of sheetOpen), a bottom sheet on mobile. */}
      <div
        id="mobile-filters-sheet"
        ref={sheetRef}
        role={sheetOpen ? "dialog" : undefined}
        aria-modal={sheetOpen ? true : undefined}
        aria-label={sheetOpen ? "Filters" : undefined}
        tabIndex={sheetOpen ? -1 : undefined}
        className={
          sheetOpen
            ? "fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col gap-4 overflow-y-auto rounded-t-2xl border-t border-rj-gray-200 bg-rj-white p-5 shadow-2xl outline-none md:static md:z-auto md:max-h-none md:flex-row md:flex-wrap md:items-center md:gap-2 md:overflow-visible md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none"
            : "hidden md:flex md:flex-wrap md:items-center md:gap-2"
        }
      >
        {sheetOpen ? (
          <div className="flex items-center justify-between md:hidden">
            <h2 className="text-sm font-bold text-rj-black">Filters</h2>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              aria-label="Close filters"
              className="flex h-9 w-9 items-center justify-center rounded-full text-rj-gray-600 transition-colors hover:bg-rj-gray-100 hover:text-rj-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          aria-pressed={onSale}
          onClick={() => updateParams({ onSale: onSale ? null : "true" })}
          className={`w-fit ${onSale ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          On Sale
        </button>

        <div className="flex items-center gap-1.5" role="group" aria-label="Filter by price">
          <label htmlFor="filter-min-price" className="sr-only">
            Minimum price
          </label>
          <input
            id="filter-min-price"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Min ₱"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
            className="h-9 w-20 rounded-full border-[1.5px] border-rj-gray-200 bg-transparent px-3 text-[11px] font-bold text-rj-black outline-none transition-colors placeholder:text-rj-gray-400 placeholder:font-medium focus-visible:border-rj-black"
          />
          <span className="text-rj-gray-400" aria-hidden="true">
            –
          </span>
          <label htmlFor="filter-max-price" className="sr-only">
            Maximum price
          </label>
          <input
            id="filter-max-price"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Max ₱"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
            className="h-9 w-20 rounded-full border-[1.5px] border-rj-gray-200 bg-transparent px-3 text-[11px] font-bold text-rj-black outline-none transition-colors placeholder:text-rj-gray-400 placeholder:font-medium focus-visible:border-rj-black"
          />
          {hasPriceFilter ? (
            <button
              type="button"
              onClick={resetPrice}
              className="text-[11px] font-semibold text-rj-red-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
            >
              Reset
            </button>
          ) : null}
        </div>

        {attributeFilters.map((option) => (
          <select
            key={option.attributeKey}
            value={searchParams.get(option.attributeKey) ?? ""}
            onChange={(event) => updateParams({ [option.attributeKey]: event.target.value || null })}
            aria-label={`Filter by ${option.label.toLowerCase()}`}
            className="h-9 rounded-full border-[1.5px] border-rj-gray-200 bg-transparent px-3 text-[11px] font-bold text-rj-black outline-none transition-colors focus-visible:border-rj-black"
          >
            <option value="">All {option.label.toLowerCase()}s</option>
            {option.values.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        ))}

        {shops.length > 0 ? (
          <select
            value={activeShopId}
            onChange={(event) => updateParams({ shopId: event.target.value || null })}
            aria-label="Filter by shop"
            className="h-9 rounded-full border-[1.5px] border-rj-gray-200 bg-transparent px-3 text-[11px] font-bold text-rj-black outline-none transition-colors focus-visible:border-rj-black"
          >
            <option value="">All shops</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={sort}
          onChange={(event) => updateParams({ sort: event.target.value })}
          aria-label="Sort products"
          className="h-9 rounded-full border-[1.5px] border-rj-gray-200 bg-transparent px-3 text-[11px] font-bold text-rj-black outline-none transition-colors focus-visible:border-rj-black"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {sheetOpen ? (
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            className="mt-1 w-full rounded-full bg-rj-black py-3 text-sm font-bold text-rj-white transition-colors hover:bg-rj-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30 md:hidden"
          >
            Show results
          </button>
        ) : null}
      </div>
    </div>
  );
}
