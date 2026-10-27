import Link from "next/link";
import type { ReactNode } from "react";
import { X } from "lucide-react";

import type { GuidedAnswerKey } from "@/features/assistant/utils/guided-url";

export interface GuidedAnswerChip {
  key: GuidedAnswerKey;
  label: string;
  /** Links on the results page; inside the steps the list-level `onEdit` / `onRemove` are used instead. */
  editHref?: string;
  removeHref?: string;
}

const CHIP =
  "inline-flex items-center rounded-full border border-rj-gray-200 bg-rj-gray-50 text-xs font-semibold text-rj-black";
const PART =
  "flex min-h-8 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30";

/**
 * "Your answers": one chip per answer. Tapping the chip goes back to that question; the x
 * drops just that answer. Used by the steps (callbacks) and the results page (links).
 */
export function GuidedAnswerChips({
  items,
  action,
  onEdit,
  onRemove,
}: {
  items: GuidedAnswerChip[];
  action?: ReactNode;
  onEdit?: (key: GuidedAnswerKey) => void;
  onRemove?: (key: GuidedAnswerKey) => void;
}) {
  if (items.length === 0 && !action) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rj-gray-100 bg-rj-white p-3">
      <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-rj-gray-600">Your answers</span>
      {items.map((item) => {
        const editLabel = `Change ${item.label}`;
        const removeLabel = `Remove ${item.label}`;
        return (
          <span key={item.key} className={CHIP}>
            {item.editHref ? (
              <Link href={item.editHref} className={`${PART} pl-3 pr-1.5`} aria-label={editLabel}>
                {item.label}
              </Link>
            ) : (
              <button type="button" onClick={() => onEdit?.(item.key)} className={`${PART} pl-3 pr-1.5`} aria-label={editLabel}>
                {item.label}
              </button>
            )}
            {item.removeHref ? (
              <Link href={item.removeHref} className={`${PART} px-1.5 text-rj-gray-600 hover:text-rj-black`} aria-label={removeLabel}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onRemove?.(item.key)}
                className={`${PART} px-1.5 text-rj-gray-600 hover:text-rj-black`}
                aria-label={removeLabel}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </span>
        );
      })}
      {action ? <span className="ml-auto">{action}</span> : null}
    </div>
  );
}
