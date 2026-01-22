"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BrandTabs } from "@/components/BrandTabs";
import { formatPHP } from "@/lib/money";
import { conditionSortOrder, formatConditionLabel } from "@/lib/conditions";
import { cropStyle, parseImageCrop } from "@/lib/imageCrop";

export type TradePick = {
  product_id: string;
  variant_id: string;
  qty: number;
  snapshot_title: string;
  snapshot_price: number;
  snapshot_image_url: string | null;
  snapshot_condition: string;
};

type TradeVariant = {
  id: string;
  condition:
    | "sealed"
    | "resealed"
    | "near_mint"
    | "unsealed"
    | "with_issues"
    | "diorama"
    | "blistered"
    | "sealed_blister"
    | "unsealed_blister";
  barcode: string | null;
  price: number | null;
  qty: number | null;
  ship_class: string | null;
};

type TradeProduct = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_urls: string[] | null;
  is_active: boolean;
  created_at: string;
  product_variants: TradeVariant[];
};

const PAGE_SIZE = 24;

function derivedTotals(p: TradeProduct) {
  const variants = Array.isArray(p.product_variants) ? p.product_variants : [];
  let totalQty = 0;
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = Number.NEGATIVE_INFINITY;
  for (const v of variants) {
    const qty = Number.isFinite(Number(v.qty)) ? Number(v.qty) : 0;
    const price = Number.isFinite(Number(v.price)) ? Number(v.price) : 0;
    if (qty <= 0) continue;
    totalQty += qty;
    minPrice = Math.min(minPrice, price);
    maxPrice = Math.max(maxPrice, price);
  }

  if (!Number.isFinite(minPrice)) minPrice = 0;
  if (!Number.isFinite(maxPrice)) maxPrice = minPrice;

  return { totalQty, minPrice, maxPrice };
}

function sortVariants(variants: TradeVariant[]) {
  return variants
    .slice()
    .sort(
      (a, b) =>
        conditionSortOrder(a.condition) - conditionSortOrder(b.condition) ||
        Number(a.price ?? 0) - Number(b.price ?? 0)
    );
}

function buildVariantQtyMap(rows: TradeProduct[]) {
  const map = new Map<string, number>();
  for (const p of rows) {
    for (const v of p.product_variants ?? []) {
      map.set(v.id, Number(v.qty ?? 0));
    }
  }
  return map;
}

function pickPrimaryImage(urls: string[] | null) {
  const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (!list.length) return null;
  const cropped = list.find((url) => url.includes("#crop="));
  return cropped ?? list[0] ?? null;
}

function conditionLabel(value: TradeVariant["condition"]) {
  return formatConditionLabel(value);
}

function TradeProductCard({
  product,
  picks,
  onAdd,
}: {
  product: TradeProduct;
  picks: TradePick[];
  onAdd: (pick: TradePick, maxQty: number) => void;
}) {
  const { totalQty, minPrice, maxPrice } = derivedTotals(product);
  const priceLabel =
    minPrice === maxPrice
      ? formatPHP(minPrice)
      : `${formatPHP(minPrice)} - ${formatPHP(maxPrice)}`;
  const variants = React.useMemo(() => {
    return sortVariants(product.product_variants ?? []).filter(
      (v) => Number(v.qty ?? 0) > 0
    );
  }, [product.product_variants]);
  const displayVariants = React.useMemo<TradeVariant[]>(() => {
    const sealed = variants.find((v) => v.condition === "sealed");
    const resealed = variants.find((v) => v.condition === "resealed");
    const nearMint = variants.find((v) => v.condition === "near_mint");
    const sealedBlister = variants.find((v) => v.condition === "sealed_blister");
    const unsealedBlister = variants.find(
      (v) => v.condition === "unsealed_blister"
    );
    const blistered = variants.find((v) => v.condition === "blistered");
    const unsealed = variants.find((v) => v.condition === "unsealed");
    if (
      sealed ||
      resealed ||
      nearMint ||
      unsealed ||
      sealedBlister ||
      unsealedBlister ||
      blistered
    ) {
      return [
        sealed,
        resealed,
        nearMint,
        sealedBlister,
        unsealed,
        unsealedBlister,
        blistered,
      ].filter((v): v is TradeVariant => Boolean(v));
    }
    return variants;
  }, [variants]);
  const fallback = displayVariants[0] ?? null;
  const [selectedId, setSelectedId] = React.useState<string>(fallback?.id ?? "");

  React.useEffect(() => {
    setSelectedId(displayVariants[0]?.id ?? "");
  }, [product.id, displayVariants]);

  const selected = variants.find((v) => v.id === selectedId) ?? fallback;
  const selectedQty = Number(selected?.qty ?? 0);
  const selectedPrice = selected ? formatPHP(Number(selected.price ?? 0)) : priceLabel;
  const pick = picks.find((p) => p.variant_id === selected?.id);

  const image = pickPrimaryImage(product.image_urls);
  const canAdd = Boolean(selected) && selectedQty > 0;
  const parsedImage = image ? parseImageCrop(image) : null;

    return (
      <div className="rounded-xl sm:rounded-2xl overflow-hidden bg-paper/5 border border-white/10 text-left shadow-sm hover:border-accent-500/40 hover:shadow-accent-500/10 transition">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/10 flex items-center justify-center">
          {parsedImage ? (
            <div className="h-full w-full bg-neutral-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={parsedImage.src}
                alt={product.title}
                className="h-full w-full object-contain"
                style={cropStyle(parsedImage.crop)}
              />
            </div>
          ) : (
            <div className="text-white/60 text-sm">No image</div>
          )}
        </div>

        <div className="p-3 sm:p-4 space-y-2">
          {pick ? (
            <div className="text-xs text-amber-200">In picks: {pick.qty}</div>
          ) : null}

          <div className="text-sm sm:text-base text-white font-semibold line-clamp-2">
            {product.title}
          </div>
          <div className="flex items-center justify-between pt-1.5">
            <div className="text-price text-sm sm:text-base">{selectedPrice}</div>
            <div className="text-[11px] sm:text-xs text-white/60">{selectedQty} in stock</div>
          </div>

          <div className="pt-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              {displayVariants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  className={[
                    "rounded-full px-2 py-0.5 text-[11px] sm:px-3 sm:py-1 sm:text-xs border",
                    selectedId === v.id
                      ? "bg-amber-600 text-black border-amber-500"
                      : "border-white/10 bg-paper/5 text-white/70 hover:bg-paper/10",
                  ].join(" ")}
                >
                  {conditionLabel(v.condition)}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={!canAdd}
              onClick={() => {
                if (!selected) return;
                onAdd(
                  {
                    product_id: product.id,
                    variant_id: selected.id,
                    qty: 1,
                    snapshot_title: product.title,
                    snapshot_price: Number(selected.price ?? 0),
                    snapshot_image_url: image,
                    snapshot_condition: selected.condition,
                  },
                  selectedQty
                );
              }}
            >
              {canAdd ? "Add to trade picks" : "Sold out"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

function PicksPanel({
  picks,
  variantQtyMap,
  onChange,
  onContinue,
}: {
  picks: TradePick[];
  variantQtyMap: Map<string, number>;
  onChange: (next: TradePick[]) => void;
  onContinue?: () => void;
}) {
  const totalCount = picks.reduce((sum, p) => sum + p.qty, 0);
  const totalValue = picks.reduce(
    (sum, p) => sum + p.qty * Number(p.snapshot_price ?? 0),
    0
  );
  const hasSoldOut = picks.some(
    (p) => (variantQtyMap.get(p.variant_id) ?? 0) < p.qty
  );

  function updateQty(variantId: string, delta: number) {
    onChange(
      picks
        .map((p) => {
          if (p.variant_id !== variantId) return p;
          const available = variantQtyMap.get(variantId) ?? p.qty;
          const next = Math.min(Math.max(p.qty + delta, 0), Math.max(available, 0));
          return { ...p, qty: next };
        })
        .filter((p) => p.qty > 0)
    );
  }

  function removePick(variantId: string) {
    onChange(picks.filter((p) => p.variant_id !== variantId));
  }

  const panelBody = (
    <div className="rounded-2xl border border-white/10 bg-bg-900/70 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Your trade picks</div>
      </div>

      {hasSoldOut ? (
        <div className="rounded-xl border border-yellow-400/30 bg-yellow-500/10 p-3 text-xs text-yellow-100">
          Some items are sold out. Please adjust your picks.
        </div>
      ) : null}

      {picks.length === 0 ? (
        <div className="text-sm text-white/60">No items selected yet.</div>
      ) : (
        <div className="space-y-2">
          {picks.map((p) => {
            const available = variantQtyMap.get(p.variant_id) ?? p.qty;
            const over = available < p.qty;
            return (
              <div
                key={p.variant_id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-paper/5 p-3"
              >
                <div className="h-12 w-12 rounded-lg border border-white/10 bg-bg-800 overflow-hidden">
                  {p.snapshot_image_url ? (
                    (() => {
                      const parsedThumb = parseImageCrop(p.snapshot_image_url);
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={parsedThumb.src}
                          alt={p.snapshot_title}
                          className="h-full w-full object-contain"
                          style={cropStyle(parsedThumb.crop)}
                        />
                      );
                    })()
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.snapshot_title}</div>
                  <div className="text-xs text-white/60">
                    {formatConditionLabel(p.snapshot_condition, { upper: true })} - {formatPHP(p.snapshot_price)}
                  </div>
                  {over ? (
                    <div className="text-xs text-yellow-200">Only {available} left</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-8 w-8 rounded-lg border border-white/10 bg-paper/10 text-white/80 hover:bg-paper/20 disabled:opacity-40"
                    disabled={p.qty <= 1}
                    onClick={() => updateQty(p.variant_id, -1)}
                  >
                    -
                  </button>
                  <div className="min-w-[24px] text-center text-sm text-white/90">
                    {p.qty}
                  </div>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-lg border border-white/10 bg-paper/10 text-white/80 hover:bg-paper/20 disabled:opacity-40"
                    disabled={p.qty >= available}
                    onClick={() => updateQty(p.variant_id, 1)}
                  >
                    +
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => removePick(p.variant_id)}>
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-paper/5 p-3 space-y-1 text-sm text-white/70">
        <div className="flex items-center justify-between">
          <span>Total items</span>
          <span className="text-white">{totalCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Reference value</span>
          <span className="text-white">{formatPHP(totalValue)}</span>
        </div>
        <div className="text-xs text-white/50">
          Reference value (shop price, final approval may vary).
        </div>
      </div>

      {onContinue ? (
        <Button onClick={onContinue} disabled={picks.length === 0}>
          Save picks and continue
        </Button>
      ) : null}
    </div>
  );

  return panelBody;
}

export function TradeInventoryPicker({
  picks,
  onChange,
  onContinue,
}: {
  picks: TradePick[];
  onChange: (next: TradePick[]) => void;
  onContinue?: () => void;
}) {
  const [rows, setRows] = React.useState<TradeProduct[]>([]);
  const [page, setPage] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [searchInput, setSearchInput] = React.useState("");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [brandTab, setBrandTab] = React.useState("all");
  const picksPanelRef = React.useRef<HTMLDivElement | null>(null);

  const filtersKey = `${searchTerm}|${brandTab}`;

  const filteredRows = React.useMemo(() => {
    return rows.filter((p) => {
      if (!p.is_active) return false;
      const { totalQty } = derivedTotals(p);
      if (totalQty <= 0) return false;
      return true;
    });
  }, [rows]);

  const variantQtyMap = React.useMemo(() => buildVariantQtyMap(rows), [rows]);
  const pickSummary = React.useMemo(() => {
    const totalCount = picks.reduce((sum, p) => sum + p.qty, 0);
    const totalValue = picks.reduce(
      (sum, p) => sum + p.qty * Number(p.snapshot_price ?? 0),
      0
    );
    const thumbs = picks
      .map((p) => p.snapshot_image_url)
      .filter(Boolean)
      .slice(0, 4) as string[];
    return { totalCount, totalValue, thumbs };
  }, [picks]);

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
          "id,title,brand,model,variation,image_urls,is_active,created_at,product_variants(id,condition,barcode,price,qty,ship_class)"
        )
        .order("created_at", { ascending: false })
        .range(from, to)
        .eq("is_active", true)
        .gt("product_variants.qty", 0);

      if (searchTerm) {
        query = query.or(
          `title.ilike.${like},brand.ilike.${like},model.ilike.${like},variation.ilike.${like},product_variants.barcode.ilike.${like}`
        );
      }
      if (brandTab !== "all") {
        query = query.eq("brand", brandTab);
      }
      const { data, error: qErr } = await query;
      setLoading(false);

      if (qErr) {
        setError(qErr.message || "Failed to load inventory");
        return;
      }

      const batch = (data as TradeProduct[]) ?? [];
      setRows((prev) => (replace ? batch : [...prev, ...batch]));
      setPage(pageIndex);
      setHasMore(batch.length === PAGE_SIZE);
    },
    [searchTerm, brandTab]
  );

  React.useEffect(() => {
    setRows([]);
    setPage(0);
    setHasMore(true);
    loadPage(0, true);
  }, [filtersKey, loadPage]);

  function handleAdd(pick: TradePick, maxQty: number) {
    onChange(
      (() => {
        const existing = picks.find((p) => p.variant_id === pick.variant_id);
        if (!existing) return [...picks, pick];
        const nextQty = Math.min(existing.qty + pick.qty, maxQty);
        return picks.map((p) =>
          p.variant_id === pick.variant_id ? { ...p, qty: nextQty } : p
        );
      })()
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex-1">
            <Input
              placeholder="Search title, brand, model, variation, barcode..."
              value={searchInput}
              onChange={(e) => {
                const next = e.target.value;
                setSearchInput(next);
                setSearchTerm(next.trim());
              }}
            />
          </div>
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

        <BrandTabs value={brandTab} onChange={setBrandTab} />
      </div>

      {picks.length > 0 ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-white/70 lg:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex -space-x-2">
                {pickSummary.thumbs.map((src, index) => (
                  (() => {
                    const parsedThumb = parseImageCrop(src);
                    return (
                      <div
                        key={`${src}-${index}`}
                        className="h-7 w-7 overflow-hidden rounded-full border border-white/10 bg-bg-900"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={parsedThumb.src}
                          alt=""
                          className="h-full w-full object-contain"
                          style={cropStyle(parsedThumb.crop)}
                        />
                      </div>
                    );
                  })()
                ))}
                {picks.length > pickSummary.thumbs.length ? (
                  <div className="h-7 w-7 rounded-full border border-white/10 bg-bg-900/80 text-[10px] font-semibold text-white/70 flex items-center justify-center">
                    +{picks.length - pickSummary.thumbs.length}
                  </div>
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-amber-100">
                  Trade picks
                </div>
                <div className="text-[11px] text-white/60">
                  {pickSummary.totalCount} items | {formatPHP(pickSummary.totalValue)}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                picksPanelRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
            >
              View list
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <div className="text-red-300">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {filteredRows.map((p) => (
              <TradeProductCard
                key={p.id}
                product={p}
                picks={picks}
                onAdd={handleAdd}
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

        <div className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
          <PicksPanel
            picks={picks}
            variantQtyMap={variantQtyMap}
            onChange={onChange}
            onContinue={onContinue}
          />
        </div>
      </div>

      <div ref={picksPanelRef} className="lg:hidden">
        <PicksPanel
          picks={picks}
          variantQtyMap={variantQtyMap}
          onChange={onChange}
          onContinue={onContinue}
        />
      </div>
    </div>
  );
}
