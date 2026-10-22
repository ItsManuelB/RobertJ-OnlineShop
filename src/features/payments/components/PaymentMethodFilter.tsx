"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  isPaymentSourceFilter,
  PAYMENT_SOURCE_FILTER_OPTIONS,
} from "@/features/payments/lib/payment-source";

/** Source dropdown for the shared Seller/Admin Payments list; changing it resets pagination. */
export function PaymentMethodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const source = searchParams.get("paymentSource");
  const legacyMethod = searchParams.get("paymentMethodType");
  const active = isPaymentSourceFilter(source)
    ? source
    : source
      ? ""
      : legacyMethod === "cod"
        ? "cod"
        : "";

  function updateParams(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("paymentMethodType");
    if (value) params.set("paymentSource", value);
    else params.delete("paymentSource");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <select
      value={active}
      onChange={(event) => updateParams(event.target.value)}
      aria-label="Filter by payment source"
      className="h-9 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <option value="">All payment sources</option>
      {PAYMENT_SOURCE_FILTER_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
