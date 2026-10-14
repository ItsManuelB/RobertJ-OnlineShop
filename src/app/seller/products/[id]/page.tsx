import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";

import { ProductEditor } from "@/features/products/components/ProductEditor";
import {
  getDashboardProduct,
  getOwnShopId,
  listActiveCategories,
  listAllCategoryAttributes,
  listProductVariants,
  requireSessionUser,
} from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Edit product — Seller Portal" };

interface SellerEditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function SellerEditProductPage({ params }: SellerEditProductPageProps) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const user = await requireSessionUser();
  // A seller's own scope: their products, or any product in a shop they belong to — the same rule the list uses.
  const product = await getDashboardProduct(id, { sellerId: user.id, shopId: await getOwnShopId(user.id) });
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
        area="seller"
      />
    </div>
  );
}
