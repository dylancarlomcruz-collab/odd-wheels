"use client";

import * as React from "react";
import {
  BarChart3,
  Boxes,
  Layers,
  MousePointerClick,
  RefreshCw,
  ShoppingCart,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatConditionLabel } from "@/lib/conditions";

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

type ProductClickRow = {
  product_id: string;
  clicks: number;
  last_clicked_at: string | null;
  product: {
    id: string;
    title: string;
    brand: string | null;
    model: string | null;
    variation: string | null;
    image_urls: string[] | null;
  } | null;
};

type VisitorItem = {
  name: string;
  qty: number;
};

type VisitorRow = {
  id: string;
  kind: "ACCOUNT" | "GUEST";
  label: string;
  clicks: number;
  cartLines: number;
  cartQty: number;
  items: VisitorItem[];
  lastActivity: string | null;
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

function formatLogDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("en-PH");
}

function shortId(value: string) {
  if (!value) return "";
  return value.slice(0, 8);
}

function maxDate(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
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
  const [topClicks, setTopClicks] = React.useState<ProductClickRow[]>([]);
  const [topClicksLoading, setTopClicksLoading] = React.useState(false);
  const [topClicksError, setTopClicksError] = React.useState<string | null>(null);
  const [visitorRows, setVisitorRows] = React.useState<VisitorRow[]>([]);
  const [visitorLoading, setVisitorLoading] = React.useState(false);
  const [visitorError, setVisitorError] = React.useState<string | null>(null);

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
    refreshAll();
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

  async function loadTopClicks() {
    setTopClicksLoading(true);
    setTopClicksError(null);

    const { data, error } = await supabase
      .from("product_clicks")
      .select(
        "product_id,clicks,last_clicked_at,product:products(id,title,brand,model,variation,image_urls)"
      )
      .order("clicks", { ascending: false })
      .limit(10);

    if (error) {
      setTopClicksError(error.message || "Failed to load top clicks.");
      setTopClicks([]);
    } else {
      const normalized = (data as any[] | null)?.map((row) => ({
        ...row,
        product: Array.isArray(row.product)
          ? row.product[0] ?? null
          : row.product ?? null,
      }));
      setTopClicks((normalized as ProductClickRow[]) ?? []);
    }

    setTopClicksLoading(false);
  }

  async function loadVisitors() {
    setVisitorLoading(true);
    setVisitorError(null);

    try {
      const [cartRes, guestCartRes, userClickRes, guestClickRes] = await Promise.all([
        supabase
          .from("cart_items")
          .select(
            "id,user_id,variant_id,qty,created_at, variant:product_variants(id,condition,price,qty, product:products(id,title,brand,model,variation,image_urls))"
          )
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("guest_cart_items")
          .select(
            "session_id,variant_id,qty,updated_at, variant:product_variants(id,condition,price,qty, product:products(id,title,brand,model,variation,image_urls))"
          )
          .order("updated_at", { ascending: false })
          .limit(5000),
        supabase
          .from("user_product_clicks")
          .select("user_id,clicks,last_clicked_at")
          .order("last_clicked_at", { ascending: false })
          .limit(5000),
        supabase
          .from("guest_product_clicks")
          .select("session_id,clicks,last_clicked_at")
          .order("last_clicked_at", { ascending: false })
          .limit(5000),
      ]);

      if (cartRes.error) throw cartRes.error;
      if (guestCartRes.error) throw guestCartRes.error;
      if (userClickRes.error) throw userClickRes.error;
      if (guestClickRes.error) throw guestClickRes.error;

      const cartLines = (cartRes.data as any[]) ?? [];
      const guestCartLines = (guestCartRes.data as any[]) ?? [];
      const userClicks = (userClickRes.data as any[]) ?? [];
      const guestClicks = (guestClickRes.data as any[]) ?? [];

      const userIds = new Set<string>();
      cartLines.forEach((line) => {
        const id = String(line?.user_id ?? "").trim();
        if (id) userIds.add(id);
      });
      userClicks.forEach((row) => {
        const id = String(row?.user_id ?? "").trim();
        if (id) userIds.add(id);
      });

      const sessionIds = new Set<string>();
      guestCartLines.forEach((line) => {
        const id = String(line?.session_id ?? "").trim();
        if (id) sessionIds.add(id);
      });
      guestClicks.forEach((row) => {
        const id = String(row?.session_id ?? "").trim();
        if (id) sessionIds.add(id);
      });

      const [profilesRes, guestSessionsRes] = await Promise.all([
        userIds.size
          ? supabase
              .from("profiles")
              .select("id,full_name,username")
              .in("id", Array.from(userIds))
          : Promise.resolve({ data: [] }),
        sessionIds.size
          ? supabase
              .from("guest_sessions")
              .select("id,last_seen_at,created_at")
              .in("id", Array.from(sessionIds))
          : Promise.resolve({ data: [] }),
      ]);

      const profiles = (profilesRes as any)?.data ?? [];
      const guestSessions = (guestSessionsRes as any)?.data ?? [];

      const profileMap = new Map<string, { full_name?: string; username?: string }>();
      profiles.forEach((row: any) => {
        if (!row?.id) return;
        profileMap.set(String(row.id), {
          full_name: row.full_name ?? "",
          username: row.username ?? "",
        });
      });

      const guestSessionMap = new Map<string, { last_seen_at?: string | null }>();
      guestSessions.forEach((row: any) => {
        if (!row?.id) return;
        guestSessionMap.set(String(row.id), {
          last_seen_at: row.last_seen_at ?? null,
        });
      });

      const userClickMap = new Map<string, { clicks: number; last: string | null }>();
      userClicks.forEach((row) => {
        const userId = String(row?.user_id ?? "").trim();
        if (!userId) return;
        const clicks = Number(row?.clicks ?? 0);
        const last = row?.last_clicked_at ? String(row.last_clicked_at) : null;
        const current = userClickMap.get(userId) ?? { clicks: 0, last: null };
        current.clicks += clicks;
        current.last = maxDate(current.last, last);
        userClickMap.set(userId, current);
      });

      const guestClickMap = new Map<string, { clicks: number; last: string | null }>();
      guestClicks.forEach((row) => {
        const sessionId = String(row?.session_id ?? "").trim();
        if (!sessionId) return;
        const clicks = Number(row?.clicks ?? 0);
        const last = row?.last_clicked_at ? String(row.last_clicked_at) : null;
        const current = guestClickMap.get(sessionId) ?? { clicks: 0, last: null };
        current.clicks += clicks;
        current.last = maxDate(current.last, last);
        guestClickMap.set(sessionId, current);
      });

      const authMap = new Map<
        string,
        VisitorRow & { itemMap: Map<string, number> }
      >();
      for (const line of cartLines) {
        const userId = String(line?.user_id ?? "").trim();
        if (!userId) continue;
        const qty = Number(line?.qty ?? 0);
        const variant = line?.variant ?? null;
        const product = variant?.product ?? null;
        const itemName = buildItemLabel(product);
        const current =
          authMap.get(userId) ??
          ({
            id: userId,
            kind: "ACCOUNT",
            label: "",
            clicks: 0,
            cartLines: 0,
            cartQty: 0,
            items: [],
            lastActivity: null,
            itemMap: new Map<string, number>(),
          } as VisitorRow & { itemMap: Map<string, number> });

        current.cartLines += 1;
        current.cartQty += qty;
        current.itemMap.set(itemName, (current.itemMap.get(itemName) ?? 0) + qty);
        current.lastActivity = maxDate(
          current.lastActivity,
          line?.created_at ? String(line.created_at) : null
        );
        authMap.set(userId, current);
      }

      const authRows: VisitorRow[] = [];
      const authIds = new Set<string>([...authMap.keys(), ...userClickMap.keys()]);
      authIds.forEach((userId) => {
        const base = authMap.get(userId) ?? ({
          id: userId,
          kind: "ACCOUNT",
          label: "",
          clicks: 0,
          cartLines: 0,
          cartQty: 0,
          items: [],
          lastActivity: null,
          itemMap: new Map<string, number>(),
        } as VisitorRow & { itemMap: Map<string, number> });
        const profile = profileMap.get(userId);
        const displayName =
          profile?.full_name?.trim() ||
          profile?.username?.trim() ||
          `User ${shortId(userId)}`;
        const clickInfo = userClickMap.get(userId);
        base.label = displayName;
        base.clicks = clickInfo?.clicks ?? 0;
        base.lastActivity = maxDate(base.lastActivity, clickInfo?.last ?? null);
        base.items = Array.from(base.itemMap.entries()).map(([name, qty]) => ({
          name,
          qty,
        }));
        authRows.push(base);
      });

      const guestMap = new Map<
        string,
        VisitorRow & { itemMap: Map<string, number> }
      >();
      for (const line of guestCartLines) {
        const sessionId = String(line?.session_id ?? "").trim();
        if (!sessionId) continue;
        const qty = Number(line?.qty ?? 0);
        const variant = line?.variant ?? null;
        const product = variant?.product ?? null;
        const itemName = buildItemLabel(product);
        const current =
          guestMap.get(sessionId) ??
          ({
            id: sessionId,
            kind: "GUEST",
            label: "",
            clicks: 0,
            cartLines: 0,
            cartQty: 0,
            items: [],
            lastActivity: null,
            itemMap: new Map<string, number>(),
          } as VisitorRow & { itemMap: Map<string, number> });

        current.cartLines += 1;
        current.cartQty += qty;
        current.itemMap.set(itemName, (current.itemMap.get(itemName) ?? 0) + qty);
        current.lastActivity = maxDate(
          current.lastActivity,
          line?.updated_at ? String(line.updated_at) : null
        );
        guestMap.set(sessionId, current);
      }

      const guestRows: VisitorRow[] = [];
      const guestIds = new Set<string>([
        ...guestMap.keys(),
        ...guestClickMap.keys(),
      ]);
      guestIds.forEach((sessionId) => {
        const base = guestMap.get(sessionId) ?? ({
          id: sessionId,
          kind: "GUEST",
          label: "",
          clicks: 0,
          cartLines: 0,
          cartQty: 0,
          items: [],
          lastActivity: null,
          itemMap: new Map<string, number>(),
        } as VisitorRow & { itemMap: Map<string, number> });
        const clickInfo = guestClickMap.get(sessionId);
        const sessionInfo = guestSessionMap.get(sessionId);
        base.label = `Guest ${shortId(sessionId)}`;
        base.clicks = clickInfo?.clicks ?? 0;
        base.lastActivity = maxDate(base.lastActivity, clickInfo?.last ?? null);
        base.lastActivity = maxDate(
          base.lastActivity,
          sessionInfo?.last_seen_at ?? null
        );
        base.items = Array.from(base.itemMap.entries()).map(([name, qty]) => ({
          name,
          qty,
        }));
        guestRows.push(base);
      });

      const guestOnly = guestRows.sort((a, b) => {
        if (!a.lastActivity && !b.lastActivity) return b.clicks - a.clicks;
        if (!a.lastActivity) return 1;
        if (!b.lastActivity) return -1;
        return b.lastActivity.localeCompare(a.lastActivity);
      });

      setVisitorRows(guestOnly);
    } catch (e: any) {
      console.error(e);
      setVisitorError(e?.message ?? "Failed to load visitor carts.");
      setVisitorRows([]);
    } finally {
      setVisitorLoading(false);
    }
  }

  function refreshAll() {
    void load();
    void loadTopClicks();
    void loadVisitors();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xl font-semibold">
              <ShoppingCart className="h-5 w-5 text-amber-300" />
              Cart + Click Insights
            </div>
            <div className="text-sm text-white/60">
              See which items are most often left in carts and most clicked in the shop.
            </div>
          </div>
          <Badge className="border-amber-500/30 text-amber-200">{rows.length} items</Badge>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 sm:p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Cart lines</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
                  <ShoppingCart className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-amber-200">{stats.lines}</div>
            </div>
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3 sm:p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Customers</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-200">
                  <Users className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-sky-200">{stats.customers}</div>
            </div>
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3 sm:p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Total qty</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-200">
                  <Layers className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-violet-200">{stats.qty}</div>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 sm:p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Variants</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                  <Boxes className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-emerald-200">{stats.variants}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
            <div className="flex items-center gap-2 font-semibold">
              <SlidersHorizontal className="h-4 w-4 text-sky-200" />
              Filters
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Input
                label="Lookback days"
                type="number"
                min={0}
                max={3650}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                hint="0 = all time"
                className="w-full sm:w-[160px]"
              />
              <Input
                label="Max items"
                type="number"
                min={0}
                max={200}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                hint="0 = show all"
                className="w-full sm:w-[160px]"
              />
              <Select
                label="Sort by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "qty" | "customers")}
                className="w-full sm:w-[200px]"
              >
                <option value="qty">Most qty in carts</option>
                <option value="customers">Most customers</option>
              </Select>
              <Button
                variant="secondary"
                onClick={refreshAll}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
            <div className="flex items-center gap-2 font-semibold">
              <BarChart3 className="h-4 w-4 text-amber-200" />
              Most in carts
            </div>
            <div className="mt-3 space-y-2">
              {loading ? (
                <div className="text-sm text-white/60">Loading cart insights...</div>
              ) : visibleRows.length === 0 ? (
                <div className="text-sm text-white/60">No cart items found.</div>
              ) : (
                visibleRows.map((row) => {
                  const condition = formatConditionLabel(row.condition, { upper: true });
                  const stockLow = row.stock > 0 && row.stock <= row.qty;
                  return (
                    <div
                      key={row.key}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-paper/5 px-3 py-2 sm:py-3"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3 sm:min-w-[240px]">
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
                          <div className="flex items-center justify-end gap-1 text-xs text-white/60">
                            <ShoppingCart className="h-3 w-3" />
                            In carts
                          </div>
                          <div className="text-lg font-semibold">{row.qty}</div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1 text-xs text-white/60">
                            <Users className="h-3 w-3" />
                            Customers
                          </div>
                          <div className="text-lg font-semibold">{row.customers}</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold">
                <MousePointerClick className="h-4 w-4 text-sky-200" />
                Most clicked items
              </div>
              <Button
                variant="ghost"
                onClick={loadTopClicks}
                disabled={topClicksLoading}
              >
                {topClicksLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
            <div className="mt-1 text-xs text-white/60">Based on shop product clicks.</div>
            <div className="mt-3 space-y-2">
              {topClicksError ? (
                <div className="text-sm text-red-200">{topClicksError}</div>
              ) : null}
              {topClicksLoading && topClicks.length === 0 ? (
                <div className="text-sm text-white/60">Loading click stats...</div>
              ) : null}
              {topClicks.length === 0 && !topClicksLoading ? (
                <div className="text-sm text-white/60">No click data yet.</div>
              ) : null}
              {topClicks.length ? (
                topClicks.map((row) => {
                  const product = row.product;
                  const image = product?.image_urls?.[0] ?? null;
                  return (
                    <div
                      key={row.product_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-paper/5 px-3 py-2 sm:py-3"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3 sm:min-w-[240px]">
                        <div className="h-12 w-12 rounded-lg border border-white/10 bg-bg-800 overflow-hidden flex-shrink-0">
                          {image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={image} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {product?.title ?? "Unknown item"}
                          </div>
                          <div className="text-xs text-white/60">
                            {product?.brand ?? "-"}
                            {product?.model ? ` | ${product.model}` : ""}
                          </div>
                          {row.last_clicked_at ? (
                            <div className="text-xs text-white/50">
                              Last click: {formatLogDate(row.last_clicked_at)}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1 text-xs text-white/60">
                          <MousePointerClick className="h-3 w-3" />
                          Clicks
                        </div>
                        <div className="text-lg font-semibold">{row.clicks}</div>
                      </div>
                    </div>
                  );
                })
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold">
                <Users className="h-4 w-4 text-emerald-200" />
                Guest carts
              </div>
              <Button
                variant="ghost"
                onClick={loadVisitors}
                disabled={visitorLoading}
              >
                {visitorLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
            <div className="mt-1 text-xs text-white/60">
              Shows guest sessions only, with total clicks and current cart contents.
            </div>
            <div className="mt-3 space-y-2">
              {visitorError ? (
                <div className="text-sm text-red-200">{visitorError}</div>
              ) : null}
              {visitorLoading && visitorRows.length === 0 ? (
                <div className="text-sm text-white/60">Loading visitor carts...</div>
              ) : null}
              {!visitorLoading && visitorRows.length === 0 ? (
                <div className="text-sm text-white/60">No visitor carts found.</div>
              ) : null}
              {visitorRows.map((row) => {
                const itemsPreview = row.items.slice(0, 3);
                const remaining = row.items.length - itemsPreview.length;
                const itemSummary = itemsPreview
                  .map((item) => `${item.qty}× ${item.name}`)
                  .join(" · ");
                return (
                  <div
                    key={`${row.kind}-${row.id}`}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-paper/5 px-3 py-2 sm:py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium truncate">{row.label}</div>
                        <Badge
                          className={
                            row.kind === "GUEST"
                              ? "border-amber-500/30 text-amber-200"
                              : "border-sky-500/30 text-sky-200"
                          }
                        >
                          {row.kind === "GUEST" ? "Guest" : "Account"}
                        </Badge>
                        {row.lastActivity ? (
                          <span className="text-xs text-white/50">
                            Last activity: {formatLogDate(row.lastActivity)}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-white/60">
                        {row.cartLines > 0
                          ? `${row.cartLines} line(s) · ${row.cartQty} total qty`
                          : "Cart empty"}
                      </div>
                      {itemSummary ? (
                        <div className="text-xs text-white/50">
                          {itemSummary}
                          {remaining > 0 ? ` · +${remaining} more` : ""}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <div className="flex items-center justify-end gap-1 text-xs text-white/60">
                          <MousePointerClick className="h-3 w-3" />
                          Clicks
                        </div>
                        <div className="text-lg font-semibold">{row.clicks}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
