"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type CartInsightRow = {
  key: string;
  name: string;
  condition: string;
  price: number;
  stock: number;
  qty: number;
  customers: number;
  latestAdded: string | null;
  imageUrl: string | null;
};

type CartInsightStat = {
  lines: number;
  customers: number;
  qty: number;
  variants: number;
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

function buildItemLabel(product: any) {
  if (!product) return "Item";
  const title = String(product.title ?? "").trim();
  const brand = String(product.brand ?? "").trim();
  const model = String(product.model ?? "").trim();
  const variation = String(product.variation ?? "").trim();
  const base = title || [brand, model].filter(Boolean).join(" ");
  const label = [base, variation].filter(Boolean).join(" - ");
  return label || "Item";
}

function pickImage(product: any) {
  const urls = product?.image_urls;
  if (Array.isArray(urls) && urls.length) return String(urls[0]);
  return null;
}

function formatDateShort(value: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("en-PH");
  } catch {
    return "";
  }
}

export default function AdminCartInsightsPage() {
  const [days, setDays] = React.useState("30");
  const [limit, setLimit] = React.useState("20");
  const [sortBy, setSortBy] = React.useState<"qty" | "customers">("qty");
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<CartInsightRow[]>([]);
  const [stats, setStats] = React.useState<CartInsightStat>({
    lines: 0,
    customers: 0,
    qty: 0,
    variants: 0,
  });

  async function load() {
    setLoading(true);
    try {
      const daysNum = Math.max(0, Number.parseInt(days, 10) || 0);
      const rowLimit = 10000;

      let query = supabase
        .from("cart_items")
        .select(
          "id,user_id,variant_id,qty,created_at, variant:product_variants(id,condition,price,qty, product:products(id,title,brand,model,variation,image_urls))"
        )
        .order("created_at", { ascending: false })
        .limit(rowLimit);

      if (daysNum > 0) {
        const since = new Date();
        since.setDate(since.getDate() - daysNum);
        query = query.gte("created_at", since.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      const lines = (data as any[]) ?? [];
      const customerSet = new Set<string>();
      const map = new Map<string, CartInsightRow & { customersSet: Set<string> }>();
      let totalQty = 0;

      for (const line of lines) {
        const variant = line?.variant ?? null;
        const product = variant?.product ?? null;
        const qty = Number(line?.qty ?? 0);
        const userId = String(line?.user_id ?? "");
        const key = String(line?.variant_id ?? line?.id ?? "");
        if (!key) continue;

        totalQty += qty;
        if (userId) customerSet.add(userId);

        const current =
          map.get(key) ??
          ({
            key,
            name: buildItemLabel(product),
            condition: String(variant?.condition ?? ""),
            price: Number(variant?.price ?? 0),
            stock: Number(variant?.qty ?? 0),
            qty: 0,
            customers: 0,
            latestAdded: null,
            imageUrl: pickImage(product),
            customersSet: new Set<string>(),
          } as CartInsightRow & { customersSet: Set<string> });

        current.qty += qty;
        if (userId) current.customersSet.add(userId);

        const createdAt = line?.created_at ? String(line.created_at) : null;
        if (createdAt && (!current.latestAdded || createdAt > current.latestAdded)) {
          current.latestAdded = createdAt;
        }

        if (!current.name || current.name === "Item") {
          current.name = buildItemLabel(product);
        }
        if (!current.imageUrl) current.imageUrl = pickImage(product);

        map.set(key, current);
      }

      const aggregated = Array.from(map.values()).map((entry) => ({
        key: entry.key,
        name: entry.name,
        condition: entry.condition,
        price: entry.price,
        stock: entry.stock,
        qty: entry.qty,
        customers: entry.customersSet.size,
        latestAdded: entry.latestAdded,
        imageUrl: entry.imageUrl,
      }));

      setRows(aggregated);
      setStats({
        lines: lines.length,
        customers: customerSet.size,
        qty: totalQty,
        variants: aggregated.length,
      });
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to load cart insights");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleRows = React.useMemo(() => {
    const ordered = [...rows].sort((a, b) => {
      if (sortBy === "customers") return b.customers - a.customers || b.qty - a.qty;
      return b.qty - a.qty || b.customers - a.customers;
    });
    const limitNum = Math.max(0, Number.parseInt(limit, 10) || 0);
    return limitNum > 0 ? ordered.slice(0, limitNum) : ordered;
  }, [rows, sortBy, limit]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Cart Insights</div>
            <div className="text-sm text-white/60">
              See which items are most often left in carts to guide restock or pricing moves.
            </div>
          </div>
          <Badge>{rows.length} items</Badge>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
              <div className="text-sm text-white/60">Cart lines</div>
              <div className="text-2xl font-semibold">{stats.lines}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
              <div className="text-sm text-white/60">Distinct customers</div>
              <div className="text-2xl font-semibold">{stats.customers}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
              <div className="text-sm text-white/60">Total qty in carts</div>
              <div className="text-2xl font-semibold">{stats.qty}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
              <div className="text-sm text-white/60">Variants in carts</div>
              <div className="text-2xl font-semibold">{stats.variants}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
            <div className="font-semibold">Filters</div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Input
                label="Lookback days"
                type="number"
                min={0}
                max={3650}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                hint="0 = all time"
                className="w-[160px]"
              />
              <Input
                label="Max items"
                type="number"
                min={0}
                max={200}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                hint="0 = show all"
                className="w-[160px]"
              />
              <Select
                label="Sort by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "qty" | "customers")}
                className="w-[200px]"
              >
                <option value="qty">Most qty in carts</option>
                <option value="customers">Most customers</option>
              </Select>
              <Button variant="secondary" onClick={load} disabled={loading}>
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
            <div className="font-semibold">Most in carts</div>
            <div className="mt-3 space-y-2">
              {loading ? (
                <div className="text-sm text-white/60">Loading cart insights...</div>
              ) : visibleRows.length === 0 ? (
                <div className="text-sm text-white/60">No cart items found.</div>
              ) : (
                visibleRows.map((row) => {
                  const condition = row.condition ? row.condition.toUpperCase() : "";
                  const stockLow = row.stock > 0 && row.stock <= row.qty;
                  return (
                    <div
                      key={row.key}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-paper/5 px-3 py-2 sm:py-3"
                    >
                      <div className="flex min-w-[240px] flex-1 items-center gap-3">
                        <div className="h-14 w-14 rounded-lg border border-white/10 bg-bg-800 overflow-hidden flex-shrink-0">
                          {row.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.imageUrl} alt={row.name} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{row.name}</div>
                          <div className="text-xs text-white/60">
                            {condition ? `${condition} | ` : ""}
                            Price: {peso(row.price)} | Stock:{" "}
                            <span className={stockLow ? "text-yellow-200" : ""}>{row.stock}</span>
                          </div>
                          {row.latestAdded ? (
                            <div className="text-xs text-white/50">Last added: {formatDateShort(row.latestAdded)}</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-xs text-white/60">In carts</div>
                          <div className="text-lg font-semibold">{row.qty}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-white/60">Customers</div>
                          <div className="text-lg font-semibold">{row.customers}</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
