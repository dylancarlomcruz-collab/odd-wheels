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

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { product, loading } = useProductDetail(id);
  const { add, isLoggedIn } = useCart();
  const router = useRouter();

  // For similar items, fetch recent products (All) then compute similarity.
  const { products: allProducts } = useBuyerProducts({ brand: "all" });

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
                          {v.condition.toUpperCase()}
                        </Badge>
                        <div className="text-white/70 text-sm">Stock: {v.qty}</div>
                      </div>
                      <div className="text-price">{formatPHP(Number(v.price))}</div>
                    </div>

                    {v.condition === "with_issues" && v.issue_notes ? (
                      <div className="mt-2 text-sm text-red-200/80">Issue: {v.issue_notes}</div>
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
                                variant: v.condition.toUpperCase(),
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
    </main>
  );
}
