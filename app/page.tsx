"use client";

import * as React from "react";
import ProductCard, { type ShopProduct } from "@/components/ProductCard";
import { supabase } from "@/lib/supabase/browser";
import { useCart } from "@/hooks/useCart";
import { toast } from "@/components/ui/toast";
import { conditionSortOrder, formatConditionLabel } from "@/lib/conditions";

type VariantRow = {
  id: string; // variant id
  condition: string | null;
  issue_notes: string | null;
  issue_photo_urls: string[] | null;
  public_notes: string | null;
  price: number | null;
  qty: number | null;

  product: {
    id: string;
    title: string;
    brand: string | null;
    model: string | null;
    image_urls: string[] | null;
    is_active: boolean | null;
    created_at: string | null;
  } | null;
};

const BRAND_ALL_KEY = "__all__";
const MAX_PRIMARY_BRAND_TABS = 4;
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

function pickNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function collapseVariants(rows: VariantRow[]): ShopProduct[] {
  const map = new Map<string, ShopProduct>();

  for (const v of rows) {
    const p = v.product;
    if (!p) continue;
    if (p.is_active === false) continue;

    const key = p.id; // 1 card per product

    const conditionRaw = String(v.condition ?? "sealed").toLowerCase();
    const condition = formatConditionLabel(conditionRaw, { upper: true });
    const price = pickNumber(v.price, 0);
    const qty = pickNumber(v.qty, 0);

    if (qty <= 0) continue; // hide sold out variants

    const image_urls = Array.isArray(p.image_urls)
      ? p.image_urls.filter(Boolean)
      : [];
    const image_url = (image_urls[0] as string | undefined) ?? null;

    // option.id MUST be variant_id for cart.add(variantId)
    const option = {
      id: v.id,
      condition,
      price,
      qty,
      issue_notes: v.issue_notes ?? null,
      issue_photo_urls: Array.isArray(v.issue_photo_urls)
        ? v.issue_photo_urls
        : null,
      public_notes: v.public_notes ?? null,
      condition_raw: conditionRaw,
    };

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        title: p.title,
        brand: p.brand,
        model: p.model,
        image_url,
        image_urls: image_urls.length ? image_urls : image_url ? [image_url] : [],
        minPrice: price,
        maxPrice: price,
        options: [option],
      });
    } else {
      existing.minPrice = Math.min(existing.minPrice, price);
      existing.maxPrice = Math.max(existing.maxPrice, price);
      existing.image_url = existing.image_url || image_url || null;
      if (image_urls.length) {
        const merged = new Set([...(existing.image_urls ?? []), ...image_urls]);
        existing.image_urls = Array.from(merged);
      }
      existing.options.push(option);
    }
  }

  return Array.from(map.values()).map((p) => ({
    ...p,
    options: p.options
      .slice()
      .sort(
        (a, b) =>
          conditionSortOrder(a.condition_raw) -
            conditionSortOrder(b.condition_raw) ||
          a.price - b.price
      ),
  }));
}

function normalizeBrandKey(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export default function Page() {
  const cart = useCart();
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<VariantRow[]>([]);
  const [brandTab, setBrandTab] = React.useState<string>(BRAND_ALL_KEY);
  const [showAllBrands, setShowAllBrands] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("product_variants")
        .select(
          "id,condition,issue_notes,issue_photo_urls,public_notes,price,qty, product:products(id,title,brand,model,image_urls,is_active,created_at)"
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
  }, []);

  const shopProducts = React.useMemo(() => collapseVariants(rows), [rows]);

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

  const allBrandTabs = React.useMemo(() => {
    const list = brandStats.byLabel.map((entry) => ({
      key: entry.key,
      label: entry.label,
    }));
    return [{ key: BRAND_ALL_KEY, label: "All" }, ...list];
  }, [brandStats]);

  const filtered = React.useMemo(() => {
    if (brandTab === BRAND_ALL_KEY) return shopProducts;
    return shopProducts.filter(
      (p) => normalizeBrandKey(p.brand) === brandTab
    );
  }, [shopProducts, brandTab]);

  async function onAdd(
    product: ShopProduct,
    option: {
    id: string;
    condition: string;
    price: number;
    qty: number;
  }) {
    try {
      const result = await cart.add(option.id, 1);
      const baseToast = {
        title: product.title,
        image_url: product.image_url,
        variant: option.condition,
        price: option.price,
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

  return (
    <main className="px-3 py-5 sm:px-4 sm:py-6">
      <div className="flex flex-wrap items-center gap-2 pb-2 sm:pb-3">
        <button
          onClick={() => setBrandTab(BRAND_ALL_KEY)}
          className={[
            "whitespace-nowrap rounded-full px-3 py-1.5 text-xs border sm:px-4 sm:py-2 sm:text-sm",
            brandTab === BRAND_ALL_KEY
              ? "bg-amber-600 text-black border-amber-500"
              : "bg-paper/5 text-white/80 border-white/10",
          ].join(" ")}
        >
          All
        </button>
        {primaryBrandTabs.map((b) => (
          <button
            key={b.key}
            onClick={() => setBrandTab(b.key)}
            className={[
              "whitespace-nowrap rounded-full px-3 py-1.5 text-xs border sm:px-4 sm:py-2 sm:text-sm",
              b.key === brandTab
                ? "bg-amber-600 text-black border-amber-500"
                : "bg-paper/5 text-white/80 border-white/10",
            ].join(" ")}
          >
            {b.label}
          </button>
        ))}
      </div>
      {allBrandTabs.length > MAX_PRIMARY_BRAND_TABS ? (
        <div className="pb-2 sm:pb-3">
          <button
            type="button"
            onClick={() => setShowAllBrands((prev) => !prev)}
            className="w-full rounded-full px-3 py-2 text-xs border border-white/10 bg-black/30 text-white/70 hover:bg-black/40 sm:w-auto sm:px-4 sm:text-sm"
          >
            {showAllBrands ? "Show less" : "Show more"}
          </button>
        </div>
      ) : null}
      {showAllBrands ? (
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 max-h-40 overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {allBrandTabs.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => {
                  setBrandTab(b.key);
                  setShowAllBrands(false);
                }}
                className={[
                  "whitespace-nowrap rounded-full px-3 py-1 text-xs border",
                  b.key === brandTab
                    ? "bg-amber-600 text-black border-amber-500"
                    : "bg-paper/5 text-white/80 border-white/10",
                ].join(" ")}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? <div className="text-white/60">Loading...</div> : null}
      {err ? <div className="text-red-300">{err}</div> : null}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {filtered.map((p) => (
          <ProductCard
            key={p.key}
            product={p}
            onAddToCart={(opt) => onAdd(p, opt)}
          />
        ))}
      </div>

      {!loading && !err && filtered.length === 0 ? (
        <div className="text-white/60 mt-6">No available items.</div>
      ) : null}
    </main>
  );
}









