import Link from "next/link";
import { CircleAlert, CircleCheck, CircleDashed } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SaveProgress, StepStatus } from "@/features/products/lib/product-save-flow";

export interface ProductSaveProgressProps {
  progress: SaveProgress;
  isRetrying: boolean;
  onRetry: () => void;
  /** Where the saved product can be opened to finish things by hand. */
  editHref: string;
}

function Icon({ status }: { status: StepStatus }) {
  if (status === "done") return <CircleCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />;
  if (status === "failed") return <CircleAlert className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />;
  return <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

/**
 * Shown while saving a new product, and after a partial failure. The product
 * itself may already exist (and must not be created again) while some photos
 * or options did not make it; this lists exactly what is saved and what is
 * not, and retrying only redoes the rest.
 */
export function ProductSaveProgress({ progress, isRetrying, onRetry, editHref }: ProductSaveProgressProps) {
  const rows: { label: string; status: StepStatus; error?: string }[] = [
    { label: "Product details", status: progress.product, error: progress.productError },
    ...progress.photos.map((photo, index) => ({
      label: `Photo ${index + 1} (${(photo.file as File).name})`,
      status: photo.status,
      error: photo.error ?? (photo.tagError ? `Saved, but the color tag was not applied: ${photo.tagError}` : undefined),
    })),
    ...progress.options.map((option) => ({
      label: `Option ${[option.input.color, option.input.size, option.input.material, option.input.dimensions].filter(Boolean).join(" / ")}`,
      status: option.status,
      error: option.error,
    })),
  ];
  const productSaved = progress.product === "done";

  return (
    <section
      aria-live="polite"
      className="rounded-2xl border border-border bg-background p-5"
    >
      <h2 className="text-base font-semibold text-foreground">
        {productSaved ? "Your product is saved, but some parts are not" : "Saving your product"}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {productSaved
          ? "Nothing will be saved twice. Retrying only does what is still missing."
          : "Nothing else has been saved yet. It's safe to try again; this won't create a second product."}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-start gap-2 text-sm">
            <Icon status={row.status} />
            <span className="min-w-0">
              <span className="font-medium text-foreground">{row.label}</span>
              {row.error ? <span className="block text-xs text-danger">{row.error}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="rjSm" isLoading={isRetrying} onClick={onRetry}>
          Retry what&apos;s missing
        </Button>
        {productSaved ? (
          <Link
            href={editHref}
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-[12px] font-medium hover:bg-muted"
          >
            Open the saved product
          </Link>
        ) : null}
      </div>
    </section>
  );
}
