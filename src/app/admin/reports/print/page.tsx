import type { Metadata } from "next";

import { SellerReportPrintView } from "@/features/seller/components/SellerReportPrintView";

export const metadata: Metadata = { title: "Sales report — Admin Portal" };

interface AdminReportPrintPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminReportPrintPage({ searchParams }: AdminReportPrintPageProps) {
  return <SellerReportPrintView params={await searchParams} audience="admin" />;
}
