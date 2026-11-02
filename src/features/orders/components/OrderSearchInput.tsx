"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils/cn";

/**
 * Keeps the `search` query param in sync with a debounced Order-ID input.
 * Clears `page` so a search always restarts from page 1. Renders on Buyer
 * /orders and both portals' Orders list — pass `themed` from the portal
 * pages only; Buyer omits it and keeps the fixed rj-* look.
 */
export function OrderSearchInput({
  themed = false,
  label = "Search by order number",
  placeholder = "Search by Order ID…",
}: {
  themed?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [value, setValue] = useState(searchParams.get("search") ?? "");
  const debounced = useDebouncedValue(value, 350);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.get("search") ?? "";
    if (current === debounced) return;

    if (debounced) {
      params.set("search", debounced);
    } else {
      params.delete("search");
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [debounced, pathname, router, searchParams]);

  return (
    <div className="w-full max-w-sm">
      <label htmlFor="order-search" className="sr-only">
        {label}
      </label>
      <input
        id="order-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-11 w-full rounded-full border-[1.5px] bg-transparent px-5 text-sm outline-none transition-colors",
          themed
            ? "border-border text-foreground placeholder:text-muted-foreground focus-visible:border-primary"
            : "border-rj-gray-200 text-rj-black placeholder:text-rj-gray-400 focus-visible:border-rj-black",
        )}
      />
    </div>
  );
}
