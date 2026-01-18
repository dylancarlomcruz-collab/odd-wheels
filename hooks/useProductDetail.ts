"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import type { BuyerProduct } from "@/hooks/useBuyerProducts";

export type Variant = {
  id: string;
  product_id: string;
  condition: "sealed" | "unsealed" | "with_issues" | string;
  issue_notes: string | null;
  issue_photo_urls: string[] | null;
  public_notes: string | null;
  price: number;
  cost: number | null;
  qty: number;
  ship_class: string | null;
};

export type ProductDetail = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_urls: string[] | null;
  variants: Variant[];
};

export function useProductDetail(productId: string) {
  const [product, setProduct] = React.useState<ProductDetail | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id,title,brand,model,variation,image_urls,is_active, product_variants(id,product_id,condition,issue_notes,issue_photo_urls,public_notes,price,cost,qty,ship_class)")
        .eq("id", productId)
        .maybeSingle();

      if (!mounted) return;

      if (error || !data || !data.is_active) {
        setProduct(null);
        setLoading(false);
        return;
      }

      const variants = ((data as any).product_variants ?? []) as Variant[];
      const inStock = variants.filter((v) => (v.qty ?? 0) > 0);

      setProduct({
        id: data.id,
        title: data.title,
        brand: data.brand,
        model: data.model,
        variation: data.variation,
        image_urls: data.image_urls,
        variants: inStock,
      });

      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, [productId]);

  return { product, loading };
}
