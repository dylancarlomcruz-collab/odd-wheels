"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import type { ShopProduct } from "@/components/ProductCard";
import { isSupabaseConfigured } from "@/lib/env";
import { buildSearchOr, expandSearchTerms, normalizeSearchTerm } from "@/lib/search";
import { mapProductsToShopProducts } from "@/lib/shopProducts";

export function useSearchProducts(q: string) {
  const [products, setProducts] = React.useState<ShopProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [normalizedQuery, setNormalizedQuery] = React.useState<string>("");

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
        setNormalizedQuery("");
        setLoading(false);
        return;
      }

      const normalized = normalizeSearchTerm(query);
      setNormalizedQuery(normalized);
      const terms = expandSearchTerms(query);
      const orClause = buildSearchOr(terms);
      if (!orClause) {
        setProducts([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("products")
        .select(
          "id, title, brand, model, variation, image_urls, is_active, created_at, product_variants(id, condition, issue_notes, issue_photo_urls, public_notes, price, qty)"
        )
        .eq("is_active", true)
        .or(orClause)
        .order("created_at", { ascending: false })
        .limit(80);

      if (!mounted) return;

      if (error) {
        console.error("Search failed:", error);
        setProducts([]);
        setError(error.message);
      } else {
        const mapped = mapProductsToShopProducts((data as any[]) ?? []);
        if (!mapped.length) {
          setProducts([]);
          setLoading(false);
          return;
        }

        const productIds = mapped.map((p) => p.key).filter(Boolean);
        const [clicksRes, addsRes, salesRes] = await Promise.all([
          supabase
            .from("product_clicks")
            .select("product_id, clicks")
            .in("product_id", productIds),
          supabase
            .from("product_add_to_cart")
            .select("product_id, adds")
            .in("product_id", productIds),
          supabase.rpc("get_sales_counts", {
            p_product_ids: productIds,
            p_days: 30,
          }),
        ]);

        const clickMap: Record<string, number> = {};
        (clicksRes.data as any[] | null)?.forEach((row) => {
          if (row?.product_id) {
            clickMap[String(row.product_id)] = Number(row.clicks ?? 0);
          }
        });

        const addMap: Record<string, number> = {};
        (addsRes.data as any[] | null)?.forEach((row) => {
          if (row?.product_id) {
            addMap[String(row.product_id)] = Number(row.adds ?? 0);
          }
        });

        const salesMap: Record<string, number> = {};
        (salesRes.data as any[] | null)?.forEach((row) => {
          if (row?.product_id) {
            salesMap[String(row.product_id)] = Number(row.sold_qty ?? 0);
          }
        });

        const scored = mapped
          .map((p, index) => {
            const text = `${p.title} ${p.brand ?? ""} ${p.model ?? ""}`
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, " ");
            const relevance = terms.reduce(
              (acc, term) => (text.includes(term.toLowerCase()) ? acc + 1 : acc),
              0
            );
            const clicks = clickMap[p.key] ?? 0;
            const adds = addMap[p.key] ?? 0;
            const sales = salesMap[p.key] ?? 0;
            const isNew =
              p.created_at &&
              Date.now() - new Date(p.created_at).getTime() <
                1000 * 60 * 60 * 24 * 14;
            const stockBoost = (p.minQty ?? 0) > 0 && (p.minQty ?? 0) <= 2 ? 1 : 0;
            const score =
              relevance * 3 +
              clicks * 0.15 +
              adds * 0.4 +
              sales * 0.8 +
              (isNew ? 2 : 0) +
              stockBoost;
            const popularityScore = clicks * 0.2 + adds * 0.6 + sales;
            return {
              p: {
                ...p,
                searchScore: score,
                popularityScore,
              },
              score,
              index,
            };
          })
          .sort((a, b) => b.score - a.score || a.index - b.index)
          .map((row) => row.p);

        setProducts(scored);
      }

      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, [q]);

  return { products, loading, error, normalizedQuery };
}
