import Image from "next/image";
import { Check } from "lucide-react";

import { PRODUCT_STATUS, type ProductStatus } from "@/constants/status";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

export interface PreviewCheckItem {
  label: string;
  done: boolean;
  /** Required items must be done before Publish is enabled; the rest are only recommended. */
  required: boolean;
}

export interface ProductEditorPreviewProps {
  coverUrl: string | null;
  categoryName: string | null;
  title: string;
  priceCents: number | null;
  currency: string;
  optionLabels: string[];
  status: ProductStatus;
  checklist: PreviewCheckItem[];
}

const MAX_OPTION_CHIPS = 8;

/**
 * "How buyers will see it" plus the "before you publish" checklist, beside the
 * form. Reads only what the form already holds, so it needs no data of its
 * own and always matches what is on the page.
 */
export function ProductEditorPreview({
  coverUrl,
  categoryName,
  title,
  priceCents,
  currency,
  optionLabels,
  status,
  checklist,
}: ProductEditorPreviewProps) {
  const isDraft = status === PRODUCT_STATUS.draft;
  return (
    <div className="flex flex-col gap-3">
      <section aria-label="Preview" className="overflow-hidden rounded-xl border border-border bg-background">
        <p className="bg-muted px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How buyers will see it
        </p>
        <div className="flex flex-col gap-1.5 p-3">
          <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-muted">
            {coverUrl ? (
              <Image
                src={coverUrl}
                alt=""
                fill
                unoptimized={coverUrl.startsWith("blob:")}
                sizes="224px"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full items-center justify-center text-xs text-muted-foreground">No photo yet</span>
            )}
          </div>
          {categoryName ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{categoryName}</p>
          ) : null}
          <p className="break-words text-base font-semibold text-foreground">{title.trim() || "Product name"}</p>
          <p className="text-sm font-semibold text-foreground">
            {priceCents !== null && priceCents > 0 ? formatCurrency(priceCents, currency) : "Price not set"}
          </p>
          {optionLabels.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Options">
              {optionLabels.slice(0, MAX_OPTION_CHIPS).map((label) => (
                <li key={label} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground">
                  {label}
                </li>
              ))}
              {optionLabels.length > MAX_OPTION_CHIPS ? (
                <li className="px-1 py-0.5 text-xs text-muted-foreground">+{optionLabels.length - MAX_OPTION_CHIPS} more</li>
              ) : null}
            </ul>
          ) : null}
          {isDraft ? <p className="text-xs text-muted-foreground">Hidden from buyers until you publish.</p> : null}
        </div>
      </section>

      <section aria-label="Before you publish" className="rounded-xl border border-border bg-background p-3">
        <h2 className="text-sm font-semibold text-foreground">Before you publish</h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                  item.done ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {item.done ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className={item.done ? "text-foreground" : "text-muted-foreground"}>
                {item.label}
                {item.done ? <span className="sr-only"> (done)</span> : <span className="sr-only"> (not done)</span>}
                {!item.required && !item.done ? <span className="ml-1 text-xs">(recommended)</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
