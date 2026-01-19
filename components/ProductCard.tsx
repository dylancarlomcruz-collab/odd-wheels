"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { recordRecentView } from "@/lib/recentViews";
import { normalizeSearchTerm } from "@/lib/search";

type ConditionOption = {
  id: string; // this is the PRODUCT ROW ID for that condition
  condition_raw?: string | null;
  condition: string;
  price: number;
  qty: number;
  issue_notes?: string | null;
  issue_photo_urls?: string[] | null;
  public_notes?: string | null;
};

type SocialProof = {
  inCarts?: number | null;
  soldThisWeek?: number | null;
  lastViewedMinutes?: number | null;
};

export type ShopProduct = {
  key: string;
  title: string;
  brand: string | null;
  model: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  minPrice: number;
  maxPrice: number;
  options: ConditionOption[];
  created_at?: string | null;
  totalQty?: number;
  minQty?: number;
  socialProof?: SocialProof;
  searchScore?: number;
  popularityScore?: number;
};

function peso(n: number) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `PHP ${Math.round(n)}`;
  }
}

export default function ProductCard({
  product,
  onAddToCart,
  onProductClick,
  socialProof,
  relatedPool,
}: {
  product: ShopProduct;
  onAddToCart: (option: ConditionOption) => void | Promise<void>;
  onProductClick?: (product: ShopProduct) => void | Promise<void>;
  socialProof?: SocialProof;
  relatedPool?: ShopProduct[] | null;
}) {
  const [selectedId, setSelectedId] = React.useState<string>(
    product.options[0]?.id ?? ""
  );
  const [hasPicked, setHasPicked] = React.useState(
    (product.options?.length ?? 0) <= 1
  );
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [issueOpen, setIssueOpen] = React.useState(false);
  const [issueIndex, setIssueIndex] = React.useState(0);
  const touchStartX = React.useRef<number | null>(null);
  const touchStartY = React.useRef<number | null>(null);
  const issueTouchStartX = React.useRef<number | null>(null);
  const issueTouchStartY = React.useRef<number | null>(null);

  const selected = React.useMemo(
    () =>
      product.options.find((o) => o.id === selectedId) ?? product.options[0],
    [product.options, selectedId]
  );

  const images = React.useMemo(() => {
    const raw = (product.image_urls ?? []).filter(Boolean) as string[];
    const list = raw.length ? raw.slice() : [];
    if (product.image_url && !list.includes(product.image_url)) {
      list.unshift(product.image_url);
    }
    return list;
  }, [product.image_url, product.image_urls]);

  const issueImages = React.useMemo(
    () => (selected?.issue_photo_urls ?? []).filter(Boolean) as string[],
    [selected?.issue_photo_urls]
  );

  const priceLabel =
    product.minPrice === product.maxPrice
      ? peso(product.minPrice)
      : `${peso(product.minPrice)} - ${peso(product.maxPrice)}`;
  const hasMultiple = product.options.length > 1;
  const displayPrice =
    hasPicked || !hasMultiple ? (selected ? peso(selected.price) : priceLabel) : priceLabel;

  const isOut = !selected || (selected.qty ?? 0) <= 0;
  const activeImage = images[activeIndex] ?? "";
  const cardImage = product.image_url ?? images[0] ?? null;
  const activeIssueImage = issueImages[issueIndex] ?? "";
  const hasIssuePhotos = issueImages.length > 0;
  const publicNotes = String(selected?.public_notes ?? "").trim();
  const issueNotes = String(selected?.issue_notes ?? "").trim();
  const lowStock = (selected?.qty ?? 0) > 0 && (selected?.qty ?? 0) <= 2;
  const onlyOneLeft = (selected?.qty ?? 0) === 1;
  const proofBits = [
    socialProof?.inCarts ? `${socialProof.inCarts} in carts` : null,
    socialProof?.soldThisWeek ? `${socialProof.soldThisWeek} sold this week` : null,
    socialProof?.lastViewedMinutes !== null && socialProof?.lastViewedMinutes !== undefined
      ? `Viewed ${socialProof.lastViewedMinutes}m ago`
      : null,
  ].filter(Boolean);

  const relatedItems = React.useMemo(() => {
    if (!isOpen || !relatedPool?.length) return [];
    const targetText = normalizeSearchTerm(
      `${product.title} ${product.brand ?? ""} ${product.model ?? ""}`
    );
    const targetTokens = new Set(
      targetText.split(" ").map((token) => token.trim()).filter(Boolean)
    );
    const targetBrand = normalizeSearchTerm(product.brand ?? "");
    const targetModel = normalizeSearchTerm(product.model ?? "");
    const scored = relatedPool
      .filter((p) => p.key !== product.key)
      .map((p) => {
        let score = 0;
        const text = normalizeSearchTerm(
          `${p.title} ${p.brand ?? ""} ${p.model ?? ""}`
        );
        if (targetBrand && normalizeSearchTerm(p.brand ?? "") === targetBrand) {
          score += 3;
        }
        if (targetModel && text.includes(targetModel)) {
          score += 2;
        }
        const tokens = text.split(" ").filter(Boolean);
        const overlap = tokens.reduce(
          (acc, token) => acc + (targetTokens.has(token) ? 1 : 0),
          0
        );
        score += overlap;
        return { product: p, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.product);

    const picked = new Set(scored.map((item) => item.key));
    const fallback = relatedPool.filter(
      (p) => p.key !== product.key && !picked.has(p.key)
    );
    return scored.concat(fallback).slice(0, 6);
  }, [
    isOpen,
    relatedPool,
    product.key,
    product.title,
    product.brand,
    product.model,
  ]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, images.length]);

  React.useEffect(() => {
    if (!issueOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIssueOpen(false);
      if (e.key === "ArrowLeft") stepIssue(-1);
      if (e.key === "ArrowRight") stepIssue(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [issueOpen, issueImages.length]);

  React.useEffect(() => {
    if (activeIndex >= images.length) setActiveIndex(0);
  }, [activeIndex, images.length]);

  React.useEffect(() => {
    setSelectedId(product.options[0]?.id ?? "");
    setHasPicked((product.options?.length ?? 0) <= 1);
  }, [product.options]);

  React.useEffect(() => {
    setIssueOpen(false);
    setIssueIndex(0);
  }, [selectedId]);

  function openPreview() {
    if (isOpen) return;
    setActiveIndex(0);
    setIsOpen(true);
    recordRecentView(product.key);
    onProductClick?.(product);
  }

  function step(delta: number) {
    if (images.length <= 1) return;
    setActiveIndex((prev) => (prev + delta + images.length) % images.length);
  }

  function openIssuePhotos() {
    if (!issueImages.length) return;
    setIssueIndex(0);
    setIssueOpen(true);
  }

  function stepIssue(delta: number) {
    if (issueImages.length <= 1) return;
    setIssueIndex((prev) => (prev + delta + issueImages.length) % issueImages.length);
  }

  function handleTouchStart(
    event: React.TouchEvent,
    startX: React.MutableRefObject<number | null>,
    startY: React.MutableRefObject<number | null>
  ) {
    const touch = event.touches[0];
    startX.current = touch?.clientX ?? null;
    startY.current = touch?.clientY ?? null;
  }

  function handleTouchEnd(
    event: React.TouchEvent,
    startX: React.MutableRefObject<number | null>,
    startY: React.MutableRefObject<number | null>,
    onSwipe: (delta: number) => void
  ) {
    if (startX.current === null || startY.current === null) return;
    const touch = event.changedTouches[0];
    const endX = touch?.clientX ?? 0;
    const endY = touch?.clientY ?? 0;
    const deltaX = endX - startX.current;
    const deltaY = endY - startY.current;
    startX.current = null;
    startY.current = null;
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    onSwipe(deltaX > 0 ? -1 : 1);
  }

  return (
    <>
      <div className="rounded-xl sm:rounded-2xl overflow-hidden bg-bg-900/70 dark:bg-paper/5 border border-white/20 dark:border-white/10 shadow-sm">
        <button
          type="button"
          onClick={openPreview}
          className="aspect-[4/3] w-full bg-black/10 flex items-center justify-center"
          aria-label={`Preview ${product.title}`}
        >
          {cardImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cardImage}
              alt={product.title}
              className="h-full w-full object-contain bg-neutral-50"
            />
          ) : (
            <div className="text-white/50 text-sm">No image</div>
          )}
        </button>

        <div className="p-3 sm:p-4">
          <button
            type="button"
            onClick={openPreview}
            className="text-left text-sm sm:text-base text-white font-semibold line-clamp-2"
          >
            {product.title}
          </button>
          <div className="text-white/60 text-[11px] sm:text-xs mt-1 line-clamp-1">
            {product.brand ?? "-"}
            {product.model ? ` - ${product.model}` : ""}
          </div>

          <div className="mt-2 sm:mt-3 flex items-center justify-between">
            <div className="text-price text-sm sm:text-base">{displayPrice}</div>
            <div className="text-[11px] sm:text-xs text-white/60">
              {selected?.qty ?? 0} left ({selected?.condition ?? "-"})
            </div>
          </div>

          {onlyOneLeft ? (
            <div className="mt-2">
              <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200">
                Only 1 left
              </span>
            </div>
          ) : null}

          {lowStock && !onlyOneLeft ? (
            <div className="mt-2 text-[11px] sm:text-xs text-amber-200/90">
              Almost sold out.
            </div>
          ) : null}

          {proofBits.length ? (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] sm:text-xs text-white/60">
              {proofBits.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-white/10 bg-bg-900/60 px-2 py-0.5"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-2 sm:mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              {product.options.map((o) => {
                const isSelected = o.id === selectedId;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(o.id);
                      setHasPicked(true);
                    }}
                    className={[
                      "rounded-full border px-2 py-0.5 text-[11px] sm:px-3 sm:py-1 sm:text-xs transition",
                      isSelected
                        ? "bg-sky-200 text-sky-900 border-sky-300 dark:bg-sky-500/20 dark:text-sky-100 dark:border-sky-400/40"
                        : "border-white/20 bg-bg-900/60 text-white/80 hover:bg-bg-900/80 dark:border-white/10 dark:bg-paper/5 dark:text-white/70 dark:hover:bg-paper/10",
                    ].join(" ")}
                  >
                    {o.condition} ({o.qty} left)
                  </button>
                );
              })}
            </div>

            <button
              className="w-full rounded-xl px-3 py-1.5 text-sm sm:px-4 sm:py-2 bg-amber-600 hover:bg-amber-500 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isOut}
              onClick={() => selected && onAddToCart(selected)}
            >
              Add
            </button>

            {hasIssuePhotos ? (
              <button
                type="button"
                onClick={openIssuePhotos}
                className="w-full rounded-xl border border-white/10 px-3 py-1.5 text-[11px] sm:text-xs text-white/80 hover:bg-white/10"
              >
                Show issue photos
              </button>
            ) : null}
          </div>

          {isOut ? (
            <div className="mt-2 text-[11px] sm:text-xs text-red-300">
              Selected condition is out of stock.
            </div>
          ) : null}
        </div>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-3 py-4 sm:items-center sm:px-4 sm:py-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
            aria-label="Close preview"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-bg-900/95 shadow-soft"
          >
            <div className="max-h-[85vh] overflow-y-auto sm:max-h-[90vh]">
              <div className="sticky top-0 z-10 border-b border-white/10 bg-bg-900/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-white/50">Item preview</div>
                    <div className="text-base font-semibold leading-snug line-clamp-2 sm:text-lg">
                      {product.title}
                    </div>
                    <div className="text-xs text-white/60 sm:text-sm">
                      {product.brand ?? "-"}
                      {product.model ? ` - ${product.model}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-sm text-white/80 hover:bg-bg-950/60"
                  >
                    <X className="h-4 w-4" />
                    Close
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2 text-[11px] text-white/50 sm:hidden">
                  <ChevronDown className="h-4 w-4 text-white/40" />
                  <span>Scroll down for details and suggestions</span>
                </div>
                <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
              <div
                className="group relative rounded-xl border border-white/10 bg-bg-950/50 p-3"
                onTouchStart={(event) => handleTouchStart(event, touchStartX, touchStartY)}
                onTouchEnd={(event) => handleTouchEnd(event, touchStartX, touchStartY, step)}
              >
                {activeImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeImage}
                    alt=""
                    className="h-72 w-full rounded-lg object-contain"
                  />
                ) : (
                  <div className="flex h-72 items-center justify-center text-sm text-white/50">
                    No image available.
                  </div>
                )}
                {images.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => step(-1)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/90 opacity-30 transition hover:opacity-100 focus-visible:opacity-100 active:opacity-100"
                      aria-label="Previous photo"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => step(1)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/90 opacity-30 transition hover:opacity-100 focus-visible:opacity-100 active:opacity-100"
                      aria-label="Next photo"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </div>

                  <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-bg-950/40 p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">Selected condition</span>
                    <span className="text-white/90">
                      {selected?.condition ?? "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">Price</span>
                    <span className="text-price">
                      {selected ? peso(selected.price) : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">Available</span>
                    <span className="text-white/80">{selected?.qty ?? 0} left</span>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-bg-950/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    Conditions
                  </div>
                  <div className="mt-2 space-y-2 text-sm">
                    {product.options.map((o) => {
                      const isSelected = o.id === selected?.id;
                      return (
                        <div
                          key={o.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className={isSelected ? "text-white" : "text-white/70"}>
                            {o.condition}
                          </span>
                          <span className={isSelected ? "text-white/90" : "text-white/60"}>
                            {peso(o.price)} - {o.qty} left
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-bg-950/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    Notes
                  </div>
                  <div className="mt-2 text-sm text-white/70">
                    {publicNotes ? publicNotes : "No notes for this item."}
                  </div>
                  {issueNotes ? (
                    <div className="mt-2 text-sm text-red-200/80">
                      Issue: {issueNotes}
                    </div>
                  ) : null}
                </div>
                  </div>
                </div>

                {relatedItems.length ? (
                  <div className="mt-5 border-t border-white/10 pt-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                      You may also like
                    </div>
                    <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                      {relatedItems.map((item) => {
                        const image =
                          item.image_url ?? item.image_urls?.[0] ?? null;
                        return (
                          <Link
                            key={item.key}
                            href={`/product/${item.key}`}
                            className="min-w-[160px] rounded-xl border border-white/10 bg-bg-950/40 p-2 hover:border-white/20 hover:bg-bg-950/60"
                          >
                            <div className="h-24 w-full rounded-lg border border-white/10 bg-bg-900/60 overflow-hidden">
                              {image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={image}
                                  alt=""
                                  className="h-full w-full object-contain bg-neutral-50"
                                />
                              ) : null}
                            </div>
                            <div className="mt-2 text-xs font-semibold line-clamp-2 text-white/90">
                              {item.title}
                            </div>
                            <div className="text-[11px] text-white/50">
                              {item.brand ?? "-"}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {issueOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-3 py-4 sm:items-center sm:px-4 sm:py-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIssueOpen(false)}
            aria-label="Close issue photos"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-bg-900/95 shadow-soft"
          >
            <div className="max-h-[85vh] overflow-y-auto sm:max-h-[90vh]">
              <div className="sticky top-0 z-10 border-b border-white/10 bg-bg-900/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-white/50">Issue photos</div>
                    <div className="text-base font-semibold leading-snug line-clamp-2 sm:text-lg">
                      {product.title}
                    </div>
                    <div className="text-xs text-white/60 sm:text-sm">
                      {selected?.condition ?? "-"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIssueOpen(false)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-sm text-white/80 hover:bg-bg-950/60"
                  >
                    <X className="h-4 w-4" />
                    Close
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-5">
                <div
                  className="group relative rounded-xl border border-white/10 bg-bg-950/50 p-3"
                  onTouchStart={(event) =>
                    handleTouchStart(event, issueTouchStartX, issueTouchStartY)
                  }
                  onTouchEnd={(event) =>
                    handleTouchEnd(event, issueTouchStartX, issueTouchStartY, stepIssue)
                  }
                >
                  {activeIssueImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeIssueImage}
                      alt="Issue photo"
                      className="h-72 w-full rounded-lg object-contain"
                    />
                  ) : (
                    <div className="flex h-72 items-center justify-center text-sm text-white/50">
                      No issue photos available.
                    </div>
                  )}
                  {issueImages.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => stepIssue(-1)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/90 opacity-30 transition hover:opacity-100 focus-visible:opacity-100 active:opacity-100"
                      aria-label="Previous issue photo"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => stepIssue(1)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/90 opacity-30 transition hover:opacity-100 focus-visible:opacity-100 active:opacity-100"
                      aria-label="Next issue photo"
                    >
                      <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}





