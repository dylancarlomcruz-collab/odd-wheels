"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useProductDetail } from "@/hooks/useProductDetail";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPHP } from "@/lib/money";
import { useCart } from "@/hooks/useCart";
import Link from "next/link";
import { recommendSimilar } from "@/lib/recommendations";
import { useBuyerProducts } from "@/hooks/useBuyerProducts";
import { toast } from "@/components/ui/toast";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatConditionLabel } from "@/lib/conditions";
import { supabase } from "@/lib/supabase/browser";
import { recordRecentView } from "@/lib/recentViews";
import { resolveEffectivePrice } from "@/lib/pricing";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { product, loading } = useProductDetail(id);
  const { add } = useCart();
  const router = useRouter();
  const [issueViewer, setIssueViewer] = React.useState<{
    images: string[];
    condition: string;
  } | null>(null);
  const [issueIndex, setIssueIndex] = React.useState(0);
  const [alsoViewed, setAlsoViewed] = React.useState<any[]>([]);
  const [boughtTogether, setBoughtTogether] = React.useState<any[]>([]);

  // For similar items, fetch recent products (All) then compute similarity.
  const { products: allProducts } = useBuyerProducts({ brand: "all" });

  React.useEffect(() => {
    if (!product?.id) return;
    recordRecentView(product.id);
    supabase
      .rpc("record_recent_view", { p_product_id: product.id })
      .then(
        () => undefined,
        () => {
          // ignore if not authenticated
        }
      );
    supabase
      .rpc("increment_product_click", { product_id: product.id })
      .then(
        () => undefined,
        () => {
          // ignore
        }
      );
  }, [product?.id]);

  React.useEffect(() => {
    if (!product?.id) return;
    let mounted = true;
    const mapSuggestions = (rows: any[]) =>
      rows
        .map((p) => {
          const variants = (p.product_variants ?? []) as Array<{
            price: number;
            sale_price?: number | null;
            discount_percent?: number | null;
            qty: number;
          }>;
          const prices = variants
            .filter((v) => (v.qty ?? 0) > 0)
            .map((v) =>
              resolveEffectivePrice({
                price: Number(v.price),
                sale_price: v.sale_price ?? null,
                discount_percent: v.discount_percent ?? null,
              }).effectivePrice
            );
          const minPrice = prices.length ? Math.min(...prices) : 0;
          return {
            id: p.id,
            title: p.title,
            brand: p.brand,
            model: p.model,
            image_urls: p.image_urls,
            min_price: minPrice,
          };
        })
        .filter((row) => row.min_price > 0);

    (async () => {
      const [alsoRes, togetherRes] = await Promise.all([
        supabase.rpc("get_customers_also_viewed", {
          p_product_id: product.id,
          p_limit: 8,
        }),
        supabase.rpc("get_frequently_bought_together", {
          p_product_id: product.id,
          p_limit: 8,
        }),
      ]);

      if (!mounted) return;

      const alsoIds =
        (alsoRes.data as any[] | null)
          ?.map((row) => row?.product_id)
          .filter(Boolean) ?? [];
      const togetherIds =
        (togetherRes.data as any[] | null)
          ?.map((row) => row?.product_id)
          .filter(Boolean) ?? [];

      if (alsoIds.length) {
          const { data } = await supabase
            .from("products")
            .select(
            "id, title, brand, model, image_urls, product_variants(price, sale_price, discount_percent, qty)"
            )
            .in("id", alsoIds);
        if (mounted) {
          const mapped = mapSuggestions((data as any[]) ?? []);
          const orderMap = new Map(alsoIds.map((id, index) => [id, index]));
          mapped.sort(
            (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
          );
          setAlsoViewed(mapped);
        }
      } else {
        setAlsoViewed([]);
      }

      if (togetherIds.length) {
          const { data } = await supabase
            .from("products")
            .select(
            "id, title, brand, model, image_urls, product_variants(price, sale_price, discount_percent, qty)"
            )
            .in("id", togetherIds);
        if (mounted) {
          const mapped = mapSuggestions((data as any[]) ?? []);
          const orderMap = new Map(togetherIds.map((id, index) => [id, index]));
          mapped.sort(
            (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
          );
          setBoughtTogether(mapped);
        }
      } else {
        setBoughtTogether([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [product?.id]);

  React.useEffect(() => {
    if (!issueViewer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIssueViewer(null);
      if (e.key === "ArrowLeft") stepIssue(-1);
      if (e.key === "ArrowRight") stepIssue(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [issueViewer]);

  function stepIssue(delta: number) {
    if (!issueViewer?.images?.length) return;
    setIssueIndex((prev) =>
      (prev + delta + issueViewer.images.length) % issueViewer.images.length
    );
  }

  const similarItems = React.useMemo(() => {
    if (!product) return [];
    const target = {
      id: product.id,
      title: product.title,
      brand: product.brand,
      model: product.model,
      min_price: resolveEffectivePrice({
        price: Number(product.variants?.[0]?.price ?? 0),
        sale_price: product.variants?.[0]?.sale_price ?? null,
        discount_percent: product.variants?.[0]?.discount_percent ?? null,
      }).effectivePrice,
    };
    return recommendSimilar(allProducts as any, target as any, 8);
  }, [product, allProducts]);

  if (loading) {
    return <main className="mx-auto max-w-6xl px-4 py-10 text-white/70">Loading...</main>;
  }

  if (!product || product.variants.length === 0) {
    // product not available (sold out or inactive)
    // show similar items
    const target = allProducts[0];
    const similar = target ? recommendSimilar(allProducts, target, 6) : [];
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 space-y-6">
        <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-6">
          <div className="text-xl font-semibold">This item is no longer available.</div>
          <div className="mt-1 text-white/60">Browse similar available items.</div>
          <div className="mt-4">
            <Button onClick={() => router.push("/")}>Back to homepage</Button>
          </div>
        </div>

        {similar.length ? (
          <section className="space-y-3">
            <div className="text-lg font-semibold">Similar items</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {similar.map((p) => (
                <Link key={p.id} href={`/product/${p.id}`} className="rounded-2xl border border-white/10 bg-bg-800/60 p-4 hover:shadow-glow transition">
                  <div className="font-semibold line-clamp-2">{p.title}</div>
                  <div className="mt-2 text-price">{formatPHP(p.min_price)}</div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    );
  }

  function renderSuggestionSection(
    title: string,
    items: Array<{
      id: string;
      title: string;
      brand?: string | null;
      model?: string | null;
      image_urls?: string[] | null;
      min_price?: number;
    }>,
    subtitle?: string
  ) {
    if (!items.length) return null;
    return (
      <section className="space-y-3">
        <div>
          <div className="text-lg font-semibold">{title}</div>
          {subtitle ? <div className="text-sm text-white/50">{subtitle}</div> : null}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const image =
              Array.isArray(item.image_urls) && item.image_urls.length
                ? item.image_urls[0]
                : null;
            return (
              <Link
                key={item.id}
                href={`/product/${item.id}`}
                className="rounded-2xl border border-white/10 bg-bg-900/40 p-3 transition hover:border-white/20 hover:bg-paper/10"
              >
                <div className="h-32 w-full rounded-xl border border-white/10 bg-bg-950/40 overflow-hidden">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image}
                      alt=""
                      className="h-full w-full object-contain bg-neutral-50"
                    />
                  ) : null}
                </div>
                <div className="mt-2 text-sm font-semibold line-clamp-2">
                  {item.title}
                </div>
                <div className="text-xs text-white/60 mt-1">
                  {item.brand ?? "-"}
                  {item.model ? ` - ${item.model}` : ""}
                </div>
                {item.min_price ? (
                  <div className="mt-2 text-xs text-price">
                    {formatPHP(Number(item.min_price))}
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      </section>
    );
  }

  const heroImg = product.image_urls?.[0] ?? null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="aspect-square bg-bg-900/40 grid place-items-center">
            {heroImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={heroImg} alt={product.title} className="h-full w-full object-cover" />
            ) : (
              <div className="text-white/30 text-sm">No image</div>
            )}
          </div>
        </Card>

        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-semibold">{product.title}</h1>
            <div className="text-sm text-white/60">
              {([product.brand, product.model, product.variation].filter(Boolean).join(" - ") || "-")}
            </div>
          </div>

          <Card>
            <CardBody>
              <div className="font-semibold">Choose condition</div>
              <div className="mt-3 space-y-3">
                {product.variants.map((v) => {
                  const pricing = resolveEffectivePrice({
                    price: Number(v.price),
                    sale_price: v.sale_price ?? null,
                    discount_percent: v.discount_percent ?? null,
                  });
                  const displayPrice = formatPHP(pricing.effectivePrice);
                  const strikePrice = pricing.hasSale
                    ? formatPHP(Number(v.price))
                    : null;
                  return (
                    <div key={v.id} className="rounded-xl border border-white/10 bg-bg-900/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge className="border-accent-500/30 text-accent-700 dark:text-accent-200">
                            {formatConditionLabel(v.condition, {
                              upper: true,
                              shipClass: v.ship_class,
                            })}
                          </Badge>
                          {pricing.hasSale ? (
                            <Badge className="border-rose-300/60 bg-rose-500/20 text-rose-100">
                              On Sale
                            </Badge>
                          ) : null}
                          <div className="text-white/70 text-sm">Stock: {v.qty}</div>
                        </div>
                        <div className="text-price">
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
                        </div>
                      </div>

                    {(() => {
                      const noteValue = String(
                        v.public_notes ?? v.issue_notes ?? ""
                      ).trim();
                      if (!noteValue) return null;
                      const noteTone =
                        v.condition === "with_issues"
                          ? "text-red-200/80"
                          : v.condition === "near_mint"
                            ? "text-amber-200/80"
                            : "text-white/70";
                      const indicatorTone =
                        v.condition === "with_issues"
                          ? "bg-red-400"
                          : v.condition === "near_mint"
                            ? "bg-amber-400"
                            : "";
                      const showIndicator = indicatorTone.length > 0;
                      return (
                        <div className={`mt-2 flex items-center gap-2 text-sm ${noteTone}`}>
                          {showIndicator ? (
                            <span
                              className={`h-2 w-2 rounded-full ${indicatorTone}`}
                              aria-hidden="true"
                            />
                          ) : null}
                          <span>Notes: {noteValue}</span>
                        </div>
                      );
                    })()}

                    {Array.isArray(v.issue_photo_urls) && v.issue_photo_urls.length ? (
                      <div className="mt-3">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setIssueIndex(0);
                            setIssueViewer({
                              images: v.issue_photo_urls ?? [],
                              condition: formatConditionLabel(v.condition, {
                                upper: true,
                                shipClass: v.ship_class,
                              }),
                            });
                          }}
                        >
                          Show issue photos
                        </Button>
                      </div>
                    ) : null}

                    <div className="mt-3">
                      <Button
                        onClick={async () => {
                          try {
                            const result = await add(v.id, 1);
                            const baseToast = {
                              title: product.title,
                              image_url: heroImg,
                              variant: formatConditionLabel(v.condition, {
                                upper: true,
                                shipClass: v.ship_class,
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
                            router.push("/cart");
                          } catch (err: any) {
                            toast({
                              title: "Failed to add to cart",
                              message: err?.message ?? "Failed to add to cart",
                              intent: "error",
                            });
                          }
                        }}
                      >
                        Add to cart
                      </Button>
                    </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <div className="text-sm text-white/50">
            Note: Sold-out variants are hidden. If all variants sell out, the product disappears from buyer search and listings.
          </div>
        </div>
      </div>

      {renderSuggestionSection(
        "Customers also viewed",
        alsoViewed,
        "Based on co-views from other shoppers."
      )}
      {renderSuggestionSection(
        "Frequently bought together",
        boughtTogether,
        "Often purchased alongside this item."
      )}
      {renderSuggestionSection(
        "Similar items",
        similarItems,
        "Same brand or model keyword matches."
      )}

      {issueViewer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIssueViewer(null)}
            aria-label="Close issue photos"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-bg-900/95 p-5 shadow-soft"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-white/50">Issue photos</div>
                <div className="text-lg font-semibold">{product.title}</div>
                <div className="text-sm text-white/60">{issueViewer.condition}</div>
              </div>
              <button
                type="button"
                onClick={() => setIssueViewer(null)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-950/40 px-3 py-2 text-sm text-white/80 hover:bg-bg-950/60"
              >
                <X className="h-4 w-4" />
                Close
              </button>
            </div>

            <div className="mt-4 relative rounded-xl border border-white/10 bg-bg-950/50 p-3">
              {issueViewer.images[issueIndex] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={issueViewer.images[issueIndex]}
                  alt="Issue photo"
                  className="h-72 w-full rounded-lg object-contain"
                />
              ) : (
                <div className="flex h-72 items-center justify-center text-sm text-white/50">
                  No issue photos available.
                </div>
              )}
              {issueViewer.images.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => stepIssue(-1)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white/90 hover:bg-black/80"
                    aria-label="Previous issue photo"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => stepIssue(1)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white/90 hover:bg-black/80"
                    aria-label="Next issue photo"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
