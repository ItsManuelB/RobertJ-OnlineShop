/**
 * Orchestrates "save a brand-new product together with its photos and
 * options" as a resumable, idempotent sequence. Pure on purpose: no framework
 * or Supabase imports, every side effect arrives through `SaveDeps`, so the
 * retry/partial-failure rules below are unit-testable with plain fakes
 * (scripts/test-product-save-flow.mjs).
 *
 * The rules, each of which exists to prevent a specific bad outcome:
 *  - Product first. Nothing else is attempted until the product exists —
 *    photos and options need its id. `createProduct` is idempotent on the
 *    caller's `clientId`, so re-running this step can never duplicate it.
 *  - Completed steps are never repeated. Progress is carried between runs, so
 *    a retry only does what is still outstanding (no double uploads).
 *  - Photos upload in order and STOP at the first failure: the first photo is
 *    the cover, so a later photo must never land ahead of an earlier one that
 *    failed. The remaining photos wait for the retry.
 *  - Options are independent: one failing never blocks the others.
 *    `ensureVariant` is idempotent per combination, so retries are safe.
 *  - Photo-to-color tags are applied last, only once both the photo and a
 *    variant of that color exist. A failed tag leaves the (saved) photo
 *    untagged and is retried on its own.
 *  - Never throws: a throwing dependency becomes a failed step with a message.
 */

export type ActionLike<T> = { success: true; data: T } | { success: false; error: string };

export type StepStatus = "pending" | "done" | "failed";

/** The option fields a draft carries — `ProductVariantFormInput` without `productId`. Price is in major units, like the form. */
export interface OptionInput {
  sku?: string;
  color?: string;
  size?: string;
  material?: string;
  dimensions?: string;
  price?: number;
}

export interface PhotoStep<F = File> {
  key: string;
  file: F;
  /** Color the seller tagged this photo with ("Shows for"); resolved to a variant after options exist. */
  color: string | null;
  status: StepStatus;
  imageId?: string;
  tagged: boolean;
  error?: string;
  tagError?: string;
}

export interface OptionStep {
  key: string;
  input: OptionInput;
  status: StepStatus;
  variantId?: string;
  error?: string;
}

export interface SaveProgress<F = File> {
  productId: string;
  product: StepStatus;
  productError?: string;
  photos: PhotoStep<F>[];
  options: OptionStep[];
}

export interface SaveDeps<F = File> {
  /** Creates the product (idempotent on its client id) — closes over the form data. */
  createProduct(): Promise<ActionLike<{ id: string }>>;
  uploadPhoto(productId: string, file: F): Promise<ActionLike<{ id: string }>>;
  ensureVariant(productId: string, input: OptionInput): Promise<ActionLike<{ id: string }>>;
  tagPhoto(imageId: string, variantId: string): Promise<ActionLike<unknown>>;
}

export function initialProgress<F = File>(
  productId: string,
  photos: { key: string; file: F; color: string | null }[],
  options: { key: string; input: OptionInput }[],
): SaveProgress<F> {
  return {
    productId,
    product: "pending",
    photos: photos.map((photo) => ({ ...photo, status: "pending" as const, tagged: false })),
    options: options.map((option) => ({ ...option, status: "pending" as const })),
  };
}

async function attempt<T>(run: () => Promise<ActionLike<T>>, fallback: string): Promise<ActionLike<T>> {
  try {
    return await run();
  } catch (error) {
    return { success: false, error: error instanceof Error && error.message ? error.message : fallback };
  }
}

function clone<F>(progress: SaveProgress<F>): SaveProgress<F> {
  return {
    ...progress,
    photos: progress.photos.map((photo) => ({ ...photo })),
    options: progress.options.map((option) => ({ ...option })),
  };
}

/** A tag is only owed when some option of that color exists; a color with no option behind it can never be applied, so it must not hold the save open. */
function owesTag<F>(progress: SaveProgress<F>, photo: PhotoStep<F>): boolean {
  return photo.color !== null && progress.options.some((option) => option.input.color === photo.color);
}

/** Everything saved: product, every photo, every option, every tag that is owed. */
export function isSaveComplete<F>(progress: SaveProgress<F>): boolean {
  return (
    progress.product === "done" &&
    progress.photos.every((photo) => photo.status === "done" && (!owesTag(progress, photo) || photo.tagged)) &&
    progress.options.every((option) => option.status === "done")
  );
}

/**
 * Runs whatever is still outstanding and returns the new progress (the input
 * is not mutated). `onProgress` receives a snapshot after every step so the
 * UI can show live status.
 */
export async function runProductSave<F = File>(
  start: SaveProgress<F>,
  deps: SaveDeps<F>,
  onProgress?: (progress: SaveProgress<F>) => void,
): Promise<SaveProgress<F>> {
  const progress = clone(start);
  const report = () => onProgress?.(clone(progress));

  // 1. Product — nothing else can happen without it.
  if (progress.product !== "done") {
    const result = await attempt(() => deps.createProduct(), "Could not create the product.");
    if (!result.success) {
      progress.product = "failed";
      progress.productError = result.error;
      report();
      return progress;
    }
    progress.product = "done";
    progress.productError = undefined;
    progress.productId = result.data.id;
    report();
  }

  // 2. Photos — in order, stopping at the first failure.
  for (const photo of progress.photos) {
    if (photo.status === "done") continue;
    const result = await attempt(() => deps.uploadPhoto(progress.productId, photo.file), "Could not upload the photo.");
    if (!result.success) {
      photo.status = "failed";
      photo.error = result.error;
      report();
      break;
    }
    photo.status = "done";
    photo.imageId = result.data.id;
    photo.error = undefined;
    report();
  }

  // 3. Options — independent of each other.
  for (const option of progress.options) {
    if (option.status === "done") continue;
    const result = await attempt(() => deps.ensureVariant(progress.productId, option.input), "Could not save the option.");
    if (!result.success) {
      option.status = "failed";
      option.error = result.error;
    } else {
      option.status = "done";
      option.variantId = result.data.id;
      option.error = undefined;
    }
    report();
  }

  // 4. Photo tags — only where both sides exist; the first saved option of a color represents it.
  for (const photo of progress.photos) {
    if (photo.status !== "done" || photo.color === null || photo.tagged || !photo.imageId) continue;
    const target = progress.options.find((option) => option.status === "done" && option.input.color === photo.color);
    if (!target?.variantId) continue;
    const result = await attempt(() => deps.tagPhoto(photo.imageId as string, target.variantId as string), "Could not tag the photo.");
    if (result.success) {
      photo.tagged = true;
      photo.tagError = undefined;
    } else {
      photo.tagError = result.error;
    }
    report();
  }

  return progress;
}
