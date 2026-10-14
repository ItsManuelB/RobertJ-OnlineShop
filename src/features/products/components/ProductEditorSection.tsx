import type { ReactNode } from "react";

export interface ProductEditorSectionProps {
  /** Anchor id the left panel links to. */
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}

/** One titled card of the editor page. `scroll-mt` keeps the heading clear of the top edge when the left panel jumps to it. */
export function ProductEditorSection({ id, title, description, children }: ProductEditorSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 rounded-2xl border border-border bg-background p-5">
      <div className="mb-4">
        <h2 id={`${id}-title`} className="text-base font-semibold text-foreground">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
