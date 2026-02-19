"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, SlidersHorizontal, X } from "lucide-react";
import ProductCard, { type ShopProduct } from "@/components/ProductCard";
import { supabase } from "@/lib/supabase/browser";
import { useCart } from "@/hooks/useCart";
import { toast } from "@/components/ui/toast";
import { collapseVariants, type VariantRow } from "@/lib/shopProducts";
import { readRecentViewEntries } from "@/lib/recentViews";
import { formatConditionLabel, isBlisterCondition } from "@/lib/conditions";
import {
  buildProductSearchText,
  buildSearchTermTokens,
  getLastSearchTerm,
  matchesSearchText,
  normalizeSearchTerm,
} from "@/lib/search";
import { useProfile } from "@/hooks/useProfile";
import { useAdminViewMode } from "@/hooks/useAdminViewMode";
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
const TOUR_STORAGE_KEY = "oddwheels:shop-tour";
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
const FILTER_CHIP_STYLES = {
  active:
    "border-amber-400/60 bg-amber-400/20 text-amber-100 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.15)]",
  idle:
    "border-white/10 bg-bg-950/50 text-white/70 hover:bg-bg-950/70 hover:text-white",
};
const PAGE_SIZE = 48;
const PAGE_SIZE_WIDE = 64;

type LastSoldEntry = {
  orderId: string;
  productKey: string;
  productTitle: string;
  variantId: string;
  condition: string;
};

type TourStep = {
  key: string;
  selector: string;
  title: string;
  body: string;
};

function normalizeBrandKey(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const BOXED_TRUESCALES_BRANDS = new Set([
  "minigt",
  "kaidohouse",
  "kaido",
  "bmc",
  "bmcreations",
  "poprace",
]);
const TOMICA_BRANDS = new Set([
  "tomica",
  "tlvn",
  "tlv",
  "tomicalimitedvintage",
  "tomicalimitedvintageneo",
]);
const HOT_WHEELS_BRANDS = ["hotwheels", "hotwheel"];
const TRUCK_KEYWORDS = ["truck", "trucks", "pickup", "hauler", "semi", "tractor", "rig", "lorry"];
const TRUESCALE_KEYWORDS = ["truescale", "true scale", "tsm", "acrylic"];
const LBWK_QUERY_TERMS = ["lbwk", "lb works", "liberty walk", "libertywalk", "lb-"];

function matchesKeyword(text: string, keyword: string) {
  const padded = ` ${text} `;
  return padded.includes(` ${keyword} `);
}

function matchesAnyKeyword(text: string, keywords: string[]) {
  for (const keyword of keywords) {
    if (matchesKeyword(text, keyword)) return true;
  }
  return false;
}

function hasAnyPhrase(text: string, terms: string[]) {
  const padded = ` ${text} `;
  return terms.some((term) => {
    const normalized = normalizeSearchTerm(term);
    if (!normalized) return false;
    return padded.includes(` ${normalized} `) || text.includes(normalized);
  });
}

function matchesCategory(product: any, category: string) {
  const brandKey = normalizeBrandKey(product?.brand);
  const text = buildProductSearchText(product);
  switch (category) {
    case "boxed-truescales":
      return BOXED_TRUESCALES_BRANDS.has(brandKey);
    case "tomicas":
      return TOMICA_BRANDS.has(brandKey);
    case "hot-wheels":
      return HOT_WHEELS_BRANDS.some((key) => brandKey.includes(key));
    case "trucks":
      return matchesAnyKeyword(text, TRUCK_KEYWORDS);
    case "dioramas":
      return (
        matchesKeyword(text, "diorama") ||
        (product?.options ?? []).some(
          (opt: any) => {
            const shipClass = String(opt?.ship_class ?? "").toUpperCase();
            return shipClass === "FIGURES_DIORAMA" || shipClass === "DIORAMA";
          }
        )
      );
    case "truescales":
      if (brandKey.includes("inno64")) {
        return false;
      }
      return (product?.options ?? []).some((opt: any) => {
        const shipClass = String(opt?.ship_class ?? "").toUpperCase();
        return shipClass === "ACRYLIC_TRUE_SCALE";
      });
    case "blistered":
      return (product?.options ?? []).some((opt: any) =>
        isBlisterCondition(opt?.condition_raw)
      );
    default:
      return true;
  }
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

function getFilterChipClasses(active: boolean) {
  return [
    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none transition",
    active ? FILTER_CHIP_STYLES.active : FILTER_CHIP_STYLES.idle,
  ].join(" ");
}

function toggleValue(list: string[], value: string) {
  if (list.includes(value)) {
    return list.filter((item) => item !== value);
  }
  return [...list, value];
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
  const isAdminUser = profile?.role === "admin";
  const { isAdminMode } = useAdminViewMode(isAdminUser);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<VariantRow[]>([]);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [adminEditProduct, setAdminEditProduct] =
    React.useState<AdminProduct | null>(null);
  const [selectedBrands, setSelectedBrands] = React.useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>(
    []
  );
  const [selectedConditions, setSelectedConditions] = React.useState<string[]>(
    []
  );
  const [showAllBrands, setShowAllBrands] = React.useState(false);
  const [brandColumns, setBrandColumns] = React.useState(BRAND_COLUMN_DEFAULT);
  const [expandedSections, setExpandedSections] = React.useState<
    Record<string, boolean>
  >({});
  const [clickMap, setClickMap] = React.useState<Record<string, number>>({});
  const [addMap, setAddMap] = React.useState<Record<string, number>>({});
  const [cartMap, setCartMap] = React.useState<Record<string, number>>({});
  const [viewMode, setViewMode] = React.useState<"single" | "double" | "quad">(
    "single"
  );
  const [isDesktop, setIsDesktop] = React.useState(false);
  const [tourPromptOpen, setTourPromptOpen] = React.useState(false);
  const [tourActive, setTourActive] = React.useState(false);
  const [tourStepIndex, setTourStepIndex] = React.useState(0);
  const [tourTarget, setTourTarget] = React.useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [tourTooltipStyle, setTourTooltipStyle] =
    React.useState<React.CSSProperties | null>(null);
  const lastTourStepKey = React.useRef<string | null>(null);
  const [salesMap, setSalesMap] = React.useState<Record<string, number>>({});
  const [topSellerIds, setTopSellerIds] = React.useState<string[]>([]);
  const [backInStockIds, setBackInStockIds] = React.useState<string[]>([]);
  const [recentEntries, setRecentEntries] = React.useState<
    Array<{ id: string; ts: number }>
  >([]);
  const [lastSearch, setLastSearch] = React.useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = React.useState(false);
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const [lastSoldEntry, setLastSoldEntry] =
    React.useState<LastSoldEntry | null>(null);
  const [revertingSale, setRevertingSale] = React.useState(false);
  const { sortBy, priceDir, newestDir } = useShopSort();
  const isSingleView = viewMode === "single";
  const isDoubleView = viewMode === "double";
  const isQuadView = viewMode === "quad";
  const normalizedViewMode = isDesktop && isDoubleView ? "single" : viewMode;
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
  const pageSize = isQuadView ? PAGE_SIZE_WIDE : PAGE_SIZE;
  const resultsRef = React.useRef<HTMLDivElement | null>(null);
  const lastScrolledQuery = React.useRef<string>("");
  const lastRecentRefresh = React.useRef<number>(0);
  const loadMoreRef = React.useRef<HTMLDivElement | null>(null);
  const tourSteps = React.useMemo<TourStep[]>(
    () => [
      {
        key: "search",
        selector: "[data-tour='shop-search']",
        title: "Search",
        body: "Find items by brand, model, or keywords.",
      },
      {
        key: "sort",
        selector: "[data-tour='shop-sort']",
        title: "Sort",
        body: "Sort by relevance, newest, popularity, or price.",
      },
      {
        key: "brands",
        selector: "[data-tour='shop-brands']",
        title: "Brands",
        body: "Filter the shop by your favorite brand.",
      },
      {
        key: "filters",
        selector: "[data-tour='shop-filters']",
        title: "Filters",
        body: "Open category and condition filters.",
      },
      {
        key: "view",
        selector: "[data-tour='shop-view']",
        title: "View toggle",
        body: "Switch between single, double, and quad grid views.",
      },
    ],
    []
  );

  const setTourStatus = React.useCallback((value: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TOUR_STORAGE_KEY, value);
  }, []);

  const startTour = React.useCallback(() => {
    setTourPromptOpen(false);
    setTourActive(true);
    setTourStepIndex(0);
    setTourStatus("started");
  }, [setTourStatus]);

  const endTour = React.useCallback(
    (value: string) => {
      setTourActive(false);
      setTourPromptOpen(false);
      setTourStatus(value);
    },
    [setTourStatus]
  );

  const findTourTarget = React.useCallback((selector: string) => {
    if (typeof document === "undefined") return null;
    const nodes = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    if (!nodes.length) return null;
    const visible = nodes.find((node) => node.offsetParent !== null && node.getClientRects().length);
    return visible ?? nodes[0];
  }, []);

  const updateTourTarget = React.useCallback(() => {
    if (!tourActive) return;
    const step = tourSteps[tourStepIndex];
    if (!step) return;
    const target = findTourTarget(step.selector);
    if (!target) {
      setTourTarget(null);
      setTourTooltipStyle(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    const pad = 4;
    setTourTarget({
      top: Math.max(0, rect.top - pad),
      left: Math.max(0, rect.left - pad),
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    });
    const placement = rect.top > window.innerHeight * 0.6 ? "top" : "bottom";
    const maxWidth = Math.min(320, window.innerWidth - 24);
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - maxWidth / 2, 12),
      window.innerWidth - maxWidth - 12
    );
    const top = placement === "bottom" ? rect.bottom + 12 : rect.top - 12;
    setTourTooltipStyle({
      left,
      top,
      width: maxWidth,
      transform: placement === "bottom" ? "translateY(0)" : "translateY(-100%)",
    });
  }, [findTourTarget, tourActive, tourStepIndex, tourSteps]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const status = window.localStorage.getItem(TOUR_STORAGE_KEY);
    if (!status) {
      setTourPromptOpen(true);
      return;
    }
    if (status === "started") {
      setTourActive(true);
    }
  }, []);

  React.useEffect(() => {
    if (!tourActive) return;
    const handle = () => updateTourTarget();
    handle();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [tourActive, tourStepIndex, updateTourTarget]);

  React.useEffect(() => {
    if (!tourActive) return;
    const step = tourSteps[tourStepIndex];
    if (!step || lastTourStepKey.current === step.key) return;
    lastTourStepKey.current = step.key;
    const target = findTourTarget(step.selector);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const padding = 80;
    const outOfView =
      rect.top < padding || rect.bottom > window.innerHeight - padding;
    if (outOfView) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [findTourTarget, tourActive, tourStepIndex, tourSteps]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
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

  const toggleViewMode = React.useCallback(() => {
    setViewMode((prev) => {
      if (isDesktop) {
        return prev === "quad" ? "single" : "quad";
      }
      if (prev === "single") return "double";
      if (prev === "double") return "quad";
      return "single";
    });
  }, [isDesktop]);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("product_variants")
        .select(
          "id,condition,issue_notes,issue_photo_urls,public_notes,ship_class,price,sale_price,discount_percent,qty, product:products(id,title,brand,model,variation,image_urls,is_active,created_at)"
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
      setSelectedBrands([]);
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

  const conditionOptions = React.useMemo(
    () => [
      { key: "sealed", label: formatConditionLabel("sealed") },
      { key: "unsealed", label: formatConditionLabel("unsealed") },
      { key: "near_mint", label: formatConditionLabel("near_mint") },
      { key: "with_issues", label: formatConditionLabel("with_issues") },
    ],
    []
  );

  const categoryOptions = React.useMemo(
    () => [
      {
        key: "boxed-truescales",
        label: "Boxed truescales",
      },
      { key: "tomicas", label: "Tomicas" },
      { key: "hot-wheels", label: "Hot Wheels" },
      { key: "trucks", label: "Trucks" },
      { key: "dioramas", label: "Figures & Dioramas" },
      { key: "truescales", label: "Truescales" },
      { key: "blistered", label: "Blistered" },
    ],
    []
  );

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

  const activeFilterCount = React.useMemo(() => {
    return selectedCategories.length + selectedConditions.length;
  }, [selectedCategories.length, selectedConditions.length]);

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

  const nowTs = Date.now();
  const getCreatedTime = React.useCallback(
    (p: ShopProduct) =>
      p.created_at ? new Date(p.created_at).getTime() : 0,
    []
  );
  const getAgeDays = React.useCallback(
    (p: ShopProduct) => (nowTs - getCreatedTime(p)) / (1000 * 60 * 60 * 24),
    [getCreatedTime, nowTs]
  );
  const getRecencyBoost = React.useCallback(
    (p: ShopProduct) => {
      const age = getAgeDays(p);
      if (!Number.isFinite(age)) return 0;
      return Math.max(0, 30 - age) / 30;
    },
    [getAgeDays]
  );
  const getBasePopularityScore = React.useCallback(
    (p: ShopProduct) => {
      const clicks = clickMap[p.key] ?? 0;
      const adds = addMap[p.key] ?? 0;
      const carts = cartMap[p.key] ?? 0;
      return clicks * 1 + adds * 3 + carts * 5;
    },
    [addMap, cartMap, clickMap]
  );

  const searchTermTokens = React.useMemo(
    () => buildSearchTermTokens(searchQuery),
    [searchQuery]
  );
  const normalizedSearchQuery = React.useMemo(
    () => normalizeSearchTerm(searchQuery),
    [searchQuery]
  );
  const strictSearchTokens = React.useMemo(
    () =>
      normalizedSearchQuery
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    [normalizedSearchQuery]
  );
  const searchIntent = React.useMemo(
    () => ({
      hotWheels: hasAnyPhrase(normalizedSearchQuery, ["hot wheels", "hotwheels"]),
      lbwk: hasAnyPhrase(normalizedSearchQuery, LBWK_QUERY_TERMS),
    }),
    [normalizedSearchQuery]
  );

  const popularKeywordTokens = React.useMemo(() => {
    if (searchTermTokens.length) return searchTermTokens;
    if (lastSearch) return buildSearchTermTokens(lastSearch);
    return [];
  }, [searchTermTokens, lastSearch]);

  const getKeywordScore = React.useCallback(
    (p: ShopProduct) => {
      if (!popularKeywordTokens.length) return 0;
      const text = buildProductSearchText(p);
      const padded = ` ${text} `;
      let best = 0;
      for (const tokens of popularKeywordTokens) {
        let score = 0;
        for (const t of tokens) {
          if (!t) continue;
          if (padded.includes(` ${t} `)) score += 2;
          else if (padded.includes(t)) score += 1;
        }
        best = Math.max(best, score);
      }
      return best;
    },
    [popularKeywordTokens]
  );

  const getPopularSortScore = React.useCallback(
    (p: ShopProduct) => getBasePopularityScore(p) + getKeywordScore(p) * 8,
    [getBasePopularityScore, getKeywordScore]
  );

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
        getBasePopularityScore(p) * 0.6 +
        (isNew ? 2 : 0) +
        (lowStock ? 1 : 0);
      return { product: p, index, score };
    });
    withIndex.sort((a, b) => b.score - a.score || a.index - b.index);
    return withIndex.map((item) => item.product);
  }, [shopProducts, clickMap, addMap, cartMap, getBasePopularityScore]);

  const searchFiltered = React.useMemo(() => {
    if (!searchTermTokens.length) return sortedProducts;
    return sortedProducts.filter((p) =>
      matchesSearchText(buildProductSearchText(p), searchTermTokens)
    );
  }, [sortedProducts, searchTermTokens]);

  const filtered = React.useMemo(() => {
    const brandKeys = selectedBrands.length ? new Set(selectedBrands) : null;
    const conditionKeys = selectedConditions.length
      ? new Set(selectedConditions)
      : null;
    const categoryKeys = selectedCategories.length
      ? new Set(selectedCategories)
      : null;

    return searchFiltered.filter((p) => {
      if (brandKeys) {
        const brandKey = normalizeBrandKey(p.brand);
        if (!brandKeys.has(brandKey)) return false;
      }
      if (conditionKeys) {
        const matchesCondition = p.options?.some((opt) =>
          conditionKeys.has(String((opt as any).condition_raw ?? ""))
        );
        if (!matchesCondition) return false;
      }
      if (categoryKeys) {
        const matchesCategoryFilter = Array.from(categoryKeys).some((key) =>
          matchesCategory(p, key)
        );
        if (!matchesCategoryFilter) return false;
      }
      return true;
    });
  }, [searchFiltered, selectedBrands, selectedCategories, selectedConditions]);

  const sortedFiltered = React.useMemo(() => {
    const list = filtered.slice();
    const getMinPrice = (p: ShopProduct) =>
      p.minEffectivePrice ?? p.minPrice ?? 0;

    const getSearchScore = (p: ShopProduct) => {
      if (!searchTermTokens.length) return 0;
      const text = buildProductSearchText(p);
      const padded = ` ${text} `;
      const title = normalizeSearchTerm(p.title ?? "");
      const brand = normalizeSearchTerm(p.brand ?? "");
      const model = normalizeSearchTerm(p.model ?? "");
      const variation = normalizeSearchTerm(p.variation ?? "");
      const productBrandKey = normalizeBrandKey(p.brand);
      const isHotWheelsProduct =
        HOT_WHEELS_BRANDS.some((key) => productBrandKey.includes(key)) ||
        hasAnyPhrase(text, ["hot wheels", "hotwheels"]);
      const isLbwkProduct = hasAnyPhrase(text, LBWK_QUERY_TERMS);

      let expandedBest = 0;
      for (const tokens of searchTermTokens) {
        let score = 0;
        let matched = 0;
        for (const t of tokens) {
          if (!t) continue;
          if (padded.includes(` ${t} `)) {
            score += 3;
            matched += 1;
          } else if (padded.includes(t)) {
            score += 1;
            matched += 1;
          }
        }
        if (matched > 0) {
          const coverage = matched / Math.max(tokens.length, 1);
          const weighted = score + coverage * 8 + Math.min(tokens.length, 4);
          expandedBest = Math.max(expandedBest, weighted);
        }
      }

      let strictScore = 0;
      let strictMatched = 0;
      for (const token of strictSearchTokens) {
        if (!token) continue;
        const inBrand =
          ` ${brand} `.includes(` ${token} `) || brand.includes(token);
        const inModel =
          ` ${model} `.includes(` ${token} `) || model.includes(token);
        const inVariation =
          ` ${variation} `.includes(` ${token} `) || variation.includes(token);
        const inTitle =
          ` ${title} `.includes(` ${token} `) || title.includes(token);
        if (inBrand) {
          strictScore += 8;
          strictMatched += 1;
        } else if (inTitle || inModel || inVariation) {
          strictScore += 5;
          strictMatched += 1;
        } else if (padded.includes(` ${token} `) || padded.includes(token)) {
          strictScore += 2;
          strictMatched += 1;
        } else {
          strictScore -= 4;
        }
      }
      if (strictSearchTokens.length && strictMatched === strictSearchTokens.length) {
        strictScore += 10;
      }
      if (normalizedSearchQuery && padded.includes(` ${normalizedSearchQuery} `)) {
        strictScore += 12;
      } else if (normalizedSearchQuery && text.includes(normalizedSearchQuery)) {
        strictScore += 6;
      }

      if (searchIntent.hotWheels) {
        strictScore += isHotWheelsProduct ? 14 : -5;
      }
      if (searchIntent.lbwk) {
        strictScore += isLbwkProduct ? 10 : -3;
      }
      if (searchIntent.hotWheels && searchIntent.lbwk) {
        if (isHotWheelsProduct && isLbwkProduct) {
          strictScore += 18;
        } else if (isLbwkProduct && !isHotWheelsProduct) {
          strictScore -= 4;
        }
      }

      return expandedBest * 2 + strictScore * 3;
    };

    if (sortBy === "relevance") {
      list.sort((a, b) => {
        const aSearchScore = getSearchScore(a);
        const bSearchScore = getSearchScore(b);
        const aScore =
          aSearchScore * 8 +
          getRecencyBoost(a) * (searchTermTokens.length ? 0.8 : 2) +
          getBasePopularityScore(a) * (searchTermTokens.length ? 0.03 : 0.1);
        const bScore =
          bSearchScore * 8 +
          getRecencyBoost(b) * (searchTermTokens.length ? 0.8 : 2) +
          getBasePopularityScore(b) * (searchTermTokens.length ? 0.03 : 0.1);
        if (bScore !== aScore) return bScore - aScore;
        return getCreatedTime(b) - getCreatedTime(a);
      });
      return list;
    }

    if (sortBy === "newest") {
      list.sort((a, b) =>
        newestDir === "asc"
          ? getCreatedTime(a) - getCreatedTime(b)
          : getCreatedTime(b) - getCreatedTime(a)
      );
      return list;
    }

    if (sortBy === "price") {
      list.sort((a, b) =>
        priceDir === "asc"
          ? getMinPrice(a) - getMinPrice(b)
          : getMinPrice(b) - getMinPrice(a)
      );
      return list;
    }

    if (sortBy === "popular") {
      list.sort((a, b) => {
        const aScore = getPopularSortScore(a);
        const bScore = getPopularSortScore(b);
        if (bScore !== aScore) return bScore - aScore;
        return getCreatedTime(b) - getCreatedTime(a);
      });
      return list;
    }

    return list;
  }, [
    filtered,
    sortBy,
    priceDir,
    newestDir,
    getCreatedTime,
    getRecencyBoost,
    getBasePopularityScore,
    getPopularSortScore,
    searchTermTokens,
    strictSearchTokens,
    normalizedSearchQuery,
    searchIntent,
  ]);

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
    const termTokens = buildSearchTermTokens(lastSearch);
    if (!termTokens.length) return [];
    return shopProducts
      .filter((p) => {
        return matchesSearchText(buildProductSearchText(p), termTokens);
      })
      .slice(0, 8);
  }, [lastSearch, shopProducts]);

  const forYou = React.useMemo(() => {
    const picks: ShopProduct[] = [];
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

  function resolveOrderId(data: any): string | null {
    if (!data) return null;
    if (typeof data === "string" || typeof data === "number") return String(data);
    if (typeof data === "object") {
      return (
        data.order_id ??
        data.orderId ??
        data.id ??
        data.order?.id ??
        data.data?.id ??
        null
      );
    }
    return null;
  }

  async function markOneSoldViaPos(
    product: ShopProduct,
    option: {
      id: string;
      condition: string;
    }
  ) {
    const shippingDetails = {
      method: "PICKUP",
      text: "Auto-sold from inventory editor",
      discount: null,
    };

    const { data, error } = await supabase.rpc("pos_create_order", {
      p_customer_name: "Odd Wheels FB",
      p_customer_phone: "N/A",
      p_shipping_method: "PICKUP",
      p_shipping_details: shippingDetails,
      p_payment_method: "CASH",
      p_save_customer: false,
      p_items: [{ variant_id: option.id, qty: 1 }],
    });
    if (error) throw error;

    const orderId = resolveOrderId(data);
    if (!orderId) {
      throw new Error("POS order created, but order id is missing.");
    }

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      throw new Error("Staff session not found. Please sign in again.");
    }

    const res = await fetch("/api/pos/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.ok) {
      throw new Error(payload?.error ?? "POS completion failed.");
    }

    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== option.id) return row;
        const currentQty = Math.max(0, Math.trunc(Number(row.qty ?? 0)));
        return { ...row, qty: Math.max(0, currentQty - 1) };
      })
    );
    setLastSoldEntry({
      orderId,
      productKey: product.key,
      productTitle: product.title,
      variantId: option.id,
      condition: option.condition,
    });

    toast({
      intent: "success",
      title: "Marked sold",
      message: `1 qty sold via POS as Odd Wheels FB (${formatConditionLabel(option.condition, {
        upper: true,
      })}).`,
      image_url: product.image_url,
    });
  }

  async function revertLastSoldSale() {
    if (!lastSoldEntry || revertingSale) return;
    const confirmed = window.confirm(
      `Revert last sale for "${lastSoldEntry.productTitle}"?`
    );
    if (!confirmed) return;

    setRevertingSale(true);
    try {
      const { error } = await supabase.rpc("fn_staff_void_order", {
        p_order_id: lastSoldEntry.orderId,
        p_reason: "Reverted sale from shop admin mode",
      });
      if (error) throw error;

      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== lastSoldEntry.variantId) return row;
          const currentQty = Math.max(0, Math.trunc(Number(row.qty ?? 0)));
          return { ...row, qty: currentQty + 1 };
        })
      );

      toast({
        intent: "success",
        title: "Sale reverted",
        message: `Sale reverted (${formatConditionLabel(lastSoldEntry.condition, {
          upper: true,
        })}).`,
      });
      setLastSoldEntry(null);
    } catch (e: any) {
      toast({
        intent: "error",
        title: "Revert failed",
        message: e?.message ?? "Unable to revert this sale.",
      });
    } finally {
      setRevertingSale(false);
    }
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
      if (isAdminMode) {
        await markOneSoldViaPos(product, option);
        return;
      }

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
    if (!isAdminMode) return;
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
      if (!selectedBrands.length) return items;
      return items.filter((p) =>
        selectedBrands.includes(normalizeBrandKey(p.brand))
      );
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
    selectedBrands,
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
  const allowSuggestions =
    sortBy === "relevance" &&
    selectedCategories.length === 0 &&
    selectedConditions.length === 0 &&
    selectedBrands.length === 0;
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
  const totalMainItems = mainSection?.items.length ?? 0;
  const visibleMainItems = mainSection
    ? mainSection.items.slice(0, visibleCount)
    : [];
  const canLoadMore = visibleMainItems.length < totalMainItems;

  React.useEffect(() => {
    setVisibleCount(Math.min(pageSize, totalMainItems));
  }, [
    pageSize,
    totalMainItems,
    searchQuery,
    selectedBrands,
    selectedCategories,
    selectedConditions,
    sortBy,
    priceDir,
  ]);

  React.useEffect(() => {
    if (!canLoadMore) return;
    const node = loadMoreRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setVisibleCount((prev) =>
            Math.min(prev + pageSize, totalMainItems)
          );
          break;
        }
      },
      { root: null, rootMargin: "600px 0px", threshold: 0.01 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, pageSize, totalMainItems, visibleCount]);
  const activeTourStep = tourSteps[tourStepIndex] ?? null;
  const tourIsLastStep = tourStepIndex >= tourSteps.length - 1;
  const tourTooltipFallback = {
    left: "50%",
    top: "50%",
    width: "min(320px, 90vw)",
    transform: "translate(-50%, -50%)",
  } as React.CSSProperties;
  const tourTooltipInlineStyle = tourTooltipStyle ?? tourTooltipFallback;
  const advanceTour = React.useCallback(() => {
    if (tourIsLastStep) {
      endTour("done");
      return;
    }
    setTourStepIndex((prev) => Math.min(prev + 1, tourSteps.length - 1));
  }, [endTour, tourIsLastStep, tourSteps.length]);

  return (
    <>
      {tourPromptOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => endTour("dismissed")}
            aria-label="Dismiss tour prompt"
          />
          <div className="relative z-[71] w-full max-w-sm rounded-2xl border border-white/10 bg-bg-900/95 p-4 shadow-soft">
            <div className="text-sm font-semibold text-white">
              Want a quick tour?
            </div>
            <div className="mt-1 text-xs text-white/70">
              See what each button does on the shop page.
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => endTour("dismissed")}
                className="rounded-full border border-white/10 bg-bg-950/40 px-3 py-1.5 text-xs text-white/70 hover:bg-bg-950/60"
              >
                No thanks
              </button>
              <button
                type="button"
                onClick={startTour}
                className="rounded-full border border-amber-400/60 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/30"
              >
                Yes, show me
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tourActive && activeTourStep ? (
        <div className="fixed inset-0 z-[80]" onClick={advanceTour}>
          <div className="absolute inset-0 bg-black/60" />
          {tourTarget ? (
            <div
              className="absolute rounded-2xl border-2 border-amber-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
              style={{
                top: tourTarget.top,
                left: tourTarget.left,
                width: tourTarget.width,
                height: tourTarget.height,
              }}
            />
          ) : null}
          <div
            className="absolute z-[82] rounded-2xl border border-white/10 bg-bg-900/95 p-4 shadow-soft"
            style={tourTooltipInlineStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-white/50">
                  Shop tour
                </div>
                <div className="text-sm font-semibold text-white">
                  {activeTourStep.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => endTour("dismissed")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-bg-950/40 text-white/70 hover:bg-bg-950/60"
                aria-label="Close tour"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 text-xs text-white/70">
              {activeTourStep.body}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => endTour("dismissed")}
                className="text-xs text-white/60 hover:text-white"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={advanceTour}
                className="rounded-full border border-amber-400/60 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/30"
              >
                {tourIsLastStep ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
            <div className="mx-auto flex max-w-6xl items-center gap-2 px-2 py-2 sm:px-4">
              <div className="min-w-0 flex-1">
                <div
                  data-tour="shop-brands"
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
                        onClick={() => {
                          if (b.key === BRAND_ALL_KEY) {
                            setSelectedBrands([]);
                            setShowAllBrands(false);
                          } else {
                            setSelectedBrands((prev) => toggleValue(prev, b.key));
                          }
                        }}
                        className={getBrandButtonClasses(
                          b.key === BRAND_ALL_KEY
                            ? selectedBrands.length === 0
                            : selectedBrands.includes(b.key),
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
              <button
                type="button"
                onClick={() => setFiltersOpen((prev) => !prev)}
                data-tour="shop-filters"
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-bg-950/50 text-white/70 transition hover:bg-bg-950/70 hover:text-white"
                aria-expanded={filtersOpen}
                aria-controls="shop-filters-panel"
                aria-label={filtersOpen ? "Close filters" : "Open filters"}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {activeFilterCount ? (
                  <span className="absolute -right-1 -top-1 rounded-full border border-amber-400/40 bg-amber-400/20 px-1.5 py-0.5 text-[9px] text-amber-100">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={toggleViewMode}
                data-tour="shop-view"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-bg-950/50 text-white/70 transition hover:bg-bg-950/70 hover:text-white"
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
          {showAllBrands ? (
            <div className="-mx-2 border-b border-white/10 bg-bg-900/90 px-0 pb-3 pt-2 sm:-mx-4 sm:px-4">
              <div className="mx-auto max-w-6xl">
                <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
                  {allBrandTabs.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                        onClick={() => {
                          if (b.key === BRAND_ALL_KEY) {
                            setSelectedBrands([]);
                          } else {
                            setSelectedBrands((prev) => toggleValue(prev, b.key));
                          }
                        }}
                        className={getBrandButtonClasses(
                          b.key === BRAND_ALL_KEY
                            ? selectedBrands.length === 0
                            : selectedBrands.includes(b.key),
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
          {filtersOpen ? (
            <div
              id="shop-filters-panel"
              className="-mx-2 border-b border-white/10 bg-bg-900/95 px-2 py-2 sm:-mx-4 sm:px-4"
            >
              <div className="mx-auto max-w-6xl space-y-1.5">
                <div className="flex items-center justify-end gap-2">
                  <div className="flex items-center gap-2">
                    {activeFilterCount ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategories([]);
                          setSelectedConditions([]);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-bg-950/50 px-2 py-1 text-[10px] uppercase tracking-wide text-white/60 hover:bg-bg-950/70 hover:text-white"
                      >
                        Clear
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setFiltersOpen(false)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-bg-950/50 text-white/60 hover:bg-bg-950/70 hover:text-white"
                      aria-label="Close filters"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
                      Categories
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {categoryOptions.map((category) => (
                        <button
                          key={category.key}
                          type="button"
                          className={getFilterChipClasses(
                            selectedCategories.includes(category.key)
                          )}
                          onClick={() => {
                            setSelectedCategories((prev) => {
                              const next = toggleValue(prev, category.key);
                              return next;
                            });
                          }}
                        >
                          <span>{category.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
                      Condition
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {conditionOptions.map((condition) => (
                        <button
                          key={condition.key}
                          type="button"
                          className={getFilterChipClasses(
                            selectedConditions.includes(condition.key)
                          )}
                          onClick={() =>
                            setSelectedConditions((prev) =>
                              toggleValue(prev, condition.key)
                            )
                          }
                        >
                          <span>{condition.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div
        data-tour="shop-grid"
        className={
          isSingleView
            ? "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4"
            : isDoubleView
            ? "mt-3 grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4"
            : "mt-3 grid grid-cols-4 gap-2 sm:grid-cols-4 sm:gap-4 md:grid-cols-6 lg:grid-cols-8"
        }
      >
        {mainSection ? (
          <>
            <div className="col-span-full flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
                {mainSection.title}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/30">
                <span>
                  Showing {visibleMainItems.length} of {mainSection.items.length}
                </span>
                {isAdminMode && lastSoldEntry ? (
                  <button
                    type="button"
                    onClick={() => void revertLastSoldSale()}
                    disabled={revertingSale}
                    className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {revertingSale ? "Reverting..." : "Revert last sold"}
                  </button>
                ) : null}
              </div>
            </div>
            {(() => {
              const nodes: React.ReactNode[] = [];
              const suggestionQueue =
                allowSuggestions && !hasSearch ? suggestionSections.slice() : [];
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
                      wideView={isQuadView}
                      mobileVariant={isSingleView ? "diecast" : undefined}
                      primaryActionLabel={isAdminMode ? "Sold" : "Add"}
                      onAddToCart={(opt) => onAdd(p, opt)}
                      onImageClick={
                        isAdminMode
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
              visibleMainItems.forEach((p, index) => {
                nodes.push(
                <ProductCard
                  key={`all-${p.key}`}
                  product={p}
                  wideView={isQuadView}
                  mobileVariant={isSingleView ? "diecast" : undefined}
                  primaryActionLabel={isAdminMode ? "Sold" : "Add"}
                  onAddToCart={(opt) => onAdd(p, opt)}
                  onImageClick={
                    isAdminMode
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
              const allMainVisible =
                visibleMainItems.length >= mainSection.items.length;
              if (allMainVisible) {
                while (suggestionQueue.length) {
                  renderSectionBlock(suggestionQueue.shift()!);
                }
                if (hasSearch && suggestionSections.length) {
                  suggestionSections.forEach((section) => {
                    renderSectionBlock(section);
                  });
                }
              }
              return nodes;
            })()}
          </>
        ) : null}
      </div>

      {mainSection && canLoadMore ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() =>
              setVisibleCount((prev) =>
                Math.min(prev + pageSize, mainSection.items.length)
              )
            }
            className="rounded-full border border-white/15 bg-bg-950/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/80 hover:bg-bg-950/80"
          >
            Load more
          </button>
          <div ref={loadMoreRef} className="h-1 w-full" />
        </div>
      ) : (
        <div ref={loadMoreRef} className="h-1 w-full" />
      )}

      {!loading && !err && feedItemCount === 0 ? (
        <div className="text-white/60 mt-6">
          {hasSearch ? "No results found." : "No available items."}
        </div>
      ) : null}

      {showBackToTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white/80 shadow-lg hover:bg-black/80"
          aria-label="Back to top"
          title="Back to top"
        >
          <ArrowUp className="h-5 w-5" />
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










