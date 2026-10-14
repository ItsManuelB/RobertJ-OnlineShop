"use client";

import type { ReactNode } from "react";

import { CartProvider } from "@/features/cart/providers/CartProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { ToastProvider } from "@/providers/ToastProvider";

/** Single mounting point for every client-side provider. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <ToastProvider>
          <CartProvider>{children}</CartProvider>
        </ToastProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
