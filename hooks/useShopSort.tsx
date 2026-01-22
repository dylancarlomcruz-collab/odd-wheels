"use client";

import * as React from "react";

export type ShopSortBy = "relevance" | "newest" | "popular" | "price";
export type ShopPriceDir = "asc" | "desc";

type ShopSortContextValue = {
  sortBy: ShopSortBy;
  setSortBy: React.Dispatch<React.SetStateAction<ShopSortBy>>;
  priceDir: ShopPriceDir;
  setPriceDir: React.Dispatch<React.SetStateAction<ShopPriceDir>>;
};

const ShopSortContext = React.createContext<ShopSortContextValue | null>(null);

export function ShopSortProvider({ children }: { children: React.ReactNode }) {
  const [sortBy, setSortBy] = React.useState<ShopSortBy>("relevance");
  const [priceDir, setPriceDir] = React.useState<ShopPriceDir>("asc");

  const value = React.useMemo(
    () => ({ sortBy, setSortBy, priceDir, setPriceDir }),
    [sortBy, priceDir]
  );

  return (
    <ShopSortContext.Provider value={value}>{children}</ShopSortContext.Provider>
  );
}

export function useShopSort() {
  const ctx = React.useContext(ShopSortContext);
  if (!ctx) {
    throw new Error("useShopSort must be used within ShopSortProvider");
  }
  return ctx;
}
