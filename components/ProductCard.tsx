"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type ConditionOption = {
  id: string; // this is the PRODUCT ROW ID for that condition
  condition: string;
  price: number;
  qty: number;
  issue_notes?: string | null;
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
}: {
  product: ShopProduct;
  onAddToCart: (option: ConditionOption) => void | Promise<void>;
}) {
  const [selectedId, setSelectedId] = React.useState<string>(
    product.options[0]?.id ?? ""
  );
  const [hasPicked, setHasPicked] = React.useState(
    (product.options?.length ?? 0) <= 1
  );
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);

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
    if (activeIndex >= images.length) setActiveIndex(0);
  }, [activeIndex, images.length]);

  React.useEffect(() => {
    setSelectedId(product.options[0]?.id ?? "");
    setHasPicked((product.options?.length ?? 0) <= 1);
  }, [product.options]);

  function openPreview() {
    setActiveIndex(0);
    setIsOpen(true);
  }

  function step(delta: number) {
    if (images.length <= 1) return;
    setActiveIndex((prev) => (prev + delta + images.length) % images.length);
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
          </div>

          {isOut ? (
            <div className="mt-2 text-[11px] sm:text-xs text-red-300">
              Selected condition is out of stock.
            </div>
          ) : null}
        </div>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
            aria-label="Close preview"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-4xl rounded-2xl border border-white/10 bg-bg-900/95 p-5 shadow-soft"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-white/50">Item preview</div>
                <div className="text-lg font-semibold">{product.title}</div>
                <div className="text-sm text-white/60">
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

            <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr]">
              <div className="relative rounded-xl border border-white/10 bg-bg-950/50 p-3">
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
                      className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white/90 hover:bg-black/80"
                      aria-label="Previous photo"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => step(1)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white/90 hover:bg-black/80"
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
                  {selected?.issue_notes ? (
                    <div className="text-sm text-red-200/80">
                      Issue: {selected.issue_notes}
                    </div>
                  ) : null}
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
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}





