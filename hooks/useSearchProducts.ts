"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import type { BuyerProduct } from "@/hooks/useBuyerProducts";
import { isSupabaseConfigured } from "@/lib/env";

function computeMinPrice(variants: Array<{ price: number; qty: number }>): number {
  const prices = variants.filter((v) => (v.qty ?? 0) > 0).map((v) => Number(v.price));
  if (prices.length === 0) return 0;
  return Math.min(...prices);
}

export function useSearchProducts(q: string) {
  const [products, setProducts] = React.useState<BuyerProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    async function run() {
      setError(null);

      if (!isSupabaseConfigured()) {
        setProducts([]);
        setLoading(false);
        setError("Supabase not configured. Fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
        return;
      }

      setLoading(true);

      const query = q.trim();
      if (!query) {
        setProducts([]);
        setLoading(false);
        return;
      }

      // Best-effort search across title/brand/model/variation
      const ilike = `%${query}%`;
      const { data, error } = await supabase
        .from("products")
        .select("id, title, brand, model, variation, image_urls, is_active, product_variants(price, qty)")
        .eq("is_active", true)
        .or(`title.ilike.${ilike},brand.ilike.${ilike},model.ilike.${ilike},variation.ilike.${ilike}`)
        .order("created_at", { ascending: false })
        .limit(48);

      if (!mounted) return;

      if (error) {
        console.error("Search failed:", error);
        setProducts([]);
        setError(error.message);
      } else {
        const mapped: BuyerProduct[] = (data as any[] ?? [])
          .map((p) => {
            const variants = (p.product_variants ?? []) as Array<{ price: number; qty: number }>;
            const inStock = variants.some((v) => (v.qty ?? 0) > 0);
            return inStock
              ? ({
                  id: p.id,
                  title: p.title,
                  brand: p.brand,
                  model: p.model,
                  variation: p.variation,
                  image_urls: p.image_urls,
                  min_price: computeMinPrice(variants),
                } as BuyerProduct)
              : null;
          })
          .filter(Boolean) as BuyerProduct[];

        setProducts(mapped);
      }

      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, [q]);

  return { products, loading, error };
}
