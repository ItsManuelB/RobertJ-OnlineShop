"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ExportReportButton } from "@/features/reports/components/ExportReportButton";
import type { ReportFilters } from "@/features/reports/types/report.types";

export interface SellerExportMenuProps {
  filters: ReportFilters;
  /** What the CSV contains — listed in the existing download panel. */
  sections: string[];
  /** The print-ready report; opens in a new tab. */
  pdfHref: string;
}

const ITEM =
  "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

/**
 * One Export button for the Seller Reports header: CSV (opens the existing
 * "what's in this file" panel, then downloads) and PDF (the print route, in a
 * new tab). Same two exports as before, behind one control.
 */
export function SellerExportMenu({ filters, sections, pdfHref }: SellerExportMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="rjSm"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
        className="text-foreground"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Export
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1.5 flex min-w-48 flex-col rounded-xl border border-border bg-card p-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            onClick={() => {
              setMenuOpen(false);
              setCsvOpen(true);
            }}
          >
            Download CSV
          </button>
          <a
            role="menuitem"
            href={pdfHref}
            target="_blank"
            rel="noopener"
            className={ITEM}
            onClick={() => setMenuOpen(false)}
          >
            Open PDF
          </a>
        </div>
      ) : null}
      <ExportReportButton
        filters={filters}
        sections={sections}
        drawerOpen={csvOpen}
        onDrawerOpenChange={setCsvOpen}
      />
    </div>
  );
}
