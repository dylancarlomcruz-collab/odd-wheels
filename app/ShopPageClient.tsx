"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProductCard, { type ShopProduct } from "@/components/ProductCard";
import { supabase } from "@/lib/supabase/browser";
import { useCart } from "@/hooks/useCart";
import { toast } from "@/components/ui/toast";
import { collapseVariants, type VariantRow } from "@/lib/shopProducts";
import { readRecentViewEntries } from "@/lib/recentViews";
import { expandSearchTerms, getLastSearchTerm, normalizeSearchTerm } from "@/lib/search";
import { useProfile } from "@/hooks/useProfile";
import { InventoryEditorDrawer } from "@/components/admin/InventoryEditorDrawer";
import type { AdminProduct } from "@/components/admin/InventoryBrowseGrid";
import { resolveEffectivePrice } from "@/lib/pricing";
import { useShopSort } from "@/hooks/useShopSort";

const BRAND_ALL_KEY = "__all__";
const MAX_PRIMARY_BRAND_TABS = 9;
const BRAND_COLUMN_DEFAULT = 5;
const LIMITED_SECTION_COUNTS: Record<string, number> = {
  trending: 4,
  "for-you": 4,
  because: 4,
};
const RECENT_REFRESH_MS = 1000 * 60 * 30;
const CANONICAL_BRAND_LABELS: Record<string, string> = {
  minigt: "Mini GT",
  kaidohouse: "Kaido House",
  kaido: "Kaido House",
  poprace: "Pop Race",
  tarmac: "Tarmac",
  tarmacworks: "Tarmac",
};
const PREFERRED_BRAND_KEYS: Array<{ label: string; keys: string[] }> = [
  { label: "Mini GT", keys: ["minigt"] },
  { label: "Kaido House", keys: ["kaidohouse", "kaido"] },
  { label: "Pop Race", keys: ["poprace"] },
  { label: "Tarmac", keys: ["tarmac", "tarmacworks"] },
];
const BRAND_BUTTON_STYLES = {
  active:
    "bg-sky-500/20 text-sky-900 dark:text-sky-100 border-sky-400/50 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.18)]",
  idle:
    "bg-bg-950/40 text-white/70 border-white/10 hover:bg-sky-500/10 hover:text-sky-900 dark:hover:text-sky-100",
};

function normalizeBrandKey(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getBrandButtonClasses(active: boolean, joined: boolean) {
  const toneClasses = active ? BRAND_BUTTON_STYLES.active : BRAND_BUTTON_STYLES.idle;
  return [
    "inline-flex h-7 min-w-0 items-center justify-center truncate border px-1.5 text-[9px] font-semibold leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 sm:h-8 sm:px-2 sm:text-[10px]",
    joined
      ? "rounded-none -ml-px first:ml-0 first:rounded-l-lg last:rounded-r-lg"
      : "rounded-lg",
    toneClasses,
  ].join(" ");
}

function getMoreButtonClasses(joined: boolean) {
  return [
    "inline-flex h-7 min-w-0 items-center justify-center truncate border border-white/10 bg-bg-950/40 px-1.5 text-[9px] font-semibold leading-none text-white/80 transition hover:bg-bg-950/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 sm:h-8 sm:px-2 sm:text-[10px]",
    joined
      ? "rounded-none -ml-px first:ml-0 first:rounded-l-lg last:rounded-r-lg"
      : "rounded-lg",
  ].join(" ");
}

function takeN<T>(items: T[], n: number) {
  return items.slice(0, Math.max(0, n));
}

function dedupeList<T extends { key: string }>(
  products: T[],
  shownSet: Set<string>
) {
  const list: T[] = [];
  const updatedSet = new Set(shownSet);
  for (const product of products) {
    const id = product?.key;
    if (!id || updatedSet.has(id)) continue;
    updatedSet.add(id);
    list.push(product);
  }
  return { list, updatedSet };
}

export default function ShopPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = (searchParams.get("q") ?? "").trim();
  const hasSearch = Boolean(searchQuery);
  const cart = useCart();
  const { profile } = useProfile();
  const isAdmin = profile?.role === "admin";
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<VariantRow[]>([]);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [adminEditProduct, setAdminEditProduct] =
    React.useState<AdminProduct | null>(null);
  const [brandTab, setBrandTab] = React.useState<string>(BRAND_ALL_KEY);
  const [showAllBrands, setShowAllBrands] = React.useState(false);
  const [brandColumns, setBrandColumns] = React.useState(BRAND_COLUMN_DEFAULT);
  const [expandedSections, setExpandedSections] = React.useState<
    Record<string, boolean>
  >({});
  const [clickMap, setClickMap] = React.useState<Record<string, number>>({});
  const [addMap, setAddMap] = React.useState<Record<string, number>>({});
  const [cartMap, setCartMap] = React.useState<Record<string, number>>({});
  const [salesMap, setSalesMap] = React.useState<Record<string, number>>({});
  const [topSellerIds, setTopSellerIds] = React.useState<string[]>([]);
  const [backInStockIds, setBackInStockIds] = React.useState<string[]>([]);
  const [recentEntries, setRecentEntries] = React.useState<
    Array<{ id: string; ts: number }>
  >([]);
  const [lastSearch, setLastSearch] = React.useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = React.useState(false);
  const { sortBy, priceDir } = useShopSort();
  const resultsRef = React.useRef<HTMLDivElement | null>(null);
  const lastScrolledQuery = React.useRef<string>("");
  const lastRecentRefresh = React.useRef<number>(0);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("product_variants")
        .select(
          "id,condition,issue_notes,issue_photo_urls,public_notes,price,sale_price,discount_percent,qty, product:products(id,title,brand,model,image_urls,is_active,created_at)"
        )
        .gt("qty", 0)
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        setErr(error.message || "Failed to load products");
        setRows([]);
      } else {
        setRows((data as any) ?? []);
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [reloadToken]);

  const shopProducts = React.useMemo(() => collapseVariants(rows), [rows]);

  React.useEffect(() => {
    setRecentEntries(readRecentViewEntries());
    setLastSearch(getLastSearchTerm());
    lastRecentRefresh.current = Date.now();
  }, []);

  React.useEffect(() => {
    if (searchQuery) {
      setBrandTab(BRAND_ALL_KEY);
      setShowAllBrands(false);
    }
  }, [searchQuery]);

  React.useEffect(() => {
    if (!shopProducts.length) {
      setClickMap({});
      setAddMap({});
      setCartMap({});
      setSalesMap({});
      setTopSellerIds([]);
      setBackInStockIds([]);
      return;
    }
    const productIds = Array.from(
      new Set(shopProducts.map((p) => p.key).filter(Boolean))
    );
    if (!productIds.length) return;
    let canceled = false;
    (async () => {
      const [clicksRes, addsRes, cartRes, salesRes, topRes, restockRes] =
        await Promise.all([
          supabase
            .from("product_clicks")
            .select("product_id, clicks")
            .in("product_id", productIds),
          supabase
            .from("product_add_to_cart")
            .select("product_id, adds")
            .in("product_id", productIds),
          supabase.rpc("get_cart_counts", { p_product_ids: productIds }),
          supabase.rpc("get_sales_counts", { p_product_ids: productIds, p_days: 7 }),
          supabase.rpc("get_top_sellers", { p_days: 90, p_limit: 12 }),
          supabase
            .from("product_restock_events")
            .select("product_id, restocked_at")
            .gte(
              "restocked_at",
              new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()
            )
            .order("restocked_at", { ascending: false })
            .limit(20),
        ]);

      if (canceled) return;

      const nextClicks: Record<string, number> = {};
      (clicksRes.data as any[] | null)?.forEach((row) => {
        if (row?.product_id) {
          nextClicks[String(row.product_id)] = Number(row.clicks ?? 0);
        }
      });

      const nextAdds: Record<string, number> = {};
      (addsRes.data as any[] | null)?.forEach((row) => {
        if (row?.product_id) {
          nextAdds[String(row.product_id)] = Number(row.adds ?? 0);
        }
      });

      const nextCarts: Record<string, number> = {};
      (cartRes.data as any[] | null)?.forEach((row) => {
        if (row?.product_id) {
          nextCarts[String(row.product_id)] = Number(row.cart_count ?? 0);
        }
      });

      const nextSales: Record<string, number> = {};
      (salesRes.data as any[] | null)?.forEach((row) => {
        if (row?.product_id) {
          nextSales[String(row.product_id)] = Number(row.sold_qty ?? 0);
        }
      });

      const topIds =
        (topRes.data as any[] | null)
          ?.map((row) => row?.product_id)
          .filter(Boolean) ?? [];

      const restockIds: string[] = [];
      (restockRes.data as any[] | null)?.forEach((row) => {
        const id = String(row?.product_id ?? "").trim();
        if (id && !restockIds.includes(id)) restockIds.push(id);
      });

      setClickMap(nextClicks);
      setAddMap(nextAdds);
      setCartMap(nextCarts);
      setSalesMap(nextSales);
      setTopSellerIds(topIds);
      setBackInStockIds(restockIds);
    })();
    return () => {
      canceled = true;
    };
  }, [shopProducts]);

  React.useEffect(() => {
    const onScroll = () => {
      setShowBackToTop(window.scrollY > 600);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    const computeColumns = () => {
      const width = window.innerWidth;
      let next = BRAND_COLUMN_DEFAULT;
      if (width >= 1100) next = 8;
      else if (width >= 900) next = 7;
      else if (width >= 680) next = 6;
      else next = 5;
      setBrandColumns((prev) => (prev === next ? prev : next));
    };
    computeColumns();
    window.addEventListener("resize", computeColumns, { passive: true });
    return () => window.removeEventListener("resize", computeColumns);
  }, []);

  React.useEffect(() => {
    if (!searchQuery || loading) {
      lastScrolledQuery.current = "";
      return;
    }
    if (lastScrolledQuery.current === searchQuery) return;
    lastScrolledQuery.current = searchQuery;
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [searchQuery, loading]);

  const brandStats = React.useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const p of shopProducts) {
      const raw = p.brand?.trim();
      if (!raw) continue;
      const key = normalizeBrandKey(raw);
      if (!key) continue;
      const label = CANONICAL_BRAND_LABELS[key] ?? raw;
      const current = map.get(key);
      if (current) {
        map.set(key, { label: current.label, count: current.count + 1 });
      } else {
        map.set(key, { label, count: 1 });
      }
    }
    const entries = Array.from(map.entries()).map(([key, value]) => ({
      key,
      label: value.label,
      count: value.count,
    }));
    const byCount = entries
      .slice()
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const byLabel = entries
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label));
    const labelByKey = new Map(entries.map((entry) => [entry.key, entry.label]));
    return { byCount, byLabel, labelByKey };
  }, [shopProducts]);

  const productById = React.useMemo(() => {
    const map = new Map<string, (typeof shopProducts)[number]>();
    for (const p of shopProducts) {
      map.set(p.key, p);
    }
    return map;
  }, [shopProducts]);

  const recentViewMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of recentEntries) {
      const minutes = Math.max(1, Math.round((Date.now() - entry.ts) / 60000));
      if (!Number.isFinite(minutes)) continue;
      map[entry.id] = minutes;
    }
    return map;
  }, [recentEntries]);

  const primaryBrandTabs = React.useMemo(() => {
    const picked: string[] = [];
    for (const pref of PREFERRED_BRAND_KEYS) {
      const found = pref.keys.find((key) =>
        brandStats.labelByKey.has(key)
      );
      if (found && !picked.includes(found)) {
        picked.push(found);
      }
      if (picked.length >= MAX_PRIMARY_BRAND_TABS) break;
    }
    if (picked.length < MAX_PRIMARY_BRAND_TABS) {
      for (const entry of brandStats.byCount) {
        if (picked.length >= MAX_PRIMARY_BRAND_TABS) break;
        if (!picked.includes(entry.key)) {
          picked.push(entry.key);
        }
      }
    }
    return picked.map((key) => ({
      key,
      label: brandStats.labelByKey.get(key) ?? key,
    }));
  }, [brandStats]);

  const brandTabs = React.useMemo(
    () => [{ key: BRAND_ALL_KEY, label: "All" }, ...primaryBrandTabs],
    [primaryBrandTabs]
  );

  const allBrandTabs = React.useMemo(() => {
    const list = brandStats.byLabel.map((entry) => ({
      key: entry.key,
      label: entry.label,
    }));
    return [{ key: BRAND_ALL_KEY, label: "All" }, ...list];
  }, [brandStats]);

  const maxVisibleBrands = React.useMemo(() => {
    const reserveMore = allBrandTabs.length > brandColumns;
    return Math.max(1, brandColumns - (reserveMore ? 1 : 0));
  }, [allBrandTabs.length, brandColumns]);
  const visibleBrandTabs = React.useMemo(
    () =>
      brandTabs.slice(
        0,
        Math.max(1, Math.min(brandTabs.length, maxVisibleBrands))
      ),
    [brandTabs, maxVisibleBrands]
  );
  const canExpandBrands = allBrandTabs.length > visibleBrandTabs.length;
  const moreLabel = showAllBrands ? "Show less" : "Show more";

  const sortedProducts = React.useMemo(() => {
    const withIndex = shopProducts.map((p, index) => {
      const clicks = clickMap[p.key] ?? 0;
      const adds = addMap[p.key] ?? 0;
      const sales = salesMap[p.key] ?? 0;
      const isNew =
        p.created_at &&
        Date.now() - new Date(p.created_at).getTime() <
          1000 * 60 * 60 * 24 * 14;
      const lowStock = (p.minQty ?? 0) > 0 && (p.minQty ?? 0) <= 2;
      const score =
        clicks * 0.15 +
        adds * 0.4 +
        sales * 0.8 +
        (isNew ? 2 : 0) +
        (lowStock ? 1 : 0);
      return { product: p, index, score };
    });
    withIndex.sort((a, b) => b.score - a.score || a.index - b.index);
    return withIndex.map((item) => item.product);
  }, [shopProducts, clickMap, addMap, salesMap]);

  const searchTerms = React.useMemo(() => {
    if (!searchQuery) return [];
    return expandSearchTerms(searchQuery)
      .map((term) => normalizeSearchTerm(term))
      .filter(Boolean);
  }, [searchQuery]);

  const searchFiltered = React.useMemo(() => {
    if (!searchTerms.length) return sortedProducts;
    return sortedProducts.filter((p) => {
      const text = normalizeSearchTerm(
        `${p.title} ${p.brand ?? ""} ${p.model ?? ""}`
      );
      return searchTerms.some((term) => text.includes(term));
    });
  }, [sortedProducts, searchTerms]);

  const filtered = React.useMemo(() => {
    if (brandTab === BRAND_ALL_KEY) return searchFiltered;
    return searchFiltered.filter(
      (p) => normalizeBrandKey(p.brand) === brandTab
    );
  }, [searchFiltered, brandTab]);

  const sortedFiltered = React.useMemo(() => {
    if (sortBy === "relevance") return filtered;
    const list = filtered.slice();
    const getMinPrice = (p: ShopProduct) =>
      p.minEffectivePrice ?? p.minPrice ?? 0;
    if (sortBy === "newest") {
      list.sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime()
      );
    } else if (sortBy === "price") {
      list.sort((a, b) =>
        priceDir === "asc"
          ? getMinPrice(a) - getMinPrice(b)
          : getMinPrice(b) - getMinPrice(a)
      );
    } else if (sortBy === "popular") {
      list.sort((a, b) => {
        const aScore = (clickMap[a.key] ?? 0) + (addMap[a.key] ?? 0) * 2;
        const bScore = (clickMap[b.key] ?? 0) + (addMap[b.key] ?? 0) * 2;
        return bScore - aScore;
      });
    }
    return list;
  }, [filtered, sortBy, priceDir, clickMap, addMap]);

  const newArrivals = React.useMemo(() => {
    const now = Date.now();
    return shopProducts
      .filter((p) => {
        if (!p.created_at) return false;
        const age = now - new Date(p.created_at).getTime();
        return age <= 1000 * 60 * 60 * 24 * 14;
      })
      .sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime()
      )
      .slice(0, 8);
  }, [shopProducts]);

  const almostSoldOut = React.useMemo(
    () =>
      shopProducts
        .filter((p) => (p.minQty ?? 0) > 0 && (p.minQty ?? 0) <= 2)
        .slice(0, 8),
    [shopProducts]
  );

  const trendingNow = React.useMemo(
    () => sortedProducts.slice(0, 8),
    [sortedProducts]
  );

  const backInStock = React.useMemo(() => {
    return backInStockIds
      .map((id) => productById.get(id))
      .filter((item): item is ShopProduct => Boolean(item))
      .slice(0, 8);
  }, [backInStockIds, productById]);

  const becauseYouSearched = React.useMemo(() => {
    if (!lastSearch) return [];
    const normalized = normalizeSearchTerm(lastSearch);
    if (!normalized) return [];
    return shopProducts
      .filter((p) => {
        const text = normalizeSearchTerm(
          `${p.title} ${p.brand ?? ""} ${p.model ?? ""}`
        );
        return text.includes(normalized);
      })
      .slice(0, 8);
  }, [lastSearch, shopProducts]);

  const forYou = React.useMemo(() => {
    const picks: typeof shopProducts = [];
    const seen = new Set<string>();
    const recentProducts = recentEntries
      .map((entry) => productById.get(entry.id))
      .filter(Boolean) as ShopProduct[];
    const avgPrice =
      recentProducts.reduce((sum, p) => sum + (p.minPrice ?? 0), 0) /
      (recentProducts.length || 1);
    const conditionCounts = new Map<string, number>();
    for (const item of recentProducts) {
      item.options?.forEach((opt) => {
        const key = opt.condition.toLowerCase();
        conditionCounts.set(key, (conditionCounts.get(key) ?? 0) + 1);
      });
    }
    const preferredCondition = Array.from(conditionCounts.entries()).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];
    const preferenceScore = (item: ShopProduct) => {
      let score = 0;
      if (avgPrice > 0) {
        const diff = Math.abs(item.minPrice - avgPrice);
        if (diff <= avgPrice * 0.2) score += 2;
        else if (diff <= avgPrice * 0.4) score += 1;
      }
      if (preferredCondition) {
        const hasCondition = item.options?.some(
          (opt) => opt.condition.toLowerCase() === preferredCondition
        );
        if (hasCondition) score += 1;
      }
      return score;
    };

    for (const entry of recentEntries) {
      const item = productById.get(entry.id);
      if (item && !seen.has(item.key)) {
        picks.push(item);
        seen.add(item.key);
      }
      if (picks.length >= 8) return picks;
    }

    const brandCounts = new Map<string, number>();
    for (const entry of recentEntries) {
      const item = productById.get(entry.id);
      if (!item?.brand) continue;
      const key = normalizeBrandKey(item.brand);
      if (!key) continue;
      brandCounts.set(key, (brandCounts.get(key) ?? 0) + 1);
    }
    const topBrands = Array.from(brandCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map((entry) => entry[0])
      .slice(0, 2);

    for (const brandKey of topBrands) {
      const candidates = sortedProducts
        .filter((item) => normalizeBrandKey(item.brand) === brandKey)
        .slice()
        .sort((a, b) => preferenceScore(b) - preferenceScore(a));
      for (const item of candidates) {
        if (normalizeBrandKey(item.brand) !== brandKey) continue;
        if (seen.has(item.key)) continue;
        picks.push(item);
        seen.add(item.key);
        if (picks.length >= 8) return picks;
      }
    }

    const fallbackCandidates = sortedProducts
      .slice()
      .sort((a, b) => preferenceScore(b) - preferenceScore(a));
    for (const item of fallbackCandidates) {
      if (seen.has(item.key)) continue;
      picks.push(item);
      if (picks.length >= 8) break;
    }
    return picks;
  }, [recentEntries, productById, sortedProducts]);

  async function recordProductClick(productId: string) {
    try {
      await supabase.rpc("increment_product_click", {
        product_id: productId,
      });
    } catch (e) {
      console.error("Failed to record click", e);
    }
    supabase
      .rpc("record_recent_view", { p_product_id: productId })
      .then(
        () => undefined,
        () => {
          // ignore if not authenticated
        }
      );
    const now = Date.now();
    if (now - lastRecentRefresh.current < RECENT_REFRESH_MS) return;
    lastRecentRefresh.current = now;
    setRecentEntries(readRecentViewEntries());
  }

  async function onAdd(
    product: ShopProduct,
    option: {
      id: string;
      condition: string;
      price: number;
      sale_price?: number | null;
      discount_percent?: number | null;
      qty: number;
    }
  ) {
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

  async function openAdminEditor(
    product: ShopProduct,
    _imageUrl: string | null
  ) {
    if (!isAdmin) return;
    const { data, error } = await supabase
      .from("products")
      .select(
        "id,title,brand,model,variation,image_urls,is_active,created_at,product_variants(id,condition,barcode,cost,price,qty,ship_class,issue_notes,issue_photo_urls,public_notes,created_at)"
      )
      .eq("id", product.key)
      .maybeSingle();

    if (error || !data) {
      toast({
        intent: "error",
        title: "Unable to open editor",
        message: error?.message ?? "Product not found.",
      });
      return;
    }

    setAdminEditProduct(data as AdminProduct);
  }

  const buildSocialProof = React.useCallback(
    (p: ShopProduct) => ({
      inCarts: cartMap[p.key] ?? null,
      soldThisWeek: salesMap[p.key] ?? null,
      lastViewedMinutes: recentViewMap[p.key] ?? null,
    }),
    [cartMap, salesMap, recentViewMap]
  );

  const feedSections = React.useMemo(() => {
    const sections: Array<{ key: string; title: string; items: ShopProduct[] }> = [];
    let shownProductIds = new Set<string>();

    const applyBrandFilter = (items: ShopProduct[]) => {
      if (brandTab === BRAND_ALL_KEY) return items;
      return items.filter((p) => normalizeBrandKey(p.brand) === brandTab);
    };

    const pushSection = (key: string, title: string, items: ShopProduct[]) => {
      const { list, updatedSet } = dedupeList(
        applyBrandFilter(items),
        shownProductIds
      );
      const minCount = LIMITED_SECTION_COUNTS[key] ?? 0;
      if (minCount && list.length < minCount) return;
      if (!list.length) return;
      sections.push({ key, title, items: list });
      shownProductIds = updatedSet;
    };
    const pushSectionNoDedupe = (
      key: string,
      title: string,
      items: ShopProduct[]
    ) => {
      const list = applyBrandFilter(items);
      if (!list.length) return;
      sections.push({ key, title, items: list });
    };

    if (hasSearch) {
      const { list, updatedSet } = dedupeList(sortedFiltered, shownProductIds);
      shownProductIds = updatedSet;
      if (list.length) sections.push({ key: "search", title: "Search results", items: list });
      pushSection("also-like", "You may also like", takeN(sortedProducts, 12));
      return sections;
    }

    pushSectionNoDedupe("all", "All items", sortedFiltered);
    pushSection("trending", "Trending", trendingNow);
    pushSection("new-arrivals", "New arrivals", newArrivals);
    pushSection("for-you", "For you", forYou);
    pushSection("because", "Because you searched", becauseYouSearched);
    pushSection("almost", "Almost sold out", almostSoldOut);
    pushSection("back", "Back in stock", backInStock);
    return sections;
  }, [
    brandTab,
    hasSearch,
    sortedFiltered,
    sortedProducts,
    trendingNow,
    newArrivals,
    forYou,
    becauseYouSearched,
    almostSoldOut,
    backInStock,
  ]);

  const feedItemCount = React.useMemo(
    () => feedSections.reduce((sum, section) => sum + section.items.length, 0),
    [feedSections]
  );
  const allowSuggestions = sortBy === "relevance";
  const mainSection = React.useMemo(() => {
    return (
      feedSections.find((section) => section.key === "all") ??
      feedSections.find((section) => section.key === "search") ??
      null
    );
  }, [feedSections]);
  const suggestionSections = React.useMemo(
    () =>
      feedSections.filter(
        (section) => section.key !== "all" && section.key !== "search"
      ),
    [feedSections]
  );

  return (
    <>
      <main className="px-2 py-4 sm:px-4 sm:py-6">
      {loading ? <div className="text-white/60">Loading...</div> : null}
      {err ? <div className="text-red-300">{err}</div> : null}

      {hasSearch ? (
        <div className="mb-6 rounded-2xl border border-white/10 bg-bg-900/70 p-4 shadow-soft">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-white/50">
                Search results for
              </div>
              <div className="text-lg font-semibold text-white">{searchQuery}</div>
              <div className="mt-1 text-xs text-white/50">
                Most items are one-of-one; checkout quickly to secure stock.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="rounded-full border border-white/10 bg-bg-950/50 px-3 py-1 text-xs text-white/70 hover:bg-bg-950/70 sm:text-sm"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        ref={resultsRef}
        className="scroll-mt-32 md:scroll-mt-24"
        style={{
          scrollMarginTop: "calc(var(--shop-header-height, 0px) + 1rem)",
        }}
      >
        <div
          className="sticky z-30"
          style={{ top: "var(--shop-header-height, 0px)" }}
        >
          <div className="relative -mx-2 overflow-hidden border-y border-sky-500/20 bg-bg-950/80 backdrop-blur sm:-mx-4">
            <div className="mx-auto flex max-w-6xl items-center px-2 py-2 sm:px-4">
              <div className="w-full">
                <div
                  className={[
                    "grid w-full gap-1 sm:gap-2",
                    brandColumns >= 8
                      ? "grid-cols-8"
                      : brandColumns === 7
                      ? "grid-cols-7"
                      : brandColumns === 6
                      ? "grid-cols-6"
                      : "grid-cols-5",
                  ].join(" ")}
                >
                  {visibleBrandTabs.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setBrandTab(b.key)}
                      className={getBrandButtonClasses(
                        b.key === brandTab,
                        false
                      )}
                    >
                      {b.label}
                    </button>
                  ))}
                  {canExpandBrands ? (
                    <button
                      type="button"
                      onClick={() => setShowAllBrands((prev) => !prev)}
                      className={getMoreButtonClasses(false)}
                    >
                      {moreLabel}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          {showAllBrands ? (
            <div className="-mx-2 border-b border-white/10 bg-bg-900/90 px-0 pb-3 pt-2 sm:-mx-4 sm:px-4">
              <div className="mx-auto max-w-6xl">
                <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
                  {allBrandTabs.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => {
                        setBrandTab(b.key);
                        setShowAllBrands(false);
                      }}
                      className={getBrandButtonClasses(
                        b.key === brandTab,
                        false
                      )}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {mainSection ? (
          <>
            <div className="col-span-full flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
                {mainSection.title}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/30">
                <span>{mainSection.items.length} items</span>
              </div>
            </div>
            {(() => {
              const nodes: React.ReactNode[] = [];
              const suggestionQueue = allowSuggestions
                ? suggestionSections.slice()
                : [];
              const insertAfter = [8, 20, 32, 44];
              const resolvedInsertAfter = insertAfter.length
                ? insertAfter
                : [8];
              const shouldInsert = (index: number) =>
                resolvedInsertAfter.includes(index + 1) && suggestionQueue.length;
              const renderSectionBlock = (
                section: (typeof suggestionSections)[number]
              ) => {
                const cap = LIMITED_SECTION_COUNTS[section.key] ?? 4;
                const expanded = Boolean(expandedSections[section.key]);
                const items = expanded ? section.items : section.items.slice(0, cap);
                nodes.push(
                  <div
                    key={`section-${section.key}`}
                    className="col-span-full mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
                      {section.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/30">
                      <span>{section.items.length} items</span>
                      {section.items.length > cap ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSections((prev) => ({
                              ...prev,
                              [section.key]: !prev[section.key],
                            }))
                          }
                          className="rounded-full border border-white/10 bg-bg-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70 hover:bg-bg-950/60"
                        >
                          {expanded ? "Show less" : "Show more"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
                items.forEach((p) => {
                  nodes.push(
                    <ProductCard
                      key={`${section.key}-${p.key}`}
                      product={p}
                      onAddToCart={(opt) => onAdd(p, opt)}
                      onImageClick={
                        isAdmin
                          ? (item, imageUrl) => openAdminEditor(item, imageUrl)
                          : undefined
                      }
                      onRelatedAddToCart={(item, opt) => onAdd(item, opt)}
                      onProductClick={(item) => recordProductClick(item.key)}
                      socialProof={buildSocialProof(p)}
                      relatedPool={sortedProducts}
                    />
                  );
                });
              };
              mainSection.items.forEach((p, index) => {
                nodes.push(
                  <ProductCard
                    key={`all-${p.key}`}
                    product={p}
                    onAddToCart={(opt) => onAdd(p, opt)}
                    onImageClick={
                      isAdmin
                        ? (item, imageUrl) => openAdminEditor(item, imageUrl)
                        : undefined
                    }
                    onRelatedAddToCart={(item, opt) => onAdd(item, opt)}
                    onProductClick={(item) => recordProductClick(item.key)}
                    socialProof={buildSocialProof(p)}
                    relatedPool={sortedProducts}
                  />
                );
                if (shouldInsert(index)) {
                  const section = suggestionQueue.shift();
                  if (section) renderSectionBlock(section);
                }
              });
              while (suggestionQueue.length) {
                renderSectionBlock(suggestionQueue.shift()!);
              }
              return nodes;
            })()}
          </>
        ) : null}
      </div>

      {!loading && !err && feedItemCount === 0 ? (
        <div className="text-white/60 mt-6">
          {hasSearch ? "No results found." : "No available items."}
        </div>
      ) : null}

      {showBackToTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-5 right-4 z-40 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs text-white/80 shadow-lg hover:bg-black/80 sm:text-sm"
        >
          Back to top
        </button>
      ) : null}
      </main>

      {adminEditProduct ? (
        <InventoryEditorDrawer
          product={adminEditProduct}
          onClose={() => {
            setAdminEditProduct(null);
          }}
          onSaved={() => {
            setReloadToken((prev) => prev + 1);
            setAdminEditProduct(null);
          }}
        />
      ) : null}
    </>
  );
}










