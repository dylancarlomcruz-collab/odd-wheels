"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, X } from "lucide-react";
import { recordRecentView } from "@/lib/recentViews";
import { normalizeSearchTerm } from "@/lib/search";
import { formatConditionLabel } from "@/lib/conditions";
import { cropStyle, parseImageCrop } from "@/lib/imageCrop";
import { getOptionPricing, getProductEffectiveRange } from "@/lib/pricing";
import { formatTitle } from "@/lib/text";
import { supabase } from "@/lib/supabase/browser";

type ConditionOption = {
  id: string; // this is the PRODUCT ROW ID for that condition
  condition_raw?: string | null;
  condition: string;
  price: number;
  sale_price?: number | null;
  discount_percent?: number | null;
  qty: number;
  ship_class?: string | null;
  issue_notes?: string | null;
  issue_photo_urls?: string[] | null;
  public_notes?: string | null;
};

type SocialProof = {
  inCarts?: number | null;
  soldThisWeek?: number | null;
  lastViewedMinutes?: number | null;
};

type PreviewEntry = {
  product: ShopProduct;
  selectedId: string;
};

export type ShopProduct = {
  key: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation?: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  minPrice: number;
  maxPrice: number;
  minEffectivePrice?: number;
  maxEffectivePrice?: number;
  hasSale?: boolean;
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
  onImageClick,
  onRelatedAddToCart,
  onProductClick,
  socialProof,
  relatedPool,
}: {
  product: ShopProduct;
  onAddToCart: (option: ConditionOption) => void | Promise<void>;
  onImageClick?: (product: ShopProduct, imageUrl: string | null) => void;
  onRelatedAddToCart?: (
    product: ShopProduct,
    option: ConditionOption,
  ) => void | Promise<void>;
  onProductClick?: (product: ShopProduct) => void | Promise<void>;
  socialProof?: SocialProof;
  relatedPool?: ShopProduct[] | null;
}) {
  const [selectedId, setSelectedId] = React.useState<string>(
    product.options[0]?.id ?? "",
  );
  const [hasPicked, setHasPicked] = React.useState(
    (product.options?.length ?? 0) <= 1,
  );
  const [isOpen, setIsOpen] = React.useState(false);
  const [previewStack, setPreviewStack] = React.useState<PreviewEntry[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [issueOpen, setIssueOpen] = React.useState(false);
  const [issueIndex, setIssueIndex] = React.useState(0);
  const touchStartX = React.useRef<number | null>(null);
  const touchStartY = React.useRef<number | null>(null);
  const issueTouchStartX = React.useRef<number | null>(null);
  const issueTouchStartY = React.useRef<number | null>(null);
  const previewScrollRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const loggedPreviewIds = React.useRef(new Set<string>());

  const selected = React.useMemo(
    () =>
      product.options.find((o) => o.id === selectedId) ?? product.options[0],
    [product.options, selectedId],
  );
  const previewEntry = previewStack[previewStack.length - 1];
  const previewProduct = previewEntry?.product ?? product;
  const previewSelectedId =
    previewEntry?.selectedId ?? previewProduct.options[0]?.id ?? "";
  const previewSelected = React.useMemo(
    () =>
      previewProduct.options.find((o) => o.id === previewSelectedId) ??
      previewProduct.options[0],
    [previewProduct.options, previewSelectedId],
  );
  const previewPricing = React.useMemo(
    () => (previewSelected ? getOptionPricing(previewSelected) : null),
    [previewSelected]
  );
  const previewDisplayPrice = previewPricing
    ? previewPricing.hasSale
      ? peso(previewPricing.effectivePrice)
      : peso(previewSelected?.price ?? 0)
    : "-";
  const previewStrikePrice =
    previewPricing?.hasSale ? peso(previewSelected?.price ?? 0) : null;

  const cardImages = React.useMemo(() => {
    const raw = (product.image_urls ?? []).filter(Boolean) as string[];
    const list = raw.length ? raw.slice() : [];
    if (product.image_url && !list.includes(product.image_url)) {
      list.unshift(product.image_url);
    }
    return list;
  }, [product.image_url, product.image_urls]);

  const previewImages = React.useMemo(() => {
    const raw = (previewProduct.image_urls ?? []).filter(Boolean) as string[];
    const list = raw.length ? raw.slice() : [];
    if (previewProduct.image_url && !list.includes(previewProduct.image_url)) {
      list.unshift(previewProduct.image_url);
    }
    return list;
  }, [previewProduct.image_url, previewProduct.image_urls]);

  const issueImages = React.useMemo(
    () => (selected?.issue_photo_urls ?? []).filter(Boolean) as string[],
    [selected?.issue_photo_urls],
  );
  const previewIsOut = !previewSelected || (previewSelected.qty ?? 0) <= 0;

  const basePriceLabel =
    product.minPrice === product.maxPrice
      ? peso(product.minPrice)
      : `${peso(product.minPrice)} - ${peso(product.maxPrice)}`;
  const effectiveRange = React.useMemo(
    () => getProductEffectiveRange(product),
    [product]
  );
  const effectiveMinPrice =
    product.minEffectivePrice ?? effectiveRange.min ?? product.minPrice;
  const effectiveMaxPrice =
    product.maxEffectivePrice ?? effectiveRange.max ?? product.maxPrice;
  const effectivePriceLabel =
    effectiveMinPrice === effectiveMaxPrice
      ? peso(effectiveMinPrice)
      : `${peso(effectiveMinPrice)} - ${peso(effectiveMaxPrice)}`;
  const hasSale = product.hasSale ?? effectiveRange.hasSale;
  const rangeLabel = hasSale ? effectivePriceLabel : basePriceLabel;
  const hasMultiple = product.options.length > 1;
  const selectedPricing = React.useMemo(
    () => (selected ? getOptionPricing(selected) : null),
    [selected]
  );
  const displayPrice =
    hasPicked || !hasMultiple
      ? selected
        ? selectedPricing?.hasSale
          ? peso(selectedPricing.effectivePrice)
          : peso(selected.price)
        : rangeLabel
      : rangeLabel;
  const strikePrice =
    selected && selectedPricing?.hasSale ? peso(selected.price) : null;

  const isOut = !selected || (selected.qty ?? 0) <= 0;
  const activeImage = previewImages[activeIndex] ?? "";
  const cardImage = product.image_url ?? cardImages[0] ?? null;
  const parsedCardImage = React.useMemo(
    () => (cardImage ? parseImageCrop(cardImage) : null),
    [cardImage]
  );
  const activeIssueImage = issueImages[issueIndex] ?? "";
  const hasIssuePhotos = issueImages.length > 0;
  const publicNotes = String(previewSelected?.public_notes ?? "").trim();
  const issueNotes = String(previewSelected?.issue_notes ?? "").trim();
  const unifiedNotes = publicNotes || issueNotes;
  const isNearMint = previewSelected?.condition === "near_mint";
  const isWithIssues = previewSelected?.condition === "with_issues";
  const showNoteIndicator = isNearMint || isWithIssues;
  const noteIndicatorTone = isWithIssues
    ? "bg-red-400"
    : isNearMint
      ? "bg-amber-400"
      : "";
  const noteTone = unifiedNotes
    ? isWithIssues
      ? "text-red-200/80"
      : isNearMint
        ? "text-amber-200/80"
        : "text-white/70"
    : "text-white/70";
  const lowStock = (selected?.qty ?? 0) > 0 && (selected?.qty ?? 0) <= 2;
  const onlyOneLeft = (selected?.qty ?? 0) === 1;
  const conditionLabel = formatConditionLabel(selected?.condition ?? "-", {
    upper: true,
    shipClass: selected?.ship_class,
  });
  const proofBits = [
    socialProof?.inCarts ? `${socialProof.inCarts} in carts` : null,
    socialProof?.soldThisWeek
      ? `${socialProof.soldThisWeek} sold this week`
      : null,
    socialProof?.lastViewedMinutes !== null &&
    socialProof?.lastViewedMinutes !== undefined
      ? `Viewed ${socialProof.lastViewedMinutes}m ago`
      : null,
  ].filter(Boolean);
  const primaryProof = proofBits[0];

  const relatedItems = React.useMemo(() => {
    if (!isOpen || !relatedPool?.length) return [];
    const targetText = normalizeSearchTerm(
      `${previewProduct.title} ${previewProduct.brand ?? ""} ${previewProduct.model ?? ""}`,
    );
    const targetTokens = new Set(
      targetText
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean),
    );
    const targetBrand = normalizeSearchTerm(previewProduct.brand ?? "");
    const targetModel = normalizeSearchTerm(previewProduct.model ?? "");
    const scored = relatedPool
      .filter((p) => p.key !== previewProduct.key)
      .map((p) => {
        let score = 0;
        const text = normalizeSearchTerm(
          `${p.title} ${p.brand ?? ""} ${p.model ?? ""}`,
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
          0,
        );
        score += overlap;
        return { product: p, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.product);

    const picked = new Set(scored.map((item) => item.key));
    const fallback = relatedPool.filter(
      (p) => p.key !== previewProduct.key && !picked.has(p.key),
    );
    return scored.concat(fallback).slice(0, 6);
  }, [
    isOpen,
    relatedPool,
    previewProduct.key,
    previewProduct.title,
    previewProduct.brand,
    previewProduct.model,
  ]);
  const canGoBack = previewStack.length > 1;

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, previewImages.length]);

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
    if (activeIndex >= previewImages.length) setActiveIndex(0);
  }, [activeIndex, previewImages.length]);

  React.useEffect(() => {
    if (!isOpen) return;
    previewScrollRef.current?.scrollTo({ top: 0 });
  }, [isOpen, previewProduct.key]);

  React.useEffect(() => {
    setSelectedId(product.options[0]?.id ?? "");
    setHasPicked((product.options?.length ?? 0) <= 1);
  }, [product.options]);

  React.useEffect(() => {
    setIssueOpen(false);
    setIssueIndex(0);
  }, [selectedId]);

  React.useEffect(() => {
    const node = cardRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      void logProductPreviewOnce(product.key);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.disconnect();
          void logProductPreviewOnce(product.key);
          break;
        }
      },
      { root: null, rootMargin: "0px 0px -20% 0px", threshold: 0.25 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [product.key]);

  function closePreview() {
    setIsOpen(false);
    setPreviewStack([]);
    setActiveIndex(0);
    setIssueOpen(false);
    setIssueIndex(0);
  }

  async function logProductPreview(productId: string) {
    if (!productId) return;
    try {
      await supabase.rpc("increment_product_click", { p_product_id: productId });
    } catch (e) {
      console.error("Failed to log product click", e);
    }
    supabase
      .rpc("record_recent_view", { p_product_id: productId })
      .then(
        () => undefined,
        () => {
          // ignore if not authenticated
        }
      );
  }

  function logProductPreviewOnce(productId: string) {
    if (!productId) return;
    if (loggedPreviewIds.current.has(productId)) return;
    loggedPreviewIds.current.add(productId);
    void logProductPreview(productId);
  }

  function openPreview() {
    if (isOpen) return;
    setActiveIndex(0);
    setIssueOpen(false);
    setIssueIndex(0);
    const nextSelectedId = selectedId || product.options[0]?.id || "";
    setPreviewStack([{ product, selectedId: nextSelectedId }]);
    setIsOpen(true);
    recordRecentView(product.key);
    void logProductPreviewOnce(product.key);
    onProductClick?.(product);
  }

  function pushPreview(item: ShopProduct) {
    if (item.key === previewProduct.key) return;
    setActiveIndex(0);
    setIssueOpen(false);
    setIssueIndex(0);
    setPreviewStack((prev) => [
      ...prev,
      { product: item, selectedId: item.options[0]?.id ?? "" },
    ]);
    recordRecentView(item.key);
    void logProductPreviewOnce(item.key);
    onProductClick?.(item);
  }

  function goBackPreview() {
    if (!canGoBack) return;
    setActiveIndex(0);
    setIssueOpen(false);
    setIssueIndex(0);
    setPreviewStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }

  function step(delta: number) {
    if (previewImages.length <= 1) return;
    setActiveIndex(
      (prev) => (prev + delta + previewImages.length) % previewImages.length,
    );
  }

  function openIssuePhotos() {
    if (!issueImages.length) return;
    setIssueIndex(0);
    setIssueOpen(true);
  }

  function stepIssue(delta: number) {
    if (issueImages.length <= 1) return;
    setIssueIndex(
      (prev) => (prev + delta + issueImages.length) % issueImages.length,
    );
  }

  function renderPortal(content: React.ReactNode) {
    if (typeof document === "undefined") return null;
    return createPortal(content, document.body);
  }

  function handleTouchStart(
    event: React.TouchEvent,
    startX: React.MutableRefObject<number | null>,
    startY: React.MutableRefObject<number | null>,
  ) {
    const touch = event.touches[0];
    startX.current = touch?.clientX ?? null;
    startY.current = touch?.clientY ?? null;
  }

  function handleTouchEnd(
    event: React.TouchEvent,
    startX: React.MutableRefObject<number | null>,
    startY: React.MutableRefObject<number | null>,
    onSwipe: (delta: number) => void,
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
      <div
        ref={cardRef}
        className="rounded-xl sm:rounded-2xl overflow-hidden bg-bg-900/70 dark:bg-paper/5 border border-white/20 dark:border-white/10 shadow-sm"
      >
        <button
          type="button"
          onClick={() => {
            if (onImageClick) {
              onProductClick?.(product);
              onImageClick(product, cardImage);
              return;
            }
            openPreview();
          }}
          className="relative aspect-[4/3] w-full overflow-hidden bg-black/10 flex items-center justify-center"
          aria-label={`Preview ${product.title}`}
        >
          {parsedCardImage ? (
            <div className="h-full w-full bg-neutral-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={parsedCardImage.src}
                alt={product.title}
                className="h-full w-full object-contain"
                style={cropStyle(parsedCardImage.crop)}
              />
            </div>
          ) : (
            <div className="text-white/50 text-sm">No image</div>
          )}
          {hasSale ? (
            <span className="absolute left-2 top-2 rounded-full border border-rose-300/60 bg-rose-500/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
              On Sale
            </span>
          ) : null}
        </button>

        <div className="p-3 sm:p-4">
          <button
            type="button"
            onClick={openPreview}
            className="min-h-[2.8rem] text-left text-sm leading-snug sm:min-h-[3.2rem] sm:text-base text-white font-semibold line-clamp-2"
          >
            {product.title}
          </button>

          <div className="mt-2 sm:mt-3 flex min-h-[1.4rem] items-center justify-between gap-2">
            <div className="text-price text-sm sm:text-base whitespace-nowrap">
              {strikePrice ? (
                <div className="flex items-baseline gap-2">
                  <span>{displayPrice}</span>
                  <span className="text-[11px] text-white/40 line-through">
                    {strikePrice}
                  </span>
                </div>
              ) : (
                displayPrice
              )}
            </div>
            <div className="min-w-0 text-right text-[11px] sm:text-xs text-white/60 truncate">
              {conditionLabel}
            </div>
          </div>

          <div className="mt-2 sm:mt-3">
            <div className="min-h-[1.2rem]">
              {onlyOneLeft ? (
                <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200">
                  Only 1 left
                </span>
              ) : lowStock ? (
                <div className="text-[11px] sm:text-xs font-semibold text-amber-700 dark:text-amber-200/90">
                  Almost sold out.
                </div>
              ) : primaryProof ? (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-bg-900/60 px-2 py-0.5 text-[11px] sm:text-xs text-white/60">
                  {primaryProof}
                </span>
              ) : (
                <span className="invisible text-[11px] sm:text-xs">placeholder</span>
              )}
            </div>
          </div>

          <div className="mt-2 sm:mt-3 space-y-2">
            <div className="flex min-h-[2rem] flex-nowrap gap-2 overflow-x-auto pb-0.5">
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
                                  {formatConditionLabel(o.condition, {
                                    upper: true,
                                    shipClass: o.ship_class,
                                  })}
                  </button>
                );
              })}
            </div>

            <button
              className="w-full rounded-xl px-3 py-2.5 text-sm sm:px-4 sm:py-2 bg-amber-600 hover:bg-amber-500 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
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

      {isOpen
        ? renderPortal(
            <div className="fixed inset-0 z-50 flex items-start justify-center px-3 py-4 sm:items-center sm:px-4 sm:py-6">
              <button
                type="button"
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={closePreview}
                aria-label="Close preview"
              />
              <div
                role="dialog"
                aria-modal="true"
                className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-bg-900/95 shadow-soft"
              >
                <div
                  ref={previewScrollRef}
                  className="max-h-[85vh] overflow-y-auto sm:max-h-[90vh]"
                >
                  <div className="sticky top-0 z-10 border-b border-white/10 bg-bg-900/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        {canGoBack ? (
                          <button
                            type="button"
                            onClick={goBackPreview}
                            className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-bg-950/40 px-2.5 py-2 text-sm text-white/80 hover:bg-bg-950/60"
                            aria-label="Back to previous item"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Back
                          </button>
                        ) : null}
                        <div className="min-w-0">
                          <div className="text-xs text-white/50">
                            {formatTitle("Item preview")}
                          </div>
                          <div className="text-base font-semibold leading-snug line-clamp-3 sm:line-clamp-2 sm:text-lg">
                            {previewProduct.title}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={closePreview}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-sm text-white/80 hover:bg-bg-950/60"
                      >
                        <X className="h-4 w-4" />
                        Close
                      </button>
                    </div>
                  </div>

                  <div className="p-4 pb-20 sm:p-5 sm:pb-5">
                    <div className="mb-3 flex items-center gap-2 text-[11px] text-white/50 sm:hidden">
                      <ChevronDown className="h-4 w-4 text-white/40" />
                      <span>Scroll down for details and suggestions</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
                      <div
                        className="group relative overflow-hidden rounded-xl border border-white/10 bg-bg-950/50"
                        onTouchStart={(event) =>
                          handleTouchStart(event, touchStartX, touchStartY)
                        }
                        onTouchEnd={(event) =>
                          handleTouchEnd(event, touchStartX, touchStartY, step)
                        }
                      >
                        {activeImage ? (
                          <div className="aspect-[4/3] w-full bg-neutral-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={activeImage}
                              alt=""
                              className="h-full w-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="flex aspect-[4/3] w-full items-center justify-center text-sm text-white/50">
                            No image available.
                          </div>
                        )}
                        {previewImages.length > 1 ? (
                          <>
                            <button
                              type="button"
                              onClick={() => step(-1)}
                              className="absolute inset-y-0 left-0 w-1/2"
                              aria-label="Previous photo"
                            />
                            <button
                              type="button"
                              onClick={() => step(1)}
                              className="absolute inset-y-0 right-0 w-1/2"
                              aria-label="Next photo"
                            />
                            <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/80">
                              {activeIndex + 1}/{previewImages.length}
                            </div>
                          </>
                        ) : null}
                      </div>

                      <div className="space-y-3">
                        <div className="rounded-xl border border-white/10 bg-bg-950/40 p-3 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-white/60">
                              Selected condition
                            </span>
                            <span className="text-white/90">
                              {previewSelected?.condition ?? "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-white/60">Price</span>
                            <span className="text-price">
                              {previewStrikePrice ? (
                                <span className="flex items-baseline gap-2">
                                  <span>{previewDisplayPrice}</span>
                                  <span className="text-[11px] text-white/40 line-through">
                                    {previewStrikePrice}
                                  </span>
                                </span>
                              ) : (
                                previewDisplayPrice
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-white/60">Available</span>
                            <span className="text-white/80">
                              {previewSelected?.qty ?? 0} left
                            </span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-bg-950/40 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                            Conditions
                          </div>
                          <div className="mt-2 space-y-2 text-sm">
                            {previewProduct.options.map((o) => {
                              const isSelected = o.id === previewSelected?.id;
                              const pricing = getOptionPricing(o);
                              const displayPrice = peso(pricing.effectivePrice);
                              const strikePrice = pricing.hasSale
                                ? peso(o.price)
                                : null;
                              return (
                                <div
                                  key={o.id}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <span
                                    className={
                                      isSelected
                                        ? "text-white"
                                        : "text-white/70"
                                    }
                                  >
                                    {o.condition}
                                  </span>
                                  <span
                                    className={
                                      isSelected
                                        ? "text-white/90"
                                        : "text-white/60"
                                    }
                                  >
                                    {strikePrice ? (
                                      <span className="flex items-baseline gap-2">
                                        <span>{displayPrice}</span>
                                        <span className="text-[10px] text-white/40 line-through">
                                          {strikePrice}
                                        </span>
                                      </span>
                                    ) : (
                                      displayPrice
                                    )}{" "}
                                    - {o.qty} left
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
                          <div className={`mt-2 text-sm ${noteTone} flex items-center gap-2`}>
                            {showNoteIndicator ? (
                              <span
                                className={`h-2 w-2 rounded-full ${noteIndicatorTone}`}
                                aria-hidden="true"
                              />
                            ) : null}
                            <span>
                              {unifiedNotes
                                ? unifiedNotes
                                : "No notes for this item."}
                            </span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
                          Photos are for reference only. For more
                          photos/details, please message our Facebook page.
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
                            const defaultOption = item.options[0];
                            const canAdd = Boolean(
                              onRelatedAddToCart &&
                              defaultOption &&
                              defaultOption.qty > 0,
                            );
                            return (
                              <div
                                key={item.key}
                                onClick={() => pushPreview(item)}
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    pushPreview(item);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                className="min-w-[160px] rounded-xl border border-white/10 bg-bg-950/40 p-2 hover:border-white/20 hover:bg-bg-950/60"
                                aria-label={`Preview ${item.title}`}
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
                                <div className="mt-2 flex items-center justify-between text-[11px]">
                                  <span className="text-price">
                                    {defaultOption
                                      ? peso(defaultOption.price)
                                      : "-"}
                                  </span>
                                  {canAdd ? (
                                    <button
                                      type="button"
                                      className="rounded-full border border-white/10 bg-black/50 px-2 py-0.5 text-[10px] text-white/80 hover:bg-black/70"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (defaultOption) {
                                          onRelatedAddToCart?.(
                                            item,
                                            defaultOption,
                                          );
                                        }
                                      }}
                                    >
                                      Add to cart
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="sticky bottom-0 z-10 border-t border-white/10 bg-bg-900/95 px-4 py-3 backdrop-blur sm:hidden">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] text-white/50">
                          Selected
                        </div>
                        <div className="text-sm text-white/80 line-clamp-1">
                          {previewSelected?.condition ?? "-"}
                        </div>
                      </div>
                      <div className="text-price text-sm whitespace-nowrap">
                        {previewStrikePrice ? (
                          <span className="flex items-baseline gap-2">
                            <span>{previewDisplayPrice}</span>
                            <span className="text-[10px] text-white/40 line-through">
                              {previewStrikePrice}
                            </span>
                          </span>
                        ) : (
                          previewDisplayPrice
                        )}
                      </div>
                      <button
                        type="button"
                        className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                        disabled={previewIsOut}
                        onClick={() => previewSelected && onAddToCart(previewSelected)}
                      >
                        Add to cart
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
          )
        : null}

      {issueOpen
        ? renderPortal(
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
                        <div className="text-xs text-white/50">
                          Issue photos
                        </div>
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
                      className="group relative overflow-hidden rounded-xl border border-white/10 bg-bg-950/50"
                      onTouchStart={(event) =>
                        handleTouchStart(
                          event,
                          issueTouchStartX,
                          issueTouchStartY,
                        )
                      }
                      onTouchEnd={(event) =>
                        handleTouchEnd(
                          event,
                          issueTouchStartX,
                          issueTouchStartY,
                          stepIssue,
                        )
                      }
                    >
                      {activeIssueImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={activeIssueImage}
                          alt="Issue photo"
                          className="h-72 w-full object-contain bg-neutral-50"
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
                            className="absolute inset-y-0 left-0 w-1/2"
                            aria-label="Previous issue photo"
                          />
                          <button
                            type="button"
                            onClick={() => stepIssue(1)}
                            className="absolute inset-y-0 right-0 w-1/2"
                            aria-label="Next issue photo"
                          />
                          <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/80">
                            {issueIndex + 1}/{issueImages.length}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
          )
        : null}
    </>
  );
}
