"use client";

import * as React from "react";
import type { ShopProduct } from "@/components/ProductCard";
import { supabase } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/env";
import { mapProductsToShopProducts } from "@/lib/shopProducts";

export function useBuyerShopProducts({ brand }: { brand: string }) {
  const [products, setProducts] = React.useState<ShopProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    async function run() {
      setError(null);

      if (!isSupabaseConfigured()) {
        setProducts([]);
        setLoading(false);
        setError(
          "Supabase not configured. Fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
        );
        return;
      }

      setLoading(true);

      let q = supabase
        .from("products")
        .select(
          "id, title, brand, model, variation, image_urls, is_active, created_at, product_variants(id, condition, issue_notes, issue_photo_urls, public_notes, price, qty)"
        )
        .eq("is_active", true);

      if (brand && brand !== "all") {
        q = q.eq("brand", brand);
      }

      const { data, error } = await q.order("created_at", {
        ascending: false,
      }).limit(48);

      if (!mounted) return;

      if (error) {
        console.error("Failed to load products:", error);
        setProducts([]);
        setError(error.message);
      } else {
        const mapped = mapProductsToShopProducts((data as any[]) ?? []);
        setProducts(mapped);
      }

      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, [brand]);

  return { products, loading, error };
}
