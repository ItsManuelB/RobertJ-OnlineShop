"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { exportMyDataAction } from "@/features/account/actions/account.actions";
import { exportFileName } from "@/features/account/lib/export-my-data";
import { cn } from "@/lib/utils/cn";

/**
 * `/privacy`'s "Your data" section. The server builds the export from the
 * caller's own records; this component only turns the returned object into a
 * JSON file download. No payment details or internal ids are in the file.
 */
export function DownloadMyDataPanel() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDownload() {
    if (isPending) return;
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await exportMyDataAction();
      if (!result.success) {
        setError(result.error);
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName(result.data.exportedAt);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDone(true);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-rj-gray-600">
        Get a copy of your profile, addresses, preferences and order history as a file you can
        keep.
      </p>
      <button
        type="button"
        onClick={handleDownload}
        disabled={isPending}
        className={cn(buttonVariants({ variant: "outline", size: "rjSm" }), "self-start gap-2")}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {isPending ? "Preparing…" : "Download my data"}
      </button>
      {done ? (
        <p className="text-xs font-semibold text-rj-gray-600" role="status">
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
