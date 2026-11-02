"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

import { exportSellerDataAction } from "../actions/seller-settings.actions";

/**
 * Settings > Your data. The server builds the file from the signed-in seller's
 * own records; this only turns the returned object into a JSON download.
 */
export function SellerDownloadDataPanel() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDownload() {
    if (isPending) return;
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await exportSellerDataAction();
      if (!result.success) {
        setError(result.error);
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `robertj-seller-data-${result.data.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDone(true);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Get a copy of your account details, shop profile and alert settings as a file you can keep. Order and sales
        records are in Reports.
      </p>
      <button
        type="button"
        onClick={handleDownload}
        disabled={isPending}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start gap-2")}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {isPending ? "Preparing…" : "Download my data"}
      </button>
      {done ? (
        <p className="text-xs font-semibold text-muted-foreground" role="status">
          Your file has been downloaded.
        </p>
      ) : null}
      {error ? (
        <p className="text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
