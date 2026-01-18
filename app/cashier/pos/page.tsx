"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { BarcodeScannerModal } from "@/components/pos/BarcodeScannerModal";
import { toast } from "@/components/ui/toast";
import { normalizeBarcode } from "@/lib/barcode";

type Product = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_urls: string[] | null;
  is_active: boolean;
};

type Variant = {
  id: string;
  product_id: string;
  condition: "sealed" | "unsealed" | "with_issues";
  price: number;
  qty: number;
  barcode: string | null;
  ship_class: string | null;
};

type VariantHit = Variant & {
  product: Product;
};

type CartLine = {
  variant_id: string;
  product_id: string;
  title: string;
  image: string | null;
  condition: string;
  barcode: string | null;
  unit_price: number;
  qty: number;
  stock: number;
  line_total: number;
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

function firstImg(urls: any): string | null {
  if (Array.isArray(urls) && urls.length) return String(urls[0]);
  return null;
}

function formatCondition(value: string | null) {
  return String(value ?? "sealed").toUpperCase();
}

function variantLabel(v: Variant) {
  const barcode = v.barcode ? ` | ${v.barcode}` : "";
  return `${formatCondition(v.condition)} | ${peso(Number(v.price ?? 0))} | Qty ${Number(v.qty ?? 0)}${barcode}`;
}

const BARCODE_CONTROL_KEYS = new Set([
  "Backspace",
  "Delete",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "Tab",
]);

export default function CashierPOSPage() {
  // customer
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [saveCustomer, setSaveCustomer] = React.useState(true);

  // shipping
  const [shippingMethod, setShippingMethod] = React.useState("J&T");
  const [shippingDetailsText, setShippingDetailsText] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("CASH");

  // search
  const [search, setSearch] = React.useState("");
  const [results, setResults] = React.useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchHint, setSearchHint] = React.useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);
  const [variants, setVariants] = React.useState<Variant[]>([]);
  const [loadingVariants, setLoadingVariants] = React.useState(false);
  const [variantsByProduct, setVariantsByProduct] = React.useState<Record<string, Variant[]>>({});

  // barcode
  const [barcode, setBarcode] = React.useState("");
  const [barcodeLoading, setBarcodeLoading] = React.useState(false);
  const [barcodeHint, setBarcodeHint] = React.useState<string | null>(null);
  const [barcodeMatches, setBarcodeMatches] = React.useState<VariantHit[]>([]);
  const [scannerOpen, setScannerOpen] = React.useState(false);

  const barcodeRef = React.useRef<HTMLInputElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  // cart
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [placing, setPlacing] = React.useState(false);

  const subtotal = cart.reduce((s, l) => s + l.line_total, 0);

  async function runSearch() {
    const q = search.trim();
    if (!q) {
      setResults([]);
      setSelectedProduct(null);
      setVariants([]);
      setSearchHint(null);
      return;
    }

    setSearchLoading(true);
    setSearchHint(null);

    const ilike = `%${q}%`;

    const [{ data: pData, error: pErr }, { data: vData, error: vErr }] =
      await Promise.all([
        supabase
          .from("products")
          .select("id,title,brand,model,variation,image_urls,is_active")
          .or(
            `title.ilike.${ilike},brand.ilike.${ilike},model.ilike.${ilike},variation.ilike.${ilike}`
          )
          .limit(20),
        supabase
          .from("product_variants")
          .select(
            "product:products(id,title,brand,model,variation,image_urls,is_active)"
          )
          .ilike("barcode", ilike)
          .limit(20),
      ]);

    if (pErr) console.error(pErr);
    if (vErr) console.error(vErr);

    const merged: Product[] = [];
    const seen = new Set<string>();

    (pData as any[] | null)?.forEach((p) => {
      if (!p?.id || seen.has(p.id)) return;
      seen.add(p.id);
      merged.push(p as Product);
    });

    (vData as any[] | null)?.forEach((row) => {
      const p = row?.product;
      if (!p?.id || seen.has(p.id)) return;
      seen.add(p.id);
      merged.push(p as Product);
    });

    const limited = merged.slice(0, 20);
    setResults(limited);
    setSelectedProduct(null);
    setVariants([]);
    setSearchHint(limited.length ? null : "No products found.");
    setSearchLoading(false);
  }

  async function loadProductVariants(p: Product) {
    setSelectedProduct(p);
    setLoadingVariants(true);

    const { data, error } = await supabase
      .from("product_variants")
      .select("id,product_id,condition,price,qty,barcode,ship_class")
      .eq("product_id", p.id)
      .order("created_at", { ascending: false });

    setLoadingVariants(false);

    if (error) {
      console.error(error);
      setVariants([]);
      return;
    }

    const list = (data as Variant[]) ?? [];
    setVariants(list);
    setVariantsByProduct((prev) => ({ ...prev, [p.id]: list }));
  }

  async function ensureVariantsLoaded(productId: string) {
    if (variantsByProduct[productId]) return;

    const { data, error } = await supabase
      .from("product_variants")
      .select("id,product_id,condition,price,qty,barcode,ship_class")
      .eq("product_id", productId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setVariantsByProduct((prev) => ({
      ...prev,
      [productId]: (data as Variant[]) ?? [],
    }));
  }

  function addVariantToCart(variant: Variant, product: Product) {
    const stock = Number(variant.qty ?? 0);
    if (stock <= 0) {
      toast({
        title: "Out of stock",
        message: `${product.title} is sold out.`,
        intent: "error",
      });
      return;
    }

    const unitPrice = Number(variant.price ?? 0);
    ensureVariantsLoaded(product.id);

    const existing = cart.find((x) => x.variant_id === variant.id);
    const desired = (existing?.qty ?? 0) + 1;
    const nextQty = Math.max(1, Math.min(desired, stock));

    toast({
      title: "Added to cart",
      message: product.title,
      image_url: firstImg(product.image_urls),
      variant: formatCondition(variant.condition),
      price: unitPrice,
      qty: nextQty,
      action: { label: "View cart", href: "#pos-cart" },
    });

    setCart((prev) => {
      const idx = prev.findIndex((x) => x.variant_id === variant.id);
      if (idx >= 0) {
        const next = prev.slice();
        const desired = next[idx].qty + 1;
        const nextQty = Math.max(1, Math.min(desired, stock));
        next[idx] = {
          ...next[idx],
          qty: nextQty,
          stock,
          unit_price: unitPrice,
          condition: formatCondition(variant.condition),
          barcode: variant.barcode ?? null,
          line_total: unitPrice * nextQty,
        };
        return next;
      }

      const lineQty = 1;
      return [
        ...prev,
        {
          variant_id: variant.id,
          product_id: product.id,
          title: product.title,
          image: firstImg(product.image_urls),
          condition: formatCondition(variant.condition),
          barcode: variant.barcode ?? null,
          unit_price: unitPrice,
          qty: lineQty,
          stock,
          line_total: unitPrice * lineQty,
        },
      ];
    });
  }

  async function addByBarcode(code: string) {
    const t = normalizeBarcode(code);
    if (!t) {
      setBarcodeHint(null);
      setBarcodeMatches([]);
      return;
    }

    setBarcodeLoading(true);
    setBarcodeHint(null);
    setBarcodeMatches([]);

    try {
      // Exact-match DB lookup only (no external barcode API).
      const { data, error } = await supabase
        .from("product_variants")
        .select(
          "id,product_id,condition,price,qty,barcode,ship_class, product:products(id,title,brand,model,variation,image_urls,is_active)"
        )
        .eq("barcode", t)
        .gt("qty", 0)
        .eq("product.is_active", true)
        .limit(10);

      if (error) console.error(error);
      const exactList = (data as VariantHit[] | null) ?? [];
      if (!exactList.length) {
        toast({
          title: "No item found",
          message: `No item found for barcode ${t}`,
          intent: "error",
        });
        return;
      }

      if (exactList.length === 1) {
        addVariantToCart(exactList[0], exactList[0].product);
        setBarcode("");
        setBarcodeMatches([]);
        barcodeRef.current?.focus();
        return;
      }

      setBarcodeHint("Multiple barcode matches found. Choose a variant.");
      setBarcodeMatches(exactList);
    } finally {
      setBarcodeLoading(false);
    }
  }

  function changeLineVariant(line: CartLine, variantId: string) {
    const options = variantsByProduct[line.product_id] ?? [];
    const nextVariant = options.find((v) => v.id === variantId);
    if (!nextVariant || Number(nextVariant.qty ?? 0) <= 0) return;

    const unitPrice = Number(nextVariant.price ?? 0);
    const stock = Number(nextVariant.qty ?? 0);

    setCart((prev) => {
      const idx = prev.findIndex((l) => l.variant_id === line.variant_id);
      if (idx < 0) return prev;

      const nextQty = Math.max(1, Math.min(prev[idx].qty, stock));
      const updated: CartLine = {
        ...prev[idx],
        variant_id: nextVariant.id,
        condition: formatCondition(nextVariant.condition),
        barcode: nextVariant.barcode ?? null,
        unit_price: unitPrice,
        qty: nextQty,
        stock,
        line_total: unitPrice * nextQty,
      };

      const next = prev.slice();
      const mergeIdx = next.findIndex(
        (l, i) => l.variant_id === nextVariant.id && i !== idx
      );

      if (mergeIdx >= 0) {
        const mergedQty = Math.max(
          1,
          Math.min(stock, next[mergeIdx].qty + nextQty)
        );
        next[mergeIdx] = {
          ...updated,
          qty: mergedQty,
          line_total: unitPrice * mergedQty,
        };
        next.splice(idx, 1);
        return next;
      }

      next[idx] = updated;
      return next;
    });
  }

  function inc(line: CartLine) {
    setCart((prev) =>
      prev.map((l) => {
        if (l.variant_id !== line.variant_id) return l;
        const nextQty = Math.min(l.stock, l.qty + 1);
        return { ...l, qty: nextQty, line_total: l.unit_price * nextQty };
      })
    );
  }

  function dec(line: CartLine) {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.variant_id !== line.variant_id) return l;
          const nextQty = Math.max(1, l.qty - 1);
          return { ...l, qty: nextQty, line_total: l.unit_price * nextQty };
        })
        .filter((l) => l.qty > 0)
    );
  }

  function remove(line: CartLine) {
    setCart((prev) => prev.filter((l) => l.variant_id !== line.variant_id));
  }

  async function placeOrder() {
    if (!customerName.trim()) return alert("Customer name required");
    if (!customerPhone.trim()) return alert("Customer phone required");
    if (cart.length === 0) return alert("Cart is empty");

    setPlacing(true);
    try {
      const shipping_details = {
        method: shippingMethod,
        text: shippingDetailsText,
      };

      const items = cart.map((l) => ({ variant_id: l.variant_id, qty: l.qty }));

      const { data, error } = await supabase.rpc("pos_create_order", {
        p_customer_name: customerName.trim(),
        p_customer_phone: customerPhone.trim(),
        p_shipping_method: shippingMethod,
        p_shipping_details: shipping_details,
        p_payment_method: paymentMethod,
        p_save_customer: saveCustomer,
        p_items: items,
      });

      if (error) throw error;

      alert(`POS order created: ${String(data).slice(0, 8)}`);

      setCart([]);
      setSearch("");
      setBarcode("");
      setResults([]);
      setSelectedProduct(null);
      setVariants([]);
      setBarcodeMatches([]);
      setShippingDetailsText("");
      setSearchHint(null);
      setBarcodeHint(null);
      searchRef.current?.focus();
    } catch (e: any) {
      alert(e?.message ?? "POS checkout failed");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="space-y-6">
      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(value) => {
          const normalized = normalizeBarcode(value);
          setScannerOpen(false);
          setBarcode(normalized);
          addByBarcode(normalized);
        }}
      />

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">POS / Manual Checkout</div>
            <div className="text-sm text-white/60">
              For walk-in or outside-website orders. Deducts inventory on
              checkout.
            </div>
          </div>
          <Badge>{cart.length} items</Badge>
        </CardHeader>

        <CardBody className="space-y-6">
          {/* Customer */}
          <div
            id="pos-cart"
            className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3"
          >
            <div className="font-semibold">Customer</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Customer Name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <Input
                label="Contact Number"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={saveCustomer}
                onChange={(e) => setSaveCustomer(e.target.checked)}
              />
              Save customer + shipping details for future use
            </label>
          </div>

          {/* Shipping/Payment */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="font-semibold">Shipping + Payment</div>
            <div className="grid gap-3 md:grid-cols-3">
              <Select
                label="Shipping Method"
                value={shippingMethod}
                onChange={(e) => setShippingMethod(e.target.value)}
              >
                <option value="J&T">J&T</option>
                <option value="LBC">LBC</option>
                <option value="LALAMOVE">Lalamove</option>
                <option value="PICKUP">Pickup / Walk-in</option>
              </Select>

              <Select
                label="Payment Method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="CASH">Cash</option>
                <option value="GCASH">GCash</option>
                <option value="BPI">BPI</option>
                <option value="MANUAL">Manual</option>
              </Select>

              <div className="flex items-end text-sm text-white/70">
                Subtotal:
                <span className="ml-2 text-white font-semibold">
                  {peso(subtotal)}
                </span>
              </div>
            </div>

            <Textarea
              label="Shipping Details (quick entry)"
              value={shippingDetailsText}
              onChange={(e) => setShippingDetailsText(e.target.value)}
              placeholder={`Example:\nJ&T: Name, Phone, Full Address (Brgy)\nLBC: Name, Phone, Branch + City\nLalamove: Name, Phone, Address notes`}
            />
          </div>

          {/* Item add */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-4">
            <div className="font-semibold">Add Items</div>

            <div className="space-y-3">
              <div className="text-sm text-white/70">Search products</div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  ref={searchRef}
                  label="Search (title/brand/model/variation/barcode)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") runSearch();
                  }}
                />
                <div className="flex items-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={runSearch}
                    disabled={searchLoading}
                  >
                    {searchLoading ? "Searching..." : "Search"}
                  </Button>
                </div>
              </div>

              {searchHint ? (
                <div className="text-sm text-white/50">{searchHint}</div>
              ) : null}

              {results.length ? (
                <div className="grid gap-2">
                  {results.map((p) => {
                    const img = firstImg(p.image_urls);
                    const isSelected = selectedProduct?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => loadProductVariants(p)}
                        className={`text-left rounded-xl border px-3 py-2 flex gap-3 ${
                          isSelected
                            ? "border-accent-500/60 bg-accent-500/10"
                            : "border-white/10 bg-paper/5 hover:bg-paper/10"
                        }`}
                      >
                        <div className="h-14 w-14 rounded-lg bg-bg-800 border border-white/10 overflow-hidden flex-shrink-0">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={img}
                              alt={p.title}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="font-medium flex items-center justify-between gap-3">
                            <span className="truncate">{p.title}</span>
                            <span
                              className={
                                p.is_active
                                  ? "text-accent-700 dark:text-accent-200 text-xs"
                                  : "text-red-300 text-xs"
                              }
                            >
                              {p.is_active ? "ACTIVE" : "ARCHIVED"}
                            </span>
                          </div>
                          <div className="text-xs text-white/60">
                            {p.brand ?? "-"}
                            {p.model ? ` | ${p.model}` : ""}
                            {p.variation ? ` | ${p.variation}` : ""}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {selectedProduct ? (
                <div className="rounded-xl border border-white/10 bg-paper/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Variants</div>
                    <Badge>{variants.length}</Badge>
                  </div>
                  {loadingVariants ? (
                    <div className="text-white/60">Loading variants...</div>
                  ) : variants.length === 0 ? (
                    <div className="text-sm text-white/60">
                      No variants for this product.
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {variants.map((v) => (
                        <div
                          key={v.id}
                          className="rounded-lg border border-white/10 bg-bg-900/50 p-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium">
                              {formatCondition(v.condition)}
                            </div>
                            <div className="text-xs text-white/60">
                              {v.barcode ? `Barcode: ${v.barcode}` : "No barcode"}
                            </div>
                            <div className="text-xs text-white/60">
                              {peso(Number(v.price ?? 0))} | Stock {v.qty}
                            </div>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={Number(v.qty ?? 0) <= 0}
                            onClick={() => addVariantToCart(v, selectedProduct)}
                          >
                            {Number(v.qty ?? 0) <= 0 ? "Out of stock" : "Add"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="text-sm text-white/70">Scan barcode</div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  ref={barcodeRef}
                  label="Barcode Scan (DB-only)"
                  value={barcode}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  onChange={(e) => {
                    const next = normalizeBarcode(e.target.value);
                    setBarcode(next);
                    setBarcodeHint(null);
                    setBarcodeMatches([]);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const next = normalizeBarcode(e.currentTarget.value);
                      setBarcode(next);
                      addByBarcode(next);
                      return;
                    }

                    if (e.ctrlKey || e.metaKey || e.altKey) return;
                    if (BARCODE_CONTROL_KEYS.has(e.key)) return;
                    if (!/^[0-9]$/.test(e.key)) e.preventDefault();
                  }}
                  placeholder="Scan barcode then press Enter"
                />
                <div className="flex items-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => addByBarcode(barcode)}
                    disabled={barcodeLoading}
                  >
                    {barcodeLoading ? "Searching..." : "Add by Barcode"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setScannerOpen(true)}
                  >
                    Scan with Camera
                  </Button>
                </div>
              </div>

              {barcodeHint ? (
                <div className="text-sm text-yellow-200">{barcodeHint}</div>
              ) : null}

              {barcodeMatches.length ? (
                <div className="rounded-xl border border-white/10 bg-paper/5 p-3 space-y-2">
                  <div className="text-sm font-medium">Barcode matches</div>
                  <div className="grid gap-2">
                    {barcodeMatches.map((v) => {
                      const img = firstImg(v.product.image_urls);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          className="text-left rounded-lg border border-white/10 bg-bg-900/50 hover:bg-paper/10 px-3 py-2 flex gap-3"
                          onClick={() => {
                            if (Number(v.qty ?? 0) <= 0) return;
                            addVariantToCart(v, v.product);
                            setBarcode("");
                            setBarcodeHint(null);
                            setBarcodeMatches([]);
                            barcodeRef.current?.focus();
                          }}
                        >
                          <div className="h-12 w-12 rounded-lg bg-bg-800 border border-white/10 overflow-hidden flex-shrink-0">
                            {img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={img}
                                alt={v.product.title}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">
                              {v.product.title}
                            </div>
                            <div className="text-xs text-white/60">
                              {v.product.brand ?? "-"}
                              {v.product.model ? ` | ${v.product.model}` : ""}
                              {v.product.variation
                                ? ` | ${v.product.variation}`
                                : ""}
                            </div>
                            <div className="text-xs text-white/60 mt-1">
                              {formatCondition(v.condition)} | {peso(Number(v.price ?? 0))} | Stock {v.qty}
                              {v.barcode ? ` | ${v.barcode}` : ""}
                            </div>
                            {Number(v.qty ?? 0) <= 0 ? (
                              <div className="text-xs text-red-300 mt-1">
                                Out of stock
                              </div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Cart */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="font-semibold">Cart</div>

            {cart.length === 0 ? (
              <div className="text-white/60">No items added.</div>
            ) : (
              <div className="space-y-2">
                {cart.map((l) => {
                  const variantsForProduct =
                    variantsByProduct[l.product_id] ?? [];
                  return (
                    <div
                      key={l.variant_id}
                      className="rounded-xl border border-white/10 bg-paper/5 p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex gap-3 min-w-0">
                          <div className="h-12 w-12 rounded-lg bg-bg-800 border border-white/10 overflow-hidden flex-shrink-0">
                            {l.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={l.image}
                                alt={l.title}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {l.title}
                            </div>
                            <div className="text-xs text-white/60">
                              {l.condition} | {peso(l.unit_price)} | Stock {l.stock}
                              {l.barcode ? ` | ${l.barcode}` : ""}
                            </div>
                            {l.qty >= l.stock ? (
                              <div className="text-xs text-yellow-200 mt-1">
                                Max stock reached
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button variant="ghost" onClick={() => dec(l)}>
                            -
                          </Button>
                          <div className="w-10 text-center font-semibold">
                            {l.qty}
                          </div>
                          <Button
                            variant="ghost"
                            onClick={() => inc(l)}
                            disabled={l.qty >= l.stock}
                          >
                            +
                          </Button>
                          <Button variant="secondary" onClick={() => remove(l)}>
                            Remove
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <Select
                          label="Variant"
                          value={l.variant_id}
                          onChange={(e) =>
                            changeLineVariant(l, e.target.value)
                          }
                        >
                          {variantsForProduct.length ? (
                            variantsForProduct.map((v) => (
                              <option
                                key={v.id}
                                value={v.id}
                                disabled={Number(v.qty ?? 0) <= 0}
                              >
                                {variantLabel(v)}
                              </option>
                            ))
                          ) : (
                            <option value={l.variant_id}>Loading variants...</option>
                          )}
                        </Select>

                        <div className="flex items-end text-sm text-white/70">
                          Line total:
                          <span className="ml-2 text-white font-semibold">
                            {peso(l.line_total)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <div className="text-white/70">Subtotal</div>
              <div className="text-white font-semibold">{peso(subtotal)}</div>
            </div>

            <Button onClick={placeOrder} disabled={placing || cart.length === 0}>
              {placing ? "Processing..." : "Complete POS Checkout"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

