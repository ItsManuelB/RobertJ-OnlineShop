"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FILTER_CHIP_ACTIVE_THEMED, FILTER_CHIP_IDLE_THEMED } from "@/components/ui/filter-chip";
import type { Category } from "@/features/categories/types/category.types";

export interface DashboardCategoryFilterProps {
  categories: Category[];
}

/** Category chips for the Products dashboard table (same pattern as the status chips) — sets `categoryId`, always clears `page`. */
export function DashboardCategoryFilter({ categories }: DashboardCategoryFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeCategoryId = searchParams.get("categoryId") ?? "";

  function updateParams(categoryId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (categoryId) params.set("categoryId", categoryId);
    else params.delete("categoryId");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter products by category">
      <button
        type="button"
        aria-pressed={!activeCategoryId}
        className={!activeCategoryId ? FILTER_CHIP_ACTIVE_THEMED : FILTER_CHIP_IDLE_THEMED}
        onClick={() => updateParams("")}
      >
        All categories
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          aria-pressed={activeCategoryId === category.id}
          className={activeCategoryId === category.id ? FILTER_CHIP_ACTIVE_THEMED : FILTER_CHIP_IDLE_THEMED}
          onClick={() => updateParams(category.id)}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
