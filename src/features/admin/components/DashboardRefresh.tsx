"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils/cn";

const TIME_FORMAT = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * "Last updated" time with a Refresh button. The figures are read when the page loads, so
 * this says how fresh they are and re-reads them without a full reload.
 */
export function DashboardRefresh() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());

  function refresh() {
    startTransition(() => {
      router.refresh();
      setUpdatedAt(Date.now());
    });
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      {/* The server and the browser render this a moment apart, so the text may differ on first paint. */}
      <span suppressHydrationWarning>Last updated {TIME_FORMAT.format(updatedAt)}</span>
      <button
        type="button"
        onClick={refresh}
        disabled={isPending}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border px-2.5 font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} aria-hidden="true" />
        Refresh
      </button>
    </div>
  );
}
