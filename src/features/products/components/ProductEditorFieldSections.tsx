"use client";

import Link from "next/link";

import { Checkbox } from "@/components/ui/checkbox";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { FormField } from "@/components/forms/FormField";
import {
  PRODUCT_CONDITION_LABELS,
  PRODUCT_STATUS_LABELS,
  type ProductCondition,
  type ProductStatus,
} from "@/constants/status";
import { ProductEditorSection } from "@/features/products/components/ProductEditorSection";
import type { ProductEditorValues, SpecAttribute } from "@/features/products/lib/product-editor-values";
import type { Category, ProductAttributeKey } from "@/features/categories/types/category.types";

const textareaClasses =
  "min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

const SPEC_LABELS: Record<ProductAttributeKey, string> = {
  color: "Color",
  size: "Size",
  material: "Material",
  dimensions: "Dimensions",
};

const CONDITION_OPTIONS = (Object.keys(PRODUCT_CONDITION_LABELS) as ProductCondition[]).map((value) => ({
  value,
  label: PRODUCT_CONDITION_LABELS[value],
}));
const STATUS_OPTIONS = (Object.keys(PRODUCT_STATUS_LABELS) as ProductStatus[]).map((value) => ({
  value,
  label: PRODUCT_STATUS_LABELS[value],
}));

/** What every field section of the product editor needs to read and write one value. */
export interface FieldSectionProps {
  values: ProductEditorValues;
  setValue: <K extends keyof ProductEditorValues>(key: K, value: ProductEditorValues[K]) => void;
  fieldErrors: Record<string, string[] | undefined>;
}

export function BasicsSection({
  values,
  setValue,
  fieldErrors,
  categories,
  onCategoryChange,
}: FieldSectionProps & { categories: Category[]; onCategoryChange: (categoryId: string) => void }) {
  return (
    <ProductEditorSection id="sec-basics" title="Basics" description="Pick a category first. It decides which sizes and details apply.">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground" id="category-label">
          Category
        </span>
        <ChoiceGroup
          label="Category"
          variant="tile"
          options={categories.map((category) => ({ value: category.id, label: category.name }))}
          value={values.categoryId}
          onChange={onCategoryChange}
        />
        {fieldErrors.categoryId ? (
          <p role="alert" className="text-xs text-danger">
            {fieldErrors.categoryId[0]}
          </p>
        ) : null}
      </div>
      <FormField
        label="Product name"
        value={values.title}
        onChange={(event) => setValue("title", event.target.value)}
        placeholder="e.g. Slim fit chino shorts"
        errors={fieldErrors.title}
        required
        themed
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="product-description" className="text-sm font-medium">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="product-description"
          value={values.description}
          onChange={(event) => setValue("description", event.target.value)}
          placeholder="Describe the item…"
          className={textareaClasses}
        />
      </div>
    </ProductEditorSection>
  );
}

export function PriceStockSection({
  values,
  setValue,
  fieldErrors,
  hasOptions,
  isEdit,
  inventoryHref,
}: FieldSectionProps & { hasOptions: boolean; isEdit: boolean; inventoryHref: string }) {
  return (
    <ProductEditorSection id="sec-price" title="Price & stock">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Price (PHP)"
          type="number"
          step="0.01"
          min="0.01"
          value={values.price}
          onChange={(event) => setValue("price", event.target.value)}
          errors={fieldErrors.price}
          required
          themed
        />
        <FormField
          label="Quantity"
          type="number"
          min="0"
          step="1"
          value={values.quantity}
          onChange={(event) => setValue("quantity", event.target.value)}
          errors={fieldErrors.quantity}
          hint={
            hasOptions ? (
              <>
                This product has options, so each option has its own stock.{" "}
                {isEdit ? (
                  <Link href={inventoryHref} className="underline">
                    Manage stock
                  </Link>
                ) : (
                  "Set it from Inventory after saving."
                )}
              </>
            ) : undefined
          }
          required
          themed
        />
      </div>
    </ProductEditorSection>
  );
}

export function DetailsSection({
  values,
  setValue,
  fieldErrors,
  specs,
  enabledSpecs,
  onToggleSpec,
}: FieldSectionProps & {
  specs: SpecAttribute[];
  enabledSpecs: ReadonlySet<"material" | "dimensions">;
  onToggleSpec: (key: "material" | "dimensions", checked: boolean) => void;
}) {
  return (
    <ProductEditorSection id="sec-details" title="Details">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Condition</span>
        <ChoiceGroup
          label="Condition"
          options={CONDITION_OPTIONS}
          value={values.condition}
          onChange={(condition) => setValue("condition", condition)}
        />
      </div>

      {specs.map((spec) => {
        const label = SPEC_LABELS[spec.attributeKey];
        if (spec.isRequired) {
          return (
            <FormField
              key={spec.id}
              label={label}
              value={values[spec.attributeKey]}
              onChange={(event) => setValue(spec.attributeKey, event.target.value)}
              errors={fieldErrors[spec.attributeKey]}
              required
              themed
            />
          );
        }
        const checked = enabledSpecs.has(spec.attributeKey);
        return (
          <div key={spec.id} className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={checked} onChange={(event) => onToggleSpec(spec.attributeKey, event.target.checked)} />
              Add {label.toLowerCase()} details
            </label>
            {checked ? (
              <FormField
                label={label}
                value={values[spec.attributeKey]}
                onChange={(event) => setValue(spec.attributeKey, event.target.value)}
                errors={fieldErrors[spec.attributeKey]}
                themed
              />
            ) : null}
          </div>
        );
      })}

      <FormField
        label="Location"
        value={values.location}
        onChange={(event) => setValue("location", event.target.value)}
        placeholder="e.g. Quezon City"
        errors={fieldErrors.location}
        themed
      />
    </ProductEditorSection>
  );
}

export function VisibilitySection({ values, setValue }: Pick<FieldSectionProps, "values" | "setValue">) {
  return (
    <ProductEditorSection id="sec-visibility" title="Visibility">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Status</span>
        <ChoiceGroup
          label="Status"
          options={STATUS_OPTIONS}
          value={values.status}
          onChange={(status) => setValue("status", status)}
        />
      </div>
      <label className="flex items-center gap-2.5 text-sm font-medium">
        <Checkbox checked={values.featured} onChange={(event) => setValue("featured", event.target.checked)} />
        Featured on homepage
      </label>
    </ProductEditorSection>
  );
}
