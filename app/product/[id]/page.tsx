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

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { product, loading } = useProductDetail(id);
  const { add, isLoggedIn } = useCart();
  const router = useRouter();
  const [issueViewer, setIssueViewer] = React.useState<{
    images: string[];
    condition: string;
  } | null>(null);
  const [issueIndex, setIssueIndex] = React.useState(0);

  // For similar items, fetch recent products (All) then compute similarity.
  const { products: allProducts } = useBuyerProducts({ brand: "all" });

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
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
              {(product.brand ?? "—")} {product.model ? `• ${product.model}` : ""} {product.variation ? `• ${product.variation}` : ""}
            </div>
          </div>

          <Card>
            <CardBody>
              <div className="font-semibold">Choose condition</div>
              <div className="mt-3 space-y-3">
                {product.variants.map((v) => (
                  <div key={v.id} className="rounded-xl border border-white/10 bg-bg-900/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge className="border-accent-500/30 text-accent-700 dark:text-accent-200">
                          {formatConditionLabel(v.condition, { upper: true })}
                        </Badge>
                        <div className="text-white/70 text-sm">Stock: {v.qty}</div>
                      </div>
                      <div className="text-price">{formatPHP(Number(v.price))}</div>
                    </div>

                    {v.condition === "with_issues" && v.issue_notes ? (
                      <div className="mt-2 text-sm text-red-200/80">Issue: {v.issue_notes}</div>
                    ) : null}

                    {v.public_notes ? (
                      <div className="mt-2 text-sm text-white/70">
                        Notes: {v.public_notes}
                      </div>
                    ) : null}

                    {Array.isArray(v.issue_photo_urls) && v.issue_photo_urls.length ? (
                      <div className="mt-3">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setIssueIndex(0);
                            setIssueViewer({
                              images: v.issue_photo_urls ?? [],
                              condition: formatConditionLabel(v.condition, { upper: true }),
                            });
                          }}
                        >
                          Show issue photos
                        </Button>
                      </div>
                    ) : null}

                    <div className="mt-3">
                      {!isLoggedIn ? (
                        <Link href="/auth/login">
                          <Button variant="secondary">Login to add to cart</Button>
                        </Link>
                      ) : (
                        <Button
                          onClick={async () => {
                            try {
                              const result = await add(v.id, 1);
                              const baseToast = {
                                title: product.title,
                                image_url: heroImg,
                                variant: formatConditionLabel(v.condition, { upper: true }),
                                price: Number(v.price ?? 0),
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
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <div className="text-sm text-white/50">
            Note: Sold-out variants are hidden. If all variants sell out, the product disappears from buyer search and listings.
          </div>
        </div>
      </div>

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
