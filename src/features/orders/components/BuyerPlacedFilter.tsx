"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  BUYER_PLACED_ANY_LABEL,
  BUYER_PLACED_LABELS,
  BUYER_PLACED_WINDOWS,
} from "@/features/orders/constants/buyer-placed.constants";

/** "Placed" date window for the buyer `/orders` page. Sets a `placed` URL param and restarts from page 1. */
export function BuyerPlacedFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("placed", value);
    } else {
      params.delete("placed");
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      <label htmlFor="order-placed" className="sr-only">
        Filter by date placed
      </label>
      <select
        id="order-placed"
        value={searchParams.get("placed") ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-full border-[1.5px] border-rj-gray-200 bg-transparent px-4 text-sm text-rj-black outline-none transition-colors focus-visible:border-rj-black sm:w-auto"
      >
        <option value="">{BUYER_PLACED_ANY_LABEL}</option>
        {BUYER_PLACED_WINDOWS.map((window) => (
          <option key={window} value={window}>
            {BUYER_PLACED_LABELS[window]}
          </option>
        ))}
      </select>
    </div>
  );
}
