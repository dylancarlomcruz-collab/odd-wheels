"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Badge } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/money";
import { toast } from "@/components/ui/toast";

export type AdminVariant = {
  id: string;
  condition: "sealed" | "unsealed" | "with_issues";
  barcode: string | null;
  cost: number | null;
  price: number | null;
  qty: number | null;
  ship_class: string | null;
  issue_notes: string | null;
  created_at: string | null;
};

export type AdminProduct = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_urls: string[] | null;
  is_active: boolean;
  created_at: string;
  product_variants: AdminVariant[];
};

const PAGE_SIZE = 24;

type InventoryBrowseGridProps = {
  onSelect: (product: AdminProduct) => void;
  refreshToken?: number;
};

function derivedTotals(p: AdminProduct) {
  const variants = Array.isArray(p.product_variants) ? p.product_variants : [];
  let totalQty = 0;
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = Number.NEGATIVE_INFINITY;

  for (const v of variants) {
    const qty = Number.isFinite(Number(v.qty)) ? Number(v.qty) : 0;
    const price = Number.isFinite(Number(v.price)) ? Number(v.price) : 0;
    totalQty += qty;
    minPrice = Math.min(minPrice, price);
    maxPrice = Math.max(maxPrice, price);
  }

  if (!Number.isFinite(minPrice)) minPrice = 0;
  if (!Number.isFinite(maxPrice)) maxPrice = minPrice;

  return { totalQty, minPrice, maxPrice, variantCount: variants.length };
}

function sortVariants(variants: AdminVariant[]) {
  const order = (c: AdminVariant["condition"]) =>
    c === "sealed" ? 0 : c === "unsealed" ? 1 : 2;
  return variants
    .slice()
    .sort(
      (a, b) =>
        order(a.condition) - order(b.condition) ||
        Number(a.price ?? 0) - Number(b.price ?? 0)
    );
}

function AdminProductCard({
  product,
  onClick,
  onAdjustQty,
}: {
  product: AdminProduct;
  onClick: () => void;
  onAdjustQty: (productId: string, variantId: string, delta: number) => Promise<void>;
}) {
  const { totalQty, minPrice, maxPrice, variantCount } = derivedTotals(product);
  const priceLabel =
    minPrice === maxPrice
      ? formatPHP(minPrice)
      : `${formatPHP(minPrice)} - ${formatPHP(maxPrice)}`;
  const variants = React.useMemo(
    () => sortVariants(product.product_variants ?? []),
    [product.product_variants]
  );
  const [selectedId, setSelectedId] = React.useState<string>(
    variants[0]?.id ?? ""
  );
  const [savingVariantId, setSavingVariantId] = React.useState<string | null>(
    null
  );

  React.useEffect(() => {
    setSelectedId(variants[0]?.id ?? "");
  }, [product.id, variants]);

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  const selectedPrice = selected ? formatPHP(Number(selected.price ?? 0)) : priceLabel;
  const selectedQty = Number(selected?.qty ?? 0);
  const canAdjust = Boolean(selected) && savingVariantId !== selected?.id;

  async function handleAdjust(delta: number) {
    if (!selected) return;
    setSavingVariantId(selected.id);
    try {
      await onAdjustQty(product.id, selected.id, delta);
    } finally {
      setSavingVariantId(null);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="group h-full rounded-xl sm:rounded-2xl overflow-hidden bg-paper/5 border border-white/10 text-left shadow-sm hover:border-accent-500/40 hover:shadow-accent-500/10 transition"
    >
      <div className="aspect-[4/3] bg-black/10 flex items-center justify-center">
        {product.image_urls?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_urls[0]}
            alt={product.title}
            className="h-full w-full object-contain bg-neutral-50"
          />
        ) : (
          <div className="text-white/60 text-sm">No image</div>
        )}
      </div>

      <div className="p-3 sm:p-4 space-y-2">
        <div className="flex items-start gap-2">
          <Badge
            className={
              product.is_active
                ? "bg-green-500/20 border-green-400/50 text-green-100"
                : "bg-red-500/10 border-red-400/40 text-red-100"
            }
          >
            {product.is_active ? "ACTIVE" : "ARCHIVED"}
          </Badge>
          <Badge className="ml-auto bg-white/5 border-white/10 text-white/70">
            {variantCount} variants
          </Badge>
        </div>

        <div className="text-white font-semibold line-clamp-2">
          {product.title}
        </div>
        <div className="text-white/60 text-xs line-clamp-1">
          {product.brand ?? "Unknown"}
          {product.model ? ` • ${product.model}` : ""}
          {product.variation ? ` • ${product.variation}` : ""}
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-price">{selectedPrice}</div>
          <div className="text-xs text-white/60">{selectedQty} in stock</div>
        </div>

        {variants.length ? (
          <div className="pt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => {
                const isSelected = v.id === selectedId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(v.id);
                    }}
                    className={[
                      "rounded-full border px-3 py-1 text-[11px] transition",
                      isSelected
                        ? "border-accent-500/50 bg-accent-500/20 text-accent-900 dark:text-accent-100"
                        : "border-white/10 bg-paper/5 text-white/70 hover:bg-paper/10",
                    ].join(" ")}
                  >
                    {v.condition.toUpperCase()}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-xs text-white/60">
                Variant qty: {Number(selected?.qty ?? 0)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-8 w-8 rounded-lg border border-white/10 bg-paper/10 text-white/80 hover:bg-paper/20 disabled:opacity-40"
                  disabled={!canAdjust || Number(selected?.qty ?? 0) <= 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAdjust(-1);
                  }}
                >
                  -
                </button>
                <button
                  type="button"
                  className="h-8 w-8 rounded-lg border border-white/10 bg-paper/10 text-white/80 hover:bg-paper/20 disabled:opacity-40"
                  disabled={!canAdjust}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAdjust(1);
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function InventoryBrowseGrid({
  onSelect,
  refreshToken = 0,
}: InventoryBrowseGridProps) {
  const [rows, setRows] = React.useState<AdminProduct[]>([]);
  const [page, setPage] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [searchInput, setSearchInput] = React.useState("");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [brandTab, setBrandTab] = React.useState("All");
  const [inStockOnly, setInStockOnly] = React.useState(true);
  const [showArchived, setShowArchived] = React.useState(false);

  const filtersKey = `${searchTerm}|${brandTab}|${inStockOnly}|${showArchived}|${refreshToken}`;

  const brands = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of rows) {
      if (p.brand) set.add(p.brand);
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filteredRows = React.useMemo(() => {
    return rows.filter((p) => {
      if (!showArchived && !p.is_active) return false;
      if (brandTab !== "All" && p.brand !== brandTab) return false;
      if (inStockOnly) {
        const { totalQty } = derivedTotals(p);
        if (totalQty <= 0) return false;
      }
      return true;
    });
  }, [rows, brandTab, inStockOnly, showArchived]);

  const loadPage = React.useCallback(
    async (pageIndex: number, replace = false) => {
      setLoading(true);
      setError(null);

      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const like = `%${searchTerm}%`;

      let query = supabase
        .from("products")
        .select(
          "id,title,brand,model,variation,image_urls,is_active,created_at,product_variants(id,condition,barcode,cost,price,qty,ship_class,issue_notes,created_at)"
        )
        .order("created_at", { ascending: false })
        .range(from, to);

      if (searchTerm) {
        query = query.or(
          `title.ilike.${like},brand.ilike.${like},model.ilike.${like},variation.ilike.${like},product_variants.barcode.ilike.${like}`
        );
      }
      if (brandTab !== "All") {
        query = query.eq("brand", brandTab);
      }
      if (inStockOnly) {
        query = query.gt("product_variants.qty", 0);
      }
      if (!showArchived) {
        query = query.eq("is_active", true);
      }

      const { data, error: qErr } = await query;
      setLoading(false);

      if (qErr) {
        setError(qErr.message || "Failed to load inventory");
        return;
      }

      const batch = (data as AdminProduct[]) ?? [];
      setRows((prev) => (replace ? batch : [...prev, ...batch]));
      setPage(pageIndex);
      setHasMore(batch.length === PAGE_SIZE);
    },
    [searchTerm, brandTab, inStockOnly, showArchived]
  );

  const adjustVariantQty = React.useCallback(
    async (productId: string, variantId: string, delta: number) => {
      const product = rows.find((p) => p.id === productId);
      const variant = product?.product_variants?.find((v) => v.id === variantId);
      if (!variant) return;

      const current = Number(variant.qty ?? 0);
      const next = Math.max(0, current + delta);
      if (next === current) return;

      const { error: qErr } = await supabase
        .from("product_variants")
        .update({ qty: next })
        .eq("id", variantId);

      if (qErr) {
        toast({
          intent: "error",
          title: "Update failed",
          message: qErr.message,
        });
        return;
      }

      // Sync local rows so filters and totals update without refetch.
      setRows((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                product_variants: (p.product_variants ?? []).map((v) =>
                  v.id === variantId ? { ...v, qty: next } : v
                ),
              }
            : p
        )
      );
    },
    [rows]
  );

  React.useEffect(() => {
    // Reset whenever filters change so local state matches fetched results.
    setRows([]);
    setPage(0);
    setHasMore(true);
    loadPage(0, true);
  }, [filtersKey, loadPage]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex-1">
            <Input
              placeholder="Search title/brand/model/variation or barcode..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setSearchTerm(searchInput.trim())}
            >
              Search
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSearchInput("");
                setSearchTerm("");
              }}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Checkbox
            checked={inStockOnly}
            onChange={setInStockOnly}
            label="In-stock only"
          />
          <Checkbox
            checked={showArchived}
            onChange={setShowArchived}
            label="Include archived"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
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
      </div>

      {error ? <div className="text-red-300">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {filteredRows.map((p) => (
          <AdminProductCard
            key={p.id}
            product={p}
            onClick={() => onSelect(p)}
            onAdjustQty={adjustVariantQty}
          />
        ))}
      </div>

      {loading ? <div className="text-white/60">Loading...</div> : null}

      {!loading && !filteredRows.length ? (
        <div className="text-white/60">No products match your filters.</div>
      ) : null}

      {hasMore && !loading ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => loadPage(page + 1)}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
