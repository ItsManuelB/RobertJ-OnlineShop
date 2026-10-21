"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

type InventoryView = "grouped" | "flat";

/** Admin-only presentation toggle; the URL keeps the view while paging/filtering. */
export function AdminInventoryViewToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentView: InventoryView = searchParams.get("view") === "flat" ? "flat" : "grouped";

  function setView(view: InventoryView) {
    const params = new URLSearchParams(searchParams.toString());
    if (view === "flat") params.set("view", "flat");
    else params.delete("view");

    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    router.replace(href, { scroll: false });
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1" role="group" aria-label="Inventory view">
      <Button
        type="button"
        size="rjSm"
        variant={currentView === "grouped" ? "primary" : "ghost"}
        aria-pressed={currentView === "grouped"}
        onClick={() => setView("grouped")}
        className="text-foreground"
      >
        Grouped by shop
      </Button>
      <Button
        type="button"
        size="rjSm"
        variant={currentView === "flat" ? "primary" : "ghost"}
        aria-pressed={currentView === "flat"}
        onClick={() => setView("flat")}
        className="text-foreground"
      >
        Flat list
      </Button>
    </div>
  );
}
