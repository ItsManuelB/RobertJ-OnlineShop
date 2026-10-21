"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Payment-method dropdown for the dashboard Orders table — sets `paymentMethod`, always clears `page`. */
export function OrderMethodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = searchParams.get("paymentMethod") ?? "";

  function updateParams(value: string) {
    const current = searchParams.toString();
    const params = new URLSearchParams(current);
    if (value) params.set("paymentMethod", value);
    else params.delete("paymentMethod");
    params.delete("page");
    const next = params.toString();

    // Same no-op-on-unchanged-URL fix as OrderStatusFilter/DashboardDateFilter.
    if (next === current) {
      router.refresh();
      return;
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <select
      value={active}
      onChange={(event) => updateParams(event.target.value)}
      aria-label="Filter by payment method"
      className="h-9 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <option value="">All payment methods</option>
      <option value="cod">Cash on Delivery</option>
      <option value="xendit">Online Payment</option>
    </select>
  );
}
