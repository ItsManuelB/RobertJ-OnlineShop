import type { Metadata } from "next";

import { SellerReportPrintView } from "@/features/seller/components/SellerReportPrintView";

export const metadata: Metadata = { title: "Sales report — Seller Portal" };

interface SellerReportPrintPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SellerReportPrintPage({ searchParams }: SellerReportPrintPageProps) {
  return <SellerReportPrintView params={await searchParams} audience="seller" />;
}
