"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  WISHLIST_SHOWS,
  WISHLIST_SHOW_LABELS,
  WISHLIST_SORTS,
  WISHLIST_SORT_LABELS,
  type WishlistShow,
  type WishlistSort,
} from "@/features/wishlist/utils/wishlist-view";
import { cn } from "@/lib/utils/cn";

export interface WishlistControlsProps {
  sort: WishlistSort;
  show: WishlistShow;
  /** Items each availability chip would show. */
  counts: Record<WishlistShow, number>;
}

/** Sort and availability chips for the wishlist; both live in the URL (`sort`, `show`). */
export function WishlistControls({ sort, show, counts }: WishlistControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: "sort" | "show", value: string, defaultValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === defaultValue) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div role="group" aria-label="Filter by availability" className="flex flex-wrap gap-2">
        {WISHLIST_SHOWS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={show === value}
            onClick={() => setParam("show", value, "all")}
            className={cn(
              "min-h-9 rounded-full border-[1.5px] px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30",
              show === value
                ? "border-rj-black bg-rj-black text-rj-white"
                : "border-rj-gray-200 text-rj-gray-600 hover:border-rj-black hover:text-rj-black",
            )}
          >
            {WISHLIST_SHOW_LABELS[value]} ({counts[value]})
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="wishlist-sort" className="sr-only">
          Sort wishlist
        </label>
        <select
          id="wishlist-sort"
          value={sort}
          onChange={(event) => setParam("sort", event.target.value, "recent")}
          className="h-10 w-full rounded-full border-[1.5px] border-rj-gray-200 bg-transparent px-4 text-sm text-rj-black outline-none transition-colors focus-visible:border-rj-black sm:w-auto"
        >
          {WISHLIST_SORTS.map((value) => (
            <option key={value} value={value}>
              {WISHLIST_SORT_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
