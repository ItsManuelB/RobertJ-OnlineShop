import { Check } from "lucide-react";

/**
 * "Saved" confirmation for changes that save instantly. The live region is
 * always in the page so a screen reader announces the text when it appears.
 */
export function SavedNote({ visible }: { visible: boolean }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex min-h-5 items-center gap-1 text-xs font-medium text-primary">
      {visible ? (
        <>
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Saved
        </>
      ) : null}
    </span>
  );
}
