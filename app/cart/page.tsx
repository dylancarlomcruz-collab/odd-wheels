"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useCart, type CartLine } from "@/hooks/useCart";
import ProductCard, { type ShopProduct } from "@/components/ProductCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatPHP } from "@/lib/money";
import { useBuyerProducts } from "@/hooks/useBuyerProducts";
import { useBuyerShopProducts } from "@/hooks/useBuyerShopProducts";
import { recommendSimilar } from "@/lib/recommendations";
import { formatConditionLabel } from "@/lib/conditions";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "@/components/ui/toast";

function CartContent() {
  const { lines, loading, updateQty, remove, add } = useCart();
  const { settings } = useSettings();
  const selectAllRef = React.useRef<HTMLInputElement>(null);

  const { products: allProducts } = useBuyerProducts({ brand: "all" });
  const { products: shopProducts } = useBuyerShopProducts({ brand: "all" });

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [previewLine, setPreviewLine] = React.useState<CartLine | null>(null);
  const [activeImage, setActiveImage] = React.useState("");
  const [unsealedAck, setUnsealedAck] = React.useState(false);

  const selectedLines = React.useMemo(
    () => lines.filter((line) => selectedIds.includes(line.id)),
    [lines, selectedIds],
  );
  const hasUnsealedInCart = React.useMemo(
    () =>
      lines.some((line) =>
        String(line.variant.condition ?? "")
          .toLowerCase()
          .includes("unsealed"),
      ),
    [lines],
  );
  const hasUnsealedSelected = React.useMemo(
    () =>
      selectedLines.some((line) =>
        String(line.variant.condition ?? "")
          .toLowerCase()
          .includes("unsealed"),
      ),
    [selectedLines],
  );
  const selectedSubtotal = selectedLines.reduce(
    (acc, l) => acc + Number(l.variant.price) * l.qty,
    0,
  );
  const allSelected = lines.length > 0 && selectedIds.length === lines.length;
  const someSelected =
    selectedIds.length > 0 && selectedIds.length < lines.length;
  const checkoutHref = selectedIds.length
    ? `/checkout?selected=${encodeURIComponent(selectedIds.join(","))}`
    : "/checkout";
  const checkoutDisabled =
    selectedLines.length === 0 || (hasUnsealedSelected && !unsealedAck);
  const freeShippingThreshold = Number(settings?.free_shipping_threshold ?? 0);
  const freeShippingGap =
    freeShippingThreshold > 0 ? freeShippingThreshold - selectedSubtotal : 0;
  const cartProductIds = React.useMemo(
    () => new Set(lines.map((line) => line.variant.product.id).filter(Boolean)),
    [lines],
  );
  const completeSet = React.useMemo(() => {
    if (!allProducts.length || cartProductIds.size === 0) return [];
    const candidates = allProducts.filter((p) => !cartProductIds.has(p.id));
    const picked: any[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const target = {
        id: line.variant.product.id,
        title: line.variant.product.title,
        brand: line.variant.product.brand,
        model: line.variant.product.model,
        min_price: Number(line.variant.price),
      };
      const recs = recommendSimilar(candidates as any, target as any, 4);
      for (const rec of recs) {
        if (seen.has(rec.id)) continue;
        seen.add(rec.id);
        picked.push(rec);
      }
      if (picked.length >= 6) break;
    }
    return picked.slice(0, 6);
  }, [allProducts, cartProductIds, lines]);

  const completeSetProducts = React.useMemo(() => {
    if (!completeSet.length || !shopProducts.length) return [];
    const map = new Map(shopProducts.map((p) => [p.key, p]));
    return completeSet
      .map((item) => map.get(item.id))
      .filter(Boolean) as ShopProduct[];
  }, [completeSet, shopProducts]);

  React.useEffect(() => {
    setSelectedIds((prev) => {
      if (!lines.length) return [];
      const lineIds = lines.map((line) => line.id);
      const prevSet = new Set(prev);
      const filtered = lineIds.filter((id) => prevSet.has(id));
      return filtered.length ? filtered : lineIds;
    });
  }, [lines]);

  React.useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  React.useEffect(() => {
    if (!previewLine) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewLine(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewLine]);

  React.useEffect(() => {
    if (!hasUnsealedSelected) setUnsealedAck(false);
  }, [hasUnsealedSelected]);

  function openPreview(line: CartLine) {
    setPreviewLine(line);
    setActiveImage(line.variant.product.image_urls?.[0] ?? "");
  }

  function renderPortal(content: React.ReactNode) {
    if (typeof document === "undefined") return null;
    return createPortal(content, document.body);
  }

  async function onAddSuggestion(
    product: ShopProduct,
    option: ShopProduct["options"][number],
  ) {
    try {
      const result = await add(option.id, 1);
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
          : { ...baseToast, qty: 1 },
      );
    } catch (e: any) {
      toast({
        title: "Failed to add to cart",
        message: e?.message ?? "Failed to add to cart",
        intent: "error",
      });
    }
  }

  const previewImages = (previewLine?.variant.product.image_urls ?? []).filter(
    (img) => Boolean(img),
  );
  const previewPrice = previewLine
    ? formatPHP(Number(previewLine.variant.price))
    : "";
  const previewCondition = previewLine?.variant.condition ?? "";
  const previewIssue = previewLine?.variant.issue_notes ?? null;
  const previewNotes = previewLine?.variant.public_notes ?? null;
  const isPreviewNearMint = previewCondition === "near_mint";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cart</h1>
        <div className="text-sm text-white/60">
          Review items before checkout.
        </div>
      </div>

      {freeShippingThreshold > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-4 text-sm text-white/70">
          {freeShippingGap > 0 ? (
            <span>
              Add{" "}
              <span className="text-price">{formatPHP(freeShippingGap)}</span>{" "}
              more to unlock free shipping.
            </span>
          ) : (
            <span className="text-accent-700 dark:text-accent-200">
              You unlocked free shipping for this cart.
            </span>
          )}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="font-semibold">Items</div>
          <div className="text-sm text-white/60">
            {selectedLines.length} selected / {lines.length} item(s)
          </div>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="text-white/60">Loading cart...</div>
          ) : lines.length === 0 ? (
            <div className="text-white/60">Your cart is empty.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-white/70">
                <label className="flex items-center gap-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="h-4 w-4"
                    checked={allSelected}
                    onChange={(e) =>
                      setSelectedIds(
                        e.target.checked ? lines.map((l) => l.id) : [],
                      )
                    }
                  />
                  Select all
                </label>
                <div>{selectedLines.length} selected</div>
              </div>
              {lines.map((l) => {
                const available = l.variant.qty;
                const invalid = available <= 0 || l.qty > available;
                const canDec = l.qty > 1;
                const canInc = available > 0 && l.qty < available;
                const checked = selectedIds.includes(l.id);

                return (
                  <div
                    key={l.id}
                    className="rounded-xl border border-white/10 bg-bg-900/30 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedIds((prev) =>
                              e.target.checked
                                ? [...prev, l.id]
                                : prev.filter((id) => id !== l.id),
                            )
                          }
                          aria-label={`Select ${l.variant.product.title}`}
                        />
                        <button
                          type="button"
                          onClick={() => openPreview(l)}
                          className="h-20 w-20 md:h-16 md:w-16 rounded-xl overflow-hidden border border-white/10 bg-bg-900/40 transition hover:border-white/30 shrink-0"
                          aria-label={`View ${l.variant.product.title}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={l.variant.product.image_urls?.[0] ?? ""}
                            alt=""
                            className="h-full w-full object-contain bg-neutral-50"
                            onError={(e) =>
                              (e.currentTarget.style.display = "none")
                            }
                          />
                        </button>
                        <div>
                          <button
                            type="button"
                            onClick={() => openPreview(l)}
                            className="text-left font-semibold transition hover:text-accent-700 dark:hover:text-accent-200"
                          >
                            {l.variant.product.title}
                          </button>
                          <div className="text-sm text-white/60">
                            {formatConditionLabel(l.variant.condition, {
                              upper: true,
                            })}{" "}
                            -{" "}
                            <span className="text-price">
                              {formatPHP(Number(l.variant.price))}
                            </span>
                          </div>
                          {l.variant.public_notes ? (
                            <div className="text-[11px] text-white/50">
                              Notes: {l.variant.public_notes}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openPreview(l)}
                            className="mt-1 inline-block text-left text-xs text-white/50 transition hover:text-white/80"
                          >
                            View details
                          </button>
                          {l.variant.issue_notes ? (
                            l.variant.condition === "near_mint" ? (
                              <div className="text-sm text-white/70">
                                Condition note: {l.variant.issue_notes}
                              </div>
                            ) : l.variant.condition === "with_issues" ? (
                              <div className="text-sm text-red-200/80">
                                Issue: {l.variant.issue_notes}
                              </div>
                            ) : null
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!canDec}
                            onClick={() => updateQty(l.id, l.qty - 1)}
                            aria-label="Decrease quantity"
                          >
                            −
                          </Button>

                          <div className="w-20">
                            <Input
                              value={String(l.qty)}
                              inputMode="numeric"
                              onChange={(e) => {
                                const v = Number(
                                  e.target.value.replace(/[^0-9]/g, ""),
                                );
                                if (!Number.isFinite(v)) return;
                                updateQty(l.id, v);
                              }}
                            />
                          </div>

                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!canInc}
                            onClick={() => updateQty(l.id, l.qty + 1)}
                            aria-label="Increase quantity"
                          >
                            +
                          </Button>
                        </div>
                        <Button variant="ghost" onClick={() => remove(l.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>

                    {invalid ? (
                      <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 space-y-2">
                        <div>
                          Item sold out, browse our page for similar items.
                        </div>
                        {(() => {
                          const target = {
                            id: l.variant.product.id,
                            title: l.variant.product.title,
                            brand: l.variant.product.brand,
                            model: l.variant.product.model,
                            min_price: Number(l.variant.price),
                          };
                          const recs = recommendSimilar(
                            allProducts as any,
                            target as any,
                            4,
                          );
                          return recs.length ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {recs.map((p: any) => (
                                <Link
                                  key={p.id}
                                  href={`/product/${p.id}`}
                                  className="rounded-xl border border-white/10 bg-bg-900/30 px-3 py-2 text-white/80 hover:bg-paper/5"
                                >
                                  <div className="font-medium line-clamp-1">
                                    {p.title}
                                  </div>
                                  <div className="text-xs text-white/60">
                                    {formatPHP(p.min_price)}
                                  </div>
                                </Link>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-white/50">
                        In stock: {available}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {hasUnsealedInCart ? (
        <div className="rounded-xl border border-white/10 bg-bg-900/30 p-4 text-xs text-white/70 space-y-2">
          <div className="text-sm text-white/80">
            Quick note: Unsealed items may show light signs of handling or
            display.
          </div>
          <label className="flex items-start gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={unsealedAck}
              onChange={(e) => setUnsealedAck(e.target.checked)}
              disabled={!hasUnsealedSelected}
            />
            <span>
              I understand that photos are for reference, and unsealed items may
              have minor imperfections.
            </span>
          </label>
          {hasUnsealedSelected && !unsealedAck ? (
            <div className="text-[11px] text-white/50">
              Please tick this box to continue.
            </div>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardBody className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm text-white/60">Selected subtotal</div>
            <div className="text-xl text-price">
              {formatPHP(selectedSubtotal)}
            </div>
          </div>
          {checkoutDisabled ? (
            <Button disabled>Proceed to checkout</Button>
          ) : (
            <Link href={checkoutHref}>
              <Button>Proceed to checkout</Button>
            </Link>
          )}
        </CardBody>
      </Card>

      {completeSetProducts.length ? (
        <Card>
          <CardHeader>
            <div className="font-semibold">Complete your set</div>
            <div className="text-sm text-white/60">
              Suggestions based on your cart items.
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {completeSetProducts.map((item) => (
                <ProductCard
                  key={item.key}
                  product={item}
                  onAddToCart={(opt) => onAddSuggestion(item, opt)}
                  onRelatedAddToCart={(related, opt) =>
                    onAddSuggestion(related, opt)
                  }
                  relatedPool={shopProducts}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {previewLine
        ? renderPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
              <button
                type="button"
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setPreviewLine(null)}
                aria-label="Close preview"
              />
              <div
                role="dialog"
                aria-modal="true"
                className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-bg-900/95 p-5 shadow-soft"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-white/50">Item preview</div>
                    <div className="text-lg font-semibold">
                      {previewLine.variant.product.title}
                    </div>
                    <div className="text-sm text-white/60">
                      {previewLine.variant.product.brand ?? "-"}
                      {previewLine.variant.product.model
                        ? ` - ${previewLine.variant.product.model}`
                        : ""}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewLine(null)}
                  >
                    Close
                  </Button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr]">
                  <div className="rounded-xl border border-white/10 bg-bg-950/50 p-3">
                    {activeImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeImage}
                        alt=""
                        className="h-64 w-full rounded-lg object-contain"
                      />
                    ) : (
                      <div className="flex h-64 items-center justify-center text-sm text-white/50">
                        No image available.
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/10 bg-bg-950/40 p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/60">Condition</span>
                        <span className="text-white/90">
                          {formatConditionLabel(previewCondition, {
                            upper: true,
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/60">Price</span>
                        <span className="text-price">{previewPrice}</span>
                      </div>
                      {previewNotes ? (
                        <div className="text-sm text-white/70">
                          Notes: {previewNotes}
                        </div>
                      ) : null}
                      {previewIssue ? (
                        isPreviewNearMint ? (
                          <div className="text-sm text-white/70">
                            Condition note: {previewIssue}
                          </div>
                        ) : (
                          <div className="text-sm text-red-200/80">
                            Issue: {previewIssue}
                          </div>
                        )
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                      Photos are for reference only (may not be the exact
                      on-hand item). For more photos/details, please message our
                      Facebook page.
                    </div>

                    <div className="rounded-xl border border-white/10 bg-bg-950/40 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                        Photos
                      </div>
                      {previewImages.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {previewImages.map((img, index) => (
                            <button
                              key={`${img}-${index}`}
                              type="button"
                              onClick={() => setActiveImage(img)}
                              className={`h-16 w-16 overflow-hidden rounded-lg border transition ${
                                activeImage === img
                                  ? "border-accent-400/80"
                                  : "border-white/10"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={img}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-white/50">
                          No additional photos.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
          )
        : null}
    </main>
  );
}

export default function CartPage() {
  return (
    <RequireAuth>
      <CartContent />
    </RequireAuth>
  );
}
