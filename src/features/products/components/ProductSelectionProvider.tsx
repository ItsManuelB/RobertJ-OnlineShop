"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface ProductSelectionValue {
  /** The color the buyer has picked in the variant selector, or null before any pick. */
  selectedColor: string | null;
  setSelectedColor: (color: string | null) => void;
}

const ProductSelectionContext = createContext<ProductSelectionValue | null>(null);

/**
 * Lets the PDP's variant selector (`ProductQuantityAndAddToCart`) tell the
 * photo gallery which color is selected — the two are siblings in a Server
 * Component page, so they can't share state any other way. Both read it
 * through `useProductSelection()`, which returns `null` outside a provider so
 * either component still renders standalone (e.g. elsewhere in the app).
 */
export function ProductSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const value = useMemo(() => ({ selectedColor, setSelectedColor }), [selectedColor]);
  return <ProductSelectionContext.Provider value={value}>{children}</ProductSelectionContext.Provider>;
}

export function useProductSelection(): ProductSelectionValue | null {
  return useContext(ProductSelectionContext);
}
