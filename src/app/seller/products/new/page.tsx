import type { Metadata } from "next";

import { ProductEditor } from "@/features/products/components/ProductEditor";
import { listActiveCategories, listAllCategoryAttributes } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Add a product — Seller Portal" };

/** Sellers create products (admin never does — see `createProductAction`); the Seller layout already restricts this tree to the seller role. */
export default async function SellerNewProductPage() {
  const [categories, categoryAttributes] = await Promise.all([
    listActiveCategories(),
    listAllCategoryAttributes(),
  ]);

  return (
    <div className="p-5 lg:p-7">
      <ProductEditor
        mode="create"
        categories={categories}
        categoryAttributes={categoryAttributes}
        area="seller"
      />
    </div>
  );
}
