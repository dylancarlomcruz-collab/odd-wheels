"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ShoppingCart, X } from "lucide-react";
import { recordRecentView } from "@/lib/recentViews";
import { normalizeSearchTerm } from "@/lib/search";
import { formatConditionLabel } from "@/lib/conditions";
import { cropStyle, parseImageCrop } from "@/lib/imageCrop";
import { applyImageFallback, buildSrcSet, getOptimizedImageUrl } from "@/lib/imageUrl";
import { getOptionPricing, getProductEffectiveRange } from "@/lib/pricing";
import {
  getProductSpecialTagLabel,
  getProductSpecialTagStyle,
  normalizeProductSpecialTags,
  type ProductSpecialTag,
} from "@/lib/productTags";
import { formatTitle } from "@/lib/text";
import { supabase } from "@/lib/supabase/browser";
import { getOrCreateGuestSessionId } from "@/lib/guestSession";

type ConditionOption = {
  id: string; // this is the PRODUCT ROW ID for that condition
  condition_raw?: string | null;
  condition: string;
  barcode?: string | null;
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

const COMPACT_CONDITION_LABELS: Record<string, string> = {
  sealed: "SEALED",
  resealed: "RESEAL",
  near_mint: "NEAR MINT",
  unsealed: "UNSEAL",
  with_issues: "ISSUES",
  sealed_blister: "BLISTER",
  unsealed_blister: "BLISTER",
  blistered: "BLISTER",
};
const SUPABASE_PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function getCompactConditionLabel(
  value: string | null | undefined,
  _shipClass?: string | null
) {
  const key = String(value ?? "").toLowerCase();
  const label =
    COMPACT_CONDITION_LABELS[key] ?? String(value ?? "-").toUpperCase();
  return label;
}

function normalizeImageUrl(raw: string | null | undefined) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = SUPABASE_PUBLIC_URL.replace(/\/$/, "");
  if (!base) return trimmed;
  if (trimmed.startsWith("/storage/") || trimmed.startsWith("storage/")) {
    const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return `${base}${path}`;
  }
  return trimmed;
}


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
  special_tags?: ProductSpecialTag[] | null;
  socialProof?: SocialProof;
  searchScore?: number;
  popularityScore?: number;
};

type FeatureTag = {
  key: ProductSpecialTag;
  label: string;
  toneClass: string;
};

const FEATURE_TAG_BASE_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border font-black uppercase text-white ring-1 ring-inset ring-white/15 backdrop-blur-sm";

function getFeatureTags(product: ShopProduct): FeatureTag[] {
  return normalizeProductSpecialTags(product.special_tags).map((key) => ({
    key,
    label: getProductSpecialTagLabel(key),
    toneClass: getProductSpecialTagStyle(key).displayClassName,
  }));
}

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
  wideView = false,
  mobileVariant,
  primaryActionLabel = "Add",
  primaryActionLabelLong,
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
  wideView?: boolean;
  mobileVariant?: "diecast";
  primaryActionLabel?: string;
  primaryActionLabelLong?: string;
}) {
  const actionLabelCompact = primaryActionLabel?.trim() || "Add";
  const actionLabelExpanded =
    primaryActionLabelLong?.trim() ||
    (actionLabelCompact.toLowerCase() === "add"
      ? "Add to cart"
      : actionLabelCompact);
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
  const [variantPickerOpen, setVariantPickerOpen] = React.useState(false);
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
  const displayTitle = formatTitle(product.title) || product.title;
  const previewDisplayTitle = formatTitle(previewProduct.title) || previewProduct.title;
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
    const raw = (product.image_urls ?? [])
      .map(normalizeImageUrl)
      .filter(Boolean) as string[];
    const list = raw.length ? raw.slice() : [];
    const primary = normalizeImageUrl(product.image_url);
    if (primary) {
      const primaryBase = parseImageCrop(primary).src;
      const hasMatch = list.some(
        (url) => parseImageCrop(url).src === primaryBase
      );
      if (!hasMatch) {
        list.push(primary);
      }
    }
    return list;
  }, [product.image_url, product.image_urls]);

  const previewImages = React.useMemo(() => {
    const raw = (previewProduct.image_urls ?? [])
      .map(normalizeImageUrl)
      .filter(Boolean) as string[];
    const list = raw.length ? raw.slice() : [];
    const primary = normalizeImageUrl(previewProduct.image_url);
    if (primary) {
      const primaryBase = parseImageCrop(primary).src;
      const hasMatch = list.some(
        (url) => parseImageCrop(url).src === primaryBase
      );
      if (!hasMatch) {
        list.push(primary);
      }
    }
    return list;
  }, [previewProduct.image_url, previewProduct.image_urls]);

  const issueImages = React.useMemo(
    () =>
      (selected?.issue_photo_urls ?? [])
        .map(normalizeImageUrl)
        .filter(Boolean) as string[],
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
  const hasMultipleVariants = product.options.length > 1;
  const variantCount = product.options.length;
  const wideDisplayPrice = hasMultipleVariants
    ? peso(effectiveMinPrice)
    : displayPrice;
  const wideStrikePrice = hasMultipleVariants ? null : strikePrice;
  const activeImage = previewImages[activeIndex] ?? "";
  const cardImage = cardImages[0] ?? normalizeImageUrl(product.image_url) ?? null;
  const parsedCardImage = React.useMemo(
    () => (cardImage ? parseImageCrop(cardImage) : null),
    [cardImage]
  );
  const cardImageSrc = React.useMemo(
    () =>
      parsedCardImage
        ? getOptimizedImageUrl(parsedCardImage.src, {
            width: 480,
            quality: 100,
            format: "webp",
          })
        : "",
    [parsedCardImage]
  );
  const cardImageSrcSet = React.useMemo(
    () =>
      parsedCardImage
        ? buildSrcSet(parsedCardImage.src, [200, 320, 480], {
            quality: 100,
            format: "webp",
          })
        : "",
    [parsedCardImage]
  );
  const cardImageFinalSrc = cardImageSrc || parsedCardImage?.src || "";
  const cardImageFinalSrcSet = cardImageSrcSet || undefined;
  const activeImageSrc = React.useMemo(
    () =>
      activeImage
        ? getOptimizedImageUrl(activeImage, {
            width: 1200,
            quality: 75,
            format: "webp",
          })
        : "",
    [activeImage]
  );
  const activeImageSrcSet = React.useMemo(
    () =>
      activeImage
        ? buildSrcSet(activeImage, [480, 720, 960, 1200], {
            quality: 75,
            format: "webp",
          })
        : "",
    [activeImage]
  );
  const activeIssueImage = issueImages[issueIndex] ?? "";
  const activeIssueImageSrc = React.useMemo(
    () =>
      activeIssueImage
        ? getOptimizedImageUrl(activeIssueImage, {
            width: 1200,
            quality: 75,
            format: "webp",
          })
        : "",
    [activeIssueImage]
  );
  const activeIssueImageSrcSet = React.useMemo(
    () =>
      activeIssueImage
        ? buildSrcSet(activeIssueImage, [480, 720, 960, 1200], {
            quality: 75,
            format: "webp",
          })
        : "",
    [activeIssueImage]
  );
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
  });
  const compactConditionLabel = getCompactConditionLabel(
    selected?.condition ?? "-",
    selected?.ship_class
  );
  const wideVariantLabel = hasMultipleVariants
    ? `${variantCount} variants`
    : compactConditionLabel;
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
  const showMobileDiecast = mobileVariant === "diecast";
  const collectionLabel = (() => {
    const brand = String(product.brand ?? "").trim();
    if (!brand) return "DIECAST COLLECTION";
    return `${brand.toUpperCase()} COLLECTION`;
  })();
  const featureTags = React.useMemo(() => getFeatureTags(product), [product]);
  const visibleFeatureTags = React.useMemo(
    () => featureTags.slice(0, 2),
    [featureTags]
  );
  const mobilePrimaryImage = cardImages[0] ?? null;
  const parsedMobilePrimaryImage = React.useMemo(
    () => (mobilePrimaryImage ? parseImageCrop(mobilePrimaryImage) : null),
    [mobilePrimaryImage]
  );
  const mobilePrimarySrc = React.useMemo(
    () =>
      parsedMobilePrimaryImage
        ? getOptimizedImageUrl(parsedMobilePrimaryImage.src, {
            width: 480,
            quality: 100,
            format: "webp",
          })
        : "",
    [parsedMobilePrimaryImage]
  );
  const mobilePrimarySrcSet = React.useMemo(
    () =>
      parsedMobilePrimaryImage
        ? buildSrcSet(parsedMobilePrimaryImage.src, [200, 320, 480], {
            quality: 100,
            format: "webp",
          })
        : "",
    [parsedMobilePrimaryImage]
  );

  function renderFeatureTagOverlay(mode: "mobile" | "desktop") {
    if (!visibleFeatureTags.length) return null;

    const stackClassName =
      mode === "mobile"
        ? "absolute left-3 top-3 z-10 flex max-w-[76%] flex-col items-start gap-2"
        : wideView
          ? "absolute left-2 top-2 z-10 flex max-w-[78%] flex-col items-start gap-1.5"
          : "absolute left-3 top-3 z-10 flex max-w-[74%] flex-col items-start gap-2";
    const badgeClassName =
      mode === "mobile"
        ? "px-3 py-1.5 text-[10px] leading-none tracking-[0.18em]"
        : wideView
          ? "px-2.5 py-1.5 text-[9px] leading-none tracking-[0.14em]"
          : "px-3 py-1.5 text-[10px] leading-none tracking-[0.16em] sm:px-3.5 sm:py-2 sm:text-[11px]";
    const dotClassName =
      mode === "mobile"
        ? "h-2 w-2"
        : wideView
          ? "h-1.5 w-1.5"
          : "h-2 w-2";

    return (
      <div className={stackClassName}>
        {visibleFeatureTags.map((tag) => (
          <span
            key={tag.key}
            className={[FEATURE_TAG_BASE_CLASS, badgeClassName, tag.toneClass].join(
              " "
            )}
          >
            <span
              className={[
                dotClassName,
                "rounded-full bg-white/95 shadow-[0_0_0_1px_rgba(255,255,255,0.42)]",
              ].join(" ")}
            />
            {tag.label}
          </span>
        ))}
      </div>
    );
  }

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

  // Preview/view events are only recorded on explicit user clicks (openPreview/pushPreview).

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
      const sessionId = getOrCreateGuestSessionId();
      await supabase.rpc("increment_product_click_detailed", {
        p_product_id: productId,
        p_session_id: sessionId,
      });
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

  function handleAddClick(event?: React.MouseEvent) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (hasMultipleVariants) {
      setVariantPickerOpen(true);
      return;
    }
    if (selected) {
      void onAddToCart(selected);
    }
  }

  function closeVariantPicker() {
    setVariantPickerOpen(false);
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

  const previewPortal = isOpen
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
                      <div className="text-xs text-white/50">Preview</div>
                      <div className="text-base font-semibold leading-snug line-clamp-2 sm:text-lg">
                        {previewDisplayTitle}
                      </div>
                      <div className="text-xs text-white/60 sm:text-sm">
                        {previewProduct.brand ?? "-"}
                        {previewProduct.model
                          ? ` · ${previewProduct.model}`
                          : ""}
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

              <div className="p-4 sm:p-5">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div>
                    <div
                      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-bg-950/40"
                      onTouchStart={(event) =>
                        handleTouchStart(event, touchStartX, touchStartY)
                      }
                      onTouchEnd={(event) =>
                        handleTouchEnd(event, touchStartX, touchStartY, step)
                      }
                    >
                      {activeImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={activeImageSrc || activeImage}
                          srcSet={activeImageSrcSet || undefined}
                          sizes="(min-width: 1024px) 720px, 90vw"
                          alt={previewDisplayTitle}
                          className="h-80 w-full object-contain bg-neutral-50"
                          loading="lazy"
                          decoding="async"
                          onError={(e) =>
                            applyImageFallback(e.currentTarget, activeImage)
                          }
                        />
                      ) : (
                        <div className="flex h-80 items-center justify-center text-sm text-white/50">
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

                    {hasIssuePhotos ? (
                      <button
                        type="button"
                        onClick={openIssuePhotos}
                        className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
                      >
                        View issue photos
                      </button>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/10 bg-bg-950/40 p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/60">Selected condition</span>
                        <span className="text-white/90">
                          {formatConditionLabel(previewSelected?.condition ?? "-", {
                            upper: true,
                          })}
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
                                  isSelected ? "text-white" : "text-white/70"
                                }
                              >
                                {o.condition}
                              </span>
                              <span
                                className={
                                  isSelected ? "text-white/90" : "text-white/60"
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
                      <div
                        className={`mt-2 text-sm ${noteTone} flex items-center gap-2`}
                      >
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
                        const image = normalizeImageUrl(
                          item.image_url ?? item.image_urls?.[0] ?? null
                        );
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
                              if (event.key === "Enter" || event.key === " ") {
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
                                  src={
                                    image
                                      ? getOptimizedImageUrl(image, {
                                          width: 320,
                                          quality: 70,
                                          format: "webp",
                                        })
                                      : ""
                                  }
                                  srcSet={
                                    image
                                      ? buildSrcSet(
                                          image,
                                          [160, 240, 320],
                                          {
                                            quality: 70,
                                            format: "webp",
                                          },
                                        )
                                      : undefined
                                  }
                                  sizes="160px"
                                  alt=""
                                  className="h-full w-full object-contain bg-neutral-50"
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) =>
                                    image
                                      ? applyImageFallback(
                                          e.currentTarget,
                                          image,
                                        )
                                      : undefined
                                  }
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
                                {defaultOption ? peso(defaultOption.price) : "-"}
                              </span>
                              {canAdd ? (
                                <button
                                  type="button"
                                  className="rounded-full border border-white/10 bg-black/50 px-2 py-0.5 text-[10px] text-white/80 hover:bg-black/70"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (defaultOption) {
                                      onRelatedAddToCart?.(item, defaultOption);
                                    }
                                  }}
                                >
                                  {actionLabelExpanded}
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
                    <div className="text-[11px] text-white/50">Selected</div>
                    <div className="text-sm text-white/80 line-clamp-1">
                      {formatConditionLabel(previewSelected?.condition ?? "-", {
                        upper: true,
                      })}
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
                    {actionLabelExpanded}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
      )
    : null;

  const issuePortal = issueOpen
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
                    <div className="text-xs text-white/50">Issue photos</div>
                    <div className="text-base font-semibold leading-snug line-clamp-2 sm:text-lg">
                      {displayTitle}
                    </div>
                    <div className="text-xs text-white/60 sm:text-sm">
                      {formatConditionLabel(selected?.condition ?? "-", {
                        upper: true,
                      })}
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
                    handleTouchStart(event, issueTouchStartX, issueTouchStartY)
                  }
                  onTouchEnd={(event) =>
                    handleTouchEnd(event, issueTouchStartX, issueTouchStartY, stepIssue)
                  }
                >
                  {activeIssueImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeIssueImageSrc || activeIssueImage}
                      srcSet={activeIssueImageSrcSet || undefined}
                      sizes="(min-width: 1024px) 720px, 90vw"
                      alt="Issue photo"
                      className="h-72 w-full object-contain bg-neutral-50"
                      loading="lazy"
                      decoding="async"
                      onError={(e) =>
                        applyImageFallback(e.currentTarget, activeIssueImage)
                      }
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
    : null;

  const variantPickerPortal = variantPickerOpen
    ? renderPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center px-3 py-4 sm:items-center sm:px-4 sm:py-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeVariantPicker}
            aria-label="Close variant picker"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-bg-900/95 shadow-soft"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/50">
                  Choose variant
                </div>
                <div className="text-sm font-semibold text-white">
                  {displayTitle}
                </div>
              </div>
              <button
                type="button"
                onClick={closeVariantPicker}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-bg-950/40 text-white/70 hover:bg-bg-950/60"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-4 py-4 space-y-2">
              {product.options.map((o) => {
                const isSelected = o.id === selectedId;
                const pricing = getOptionPricing(o);
                const displayPrice = peso(pricing.effectivePrice);
                const strike = pricing.hasSale ? peso(o.price) : null;
                const out = (o.qty ?? 0) <= 0;
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={out}
                    onClick={() => setSelectedId(o.id)}
                    className={[
                      "w-full rounded-xl border px-3 py-2 text-left transition",
                      isSelected
                        ? "border-amber-300/60 bg-amber-400/15 text-white"
                        : "border-white/10 bg-bg-950/40 text-white/80 hover:bg-bg-950/60",
                      out ? "opacity-50 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">
                          {formatConditionLabel(o.condition, {
                            upper: true,
                            shipClass: o.ship_class,
                          })}
                        </div>
                        <div className="text-xs text-white/50">
                          {out ? "Out of stock" : `${o.qty} left`}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="text-price">{displayPrice}</div>
                        {strike ? (
                          <div className="text-[10px] text-white/40 line-through">
                            {strike}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="px-4 pb-4">
              <button
                type="button"
                className="w-full rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50 inline-flex items-center justify-center gap-2"
                disabled={!selected || (selected.qty ?? 0) <= 0}
                onClick={() => {
                  if (selected) {
                    void onAddToCart(selected);
                  }
                  closeVariantPicker();
                }}
              >
                <ShoppingCart className="h-4 w-4" />
                {actionLabelExpanded}
              </button>
            </div>
          </div>
        </div>
      )
    : null;

  const mobileCard = (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (onImageClick) {
          onProductClick?.(product);
          onImageClick(product, cardImage);
          return;
        }
        openPreview();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (onImageClick) {
            onProductClick?.(product);
            onImageClick(product, cardImage);
            return;
          }
          openPreview();
        }
      }}
      className="group relative w-full text-left"
      aria-label={`Preview ${displayTitle}`}
    >
      <div className="relative overflow-hidden rounded-[28px] border border-amber-300/30 bg-[#0f1016] px-4 pb-4 pt-4 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
        <div className="absolute inset-0 bg-[radial-gradient(140px_140px_at_85%_10%,rgba(255,176,90,0.28),transparent_65%),radial-gradient(200px_200px_at_15%_85%,rgba(255,210,140,0.16),transparent_70%),linear-gradient(180deg,#0f1016,#171826)]" />
        <div className="absolute inset-0 opacity-35 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.06),transparent_35%),radial-gradient(circle_at_85%_30%,rgba(255,255,255,0.05),transparent_35%),radial-gradient(circle_at_60%_80%,rgba(255,255,255,0.04),transparent_40%)]" />
        <div className="relative z-10 flex flex-col">
          <div className="text-center text-[11px] font-extrabold tracking-[0.28em] text-amber-300/90 uppercase mb-2 drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)]">
            {String(product.brand ?? "Mini GT").toUpperCase()}
          </div>
          <div className="mb-2 rounded-2xl border border-white/30 bg-[#fffdf8] shadow-[0_12px_25px_rgba(0,0,0,0.18)] overflow-hidden">
            <div className="relative aspect-[4/3] w-full overflow-hidden">
              {renderFeatureTagOverlay("mobile")}
              {mobilePrimaryImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mobilePrimarySrc || mobilePrimaryImage}
                  srcSet={mobilePrimarySrcSet}
                  sizes="90vw"
                  alt={displayTitle}
                  className="h-full w-full object-cover object-center"
                  style={cropStyle(parsedMobilePrimaryImage?.crop)}
                  loading="eager"
                  decoding="async"
                  onError={(e) =>
                    applyImageFallback(e.currentTarget, mobilePrimaryImage)
                  }
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                  No image
                </div>
              )}
            </div>
          </div>

          <div className="mt-1 text-[13px] font-medium leading-snug text-white/90 tracking-tight line-clamp-2">
            {displayTitle}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <span className="rounded-full border border-amber-300/60 bg-amber-400/10 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-teal-200 shadow-[0_6px_12px_rgba(0,0,0,0.25)]">
              {compactConditionLabel}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddClick}
                aria-label={actionLabelExpanded}
                disabled={!hasMultipleVariants && isOut}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/40 bg-amber-500/20 text-amber-200 shadow-[0_6px_12px_rgba(0,0,0,0.3)] hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShoppingCart className="h-4 w-4" />
              </button>
              <div className="text-right">
                <div className="text-2xl font-extrabold tracking-wide text-amber-300 drop-shadow-[0_2px_10px_rgba(255,180,80,0.35)]">
                  {displayPrice}
                </div>
                {strikePrice ? (
                  <div className="text-[10px] text-white/40 line-through">
                    {strikePrice}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const desktopCard = (
    <div className="rounded-xl sm:rounded-2xl overflow-hidden bg-bg-900/70 dark:bg-paper/5 border border-white/20 dark:border-white/10 shadow-sm">
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
          aria-label={`Preview ${displayTitle}`}
        >
          {parsedCardImage ? (
            <div className="h-full w-full bg-neutral-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cardImageFinalSrc}
                srcSet={cardImageFinalSrcSet}
                sizes="(min-width: 1024px) 240px, (min-width: 640px) 200px, 45vw"
                alt={displayTitle}
                className="h-full w-full object-contain"
                style={cropStyle(parsedCardImage?.crop)}
                loading="eager"
                decoding="async"
                onError={(e) =>
                  applyImageFallback(e.currentTarget, parsedCardImage.src)
                }
              />
            </div>
          ) : (
            <div className="text-white/50 text-sm">No image</div>
          )}
          {hasSale ? (
            <span className="absolute left-2 top-2 rounded-full border border-rose-300/60 bg-rose-500/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow sm:px-2 sm:text-[10px]">
              On Sale
            </span>
          ) : null}
          {renderFeatureTagOverlay("desktop")}
        </button>

        <div className="p-2.5 sm:p-4">
          <button
            type="button"
            onClick={openPreview}
            className={
              wideView
                ? "min-h-[1.9rem] max-h-[1.9rem] text-left text-[10px] leading-snug text-white font-semibold line-clamp-2 overflow-hidden sm:min-h-[2.3rem] sm:max-h-[2.3rem] sm:text-xs"
                : "min-h-[3rem] text-left text-base leading-normal text-white font-semibold line-clamp-2 sm:min-h-[3.5rem] sm:text-lg"
            }
          >
            {displayTitle}
          </button>

          <div
            className={[
              "flex min-h-[1.2rem] items-center justify-between gap-2",
              wideView ? "mt-1" : "mt-1.5 sm:mt-3",
            ].join(" ")}
          >
            <div className="text-price text-[13px] sm:text-base whitespace-nowrap">
              {wideView ? (
                wideStrikePrice ? (
                  <div className="flex items-baseline gap-2">
                    <span>{wideDisplayPrice}</span>
                    <span className="text-[10px] text-white/40 line-through">
                      {wideStrikePrice}
                    </span>
                  </div>
                ) : (
                  wideDisplayPrice
                )
              ) : strikePrice ? (
                <div className="flex items-baseline gap-2">
                  <span>{displayPrice}</span>
                  <span className="text-[10px] text-white/40 line-through">
                    {strikePrice}
                  </span>
                </div>
              ) : (
                displayPrice
              )}
            </div>
            {!wideView ? (
              <div className="min-w-0 text-right text-[10px] text-white/60 truncate sm:text-xs">
                <span className="sm:hidden">{compactConditionLabel}</span>
                <span className="hidden sm:inline">{conditionLabel}</span>
              </div>
            ) : null}
          </div>

          {!wideView ? (
            <div className="mt-1.5 sm:mt-3">
              <div className="min-h-[1rem]">
                {onlyOneLeft ? (
                  <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200 sm:px-2 sm:text-[10px]">
                    <span className="sm:hidden">1 left</span>
                    <span className="hidden sm:inline">Only 1 left</span>
                  </span>
                ) : lowStock ? (
                  <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-200/90 sm:text-xs">
                    <span className="sm:hidden">Low stock</span>
                    <span className="hidden sm:inline">Almost sold out.</span>
                  </div>
                ) : primaryProof ? (
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-bg-900/60 px-1.5 py-0.5 text-[10px] text-white/60 sm:px-2 sm:text-xs">
                    {primaryProof}
                  </span>
                ) : (
                  <span className="invisible text-[11px] sm:text-xs">placeholder</span>
                )}
              </div>
            </div>
          ) : null}

          <div
            className={[
              "space-y-2",
              wideView ? "mt-1 space-y-1" : "mt-1.5 sm:mt-3",
            ].join(" ")}
          >
            {wideView ? (
              <div className="flex items-center justify-between rounded-full border border-white/10 bg-bg-900/60 px-2 py-1 text-[9px] uppercase tracking-wide text-white/70">
                <span className="truncate">{wideVariantLabel}</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
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
                        "rounded-full border px-1.5 py-0.5 text-[9px] leading-none sm:px-2 sm:py-0.5 sm:text-[10px] transition",
                        isSelected
                          ? "bg-sky-200 text-sky-900 border-sky-300 dark:bg-sky-500/20 dark:text-sky-100 dark:border-sky-400/40"
                          : "border-white/20 bg-bg-900/60 text-white/80 hover:bg-bg-900/80 dark:border-white/10 dark:bg-paper/5 dark:text-white/70 dark:hover:bg-paper/10",
                      ].join(" ")}
                    >
                      <span className="sm:hidden">
                        {getCompactConditionLabel(o.condition, o.ship_class)}
                      </span>
                      <span className="hidden sm:inline">
                        {formatConditionLabel(o.condition, {
                          upper: true,
                          shipClass: o.ship_class,
                        })}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              className="w-full rounded-xl px-3 py-2 text-[12px] font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-2 sm:text-sm bg-amber-600 hover:bg-amber-500"
              disabled={isOut}
              onClick={handleAddClick}
            >
              {actionLabelCompact}
            </button>

            {!wideView && hasIssuePhotos ? (
              <button
                type="button"
                onClick={openIssuePhotos}
                className="w-full rounded-xl border border-white/10 px-3 py-1.5 text-[11px] sm:text-xs text-white/80 hover:bg-white/10"
              >
                Show issue photos
              </button>
            ) : null}
          </div>

          {!wideView && isOut ? (
            <div className="mt-2 text-[11px] sm:text-xs text-red-300">
              Selected condition is out of stock.
            </div>
          ) : null}
        </div>
      </div>
  );

  return (
    <>
      <div ref={cardRef} className={showMobileDiecast ? "w-full" : ""}>
        {showMobileDiecast ? (
          <>
            <div className="sm:hidden">{mobileCard}</div>
            <div className="hidden sm:block">{desktopCard}</div>
          </>
        ) : (
          desktopCard
        )}
      </div>
      {previewPortal}
      {issuePortal}
      {variantPickerPortal}
    </>
  );
}
