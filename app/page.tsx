"use client";

import * as React from "react";
import ProductCard, { type ShopProduct } from "@/components/ProductCard";
import { supabase } from "@/lib/supabase/browser";
import { useCart } from "@/hooks/useCart";
import { toast } from "@/components/ui/toast";

type VariantRow = {
  id: string; // variant id
  condition: string | null;
  issue_notes: string | null;
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

    const condition = (v.condition ?? "SEALED").toUpperCase();
    const price = pickNumber(v.price, 0);
    const qty = pickNumber(v.qty, 0);

    if (qty <= 0) continue; // hide sold out variants

    const image_urls = Array.isArray(p.image_urls)
      ? p.image_urls.filter(Boolean)
      : [];
    const image_url = (image_urls[0] as string | undefined) ?? null;

    // option.id MUST be variant_id for cart.add(variantId)
    const option = { id: v.id, condition, price, qty, issue_notes: v.issue_notes ?? null };

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

  const order = (c: string) =>
    c.includes("SEALED") ? 0 : c.includes("UNSEALED") ? 1 : 2;

  return Array.from(map.values()).map((p) => ({
    ...p,
    options: p.options
      .slice()
      .sort(
        (a, b) => order(a.condition) - order(b.condition) || a.price - b.price
      ),
  }));
}

export default function Page() {
  const cart = useCart();
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<VariantRow[]>([]);
  const [brandTab, setBrandTab] = React.useState<string>("All");

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("product_variants")
        .select(
          "id,condition,issue_notes,price,qty, product:products(id,title,brand,model,image_urls,is_active,created_at)"
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

  const brands = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of shopProducts) if (p.brand) set.add(p.brand);
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [shopProducts]);

  const filtered = React.useMemo(() => {
    if (brandTab === "All") return shopProducts;
    return shopProducts.filter((p) => p.brand === brandTab);
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
    <main className="px-4 py-6">
      <div className="flex gap-2 overflow-x-auto pb-3">
        {brands.map((b) => (
          <button
            key={b}
            onClick={() => setBrandTab(b)}
            className={[
              "whitespace-nowrap rounded-full px-4 py-2 text-sm border",
              b === brandTab
                ? "bg-amber-600 text-black border-amber-500"
                : "bg-paper/5 text-white/80 border-white/10",
            ].join(" ")}
          >
            {b}
          </button>
        ))}
      </div>

      {loading ? <div className="text-white/60">Loading…</div> : null}
      {err ? <div className="text-red-300">{err}</div> : null}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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









