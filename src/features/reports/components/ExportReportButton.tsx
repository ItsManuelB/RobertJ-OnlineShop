"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { isActionSuccess } from "@/types/action.types";

import { exportSalesReportAction } from "../actions/report.actions";
import type { ReportFilters } from "../types/report.types";

/**
 * Requests the CSV from the server action (which reuses the same RLS-scoped
 * reads) and triggers a client-side download. Kept as a button rather than a
 * link because the payload is generated on demand from the current filters.
 */
export function ExportReportButton({
  filters,
  sections,
}: {
  filters: ReportFilters;
  /** When given, the button first opens a panel listing what the file contains (Seller Reports). */
  sections?: string[];
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setIsExporting(true);
    setError(null);
    try {
      const result = await exportSalesReportAction(filters);
      if (!isActionSuccess(result)) {
        setError(result.error);
        return;
      }

      const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.data.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch {
      setError("We couldn't export the report. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="rjSm"
        onClick={sections ? () => { setError(null); setOpen(true); } : handleExport}
        isLoading={sections ? false : isExporting}
        className="text-foreground"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Export CSV
      </Button>
      {error && !open ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {sections ? (
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title="Export sales report"
          footer={
            <Button type="button" size="rjSm" onClick={handleExport} isLoading={isExporting}>
              Download CSV
            </Button>
          }
        >
          <div className="flex flex-col gap-3 text-sm text-foreground">
            <p>
              One CSV for {filters.from} to {filters.to} (Asia/Manila days). It uses the same figures as this page, so the file and the screen agree.
            </p>
            <ul className="list-disc pl-5 text-muted-foreground">
              {sections.map((section) => (
                <li key={section}>{section}</li>
              ))}
            </ul>
            {error ? (
              <p className="text-xs font-semibold text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}
