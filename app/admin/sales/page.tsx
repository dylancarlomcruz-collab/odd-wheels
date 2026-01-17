"use client";

import * as React from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { supabase } from "@/lib/supabase/browser";

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

function formatPercent(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(1)}%`;
}

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AdminSalesPage() {
  const today = React.useMemo(() => new Date(), []);
  const [from, setFrom] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return ymd(d);
  });
  const [to, setTo] = React.useState(() => ymd(today));

  const [loading, setLoading] = React.useState(false);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [daily, setDaily] = React.useState<{ date: string; total: number; count: number }[]>([]);
  const [topItems, setTopItems] = React.useState<
    { key: string; name: string; qty: number; sales: number; cogs: number; profit: number }[]
  >([]);
  const [channelBreakdown, setChannelBreakdown] = React.useState<Record<string, { count: number; sales: number }>>({});
  const [totals, setTotals] = React.useState({
    sales: 0,
    count: 0,
    aov: 0,
    cogs: 0,
    grossProfit: 0,
    grossMargin: 0,
  });

  function buildItemLabel(it: any) {
    if (it?.item_name) return String(it.item_name);
    const product = it?.product_variant?.product;
    if (!product) return "Item";
    const title = String(product.title ?? "").trim();
    const brand = String(product.brand ?? "").trim();
    const model = String(product.model ?? "").trim();
    const variation = String(product.variation ?? "").trim();
    const base = title || [brand, model].filter(Boolean).join(" ");
    const label = [base, variation].filter(Boolean).join(" - ");
    return label || "Item";
  }

  async function run() {
    setLoading(true);
    try {
      const startISO = `${from}T00:00:00`;
      const endISO = `${to}T23:59:59`;

      const { data: o, error } = await supabase
        .from("orders")
        .select("id,created_at,total,channel,payment_status")
        .eq("payment_status", "PAID")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .order("created_at", { ascending: true })
        .limit(5000);

      if (error) throw error;

      const list = (o as any[]) ?? [];
      setOrders(list);

      // Top items
      const ids = list.map((x) => x.id);
      if (!ids.length) {
        setTopItems([]);
        setDaily([]);
        setChannelBreakdown({});
        setTotals({
          sales: 0,
          count: 0,
          aov: 0,
          cogs: 0,
          grossProfit: 0,
          grossMargin: 0,
        });
        return;
      }

      const itemSelect =
        "order_id,variant_id,item_name,qty,line_total,cost_each,product_variant:product_variants(id,cost,product:products(id,title,brand,model,variation,image_urls))";

      const { data: items, error: iErr } = await supabase
        .from("order_items")
        .select(itemSelect)
        .in("order_id", ids)
        .limit(10000);

      if (iErr) throw iErr;

      const rows = (items as any[]) ?? [];
      const imap = new Map<string, { key: string; name: string; qty: number; sales: number; cogs: number; profit: number }>();
      const omap = new Map<string, { revenue: number; cogs: number }>();
      let revenueTotal = 0;
      let cogsTotal = 0;

      for (const it of rows) {
        const name = buildItemLabel(it);
        const qtyRaw = Number(it.qty ?? 0);
        const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
        const salesRaw = Number(it.line_total ?? 0);
        const sales = Number.isFinite(salesRaw) ? salesRaw : 0;
        const costEachRaw = Number(it?.cost_each ?? it?.product_variant?.cost ?? 0);
        const costEach = Number.isFinite(costEachRaw) ? costEachRaw : 0;
        const itemCogs = qty * costEach;
        revenueTotal += sales;
        cogsTotal += itemCogs;

        const orderId = it?.order_id ? String(it.order_id) : "";
        if (orderId) {
          const curOrder = omap.get(orderId) ?? { revenue: 0, cogs: 0 };
          curOrder.revenue += sales;
          curOrder.cogs += itemCogs;
          omap.set(orderId, curOrder);
        }

        const variantId = it?.variant_id ? String(it.variant_id) : "";
        const key = variantId ? `variant:${variantId}` : `name:${name}`;
        const cur = imap.get(key) ?? { key, name, qty: 0, sales: 0, cogs: 0, profit: 0 };
        cur.qty += qty;
        cur.sales += sales;
        cur.cogs += itemCogs;
        cur.profit = cur.sales - cur.cogs;
        if (cur.name === "Item" && name !== "Item") cur.name = name;
        imap.set(key, cur);
      }

      const grossProfit = revenueTotal - cogsTotal;
      const grossMargin = revenueTotal ? (grossProfit / revenueTotal) * 100 : 0;
      const count = list.length;
      setTotals({
        sales: revenueTotal,
        count,
        aov: count ? revenueTotal / count : 0,
        cogs: cogsTotal,
        grossProfit,
        grossMargin,
      });

      const dmap = new Map<string, { date: string; total: number; count: number }>();
      const cmap: Record<string, { count: number; sales: number }> = {};

      for (const row of list) {
        const dt = new Date(row.created_at);
        const key = ymd(dt);
        const amt = omap.get(String(row.id))?.revenue ?? 0;

        const cur = dmap.get(key) ?? { date: key, total: 0, count: 0 };
        cur.total += amt;
        cur.count += 1;
        dmap.set(key, cur);

        const ch = String(row.channel ?? "WEB").toUpperCase();
        cmap[ch] = cmap[ch] ?? { count: 0, sales: 0 };
        cmap[ch].count += 1;
        cmap[ch].sales += amt;
      }

      const dailyRows = Array.from(dmap.values()).sort((a, b) => a.date.localeCompare(b.date));
      setDaily(dailyRows);
      setChannelBreakdown(cmap);

      const tops = Array.from(imap.values()).sort((a, b) => b.sales - a.sales).slice(0, 15);
      setTopItems(tops);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to load sales report");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const channels = Object.entries(channelBreakdown).sort((a, b) => b[1].sales - a[1].sales);

  return (
    <RequireAuth>
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">Sales Report</div>
              <div className="text-sm text-white/60">PAID orders only (payment_status = PAID)</div>
            </div>
            <Badge>{orders.length} orders</Badge>
          </CardHeader>
          <CardBody className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                <div className="text-sm text-white/60">Total Sales</div>
                <div className="text-2xl font-semibold">{peso(totals.sales)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                <div className="text-sm text-white/60">Orders</div>
                <div className="text-2xl font-semibold">{totals.count}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                <div className="text-sm text-white/60">Avg Order Value</div>
                <div className="text-2xl font-semibold">{peso(totals.aov)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                <div className="text-sm text-white/60">COGS</div>
                <div className="text-2xl font-semibold">{peso(totals.cogs)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                <div className="text-sm text-white/60">Gross Profit</div>
                <div className="text-2xl font-semibold">{peso(totals.grossProfit)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                <div className="text-sm text-white/60">Gross Margin</div>
                <div className="text-2xl font-semibold">{formatPercent(totals.grossMargin)}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
              <div className="font-semibold">Filters</div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="block">
                  <div className="mb-1 text-sm text-white/80">From</div>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full sm:w-[180px] rounded-xl bg-bg-800 border border-white/10 px-4 py-2 text-white"
                  />
                </label>
                <label className="block">
                  <div className="mb-1 text-sm text-white/80">To</div>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full sm:w-[180px] rounded-xl bg-bg-800 border border-white/10 px-4 py-2 text-white"
                  />
                </label>
                <Button variant="secondary" onClick={run} disabled={loading}>
                  {loading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                <div className="font-semibold">Daily Totals</div>
                <div className="mt-3 space-y-2">
                  {daily.length === 0 ? (
                    <div className="text-sm text-white/60">No paid orders in range.</div>
                  ) : (
                    daily.map((d) => (
                      <div key={d.date} className="flex items-center justify-between rounded-xl border border-white/10 bg-paper/5 px-3 py-2">
                        <div className="text-sm text-white/80">{d.date}</div>
                        <div className="text-sm text-white/60">{d.count} orders</div>
                        <div className="font-semibold">{peso(d.total)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                <div className="font-semibold">Channel Breakdown</div>
                <div className="mt-3 space-y-2">
                  {channels.length === 0 ? (
                    <div className="text-sm text-white/60">No data.</div>
                  ) : (
                    channels.map(([ch, v]) => (
                      <div key={ch} className="flex items-center justify-between rounded-xl border border-white/10 bg-paper/5 px-3 py-2">
                        <div className="text-sm text-white/80">{ch}</div>
                        <div className="text-sm text-white/60">{v.count} orders</div>
                        <div className="font-semibold">{peso(v.sales)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
              <div className="font-semibold">Top-Selling Items</div>
              <div className="mt-3 space-y-2">
                {topItems.length === 0 ? (
                  <div className="text-sm text-white/60">No items.</div>
                ) : (
                  topItems.map((it) => (
                    <div key={it.key} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-paper/5 px-3 py-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{it.name}</div>
                        <div className="text-xs text-white/60">
                          Units {it.qty} | Revenue {peso(it.sales)} | COGS {peso(it.cogs)} | Profit {peso(it.profit)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{peso(it.sales)}</div>
                        <div className={`text-xs ${it.profit >= 0 ? "text-emerald-300" : "text-red-300"}`}>{peso(it.profit)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </RequireAuth>
  );
}






























