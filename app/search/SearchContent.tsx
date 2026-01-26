"use client";

import { useSearchParams } from "next/navigation";
import { useSearchProducts } from "@/hooks/useSearchProducts";
import ProductCard from "@/components/ProductCard";
import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { useCart } from "@/hooks/useCart";
import { toast } from "@/components/ui/toast";
import { buildSearchOr } from "@/lib/search";
import { mapProductsToShopProducts } from "@/lib/shopProducts";
import { readRecentViews } from "@/lib/recentViews";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { resolveEffectivePrice } from "@/lib/pricing";

const GRID_VIEW_STORAGE_KEY = "oddwheels:grid-view";

export default function SearchContent() {
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const { products, loading, error, normalizedQuery } = useSearchProducts(q);
  const cart = useCart();
  const [closestMatches, setClosestMatches] = React.useState<any[]>([]);
  const [topSellers, setTopSellers] = React.useState<any[]>([]);
  const [recentlyViewed, setRecentlyViewed] = React.useState<any[]>([]);
  const [fallbackLoading, setFallbackLoading] = React.useState(false);
  const [sortBy, setSortBy] = React.useState("relevance");
  const [brandFilter, setBrandFilter] = React.useState("all");
  const [conditionFilter, setConditionFilter] = React.useState("all");
  const [modelFilter, setModelFilter] = React.useState("");
  const [scaleFilter, setScaleFilter] = React.useState("all");
  const [minPrice, setMinPrice] = React.useState("");
  const [maxPrice, setMaxPrice] = React.useState("");
  const [wideView, setWideView] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(GRID_VIEW_STORAGE_KEY);
    setWideView(saved === "wide");
  }, []);

  const toggleWideView = React.useCallback(() => {
    setWideView((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          GRID_VIEW_STORAGE_KEY,
          next ? "wide" : "standard"
        );
      }
      return next;
    });
  }, []);

  const productGridClass = React.useMemo(
    () =>
      wideView
        ? "grid grid-cols-4 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-6 lg:grid-cols-8"
        : "grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4",
    [wideView]
  );

  const brandOptions = React.useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.brand) set.add(p.brand);
    });
    return Array.from(set).sort();
  }, [products]);

  const conditionOptions = React.useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      p.options?.forEach((o) => set.add(o.condition));
    });
    return Array.from(set).sort();
  }, [products]);

  const scaleOptions = React.useMemo(() => {
    const set = new Set<string>();
    const extract = (text: string) => {
      const match = text.match(/\b1[:/]\s?\d{2,3}\b/i);
      return match ? match[0].replace(/\s+/g, "") : null;
    };
    products.forEach((p) => {
      const text = `${p.title} ${p.model ?? ""} ${p.brand ?? ""}`;
      const scale = extract(text);
      if (scale) set.add(scale.toUpperCase());
    });
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = React.useMemo(() => {
    const min = Number(minPrice);
    const max = Number(maxPrice);
    const minOk = Number.isFinite(min);
    const maxOk = Number.isFinite(max);
    const filterText = modelFilter.trim().toLowerCase();
    const extractScale = (text: string) => {
      const match = text.match(/\b1[:/]\s?\d{2,3}\b/i);
      return match ? match[0].replace(/\s+/g, "").toUpperCase() : null;
    };

    let list = products.slice();
    if (brandFilter !== "all") {
      list = list.filter((p) => (p.brand ?? "").toLowerCase() === brandFilter.toLowerCase());
    }
    if (conditionFilter !== "all") {
      list = list.filter((p) =>
        p.options?.some((o) => o.condition.toLowerCase() === conditionFilter.toLowerCase())
      );
    }
    if (filterText) {
      list = list.filter((p) =>
        `${p.title} ${p.model ?? ""}`.toLowerCase().includes(filterText)
      );
    }
    if (scaleFilter !== "all") {
      list = list.filter((p) => {
        const text = `${p.title} ${p.model ?? ""} ${p.brand ?? ""}`;
        const scale = extractScale(text);
        return scale === scaleFilter.toUpperCase();
      });
    }
    const minEffective = (p: typeof products[number]) =>
      p.minEffectivePrice ?? p.minPrice;
    if (minOk) {
      list = list.filter((p) => minEffective(p) >= min);
    }
    if (maxOk) {
      list = list.filter((p) => minEffective(p) <= max);
    }

    if (sortBy === "newest") {
      list.sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime()
      );
    } else if (sortBy === "price_low") {
      list.sort((a, b) => minEffective(a) - minEffective(b));
    } else if (sortBy === "price_high") {
      list.sort((a, b) => minEffective(b) - minEffective(a));
    } else if (sortBy === "popular") {
      list.sort(
        (a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0)
      );
    } else if (sortBy === "best_value") {
      list.sort((a, b) => {
        const aValue =
          (a.popularityScore ?? 0) / Math.max(minEffective(a), 1);
        const bValue =
          (b.popularityScore ?? 0) / Math.max(minEffective(b), 1);
        return bValue - aValue;
      });
    }

    return list;
  }, [
    products,
    brandFilter,
    conditionFilter,
    modelFilter,
    scaleFilter,
    minPrice,
    maxPrice,
    sortBy,
  ]);

  React.useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (loading) return;
      if (products.length > 0 || !normalizedQuery) {
        setClosestMatches([]);
        setTopSellers([]);
        return;
      }
      setFallbackLoading(true);
      try {
        const tokens = normalizedQuery.split(" ").filter(Boolean);
        const fallbackTerm = tokens[0] ?? normalizedQuery;
        const orClause = buildSearchOr([fallbackTerm]);
        let matches: any[] = [];
        if (orClause) {
          const { data } = await supabase
            .from("products")
            .select(
              "id, title, brand, model, variation, image_urls, is_active, created_at, product_variants(id, condition, issue_notes, issue_photo_urls, public_notes, price, sale_price, discount_percent, qty)"
            )
            .eq("is_active", true)
            .or(orClause)
            .order("created_at", { ascending: false })
            .limit(8);
          matches = mapProductsToShopProducts((data as any[]) ?? []);
        }

        const { data: sellerRows } = await supabase.rpc("get_top_sellers", {
          p_days: 90,
          p_limit: 8,
        });
        const sellerIds = (sellerRows as any[] | null)
          ?.map((row) => row?.product_id)
          .filter(Boolean) as string[];
        let sellers: any[] = [];
        if (sellerIds?.length) {
          const { data: sellerProducts } = await supabase
            .from("products")
            .select(
              "id, title, brand, model, variation, image_urls, is_active, created_at, product_variants(id, condition, issue_notes, issue_photo_urls, public_notes, price, sale_price, discount_percent, qty)"
            )
            .in("id", sellerIds);
          sellers = mapProductsToShopProducts((sellerProducts as any[]) ?? []);
          const orderMap = new Map(sellerIds.map((id, index) => [id, index]));
          sellers.sort(
            (a, b) => (orderMap.get(a.key) ?? 0) - (orderMap.get(b.key) ?? 0)
          );
        }

        const recentIds = readRecentViews();
        let recents: any[] = [];
        if (recentIds.length) {
          const { data: recentProducts } = await supabase
            .from("products")
            .select(
              "id, title, brand, model, variation, image_urls, is_active, created_at, product_variants(id, condition, issue_notes, issue_photo_urls, public_notes, price, sale_price, discount_percent, qty)"
            )
            .in("id", recentIds);
          recents = mapProductsToShopProducts((recentProducts as any[]) ?? []);
          const orderMap = new Map(recentIds.map((id, index) => [id, index]));
          recents.sort(
            (a, b) => (orderMap.get(a.key) ?? 0) - (orderMap.get(b.key) ?? 0)
          );
        }

        if (!mounted) return;
        setClosestMatches(matches);
        setTopSellers(sellers);
        setRecentlyViewed(recents);
      } finally {
        if (mounted) setFallbackLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [loading, normalizedQuery, products.length]);

  async function onAdd(product: any, option: any) {
    try {
      const result = await cart.add(option.id, 1);
      const effectivePrice = resolveEffectivePrice({
        price: Number(option.price),
        sale_price: option.sale_price ?? null,
        discount_percent: option.discount_percent ?? null,
      }).effectivePrice;
      const baseToast = {
        title: product.title,
        image_url: product.image_url,
        variant: option.condition,
        price: effectivePrice,
        action: { label: "View cart", href: "/cart" },
      };
      toast(
        result.capped
          ? {
              ...baseToast,
              message: "Maximum qty available added to cart.",
              qty: result.nextQty,
            }
          : { ...baseToast, qty: 1 }
      );
    } catch (e: any) {
      toast({
        title: "Failed to add to cart",
        message: e?.message ?? "Failed to add to cart",
        intent: "error",
      });
    }
  }

  async function recordClick(productId: string) {
    try {
      await supabase.rpc("record_recent_view", { p_product_id: productId });
    } catch {
      // ignore if not authenticated
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Search</h1>
          <div className="text-sm text-white/60">Query: "{q}"</div>
        </div>
        <button
          type="button"
          onClick={toggleWideView}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-bg-950/50 text-white/70 transition hover:bg-bg-950/70 hover:text-white"
          aria-pressed={wideView}
          aria-label={wideView ? "Standard view" : "Wide view"}
          title={wideView ? "Standard view" : "Wide view"}
        >
          <svg
            viewBox="0 0 20 20"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="5" height="5" />
            <rect x="12" y="3" width="5" height="5" />
            <rect x="3" y="12" width="5" height="5" />
            <rect x="12" y="12" width="5" height="5" />
          </svg>
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="relevance">Relevance</option>
            <option value="newest">Newest</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
            <option value="popular">Most Popular</option>
            <option value="best_value">Best Value</option>
          </Select>

          <Select
            label="Brand"
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
          >
            <option value="all">All brands</option>
            {brandOptions.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </Select>

          <Select
            label="Condition"
            value={conditionFilter}
            onChange={(e) => setConditionFilter(e.target.value)}
          >
            <option value="all">All conditions</option>
            {conditionOptions.map((condition) => (
              <option key={condition} value={condition}>
                {condition}
              </option>
            ))}
          </Select>

          <Select
            label="Scale"
            value={scaleFilter}
            onChange={(e) => setScaleFilter(e.target.value)}
          >
            <option value="all">All scales</option>
            {scaleOptions.map((scale) => (
              <option key={scale} value={scale}>
                {scale}
              </option>
            ))}
          </Select>

          <Input
            label="Model keyword"
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            placeholder="e.g. Skyline, NSX"
          />

          <Input
            label="Min price"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            inputMode="numeric"
            placeholder="0"
          />

          <Input
            label="Max price"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            inputMode="numeric"
            placeholder="9999"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-white/10 bg-bg-900/40 p-4 text-white/70">
          {error}
        </div>
      ) : loading ? (
        <div className="text-white/60">Searching...</div>
      ) : products.length === 0 ? (
        <div className="space-y-6">
          <div className="text-white/60">No matching available items.</div>

          {fallbackLoading ? (
            <div className="text-white/50">Loading fallback results...</div>
          ) : null}

          {closestMatches.length ? (
            <section className="space-y-3">
              <div className="text-lg font-semibold">Closest matches</div>
              <div className={productGridClass}>
                {closestMatches.map((p) => (
                  <ProductCard
                    key={p.key}
                    product={p}
                    wideView={wideView}
                    onAddToCart={(opt) => onAdd(p, opt)}
                    onRelatedAddToCart={(item, opt) => onAdd(item, opt)}
                    onProductClick={(item) => recordClick(item.key)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {topSellers.length ? (
            <section className="space-y-3">
              <div className="text-lg font-semibold">Top sellers</div>
              <div className={productGridClass}>
                {topSellers.map((p) => (
                  <ProductCard
                    key={p.key}
                    product={p}
                    wideView={wideView}
                    onAddToCart={(opt) => onAdd(p, opt)}
                    onRelatedAddToCart={(item, opt) => onAdd(item, opt)}
                    onProductClick={(item) => recordClick(item.key)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {recentlyViewed.length ? (
            <section className="space-y-3">
              <div className="text-lg font-semibold">Recently viewed</div>
              <div className={productGridClass}>
                {recentlyViewed.map((p) => (
                  <ProductCard
                    key={p.key}
                    product={p}
                    wideView={wideView}
                    onAddToCart={(opt) => onAdd(p, opt)}
                    onRelatedAddToCart={(item, opt) => onAdd(item, opt)}
                    onProductClick={(item) => recordClick(item.key)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-white/60">
          No items match your filters. Try clearing some filters.
        </div>
      ) : (
        <div className={productGridClass}>
          {filteredProducts.map((p) => (
            <ProductCard
              key={p.key}
              product={p}
              wideView={wideView}
              onAddToCart={(opt) => onAdd(p, opt)}
              onRelatedAddToCart={(item, opt) => onAdd(item, opt)}
              onProductClick={(item) => recordClick(item.key)}
            />
          ))}
        </div>
      )}
    </>
  );
}
