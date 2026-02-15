"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  CalendarRange,
  ClipboardList,
  Coins,
  Percent,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
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

function parseJsonMaybe(v: any) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return null;
}

function formatPickupDayLabel(value: string) {
  const day = value.trim().toUpperCase();
  if (day === "MON") return "Monday";
  if (day === "TUE") return "Tuesday";
  if (day === "WED") return "Wednesday";
  if (day === "THU") return "Thursday";
  if (day === "FRI") return "Friday";
  if (day === "SAT") return "Saturday";
  if (day === "SUN") return "Sunday";
  return value;
}

function mergeShippingDetails(order: any) {
  let details = parseJsonMaybe(order?.shipping_details) ?? {};
  const addressRaw = typeof order?.address === "string" ? order.address.trim() : "";
  const addressJson = addressRaw ? parseJsonMaybe(addressRaw) : null;
  if (addressJson && typeof addressJson === "object") {
    details = { ...addressJson, ...details };
  } else if (addressRaw) {
    const hasAddress =
      details.full_address ||
      details.address ||
      details.dropoff_address ||
      details.pickup_location;
    if (!hasAddress) details = { ...details, full_address: addressRaw };
  }
  return details;
}

function buildShippingSummary(order: any) {
  const details = mergeShippingDetails(order);
  const method = String(details.method ?? order?.shipping_method ?? "").trim();
  const methodLabel = method || String(order?.shipping_method ?? "-");
  const receiverName =
    details.receiver_name ||
    [details.first_name, details.last_name].filter(Boolean).join(" ") ||
    order?.customer_name ||
    "Guest";
  const receiverPhone =
    details.receiver_phone || details.phone || order?.customer_phone || order?.contact || "-";
  const receiverEmail = details.receiver_email || details.email || order?.customer_email || "";

  const dropoff = typeof details.dropoff_address === "string" ? details.dropoff_address.trim() : "";
  const pickupLocation =
    typeof details.pickup_location === "string" ? details.pickup_location.trim() : "";
  const pickupDirectory =
    typeof details.pickup_directory === "string" ? details.pickup_directory.trim() : "";
  const fullAddress = typeof details.full_address === "string" ? details.full_address.trim() : "";
  const detailAddress = typeof details.address === "string" ? details.address.trim() : "";
  const address =
    method.toUpperCase() === "PICKUP"
      ? pickupLocation || detailAddress || fullAddress
      : method.toUpperCase() === "LBC"
      ? dropoff || fullAddress || detailAddress
      : fullAddress || dropoff || detailAddress;

  const branch =
    [details.branch_name || details.branch, details.branch_city]
      .filter(Boolean)
      .join(", ") || "";
  const notes = details.notes || details.note || "";
  const pickupDay =
    typeof details.pickup_day === "string"
      ? formatPickupDayLabel(details.pickup_day)
      : "";
  const pickupSlot =
    typeof details.pickup_slot === "string" ? details.pickup_slot.trim() : "";
  const text = typeof details.text === "string" ? details.text.trim() : "";

  const lines: string[] = [];
  if (text) lines.push(text);
  if (address && !lines.some((l) => l.includes(address))) lines.push(address);
  if (pickupDirectory) lines.push(`Directory: ${pickupDirectory}`);
  if (branch) lines.push(`Branch: ${branch}`);
  if (pickupDay || pickupSlot) {
    const slot = [pickupDay, pickupSlot].filter(Boolean).join(" ");
    lines.push(`Pickup: ${slot}`);
  }
  if (notes) lines.push(`Notes: ${notes}`);

  return {
    method: methodLabel,
    receiverName,
    receiverPhone,
    receiverEmail,
    address: address || "-",
    lines,
  };
}

function getItemTitle(it: any) {
  return (
    it?.item_name ||
    it?.product_title ||
    it?.product_variant?.product?.title ||
    "Item"
  );
}

function getItemThumb(it: any): string | null {
  const urls = it?.product_variant?.product?.image_urls;
  if (Array.isArray(urls) && urls.length) return String(urls[0]);
  return null;
}

function getItemPrice(it: any): number {
  const pickMoney = (value: any) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const direct =
    pickMoney(it?.price_each) ??
    pickMoney(it?.unit_price) ??
    pickMoney(it?.price);
  if (direct !== null && direct > 0) return direct;

  const qty = Math.max(1, Number(it?.qty ?? 1));
  const lineTotal = pickMoney(it?.line_total);
  if (lineTotal !== null && lineTotal > 0) return lineTotal / qty;

  const variantPrice = pickMoney(it?.product_variant?.price);
  if (variantPrice !== null && variantPrice > 0) return variantPrice;

  return direct ?? lineTotal ?? 0;
}

type DetailsModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

function DetailsModal({ open, onClose, title, children }: DetailsModalProps) {
  React.useEffect(() => {
    if (!open) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-black/70 p-4"
      onClick={onClose}
    >
      <div className="mx-auto w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="text-lg font-semibold">{title}</div>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </CardHeader>
          <CardBody className="max-h-[75vh] overflow-y-auto">{children}</CardBody>
        </Card>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

export default function AdminSalesPage() {
  const today = React.useMemo(() => new Date(), []);
  const [from, setFrom] = React.useState(() => {
    const d = new Date();
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    return ymd(first);
  });
  const [to, setTo] = React.useState(() => ymd(today));

  const [loading, setLoading] = React.useState(false);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [orderSummaries, setOrderSummaries] = React.useState<
    Array<{
      id: string;
      created_at: string;
      channel: string;
      revenue: number;
      cogs: number;
      discount_total: number;
      shipping_discount: number;
    }>
  >([]);
  const [daily, setDaily] = React.useState<{ date: string; total: number; count: number }[]>([]);
  const [selectedDailyDate, setSelectedDailyDate] = React.useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = React.useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = React.useState<any | null>(null);
  const [selectedOrderItems, setSelectedOrderItems] = React.useState<any[]>([]);
  const [itemSummaries, setItemSummaries] = React.useState<
    Array<{ key: string; name: string; qty: number; sales: number; cogs: number; profit: number }>
  >([]);
  const [selectedChannel, setSelectedChannel] = React.useState<string | null>(null);
  const [orderDetailsLoading, setOrderDetailsLoading] = React.useState(false);
  const [orderDetailsError, setOrderDetailsError] = React.useState<string | null>(null);
  const [selectedKpi, setSelectedKpi] = React.useState<
    "sales" | "orders" | "aov" | "cogs" | "profit" | "margin" | null
  >(null);
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
      const num = (value: any) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
      };
      const startISO = `${from}T00:00:00`;
      const endISO = `${to}T23:59:59`;

      let { data: o, error } = await supabase
        .from("orders")
        .select(
          "id,created_at,total,channel,payment_status,discount_total,shipping_discount"
        )
        .or("payment_status.eq.PAID,channel.eq.POS")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .order("created_at", { ascending: true })
        .limit(5000);

      if (error && String(error.message ?? "").includes("channel")) {
        const retry = await supabase
          .from("orders")
          .select(
            "id,created_at,total,channel,payment_status,discount_total,shipping_discount"
          )
          .eq("payment_status", "PAID")
          .gte("created_at", startISO)
          .lte("created_at", endISO)
          .order("created_at", { ascending: true })
          .limit(5000);
        o = retry.data;
        error = retry.error;
      }

      if (error) throw error;

      const list = (o as any[]) ?? [];
      setOrders(list);
      const discountByOrder = new Map<string, number>();
      list.forEach((row) => {
        const discountTotal = num(row?.discount_total);
        const shippingDiscount = num(row?.shipping_discount);
        const itemDiscount = Math.max(0, discountTotal - shippingDiscount);
        if (itemDiscount > 0 && row?.id) {
          discountByOrder.set(String(row.id), itemDiscount);
        }
      });

      // Top items
      const ids = list.map((x) => x.id);
      if (!ids.length) {
        setTopItems([]);
        setDaily([]);
        setChannelBreakdown({});
        setOrderSummaries([]);
        setItemSummaries([]);
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
        "order_id,variant_id,item_id,item_name,qty,line_total,unit_price,price_each,cost_each,product_variant:product_variants(id,cost,price,product:products(id,title,brand,model,variation,image_urls))";

      const { data: items, error: iErr } = await supabase
        .from("order_items")
        .select(itemSelect)
        .in("order_id", ids)
        .limit(10000);

      if (iErr) throw iErr;

      const rows = (items as any[]) ?? [];
      const missingVariantIds = Array.from(
        new Set(
          rows
            .filter((it) => !it?.product_variant && it?.item_id)
            .map((it) => String(it.item_id))
            .filter(Boolean)
        )
      );

      const fallbackVariants = new Map<string, any>();
      if (missingVariantIds.length) {
        const { data: vRows, error: vErr } = await supabase
          .from("product_variants")
          .select("id,cost,price,product:products(id,title,brand,model,variation,image_urls)")
          .in("id", missingVariantIds)
          .limit(10000);
        if (vErr) throw vErr;
        (vRows as any[] | null)?.forEach((v) => {
          if (v?.id) fallbackVariants.set(String(v.id), v);
        });
      }
      const imap = new Map<
        string,
        { key: string; name: string; qty: number; sales: number; cogs: number; profit: number }
      >();
      const orderRaw = new Map<string, { revenue: number; cogs: number }>();
      const itemEntries: Array<{
        orderId: string;
        key: string;
        name: string;
        qty: number;
        sales: number;
        cogs: number;
      }> = [];
      let missingOrderCounter = 0;

      for (const it of rows) {
        const name = buildItemLabel(it);
        const qtyRaw = num(it.qty ?? 0);
        const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
        const lineTotalRaw = num(it.line_total ?? 0);
        const unitRaw = num(
          it?.price_each ??
            it?.unit_price ??
            it?.product_variant?.price ??
            fallbackVariants.get(String(it?.item_id ?? ""))?.price ??
            0
        );
        const safeUnit = Number.isFinite(unitRaw) ? unitRaw : 0;
        const sales =
          Number.isFinite(lineTotalRaw) && lineTotalRaw > 0
            ? lineTotalRaw
            : safeUnit * qty;
        const costEachRaw = num(
          it?.cost_each ??
            it?.product_variant?.cost ??
            fallbackVariants.get(String(it?.item_id ?? ""))?.cost ??
            0
        );
        const costEach = Number.isFinite(costEachRaw) ? costEachRaw : 0;
        const itemCogs = qty * costEach;

        const variantId = it?.variant_id ? String(it.variant_id) : "";
        const key = variantId ? `variant:${variantId}` : `name:${name}`;
        let orderId = it?.order_id ? String(it.order_id) : "";
        if (!orderId) {
          orderId = `missing-${missingOrderCounter++}`;
        }

        itemEntries.push({
          orderId,
          key,
          name,
          qty,
          sales,
          cogs: itemCogs,
        });

        const curOrder = orderRaw.get(orderId) ?? { revenue: 0, cogs: 0 };
        curOrder.revenue += sales;
        curOrder.cogs += itemCogs;
        orderRaw.set(orderId, curOrder);
      }

      const orderAdjusted = new Map<string, { revenue: number; cogs: number; factor: number }>();
      let revenueTotal = 0;
      let cogsTotal = 0;

      for (const [orderId, cur] of orderRaw.entries()) {
        const discount = Math.min(discountByOrder.get(orderId) ?? 0, cur.revenue);
        const revenue = cur.revenue - discount;
        const factor = cur.revenue > 0 ? revenue / cur.revenue : 1;
        orderAdjusted.set(orderId, { revenue, cogs: cur.cogs, factor });
        revenueTotal += revenue;
        cogsTotal += cur.cogs;
      }

      const summaries = list.map((row) => {
        const id = String(row.id);
        const adjusted = orderAdjusted.get(id);
        return {
          id,
          created_at: row.created_at,
          channel: String(row.channel ?? "WEB").toUpperCase(),
          revenue: adjusted?.revenue ?? 0,
          cogs: adjusted?.cogs ?? 0,
          discount_total: num(row?.discount_total),
          shipping_discount: num(row?.shipping_discount),
        };
      });
      setOrderSummaries(summaries);

      for (const entry of itemEntries) {
        const factor = orderAdjusted.get(entry.orderId)?.factor ?? 1;
        const adjustedSales = entry.sales * factor;
        const cur = imap.get(entry.key) ?? {
          key: entry.key,
          name: entry.name,
          qty: 0,
          sales: 0,
          cogs: 0,
          profit: 0,
        };
        cur.qty += entry.qty;
        cur.sales += adjustedSales;
        cur.cogs += entry.cogs;
        cur.profit = cur.sales - cur.cogs;
        if (cur.name === "Item" && entry.name !== "Item") cur.name = entry.name;
        imap.set(entry.key, cur);
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
        const amt = orderAdjusted.get(String(row.id))?.revenue ?? 0;

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
      setItemSummaries(
        Array.from(imap.values()).sort((a, b) => b.profit - a.profit)
      );
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
  const itemSummarySorted = React.useMemo(() => {
    return [...itemSummaries].sort((a, b) => b.profit - a.profit);
  }, [itemSummaries]);
  const orderSummarySorted = React.useMemo(() => {
    return [...orderSummaries].sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at))
    );
  }, [orderSummaries]);
  const channelOrders = React.useMemo(() => {
    if (!selectedChannel) return [];
    return orderSummarySorted.filter(
      (o) => String(o.channel ?? "WEB").toUpperCase() === selectedChannel
    );
  }, [orderSummarySorted, selectedChannel]);
  const selectedDailyOrders = React.useMemo(() => {
    if (!selectedDailyDate) return [];
    return orders.filter((o) => ymd(new Date(o.created_at)) === selectedDailyDate);
  }, [orders, selectedDailyDate]);
  const selectedDailySummary = React.useMemo(
    () => daily.find((d) => d.date === selectedDailyDate) ?? null,
    [daily, selectedDailyDate]
  );

  React.useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrder(null);
      setSelectedOrderItems([]);
      setOrderDetailsError(null);
      return;
    }

    const loadDetails = async () => {
      setOrderDetailsLoading(true);
      setOrderDetailsError(null);
      try {
        const { data: order, error: orderError } = await supabase
          .from("orders")
          .select(
            "id,created_at,total,subtotal,shipping_fee,discount_total,shipping_method,shipping_details,payment_status,status,channel,customer_name,customer_phone,contact,address"
          )
          .eq("id", selectedOrderId)
          .single();
        if (orderError) throw orderError;

        const { data: items, error: itemsError } = await supabase
          .from("order_items")
          .select(
            "order_id,variant_id,item_id,item_name,product_title,qty,line_total,unit_price,price_each,condition,issue_notes,product_variant:product_variants(id,barcode,condition,issue_notes,public_notes,price,qty,product:products(id,title,brand,model,variation,image_urls))"
          )
          .eq("order_id", selectedOrderId)
          .limit(200);
        if (itemsError) throw itemsError;

        setSelectedOrder(order ?? null);
        setSelectedOrderItems((items as any[]) ?? []);
      } catch (err: any) {
        setOrderDetailsError(err?.message ?? "Failed to load order details.");
      } finally {
        setOrderDetailsLoading(false);
      }
    };

    loadDetails();
  }, [selectedOrderId]);

  return (
    <RequireAuth>
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xl font-semibold">
                <BarChart3 className="h-5 w-5 text-amber-300" />
                Sales Report
              </div>
              <div className="text-sm text-white/60">
                PAID orders + POS channel (payment_status = PAID OR channel = POS)
              </div>
            </div>
            <Badge className="border-amber-500/30 text-amber-200">{orders.length} orders</Badge>
          </CardHeader>
          <CardBody className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <button
                type="button"
                onClick={() => setSelectedKpi("sales")}
                className="text-left rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 transition hover:border-amber-500/40 hover:bg-amber-500/10"
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                  <span>Total Sales</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
                    <Wallet className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-semibold text-amber-200">{peso(totals.sales)}</div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedKpi("orders")}
                className="text-left rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 transition hover:border-sky-500/40 hover:bg-sky-500/10"
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                  <span>Orders</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-200">
                    <ClipboardList className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-semibold text-sky-200">{totals.count}</div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedKpi("aov")}
                className="text-left rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 transition hover:border-violet-500/40 hover:bg-violet-500/10"
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                  <span>Avg Order Value</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-200">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-semibold text-violet-200">{peso(totals.aov)}</div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedKpi("cogs")}
                className="text-left rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 transition hover:border-orange-500/40 hover:bg-orange-500/10"
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                  <span>COGS</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-200">
                    <Coins className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-semibold text-orange-200">{peso(totals.cogs)}</div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedKpi("profit")}
                className="text-left rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 transition hover:border-emerald-500/40 hover:bg-emerald-500/10"
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                  <span>Gross Profit</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                    <BarChart3 className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-semibold text-emerald-200">{peso(totals.grossProfit)}</div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedKpi("margin")}
                className="text-left rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 transition hover:border-indigo-500/40 hover:bg-indigo-500/10"
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                  <span>Gross Margin</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-200">
                    <Percent className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-semibold text-indigo-200">{formatPercent(totals.grossMargin)}</div>
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
              <div className="flex items-center gap-2 font-semibold">
                <CalendarRange className="h-4 w-4 text-sky-200" />
                Filters
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="block">
                  <div className="mb-1 text-sm text-white/80">From</div>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-bg-800 px-4 py-2 text-white sm:w-[180px]"
                  />
                </label>
                <label className="block">
                  <div className="mb-1 text-sm text-white/80">To</div>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-bg-800 px-4 py-2 text-white sm:w-[180px]"
                  />
                </label>
                <Button variant="secondary" onClick={run} disabled={loading} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  {loading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                <div className="flex items-center gap-2 font-semibold">
                  <CalendarRange className="h-4 w-4 text-amber-200" />
                  Daily Totals
                </div>
                <div className="mt-3 space-y-2">
                  {daily.length === 0 ? (
                    <div className="text-sm text-white/60">No paid orders in range.</div>
                  ) : (
                    daily.map((d) => (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => setSelectedDailyDate(d.date)}
                        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-paper/5 px-3 py-2 text-left transition hover:border-white/20 hover:bg-bg-900/40"
                      >
                        <div className="text-sm text-white/80">{d.date}</div>
                        <div className="text-sm text-white/60">{d.count} orders</div>
                        <div className="font-semibold">{peso(d.total)}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                <div className="flex items-center gap-2 font-semibold">
                  <BarChart3 className="h-4 w-4 text-emerald-200" />
                  Channel Breakdown
                </div>
                <div className="mt-3 space-y-2">
                  {channels.length === 0 ? (
                    <div className="text-sm text-white/60">No data.</div>
                  ) : (
                    channels.map(([ch, v]) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setSelectedChannel(ch)}
                        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-paper/5 px-3 py-2 text-left transition hover:border-white/20 hover:bg-bg-900/40"
                      >
                        <div className="text-sm text-white/80">{ch}</div>
                        <div className="text-sm text-white/60">{v.count} orders</div>
                        <div className="font-semibold">{peso(v.sales)}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
              <div className="flex items-center gap-2 font-semibold">
                <TrendingUp className="h-4 w-4 text-violet-200" />
                Top-Selling Items
              </div>
              <div className="mt-3 space-y-2">
                {topItems.length === 0 ? (
                  <div className="text-sm text-white/60">No items.</div>
                ) : (
                  topItems.map((it) => (
                    <div
                      key={it.key}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-paper/5 px-3 py-2"
                    >
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

        <DetailsModal
          open={Boolean(selectedDailyDate)}
          onClose={() => setSelectedDailyDate(null)}
          title={
            selectedDailyDate
              ? `Orders for ${selectedDailyDate}`
              : "Orders for selected day"
          }
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
              <div>
                Orders:{" "}
                <span className="text-white font-semibold">
                  {selectedDailySummary?.count ?? selectedDailyOrders.length}
                </span>
              </div>
              <div>
                Total:{" "}
                <span className="text-white font-semibold">
                  {peso(selectedDailySummary?.total ?? 0)}
                </span>
              </div>
            </div>

            {selectedDailyOrders.length === 0 ? (
              <div className="text-sm text-white/60">No orders found for this day.</div>
            ) : (
              <div className="space-y-2">
                {selectedDailyOrders.map((o) => {
                  const time = new Date(o.created_at).toLocaleTimeString("en-PH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedOrderId(String(o.id))}
                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-paper/5 px-3 py-2 text-left transition hover:border-white/20 hover:bg-bg-900/40"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">
                          Order #{String(o.id).slice(0, 8)}
                        </div>
                        <div className="text-xs text-white/60">
                          {time} · {String(o.channel ?? "WEB").toUpperCase()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{peso(Number(o.total ?? 0))}</div>
                        <div className="text-xs text-white/60">
                          {String(o.payment_status ?? "").toUpperCase()}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DetailsModal>

        <DetailsModal
          open={Boolean(selectedKpi)}
          onClose={() => setSelectedKpi(null)}
          title={
            selectedKpi === "sales"
              ? "Total Sales"
              : selectedKpi === "orders"
              ? "Orders"
              : selectedKpi === "aov"
              ? "Average Order Value"
              : selectedKpi === "cogs"
              ? "COGS"
              : selectedKpi === "profit"
              ? "Gross Profit"
              : selectedKpi === "margin"
              ? "Gross Margin"
              : "Details"
          }
        >
          <div className="space-y-4">
            {selectedKpi === "sales" ? (
              <div className="text-sm text-white/70">
                Total sales = sum of each order&apos;s net revenue (item total minus
                item-level discounts). Shipping-only discounts are excluded from
                sales.
              </div>
            ) : null}
            {selectedKpi === "orders" ? (
              <div className="text-sm text-white/70">
                Orders = count of PAID orders plus POS channel orders within the
                selected date range.
              </div>
            ) : null}
            {selectedKpi === "aov" ? (
              <div className="text-sm text-white/70">
                Average order value = Total Sales ÷ Orders.
              </div>
            ) : null}
            {selectedKpi === "cogs" ? (
              <div className="text-sm text-white/70">
                COGS = sum of item costs (cost_each × qty) for all orders in range.
              </div>
            ) : null}
            {selectedKpi === "profit" ? (
              <div className="text-sm text-white/70">
                Gross profit = Total Sales − COGS.
              </div>
            ) : null}
            {selectedKpi === "margin" ? (
              <div className="text-sm text-white/70">
                Gross margin = (Gross Profit ÷ Total Sales) × 100%.
              </div>
            ) : null}

            <div className="rounded-xl border border-white/10 bg-paper/5 p-3 text-sm text-white/80">
              <div className="flex flex-wrap items-center gap-3">
                <div>Total Sales: <span className="font-semibold">{peso(totals.sales)}</span></div>
                <div>Orders: <span className="font-semibold">{totals.count}</span></div>
                <div>AOV: <span className="font-semibold">{peso(totals.aov)}</span></div>
                <div>COGS: <span className="font-semibold">{peso(totals.cogs)}</span></div>
                <div>Profit: <span className="font-semibold">{peso(totals.grossProfit)}</span></div>
                <div>Margin: <span className="font-semibold">{formatPercent(totals.grossMargin)}</span></div>
              </div>
            </div>

            {selectedKpi === "profit" ? (
              <div className="space-y-2">
                {itemSummarySorted.length === 0 ? (
                  <div className="text-sm text-white/60">No items found.</div>
                ) : (
                  itemSummarySorted.slice(0, 200).map((it) => (
                    <div
                      key={it.key}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-paper/5 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{it.name}</div>
                        <div className="text-xs text-white/60">
                          Units {it.qty} · Revenue {peso(it.sales)} · COGS {peso(it.cogs)}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className={`font-semibold ${it.profit >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                          {peso(it.profit)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {itemSummarySorted.length > 200 ? (
                  <div className="text-xs text-white/50">
                    Showing top 200 items by profit.
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {orderSummarySorted.length === 0 ? (
                    <div className="text-sm text-white/60">No orders found.</div>
                  ) : (
                    orderSummarySorted.slice(0, 100).map((o) => {
                      const time = new Date(o.created_at).toLocaleString("en-PH", {
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const itemDiscount = Math.max(0, o.discount_total - o.shipping_discount);
                      const profit = o.revenue - o.cogs;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            setSelectedKpi(null);
                            setSelectedOrderId(o.id);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-paper/5 px-3 py-2 text-left transition hover:border-white/20 hover:bg-bg-900/40"
                        >
                          <div className="min-w-0">
                            <div className="font-medium">
                              Order #{o.id.slice(0, 8)}
                            </div>
                            <div className="text-xs text-white/60">
                              {time} · {o.channel}
                            </div>
                            <div className="text-xs text-white/60">
                              Item discount: {peso(itemDiscount)}
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <div className="font-semibold">{peso(o.revenue)}</div>
                            <div className="text-xs text-white/60">
                              COGS {peso(o.cogs)} · Profit {peso(profit)}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {orderSummarySorted.length > 100 ? (
                  <div className="text-xs text-white/50">
                    Showing 100 most recent orders.
                  </div>
                ) : null}
              </>
            )}
          </div>
        </DetailsModal>

        <DetailsModal
          open={Boolean(selectedChannel)}
          onClose={() => setSelectedChannel(null)}
          title={selectedChannel ? `${selectedChannel} Orders` : "Channel Orders"}
        >
          <div className="space-y-3">
            <div className="text-sm text-white/70">
              Showing orders for channel{" "}
              <span className="text-white font-semibold">{selectedChannel}</span>.
            </div>
            {channelOrders.length === 0 ? (
              <div className="text-sm text-white/60">No orders found.</div>
            ) : (
              <div className="space-y-2">
                {channelOrders.map((o) => {
                  const time = new Date(o.created_at).toLocaleString("en-PH", {
                    month: "short",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const itemDiscount = Math.max(0, o.discount_total - o.shipping_discount);
                  const profit = o.revenue - o.cogs;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        setSelectedChannel(null);
                        setSelectedOrderId(o.id);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-paper/5 px-3 py-2 text-left transition hover:border-white/20 hover:bg-bg-900/40"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">
                          Order #{o.id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-white/60">
                          {time} · {o.channel}
                        </div>
                        <div className="text-xs text-white/60">
                          Item discount: {peso(itemDiscount)}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-semibold">{peso(o.revenue)}</div>
                        <div className="text-xs text-white/60">
                          COGS {peso(o.cogs)} · Profit {peso(profit)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DetailsModal>

        <DetailsModal
          open={Boolean(selectedOrderId)}
          onClose={() => setSelectedOrderId(null)}
          title={
            selectedOrderId
              ? `Order #${String(selectedOrderId).slice(0, 8)}`
              : "Order details"
          }
        >
          {orderDetailsLoading ? (
            <div className="text-sm text-white/60">Loading order details...</div>
          ) : orderDetailsError ? (
            <div className="text-sm text-red-200">{orderDetailsError}</div>
          ) : !selectedOrder ? (
            <div className="text-sm text-white/60">Order not found.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-white/60">
                    {new Date(selectedOrder.created_at).toLocaleString("en-PH")}
                  </div>
                  <div className="mt-1 text-sm text-white/80">
                    Channel: {String(selectedOrder.channel ?? "WEB").toUpperCase()}
                  </div>
                  <div className="text-sm text-white/80">
                    Status: {String(selectedOrder.status ?? "").toUpperCase()}
                  </div>
                  <div className="text-sm text-white/80">
                    Payment: {String(selectedOrder.payment_status ?? "").toUpperCase()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/50">Total</div>
                  <div className="text-lg font-semibold">
                    {peso(Number(selectedOrder.total ?? 0))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-white/50">
                    Customer
                  </div>
                  {(() => {
                    const ship = buildShippingSummary(selectedOrder);
                    return (
                      <>
                        <div className="mt-1 font-medium">{ship.receiverName}</div>
                        <div className="text-sm text-white/70">{ship.receiverPhone}</div>
                        {ship.receiverEmail ? (
                          <div className="text-sm text-white/70">{ship.receiverEmail}</div>
                        ) : null}
                        <div className="mt-1 text-sm text-white/70">{ship.address}</div>
                      </>
                    );
                  })()}
                </div>
                <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-white/50">
                    Totals
                  </div>
                  <div className="mt-1 text-sm text-white/80">
                    Subtotal:{" "}
                    <span className="text-white">
                      {peso(Number(selectedOrder.subtotal ?? 0))}
                    </span>
                  </div>
                  <div className="text-sm text-white/80">
                    Shipping:{" "}
                    <span className="text-white">
                      {peso(Number(selectedOrder.shipping_fee ?? 0))}
                    </span>
                  </div>
                  <div className="text-sm text-white/80">
                    Discount:{" "}
                    <span className="text-white">
                      -{peso(Number(selectedOrder.discount_total ?? 0))}
                    </span>
                  </div>
                  <div className="mt-1 font-semibold">
                    Total: {peso(Number(selectedOrder.total ?? 0))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                <div className="text-[11px] uppercase tracking-wide text-white/50">
                  Shipping
                </div>
                {(() => {
                  const ship = buildShippingSummary(selectedOrder);
                  return (
                    <>
                      <div className="mt-1 text-sm text-white/80">
                        Method: {ship.method || "-"}
                      </div>
                      {ship.lines.length ? (
                        <div className="mt-1 space-y-1 text-sm text-white/70">
                          {ship.lines.map((line, idx) => (
                            <div key={`${line}-${idx}`}>{line}</div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-1 text-sm text-white/70">
                          No shipping details.
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div>
                <div className="text-sm font-semibold text-white/80">
                  Items ({selectedOrderItems.length})
                </div>
                {selectedOrderItems.length === 0 ? (
                  <div className="text-sm text-white/60 mt-2">No items found.</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedOrderItems.map((it) => {
                      const title = getItemTitle(it);
                      const thumb = getItemThumb(it);
                      const unit = getItemPrice(it);
                      const qty = Number(it?.qty ?? 1);
                      const line = Number(it?.line_total ?? unit * qty);
                      const notes = String(
                        it?.product_variant?.public_notes ??
                          it?.issue_notes ??
                          it?.product_variant?.issue_notes ??
                          ""
                      ).trim();
                      return (
                        <div
                          key={`${it.order_id}-${it.variant_id ?? it.item_id ?? title}`}
                          className="rounded-xl border border-white/10 bg-bg-900/30 p-2 flex gap-3"
                        >
                          <div className="h-12 w-12 rounded-lg bg-bg-800 border border-white/10 overflow-hidden flex-shrink-0">
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumb}
                                alt={title}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{title}</div>
                            <div className="text-xs text-white/60">
                              {qty} x {peso(unit)} | Line: {peso(line)}
                            </div>
                            {notes ? (
                              <div className="mt-1 text-xs text-white/60">
                                Notes: {notes}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DetailsModal>
      </div>
    </RequireAuth>
  );
}






























