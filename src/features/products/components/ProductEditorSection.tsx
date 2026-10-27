"use client";

import { Check } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { SectionState } from "@/features/products/components/ProductEditorNav";
import { cn } from "@/lib/utils/cn";

/**
 * Section id -> state, provided once by `ProductEditor` so each card can show
 * its own done / needs-attention / optional mark without every section
 * component (Basics, Price & stock, …) having to be handed a prop for it.
 */
export const EditorSectionStateContext = createContext<Record<string, SectionState>>({});

export interface ProductEditorSectionProps {
  /** Anchor id the left panel links to. */
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}

/** One titled card of the editor page. `scroll-mt` keeps the heading clear of the top edge when the left panel jumps to it. */
export function ProductEditorSection({ id, title, description, children }: ProductEditorSectionProps) {
  const state = useContext(EditorSectionStateContext)[id];

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 rounded-2xl border border-border bg-background p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {state ? (
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                state === "done" ? "border-primary bg-primary text-primary-foreground" : "border-border",
                state === "todo" && "border-danger/70",
              )}
            >
              {state === "done" ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-base font-semibold text-foreground">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {state === "todo" ? <Badge tone="danger">Needs attention</Badge> : null}
        {state === "optional" ? <Badge tone="neutral">Optional</Badge> : null}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
