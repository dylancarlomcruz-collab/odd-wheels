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
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { supabase } from "@/lib/supabase/browser";
import { cropStyle, parseImageCrop } from "@/lib/imageCrop";

const CART_EVENT = "oddwheels:cart-updated";

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

function formatDateTimeLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
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
  const deliveryFeeNote = details.delivery_fee_note || details.shipping_fee_note || "";
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
  if (deliveryFeeNote) lines.push(`Delivery fee: ${deliveryFeeNote}`);
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

function buildOrderEditDraft(order: any): OrderEditDraft {
  const details = mergeShippingDetails(order);
  return {
    soldAt: formatDateTimeLocalInput(order?.created_at),
    customerName: String(
      details.receiver_name ||
        [details.first_name, details.last_name].filter(Boolean).join(" ") ||
        order?.customer_name ||
        ""
    ).trim(),
    customerPhone: String(
      details.receiver_phone || details.phone || order?.customer_phone || order?.contact || ""
    ).trim(),
    customerEmail: String(
      details.receiver_email || details.email || order?.customer_email || ""
    ).trim(),
    address: String(
      details.full_address ||
        details.address ||
        details.dropoff_address ||
        details.pickup_location ||
        order?.address ||
        ""
    ).trim(),
    paymentMethod: String(order?.payment_method ?? "").trim().toUpperCase(),
    channel: String(order?.channel ?? "WEB").trim().toUpperCase(),
    shippingMethod: String(details.method ?? order?.shipping_method ?? "")
      .trim()
      .toUpperCase(),
    notes: String(details.notes || details.note || "").trim(),
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
  const snapshot = String(it?.image_url ?? "").trim();
  if (snapshot) return snapshot;
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

function getItemCostEach(it: any): number {
  const pickMoney = (value: any) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const direct = pickMoney(it?.cost_each);
  if (direct !== null && direct > 0) return direct;

  const variantCost = pickMoney(it?.product_variant?.cost);
  if (variantCost !== null && variantCost > 0) return variantCost;

  return direct ?? variantCost ?? 0;
}

function getItemLineTotal(it: any): number {
  const n = Number(it?.line_total);
  if (Number.isFinite(n) && n > 0) return n;
  return getItemPrice(it) * Math.max(1, Number(it?.qty ?? 1));
}

function emitCartUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CART_EVENT, { detail: { source: "admin-sales-revert" } })
  );
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

type OrderSaleItem = {
  key: string;
  itemKey: string;
  title: string;
  qty: number;
  lineTotal: number;
};

type SoldWithItem = {
  title: string;
  qty: number;
};

type SoldItemOccurrence = {
  orderId: string;
  soldAt: string;
  qty: number;
  lineTotal: number;
  channel: string;
  payment_status: string;
  payment_method: string;
  shipping_method: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
  soldWith: SoldWithItem[];
};

type SoldItemCard = {
  key: string;
  name: string;
  brand: string;
  model: string;
  variation: string;
  imageUrl: string | null;
  unitPrice: number;
  totalQty: number;
  totalSales: number;
  totalCogs: number;
  totalProfit: number;
  orderCount: number;
  latestCustomer: string;
  latestSoldAt: string;
  soldWithTop: SoldWithItem[];
  occurrences: SoldItemOccurrence[];
};

type OrderEditDraft = {
  soldAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: string;
  paymentMethod: string;
  channel: string;
  shippingMethod: string;
  notes: string;
};

export default function AdminSalesPage() {
  const { user } = useAuth();
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
      itemsSold: number;
      discount_total: number;
      shipping_discount: number;
    }>
  >([]);
  const [daily, setDaily] = React.useState<{ date: string; total: number; count: number }[]>([]);
  const [selectedDailyDate, setSelectedDailyDate] = React.useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = React.useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = React.useState<any | null>(null);
  const [selectedOrderItems, setSelectedOrderItems] = React.useState<any[]>([]);
  const [editingOrderDetails, setEditingOrderDetails] = React.useState(false);
  const [savingOrderDetails, setSavingOrderDetails] = React.useState(false);
  const [openOrderEditorOnLoad, setOpenOrderEditorOnLoad] = React.useState(false);
  const [orderEditDraft, setOrderEditDraft] = React.useState<OrderEditDraft>({
    soldAt: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    address: "",
    paymentMethod: "",
    channel: "",
    shippingMethod: "",
    notes: "",
  });
  const [itemSummaries, setItemSummaries] = React.useState<
    Array<{ key: string; name: string; qty: number; sales: number; cogs: number; profit: number }>
  >([]);
  const [selectedChannel, setSelectedChannel] = React.useState<string | null>(null);
  const [orderDetailsLoading, setOrderDetailsLoading] = React.useState(false);
  const [orderDetailsError, setOrderDetailsError] = React.useState<string | null>(null);
  const [orderSaveError, setOrderSaveError] = React.useState<string | null>(null);
  const [revertingOrderId, setRevertingOrderId] = React.useState<string | null>(
    null
  );
  const [revertingToCart, setRevertingToCart] = React.useState(false);
  const [selectedKpi, setSelectedKpi] = React.useState<
    "sales" | "orders" | "aov" | "cogs" | "profit" | "margin" | null
  >(null);
  const [topItems, setTopItems] = React.useState<
    { key: string; name: string; qty: number; sales: number; cogs: number; profit: number }[]
  >([]);
  const [soldItems, setSoldItems] = React.useState<SoldItemCard[]>([]);
  const [selectedSoldItemKey, setSelectedSoldItemKey] = React.useState<string | null>(
    null
  );
  const [soldItemQuery, setSoldItemQuery] = React.useState("");
  const [channelBreakdown, setChannelBreakdown] = React.useState<Record<string, { count: number; sales: number }>>({});
  const [totals, setTotals] = React.useState({
    sales: 0,
    count: 0,
    itemsSold: 0,
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
      const orderSelect =
        "id,created_at,total,channel,payment_status,payment_method,shipping_method,shipping_details,customer_name,customer_phone,contact,address,discount_total,shipping_discount";

      let { data: o, error } = await supabase
        .from("orders")
        .select(orderSelect)
        .or("payment_status.eq.PAID,channel.eq.POS")
        .not("status", "in", "(VOIDED,CANCELLED)")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .order("created_at", { ascending: true })
        .limit(5000);

      if (error && String(error.message ?? "").includes("channel")) {
        const retry = await supabase
          .from("orders")
          .select(orderSelect)
          .eq("payment_status", "PAID")
          .not("status", "in", "(VOIDED,CANCELLED)")
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
        setSoldItems([]);
        setDaily([]);
        setChannelBreakdown({});
        setOrderSummaries([]);
        setItemSummaries([]);
        setTotals({
          sales: 0,
          count: 0,
          itemsSold: 0,
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
            .filter((it) => !it?.product_variant)
            .map((it) => String(it?.variant_id ?? it?.item_id ?? "").trim())
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
      const orderRaw = new Map<
        string,
        { revenue: number; cogs: number; itemsSold: number }
      >();
      const orderItemsMap = new Map<string, Map<string, OrderSaleItem>>();
      const itemOrderMap = new Map<
        string,
        {
          orderId: string;
          key: string;
          name: string;
          qty: number;
          sales: number;
          cogs: number;
          unitPrice: number;
          imageUrl: string | null;
          brand: string;
          model: string;
          variation: string;
        }
      >();
      let missingOrderCounter = 0;

      for (const it of rows) {
        const fallbackVariant =
          it?.product_variant ??
          fallbackVariants.get(String(it?.variant_id ?? "").trim()) ??
          fallbackVariants.get(String(it?.item_id ?? "").trim()) ??
          null;
        const next =
          fallbackVariant && !it?.product_variant
            ? { ...it, product_variant: fallbackVariant }
            : it;
        const name = buildItemLabel(next);
        const qtyRaw = num(next.qty ?? 0);
        const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
        const lineTotalRaw = num(next.line_total ?? 0);
        const unitRaw = num(
          next?.price_each ?? next?.unit_price ?? next?.product_variant?.price ?? 0
        );
        const safeUnit = Number.isFinite(unitRaw) ? unitRaw : 0;
        const unitPrice = safeUnit > 0 ? safeUnit : getItemPrice(next);
        const sales =
          Number.isFinite(lineTotalRaw) && lineTotalRaw > 0
            ? lineTotalRaw
            : safeUnit * qty;
        const costEachRaw = num(next?.cost_each ?? next?.product_variant?.cost ?? 0);
        const costEach = Number.isFinite(costEachRaw) ? costEachRaw : 0;
        const itemCogs = qty * costEach;
        const product = next?.product_variant?.product;
        const brand = String(product?.brand ?? "").trim();
        const model = String(product?.model ?? "").trim();
        const variation = String(product?.variation ?? "").trim();
        const imageUrl = getItemThumb(next);

        const variantId = next?.variant_id ? String(next.variant_id) : "";
        const key = variantId ? `variant:${variantId}` : `name:${name}`;
        let orderId = next?.order_id ? String(next.order_id) : "";
        if (!orderId) {
          orderId = `missing-${missingOrderCounter++}`;
        }

        const itemOrderKey = `${orderId}::${key}`;
        const currentItemOrder = itemOrderMap.get(itemOrderKey) ?? {
          orderId,
          key,
          name,
          qty: 0,
          sales: 0,
          cogs: 0,
          unitPrice,
          imageUrl,
          brand,
          model,
          variation,
        };
        currentItemOrder.qty += qty;
        currentItemOrder.sales += sales;
        currentItemOrder.cogs += itemCogs;
        if (!(currentItemOrder.unitPrice > 0) && unitPrice > 0) {
          currentItemOrder.unitPrice = unitPrice;
        }
        if (!currentItemOrder.imageUrl && imageUrl) currentItemOrder.imageUrl = imageUrl;
        if (!currentItemOrder.brand && brand) currentItemOrder.brand = brand;
        if (!currentItemOrder.model && model) currentItemOrder.model = model;
        if (!currentItemOrder.variation && variation) {
          currentItemOrder.variation = variation;
        }
        itemOrderMap.set(itemOrderKey, currentItemOrder);

        const curOrder = orderRaw.get(orderId) ?? {
          revenue: 0,
          cogs: 0,
          itemsSold: 0,
        };
        curOrder.revenue += sales;
        curOrder.cogs += itemCogs;
        curOrder.itemsSold += qty;
        orderRaw.set(orderId, curOrder);

        const currentItems = orderItemsMap.get(orderId) ?? new Map<string, OrderSaleItem>();
        const currentOrderItem = currentItems.get(key) ?? {
          key: `${orderId}:${key}`,
          itemKey: key,
          title: name,
          qty: 0,
          lineTotal: 0,
        };
        currentOrderItem.qty += qty;
        currentOrderItem.lineTotal += sales;
        currentItems.set(key, currentOrderItem);
        orderItemsMap.set(orderId, currentItems);
      }

      const orderAdjusted = new Map<
        string,
        { revenue: number; cogs: number; factor: number; itemsSold: number }
      >();
      let revenueTotal = 0;
      let cogsTotal = 0;
      let itemsSoldTotal = 0;

      for (const [orderId, cur] of orderRaw.entries()) {
        const discount = Math.min(discountByOrder.get(orderId) ?? 0, cur.revenue);
        const revenue = cur.revenue - discount;
        const factor = cur.revenue > 0 ? revenue / cur.revenue : 1;
        orderAdjusted.set(orderId, {
          revenue,
          cogs: cur.cogs,
          factor,
          itemsSold: cur.itemsSold,
        });
        revenueTotal += revenue;
        cogsTotal += cur.cogs;
        itemsSoldTotal += cur.itemsSold;
      }

      const itemEntries = Array.from(itemOrderMap.values());
      const summaries = list.map((row) => {
        const id = String(row.id);
        const adjusted = orderAdjusted.get(id);
        return {
          id,
          created_at: row.created_at,
          channel: String(row.channel ?? "WEB").toUpperCase(),
          revenue: adjusted?.revenue ?? 0,
          cogs: adjusted?.cogs ?? 0,
          itemsSold: adjusted?.itemsSold ?? 0,
          discount_total: num(row?.discount_total),
          shipping_discount: num(row?.shipping_discount),
        };
      });
      setOrderSummaries(summaries);
      const orderMetaById = new Map(
        list.map((row) => {
          const id = String(row.id);
          const shipping = buildShippingSummary(row);
          const channel = String(row.channel ?? "WEB").toUpperCase();
          const shippingMethodRaw = String(
            shipping.method ?? row.shipping_method ?? ""
          ).trim();
          const shippingMethod = shippingMethodRaw
            ? shippingMethodRaw.toUpperCase()
            : channel === "POS"
            ? "WALK-IN"
            : "-";

          return [
            id,
            {
              soldAt: String(row.created_at ?? ""),
              channel,
              payment_status:
                String(row.payment_status ?? "").trim().toUpperCase() || "-",
              payment_method:
                String(row.payment_method ?? "").trim().toUpperCase() || "-",
              shipping_method: shippingMethod,
              customer_name: String(shipping.receiverName ?? "Guest"),
              customer_phone: String(shipping.receiverPhone ?? "-"),
              customer_email: String(shipping.receiverEmail ?? "").trim(),
              customer_address: String(shipping.address ?? "-"),
            },
          ] as const;
        })
      );
      const soldItemMap = new Map<string, SoldItemCard>();

      for (const entry of itemEntries) {
        const factor = orderAdjusted.get(entry.orderId)?.factor ?? 1;
        const adjustedSales = entry.sales * factor;
        const orderMeta = orderMetaById.get(entry.orderId);
        if (!orderMeta) continue;

        const soldWith = Array.from(
          (orderItemsMap.get(entry.orderId) ?? new Map<string, OrderSaleItem>()).values()
        )
          .filter((item) => item.itemKey !== entry.key)
          .map((item) => ({
            title: item.title,
            qty: item.qty,
          }))
          .sort((a, b) => b.qty - a.qty || a.title.localeCompare(b.title));

        const current = soldItemMap.get(entry.key) ?? {
          key: entry.key,
          name: entry.name,
          brand: entry.brand,
          model: entry.model,
          variation: entry.variation,
          imageUrl: entry.imageUrl,
          unitPrice: entry.unitPrice,
          totalQty: 0,
          totalSales: 0,
          totalCogs: 0,
          totalProfit: 0,
          orderCount: 0,
          latestCustomer: "",
          latestSoldAt: "",
          soldWithTop: [],
          occurrences: [],
        };

        current.totalQty += entry.qty;
        current.totalSales += adjustedSales;
        current.totalCogs += entry.cogs;
        current.totalProfit = current.totalSales - current.totalCogs;
        if (!current.imageUrl && entry.imageUrl) current.imageUrl = entry.imageUrl;
        if (!(current.unitPrice > 0) && entry.unitPrice > 0) {
          current.unitPrice = entry.unitPrice;
        }
        if (!current.brand && entry.brand) current.brand = entry.brand;
        if (!current.model && entry.model) current.model = entry.model;
        if (!current.variation && entry.variation) current.variation = entry.variation;
        current.occurrences.push({
          orderId: entry.orderId,
          soldAt: orderMeta.soldAt,
          qty: entry.qty,
          lineTotal: adjustedSales,
          channel: orderMeta.channel,
          payment_status: orderMeta.payment_status,
          payment_method: orderMeta.payment_method,
          shipping_method: orderMeta.shipping_method,
          customer_name: orderMeta.customer_name,
          customer_phone: orderMeta.customer_phone,
          customer_email: orderMeta.customer_email,
          customer_address: orderMeta.customer_address,
          soldWith,
        });
        soldItemMap.set(entry.key, current);
      }

      const soldCards = Array.from(soldItemMap.values())
        .map((item) => {
          const occurrences = [...item.occurrences].sort((a, b) =>
            String(b.soldAt).localeCompare(String(a.soldAt))
          );
          const companionMap = new Map<string, number>();
          occurrences.forEach((occurrence) => {
            occurrence.soldWith.forEach((other) => {
              companionMap.set(
                other.title,
                (companionMap.get(other.title) ?? 0) + other.qty
              );
            });
          });
          return {
            ...item,
            orderCount: occurrences.length,
            latestCustomer: occurrences[0]?.customer_name ?? "Guest",
            latestSoldAt: occurrences[0]?.soldAt ?? "",
            soldWithTop: Array.from(companionMap.entries())
              .map(([title, qty]) => ({ title, qty }))
              .sort((a, b) => b.qty - a.qty || a.title.localeCompare(b.title))
              .slice(0, 3),
            occurrences,
          };
        })
        .sort(
          (a, b) =>
            String(b.latestSoldAt).localeCompare(String(a.latestSoldAt)) ||
            b.totalSales - a.totalSales
        );
      setSoldItems(soldCards);

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
        itemsSold: itemsSoldTotal,
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
  const filteredSoldItems = React.useMemo(() => {
    const query = soldItemQuery.trim().toLowerCase();
    if (!query) return soldItems;
    return soldItems.filter((item) => {
      const soldWith = item.soldWithTop.map((entry) => entry.title).join(" ");
      const customers = item.occurrences
        .map((occurrence) => occurrence.customer_name)
        .join(" ");
      return [
        item.name,
        item.brand,
        item.model,
        item.variation,
        item.latestCustomer,
        soldWith,
        customers,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [soldItemQuery, soldItems]);
  const visibleSoldItems = filteredSoldItems;
  const selectedSoldItem = React.useMemo(
    () => soldItems.find((item) => item.key === selectedSoldItemKey) ?? null,
    [soldItems, selectedSoldItemKey]
  );
  const selectedDailyOrders = React.useMemo(() => {
    if (!selectedDailyDate) return [];
    return orders.filter((o) => ymd(new Date(o.created_at)) === selectedDailyDate);
  }, [orders, selectedDailyDate]);
  const selectedDailySummary = React.useMemo(
    () => daily.find((d) => d.date === selectedDailyDate) ?? null,
    [daily, selectedDailyDate]
  );
  const selectedOrderRevenueFactor = React.useMemo(() => {
    const rawValueTotal = selectedOrderItems.reduce(
      (sum, item) => sum + getItemLineTotal(item),
      0
    );
    if (!(rawValueTotal > 0)) return 1;

    const discountTotal = Number(selectedOrder?.discount_total ?? 0);
    const shippingDiscount = Number(selectedOrder?.shipping_discount ?? 0);
    const itemDiscount = Math.max(0, discountTotal - shippingDiscount);
    const adjustedRevenue = Math.max(0, rawValueTotal - Math.min(itemDiscount, rawValueTotal));

    return adjustedRevenue / rawValueTotal;
  }, [selectedOrder, selectedOrderItems]);

  React.useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrder(null);
      setSelectedOrderItems([]);
      setOrderDetailsError(null);
      setOrderSaveError(null);
      setEditingOrderDetails(false);
      setSavingOrderDetails(false);
      setOpenOrderEditorOnLoad(false);
      return;
    }

    const loadDetails = async () => {
      setOrderDetailsLoading(true);
      setOrderDetailsError(null);
      try {
        const { data: order, error: orderError } = await supabase
          .from("orders")
          .select(
            "id,created_at,total,subtotal,shipping_fee,discount_total,shipping_discount,shipping_method,shipping_details,payment_status,payment_method,status,channel,customer_name,customer_phone,contact,address"
          )
          .eq("id", selectedOrderId)
          .single();
        if (orderError) throw orderError;

        const { data: items, error: itemsError } = await supabase
          .from("order_items")
          .select(
            "order_id,variant_id,item_id,item_name,product_title,image_url,qty,line_total,unit_price,price_each,cost_each,condition,issue_notes,product_variant:product_variants(id,barcode,condition,issue_notes,public_notes,cost,price,qty,product:products(id,title,brand,model,variation,image_urls))"
          )
          .eq("order_id", selectedOrderId)
          .limit(200);
        if (itemsError) throw itemsError;

        const rawItems = (items as any[]) ?? [];
        const missingVariantIds = Array.from(
          new Set(
            rawItems
              .filter((it) => !it?.product_variant)
              .map((it) => String(it?.variant_id ?? it?.item_id ?? "").trim())
              .filter(Boolean)
          )
        );

        const fallbackVariants = new Map<string, any>();
        if (missingVariantIds.length) {
          const { data: vRows, error: vErr } = await supabase
            .from("product_variants")
            .select(
              "id,barcode,condition,issue_notes,public_notes,cost,price,qty,product:products(id,title,brand,model,variation,image_urls)"
            )
            .in("id", missingVariantIds)
            .limit(1000);
          if (vErr) throw vErr;
          (vRows as any[] | null)?.forEach((v) => {
            if (v?.id) fallbackVariants.set(String(v.id), v);
          });
        }

        const hydratedItems = rawItems.map((it) => {
          const fallback =
            it?.product_variant ??
            fallbackVariants.get(String(it?.variant_id ?? "").trim()) ??
            fallbackVariants.get(String(it?.item_id ?? "").trim()) ??
            null;
          const next = fallback ? { ...it, product_variant: fallback } : it;
          const lineTotal = getItemLineTotal(next);
          const costEach = getItemCostEach(next);

          return {
            ...next,
            variant_id: next?.variant_id ?? fallback?.id ?? next?.item_id ?? null,
            cost_each: costEach > 0 ? costEach : next?.cost_each ?? null,
            line_total: lineTotal > 0 ? lineTotal : next?.line_total ?? 0,
          };
        });

        setSelectedOrder(order ?? null);
        setSelectedOrderItems(hydratedItems);
        setOrderSaveError(null);
      } catch (err: any) {
        setOrderDetailsError(err?.message ?? "Failed to load order details.");
      } finally {
        setOrderDetailsLoading(false);
      }
    };

    loadDetails();
  }, [selectedOrderId]);

  React.useEffect(() => {
    if (!selectedOrder) {
      setOrderEditDraft({
        soldAt: "",
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        address: "",
        paymentMethod: "",
        channel: "",
        shippingMethod: "",
        notes: "",
      });
      return;
    }

    setOrderEditDraft(buildOrderEditDraft(selectedOrder));
    setEditingOrderDetails(openOrderEditorOnLoad);
    if (openOrderEditorOnLoad) {
      setOpenOrderEditorOnLoad(false);
    }
  }, [selectedOrder]);

  async function saveOrderDetails() {
    if (!selectedOrder?.id) return;

    const existingDetails = mergeShippingDetails(selectedOrder);
    const soldAtValue = orderEditDraft.soldAt.trim();
    const soldAtDate = soldAtValue ? new Date(soldAtValue) : new Date(selectedOrder.created_at);
    if (Number.isNaN(soldAtDate.getTime())) {
      setOrderSaveError("Invalid sold date.");
      return;
    }
    const customerName = orderEditDraft.customerName.trim();
    const customerPhone = orderEditDraft.customerPhone.trim();
    const customerEmail = orderEditDraft.customerEmail.trim();
    const address = orderEditDraft.address.trim();
    const paymentMethod =
      orderEditDraft.paymentMethod.trim().toUpperCase() ||
      String(selectedOrder.payment_method ?? "").trim().toUpperCase() ||
      "GCASH";
    const channel =
      orderEditDraft.channel.trim().toUpperCase() ||
      String(selectedOrder.channel ?? "WEB").trim().toUpperCase() ||
      "WEB";
    const shippingMethod =
      orderEditDraft.shippingMethod.trim().toUpperCase() ||
      String(existingDetails.method ?? selectedOrder.shipping_method ?? "")
        .trim()
        .toUpperCase() ||
      "PICKUP";
    const notes = orderEditDraft.notes.trim();

    const nextShippingDetails: Record<string, any> = {
      ...existingDetails,
      method: shippingMethod,
      receiver_name: customerName || null,
      receiver_phone: customerPhone || null,
      phone: customerPhone || null,
      receiver_email: customerEmail || null,
      email: customerEmail || null,
      full_address: address || null,
      address: address || null,
      notes: notes || null,
    };

    if (shippingMethod === "PICKUP") {
      nextShippingDetails.pickup_location = address || null;
    }
    if (shippingMethod === "LBC" || shippingMethod === "LALAMOVE") {
      nextShippingDetails.dropoff_address = address || null;
    }

    setSavingOrderDetails(true);
    setOrderSaveError(null);
    try {
      const { data, error } = await supabase
        .from("orders")
        .update({
          created_at: soldAtDate.toISOString(),
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          contact: customerPhone || null,
          address: address || null,
          payment_method: paymentMethod,
          channel,
          shipping_method: shippingMethod,
          shipping_details: nextShippingDetails,
        })
        .eq("id", selectedOrder.id)
        .select(
          "id,created_at,total,subtotal,shipping_fee,discount_total,shipping_discount,shipping_method,shipping_details,payment_status,payment_method,status,channel,customer_name,customer_phone,contact,address"
        )
        .single();

      if (error) throw error;

      setSelectedOrder(data ?? null);
      setEditingOrderDetails(false);
      await run();
    } catch (err: any) {
      setOrderSaveError(err?.message ?? "Failed to save order details.");
    } finally {
      setSavingOrderDetails(false);
    }
  }

  async function addVariantsToCurrentCart(
    variantQtyToRestore: Map<string, number>
  ) {
    const userId = String(user?.id ?? "").trim();
    if (!userId) {
      throw new Error("Staff session not found. Please sign in again.");
    }

    const variantIds = Array.from(variantQtyToRestore.keys()).filter(Boolean);
    if (!variantIds.length) return { addedQty: 0, addedLines: 0 };

    const [existingRes, inventoryRes] = await Promise.all([
      supabase
        .from("cart_items")
        .select("id,variant_id,qty")
        .eq("user_id", userId)
        .in("variant_id", variantIds),
      supabase
        .from("product_variants")
        .select("id,qty")
        .in("id", variantIds),
    ]);

    if (existingRes.error) throw existingRes.error;
    if (inventoryRes.error) throw inventoryRes.error;

    const existingMap = new Map<
      string,
      { id: string; qty: number }
    >();
    (existingRes.data as any[] | null)?.forEach((row) => {
      if (!row?.id || !row?.variant_id) return;
      existingMap.set(String(row.variant_id), {
        id: String(row.id),
        qty: Math.max(0, Number(row.qty ?? 0)),
      });
    });

    const inventoryMap = new Map<string, number>();
    (inventoryRes.data as any[] | null)?.forEach((row) => {
      if (!row?.id) return;
      inventoryMap.set(String(row.id), Math.max(0, Number(row.qty ?? 0)));
    });

    const writes: PromiseLike<any>[] = [];
    let addedQty = 0;
    let addedLines = 0;

    for (const variantId of variantIds) {
      const restoreQty = Math.max(0, Number(variantQtyToRestore.get(variantId) ?? 0));
      if (!restoreQty) continue;

      const available = Math.max(0, Number(inventoryMap.get(variantId) ?? 0));
      if (!available) continue;

      const existing = existingMap.get(variantId);
      if (existing?.id) {
        const nextQty = Math.max(1, Math.min(existing.qty + restoreQty, available));
        if (nextQty !== existing.qty) {
          writes.push(
            supabase.from("cart_items").update({ qty: nextQty }).eq("id", existing.id)
          );
          addedQty += nextQty - existing.qty;
          addedLines += 1;
        }
        continue;
      }

      const nextQty = Math.max(1, Math.min(restoreQty, available));
      writes.push(
        supabase.from("cart_items").insert({
          user_id: userId,
          variant_id: variantId,
          qty: nextQty,
          protector_selected: false,
        })
      );
      addedQty += nextQty;
      addedLines += 1;
    }

    const results = await Promise.all(writes);
    const failed = results.find((result: any) => result?.error);
    if (failed?.error) throw failed.error;

    if (writes.length) {
      emitCartUpdated();
    }

    return { addedQty, addedLines };
  }

  async function revertSale(orderId: string, options?: { addToCart?: boolean }) {
    const shortId = String(orderId).slice(0, 8);
    const addToCart = Boolean(options?.addToCart);
    const confirmed = window.confirm(
      addToCart
        ? `Revert sale for order #${shortId} and add the items to your cart? This will void the order.`
        : `Revert sale for order #${shortId}? This will void the order.`
    );
    if (!confirmed) return;

    setRevertingOrderId(orderId);
    setRevertingToCart(addToCart);
    let reverted = false;
    try {
      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("variant_id,item_id,qty")
        .eq("order_id", orderId)
        .limit(500);
      if (itemsError) throw itemsError;

      const variantQtyToRestore = new Map<string, number>();
      (orderItems as any[] | null)?.forEach((it) => {
        const variantId = String(it?.variant_id ?? it?.item_id ?? "").trim();
        if (!variantId) return;
        const qty = Math.max(0, Number(it?.qty ?? 0));
        if (!qty) return;
        variantQtyToRestore.set(
          variantId,
          (variantQtyToRestore.get(variantId) ?? 0) + qty
        );
      });

      const variantIds = Array.from(variantQtyToRestore.keys());
      const beforeQty = new Map<string, number>();
      if (variantIds.length) {
        const { data: beforeRows, error: beforeErr } = await supabase
          .from("product_variants")
          .select("id,qty")
          .in("id", variantIds);
        if (beforeErr) throw beforeErr;
        (beforeRows as any[] | null)?.forEach((row) => {
          beforeQty.set(
            String(row.id),
            Math.max(0, Number(row?.qty ?? 0))
          );
        });
      }

      const { error } = await supabase.rpc("fn_staff_void_order", {
        p_order_id: orderId,
        p_reason: "Reverted from sales report",
      });
      if (error) throw error;
      reverted = true;

      // Guarantee stock is restored even if backend void function did not restock.
      if (variantIds.length) {
        const { data: afterRows, error: afterErr } = await supabase
          .from("product_variants")
          .select("id,qty")
          .in("id", variantIds);
        if (afterErr) throw afterErr;

        const afterQty = new Map<string, number>();
        (afterRows as any[] | null)?.forEach((row) => {
          afterQty.set(String(row.id), Math.max(0, Number(row?.qty ?? 0)));
        });

        for (const variantId of variantIds) {
          const restoreQty = variantQtyToRestore.get(variantId) ?? 0;
          if (restoreQty <= 0) continue;

          const before = beforeQty.get(variantId) ?? 0;
          const after = afterQty.get(variantId) ?? 0;
          const targetMin = before + restoreQty;
          if (after >= targetMin) continue;

          const { error: updateErr } = await supabase
            .from("product_variants")
            .update({ qty: targetMin })
            .eq("id", variantId);
          if (updateErr) throw updateErr;
        }
      }

      if (addToCart) {
        const result = await addVariantsToCurrentCart(variantQtyToRestore);
        if (result.addedQty <= 0) {
          throw new Error("Sale reverted, but no items could be added to cart.");
        }
      }

      setSelectedOrderId(null);
      await run();
    } catch (err: any) {
      if (reverted) {
        setSelectedOrderId(null);
        await run().catch(() => undefined);
        alert(
          err?.message ??
            (addToCart
              ? "Sale reverted, but the items could not be added to cart."
              : "Sale reverted, but a follow-up update failed.")
        );
      } else {
        alert(err?.message ?? "Failed to revert sale.");
      }
    } finally {
      setRevertingOrderId(null);
      setRevertingToCart(false);
    }
  }

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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    <TrendingUp className="h-4 w-4 text-violet-200" />
                    Sold Item Browse
                  </div>
                  <div className="text-sm text-white/60">
                    Visual sold-item cards. Click a card to see who bought it and what it was sold together with.
                  </div>
                </div>
                <div className="text-xs text-white/50">
                  Showing {visibleSoldItems.length} of {filteredSoldItems.length}
                  {soldItemQuery.trim() ? ` filtered from ${soldItems.length}` : ""}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-paper/5 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={soldItemQuery}
                    onChange={(e) => setSoldItemQuery(e.target.value)}
                    placeholder="Search sold item, buyer, or sold-with item..."
                    className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-bg-800 px-4 py-2 text-sm text-white outline-none focus:border-white/20"
                  />
                  <Button
                    variant="ghost"
                    onClick={() => setSoldItemQuery("")}
                    disabled={!soldItemQuery}
                  >
                    Clear
                  </Button>
                </div>
                {topItems.length ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/70">
                    {topItems.slice(0, 3).map((item) => (
                      <div
                        key={item.key}
                        className="rounded-full border border-white/10 bg-black/20 px-3 py-1"
                      >
                        Hot: {item.name} ({item.qty})
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {visibleSoldItems.length === 0 ? (
                <div className="mt-4 text-sm text-white/60">No sold items found.</div>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {visibleSoldItems.map((item) => {
                    const subtitle =
                      [item.brand, item.model, item.variation].filter(Boolean).join(" • ") ||
                      "Sold item";
                    const soldAt = item.latestSoldAt
                      ? new Date(item.latestSoldAt).toLocaleString("en-PH", {
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-";
                    const priceLabel =
                      item.unitPrice > 0
                        ? peso(item.unitPrice)
                        : item.totalQty > 0
                        ? peso(item.totalSales / item.totalQty)
                        : peso(0);
                    const soldWithPreview = item.soldWithTop.slice(0, 2);

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setSelectedSoldItemKey(item.key)}
                        className="group h-full overflow-hidden rounded-xl border border-white/10 bg-paper/5 text-left shadow-sm transition hover:border-accent-500/40 hover:shadow-accent-500/10"
                      >
                        <div className="aspect-[4/3] overflow-hidden bg-black/10">
                          {item.imageUrl ? (
                            (() => {
                              const preview = parseImageCrop(item.imageUrl);
                              return (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={preview.src}
                                  alt={item.name}
                                  className="h-full w-full object-contain bg-neutral-50"
                                  style={cropStyle(preview.crop)}
                                />
                              );
                            })()
                          ) : (
                            <div className="flex h-full items-center justify-center text-sm text-white/60">
                              No image
                            </div>
                          )}
                        </div>

                        <div className="space-y-3 p-3 sm:p-4">
                          <div className="flex items-start gap-2">
                            <Badge className="border-red-400/40 bg-red-500/10 text-red-100">
                              SOLD
                            </Badge>
                            <Badge className="ml-auto border-white/10 bg-white/5 text-white/70">
                              {item.orderCount} orders
                            </Badge>
                          </div>

                          <div className="font-semibold text-white line-clamp-2">
                            {item.name}
                          </div>
                          <div className="line-clamp-1 text-xs text-white/60">
                            {subtitle}
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <div className="text-price">{priceLabel}</div>
                            <div className="text-xs text-white/60">{item.totalQty} sold</div>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="text-[11px] uppercase tracking-wide text-white/50">
                              Latest Sale
                            </div>
                            <div className="mt-1 truncate text-sm text-white/80">
                              {item.latestCustomer || "Guest"}
                            </div>
                            <div className="text-xs text-white/60">{soldAt}</div>
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="text-[11px] uppercase tracking-wide text-white/50">
                              Sold With
                            </div>
                            {soldWithPreview.length === 0 ? (
                              <div className="mt-1 text-sm text-white/60">Usually sold alone.</div>
                            ) : (
                              <div className="mt-1 space-y-1">
                                {soldWithPreview.map((other) => (
                                  <div
                                    key={`${item.key}-${other.title}`}
                                    className="truncate text-sm text-white/80"
                                  >
                                    {other.title} x{other.qty}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-xs text-white/60">
                            <div>Revenue {peso(item.totalSales)}</div>
                            <div
                              className={
                                item.totalProfit >= 0 ? "text-emerald-300" : "text-red-300"
                              }
                            >
                              {peso(item.totalProfit)}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

            </div>
          </CardBody>
        </Card>

        <DetailsModal
          open={Boolean(selectedSoldItemKey)}
          onClose={() => setSelectedSoldItemKey(null)}
          title={selectedSoldItem ? selectedSoldItem.name : "Sold item details"}
        >
          {!selectedSoldItem ? (
            <div className="text-sm text-white/60">Sold item not found.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[240px,1fr]">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-paper/5">
                  <div className="aspect-[4/3] overflow-hidden bg-black/10">
                    {selectedSoldItem.imageUrl ? (
                      (() => {
                        const preview = parseImageCrop(selectedSoldItem.imageUrl);
                        return (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={preview.src}
                            alt={selectedSoldItem.name}
                            className="h-full w-full object-contain bg-neutral-50"
                            style={cropStyle(preview.crop)}
                          />
                        );
                      })()
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-white/60">
                        No image
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-xl font-semibold text-white">
                      {selectedSoldItem.name}
                    </div>
                    <div className="text-sm text-white/60">
                      {[selectedSoldItem.brand, selectedSoldItem.model, selectedSoldItem.variation]
                        .filter(Boolean)
                        .join(" • ") || "Sold item"}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/50">
                        Units Sold
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {selectedSoldItem.totalQty}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/50">
                        Orders
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {selectedSoldItem.orderCount}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/50">
                        Revenue
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {peso(selectedSoldItem.totalSales)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/50">
                        Profit
                      </div>
                      <div
                        className={`mt-1 text-lg font-semibold ${
                          selectedSoldItem.totalProfit >= 0
                            ? "text-emerald-300"
                            : "text-red-300"
                        }`}
                      >
                        {peso(selectedSoldItem.totalProfit)}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/50">
                        Latest Buyer
                      </div>
                      <div className="mt-1 font-medium text-white">
                        {selectedSoldItem.latestCustomer || "Guest"}
                      </div>
                      <div className="text-sm text-white/60">
                        {selectedSoldItem.latestSoldAt
                          ? new Date(selectedSoldItem.latestSoldAt).toLocaleString("en-PH")
                          : "-"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/50">
                        Most Sold With
                      </div>
                      {selectedSoldItem.soldWithTop.length === 0 ? (
                        <div className="mt-1 text-sm text-white/60">Usually sold alone.</div>
                      ) : (
                        <div className="mt-1 space-y-1 text-sm text-white/80">
                          {selectedSoldItem.soldWithTop.map((other) => (
                            <div key={`${selectedSoldItem.key}-${other.title}`}>
                              {other.title} x{other.qty}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {selectedSoldItem.occurrences.map((occurrence) => (
                  <div
                    key={`${selectedSoldItem.key}-${occurrence.orderId}`}
                    className="rounded-2xl border border-white/10 bg-paper/5 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">
                          {occurrence.customer_name || "Guest"}
                        </div>
                        <div className="text-xs text-white/60">
                          {new Date(occurrence.soldAt).toLocaleString("en-PH")} | Order #
                          {occurrence.orderId.slice(0, 8)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelectedSoldItemKey(null);
                            setSelectedOrderId(occurrence.orderId);
                          }}
                        >
                          Open order
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setOpenOrderEditorOnLoad(true);
                            setSelectedSoldItemKey(null);
                            setSelectedOrderId(occurrence.orderId);
                          }}
                        >
                          Edit details
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-xl border border-white/10 bg-bg-900/30 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/50">
                          Sold To
                        </div>
                        <div className="mt-1 text-sm text-white/80">
                          {occurrence.customer_name || "Guest"}
                        </div>
                        <div className="text-sm text-white/70">
                          {occurrence.customer_phone || "-"}
                        </div>
                        {occurrence.customer_email ? (
                          <div className="text-sm text-white/70">
                            {occurrence.customer_email}
                          </div>
                        ) : null}
                        {occurrence.customer_address !== "-" ? (
                          <div className="mt-1 text-sm text-white/70">
                            {occurrence.customer_address}
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-xl border border-white/10 bg-bg-900/30 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/50">
                          Sale Info
                        </div>
                        <div className="mt-1 text-sm text-white/80">
                          Qty: <span className="text-white">{occurrence.qty}</span>
                        </div>
                        <div className="text-sm text-white/80">
                          Value: <span className="text-white">{peso(occurrence.lineTotal)}</span>
                        </div>
                        <div className="text-sm text-white/80">
                          Payment:{" "}
                          <span className="text-white">{occurrence.payment_method}</span>
                        </div>
                        <div className="text-sm text-white/80">
                          Channel: <span className="text-white">{occurrence.channel}</span>
                        </div>
                        <div className="text-sm text-white/80">
                          Fulfillment:{" "}
                          <span className="text-white">{occurrence.shipping_method}</span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-bg-900/30 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/50">
                          Payment Status
                        </div>
                        <div className="mt-1 text-sm text-white/80">
                          {occurrence.payment_status}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-white/10 bg-bg-900/30 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/50">
                        Sold Together With
                      </div>
                      {occurrence.soldWith.length === 0 ? (
                        <div className="mt-2 text-sm text-white/60">Sold alone.</div>
                      ) : (
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          {occurrence.soldWith.map((other) => (
                            <div
                              key={`${occurrence.orderId}-${other.title}`}
                              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80"
                            >
                              {other.title} x{other.qty}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DetailsModal>

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
                <div>Items Sold: <span className="font-semibold">{totals.itemsSold}</span></div>
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
                              Items sold: {o.itemsSold} Â· Item discount: {peso(itemDiscount)}
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
                              Items sold: {o.itemsSold} Â· Item discount: {peso(itemDiscount)}
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
              {(() => {
                const channel = String(selectedOrder.channel ?? "WEB").toUpperCase();
                const status = String(selectedOrder.status ?? "").toUpperCase();
                const paymentStatus = String(
                  selectedOrder.payment_status ?? ""
                ).toUpperCase();
                const canRevert =
                  (paymentStatus === "PAID" || channel === "POS") &&
                  status !== "VOIDED" &&
                  status !== "CANCELLED";
                const busy = revertingOrderId === String(selectedOrder.id);
                return (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {editingOrderDetails ? (
                        <>
                          <Button
                            variant="secondary"
                            disabled={savingOrderDetails}
                            onClick={() => void saveOrderDetails()}
                          >
                            {savingOrderDetails ? "Saving..." : "Save details"}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={savingOrderDetails}
                            onClick={() => {
                              setOrderEditDraft(buildOrderEditDraft(selectedOrder));
                              setEditingOrderDetails(false);
                              setOrderSaveError(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setOrderEditDraft(buildOrderEditDraft(selectedOrder));
                            setEditingOrderDetails(true);
                            setOrderSaveError(null);
                          }}
                        >
                          Edit sold-to details
                        </Button>
                      )}
                    </div>

                    {canRevert ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="secondary"
                          disabled={busy || savingOrderDetails}
                          onClick={() =>
                            void revertSale(String(selectedOrder.id), { addToCart: true })
                          }
                        >
                          {busy && revertingToCart
                            ? "Reverting + adding..."
                            : "Revert sale and add to cart"}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={busy || savingOrderDetails}
                          onClick={() => void revertSale(String(selectedOrder.id))}
                        >
                          {busy && !revertingToCart ? "Reverting..." : "Revert sale"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {orderSaveError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {orderSaveError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-white/60">
                    {new Date(
                      editingOrderDetails && orderEditDraft.soldAt
                        ? orderEditDraft.soldAt
                        : selectedOrder.created_at
                    ).toLocaleString("en-PH")}
                  </div>
                  <div className="mt-1 text-sm text-white/80">
                    Channel: {String(selectedOrder.channel ?? "WEB").toUpperCase()}
                  </div>
                  <div className="text-sm text-white/80">
                    Status: {String(selectedOrder.status ?? "").toUpperCase()}
                  </div>
                  <div className="text-sm text-white/80">
                    Payment: {String(selectedOrder.payment_status ?? "").toUpperCase()}
                    {selectedOrder.payment_method
                      ? ` (${String(selectedOrder.payment_method).toUpperCase()})`
                      : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/50">Total</div>
                  <div className="text-lg font-semibold">
                    {peso(Number(selectedOrder.total ?? 0))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-white/50">
                    {editingOrderDetails ? "Edit Buyer" : "Customer"}
                  </div>
                  {editingOrderDetails ? (
                    <div className="mt-2 space-y-3">
                      <Input
                        label="Customer name"
                        value={orderEditDraft.customerName}
                        onChange={(e) =>
                          setOrderEditDraft((draft) => ({
                            ...draft,
                            customerName: e.target.value,
                          }))
                        }
                      />
                      <Input
                        label="Customer phone"
                        value={orderEditDraft.customerPhone}
                        onChange={(e) =>
                          setOrderEditDraft((draft) => ({
                            ...draft,
                            customerPhone: e.target.value,
                          }))
                        }
                      />
                      <Input
                        label="Customer email"
                        value={orderEditDraft.customerEmail}
                        onChange={(e) =>
                          setOrderEditDraft((draft) => ({
                            ...draft,
                            customerEmail: e.target.value,
                          }))
                        }
                      />
                      <Textarea
                        label="Address"
                        value={orderEditDraft.address}
                        onChange={(e) =>
                          setOrderEditDraft((draft) => ({
                            ...draft,
                            address: e.target.value,
                          }))
                        }
                        className="min-h-[110px]"
                      />
                    </div>
                  ) : (
                    (() => {
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
                    })()
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-white/50">
                    {editingOrderDetails ? "Edit Sale Details" : "Sale Details"}
                  </div>
                  {editingOrderDetails ? (
                    <div className="mt-2 space-y-3">
                      <Input
                        label="Sold date and time"
                        type="datetime-local"
                        value={orderEditDraft.soldAt}
                        onChange={(e) =>
                          setOrderEditDraft((draft) => ({
                            ...draft,
                            soldAt: e.target.value,
                          }))
                        }
                      />
                      <Input
                        label="Payment method"
                        value={orderEditDraft.paymentMethod}
                        onChange={(e) =>
                          setOrderEditDraft((draft) => ({
                            ...draft,
                            paymentMethod: e.target.value,
                          }))
                        }
                      />
                      <Input
                        label="Channel"
                        value={orderEditDraft.channel}
                        onChange={(e) =>
                          setOrderEditDraft((draft) => ({
                            ...draft,
                            channel: e.target.value,
                          }))
                        }
                      />
                      <Input
                        label="Shipping / fulfillment method"
                        value={orderEditDraft.shippingMethod}
                        onChange={(e) =>
                          setOrderEditDraft((draft) => ({
                            ...draft,
                            shippingMethod: e.target.value,
                          }))
                        }
                      />
                      <Textarea
                        label="Shipping notes"
                        value={orderEditDraft.notes}
                        onChange={(e) =>
                          setOrderEditDraft((draft) => ({
                            ...draft,
                            notes: e.target.value,
                          }))
                        }
                      />
                      <div className="text-xs text-white/50">
                        Status and totals stay read-only here.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-1 text-sm text-white/80">
                        Sold at:{" "}
                        <span className="text-white">
                          {new Date(selectedOrder.created_at).toLocaleString("en-PH")}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-white/80">
                        Payment method:{" "}
                        <span className="text-white">
                          {String(selectedOrder.payment_method ?? "").toUpperCase() || "-"}
                        </span>
                      </div>
                      <div className="text-sm text-white/80">
                        Channel:{" "}
                        <span className="text-white">
                          {String(selectedOrder.channel ?? "WEB").toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm text-white/80">
                        Shipping method:{" "}
                        <span className="text-white">
                          {String(
                            mergeShippingDetails(selectedOrder)?.method ??
                              selectedOrder.shipping_method ??
                              "-"
                          ).toUpperCase()}
                        </span>
                      </div>
                      {(() => {
                        const details = mergeShippingDetails(selectedOrder);
                        const notes = String(details.notes || details.note || "").trim();
                        return notes ? (
                          <div className="mt-1 text-sm text-white/70">{notes}</div>
                        ) : (
                          <div className="mt-1 text-sm text-white/60">
                            No extra shipping notes.
                          </div>
                        );
                      })()}
                    </>
                  )}
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
                  {editingOrderDetails ? "Shipping Preview" : "Shipping"}
                </div>
                {(() => {
                  const draftOrder = editingOrderDetails
                    ? {
                        ...selectedOrder,
                        customer_name: orderEditDraft.customerName || null,
                        customer_phone: orderEditDraft.customerPhone || null,
                        contact: orderEditDraft.customerPhone || null,
                        address: orderEditDraft.address || null,
                        payment_method: orderEditDraft.paymentMethod || null,
                        channel: orderEditDraft.channel || selectedOrder.channel,
                        shipping_method:
                          orderEditDraft.shippingMethod || selectedOrder.shipping_method,
                        shipping_details: {
                          ...mergeShippingDetails(selectedOrder),
                          method:
                            orderEditDraft.shippingMethod || selectedOrder.shipping_method,
                          receiver_name: orderEditDraft.customerName || null,
                          receiver_phone: orderEditDraft.customerPhone || null,
                          phone: orderEditDraft.customerPhone || null,
                          receiver_email: orderEditDraft.customerEmail || null,
                          email: orderEditDraft.customerEmail || null,
                          full_address: orderEditDraft.address || null,
                          address: orderEditDraft.address || null,
                          notes: orderEditDraft.notes || null,
                          pickup_location:
                            (orderEditDraft.shippingMethod || "").toUpperCase() === "PICKUP"
                              ? orderEditDraft.address || null
                              : mergeShippingDetails(selectedOrder).pickup_location,
                          dropoff_address:
                            ["LBC", "LALAMOVE"].includes(
                              (orderEditDraft.shippingMethod || "").toUpperCase()
                            )
                              ? orderEditDraft.address || null
                              : mergeShippingDetails(selectedOrder).dropoff_address,
                        },
                      }
                    : selectedOrder;
                  const ship = buildShippingSummary(draftOrder);
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
                      const costEach = getItemCostEach(it);
                      const qty = Number(it?.qty ?? 1);
                      const grossLine = getItemLineTotal(it);
                      const line = grossLine * selectedOrderRevenueFactor;
                      const lineDiscount = Math.max(0, grossLine - line);
                      const cogs = costEach * qty;
                      const profit = line - cogs;
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
                              {qty} x {peso(unit)} | Value: {peso(line)}
                            </div>
                            {lineDiscount > 0 ? (
                              <div className="text-xs text-amber-300">
                                Discount: -{peso(lineDiscount)}
                              </div>
                            ) : null}
                            <div className="text-xs text-white/60">
                              COGS: {peso(cogs)} |{" "}
                              <span
                                className={
                                  profit >= 0 ? "text-emerald-300" : "text-red-300"
                                }
                              >
                                Profit: {peso(profit)}
                              </span>
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






























