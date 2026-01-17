"use client";

import { useSearchParams } from "next/navigation";
import { useSearchProducts } from "@/hooks/useSearchProducts";
import ProductCard from "@/components/ProductCard";

export default function SearchContent() {
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const { products, loading, error } = useSearchProducts(q);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Search</h1>
        <div className="text-sm text-white/60">Query: "{q}"</div>
      </div>

      {error ? (
        <div className="rounded-xl border border-white/10 bg-bg-900/40 p-4 text-white/70">
          {error}
        </div>
      ) : loading ? (
        <div className="text-white/60">Searching...</div>
      ) : products.length === 0 ? (
        <div className="text-white/60">No matching available items.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard
              key={`${p.id}-${(p as any).condition ?? ""}`}
              product={p as any}
              onAddToCart={async (opt) => {
                // if you have useCart() here:
                // await cart.add(opt.id, 1);

                // placeholder if you don't yet:
                console.log("add to cart", opt);
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
