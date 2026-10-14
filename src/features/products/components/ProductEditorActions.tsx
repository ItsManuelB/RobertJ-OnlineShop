import Link from "next/link";

import { Button } from "@/components/ui/button";

export interface ProductEditorActionsProps {
  isEdit: boolean;
  /** A new product whose record already exists: only retrying the missing parts is left, so the main buttons go away. */
  locked: boolean;
  isSaving: boolean;
  /** The required fields are filled in, so Publish can be used. */
  canPublish: boolean;
  /** Describes why Publish is disabled, for assistive tech. */
  publishHintId: string;
  listHref: string;
  onSaveDraft: () => void;
  onPublish: () => void;
  onSave: () => void;
}

const SECONDARY = "inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted";

/** The page's primary actions, rendered both in the header and below the form. Adding: Save as draft or Publish. Editing: Save changes. */
export function ProductEditorActions({
  isEdit,
  locked,
  isSaving,
  canPublish,
  publishHintId,
  listHref,
  onSaveDraft,
  onPublish,
  onSave,
}: ProductEditorActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={listHref} className={SECONDARY}>
        {isEdit ? "Back" : "Discard"}
      </Link>
      {locked ? null : isEdit ? (
        <Button type="button" variant="primary" className="min-h-11" isLoading={isSaving} onClick={onSave}>
          Save changes
        </Button>
      ) : (
        <>
          <Button type="button" variant="outline" className="min-h-11" disabled={isSaving} onClick={onSaveDraft}>
            Save as draft
          </Button>
          <Button
            type="button"
            variant="primary"
            className="min-h-11"
            isLoading={isSaving}
            disabled={!canPublish}
            aria-describedby={canPublish ? undefined : publishHintId}
            onClick={onPublish}
          >
            Publish
          </Button>
        </>
      )}
    </div>
  );
}
