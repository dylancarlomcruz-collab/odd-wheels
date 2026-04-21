"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Share2,
  ShoppingCart,
  X,
} from "lucide-react";
import type { ShopProduct } from "@/components/ProductCard";
import { toast } from "@/components/ui/toast";
import { useCart } from "@/hooks/useCart";
import {
  useProductDetail,
  type ProductDetail,
  type Variant,
} from "@/hooks/useProductDetail";
import {
  getAbsoluteProductPageUrl,
  getProductPageHref,
  getRelatedProducts,
  normalizeProductImageUrl,
} from "@/lib/productDetail";
import { recordRecentView } from "@/lib/recentViews";
import { supabase } from "@/lib/supabase/browser";
import { getOrCreateGuestSessionId } from "@/lib/guestSession";
import { collapseVariants, type VariantRow } from "@/lib/shopProducts";
import { formatTitle } from "@/lib/text";
import {
  formatConditionLabel,
  isIssueCondition,
  isNearMintCondition,
  supportsIssueDetailCondition,
} from "@/lib/conditions";
import { getOptionPricing } from "@/lib/pricing";
import {
  applyImageFallback,
  buildSrcSet,
  getOptimizedImageUrl,
} from "@/lib/imageUrl";

function peso(amount: number) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
  } catch {
    return `PHP ${Math.round(Number(amount) || 0)}`;
  }
}

function getProductImages(product: ProductDetail | null) {
  const unique = new Set<string>();
  const images: string[] = [];
  for (const raw of product?.image_urls ?? []) {
    const url = normalizeProductImageUrl(raw);
    if (!url || unique.has(url)) continue;
    unique.add(url);
    images.push(url);
  }
  return images;
}

function getNoteTone(condition: string | null | undefined, hasNotes: boolean) {
  if (!hasNotes) return "text-white/70";
  if (isIssueCondition(condition)) return "text-red-200/80";
  if (isNearMintCondition(condition)) return "text-amber-200/80";
  return "text-white/70";
}

function getNoteIndicatorTone(condition: string | null | undefined) {
  if (isIssueCondition(condition)) return "bg-red-400";
  if (isNearMintCondition(condition)) return "bg-amber-400";
  return "";
}

function getSuggestionPrice(product: ShopProduct) {
  const firstOption = product.options[0];
  if (!firstOption) return product.minEffectivePrice ?? product.minPrice;
  return getOptionPricing(firstOption).effectivePrice;
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { product, loading } = useProductDetail(id);
  const cart = useCart();
  const [selectedId, setSelectedId] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [issueOpen, setIssueOpen] = React.useState(false);
  const [issueIndex, setIssueIndex] = React.useState(0);
  const [relatedPool, setRelatedPool] = React.useState<ShopProduct[]>([]);
  const touchStartX = React.useRef<number | null>(null);
  const touchStartY = React.useRef<number | null>(null);
  const issueTouchStartX = React.useRef<number | null>(null);
  const issueTouchStartY = React.useRef<number | null>(null);

  React.useEffect(() => {
    let mounted = true;

    async function loadCatalog() {
      const res = await fetch("/api/shop/products", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!mounted) return;
      if (!res.ok || !json?.ok) {
        setRelatedPool([]);
        return;
      }
      setRelatedPool(collapseVariants(((json.rows as VariantRow[]) ?? []).slice()));
    }

    void loadCatalog();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!product?.id) return;
    recordRecentView(product.id);
    supabase
      .rpc("record_recent_view", { p_product_id: product.id })
      .then(
        () => undefined,
        () => {
          // Ignore if the viewer is not signed in.
        }
      );
    const sessionId = getOrCreateGuestSessionId();
    supabase
      .rpc("increment_product_click_detailed", {
        p_product_id: product.id,
        p_session_id: sessionId,
      })
      .then(
        () => undefined,
        () => {
          // Ignore metric failures for buyers.
        }
      );
  }, [product?.id]);

  React.useEffect(() => {
    setSelectedId(product?.variants[0]?.id ?? "");
    setActiveIndex(0);
    setIssueIndex(0);
    setIssueOpen(false);
  }, [product?.id, product?.variants]);

  React.useEffect(() => {
    setIssueOpen(false);
    setIssueIndex(0);
  }, [selectedId]);

  const images = React.useMemo(() => getProductImages(product), [product]);
  const displayTitle = formatTitle(product?.title ?? "") || product?.title || "Product";
  const selected =
    product?.variants.find((variant) => variant.id === selectedId) ??
    product?.variants[0] ??
    null;
  const selectedPricing = selected ? getOptionPricing(selected) : null;
  const displayPrice = selectedPricing ? peso(selectedPricing.effectivePrice) : "-";
  const strikePrice =
    selected && selectedPricing?.hasSale ? peso(Number(selected.price ?? 0)) : null;
  const activeImage = images[activeIndex] ?? "";
  const issueImages = React.useMemo(
    () =>
      (selected?.issue_photo_urls ?? [])
        .map(normalizeProductImageUrl)
        .filter(Boolean) as string[],
    [selected?.issue_photo_urls]
  );
  const noteValue = String(selected?.public_notes ?? selected?.issue_notes ?? "").trim();
  const noteTone = getNoteTone(selected?.condition, Boolean(noteValue));
  const noteIndicatorTone = getNoteIndicatorTone(selected?.condition);
  const hasIssueDetails = Boolean(
    supportsIssueDetailCondition(selected?.condition) &&
      (issueImages.length > 0 || noteValue)
  );
  const relatedItems = React.useMemo(() => {
    if (!product?.id) return [];
    return getRelatedProducts(
      {
        key: product.id,
        title: product.title,
        brand: product.brand,
        model: product.model,
      },
      relatedPool,
      6
    );
  }, [product, relatedPool]);

  React.useEffect(() => {
    if (!issueOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIssueOpen(false);
      }
      if (event.key === "ArrowLeft") {
        setIssueIndex((prev) =>
          issueImages.length ? (prev - 1 + issueImages.length) % issueImages.length : 0
        );
      }
      if (event.key === "ArrowRight") {
        setIssueIndex((prev) =>
          issueImages.length ? (prev + 1) % issueImages.length : 0
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [issueImages.length, issueOpen]);

  function step(delta: number) {
    if (images.length <= 1) return;
    setActiveIndex((prev) => (prev + delta + images.length) % images.length);
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

  async function shareCurrentProduct() {
    const title = displayTitle;
    const url = getAbsoluteProductPageUrl(id);

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title,
          text: title,
          url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(url);
        toast({
          title: "Link copied",
          message: "Product page link copied to clipboard.",
        });
        return;
      }
    } catch {
      // Fall through to the prompt fallback below.
    }

    if (typeof window !== "undefined") {
      window.prompt("Copy product link", url);
    }
  }

  async function addVariantToCart(variant: Variant) {
    try {
      const pricing = getOptionPricing(variant);
      const result = await cart.add(variant.id, 1);
      const baseToast = {
        title: displayTitle,
        image_url: images[0] ?? null,
        variant: formatConditionLabel(variant.condition, {
          upper: true,
          shipClass: variant.ship_class,
        }),
        price: pricing.effectivePrice,
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

  async function addSuggestionToCart(item: ShopProduct, option: ShopProduct["options"][0]) {
    try {
      const pricing = getOptionPricing(option);
      const result = await cart.add(option.id, 1);
      const baseToast = {
        title: formatTitle(item.title) || item.title,
        image_url: item.image_url,
        variant: formatConditionLabel(option.condition, {
          upper: true,
          shipClass: option.ship_class,
        }),
        price: pricing.effectivePrice,
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

  if (loading) {
    return <main className="mx-auto max-w-6xl px-4 py-10 text-white/70">Loading...</main>;
  }

  if (!product) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-3xl border border-white/10 bg-bg-900/40 p-6 text-center">
          <div className="text-xl font-semibold text-white">Item not found.</div>
          <div className="mt-2 text-sm text-white/60">
            The product page link may be outdated or the item has been removed.
          </div>
          <div className="mt-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-950/40 px-4 py-2 text-sm text-white/80 hover:bg-bg-950/60"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to shop
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!product.variants.length) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-sm text-white/80 hover:bg-bg-950/60"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to shop
          </Link>
          <button
            type="button"
            onClick={() => void shareCurrentProduct()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-sm text-white/80 hover:bg-bg-950/60"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-bg-900/40 p-6">
          <div className="text-xs uppercase tracking-[0.24em] text-white/45">Unavailable</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">{displayTitle}</h1>
          <div className="mt-2 text-sm text-white/60">
            This item is no longer available. You can still share the page or browse similar items below.
          </div>
        </div>

        {relatedItems.length ? (
          <section className="rounded-3xl border border-white/10 bg-bg-900/40 p-4 sm:p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
              You may also like
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {relatedItems.map((item) => {
                const image = normalizeProductImageUrl(
                  item.image_url ?? item.image_urls?.[0] ?? null
                );
                return (
                  <div
                    key={item.key}
                    className="rounded-2xl border border-white/10 bg-bg-950/35 p-3"
                  >
                    <Link
                      href={getProductPageHref(item.key)}
                      className="block overflow-hidden rounded-xl border border-white/10 bg-bg-900/60"
                    >
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getOptimizedImageUrl(image, {
                            width: 360,
                            quality: 70,
                            format: "webp",
                          })}
                          srcSet={buildSrcSet(image, [180, 280, 360], {
                            quality: 70,
                            format: "webp",
                          })}
                          sizes="(min-width: 1024px) 320px, 90vw"
                          alt={item.title}
                          className="h-40 w-full object-contain bg-neutral-50"
                          loading="lazy"
                          decoding="async"
                          onError={(event) =>
                            applyImageFallback(event.currentTarget, image)
                          }
                        />
                      ) : (
                        <div className="flex h-40 items-center justify-center text-sm text-white/45">
                          No image
                        </div>
                      )}
                    </Link>
                    <div className="mt-3 text-sm font-semibold text-white">
                      {formatTitle(item.title) || item.title}
                    </div>
                    <div className="mt-1 text-xs text-white/50">
                      {item.brand ?? "-"}
                      {item.model ? ` · ${item.model}` : ""}
                    </div>
                    <div className="mt-3">
                      <Link
                        href={getProductPageHref(item.key)}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-950/55 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-bg-950/75"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View page
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-sm text-white/80 hover:bg-bg-950/60"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to shop
          </Link>
          <button
            type="button"
            onClick={() => void shareCurrentProduct()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-sm text-white/80 hover:bg-bg-950/60"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-bg-900/40 shadow-soft">
          <div className="border-b border-white/10 px-4 py-4 sm:px-5">
            <div className="text-xs uppercase tracking-[0.22em] text-white/45">Product page</div>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{displayTitle}</h1>
            <div className="mt-1 text-sm text-white/55">
              {product.brand ?? "-"}
              {product.model ? ` · ${product.model}` : ""}
              {product.variation ? ` · ${product.variation}` : ""}
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
                      src={getOptimizedImageUrl(activeImage, {
                        width: 1200,
                        quality: 75,
                        format: "webp",
                      })}
                      srcSet={buildSrcSet(activeImage, [480, 720, 960, 1200], {
                        quality: 75,
                        format: "webp",
                      })}
                      sizes="(min-width: 1024px) 720px, 90vw"
                      alt={displayTitle}
                      className="h-80 w-full object-contain bg-neutral-50 sm:h-[28rem]"
                      loading="eager"
                      decoding="async"
                      onError={(event) =>
                        applyImageFallback(event.currentTarget, activeImage)
                      }
                    />
                  ) : (
                    <div className="flex h-80 items-center justify-center text-sm text-white/45 sm:h-[28rem]">
                      No image available.
                    </div>
                  )}

                  {images.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => step(-1)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/60 p-2 text-white/80 hover:bg-black/75"
                        aria-label="Previous photo"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => step(1)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/60 p-2 text-white/80 hover:bg-black/75"
                        aria-label="Next photo"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/80">
                        {activeIndex + 1}/{images.length}
                      </div>
                    </>
                  ) : null}
                </div>

                {images.length > 1 ? (
                  <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {images.map((image, index) => (
                      <button
                        key={`${image}-${index}`}
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        className={[
                          "overflow-hidden rounded-xl border bg-bg-950/50 transition",
                          index === activeIndex
                            ? "border-amber-300/70"
                            : "border-white/10 hover:border-white/25",
                        ].join(" ")}
                        aria-label={`View photo ${index + 1}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getOptimizedImageUrl(image, {
                            width: 240,
                            quality: 70,
                            format: "webp",
                          })}
                          srcSet={buildSrcSet(image, [120, 180, 240], {
                            quality: 70,
                            format: "webp",
                          })}
                          sizes="96px"
                          alt=""
                          className="h-20 w-full object-contain bg-neutral-50"
                          loading="lazy"
                          decoding="async"
                          onError={(event) =>
                            applyImageFallback(event.currentTarget, image)
                          }
                        />
                      </button>
                    ))}
                  </div>
                ) : null}

                {hasIssueDetails ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIssueIndex(0);
                      setIssueOpen(true);
                    }}
                    className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-xs text-white/75 hover:bg-white/10"
                  >
                    See issue
                  </button>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-bg-950/40 p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">Selected condition</span>
                    <span className="text-white/90">
                      {formatConditionLabel(selected?.condition ?? "-", {
                        upper: true,
                        shipClass: selected?.ship_class,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">Price</span>
                    <span className="text-price">
                      {strikePrice ? (
                        <span className="flex items-baseline gap-2">
                          <span>{displayPrice}</span>
                          <span className="text-[11px] text-white/40 line-through">
                            {strikePrice}
                          </span>
                        </span>
                      ) : (
                        displayPrice
                      )}
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
                    {product.variants.map((variant) => {
                      const isSelected = variant.id === selected?.id;
                      const pricing = getOptionPricing(variant);
                      const variantStrike = pricing.hasSale
                        ? peso(Number(variant.price ?? 0))
                        : null;
                      return (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => setSelectedId(variant.id)}
                          className={[
                            "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition",
                            isSelected
                              ? "border-amber-300/55 bg-amber-400/12"
                              : "border-white/10 bg-bg-900/25 hover:bg-bg-900/45",
                          ].join(" ")}
                        >
                          <span className={isSelected ? "text-white" : "text-white/75"}>
                            {formatConditionLabel(variant.condition, {
                              upper: true,
                              shipClass: variant.ship_class,
                            })}
                          </span>
                          <span className={isSelected ? "text-white/90" : "text-white/60"}>
                            {variantStrike ? (
                              <span className="flex items-baseline gap-2">
                                <span>{peso(pricing.effectivePrice)}</span>
                                <span className="text-[10px] text-white/40 line-through">
                                  {variantStrike}
                                </span>
                              </span>
                            ) : (
                              peso(pricing.effectivePrice)
                            )}{" "}
                            - {variant.qty} left
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-bg-950/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    Notes
                  </div>
                  <div className={`mt-2 flex items-center gap-2 text-sm ${noteTone}`}>
                    {noteIndicatorTone ? (
                      <span
                        className={`h-2 w-2 rounded-full ${noteIndicatorTone}`}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span>{noteValue || "No notes for this item."}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
                  Photos are for reference only. For more photos/details, please message our Facebook page.
                </div>

                {selected ? (
                  <button
                    type="button"
                    onClick={() => void addVariantToCart(selected)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-black hover:bg-amber-500"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Add to cart
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {relatedItems.length ? (
          <section className="rounded-3xl border border-white/10 bg-bg-900/40 p-4 sm:p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
              You may also like
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {relatedItems.map((item) => {
                const image = normalizeProductImageUrl(
                  item.image_url ?? item.image_urls?.[0] ?? null
                );
                const defaultOption = item.options[0];
                return (
                  <div
                    key={item.key}
                    className="rounded-2xl border border-white/10 bg-bg-950/35 p-3"
                  >
                    <Link
                      href={getProductPageHref(item.key)}
                      className="block overflow-hidden rounded-xl border border-white/10 bg-bg-900/60"
                    >
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getOptimizedImageUrl(image, {
                            width: 360,
                            quality: 70,
                            format: "webp",
                          })}
                          srcSet={buildSrcSet(image, [180, 280, 360], {
                            quality: 70,
                            format: "webp",
                          })}
                          sizes="(min-width: 1024px) 320px, 90vw"
                          alt={item.title}
                          className="h-40 w-full object-contain bg-neutral-50"
                          loading="lazy"
                          decoding="async"
                          onError={(event) =>
                            applyImageFallback(event.currentTarget, image)
                          }
                        />
                      ) : (
                        <div className="flex h-40 items-center justify-center text-sm text-white/45">
                          No image
                        </div>
                      )}
                    </Link>
                    <div className="mt-3 text-sm font-semibold text-white">
                      {formatTitle(item.title) || item.title}
                    </div>
                    <div className="mt-1 text-xs text-white/50">
                      {item.brand ?? "-"}
                      {item.model ? ` · ${item.model}` : ""}
                    </div>
                    <div className="mt-2 text-sm text-price">
                      {peso(getSuggestionPrice(item))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={getProductPageHref(item.key)}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-950/55 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-bg-950/75"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View page
                      </Link>
                      {defaultOption ? (
                        <button
                          type="button"
                          onClick={() => void addSuggestionToCart(item, defaultOption)}
                          className="inline-flex items-center gap-2 rounded-xl border border-amber-300/35 bg-amber-500/12 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/20"
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          Add
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>
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
                    <div className="text-xs text-white/50">Issue details</div>
                    <div className="text-base font-semibold leading-snug line-clamp-2 sm:text-lg">
                      {displayTitle}
                    </div>
                    <div className="text-xs text-white/60 sm:text-sm">
                      {formatConditionLabel(selected?.condition ?? "-", {
                        upper: true,
                        shipClass: selected?.ship_class,
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
                {noteValue ? (
                  <div className={`mb-4 rounded-xl border border-white/10 bg-bg-950/40 p-3 text-sm ${noteTone}`}>
                    {noteValue}
                  </div>
                ) : null}
                <div
                  className="group relative overflow-hidden rounded-xl border border-white/10 bg-bg-950/50"
                  onTouchStart={(event) =>
                    handleTouchStart(event, issueTouchStartX, issueTouchStartY)
                  }
                  onTouchEnd={(event) =>
                    handleTouchEnd(event, issueTouchStartX, issueTouchStartY, stepIssue)
                  }
                >
                  {issueImages[issueIndex] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getOptimizedImageUrl(issueImages[issueIndex], {
                        width: 1200,
                        quality: 75,
                        format: "webp",
                      })}
                      srcSet={buildSrcSet(issueImages[issueIndex], [480, 720, 960, 1200], {
                        quality: 75,
                        format: "webp",
                      })}
                      sizes="(min-width: 1024px) 720px, 90vw"
                      alt="Issue photo"
                      className="h-72 w-full object-contain bg-neutral-50"
                      loading="lazy"
                      decoding="async"
                      onError={(event) =>
                        applyImageFallback(
                          event.currentTarget,
                          issueImages[issueIndex]
                        )
                      }
                    />
                  ) : (
                    <div className="flex h-72 items-center justify-center text-sm text-white/50">
                      No issue photos uploaded for this item.
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
        </div>
      ) : null}
    </>
  );
}
