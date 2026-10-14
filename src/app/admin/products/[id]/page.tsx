import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";

import { ProductEditor } from "@/features/products/components/ProductEditor";
import {
  getDashboardProduct,
  listActiveCategories,
  listAllCategoryAttributes,
  listProductVariants,
} from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Edit product — Admin Portal" };

interface AdminEditProductPageProps {
  params: Promise<{ id: string }>;
}

/** Admin moderates existing products (owner = null: RLS's `is_admin()` is the boundary); the Admin layout already restricts this tree to admins, and there is deliberately no "new" page — admin never creates products. */
export default async function AdminEditProductPage({ params }: AdminEditProductPageProps) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const product = await getDashboardProduct(id, null);
  if (!product) notFound();

  const [categories, categoryAttributes, variants] = await Promise.all([
    listActiveCategories(),
    listAllCategoryAttributes(),
    listProductVariants(id),
  ]);

  return (
    <div className="p-5 lg:p-7">
      <ProductEditor
        mode="edit"
        categories={categories}
        categoryAttributes={categoryAttributes}
        product={product}
        variants={variants}
        area="admin"
      />
    </div>
  );
}
