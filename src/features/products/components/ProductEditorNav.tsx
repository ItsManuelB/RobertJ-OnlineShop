import { Check } from "lucide-react";

import { cn } from "@/lib/utils/cn";

export type SectionState = "done" | "todo" | "optional";

export interface EditorSection {
  id: string;
  label: string;
  state: SectionState;
}

/**
 * The editor's left-hand panel: every section of the page in order, each
 * with whether it still needs something. Anchor links, so it works without
 * script and with the keyboard; sticky beside the form on wide screens, a
 * scrollable strip above it on narrow ones.
 */
export function ProductEditorNav({ sections }: { sections: EditorSection[] }) {
  return (
    <nav aria-label="Product sections" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
      <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:rounded-xl lg:border lg:border-border lg:bg-background lg:p-2">
        {sections.map((section) => (
          <li key={section.id} className="shrink-0 lg:shrink">
            <a
              href={`#${section.id}`}
              className="relative flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:border-transparent"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                  section.state === "done" ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  section.state === "todo" && "border-danger/70",
                )}
              >
                {section.state === "done" ? <Check className="h-3 w-3" /> : null}
              </span>
              <span>{section.label}</span>
              <span className="sr-only">
                {section.state === "done" ? "(complete)" : section.state === "todo" ? "(needs attention)" : "(optional)"}
              </span>
              {section.state === "optional" ? (
                <span aria-hidden="true" className="ml-auto hidden text-xs font-normal text-muted-foreground lg:inline">
                  Optional
                </span>
              ) : null}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
