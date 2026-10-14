import { Suspense } from "react";
import type { Metadata } from "next";

import { AdminCategoriesPanel } from "@/features/categories/components/AdminCategoriesPanel";
import { DashboardRowsSkeleton } from "@/features/dashboard/components/DashboardRowsSkeleton";
import { listAllCategoryAttributes, listCategoriesForAdmin } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Categories — Admin Portal" };

async function AdminCategoriesData() {
  const [categories, attributes] = await Promise.all([
    listCategoriesForAdmin(),
    listAllCategoryAttributes(),
  ]);
  return <AdminCategoriesPanel categories={categories} attributes={attributes} />;
}

export default function AdminCategoriesPage() {
  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <Suspense fallback={<DashboardRowsSkeleton label="Loading categories" />}>
        <AdminCategoriesData />
      </Suspense>
    </div>
  );
}
