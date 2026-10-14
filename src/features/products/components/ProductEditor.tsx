"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { ErrorState } from "@/components/feedback/ErrorState";
import { siteConfig } from "@/config/site";
import { ROUTES } from "@/constants/routes";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import {
  createProductAction,
  setProductImageVariantAction,
  updateProductAction,
  uploadProductImageAction,
} from "@/features/products/actions/product.actions";
import { ensureProductVariantAction } from "@/features/products/actions/product-variant.actions";
import {
  BasicsSection,
  DetailsSection,
  PriceStockSection,
  VisibilitySection,
} from "@/features/products/components/ProductEditorFieldSections";
import { ProductEditorActions } from "@/features/products/components/ProductEditorActions";
import { ProductEditorNav, type EditorSection } from "@/features/products/components/ProductEditorNav";
import { ProductEditorPreview, type PreviewCheckItem } from "@/features/products/components/ProductEditorPreview";
import { ProductEditorSection } from "@/features/products/components/ProductEditorSection";
import {
  ProductPhotosSection,
  type PendingPhoto,
  type PhotoSaveStatus,
} from "@/features/products/components/ProductPhotosSection";
import { ProductSaveProgress } from "@/features/products/components/ProductSaveProgress";
import { ProductStatusBadge } from "@/features/products/components/ProductStatusBadge";
import { ProductVariantManager } from "@/features/products/components/ProductVariantManager";
import {
  getSpecAttributes,
  toProductFormData,
  valuesFromProduct,
  type ProductEditorValues,
} from "@/features/products/lib/product-editor-values";
import {
  initialProgress,
  isSaveComplete,
  runProductSave,
  type SaveDeps,
  type SaveProgress,
} from "@/features/products/lib/product-save-flow";
import type { Category, CategoryAttribute } from "@/features/categories/types/category.types";
import type { Product, ProductImage, ProductVariant } from "@/features/products/types/product.types";
import { PRODUCT_STATUS, type ProductStatus } from "@/constants/status";
import { fromCents, toCents } from "@/lib/utils/currency";

export interface ProductEditorProps {
  mode: "create" | "edit";
  categories: Category[];
  /** Every category's attribute config — filtered here to the selected category. */
  categoryAttributes: CategoryAttribute[];
  /** Edit mode: the product being edited. */
  product?: Product;
  /** Edit mode: the product's saved options. */
  variants?: ProductVariant[];
  /** Which portal the page is in; decides every link (list, edit page, inventory). A plain string so a Server Component can pass it. */
  area: "seller" | "admin";
}

/**
 * The seller/admin product page: one editor for both adding and editing, with
 * the same sections in the same order. Editing saves the details with one
 * Save button while photos, options and tags save as soon as they change.
 * Adding keeps photos and options in the browser, then saves the product
 * first and its photos and options after it (see `product-save-flow` for the
 * retry and duplicate-prevention rules).
 */
export function ProductEditor(props: ProductEditorProps) {
  // Bumping the key remounts the form: a fresh product id and empty state for "Add another".
  const [session, setSession] = useState(0);
  return <ProductEditorForm key={session} {...props} onStartOver={() => setSession((value) => value + 1)} />;
}

function ProductEditorForm({
  mode,
  categories,
  categoryAttributes,
  product,
  variants,
  area,
  onStartOver,
}: ProductEditorProps & { onStartOver: () => void }) {
  const isEdit = mode === "edit";
  const listHref = area === "admin" ? ROUTES.adminProducts : ROUTES.sellerProducts;
  const inventoryHref = area === "admin" ? ROUTES.adminInventory : ROUTES.sellerInventory;
  const editHref = area === "admin" ? ROUTES.adminProductEdit : ROUTES.sellerProductEdit;
  const router = useRouter();

  const [values, setValues] = useState<ProductEditorValues>(() => valuesFromProduct(product));
  const specs = getSpecAttributes(categoryAttributes, values.categoryId);
  const [enabledSpecs, setEnabledSpecs] = useState<Set<"material" | "dimensions">>(
    () =>
      new Set(
        getSpecAttributes(categoryAttributes, valuesFromProduct(product).categoryId)
          .filter((spec) => Boolean(product?.[spec.attributeKey]))
          .map((spec) => spec.attributeKey),
      ),
  );

  // The product's own id for a new product. It doubles as the idempotency key
  // for creating it: the same id can only ever produce one product.
  const [clientId] = useState(() => crypto.randomUUID());
  const [optionVariants, setOptionVariants] = useState<ProductVariant[]>(variants ?? []);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [savedImages, setSavedImages] = useState<ProductImage[]>(product?.images ?? []);
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  const [completed, setCompleted] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const inFlight = useRef(false);

  const productSaved = progress?.product === "done";
  // What "unsaved" is measured against: the loaded product (or a blank form), then the last successful save.
  const snapshot = JSON.stringify({ values, specs: [...enabledSpecs].sort() });
  const [baseline, setBaseline] = useState(snapshot);
  const dirty =
    !completed &&
    !productSaved &&
    (snapshot !== baseline || (!isEdit && (pendingPhotos.length > 0 || optionVariants.length > 0)));
  const guard = useUnsavedChangesGuard(dirty);
  /** After the product exists, a new product's fields are locked — only the missing parts can still be retried. */
  const locked = !isEdit && productSaved;

  function setValue<K extends keyof ProductEditorValues>(key: K, value: ProductEditorValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous));
  }

  function changeCategory(categoryId: string) {
    if (!isEdit && optionVariants.length > 0) {
      setNotice("Options were cleared because the category changed. Add them again for the new category.");
    }
    setValue("categoryId", categoryId);
  }

  function toggleSpec(key: "material" | "dimensions", checked: boolean) {
    setEnabledSpecs((previous) => {
      const next = new Set(previous);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // ---- saving ----------------------------------------------------------

  function buildProgress(): SaveProgress {
    const colors = new Set(optionVariants.map((variant) => variant.color).filter(Boolean));
    return initialProgress(
      clientId,
      pendingPhotos.map((photo) => ({
        key: photo.key,
        file: photo.file,
        // A tag whose color no longer has an option can never be applied.
        color: photo.color && colors.has(photo.color) ? photo.color : null,
      })),
      optionVariants.map((variant) => ({
        key: variant.id,
        input: {
          sku: variant.sku ?? undefined,
          color: variant.color ?? undefined,
          size: variant.size ?? undefined,
          material: variant.material ?? undefined,
          dimensions: variant.dimensions ?? undefined,
          price: variant.priceCents !== null ? fromCents(variant.priceCents) : undefined,
        },
      })),
    );
  }

  function saveNewProduct(status: ProductStatus = values.status) {
    if (inFlight.current) return;
    if (!values.categoryId) {
      setFieldErrors({ categoryId: ["Select a category."] });
      setFormError("Please correct the highlighted fields.");
      document.getElementById("sec-basics")?.scrollIntoView({ block: "start" });
      return;
    }
    if (status === PRODUCT_STATUS.active && !(Number(values.quantity) > 0)) {
      showStockRule();
      return;
    }
    inFlight.current = true;
    setFormError(null);
    setFieldErrors({});
    setNotice(null);
    // Draft or Publish decides the status; it is what the product is created with.
    const toSave = { ...values, status };
    setValues(toSave);

    let createFieldErrors: Record<string, string[]> | undefined;
    const deps: SaveDeps = {
      createProduct: async () => {
        const result = await createProductAction(null, toProductFormData(toSave, specs, enabledSpecs, { clientId }));
        if (!result.success) {
          createFieldErrors = result.fieldErrors;
          return result;
        }
        return { success: true, data: { id: result.data.id } };
      },
      uploadPhoto: async (productId, file) => {
        const formData = new FormData();
        formData.append("image", file);
        const result = await uploadProductImageAction(productId, formData);
        return result.success ? { success: true, data: { id: result.data.id } } : result;
      },
      ensureVariant: async (productId, input) => {
        const result = await ensureProductVariantAction({ productId, ...input });
        return result.success ? { success: true, data: { id: result.data.id } } : result;
      },
      tagPhoto: (imageId, variantId) => setProductImageVariantAction({ imageId, variantId }),
    };

    // Once the product exists its fields are locked, so the saved progress is reused as-is
    // (that is what makes a retry skip everything already done); before that it is rebuilt
    // from whatever the seller has now.
    const start = progress?.product === "done" ? progress : buildProgress();
    startSaving(async () => {
      try {
        const next = await runProductSave(start, deps, setProgress);
        setProgress(next);
        if (next.product === "failed") {
          if (createFieldErrors) setFieldErrors(createFieldErrors);
          setFormError(next.productError ?? "Could not create the product.");
        }
        if (isSaveComplete(next)) {
          setCompleted(true);
          router.refresh();
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  /** An Active product must have a quantity above 0 (a database rule); say so next to the field instead of failing the save. */
  function showStockRule() {
    setFieldErrors({ quantity: ["Enter a quantity above 0 to make this product Active."] });
    setFormError("A product needs a quantity above 0 to be Active. Enter a quantity, or save it as a draft.");
    document.getElementById("sec-price")?.scrollIntoView({ block: "start" });
  }

  function saveExistingProduct() {
    if (!product || inFlight.current) return;
    if (values.status === PRODUCT_STATUS.active && !(Number(values.quantity) > 0)) {
      showStockRule();
      return;
    }
    inFlight.current = true;
    setFormError(null);
    setFieldErrors({});
    setNotice(null);
    const savedSnapshot = snapshot;
    startSaving(async () => {
      try {
        const result = await updateProductAction(null, toProductFormData(values, specs, enabledSpecs, { id: product.id }, { material: product.material, dimensions: product.dimensions }));
        if (!result.success) {
          setFieldErrors(result.fieldErrors ?? {});
          setFormError(result.error);
          return;
        }
        setBaseline(savedSnapshot);
        setNotice("Changes saved.");
        router.refresh();
      } finally {
        inFlight.current = false;
      }
    });
  }


  // ---- derived view state ----------------------------------------------

  const priceNumber = Number(values.price);
  const sections: EditorSection[] = [
    { id: "sec-basics", label: "Basics", state: values.categoryId && values.title.trim().length >= 2 ? "done" : "todo" },
    { id: "sec-photos", label: "Photos", state: (isEdit ? savedImages.length : pendingPhotos.length) > 0 ? "done" : "optional" },
    { id: "sec-price", label: "Price & stock", state: priceNumber > 0 ? "done" : "todo" },
    { id: "sec-options", label: "Options", state: optionVariants.length > 0 ? "done" : "optional" },
    { id: "sec-details", label: "Details", state: "optional" },
    { id: "sec-visibility", label: "Visibility", state: "done" },
  ];

  const hasPhoto = (isEdit ? savedImages.length : pendingPhotos.length) > 0;
  const checklist: PreviewCheckItem[] = [
    { label: "Category chosen", done: Boolean(values.categoryId), required: true },
    { label: "Product name added", done: values.title.trim().length >= 2, required: true },
    { label: "Price set", done: priceNumber > 0, required: true },
    { label: "Quantity above 0", done: Number(values.quantity) > 0, required: true },
    { label: "At least one photo", done: hasPhoto, required: false },
  ];
  const canPublish = checklist.filter((item) => item.required).every((item) => item.done);
  const optionLabels = optionVariants
    .map((variant) => [variant.color, variant.size, variant.material, variant.dimensions].filter(Boolean).join(" / "))
    .filter(Boolean);
  const preview = (
    <ProductEditorPreview
      coverUrl={isEdit ? (savedImages[0]?.url ?? null) : (pendingPhotos[0]?.previewUrl ?? null)}
      categoryName={categories.find((category) => category.id === values.categoryId)?.name ?? null}
      title={values.title}
      priceCents={priceNumber > 0 ? toCents(priceNumber) : null}
      currency={product?.currency ?? siteConfig.currency}
      optionLabels={optionLabels}
      status={values.status}
      checklist={checklist}
    />
  );
  const actions = (
    <ProductEditorActions
      isEdit={isEdit}
      locked={locked}
      isSaving={isSaving}
      canPublish={canPublish}
      publishHintId="publish-hint"
      listHref={listHref}
      onSaveDraft={() => saveNewProduct(PRODUCT_STATUS.draft)}
      onPublish={() => saveNewProduct(PRODUCT_STATUS.active)}
      onSave={saveExistingProduct}
    />
  );

  const photoStatus: Record<string, PhotoSaveStatus> = {};
  for (const photo of progress?.photos ?? []) {
    photoStatus[photo.key] = { status: photo.status, error: photo.error, tagError: photo.tagError };
  }

  const optionsContext = isEdit && product
    ? product
    : {
        id: clientId,
        categoryId: values.categoryId || null,
        priceCents: priceNumber > 0 ? toCents(priceNumber) : 0,
        currency: siteConfig.currency,
      };

  const title = isEdit ? `Edit ${product?.title ?? "product"}` : "Add a product";
  const savedElsewhere = isEdit ? null : progress?.productId;

  if (completed) {
    return (
      <div className="flex flex-col gap-5">
        <section role="status" className="rounded-2xl border border-border bg-background p-6">
          <h1 className="text-xl font-semibold text-foreground">Product created</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {values.title} was saved
            {progress && progress.photos.length > 0 ? ` with ${progress.photos.length} photo${progress.photos.length === 1 ? "" : "s"}` : ""}
            {progress && progress.options.length > 0 ? ` and ${progress.options.length} option${progress.options.length === 1 ? "" : "s"}` : ""}.
            {optionVariants.length > 0 ? " Set the stock for each option from Inventory." : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={listHref}
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Back to products
            </Link>
            {savedElsewhere ? (
              <Link
                href={editHref(savedElsewhere)}
                className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
              >
                Open this product
              </Link>
            ) : null}
            <Button type="button" variant="outline" className="min-h-11" onClick={onStartOver}>
              Add another product
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={listHref} className="text-sm text-muted-foreground hover:underline">
            ← Products
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 break-words text-xl font-semibold text-foreground">{title}</h1>
            <ProductStatusBadge status={values.status} />
          </div>
        </div>
        {actions}
      </header>
      {!isEdit && !locked && !canPublish ? (
        <p id="publish-hint" className="-mt-2 text-xs text-muted-foreground">
          To publish, add a category, a product name, a price and a quantity above 0. You can save as a draft at any time, with no quantity.
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <ProductEditorNav sections={sections} />
          <div className="hidden lg:block">{preview}</div>
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          {guard.blockedHref ? (
            <ConfirmPanel
              label="Leave this page"
              title="Leave without saving?"
              description="You have changes that haven't been saved."
              tone="neutral"
              confirmVariant="danger"
              confirmLabel="Leave"
              cancelLabel="Stay"
              onConfirm={guard.confirmLeave}
              onCancel={guard.stay}
            />
          ) : null}
          {formError ? <ErrorState title="Couldn't save the product" message={formError} /> : null}
          {notice ? (
            <p role="status" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
              {notice}
            </p>
          ) : null}
          {progress && (productSaved || progress.product === "failed") && !isEdit ? (
            <ProductSaveProgress
              progress={progress}
              isRetrying={isSaving}
              onRetry={() => saveNewProduct()}
              editHref={editHref(progress.productId)}
            />
          ) : null}

          <fieldset disabled={locked} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
            <BasicsSection
              values={values}
              setValue={setValue}
              fieldErrors={fieldErrors}
              categories={categories}
              onCategoryChange={changeCategory}
            />

            <ProductEditorSection
              id="sec-photos"
              title="Photos"
              description={isEdit ? "Photos save as soon as you add, remove or tag them." : "They're saved together with the product when you create it."}
            >
              <ProductPhotosSection
                mode={mode}
                productId={product?.id}
                initialImages={product?.images}
                variants={optionVariants}
                pending={pendingPhotos}
                onPendingChange={setPendingPhotos}
                disabled={locked}
                saveStatus={photoStatus}
                onImagesChange={setSavedImages}
              />
            </ProductEditorSection>

            <PriceStockSection
              values={values}
              setValue={setValue}
              fieldErrors={fieldErrors}
              hasOptions={optionVariants.length > 0}
              isEdit={isEdit}
              inventoryHref={inventoryHref}
            />

            <ProductEditorSection
              id="sec-options"
              title="Options"
              description={
                isEdit
                  ? "Optional. Sizes, colors and more. Options save as soon as you change them."
                  : "Optional. Sizes, colors and more. They're saved together with the product when you create it."
              }
            >
              {!isEdit && !values.categoryId ? (
                <p className="text-sm text-muted-foreground">Choose a category above to see the options it offers.</p>
              ) : (
                <ProductVariantManager
                  key={isEdit ? product?.id : values.categoryId}
                  product={optionsContext}
                  variants={isEdit ? (variants ?? []) : []}
                  mode={isEdit ? "live" : "draft"}
                  onVariantsChange={setOptionVariants}
                  categoryAttributes={categoryAttributes}
                />
              )}
            </ProductEditorSection>

            <DetailsSection
              values={values}
              setValue={setValue}
              fieldErrors={fieldErrors}
              specs={specs}
              enabledSpecs={enabledSpecs}
              onToggleSpec={toggleSpec}
            />

            <VisibilitySection values={values} setValue={setValue} isEdit={isEdit} />

          </fieldset>

          <details className="rounded-xl border border-border bg-background p-3 lg:hidden">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-foreground">Preview and checklist</summary>
            <div className="mt-2">{preview}</div>
          </details>

          {actions}
        </div>
      </div>
    </div>
  );
}
