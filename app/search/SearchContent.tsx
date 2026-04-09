"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/toast";
import { useCart } from "@/hooks/useCart";
import { useSearchProducts } from "@/hooks/useSearchProducts";
import { formatConditionLabel } from "@/lib/conditions";
import { resolveEffectivePrice } from "@/lib/pricing";
import {
  PRODUCT_SPECIAL_TAG_OPTIONS,
  type ProductSpecialTag,
} from "@/lib/productTags";
import { readRecentViews } from "@/lib/recentViews";
import { buildSearchOr } from "@/lib/search";
import { SHOP_CATEGORY_OPTIONS, matchesShopCategory } from "@/lib/shopCategories";
import { mapProductsToShopProducts } from "@/lib/shopProducts";
import { supabase } from "@/lib/supabase/browser";
import { isNewArrivalCreatedAt } from "@/lib/newArrivals";

const GRID_VIEW_STORAGE_KEY = "oddwheels:grid-view";

const PRICE_PRESETS = [
  { label: "0-200", min: "0", max: "200" },
  { label: "200-400", min: "200", max: "400" },
  { label: "400-600", min: "400", max: "600" },
  { label: "600-1000", min: "600", max: "1000" },
  { label: "1000-2000", min: "1000", max: "2000" },
  { label: "2000+", min: "2000", max: "" },
] as const;

type SearchFilterState = {
  sortBy: string;
  brandFilter: string;
  conditionFilter: string;
  rarityFilter: string;
  modelFilter: string;
  scaleFilter: string;
  minPrice: string;
  maxPrice: string;
  categories: string[];
};

function getDefaultSearchFilters(): SearchFilterState {
  return {
    sortBy: "relevance",
    brandFilter: "all",
    conditionFilter: "all",
    rarityFilter: "all",
    modelFilter: "",
    scaleFilter: "all",
    minPrice: "",
    maxPrice: "",
    categories: [],
  };
}

function cloneSearchFilters(filters: SearchFilterState): SearchFilterState {
  return {
    ...filters,
    categories: [...filters.categories],
  };
}

function parsePriceValue(value: string) {
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .trim();
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function formatPeso(value: number) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `PHP ${Math.round(value)}`;
  }
}

function buildPriceSummary(minPrice: string, maxPrice: string) {
  const min = parsePriceValue(minPrice);
  const max = parsePriceValue(maxPrice);

  if (min == null && max == null) return "";
  if (min != null && max != null) {
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    return `${formatPeso(lower)} - ${formatPeso(upper)}`;
  }
  if (min != null) return `${formatPeso(min)}+`;
  return `Up to ${formatPeso(max ?? 0)}`;
}

function includeCurrentValue(values: string[], current: string, skipValue = "all") {
  if (!current || current === skipValue || values.includes(current)) {
    return values;
  }
  return [...values, current].sort((a, b) => a.localeCompare(b));
}

function toggleValue(list: string[], value: string) {
  if (list.includes(value)) {
    return list.filter((item) => item !== value);
  }
  return [...list, value];
}

export default function SearchContent() {
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const { products, loading, error, normalizedQuery } = useSearchProducts(q);
  const cart = useCart();
  const [closestMatches, setClosestMatches] = React.useState<any[]>([]);
  const [topSellers, setTopSellers] = React.useState<any[]>([]);
  const [recentlyViewed, setRecentlyViewed] = React.useState<any[]>([]);
  const [fallbackLoading, setFallbackLoading] = React.useState(false);
  const [filters, setFilters] = React.useState<SearchFilterState>(() =>
    getDefaultSearchFilters()
  );
  const [draftFilters, setDraftFilters] = React.useState<SearchFilterState>(() =>
    getDefaultSearchFilters()
  );
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"single" | "double" | "quad">(
    "single"
  );
  const [isDesktop, setIsDesktop] = React.useState(false);

  const normalizedViewMode =
    isDesktop && viewMode === "double" ? "single" : viewMode;
  const isSingleView = normalizedViewMode === "single";
  const isDoubleView = normalizedViewMode === "double";
  const isQuadView = normalizedViewMode === "quad";
  const viewModeLabel =
    normalizedViewMode === "single"
      ? "1-up"
      : normalizedViewMode === "double"
      ? "2-up"
      : "4-up";
  const nextViewMode = isDesktop
    ? normalizedViewMode === "quad"
      ? "single"
      : "quad"
    : normalizedViewMode === "single"
    ? "double"
    : normalizedViewMode === "double"
    ? "quad"
    : "single";
  const nextViewModeLabel =
    nextViewMode === "single"
      ? "1-up"
      : nextViewMode === "double"
      ? "2-up"
      : "4-up";

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(GRID_VIEW_STORAGE_KEY);
    if (saved === "single" || saved === "double" || saved === "quad") {
      setViewMode(saved);
      return;
    }
    if (saved === "wide") {
      setViewMode("quad");
      return;
    }
    setViewMode("single");
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsDesktop(window.innerWidth >= 640);
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  React.useEffect(() => {
    if (isDesktop && viewMode === "double") {
      setViewMode("single");
    }
  }, [isDesktop, viewMode]);

  React.useEffect(() => {
    if (!filtersOpen || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFiltersOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen]);

  const toggleViewMode = React.useCallback(() => {
    setViewMode((prev) => {
      const next = isDesktop
        ? prev === "quad"
          ? "single"
          : "quad"
        : prev === "single"
        ? "double"
        : prev === "double"
        ? "quad"
        : "single";
      if (typeof window !== "undefined") {
        window.localStorage.setItem(GRID_VIEW_STORAGE_KEY, next);
      }
      return next;
    });
  }, [isDesktop]);

  const productGridClass = React.useMemo(
    () =>
      isSingleView
        ? "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4"
        : isDoubleView
        ? "grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4"
        : "grid grid-cols-4 gap-2 sm:grid-cols-4 sm:gap-4 md:grid-cols-6 lg:grid-cols-8",
    [isDoubleView, isQuadView, isSingleView]
  );

  const brandOptions = React.useMemo(() => {
    const set = new Set<string>();
    products.forEach((product) => {
      if (product.brand) set.add(product.brand);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const conditionOptions = React.useMemo(() => {
    const set = new Set<string>();
    products.forEach((product) => {
      product.options?.forEach((option) => {
        if (option.condition) {
          set.add(String(option.condition));
        }
      });
    });
    return Array.from(set)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({
        value,
        label: formatConditionLabel(value),
      }));
  }, [products]);

  const scaleOptions = React.useMemo(() => {
    const set = new Set<string>();
    const extractScale = (text: string) => {
      const match = text.match(/\b1[:/]\s?\d{2,3}\b/i);
      return match ? match[0].replace(/\s+/g, "").toUpperCase() : null;
    };

    products.forEach((product) => {
      const text = `${product.title} ${product.model ?? ""} ${product.brand ?? ""}`;
      const scale = extractScale(text);
      if (scale) set.add(scale);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const brandSelectOptions = React.useMemo(
    () => includeCurrentValue(brandOptions, draftFilters.brandFilter),
    [brandOptions, draftFilters.brandFilter]
  );

  const conditionSelectOptions = React.useMemo(() => {
    const values = conditionOptions.slice();
    if (
      draftFilters.conditionFilter !== "all" &&
      !values.some((item) => item.value === draftFilters.conditionFilter)
    ) {
      values.push({
        value: draftFilters.conditionFilter,
        label: formatConditionLabel(draftFilters.conditionFilter),
      });
    }
    return values.sort((a, b) => a.label.localeCompare(b.label));
  }, [conditionOptions, draftFilters.conditionFilter]);

  const scaleSelectOptions = React.useMemo(
    () => includeCurrentValue(scaleOptions, draftFilters.scaleFilter),
    [draftFilters.scaleFilter, scaleOptions]
  );
  const raritySelectOptions = PRODUCT_SPECIAL_TAG_OPTIONS;

  const filteredProducts = React.useMemo(() => {
    const minimumPrice = parsePriceValue(filters.minPrice);
    const maximumPrice = parsePriceValue(filters.maxPrice);
    const floor =
      minimumPrice != null && maximumPrice != null
        ? Math.min(minimumPrice, maximumPrice)
        : minimumPrice;
    const ceiling =
      minimumPrice != null && maximumPrice != null
        ? Math.max(minimumPrice, maximumPrice)
        : maximumPrice;
    const filterText = filters.modelFilter.trim().toLowerCase();
    const selectedCategoryKeys = filters.categories.length
      ? new Set(filters.categories)
      : null;
    const extractScale = (text: string) => {
      const match = text.match(/\b1[:/]\s?\d{2,3}\b/i);
      return match ? match[0].replace(/\s+/g, "").toUpperCase() : null;
    };
    const minEffective = (product: (typeof products)[number]) =>
      product.minEffectivePrice ?? product.minPrice;
    const getCreatedTime = (product: (typeof products)[number]) =>
      product.created_at ? new Date(product.created_at).getTime() : 0;
    const getInventoryCreatedTime = (product: (typeof products)[number]) =>
      product.inventory_created_at
        ? new Date(product.inventory_created_at).getTime()
        : 0;
    const isNewestPriorityProduct = (product: (typeof products)[number]) => {
      return isNewArrivalCreatedAt(product.inventory_created_at);
    };

    let list = products.slice();

    if (filters.brandFilter !== "all") {
      list = list.filter(
        (product) =>
          (product.brand ?? "").toLowerCase() === filters.brandFilter.toLowerCase()
      );
    }

    if (filters.conditionFilter !== "all") {
      list = list.filter((product) =>
        product.options?.some(
          (option) =>
            option.condition.toLowerCase() ===
            filters.conditionFilter.toLowerCase()
        )
      );
    }

    if (filters.rarityFilter !== "all") {
      list = list.filter((product) =>
        (product.special_tags ?? []).includes(
          filters.rarityFilter as ProductSpecialTag
        )
      );
    }

    if (filters.scaleFilter !== "all") {
      list = list.filter((product) => {
        const text = `${product.title} ${product.model ?? ""} ${product.brand ?? ""}`;
        return extractScale(text) === filters.scaleFilter.toUpperCase();
      });
    }

    if (filterText) {
      list = list.filter((product) =>
        `${product.title} ${product.model ?? ""}`
          .toLowerCase()
          .includes(filterText)
      );
    }

    if (selectedCategoryKeys) {
      list = list.filter((product) =>
        Array.from(selectedCategoryKeys).some((key) =>
          matchesShopCategory(product, key)
        )
      );
    }

    if (floor != null) {
      list = list.filter((product) => minEffective(product) >= floor);
    }

    if (ceiling != null) {
      list = list.filter((product) => minEffective(product) <= ceiling);
    }

    if (filters.sortBy === "newest") {
      list.sort((a, b) => {
        const aPriority = isNewestPriorityProduct(a);
        const bPriority = isNewestPriorityProduct(b);
        if (aPriority !== bPriority) return aPriority ? -1 : 1;

        if (aPriority && bPriority) {
          const inventoryDiff =
            getInventoryCreatedTime(b) - getInventoryCreatedTime(a);
          if (inventoryDiff !== 0) return inventoryDiff;
        }

        const createdDiff = getCreatedTime(b) - getCreatedTime(a);
        if (createdDiff !== 0) return createdDiff;
        return getInventoryCreatedTime(b) - getInventoryCreatedTime(a);
      });
    } else if (filters.sortBy === "price_low") {
      list.sort((a, b) => minEffective(a) - minEffective(b));
    } else if (filters.sortBy === "price_high") {
      list.sort((a, b) => minEffective(b) - minEffective(a));
    } else if (filters.sortBy === "popular") {
      list.sort(
        (a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0)
      );
    } else if (filters.sortBy === "best_value") {
      list.sort((a, b) => {
        const aValue =
          (a.popularityScore ?? 0) / Math.max(minEffective(a), 1);
        const bValue =
          (b.popularityScore ?? 0) / Math.max(minEffective(b), 1);
        return bValue - aValue;
      });
    }

    return list;
  }, [filters, products]);

  React.useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (loading) return;

      if (products.length > 0 || !normalizedQuery) {
        setClosestMatches([]);
        setTopSellers([]);
        setRecentlyViewed([]);
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
              "*, product_variants(id, created_at, condition, barcode, issue_notes, issue_photo_urls, public_notes, ship_class, price, sale_price, discount_percent, qty)"
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

        if (sellerIds.length) {
          const { data: sellerProducts } = await supabase
            .from("products")
            .select(
              "*, product_variants(id, created_at, condition, barcode, issue_notes, issue_photo_urls, public_notes, ship_class, price, sale_price, discount_percent, qty)"
            )
            .in("id", sellerIds);

          sellers = mapProductsToShopProducts((sellerProducts as any[]) ?? []);
          const orderMap = new Map(
            sellerIds.map((id, index) => [id, index] as const)
          );
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
              "*, product_variants(id, created_at, condition, barcode, issue_notes, issue_photo_urls, public_notes, ship_class, price, sale_price, discount_percent, qty)"
            )
            .in("id", recentIds);

          recents = mapProductsToShopProducts((recentProducts as any[]) ?? []);
          const orderMap = new Map(
            recentIds.map((id, index) => [id, index] as const)
          );
          recents.sort(
            (a, b) => (orderMap.get(a.key) ?? 0) - (orderMap.get(b.key) ?? 0)
          );
        }

        if (!mounted) return;
        setClosestMatches(matches);
        setTopSellers(sellers);
        setRecentlyViewed(recents);
      } finally {
        if (mounted) {
          setFallbackLoading(false);
        }
      }
    };

    run();

    return () => {
      mounted = false;
    };
  }, [loading, normalizedQuery, products.length]);

  const activeFilterCount = React.useMemo(() => {
    let count = filters.categories.length;
    if (filters.brandFilter !== "all") count += 1;
    if (filters.conditionFilter !== "all") count += 1;
    if (filters.rarityFilter !== "all") count += 1;
    if (filters.scaleFilter !== "all") count += 1;
    if (filters.modelFilter.trim()) count += 1;
    if (filters.minPrice.trim() || filters.maxPrice.trim()) count += 1;
    return count;
  }, [filters]);

  const appliedFilterPills = React.useMemo(() => {
    const categoryLabelMap = new Map<string, string>(
      SHOP_CATEGORY_OPTIONS.map((category) => [category.key, category.label] as const)
    );
    const pills = filters.categories.map((key) => ({
      key: `category-${key}`,
      label: categoryLabelMap.get(key) ?? key,
    }));
    const priceLabel = buildPriceSummary(filters.minPrice, filters.maxPrice);

    if (priceLabel) {
      pills.push({ key: "price", label: priceLabel });
    }
    if (filters.brandFilter !== "all") {
      pills.push({ key: "brand", label: filters.brandFilter });
    }
    if (filters.conditionFilter !== "all") {
      pills.push({
        key: "condition",
        label: formatConditionLabel(filters.conditionFilter),
      });
    }
    if (filters.rarityFilter !== "all") {
      pills.push({
        key: "rarity",
        label:
          raritySelectOptions.find(
            (option) => option.key === filters.rarityFilter
          )?.label ?? filters.rarityFilter,
      });
    }
    if (filters.scaleFilter !== "all") {
      pills.push({ key: "scale", label: filters.scaleFilter });
    }
    if (filters.modelFilter.trim()) {
      pills.push({
        key: "model",
        label: `Model: ${filters.modelFilter.trim()}`,
      });
    }

    return pills;
  }, [filters, raritySelectOptions]);

  const resultSummary = React.useMemo(() => {
    if (loading) return "Searching...";
    if (!products.length) return `Query: "${q}"`;
    if (!activeFilterCount) {
      return `${products.length} item${products.length === 1 ? "" : "s"} found`;
    }
    return `${filteredProducts.length} of ${products.length} item${
      products.length === 1 ? "" : "s"
    } shown`;
  }, [activeFilterCount, filteredProducts.length, loading, products.length, q]);

  function openFilters() {
    setDraftFilters(cloneSearchFilters(filters));
    setFiltersOpen(true);
  }

  function clearAllFilters() {
    const next = getDefaultSearchFilters();
    setFilters(next);
    setDraftFilters(cloneSearchFilters(next));
  }

  function resetDraftFilters() {
    setDraftFilters(getDefaultSearchFilters());
  }

  function applyDraftFilters() {
    setFilters(cloneSearchFilters(draftFilters));
    setFiltersOpen(false);
  }

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
        variant: formatConditionLabel(option.condition, { upper: true }),
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
    } catch (error: any) {
      toast({
        title: "Failed to add to cart",
        message: error?.message ?? "Failed to add to cart",
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

  const filterDrawer =
    filtersOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[120]">
            <button
              type="button"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              aria-label="Close filters"
              onClick={() => setFiltersOpen(false)}
            />

            <div className="absolute inset-x-0 bottom-0 max-h-[88vh] rounded-t-[2rem] border border-white/10 bg-[#101217] text-white shadow-[0_-24px_64px_rgba(0,0,0,0.45)] sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[28rem] sm:rounded-none sm:rounded-l-[2rem]">
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div>
                    <div className="text-lg font-semibold">Filter Results</div>
                    <div className="text-xs text-white/45">
                      Category, price, and rarity filters aligned with the shop page
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                    aria-label="Close filters"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 pb-28">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">
                          By Category
                        </div>
                        <div className="mt-1 text-xs text-white/45">
                          Uses the same category buckets as the storefront
                        </div>
                      </div>
                      {draftFilters.categories.length ? (
                        <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-100">
                          {draftFilters.categories.length} selected
                        </span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {SHOP_CATEGORY_OPTIONS.map((category) => {
                        const active = draftFilters.categories.includes(category.key);
                        return (
                          <button
                            key={category.key}
                            type="button"
                            onClick={() =>
                              setDraftFilters((current) => ({
                                ...current,
                                categories: toggleValue(
                                  current.categories,
                                  category.key
                                ),
                              }))
                            }
                            className={[
                              "min-h-16 rounded-2xl border px-3 py-3 text-left text-sm font-medium transition",
                              active
                                ? "border-amber-400/45 bg-amber-400/14 text-amber-50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.08)]"
                                : "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.07] hover:text-white",
                            ].join(" ")}
                          >
                            {category.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="space-y-3 border-t border-white/10 pt-6">
                    <div>
                      <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">
                        Price Range
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Enter a custom range or tap a quick preset
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <input
                        value={draftFilters.minPrice}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            minPrice: event.target.value.replace(/[^\d,]/g, ""),
                          }))
                        }
                        inputMode="numeric"
                        placeholder="MIN"
                        className="h-20 w-full rounded-[1.6rem] border border-white/10 bg-white/[0.04] px-4 text-center text-3xl font-light tracking-wide text-white placeholder:text-white/22 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
                      />
                      <span className="text-3xl font-light text-white/22">-</span>
                      <input
                        value={draftFilters.maxPrice}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            maxPrice: event.target.value.replace(/[^\d,]/g, ""),
                          }))
                        }
                        inputMode="numeric"
                        placeholder="MAX"
                        className="h-20 w-full rounded-[1.6rem] border border-white/10 bg-white/[0.04] px-4 text-center text-3xl font-light tracking-wide text-white placeholder:text-white/22 focus:outline-none focus:ring-2 focus:ring-amber-400/35"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {PRICE_PRESETS.map((preset) => {
                        const active =
                          draftFilters.minPrice === preset.min &&
                          draftFilters.maxPrice === preset.max;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              setDraftFilters((current) => ({
                                ...current,
                                minPrice: preset.min,
                                maxPrice: preset.max,
                              }))
                            }
                            className={[
                              "rounded-2xl border px-3 py-3 text-sm font-medium transition",
                              active
                                ? "border-amber-400/45 bg-amber-400/14 text-amber-50"
                                : "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.07] hover:text-white",
                            ].join(" ")}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="space-y-4 border-t border-white/10 pt-6">
                    <div>
                      <div className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">
                        More Filters
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Keep the advanced filters inside the same drawer
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <Select
                        label="Sort"
                        value={draftFilters.sortBy}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            sortBy: event.target.value,
                          }))
                        }
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
                        value={draftFilters.brandFilter}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            brandFilter: event.target.value,
                          }))
                        }
                      >
                        <option value="all">All brands</option>
                        {brandSelectOptions.map((brand) => (
                          <option key={brand} value={brand}>
                            {brand}
                          </option>
                        ))}
                      </Select>

                      <Select
                        label="Condition"
                        value={draftFilters.conditionFilter}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            conditionFilter: event.target.value,
                          }))
                        }
                      >
                        <option value="all">All conditions</option>
                        {conditionSelectOptions.map((condition) => (
                          <option key={condition.value} value={condition.value}>
                            {condition.label}
                          </option>
                        ))}
                      </Select>

                      <Select
                        label="Rarity"
                        value={draftFilters.rarityFilter}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            rarityFilter: event.target.value,
                          }))
                        }
                      >
                        <option value="all">All rarity tags</option>
                        {raritySelectOptions.map((rarity) => (
                          <option key={rarity.key} value={rarity.key}>
                            {rarity.label}
                          </option>
                        ))}
                      </Select>

                      <Select
                        label="Scale"
                        value={draftFilters.scaleFilter}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            scaleFilter: event.target.value,
                          }))
                        }
                      >
                        <option value="all">All scales</option>
                        {scaleSelectOptions.map((scale) => (
                          <option key={scale} value={scale}>
                            {scale}
                          </option>
                        ))}
                      </Select>

                      <Input
                        label="Model keyword"
                        value={draftFilters.modelFilter}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            modelFilter: event.target.value,
                          }))
                        }
                        placeholder="e.g. Skyline, NSX"
                      />
                    </div>
                  </section>
                </div>

                <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-[#101217]/95 px-5 py-4 backdrop-blur">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={resetDraftFilters}
                      className="flex-1 rounded-2xl border border-white/15 bg-transparent px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/[0.05] hover:text-white"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={applyDraftFilters}
                      className="flex-1 rounded-2xl border border-amber-400/45 bg-amber-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-amber-400"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold">Search</h1>
          <div className="text-sm text-white/60">{resultSummary}</div>
          <div className="truncate text-xs text-white/35">Query: "{q}"</div>
        </div>

        <div className="flex items-center gap-2 self-start">
          <button
            type="button"
            onClick={openFilters}
            className="relative inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-bg-950/55 px-4 text-sm font-medium text-white/80 transition hover:bg-bg-950/75 hover:text-white"
            aria-expanded={filtersOpen}
            aria-label={
              activeFilterCount
                ? `Open filters, ${activeFilterCount} active`
                : "Open filters"
            }
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filters</span>
            {activeFilterCount ? (
              <span className="rounded-full border border-amber-400/35 bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-100">
                {activeFilterCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={toggleViewMode}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-bg-950/55 text-white/70 transition hover:bg-bg-950/75 hover:text-white"
            aria-label={`View mode ${viewModeLabel}. Switch to ${nextViewModeLabel}.`}
            title={`Switch to ${nextViewModeLabel}`}
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
      </div>

      {appliedFilterPills.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {appliedFilterPills.map((pill) => (
            <span
              key={pill.key}
              className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs text-amber-50"
            >
              {pill.label}
            </span>
          ))}
          <button
            type="button"
            onClick={clearAllFilters}
            className="inline-flex items-center rounded-full border border-white/10 bg-bg-950/45 px-3 py-1 text-xs text-white/65 transition hover:bg-bg-950/70 hover:text-white"
          >
            Clear all
          </button>
        </div>
      ) : null}

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
                {closestMatches.map((product) => (
                  <ProductCard
                    key={product.key}
                    product={product}
                    wideView={isQuadView}
                    mobileVariant={isSingleView ? "diecast" : undefined}
                    onAddToCart={(option) => onAdd(product, option)}
                    onRelatedAddToCart={(item, option) => onAdd(item, option)}
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
                {topSellers.map((product) => (
                  <ProductCard
                    key={product.key}
                    product={product}
                    wideView={isQuadView}
                    mobileVariant={isSingleView ? "diecast" : undefined}
                    onAddToCart={(option) => onAdd(product, option)}
                    onRelatedAddToCart={(item, option) => onAdd(item, option)}
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
                {recentlyViewed.map((product) => (
                  <ProductCard
                    key={product.key}
                    product={product}
                    wideView={isQuadView}
                    mobileVariant={isSingleView ? "diecast" : undefined}
                    onAddToCart={(option) => onAdd(product, option)}
                    onRelatedAddToCart={(item, option) => onAdd(item, option)}
                    onProductClick={(item) => recordClick(item.key)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-5 text-white/70">
          <div className="font-medium text-white">No items match your filters.</div>
          <div className="mt-1 text-sm text-white/55">
            Try widening the price range or clearing some categories.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openFilters}
              className="rounded-full border border-white/10 bg-bg-950/50 px-4 py-2 text-sm text-white/80 transition hover:bg-bg-950/70 hover:text-white"
            >
              Adjust filters
            </button>
            <button
              type="button"
              onClick={clearAllFilters}
              className="rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm text-white/60 transition hover:bg-white/[0.04] hover:text-white"
            >
              Clear all
            </button>
          </div>
        </div>
      ) : (
        <div className={productGridClass}>
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.key}
              product={product}
              wideView={isQuadView}
              mobileVariant={isSingleView ? "diecast" : undefined}
              onAddToCart={(option) => onAdd(product, option)}
              onRelatedAddToCart={(item, option) => onAdd(item, option)}
              onProductClick={(item) => recordClick(item.key)}
            />
          ))}
        </div>
      )}

      {filterDrawer}
    </>
  );
}
