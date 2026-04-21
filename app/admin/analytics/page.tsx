"use client";

import Link from "next/link";
import * as React from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowUpRight,
  CalendarRange,
  ChevronDown,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
  Warehouse,
  X,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/components/ui/toast";
import { InventoryEditorDrawer } from "@/components/admin/InventoryEditorDrawer";
import type { AdminProduct } from "@/components/admin/InventoryBrowseGrid";
import { supabase } from "@/lib/supabase/browser";
import { formatConditionLabel } from "@/lib/conditions";

function peso(value: number) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `PHP ${Math.round(value)}`;
  }
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-PH").format(Math.max(0, Math.round(value)));
}

function ymd(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysLabel(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return "-";
  const days = Math.max(0, Math.round(Number(value)));
  if (days === 1) return "1 day";
  return `${days} days`;
}

function formatDateTimeLabel(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

function formatEditablePriceValue(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "";
  if (Number.isInteger(number)) return String(number);
  return number.toFixed(2).replace(/\.?0+$/, "");
}

function parseEditablePriceValue(value: string) {
  const cleaned = value.trim().replace(/,/g, "");
  if (!cleaned) return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return null;
  return number;
}

function sanitizeLookupQuery(value: string) {
  return value
    .trim()
    .replace(/[%_,()'"\\]/g, " ")
    .replace(/\s+/g, " ");
}

function nextDayYmd(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + 1);
  return ymd(date);
}

type FunnelProduct = {
  product_id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_url: string | null;
  views: number;
  cart_adds: number;
  cart_qty: number;
  paid_orders: number;
  sold_qty: number;
  revenue: number;
  view_to_cart_rate: number;
  cart_to_paid_rate: number;
  view_to_paid_rate: number;
};

type FastMover = {
  variant_id: string;
  product_id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_url: string | null;
  condition: string;
  units_added: number;
  sold_qty_lifetime: number;
  sold_qty_range: number;
  current_qty: number;
  price: number;
  sell_through_rate: number;
  days_to_first_sale: number | null;
  days_in_stock: number;
  stocked_at: string | null;
  first_sold_at: string | null;
  last_sold_at: string | null;
};

type OutOfStockItem = {
  product_id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_url: string | null;
  views: number;
  cart_adds: number;
  cart_qty: number;
  paid_orders: number;
  sold_qty: number;
  revenue: number;
  demand_score: number;
  last_activity_at: string | null;
};

type ProfitabilityRow = {
  key: string;
  label: string;
  orders: number;
  sales: number;
  cogs: number;
  profit: number;
  margin: number;
};

type GrowthAnalytics = {
  range: { from: string; to: string; days: number };
  funnel: {
    views: number;
    cart_adds: number;
    cart_qty: number;
    paid_orders: number;
    revenue: number;
    view_to_cart_rate: number;
    cart_to_paid_rate: number;
    view_to_paid_rate: number;
    top_products: FunnelProduct[];
  };
  sell_through: {
    variants_tracked: number;
    units_added: number;
    sold_qty_lifetime: number;
    sold_qty_range: number;
    overall_sell_through_rate: number;
    avg_days_to_first_sale: number;
    fast_movers: FastMover[];
  };
  out_of_stock: {
    sold_out_products: number;
    views: number;
    cart_adds: number;
    items: OutOfStockItem[];
  };
  customer_mix: {
    new_customers: number;
    returning_customers: number;
    new_orders: number;
    returning_orders: number;
    new_revenue: number;
    returning_revenue: number;
    returning_revenue_share: number;
  };
  profitability: {
    channels: ProfitabilityRow[];
    payment_methods: ProfitabilityRow[];
  };
};

type StockHealthItem = {
  variant_id: string;
  product_id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  condition: string;
  qty: number;
  price: number;
  retail_value: number;
  days_in_stock: number;
  in_stock_since: string | null;
  sold_recent: number;
  sold_lifetime: number;
  last_sold_at: string | null;
  image_url: string | null;
};

type StockHealth = {
  threshold_days: number;
  recent_sales_days: number;
  stale_variants: number;
  stale_units: number;
  stale_retail_value: number;
  max_days_in_stock: number;
  items: StockHealthItem[];
};

type StaleTabKey = "variants" | "units" | "value";

type ProductLookupProduct = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_urls: string[] | null;
  is_active: boolean;
};

type ProductLookupClickRow = {
  product_id: string;
  clicks: number;
  last_clicked_at: string | null;
};

type ProductLookupEventRow = {
  product_id: string;
  created_at: string | null;
};

type ProductLookupRow = {
  product_id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_url: string | null;
  is_active: boolean;
  lifetime_views: number;
  range_views: number;
  range_cart_adds: number;
  last_tracked_view_at: string | null;
};

type AnalyticsDrilldownTab =
  | "funnel"
  | "cart"
  | "orders"
  | "sales"
  | "new_customers"
  | "returning_customers"
  | "sell_through"
  | "sold_out"
  | "stale"
  | "profitability";

type ProfitabilityFilter = {
  type: "channel" | "payment";
  key: string;
  label: string;
} | null;

type OrderDrilldownItem = {
  id: string;
  title: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

type OrderDrilldownRow = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  channel: string;
  payment_method: string;
  shipping_method: string;
  shipping_details: Record<string, unknown>;
  status: string;
  payment_status: string;
  total: number;
  subtotal: number;
  paid_at: string | null;
  created_at: string | null;
  sold_at: string | null;
  item_count: number;
  unit_count: number;
  customer_order_number: number | null;
  items: OrderDrilldownItem[];
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

type ItemDrilldownRow = {
  key: string;
  href: string;
  title: string;
  image_url: string | null;
  subtitle: string;
  metrics: Array<{
    label: string;
    value: string;
    hint?: string;
  }>;
};

type RawOrderItemRow = {
  id?: string | null;
  order_id?: string | null;
  item_name?: string | null;
  product_title?: string | null;
  qty?: number | string | null;
  line_total?: number | string | null;
  unit_price?: number | string | null;
  price_each?: number | string | null;
};

type RawOrderRow = {
  id?: string | null;
  user_id?: string | null;
  sales_customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  contact?: string | null;
  address?: string | null;
  shipping_method?: string | null;
  shipping_details?: unknown;
  channel?: string | null;
  payment_method?: string | null;
  status?: string | null;
  payment_status?: string | null;
  total?: number | string | null;
  subtotal?: number | string | null;
  paid_at?: string | null;
  created_at?: string | null;
  order_items?: RawOrderItemRow[] | null;
};

const EMPTY_ANALYTICS: GrowthAnalytics = {
  range: { from: "", to: "", days: 0 },
  funnel: {
    views: 0,
    cart_adds: 0,
    cart_qty: 0,
    paid_orders: 0,
    revenue: 0,
    view_to_cart_rate: 0,
    cart_to_paid_rate: 0,
    view_to_paid_rate: 0,
    top_products: [],
  },
  sell_through: {
    variants_tracked: 0,
    units_added: 0,
    sold_qty_lifetime: 0,
    sold_qty_range: 0,
    overall_sell_through_rate: 0,
    avg_days_to_first_sale: 0,
    fast_movers: [],
  },
  out_of_stock: {
    sold_out_products: 0,
    views: 0,
    cart_adds: 0,
    items: [],
  },
  customer_mix: {
    new_customers: 0,
    returning_customers: 0,
    new_orders: 0,
    returning_orders: 0,
    new_revenue: 0,
    returning_revenue: 0,
    returning_revenue_share: 0,
  },
  profitability: {
    channels: [],
    payment_methods: [],
  },
};

const EMPTY_STOCK_HEALTH: StockHealth = {
  threshold_days: 60,
  recent_sales_days: 30,
  stale_variants: 0,
  stale_units: 0,
  stale_retail_value: 0,
  max_days_in_stock: 0,
  items: [],
};

const INVENTORY_EDITOR_SELECT =
  "*, product_variants(id,condition,barcode,cost,price,qty,ship_class,allowed_couriers,allowed_lbc_packages,allowed_jnt_pouches,issue_notes,issue_photo_urls,public_notes,created_at)";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeOrderText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeOrderUpper(value: unknown, fallback = "UNKNOWN") {
  const normalized = normalizeOrderText(value).toUpperCase();
  return normalized || fallback;
}

function parseOrderDetails(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function orderDetailText(details: Record<string, unknown>, key: string) {
  return normalizeOrderText(details[key]);
}

function mergeOrderShippingDetails(order: Pick<OrderDrilldownRow, "address" | "shipping_details">) {
  let details = parseOrderDetails(order.shipping_details);
  const addressRaw = normalizeOrderText(order.address);
  const addressJson = addressRaw ? parseOrderDetails(addressRaw) : {};

  if (Object.keys(addressJson).length) {
    details = { ...addressJson, ...details };
  } else if (addressRaw) {
    const hasAddress =
      orderDetailText(details, "full_address") ||
      orderDetailText(details, "address") ||
      orderDetailText(details, "dropoff_address") ||
      orderDetailText(details, "pickup_location");
    if (!hasAddress) {
      details = { ...details, full_address: addressRaw };
    }
  }

  return details;
}

function buildOrderShippingSummary(order: OrderDrilldownRow) {
  const details = mergeOrderShippingDetails(order);
  const method = String(details.method ?? order.shipping_method ?? "").trim();
  const methodLabel = method || String(order.shipping_method ?? "-");
  const receiverName =
    details.receiver_name ||
    [details.first_name, details.last_name].filter(Boolean).join(" ") ||
    order.customer_name ||
    "Guest";
  const receiverPhone =
    details.receiver_phone || details.phone || order.customer_phone || "-";
  const receiverEmail = details.receiver_email || details.email || "";

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
  const pickupDay = typeof details.pickup_day === "string" ? details.pickup_day.trim() : "";
  const pickupSlot = typeof details.pickup_slot === "string" ? details.pickup_slot.trim() : "";
  const text = typeof details.text === "string" ? details.text.trim() : "";

  const lines: string[] = [];
  if (text) lines.push(text);
  if (address && !lines.some((line) => line.includes(address))) lines.push(address);
  if (pickupDirectory) lines.push(`Directory: ${pickupDirectory}`);
  if (branch) lines.push(`Branch: ${branch}`);
  if (pickupDay || pickupSlot) {
    lines.push(`Pickup: ${[pickupDay, pickupSlot].filter(Boolean).join(" ")}`);
  }
  if (deliveryFeeNote) lines.push(`Delivery fee: ${deliveryFeeNote}`);
  if (notes) lines.push(`Notes: ${notes}`);

  return {
    method: methodLabel,
    receiverName: String(receiverName).trim() || "Guest",
    receiverPhone: String(receiverPhone).trim() || "-",
    receiverEmail: String(receiverEmail).trim(),
    address: address || "-",
    lines,
  };
}

function buildOrderEditDraft(order: OrderDrilldownRow): OrderEditDraft {
  const details = mergeOrderShippingDetails(order);
  return {
    soldAt: formatDateTimeLocalInput(order.created_at),
    customerName: String(
      details.receiver_name ||
        [details.first_name, details.last_name].filter(Boolean).join(" ") ||
        order.customer_name ||
        ""
    ).trim(),
    customerPhone: String(
      details.receiver_phone || details.phone || order.customer_phone || ""
    ).trim(),
    customerEmail: String(details.receiver_email || details.email || "").trim(),
    address: String(
      details.full_address ||
        details.address ||
        details.dropoff_address ||
        details.pickup_location ||
        order.address ||
        ""
    ).trim(),
    paymentMethod: String(order.payment_method ?? "").trim().toUpperCase(),
    channel: String(order.channel ?? "WEB").trim().toUpperCase(),
    shippingMethod: String(details.method ?? order.shipping_method ?? "")
      .trim()
      .toUpperCase(),
    notes: String(details.notes || details.note || "").trim(),
  };
}

function filterOrderDrilldownRows(
  rows: OrderDrilldownRow[],
  activeDrilldown: AnalyticsDrilldownTab,
  profitabilityFilter: ProfitabilityFilter
) {
  let nextRows = rows.slice();

  if (activeDrilldown === "new_customers") {
    nextRows = nextRows.filter((row) => row.customer_order_number === 1);
  } else if (activeDrilldown === "returning_customers") {
    nextRows = nextRows.filter((row) => Number(row.customer_order_number ?? 0) > 1);
  } else if (activeDrilldown === "profitability" && profitabilityFilter) {
    nextRows = nextRows.filter((row) => {
      const value =
        profitabilityFilter.type === "channel" ? row.channel : row.payment_method;
      return normalizeOrderUpper(value, "") === normalizeOrderUpper(profitabilityFilter.key, "");
    });
  }

  if (activeDrilldown === "sales") {
    nextRows.sort((left, right) => right.total - left.total);
  }

  return nextRows;
}

function sortStaleItems(
  items: StockHealthItem[],
  staleTab: StaleTabKey,
  updatedVariantIds: Record<string, true> = {}
) {
  const nextItems = items.slice();
  nextItems.sort((left, right) => {
    const leftUpdated = Boolean(updatedVariantIds[left.variant_id]);
    const rightUpdated = Boolean(updatedVariantIds[right.variant_id]);
    if (leftUpdated !== rightUpdated) return leftUpdated ? 1 : -1;

    if (staleTab === "units") {
      if (right.qty !== left.qty) return right.qty - left.qty;
      if (right.days_in_stock !== left.days_in_stock) {
        return right.days_in_stock - left.days_in_stock;
      }
      return left.title.localeCompare(right.title);
    }

    if (staleTab === "value") {
      if (right.retail_value !== left.retail_value) {
        return right.retail_value - left.retail_value;
      }
      if (right.qty !== left.qty) return right.qty - left.qty;
      if (right.days_in_stock !== left.days_in_stock) {
        return right.days_in_stock - left.days_in_stock;
      }
      return left.title.localeCompare(right.title);
    }

    if (right.days_in_stock !== left.days_in_stock) {
      return right.days_in_stock - left.days_in_stock;
    }
    if (right.qty !== left.qty) {
      return right.qty - left.qty;
    }
    return left.title.localeCompare(right.title);
  });
  return nextItems;
}

function normalizePhoneDigits(value: unknown) {
  const digits = String(value ?? "").replace(/[^0-9]+/g, "");
  return digits || "";
}

function getOrderSoldAt(row: RawOrderRow) {
  return normalizeOrderText(row.paid_at) || normalizeOrderText(row.created_at) || null;
}

function getOrderCustomerKey(row: RawOrderRow) {
  const details = parseOrderDetails(row.shipping_details);
  const channel = normalizeOrderUpper(row.channel, "WEB");

  if (row.sales_customer_id) return `sales_customer:${row.sales_customer_id}`;
  if (channel !== "POS" && row.user_id) return `user:${row.user_id}`;

  const email = normalizeOrderText(
    orderDetailText(details, "receiver_email") || orderDetailText(details, "email")
  ).toLowerCase();
  if (email) return `email:${email}`;

  const phone = normalizePhoneDigits(
    orderDetailText(details, "receiver_phone") ||
      row.customer_phone ||
      row.contact ||
      orderDetailText(details, "phone")
  );
  if (phone) return `phone:${phone}`;

  const name = normalizeOrderText(
    orderDetailText(details, "receiver_name") ||
      row.customer_name ||
      orderDetailText(details, "name")
  ).toLowerCase();
  if (name) return `name:${name}`;

  return `order:${normalizeOrderText(row.id)}`;
}

function isAnalyticsPaidOrder(row: RawOrderRow) {
  const channel = normalizeOrderUpper(row.channel, "WEB");
  const paymentStatus = normalizeOrderUpper(row.payment_status, "");
  const status = normalizeOrderUpper(row.status, "");
  return (
    (paymentStatus === "PAID" || channel === "POS") &&
    status !== "VOIDED" &&
    status !== "CANCELLED"
  );
}

function isOrderInRange(row: RawOrderRow, rangeStart: string, rangeEnd: string) {
  const soldAt = getOrderSoldAt(row);
  if (!soldAt) return false;
  const soldTime = new Date(soldAt).getTime();
  const startTime = new Date(rangeStart).getTime();
  const endTime = new Date(rangeEnd).getTime();
  return Number.isFinite(soldTime) && soldTime >= startTime && soldTime < endTime;
}

function toMoneyNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

async function fetchOrderDrilldownRows(
  from: string,
  to: string,
  itemLimit: number
): Promise<{ rows: OrderDrilldownRow[]; warning: string | null }> {
  const rangeStart = `${from}T00:00:00`;
  const rangeEnd = `${nextDayYmd(to)}T00:00:00`;
  const rangeOrFilter = [
    `and(payment_status.eq.PAID,paid_at.gte.${rangeStart},paid_at.lt.${rangeEnd})`,
    `and(payment_status.eq.PAID,paid_at.is.null,created_at.gte.${rangeStart},created_at.lt.${rangeEnd})`,
    `and(channel.eq.POS,paid_at.gte.${rangeStart},paid_at.lt.${rangeEnd})`,
    `and(channel.eq.POS,paid_at.is.null,created_at.gte.${rangeStart},created_at.lt.${rangeEnd})`,
  ].join(",");

  const rangeLimit = Math.max(50, Math.min(500, itemLimit * 25));
  const orderSelect =
    "id,user_id,sales_customer_id,customer_name,customer_phone,contact,address,shipping_method,shipping_details,channel,payment_method,status,payment_status,total,subtotal,paid_at,created_at";

  const [rangeRes, historyRes] = await Promise.all([
    supabase
      .from("orders")
      .select(orderSelect)
      .or(rangeOrFilter)
      .order("created_at", { ascending: false })
      .limit(rangeLimit),
    supabase
      .from("orders")
      .select(
        "id,user_id,sales_customer_id,customer_name,customer_phone,contact,shipping_details,channel,payment_status,status,paid_at,created_at"
      )
      .or("payment_status.eq.PAID,channel.eq.POS")
      .order("created_at", { ascending: true })
      .limit(5000),
  ]);

  if (rangeRes.error) throw rangeRes.error;

  const rangeRows = ((rangeRes.data ?? []) as RawOrderRow[]).filter(
    (row) =>
      normalizeOrderText(row.id) &&
      isAnalyticsPaidOrder(row) &&
      isOrderInRange(row, rangeStart, rangeEnd)
  );
  const rangeOrderIds = rangeRows
    .map((row) => normalizeOrderText(row.id))
    .filter(Boolean);
  const orderItemsByOrderId = new Map<string, RawOrderItemRow[]>();
  let warning: string | null = null;

  if (rangeOrderIds.length) {
    const itemsRes = await supabase
      .from("order_items")
      .select("id,order_id,item_name,product_title,qty,line_total,unit_price,price_each")
      .in("order_id", rangeOrderIds);

    if (itemsRes.error) {
      warning = `Order line items failed to load: ${itemsRes.error.message}`;
    } else {
      ((itemsRes.data ?? []) as RawOrderItemRow[]).forEach((item) => {
        const orderId = normalizeOrderText(item.order_id);
        if (!orderId) return;
        const current = orderItemsByOrderId.get(orderId) ?? [];
        current.push(item);
        orderItemsByOrderId.set(orderId, current);
      });
    }
  }

  const customerOrderNumberById = new Map<string, number>();

  if (historyRes.error) {
    const historyWarning = `Customer split drilldown is approximate because order history failed to load: ${historyRes.error.message}`;
    warning = warning ? `${warning} ${historyWarning}` : historyWarning;
  } else {
    const historicalOrders = ((historyRes.data ?? []) as RawOrderRow[])
      .filter((row) => normalizeOrderText(row.id) && isAnalyticsPaidOrder(row))
      .sort((left, right) => {
        const leftTime = new Date(getOrderSoldAt(left) ?? "").getTime();
        const rightTime = new Date(getOrderSoldAt(right) ?? "").getTime();
        if (leftTime !== rightTime) return leftTime - rightTime;
        return normalizeOrderText(left.id).localeCompare(normalizeOrderText(right.id));
      });

    const countByCustomer = new Map<string, number>();
    historicalOrders.forEach((row) => {
      const orderId = normalizeOrderText(row.id);
      const customerKey = getOrderCustomerKey(row);
      const nextCount = (countByCustomer.get(customerKey) ?? 0) + 1;
      countByCustomer.set(customerKey, nextCount);
      customerOrderNumberById.set(orderId, nextCount);
    });
  }

  const rows = rangeRows
    .map((row) => {
      const details = parseOrderDetails(row.shipping_details);
      const orderId = normalizeOrderText(row.id);
      const rawItems = orderItemsByOrderId.get(orderId) ?? [];
      const items = rawItems.map((item) => {
        const qty = Math.max(0, Number(item.qty ?? 0) || 0);
        const unitPrice = toMoneyNumber(item.price_each ?? item.unit_price);
        const lineTotal = toMoneyNumber(item.line_total) || unitPrice * qty;
        return {
          id: normalizeOrderText(item.id),
          title:
            normalizeOrderText(item.item_name) ||
            normalizeOrderText(item.product_title) ||
            "Item",
          qty,
          unit_price: unitPrice,
          line_total: lineTotal,
        } satisfies OrderDrilldownItem;
      });
      const customerName =
        normalizeOrderText(row.customer_name) ||
        orderDetailText(details, "receiver_name") ||
        orderDetailText(details, "name") ||
        null;
      const customerPhone =
        normalizeOrderText(row.customer_phone) ||
        normalizeOrderText(row.contact) ||
        orderDetailText(details, "receiver_phone") ||
        orderDetailText(details, "phone") ||
        null;

      return {
        id: orderId,
        customer_name: customerName,
        customer_phone: customerPhone,
        address:
          normalizeOrderText(row.address) ||
          orderDetailText(details, "full_address") ||
          orderDetailText(details, "address") ||
          orderDetailText(details, "dropoff_address") ||
          orderDetailText(details, "pickup_location") ||
          null,
        channel: normalizeOrderUpper(row.channel, "WEB"),
        payment_method: normalizeOrderUpper(row.payment_method, "UNKNOWN"),
        shipping_method: normalizeOrderUpper(
          orderDetailText(details, "method") || row.shipping_method,
          "UNKNOWN"
        ),
        shipping_details: details,
        status: normalizeOrderUpper(row.status, "UNKNOWN"),
        payment_status: normalizeOrderUpper(row.payment_status, "UNKNOWN"),
        total: toMoneyNumber(row.total),
        subtotal: toMoneyNumber(row.subtotal),
        paid_at: row.paid_at ? String(row.paid_at) : null,
        created_at: row.created_at ? String(row.created_at) : null,
        sold_at: getOrderSoldAt(row),
        item_count: items.length,
        unit_count: items.reduce((sum, item) => sum + item.qty, 0),
        customer_order_number: customerOrderNumberById.get(orderId) ?? null,
        items,
      } satisfies OrderDrilldownRow;
    })
    .sort((left, right) => {
      const leftTime = new Date(left.sold_at ?? "").getTime();
      const rightTime = new Date(right.sold_at ?? "").getTime();
      if (leftTime !== rightTime) return rightTime - leftTime;
      return right.id.localeCompare(left.id);
    });

  return { rows, warning };
}

function parseGrowthAnalytics(input: any): GrowthAnalytics {
  if (!input || typeof input !== "object") return EMPTY_ANALYTICS;
  return {
    range: {
      from: String(input.range?.from ?? ""),
      to: String(input.range?.to ?? ""),
      days: Number(input.range?.days ?? 0) || 0,
    },
    funnel: {
      views: Number(input.funnel?.views ?? 0) || 0,
      cart_adds: Number(input.funnel?.cart_adds ?? 0) || 0,
      cart_qty: Number(input.funnel?.cart_qty ?? 0) || 0,
      paid_orders: Number(input.funnel?.paid_orders ?? 0) || 0,
      revenue: Number(input.funnel?.revenue ?? 0) || 0,
      view_to_cart_rate: Number(input.funnel?.view_to_cart_rate ?? 0) || 0,
      cart_to_paid_rate: Number(input.funnel?.cart_to_paid_rate ?? 0) || 0,
      view_to_paid_rate: Number(input.funnel?.view_to_paid_rate ?? 0) || 0,
      top_products: asArray<FunnelProduct>(input.funnel?.top_products).map((item) => ({
        product_id: String(item.product_id ?? ""),
        title: String(item.title ?? "Item"),
        brand: item.brand ? String(item.brand) : null,
        model: item.model ? String(item.model) : null,
        variation: item.variation ? String(item.variation) : null,
        image_url: item.image_url ? String(item.image_url) : null,
        views: Number(item.views ?? 0) || 0,
        cart_adds: Number(item.cart_adds ?? 0) || 0,
        cart_qty: Number(item.cart_qty ?? 0) || 0,
        paid_orders: Number(item.paid_orders ?? 0) || 0,
        sold_qty: Number(item.sold_qty ?? 0) || 0,
        revenue: Number(item.revenue ?? 0) || 0,
        view_to_cart_rate: Number(item.view_to_cart_rate ?? 0) || 0,
        cart_to_paid_rate: Number(item.cart_to_paid_rate ?? 0) || 0,
        view_to_paid_rate: Number(item.view_to_paid_rate ?? 0) || 0,
      })),
    },
    sell_through: {
      variants_tracked: Number(input.sell_through?.variants_tracked ?? 0) || 0,
      units_added: Number(input.sell_through?.units_added ?? 0) || 0,
      sold_qty_lifetime: Number(input.sell_through?.sold_qty_lifetime ?? 0) || 0,
      sold_qty_range: Number(input.sell_through?.sold_qty_range ?? 0) || 0,
      overall_sell_through_rate:
        Number(input.sell_through?.overall_sell_through_rate ?? 0) || 0,
      avg_days_to_first_sale:
        Number(input.sell_through?.avg_days_to_first_sale ?? 0) || 0,
      fast_movers: asArray<FastMover>(input.sell_through?.fast_movers).map((item) => ({
        variant_id: String(item.variant_id ?? ""),
        product_id: String(item.product_id ?? ""),
        title: String(item.title ?? "Item"),
        brand: item.brand ? String(item.brand) : null,
        model: item.model ? String(item.model) : null,
        variation: item.variation ? String(item.variation) : null,
        image_url: item.image_url ? String(item.image_url) : null,
        condition: String(item.condition ?? ""),
        units_added: Number(item.units_added ?? 0) || 0,
        sold_qty_lifetime: Number(item.sold_qty_lifetime ?? 0) || 0,
        sold_qty_range: Number(item.sold_qty_range ?? 0) || 0,
        current_qty: Number(item.current_qty ?? 0) || 0,
        price: Number(item.price ?? 0) || 0,
        sell_through_rate: Number(item.sell_through_rate ?? 0) || 0,
        days_to_first_sale:
          item.days_to_first_sale === null || item.days_to_first_sale === undefined
            ? null
            : Number(item.days_to_first_sale),
        days_in_stock: Number(item.days_in_stock ?? 0) || 0,
        stocked_at: item.stocked_at ? String(item.stocked_at) : null,
        first_sold_at: item.first_sold_at ? String(item.first_sold_at) : null,
        last_sold_at: item.last_sold_at ? String(item.last_sold_at) : null,
      })),
    },
    out_of_stock: {
      sold_out_products: Number(input.out_of_stock?.sold_out_products ?? 0) || 0,
      views: Number(input.out_of_stock?.views ?? 0) || 0,
      cart_adds: Number(input.out_of_stock?.cart_adds ?? 0) || 0,
      items: asArray<OutOfStockItem>(input.out_of_stock?.items).map((item) => ({
        product_id: String(item.product_id ?? ""),
        title: String(item.title ?? "Item"),
        brand: item.brand ? String(item.brand) : null,
        model: item.model ? String(item.model) : null,
        variation: item.variation ? String(item.variation) : null,
        image_url: item.image_url ? String(item.image_url) : null,
        views: Number(item.views ?? 0) || 0,
        cart_adds: Number(item.cart_adds ?? 0) || 0,
        cart_qty: Number(item.cart_qty ?? 0) || 0,
        paid_orders: Number(item.paid_orders ?? 0) || 0,
        sold_qty: Number(item.sold_qty ?? 0) || 0,
        revenue: Number(item.revenue ?? 0) || 0,
        demand_score: Number(item.demand_score ?? 0) || 0,
        last_activity_at: item.last_activity_at ? String(item.last_activity_at) : null,
      })),
    },
    customer_mix: {
      new_customers: Number(input.customer_mix?.new_customers ?? 0) || 0,
      returning_customers: Number(input.customer_mix?.returning_customers ?? 0) || 0,
      new_orders: Number(input.customer_mix?.new_orders ?? 0) || 0,
      returning_orders: Number(input.customer_mix?.returning_orders ?? 0) || 0,
      new_revenue: Number(input.customer_mix?.new_revenue ?? 0) || 0,
      returning_revenue: Number(input.customer_mix?.returning_revenue ?? 0) || 0,
      returning_revenue_share:
        Number(input.customer_mix?.returning_revenue_share ?? 0) || 0,
    },
    profitability: {
      channels: asArray<ProfitabilityRow>(input.profitability?.channels).map((item) => ({
        key: String(item.key ?? ""),
        label: String(item.label ?? "-"),
        orders: Number(item.orders ?? 0) || 0,
        sales: Number(item.sales ?? 0) || 0,
        cogs: Number(item.cogs ?? 0) || 0,
        profit: Number(item.profit ?? 0) || 0,
        margin: Number(item.margin ?? 0) || 0,
      })),
      payment_methods: asArray<ProfitabilityRow>(input.profitability?.payment_methods).map(
        (item) => ({
          key: String(item.key ?? ""),
          label: String(item.label ?? "-"),
          orders: Number(item.orders ?? 0) || 0,
          sales: Number(item.sales ?? 0) || 0,
          cogs: Number(item.cogs ?? 0) || 0,
          profit: Number(item.profit ?? 0) || 0,
          margin: Number(item.margin ?? 0) || 0,
        })
      ),
    },
  };
}

function parseStockHealth(input: any): StockHealth {
  if (!input || typeof input !== "object") return EMPTY_STOCK_HEALTH;
  return {
    threshold_days: Number(input.threshold_days ?? 60) || 60,
    recent_sales_days: Number(input.recent_sales_days ?? 30) || 30,
    stale_variants: Number(input.stale_variants ?? 0) || 0,
    stale_units: Number(input.stale_units ?? 0) || 0,
    stale_retail_value: Number(input.stale_retail_value ?? 0) || 0,
    max_days_in_stock: Number(input.max_days_in_stock ?? 0) || 0,
    items: asArray<StockHealthItem>(input.items).map((item) => ({
      variant_id: String(item.variant_id ?? ""),
      product_id: String(item.product_id ?? ""),
      title: String(item.title ?? "Item"),
      brand: item.brand ? String(item.brand) : null,
      model: item.model ? String(item.model) : null,
      variation: item.variation ? String(item.variation) : null,
      condition: String(item.condition ?? ""),
      qty: Number(item.qty ?? 0) || 0,
      price: Number(item.price ?? 0) || 0,
      retail_value: Number(item.retail_value ?? 0) || 0,
      days_in_stock: Number(item.days_in_stock ?? 0) || 0,
      in_stock_since: item.in_stock_since ? String(item.in_stock_since) : null,
      sold_recent: Number(item.sold_recent ?? 0) || 0,
      sold_lifetime: Number(item.sold_lifetime ?? 0) || 0,
      last_sold_at: item.last_sold_at ? String(item.last_sold_at) : null,
      image_url: item.image_url ? String(item.image_url) : null,
    })),
  };
}

function MetricCard({
  title,
  value,
  hint,
  accent,
  icon: Icon,
  onClick,
  active = false,
}: {
  title: string;
  value: string;
  hint: string;
  accent: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  active?: boolean;
}) {
  const className = `rounded-2xl border p-4 ${accent} ${
    onClick ? "w-full text-left transition hover:-translate-y-0.5 hover:bg-white/10" : ""
  } ${active ? "shadow-[0_0_0_1px_rgba(255,255,255,0.18)_inset]" : ""}`;
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.22em] text-white/50">{title}</div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/80">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm text-white/60">{hint}</div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} aria-pressed={active}>
        {content}
      </button>
    );
  }

  return (
    <div className={className}>
      {content}
    </div>
  );
}

function RatioBar({
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
}: {
  leftLabel: string;
  leftValue: number;
  rightLabel: string;
  rightValue: number;
}) {
  const total = leftValue + rightValue;
  const leftPct = total > 0 ? (leftValue / total) * 100 : 50;
  const rightPct = total > 0 ? (rightValue / total) * 100 : 50;
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-full border border-white/10 bg-white/5">
        <div className="flex h-3">
          <div className="bg-sky-400/80" style={{ width: `${leftPct}%` }} />
          <div className="bg-emerald-400/80" style={{ width: `${rightPct}%` }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-white/70">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-400/80" />
          <span>{leftLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          <span>{rightLabel}</span>
        </div>
      </div>

    </div>
  );
}

function Thumbnail({
  src,
  alt,
}: {
  src: string | null | undefined;
  alt: string;
}) {
  if (!src) {
    return (
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 text-[10px] uppercase tracking-[0.18em] text-white/35">
        No Img
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="h-14 w-14 rounded-2xl border border-white/10 bg-white/5 object-cover"
    />
  );
}

type DrilldownModalProps = {
  open: boolean;
  title: string;
  hint: string;
  badge?: string;
  searchValue: string;
  searchPlaceholder: string;
  statusLine?: string;
  toolbar?: React.ReactNode;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  children: React.ReactNode;
};

function DrilldownModal({
  open,
  title,
  hint,
  badge,
  searchValue,
  searchPlaceholder,
  statusLine,
  toolbar,
  onSearchChange,
  onClose,
  children,
}: DrilldownModalProps) {
  React.useEffect(() => {
    if (!open) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="mx-auto flex min-h-full w-full max-w-6xl items-start justify-center">
        <Card
          className="my-4 flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden"
          onClick={(event) => event.stopPropagation()}
        >
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xl font-semibold text-white">{title}</div>
              <div className="mt-1 text-sm text-white/60">{hint}</div>
            </div>
            <div className="flex items-center gap-2">
              {badge ? (
                <Badge className="border-white/10 bg-white/5 text-white/70">{badge}</Badge>
              ) : null}
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardBody className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            <Input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
            />
            {statusLine ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/65">
                {statusLine}
              </div>
            ) : null}
            {toolbar}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
          </CardBody>
        </Card>
      </div>
    </div>,
    document.body
  );
}

export default function AdminAnalyticsPage() {
  const DRILLDOWN_MODAL_ITEM_LIMIT = 120;
  const DRILLDOWN_MODAL_STALE_LIMIT = 250;
  const DRILLDOWN_MODAL_ORDER_LIMIT = 20;
  const today = React.useMemo(() => new Date(), []);
  const [from, setFrom] = React.useState(() => ymd(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = React.useState(() => ymd(today));
  const [itemLimit, setItemLimit] = React.useState("8");
  const [staleDays, setStaleDays] = React.useState("60");
  const [recentSalesDays, setRecentSalesDays] = React.useState("30");
  const [lookupQuery, setLookupQuery] = React.useState("");
  const [lookupLoading, setLookupLoading] = React.useState(false);
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [lookupResults, setLookupResults] = React.useState<ProductLookupRow[]>([]);
  const [lookupSearched, setLookupSearched] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [analytics, setAnalytics] = React.useState<GrowthAnalytics>(EMPTY_ANALYTICS);
  const [stockHealth, setStockHealth] = React.useState<StockHealth>(EMPTY_STOCK_HEALTH);
  const [trackedViewsByProduct, setTrackedViewsByProduct] = React.useState<Record<string, number>>(
    {}
  );
  const [activeDrilldown, setActiveDrilldown] =
    React.useState<AnalyticsDrilldownTab>("funnel");
  const [profitabilityFilter, setProfitabilityFilter] =
    React.useState<ProfitabilityFilter>(null);
  const [orderDrilldownRows, setOrderDrilldownRows] = React.useState<OrderDrilldownRow[]>([]);
  const [orderDrilldownWarning, setOrderDrilldownWarning] = React.useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = React.useState<string | null>(null);
  const [orderEditDraft, setOrderEditDraft] = React.useState<OrderEditDraft | null>(null);
  const [orderSaveError, setOrderSaveError] = React.useState<string | null>(null);
  const [savingOrderId, setSavingOrderId] = React.useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = React.useState<string | null>(null);
  const [drilldownModalOpen, setDrilldownModalOpen] = React.useState(false);
  const [drilldownSearch, setDrilldownSearch] = React.useState("");
  const [drilldownModalLoading, setDrilldownModalLoading] = React.useState(false);
  const [drilldownModalError, setDrilldownModalError] = React.useState<string | null>(null);
  const [drilldownModalNotice, setDrilldownModalNotice] = React.useState<string | null>(null);
  const [drilldownModalAnalytics, setDrilldownModalAnalytics] =
    React.useState<GrowthAnalytics | null>(null);
  const [drilldownModalStockHealth, setDrilldownModalStockHealth] =
    React.useState<StockHealth | null>(null);
  const [drilldownModalOrderRows, setDrilldownModalOrderRows] = React.useState<
    OrderDrilldownRow[]
  >([]);
  const drilldownRef = React.useRef<HTMLDivElement | null>(null);
  const [staleTab, setStaleTab] = React.useState<StaleTabKey>("variants");
  const [stalePriceSavingVariantId, setStalePriceSavingVariantId] = React.useState<string | null>(
    null
  );
  const [stalePriceDrafts, setStalePriceDrafts] = React.useState<Record<string, string>>({});
  const [stalePriceUpdatedVariantIds, setStalePriceUpdatedVariantIds] = React.useState<
    Record<string, true>
  >({});
  const [staleEditorProduct, setStaleEditorProduct] = React.useState<AdminProduct | null>(null);
  const [staleEditorLoadingProductId, setStaleEditorLoadingProductId] = React.useState<
    string | null
  >(null);

  const selectDrilldown = React.useCallback(
    (tab: AnalyticsDrilldownTab, filter: ProfitabilityFilter = null) => {
      setActiveDrilldown(tab);
      setProfitabilityFilter(filter);
      setDrilldownSearch("");
      setDrilldownModalOpen(true);
    },
    []
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const limit = Math.max(1, Number.parseInt(itemLimit, 10) || 8);
      const stale = Math.max(1, Number.parseInt(staleDays, 10) || 60);
      const recent = Math.max(1, Number.parseInt(recentSalesDays, 10) || 30);
      const rangeStart = `${from}T00:00:00`;
      const rangeEnd = `${nextDayYmd(to)}T00:00:00`;

      const [analyticsRes, stockHealthRes] = await Promise.all([
        supabase.rpc("fn_admin_growth_analytics", {
          p_from: from,
          p_to: to,
          p_item_limit: limit,
        }),
        supabase.rpc("fn_admin_inventory_stock_health", {
          include_archived: false,
          stale_days: stale,
          recent_sales_days: recent,
          item_limit: limit,
        }),
      ]);

      if (analyticsRes.error || stockHealthRes.error) {
        throw new Error(
          [
            analyticsRes.error?.message ? `Analytics: ${analyticsRes.error.message}` : null,
            stockHealthRes.error?.message
              ? `Stock health: ${stockHealthRes.error.message}`
              : null,
          ]
            .filter(Boolean)
            .join(" | ") || "Failed to load analytics."
        );
      }

      const parsedAnalytics = parseGrowthAnalytics(analyticsRes.data);
      const parsedStockHealth = parseStockHealth(stockHealthRes.data);

      setAnalytics(parsedAnalytics);
      setStockHealth(parsedStockHealth);

      try {
        const drilldownRes = await fetchOrderDrilldownRows(from, to, limit);
        setOrderDrilldownRows(drilldownRes.rows);
        setOrderDrilldownWarning(drilldownRes.warning);
      } catch (orderErr: any) {
        console.warn("Failed to load analytics order drilldown.", orderErr);
        setOrderDrilldownRows([]);
        setOrderDrilldownWarning(
          orderErr?.message
            ? `Order drilldown failed to load: ${orderErr.message}`
            : "Order drilldown failed to load."
        );
      }

      const productIds = Array.from(
        new Set(
          [
            ...parsedAnalytics.funnel.top_products.map((item) => item.product_id),
            ...parsedAnalytics.out_of_stock.items.map((item) => item.product_id),
          ].filter(Boolean)
        )
      );

      if (!productIds.length) {
        setTrackedViewsByProduct({});
      } else {
        const { data: trackedViewsData, error: trackedViewsError } = await supabase
          .from("product_view_events")
          .select("product_id")
          .in("product_id", productIds)
          .gte("created_at", rangeStart)
          .lt("created_at", rangeEnd)
          .limit(5000);

        if (trackedViewsError) {
          console.warn("Failed to load tracked view overlay for analytics.", trackedViewsError);
          setTrackedViewsByProduct({});
        } else {
          const nextTrackedViews: Record<string, number> = {};
          ((trackedViewsData ?? []) as Array<{ product_id: string | null }>).forEach((row) => {
            const productId = String(row?.product_id ?? "").trim();
            if (!productId) return;
            nextTrackedViews[productId] = (nextTrackedViews[productId] ?? 0) + 1;
          });
          setTrackedViewsByProduct(nextTrackedViews);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Failed to load analytics.");
      setAnalytics(EMPTY_ANALYTICS);
      setStockHealth(EMPTY_STOCK_HEALTH);
      setTrackedViewsByProduct({});
      setOrderDrilldownRows([]);
      setOrderDrilldownWarning(null);
    } finally {
      setLoading(false);
    }
  }, [from, itemLimit, recentSalesDays, staleDays, to]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const loadDrilldownModalData = React.useCallback(async () => {
    setDrilldownModalLoading(true);
    setDrilldownModalError(null);
    setDrilldownModalNotice(null);
    setDrilldownModalAnalytics(null);
    setDrilldownModalStockHealth(null);
    setDrilldownModalOrderRows([]);

    try {
      if (
        activeDrilldown === "orders" ||
        activeDrilldown === "sales" ||
        activeDrilldown === "new_customers" ||
        activeDrilldown === "returning_customers" ||
        activeDrilldown === "profitability"
      ) {
        const drilldownRes = await fetchOrderDrilldownRows(
          from,
          to,
          DRILLDOWN_MODAL_ORDER_LIMIT
        );
        setDrilldownModalOrderRows(drilldownRes.rows);
        setDrilldownModalNotice(drilldownRes.warning);
        return;
      }

      if (activeDrilldown === "stale") {
        const stockHealthRes = await supabase.rpc("fn_admin_inventory_stock_health", {
          include_archived: false,
          stale_days: Math.max(1, Number.parseInt(staleDays, 10) || 60),
          recent_sales_days: Math.max(1, Number.parseInt(recentSalesDays, 10) || 30),
          item_limit: DRILLDOWN_MODAL_STALE_LIMIT,
        });

        if (stockHealthRes.error) throw stockHealthRes.error;
        setDrilldownModalStockHealth(parseStockHealth(stockHealthRes.data));
        return;
      }

      const analyticsRes = await supabase.rpc("fn_admin_growth_analytics", {
        p_from: from,
        p_to: to,
        p_item_limit: DRILLDOWN_MODAL_ITEM_LIMIT,
      });

      if (analyticsRes.error) throw analyticsRes.error;
      setDrilldownModalAnalytics(parseGrowthAnalytics(analyticsRes.data));
    } catch (err: any) {
      console.error(err);
      setDrilldownModalError(err?.message ?? "Failed to load searchable drilldown.");
    } finally {
      setDrilldownModalLoading(false);
    }
  }, [
    activeDrilldown,
    from,
    to,
    staleDays,
    recentSalesDays,
    DRILLDOWN_MODAL_ITEM_LIMIT,
    DRILLDOWN_MODAL_ORDER_LIMIT,
    DRILLDOWN_MODAL_STALE_LIMIT,
  ]);

  React.useEffect(() => {
    if (!drilldownModalOpen) return;
    void loadDrilldownModalData();
  }, [drilldownModalOpen, loadDrilldownModalData]);

  React.useEffect(() => {
    if (!editingOrderId) return;
    const stillExists = orderDrilldownRows.some((row) => row.id === editingOrderId);
    if (!stillExists) {
      setEditingOrderId(null);
      setOrderEditDraft(null);
      setOrderSaveError(null);
    }
  }, [editingOrderId, orderDrilldownRows]);

  async function saveOrderDetails(order: OrderDrilldownRow) {
    if (!orderEditDraft) return;

    const existingDetails = mergeOrderShippingDetails(order);
    const soldAtValue = orderEditDraft.soldAt.trim();
    const soldAtDate = soldAtValue ? new Date(soldAtValue) : new Date(order.created_at ?? "");
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
      String(order.payment_method ?? "").trim().toUpperCase() ||
      "GCASH";
    const channel =
      orderEditDraft.channel.trim().toUpperCase() ||
      String(order.channel ?? "WEB").trim().toUpperCase() ||
      "WEB";
    const shippingMethod =
      orderEditDraft.shippingMethod.trim().toUpperCase() ||
      String(existingDetails.method ?? order.shipping_method ?? "").trim().toUpperCase() ||
      "PICKUP";
    const notes = orderEditDraft.notes.trim();

    const nextShippingDetails: Record<string, unknown> = {
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

    setSavingOrderId(order.id);
    setOrderSaveError(null);
    try {
      const { error: updateError } = await supabase
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
        .eq("id", order.id);

      if (updateError) throw updateError;

      setEditingOrderId(null);
      setOrderEditDraft(null);
      await load();
      if (drilldownModalOpen) {
        await loadDrilldownModalData();
      }
      toast({
        intent: "success",
        message: `Order #${order.id.slice(0, 8)} updated.`,
      });
    } catch (err: any) {
      setOrderSaveError(err?.message ?? "Failed to save order details.");
    } finally {
      setSavingOrderId(null);
    }
  }

  async function deleteOrder(order: OrderDrilldownRow) {
    const shortId = order.id.slice(0, 8);
    const confirmed = window.confirm(
      `Delete order #${shortId}? This will void the order and restore stock.`
    );
    if (!confirmed) return;

    setDeletingOrderId(order.id);
    let voided = false;

    try {
      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("variant_id,item_id,qty")
        .eq("order_id", order.id)
        .limit(500);
      if (itemsError) throw itemsError;

      const variantQtyToRestore = new Map<string, number>();
      ((orderItems ?? []) as Array<{ variant_id?: string | null; item_id?: string | null; qty?: number | null }>).forEach((item) => {
        const variantId = String(item?.variant_id ?? item?.item_id ?? "").trim();
        if (!variantId) return;
        const qty = Math.max(0, Number(item?.qty ?? 0));
        if (!qty) return;
        variantQtyToRestore.set(
          variantId,
          (variantQtyToRestore.get(variantId) ?? 0) + qty
        );
      });

      const variantIds = Array.from(variantQtyToRestore.keys());
      const beforeQty = new Map<string, number>();

      if (variantIds.length) {
        const { data: beforeRows, error: beforeError } = await supabase
          .from("product_variants")
          .select("id,qty")
          .in("id", variantIds);
        if (beforeError) throw beforeError;

        ((beforeRows ?? []) as Array<{ id?: string | null; qty?: number | null }>).forEach(
          (row) => {
            const variantId = String(row?.id ?? "").trim();
            if (!variantId) return;
            beforeQty.set(variantId, Math.max(0, Number(row?.qty ?? 0)));
          }
        );
      }

      const { error: voidError } = await supabase.rpc("fn_staff_void_order", {
        p_order_id: order.id,
        p_reason: "Deleted from analytics drilldown",
      });
      if (voidError) throw voidError;
      voided = true;

      if (variantIds.length) {
        const { data: afterRows, error: afterError } = await supabase
          .from("product_variants")
          .select("id,qty")
          .in("id", variantIds);
        if (afterError) throw afterError;

        const afterQty = new Map<string, number>();
        ((afterRows ?? []) as Array<{ id?: string | null; qty?: number | null }>).forEach(
          (row) => {
            const variantId = String(row?.id ?? "").trim();
            if (!variantId) return;
            afterQty.set(variantId, Math.max(0, Number(row?.qty ?? 0)));
          }
        );

        for (const variantId of variantIds) {
          const restoreQty = variantQtyToRestore.get(variantId) ?? 0;
          if (restoreQty <= 0) continue;

          const before = beforeQty.get(variantId) ?? 0;
          const after = afterQty.get(variantId) ?? 0;
          const targetMin = before + restoreQty;
          if (after >= targetMin) continue;

          const { error: updateError } = await supabase
            .from("product_variants")
            .update({ qty: targetMin })
            .eq("id", variantId);
          if (updateError) throw updateError;
        }
      }

      if (editingOrderId === order.id) {
        setEditingOrderId(null);
        setOrderEditDraft(null);
        setOrderSaveError(null);
      }

      await load();
      if (drilldownModalOpen) {
        await loadDrilldownModalData();
      }
      toast({
        intent: "success",
        message: `Order #${shortId} deleted.`,
      });
    } catch (err: any) {
      if (voided) {
        if (editingOrderId === order.id) {
          setEditingOrderId(null);
          setOrderEditDraft(null);
          setOrderSaveError(null);
        }
        await load().catch(() => undefined);
        if (drilldownModalOpen) {
          await loadDrilldownModalData().catch(() => undefined);
        }
        toast({
          intent: "error",
          message: err?.message ?? "Order deleted, but a follow-up stock update failed.",
        });
      } else {
        toast({
          intent: "error",
          message: err?.message ?? "Failed to delete order.",
        });
      }
    } finally {
      setDeletingOrderId(null);
    }
  }

  function renderOrderDrilldownRow(order: OrderDrilldownRow) {
    const customerType =
      order.customer_order_number === 1
        ? "New"
        : Number(order.customer_order_number ?? 0) > 1
          ? "Returning"
          : "Unknown";
    const customerLabel = order.customer_name || "Customer";
    const shippingSummary = buildOrderShippingSummary(order);
    const isEditing = editingOrderId === order.id;
    const isSaving = savingOrderId === order.id;
    const isDeleting = deletingOrderId === order.id;
    const isBusy = isSaving || isDeleting;

    return (
      <details key={order.id} className="group">
        <summary className="grid cursor-pointer list-none gap-3 px-3 py-3 transition hover:bg-white/[0.04] md:grid-cols-[minmax(0,1.4fr)_0.55fr_0.75fr_0.7fr_0.7fr_1rem] md:items-center [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white">#{order.id.slice(0, 8)}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/55">
                {order.channel} - {order.payment_method}
              </span>
            </div>
            <div className="mt-1 truncate text-xs text-white/50">
              {customerLabel}
              {order.customer_phone ? ` - ${order.customer_phone}` : ""} -{" "}
              {formatDateTimeLabel(order.sold_at)}
            </div>
          </div>

          <div className="flex items-center gap-2 md:block">
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/35 md:hidden">
              Items
            </span>
            <div className="text-sm font-semibold text-white">
              {formatCount(order.item_count)}
            </div>
            <div className="text-xs text-white/45">{formatCount(order.unit_count)} units</div>
          </div>

          <div className="flex items-center gap-2 md:block">
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/35 md:hidden">
              Customer
            </span>
            <div className="text-sm font-semibold text-white">{customerType}</div>
          </div>

          <div className="flex items-center gap-2 md:block">
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/35 md:hidden">
              Status
            </span>
            <div className="text-sm font-semibold text-white">{order.status}</div>
            <div className="text-xs text-white/45">{order.payment_status}</div>
          </div>

          <div className="text-left md:text-right">
            <div className="text-base font-semibold text-white">{peso(order.total)}</div>
            <div className="text-xs text-white/45">Subtotal {peso(order.subtotal)}</div>
          </div>

          <ChevronDown className="h-4 w-4 text-white/35 transition group-open:rotate-180 group-hover:text-white/70" />
        </summary>

        <div className="space-y-4 border-t border-white/10 bg-black/15 px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">
                {isEditing ? "Edit Order" : "Order Actions"}
              </div>
              <div className="mt-1 text-xs text-white/50">
                {isEditing
                  ? "Update sold-to details and order metadata for this analytics entry."
                  : "Use the expanded row to correct the order or remove it from analytics."}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {isEditing ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void saveOrderDetails(order)}
                  >
                    {isSaving ? "Saving..." : "Save changes"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => {
                      setEditingOrderId(null);
                      setOrderEditDraft(null);
                      setOrderSaveError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => {
                      setEditingOrderId(order.id);
                      setOrderEditDraft(buildOrderEditDraft(order));
                      setOrderSaveError(null);
                    }}
                  >
                    Edit order
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void deleteOrder(order)}
                  >
                    {isDeleting ? "Deleting..." : "Delete order"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {isEditing && orderEditDraft ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Input
                  label="Sold at"
                  type="datetime-local"
                  value={orderEditDraft.soldAt}
                  onChange={(event) =>
                    setOrderEditDraft((current) =>
                      current ? { ...current, soldAt: event.target.value } : current
                    )
                  }
                />
                <Input
                  label="Customer name"
                  value={orderEditDraft.customerName}
                  onChange={(event) =>
                    setOrderEditDraft((current) =>
                      current ? { ...current, customerName: event.target.value } : current
                    )
                  }
                />
                <Input
                  label="Customer phone"
                  value={orderEditDraft.customerPhone}
                  onChange={(event) =>
                    setOrderEditDraft((current) =>
                      current ? { ...current, customerPhone: event.target.value } : current
                    )
                  }
                />
                <Input
                  label="Customer email"
                  value={orderEditDraft.customerEmail}
                  onChange={(event) =>
                    setOrderEditDraft((current) =>
                      current ? { ...current, customerEmail: event.target.value } : current
                    )
                  }
                />
                <Input
                  label="Payment method"
                  value={orderEditDraft.paymentMethod}
                  onChange={(event) =>
                    setOrderEditDraft((current) =>
                      current ? { ...current, paymentMethod: event.target.value } : current
                    )
                  }
                />
                <Input
                  label="Channel"
                  value={orderEditDraft.channel}
                  onChange={(event) =>
                    setOrderEditDraft((current) =>
                      current ? { ...current, channel: event.target.value } : current
                    )
                  }
                />
                <Input
                  label="Shipping method"
                  value={orderEditDraft.shippingMethod}
                  onChange={(event) =>
                    setOrderEditDraft((current) =>
                      current ? { ...current, shippingMethod: event.target.value } : current
                    )
                  }
                />
                <Input
                  label="Address"
                  className="md:col-span-2"
                  value={orderEditDraft.address}
                  onChange={(event) =>
                    setOrderEditDraft((current) =>
                      current ? { ...current, address: event.target.value } : current
                    )
                  }
                />
                <Textarea
                  label="Shipping notes"
                  className="md:col-span-2 xl:col-span-3"
                  value={orderEditDraft.notes}
                  onChange={(event) =>
                    setOrderEditDraft((current) =>
                      current ? { ...current, notes: event.target.value } : current
                    )
                  }
                />
              </div>
              <div className="text-xs text-white/50">
                Totals and payment status remain read-only here.
              </div>
              {orderSaveError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {orderSaveError}
                </div>
              ) : null}
            </>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                  Customer
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {shippingSummary.receiverName}
                </div>
                <div className="mt-1 text-sm text-white/70">{shippingSummary.receiverPhone}</div>
                {shippingSummary.receiverEmail ? (
                  <div className="mt-1 text-sm text-white/60">
                    {shippingSummary.receiverEmail}
                  </div>
                ) : null}
                <div className="mt-3 text-xs text-white/45">
                  Sold {formatDateTimeLabel(order.sold_at)}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                  Shipping
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {shippingSummary.method || "-"}
                </div>
                <div className="mt-1 text-sm text-white/70">{shippingSummary.address}</div>
                {shippingSummary.lines.slice(1).length ? (
                  <div className="mt-2 space-y-1 text-xs text-white/55">
                    {shippingSummary.lines.slice(1).map((line, index) => (
                      <div key={`${order.id}-ship-${index}`}>{line}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-sm font-semibold text-white/80">
              Items ({order.items.length})
            </div>
            {order.items.length ? (
              <div className="grid gap-2 lg:grid-cols-2">
                {order.items.map((item) => (
                  <div
                    key={item.id || `${order.id}-${item.title}`}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 truncate text-white/70">
                      {formatCount(item.qty)}x {item.title}
                    </div>
                    <div className="shrink-0 font-medium text-white/80">
                      {peso(item.line_total)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/50">
                No line items were loaded for this order.
              </div>
            )}
          </div>
        </div>
      </details>
    );
  }

  const loadProductLookup = React.useCallback(async () => {
    const query = sanitizeLookupQuery(lookupQuery);
    setLookupSearched(true);

    if (!query) {
      setLookupError("Enter a product title, brand, model, or variation.");
      setLookupResults([]);
      return;
    }

    setLookupLoading(true);
    setLookupError(null);

    try {
      const pattern = `%${query}%`;
      const rangeStart = `${from}T00:00:00`;
      const rangeEnd = `${nextDayYmd(to)}T00:00:00`;

      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id,title,brand,model,variation,image_urls,is_active,created_at")
        .or(
          `title.ilike.${pattern},brand.ilike.${pattern},model.ilike.${pattern},variation.ilike.${pattern}`
        )
        .order("created_at", { ascending: false })
        .limit(12);

      if (productsError) throw productsError;

      const products = ((productsData ?? []) as ProductLookupProduct[]).map((product) => ({
        id: String(product.id ?? ""),
        title: String(product.title ?? "Item"),
        brand: product.brand ? String(product.brand) : null,
        model: product.model ? String(product.model) : null,
        variation: product.variation ? String(product.variation) : null,
        image_urls: Array.isArray(product.image_urls)
          ? product.image_urls.map((value) => String(value))
          : null,
        is_active: Boolean(product.is_active),
      }));

      if (!products.length) {
        setLookupResults([]);
        return;
      }

      const productIds = products.map((product) => product.id);
      const [clicksRes, viewsRes, cartsRes] = await Promise.all([
        supabase
          .from("product_clicks")
          .select("product_id,clicks,last_clicked_at")
          .in("product_id", productIds),
        supabase
          .from("product_view_events")
          .select("product_id,created_at")
          .in("product_id", productIds)
          .gte("created_at", rangeStart)
          .lt("created_at", rangeEnd),
        supabase
          .from("product_cart_events")
          .select("product_id,created_at")
          .in("product_id", productIds)
          .gte("created_at", rangeStart)
          .lt("created_at", rangeEnd),
      ]);

      if (clicksRes.error || viewsRes.error || cartsRes.error) {
        throw new Error(
          [
            clicksRes.error?.message ? `Clicks: ${clicksRes.error.message}` : null,
            viewsRes.error?.message ? `Views: ${viewsRes.error.message}` : null,
            cartsRes.error?.message ? `Cart events: ${cartsRes.error.message}` : null,
          ]
            .filter(Boolean)
            .join(" | ") || "Failed to load per-product tracking."
        );
      }

      const clickMap = new Map<string, ProductLookupClickRow>();
      ((clicksRes.data ?? []) as ProductLookupClickRow[]).forEach((row) => {
        const productId = String(row.product_id ?? "");
        if (!productId) return;
        clickMap.set(productId, {
          product_id: productId,
          clicks: Number(row.clicks ?? 0) || 0,
          last_clicked_at: row.last_clicked_at ? String(row.last_clicked_at) : null,
        });
      });

      const rangeViewMap = new Map<string, { views: number; last: string | null }>();
      ((viewsRes.data ?? []) as ProductLookupEventRow[]).forEach((row) => {
        const productId = String(row.product_id ?? "");
        if (!productId) return;
        const current = rangeViewMap.get(productId) ?? { views: 0, last: null };
        const createdAt = row.created_at ? String(row.created_at) : null;
        current.views += 1;
        if (createdAt && (!current.last || createdAt > current.last)) {
          current.last = createdAt;
        }
        rangeViewMap.set(productId, current);
      });

      const rangeCartMap = new Map<string, number>();
      ((cartsRes.data ?? []) as ProductLookupEventRow[]).forEach((row) => {
        const productId = String(row.product_id ?? "");
        if (!productId) return;
        rangeCartMap.set(productId, (rangeCartMap.get(productId) ?? 0) + 1);
      });

      const rows = products
        .map((product) => {
          const clicks = clickMap.get(product.id);
          const rangeViews = rangeViewMap.get(product.id);
          return {
            product_id: product.id,
            title: product.title,
            brand: product.brand,
            model: product.model,
            variation: product.variation,
            image_url: product.image_urls?.[0] ?? null,
            is_active: product.is_active,
            lifetime_views: clicks?.clicks ?? 0,
            range_views: rangeViews?.views ?? 0,
            range_cart_adds: rangeCartMap.get(product.id) ?? 0,
            last_tracked_view_at: rangeViews?.last ?? clicks?.last_clicked_at ?? null,
          } satisfies ProductLookupRow;
        })
        .sort((a, b) => {
          if (a.lifetime_views !== b.lifetime_views) {
            return b.lifetime_views - a.lifetime_views;
          }
          if (a.range_views !== b.range_views) {
            return b.range_views - a.range_views;
          }
          return a.title.localeCompare(b.title);
        });

      setLookupResults(rows);
    } catch (err: any) {
      console.error(err);
      setLookupError(err?.message ?? "Failed to load per-product tracking.");
      setLookupResults([]);
    } finally {
      setLookupLoading(false);
    }
  }, [from, lookupQuery, to]);

  const totalRevenue = analytics.customer_mix.new_revenue + analytics.customer_mix.returning_revenue;
  const newRevenueShare = totalRevenue > 0 ? (analytics.customer_mix.new_revenue / totalRevenue) * 100 : 0;
  const returningRevenueShare =
    totalRevenue > 0 ? (analytics.customer_mix.returning_revenue / totalRevenue) * 100 : 0;
  const staleItems = React.useMemo(() => {
    return sortStaleItems(stockHealth.items, staleTab, stalePriceUpdatedVariantIds);
  }, [stalePriceUpdatedVariantIds, staleTab, stockHealth.items]);

  const staleSortLabel =
    staleTab === "units"
      ? "largest stale unit piles"
      : staleTab === "value"
        ? "highest stale retail value"
        : "oldest stale variants";

  const drilldownFunnelItems = React.useMemo(() => {
    const items = analytics.funnel.top_products.slice();
    if (activeDrilldown === "cart") {
      items.sort((left, right) => {
        if (right.cart_adds !== left.cart_adds) return right.cart_adds - left.cart_adds;
        if (right.cart_qty !== left.cart_qty) return right.cart_qty - left.cart_qty;
        return left.title.localeCompare(right.title);
      });
    } else {
      items.sort((left, right) => {
        if (right.views !== left.views) return right.views - left.views;
        if (right.cart_adds !== left.cart_adds) return right.cart_adds - left.cart_adds;
        return left.title.localeCompare(right.title);
      });
    }
    return items;
  }, [activeDrilldown, analytics.funnel.top_products]);

  const filteredOrderDrilldownRows = React.useMemo(() => {
    return filterOrderDrilldownRows(orderDrilldownRows, activeDrilldown, profitabilityFilter);
  }, [activeDrilldown, orderDrilldownRows, profitabilityFilter]);

  const orderDrilldownTotal = filteredOrderDrilldownRows.reduce(
    (sum, order) => sum + order.total,
    0
  );
  const orderDrilldownUnits = filteredOrderDrilldownRows.reduce(
    (sum, order) => sum + order.unit_count,
    0
  );

  const itemDrilldownRows = React.useMemo<ItemDrilldownRow[]>(() => {
    if (activeDrilldown === "sell_through") {
      return analytics.sell_through.fast_movers.map((item) => ({
        key: item.variant_id,
        href: `/product/${item.product_id}`,
        title: item.title,
        image_url: item.image_url,
        subtitle: `${formatConditionLabel(item.condition || "-")} - ${formatCount(
          item.sold_qty_range
        )} range sold`,
        metrics: [
          { label: "Lifetime Sold", value: formatCount(item.sold_qty_lifetime) },
          { label: "Sell-through", value: formatPercent(item.sell_through_rate) },
          { label: "Remaining", value: formatCount(item.current_qty) },
          { label: "Price", value: peso(item.price) },
        ],
      }));
    }

    if (activeDrilldown === "sold_out") {
      return analytics.out_of_stock.items.map((item) => ({
        key: item.product_id,
        href: `/product/${item.product_id}`,
        title: item.title,
        image_url: item.image_url,
        subtitle: [item.brand, item.model, item.variation].filter(Boolean).join(" - ") || "Product",
        metrics: [
          { label: "Views", value: formatCount(item.views) },
          { label: "Cart Adds", value: formatCount(item.cart_adds) },
          { label: "Demand", value: formatCount(item.demand_score) },
          { label: "Last Activity", value: formatDateLabel(item.last_activity_at) },
        ],
      }));
    }

    if (activeDrilldown === "stale") {
      return staleItems.map((item) => ({
        key: item.variant_id,
        href: `/product/${item.product_id}`,
        title: item.title,
        image_url: item.image_url,
        subtitle: `${formatConditionLabel(item.condition || "-")} - ${daysLabel(
          item.days_in_stock
        )} in stock`,
        metrics: [
          { label: "Qty", value: formatCount(item.qty) },
          { label: "Unit Price", value: peso(item.price) },
          { label: "Retail Value", value: peso(item.retail_value) },
          { label: "Last Sold", value: formatDateLabel(item.last_sold_at) },
        ],
      }));
    }

    return drilldownFunnelItems.map((item) => {
      const trackedViews = trackedViewsByProduct[item.product_id];
      const displayViews = Number.isFinite(trackedViews) ? trackedViews : item.views;
      return {
        key: item.product_id,
        href: `/product/${item.product_id}`,
        title: item.title,
        image_url: item.image_url,
        subtitle: [item.brand, item.model, item.variation].filter(Boolean).join(" - ") || "Product",
        metrics: [
          { label: "Views", value: formatCount(displayViews) },
          { label: "Cart Adds", value: formatCount(item.cart_adds) },
          { label: "Paid Orders", value: formatCount(item.paid_orders) },
          { label: "Revenue", value: peso(item.revenue) },
        ],
      };
    });
  }, [
    activeDrilldown,
    analytics.out_of_stock.items,
    analytics.sell_through.fast_movers,
    drilldownFunnelItems,
    staleItems,
    trackedViewsByProduct,
  ]);

  const drilldownCopy = React.useMemo(() => {
    if (activeDrilldown === "cart") {
      return {
        title: "Cart Add Items",
        hint: "Products sorted by tracked add-to-cart events for the selected range.",
        badge: `${formatCount(drilldownFunnelItems.length)} products`,
      };
    }
    if (activeDrilldown === "orders") {
      return {
        title: "Paid Orders",
        hint: "Paid web orders and POS orders counted in the selected analytics range.",
        badge: `${formatCount(filteredOrderDrilldownRows.length)} orders`,
      };
    }
    if (activeDrilldown === "sales") {
      return {
        title: "Paid Sales Orders",
        hint: "Orders sorted by total value so the biggest paid sales are easiest to inspect.",
        badge: peso(orderDrilldownTotal),
      };
    }
    if (activeDrilldown === "new_customers") {
      return {
        title: "New Customer Orders",
        hint: "Orders where this is the customer's first tracked paid/POS order.",
        badge: `${formatCount(filteredOrderDrilldownRows.length)} orders`,
      };
    }
    if (activeDrilldown === "returning_customers") {
      return {
        title: "Returning Customer Orders",
        hint: "Orders from customers with earlier tracked paid/POS order history.",
        badge: `${formatCount(filteredOrderDrilldownRows.length)} orders`,
      };
    }
    if (activeDrilldown === "sell_through") {
      return {
        title: "Fast-Moving Variants",
        hint: "Variants with sales activity, sell-through, stock age, and remaining inventory.",
        badge: `${formatCount(analytics.sell_through.fast_movers.length)} variants`,
      };
    }
    if (activeDrilldown === "sold_out") {
      return {
        title: "Sold-Out Demand Items",
        hint: "Sold-out products still receiving views or cart interest in the selected range.",
        badge: `${formatCount(analytics.out_of_stock.items.length)} products`,
      };
    }
    if (activeDrilldown === "stale") {
      return {
        title: "Stale Inventory Items",
        hint: `Slow movers sorted by ${staleSortLabel}. Price controls are available in the dead-stock section below.`,
        badge: `${formatCount(staleItems.length)} variants`,
      };
    }
    if (activeDrilldown === "profitability") {
      return {
        title: profitabilityFilter
          ? `${profitabilityFilter.label} Orders`
          : "Profitability Orders",
        hint: profitabilityFilter
          ? `Paid/POS orders filtered by ${profitabilityFilter.type}.`
          : "Click a channel or payment method below to filter this order list.",
        badge: `${formatCount(filteredOrderDrilldownRows.length)} orders`,
      };
    }
    return {
      title: "Funnel Reach Items",
      hint: "Products sorted by effective funnel reach for the selected date range.",
      badge: `${formatCount(drilldownFunnelItems.length)} products`,
    };
  }, [
    activeDrilldown,
    analytics.out_of_stock.items.length,
    analytics.sell_through.fast_movers.length,
    drilldownFunnelItems.length,
    filteredOrderDrilldownRows.length,
    orderDrilldownTotal,
    profitabilityFilter,
    staleItems.length,
    staleSortLabel,
  ]);

  const drilldownShowsOrders =
    activeDrilldown === "orders" ||
    activeDrilldown === "sales" ||
    activeDrilldown === "new_customers" ||
    activeDrilldown === "returning_customers" ||
    activeDrilldown === "profitability";

  const drilldownSearchNeedle = drilldownSearch.trim().toLowerCase();
  const modalOrderRows = React.useMemo(
    () =>
      filterOrderDrilldownRows(
        drilldownModalOrderRows,
        activeDrilldown,
        profitabilityFilter
      ),
    [activeDrilldown, drilldownModalOrderRows, profitabilityFilter]
  );
  const modalFilteredOrderRows = React.useMemo(() => {
    if (!drilldownSearchNeedle) return modalOrderRows;
    return modalOrderRows.filter((row) => {
      const haystack = [
        row.id,
        row.customer_name,
        row.customer_phone,
        row.address,
        row.channel,
        row.payment_method,
        row.shipping_method,
        row.status,
        row.payment_status,
        row.items.map((item) => item.title).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(drilldownSearchNeedle);
    });
  }, [drilldownSearchNeedle, modalOrderRows]);

  const modalStaleItems = React.useMemo(
    () =>
      sortStaleItems(
        drilldownModalStockHealth?.items ?? [],
        staleTab,
        stalePriceUpdatedVariantIds
      ),
    [drilldownModalStockHealth, stalePriceUpdatedVariantIds, staleTab]
  );
  const modalFilteredStaleItems = React.useMemo(() => {
    if (!drilldownSearchNeedle) return modalStaleItems;
    return modalStaleItems.filter((item) => {
      const haystack = [
        item.title,
        item.brand,
        item.model,
        item.variation,
        item.condition,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(drilldownSearchNeedle);
    });
  }, [drilldownSearchNeedle, modalStaleItems]);

  const modalItemRows = React.useMemo<ItemDrilldownRow[]>(() => {
    const modalAnalytics = drilldownModalAnalytics ?? EMPTY_ANALYTICS;

    if (activeDrilldown === "sell_through") {
      return modalAnalytics.sell_through.fast_movers.map((item) => ({
        key: item.variant_id,
        href: `/product/${item.product_id}`,
        title: item.title,
        image_url: item.image_url,
        subtitle: `${formatConditionLabel(item.condition || "-")} - ${formatCount(
          item.sold_qty_range
        )} range sold`,
        metrics: [
          { label: "Lifetime Sold", value: formatCount(item.sold_qty_lifetime) },
          { label: "Sell-through", value: formatPercent(item.sell_through_rate) },
          { label: "Remaining", value: formatCount(item.current_qty) },
          { label: "Price", value: peso(item.price) },
        ],
      }));
    }

    if (activeDrilldown === "sold_out") {
      return modalAnalytics.out_of_stock.items.map((item) => ({
        key: item.product_id,
        href: `/product/${item.product_id}`,
        title: item.title,
        image_url: item.image_url,
        subtitle:
          [item.brand, item.model, item.variation].filter(Boolean).join(" - ") ||
          "Product",
        metrics: [
          { label: "Views", value: formatCount(item.views) },
          { label: "Cart Adds", value: formatCount(item.cart_adds) },
          { label: "Demand", value: formatCount(item.demand_score) },
          { label: "Last Activity", value: formatDateLabel(item.last_activity_at) },
        ],
      }));
    }

    const funnelItems = modalAnalytics.funnel.top_products.slice();
    if (activeDrilldown === "cart") {
      funnelItems.sort((left, right) => {
        if (right.cart_adds !== left.cart_adds) return right.cart_adds - left.cart_adds;
        if (right.cart_qty !== left.cart_qty) return right.cart_qty - left.cart_qty;
        return left.title.localeCompare(right.title);
      });
    } else {
      funnelItems.sort((left, right) => {
        if (right.views !== left.views) return right.views - left.views;
        if (right.cart_adds !== left.cart_adds) return right.cart_adds - left.cart_adds;
        return left.title.localeCompare(right.title);
      });
    }

    return funnelItems.map((item) => ({
      key: item.product_id,
      href: `/product/${item.product_id}`,
      title: item.title,
      image_url: item.image_url,
      subtitle:
        [item.brand, item.model, item.variation].filter(Boolean).join(" - ") || "Product",
      metrics: [
        { label: "Views", value: formatCount(item.views) },
        { label: "Cart Adds", value: formatCount(item.cart_adds) },
        { label: "Paid Orders", value: formatCount(item.paid_orders) },
        { label: "Revenue", value: peso(item.revenue) },
      ],
    }));
  }, [activeDrilldown, drilldownModalAnalytics]);

  const modalFilteredItemRows = React.useMemo(() => {
    if (!drilldownSearchNeedle) return modalItemRows;
    return modalItemRows.filter((item) => {
      const haystack = [item.title, item.subtitle].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(drilldownSearchNeedle);
    });
  }, [drilldownSearchNeedle, modalItemRows]);

  const modalOrderTotal = modalFilteredOrderRows.reduce((sum, order) => sum + order.total, 0);
  const modalOrderUnits = modalFilteredOrderRows.reduce(
    (sum, order) => sum + order.unit_count,
    0
  );
  const updatedStaleCount = React.useMemo(
    () => Object.keys(stalePriceUpdatedVariantIds).length,
    [stalePriceUpdatedVariantIds]
  );
  const drilldownModalStatusLine = React.useMemo(() => {
    if (drilldownShowsOrders) {
      return `Showing ${formatCount(modalFilteredOrderRows.length)} of ${formatCount(
        modalOrderRows.length
      )} orders, ${formatCount(modalOrderUnits)} units, ${peso(modalOrderTotal)} total.`;
    }
    if (activeDrilldown === "stale") {
      const updatedHint = updatedStaleCount
        ? ` ${formatCount(updatedStaleCount)} repriced items are moved to the bottom.`
        : "";
      return `Showing ${formatCount(modalFilteredStaleItems.length)} of ${formatCount(
        modalStaleItems.length
      )} stale items, sorted by ${staleSortLabel}.${updatedHint}`;
    }
    return `Showing ${formatCount(modalFilteredItemRows.length)} of ${formatCount(
      modalItemRows.length
    )} items.`;
  }, [
    activeDrilldown,
    drilldownShowsOrders,
    modalFilteredItemRows.length,
    modalFilteredOrderRows.length,
    modalFilteredStaleItems.length,
    modalItemRows.length,
    modalOrderRows.length,
    modalOrderTotal,
    modalOrderUnits,
    modalStaleItems.length,
    staleSortLabel,
    updatedStaleCount,
  ]);

  const drilldownSearchPlaceholder = drilldownShowsOrders
    ? "Search order ID, customer, phone, shipping, or item"
    : activeDrilldown === "stale"
      ? "Search stale inventory by product, brand, model, or condition"
      : "Search product title, brand, or model";

  const saveStaleVariantPrice = React.useCallback(async (item: StockHealthItem, nextPrice: number) => {
    const currentPrice = Number(item.price ?? 0);
    if (!Number.isFinite(currentPrice)) return;

    const normalizedNextPrice = Math.max(0, Number(nextPrice.toFixed(2)));
    if (normalizedNextPrice === currentPrice) {
      setStalePriceDrafts((current) => ({
        ...current,
        [item.variant_id]: formatEditablePriceValue(normalizedNextPrice),
      }));
      return;
    }

    setStalePriceSavingVariantId(item.variant_id);
    try {
      const { error: updateError } = await supabase
        .from("product_variants")
        .update({ price: normalizedNextPrice })
        .eq("id", item.variant_id);

      if (updateError) throw updateError;

      setStockHealth((current) => {
        const previousItem = current.items.find((entry) => entry.variant_id === item.variant_id);
        if (!previousItem) return current;

        const nextRetailValue = Number((previousItem.qty * normalizedNextPrice).toFixed(2));
        const retailDelta = nextRetailValue - previousItem.retail_value;

        return {
          ...current,
          stale_retail_value: Math.max(0, current.stale_retail_value + retailDelta),
          items: current.items.map((entry) =>
            entry.variant_id === item.variant_id
              ? {
                  ...entry,
                  price: normalizedNextPrice,
                  retail_value: nextRetailValue,
                }
              : entry
          ),
        };
      });

      setDrilldownModalStockHealth((current) => {
        if (!current) return current;
        const previousItem = current.items.find((entry) => entry.variant_id === item.variant_id);
        if (!previousItem) return current;

        const nextRetailValue = Number((previousItem.qty * normalizedNextPrice).toFixed(2));
        const retailDelta = nextRetailValue - previousItem.retail_value;

        return {
          ...current,
          stale_retail_value: Math.max(0, current.stale_retail_value + retailDelta),
          items: current.items.map((entry) =>
            entry.variant_id === item.variant_id
              ? {
                  ...entry,
                  price: normalizedNextPrice,
                  retail_value: nextRetailValue,
                }
              : entry
          ),
        };
      });

      setStaleEditorProduct((current) => {
        if (!current || current.id !== item.product_id) return current;
        return {
          ...current,
          product_variants: current.product_variants.map((variant) =>
            variant.id === item.variant_id
              ? { ...variant, price: normalizedNextPrice }
              : variant
          ),
        };
      });

      setStalePriceDrafts((current) => ({
        ...current,
        [item.variant_id]: formatEditablePriceValue(normalizedNextPrice),
      }));
      setStalePriceUpdatedVariantIds((current) => ({
        ...current,
        [item.variant_id]: true,
      }));

      toast({
        intent: "success",
        message: `${formatConditionLabel(item.condition || "sealed")} price updated to ${peso(
          normalizedNextPrice
        )}.`,
      });
    } catch (err: any) {
      console.error(err);
      toast({
        intent: "error",
        message: err?.message ?? "Failed to update stale item price.",
      });
    } finally {
      setStalePriceSavingVariantId(null);
    }
  }, []);

  const adjustStaleVariantPrice = React.useCallback(
    async (
      item: StockHealthItem,
      delta: number,
      mode: "percent" | "amount" = "percent"
    ) => {
      const currentPrice = Number(item.price ?? 0);
      if (!Number.isFinite(currentPrice)) return;

      const nextPrice =
        mode === "amount"
          ? Math.max(0, Number((currentPrice + delta).toFixed(2)))
          : Math.max(0, Number((currentPrice * (1 + delta / 100)).toFixed(2)));
      await saveStaleVariantPrice(item, nextPrice);
    },
    [saveStaleVariantPrice]
  );

  const openStaleEditor = React.useCallback(async (productId: string) => {
    const trimmedProductId = String(productId ?? "").trim();
    if (!trimmedProductId) return;

    setStaleEditorLoadingProductId(trimmedProductId);
    try {
      const { data, error: productError } = await supabase
        .from("products")
        .select(INVENTORY_EDITOR_SELECT)
        .eq("id", trimmedProductId)
        .maybeSingle();

      if (productError) throw productError;
      if (!data) {
        throw new Error("Product not found for this stale item.");
      }

      setStaleEditorProduct(data as AdminProduct);
    } catch (err: any) {
      console.error(err);
      toast({
        intent: "error",
        message: err?.message ?? "Failed to open the inventory editor.",
      });
    } finally {
      setStaleEditorLoadingProductId(null);
    }
  }, []);

  function renderStaleItemCard(item: StockHealthItem) {
    const priceBusy = stalePriceSavingVariantId === item.variant_id;
    const editorBusy = staleEditorLoadingProductId === item.product_id;
    const priceUpdated = Boolean(stalePriceUpdatedVariantIds[item.variant_id]);
    const customPriceValue =
      stalePriceDrafts[item.variant_id] ?? formatEditablePriceValue(item.price);

    const onCustomPriceSave = async () => {
      const parsedPrice = parseEditablePriceValue(customPriceValue);
      if (parsedPrice === null || parsedPrice < 0) {
        toast({
          intent: "error",
          message: "Enter a valid price before saving.",
        });
        return;
      }

      await saveStaleVariantPrice(item, parsedPrice);
    };

    const markPriceUpdated = () => {
      setStalePriceDrafts((current) => ({
        ...current,
        [item.variant_id]: formatEditablePriceValue(item.price),
      }));
      setStalePriceUpdatedVariantIds((current) => ({
        ...current,
        [item.variant_id]: true,
      }));
    };

    return (
      <div
        key={item.variant_id}
        className={`rounded-2xl border p-4 ${
          priceUpdated
            ? "border-emerald-500/20 bg-emerald-500/[0.04] opacity-75"
            : "border-white/10 bg-white/5"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Thumbnail src={item.image_url} alt={item.title} />
            <div className="min-w-0">
              <Link
                href={`/product/${item.product_id}`}
                className="line-clamp-2 text-sm font-medium text-white transition hover:text-accent-200"
              >
                {item.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                <span>{formatConditionLabel(item.condition || "-")}</span>
                {priceUpdated ? (
                  <>
                    <span>•</span>
                    <span className="text-emerald-300">Updated price</span>
                  </>
                ) : null}
                <span>•</span>
                <span>{daysLabel(item.days_in_stock)} in stock</span>
                <span>•</span>
                <span>{formatCount(item.sold_recent)} sold recently</span>
                <span>•</span>
                <span>{formatCount(item.sold_lifetime)} sold lifetime</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: "-50", delta: -50 },
              { label: "+50", delta: 50 },
            ].map((action) => (
              <Button
                key={action.label}
                type="button"
                size="sm"
                variant={action.delta < 0 ? "ghost" : "secondary"}
                onClick={() =>
                  void adjustStaleVariantPrice(item, action.delta, "amount")
                }
                disabled={priceBusy || editorBusy}
                className="min-w-[64px]"
              >
                {priceBusy ? "Saving..." : action.label}
              </Button>
            ))}
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={customPriceValue}
              onChange={(event) =>
                setStalePriceDrafts((current) => ({
                  ...current,
                  [item.variant_id]: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void onCustomPriceSave();
                }
              }}
              disabled={priceBusy || editorBusy}
              className="h-9 w-28 rounded-xl border border-white/10 bg-bg-800 px-3 text-sm text-white outline-none transition focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/40 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Price"
              aria-label={`Manual price for ${item.title}`}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void onCustomPriceSave()}
              disabled={priceBusy || editorBusy}
            >
              {priceBusy ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={markPriceUpdated}
              disabled={priceBusy || editorBusy || priceUpdated}
            >
              {priceUpdated ? "Updated" : "Update"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void openStaleEditor(item.product_id)}
              disabled={priceBusy || editorBusy}
            >
              {editorBusy ? "Opening..." : "Edit price"}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Qty</div>
            <div className="mt-1 text-lg font-semibold text-white">{formatCount(item.qty)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
              Unit Price
            </div>
            <div className="mt-1 text-lg font-semibold text-white">{peso(item.price)}</div>
            <div className="text-xs text-white/45">
              {item.qty > 0 ? `${formatCount(item.qty)} x ${peso(item.price)}` : "No qty"}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
              Retail Value
            </div>
            <div className="mt-1 text-lg font-semibold text-white">{peso(item.retail_value)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Last Sold</div>
            <div className="mt-1 text-sm font-medium text-white">
              {formatDateLabel(item.last_sold_at)}
            </div>
            <div className="text-xs text-white/45">
              {formatCount(item.sold_lifetime)} lifetime units
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
              In Stock Since
            </div>
            <div className="mt-1 text-sm font-medium text-white">
              {formatDateLabel(item.in_stock_since)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold text-white">Growth Analytics</div>
            <div className="mt-1 text-sm text-white/60">
              First-wave reporting for conversion, sell-through, sold-out demand, retention,
              slow movers, and margin mix.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-sky-500/30 bg-sky-500/10 text-sky-100">
              Views + carts start tracking from this deployment forward
            </Badge>
            <Link
              href="/admin/sales"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 transition hover:bg-white/10"
            >
              Sales report
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="text-xs text-white/45">
            Cart Insights shows live carts and cumulative click tables. Growth Analytics uses
            date-range event logs, so the totals will not match exactly.
          </div>
        </CardHeader>
        <CardBody className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Select label="Top items" value={itemLimit} onChange={(e) => setItemLimit(e.target.value)}>
              <option value="5">Top 5</option>
              <option value="8">Top 8</option>
              <option value="10">Top 10</option>
              <option value="12">Top 12</option>
            </Select>
            <Select label="Stale after" value={staleDays} onChange={(e) => setStaleDays(e.target.value)}>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              <option value="120">120 days</option>
            </Select>
            <Select
              label="Recent sales window"
              value={recentSalesDays}
              onChange={(e) => setRecentSalesDays(e.target.value)}
            >
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="45">45 days</option>
              <option value="60">60 days</option>
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-white/55">
              Range: {analytics.range.from || from} to {analytics.range.to || to}
            </div>
            <Button variant="secondary" onClick={() => void load()} disabled={loading} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>

          {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold text-white">
              <PackageSearch className="h-5 w-5 text-sky-300" />
              Product Tracking Lookup
            </div>
            <div className="mt-1 text-sm text-white/60">
              Search a single product and inspect its exact tracked counts instead of relying on
              the top-items summary.
            </div>
          </div>
          <Badge className="border-white/10 bg-white/5 text-white/70">
            Range views use {analytics.range.from || from} to {analytics.range.to || to}
          </Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <Input
              label="Find product"
              value={lookupQuery}
              onChange={(event) => setLookupQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void loadProductLookup();
                }
              }}
              placeholder="Mini GT LB WORKS Lamborghini Aventador"
            />
            <Button
              variant="secondary"
              onClick={() => void loadProductLookup()}
              disabled={lookupLoading}
              className="gap-2"
            >
              <PackageSearch className="h-4 w-4" />
              {lookupLoading ? "Searching..." : "Search"}
            </Button>
          </div>

          <div className="text-xs text-white/50">
            Lifetime tracked views come from <code>product_clicks</code>. Range views and cart adds
            come from the event tables used by Growth Analytics.
          </div>

          {lookupError ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
              {lookupError}
            </div>
          ) : null}

          {lookupResults.length ? (
            <div className="space-y-3">
              {lookupResults.map((item) => (
                <div
                  key={item.product_id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Thumbnail src={item.image_url} alt={item.title} />
                    <div className="min-w-0">
                      <Link
                        href={`/product/${item.product_id}`}
                        className="line-clamp-2 text-sm font-medium text-white transition hover:text-accent-200"
                      >
                        {item.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                        <span>
                          {[item.brand, item.model, item.variation].filter(Boolean).join(" • ") ||
                            "Product"}
                        </span>
                        <span>•</span>
                        <span>ID {item.product_id.slice(0, 8)}</span>
                        <span>•</span>
                        <span>{item.is_active ? "Active" : "Archived"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid min-w-[320px] flex-1 gap-3 sm:grid-cols-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                        Lifetime Views
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {formatCount(item.lifetime_views)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                        Range Views
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {formatCount(item.range_views)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                        Range Cart Adds
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {formatCount(item.range_cart_adds)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                        Last Tracked View
                      </div>
                      <div className="mt-1 text-sm font-medium text-white">
                        {formatDateTimeLabel(item.last_tracked_view_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : lookupSearched && !lookupLoading ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
              No matching products were found for that search.
            </div>
          ) : null}
        </CardBody>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Funnel Reach"
          value={formatCount(analytics.funnel.views)}
          hint={`${formatPercent(analytics.funnel.view_to_paid_rate)} view to paid • includes cart fallback when opens are lower`}
          accent="border-sky-500/20 bg-sky-500/5"
          icon={Activity}
          onClick={() => selectDrilldown("funnel")}
          active={activeDrilldown === "funnel"}
        />
        <MetricCard
          title="Cart Adds"
          value={formatCount(analytics.funnel.cart_adds)}
          hint={`${formatPercent(analytics.funnel.view_to_cart_rate)} view to cart • tracked events only`}
          accent="border-indigo-500/20 bg-indigo-500/5"
          icon={ShoppingCart}
          onClick={() => selectDrilldown("cart")}
          active={activeDrilldown === "cart"}
        />
        <MetricCard
          title="Paid Orders"
          value={formatCount(analytics.funnel.paid_orders)}
          hint={`${formatPercent(analytics.funnel.cart_to_paid_rate)} cart to paid • web + POS`}
          accent="border-emerald-500/20 bg-emerald-500/5"
          icon={TrendingUp}
          onClick={() => selectDrilldown("orders")}
          active={activeDrilldown === "orders"}
        />
        <MetricCard
          title="Paid Sales"
          value={peso(analytics.funnel.revenue)}
          hint={`${formatPercent(analytics.sell_through.overall_sell_through_rate)} lifetime sell-through`}
          accent="border-amber-500/20 bg-amber-500/5"
          icon={Wallet}
          onClick={() => selectDrilldown("sales")}
          active={activeDrilldown === "sales"}
        />
      </section>

      <div ref={drilldownRef}>
        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">{drilldownCopy.title}</div>
              <div className="mt-1 text-sm text-white/60">{drilldownCopy.hint}</div>
            </div>
            <Badge className="border-white/10 bg-white/5 text-white/70">
              {drilldownCopy.badge}
            </Badge>
          </CardHeader>
          <CardBody className="space-y-4">
            {orderDrilldownWarning && drilldownShowsOrders ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {orderDrilldownWarning}
              </div>
            ) : null}

            {drilldownShowsOrders ? (
              filteredOrderDrilldownRows.length ? (
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-bg-900/80 px-3 py-2 text-xs text-white/55">
                    <div>
                      Showing {formatCount(filteredOrderDrilldownRows.length)} orders,{" "}
                      {formatCount(orderDrilldownUnits)} units, {peso(orderDrilldownTotal)} total.
                    </div>
                    <div>Click an order row to view items, edit details, or delete it.</div>
                  </div>
                  <div className="hidden border-b border-white/10 bg-bg-950/50 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/35 md:grid md:grid-cols-[minmax(0,1.4fr)_0.55fr_0.75fr_0.7fr_0.7fr_1rem] md:gap-3">
                    <div>Order</div>
                    <div>Items</div>
                    <div>Customer</div>
                    <div>Status</div>
                    <div className="text-right">Total</div>
                    <div />
                  </div>
                  <div className="max-h-[56vh] divide-y divide-white/10 overflow-y-auto">
                    {filteredOrderDrilldownRows.map((order) => renderOrderDrilldownRow(order))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
                  No matching orders were found for this drilldown.
                </div>
              )
            ) : itemDrilldownRows.length ? (
              <div className="space-y-3">
                {itemDrilldownRows.map((item) => (
                  <div
                    key={item.key}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Thumbnail src={item.image_url} alt={item.title} />
                      <div className="min-w-0">
                        <Link
                          href={item.href}
                          className="line-clamp-2 text-sm font-medium text-white transition hover:text-accent-200"
                        >
                          {item.title}
                        </Link>
                        <div className="mt-1 text-xs text-white/50">{item.subtitle}</div>
                      </div>
                    </div>
                    <div className="grid min-w-[280px] flex-1 gap-3 sm:grid-cols-4">
                      {item.metrics.map((metric) => (
                        <div key={metric.label}>
                          <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                            {metric.label}
                          </div>
                          <div className="mt-1 text-lg font-semibold text-white">
                            {metric.value}
                          </div>
                          {metric.hint ? (
                            <div className="text-xs text-white/45">{metric.hint}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
                No matching items were found for this drilldown.
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">View to Cart to Paid</div>
              <div className="text-sm text-white/60">
                Product-level funnel for the selected date range. Rows below show exact tracked
                opens, while funnel rates still use the effective baseline from analytics.
              </div>
            </div>
            <Badge className="border-white/10 bg-white/5 text-white/70">
              {formatCount(analytics.funnel.cart_qty)} units added
            </Badge>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  tab: "funnel" as const,
                  label: "Funnel Reach",
                  value: formatCount(analytics.funnel.views),
                  hint: "Effective funnel baseline for this date range",
                },
                {
                  tab: "cart" as const,
                  label: "Added to cart",
                  value: formatCount(analytics.funnel.cart_adds),
                  hint: `${formatPercent(analytics.funnel.view_to_cart_rate)} of funnel reach`,
                },
                {
                  tab: "orders" as const,
                  label: "Paid orders",
                  value: formatCount(analytics.funnel.paid_orders),
                  hint: `${formatPercent(analytics.funnel.view_to_paid_rate)} of funnel reach • web + POS`,
                },
              ].map((step) => (
                <button
                  key={step.label}
                  type="button"
                  onClick={() => selectDrilldown(step.tab)}
                  className={`rounded-2xl border p-4 text-left transition hover:bg-white/10 ${
                    activeDrilldown === step.tab
                      ? "border-sky-400/40 bg-sky-500/10"
                      : "border-white/10 bg-white/5"
                  }`}
                  aria-pressed={activeDrilldown === step.tab}
                >
                  <div className="text-xs uppercase tracking-[0.22em] text-white/45">{step.label}</div>
                  <div className="mt-3 text-3xl font-semibold text-white">{step.value}</div>
                  <div className="mt-2 text-sm text-white/60">{step.hint}</div>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {analytics.funnel.top_products.length ? (
                analytics.funnel.top_products.map((item) => {
                  const trackedViews = trackedViewsByProduct[item.product_id];
                  const hasTrackedOverlay = Number.isFinite(trackedViews);
                  const displayViews = hasTrackedOverlay ? trackedViews : item.views;
                  const effectiveViews =
                    hasTrackedOverlay && trackedViews !== item.views ? item.views : null;

                  return (
                    <div
                      key={item.product_id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                    <div className="flex min-w-0 items-center gap-3">
                      <Thumbnail src={item.image_url} alt={item.title} />
                      <div className="min-w-0">
                        <Link
                          href={`/product/${item.product_id}`}
                          className="line-clamp-2 text-sm font-medium text-white transition hover:text-accent-200"
                        >
                          {item.title}
                        </Link>
                        <div className="mt-1 text-xs text-white/50">
                          {[item.brand, item.model, item.variation].filter(Boolean).join(" • ") || "Product"}
                        </div>
                      </div>
                    </div>

                    <div className="grid min-w-[280px] flex-1 gap-3 sm:grid-cols-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                          Tracked Views
                        </div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {formatCount(displayViews)}
                        </div>
                        {effectiveViews !== null ? (
                          <div className="text-xs text-white/45">
                            {formatCount(effectiveViews)} effective for funnel rate
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Cart Adds</div>
                        <div className="mt-1 text-lg font-semibold text-white">{formatCount(item.cart_adds)}</div>
                        <div className="text-xs text-white/45">{formatPercent(item.view_to_cart_rate)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Paid Orders</div>
                        <div className="mt-1 text-lg font-semibold text-white">{formatCount(item.paid_orders)}</div>
                        <div className="text-xs text-white/45">{formatPercent(item.cart_to_paid_rate)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Revenue</div>
                        <div className="mt-1 text-lg font-semibold text-white">{peso(item.revenue)}</div>
                        <div className="text-xs text-white/45">{formatCount(item.sold_qty)} units</div>
                      </div>
                    </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
                  No view-to-cart funnel data yet for this range. Product views and cart events will
                  populate here as new traffic comes in.
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-lg font-semibold text-white">
              <Users className="h-5 w-5 text-emerald-300" />
              New vs Returning
            </div>
            <div className="mt-1 text-sm text-white/60">
              Revenue mix from first-time buyers versus repeat customers in the selected range.
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            <RatioBar
              leftLabel={`New ${formatPercent(newRevenueShare)}`}
              leftValue={analytics.customer_mix.new_revenue}
              rightLabel={`Returning ${formatPercent(returningRevenueShare)}`}
              rightValue={analytics.customer_mix.returning_revenue}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => selectDrilldown("new_customers")}
                className={`rounded-2xl border p-4 text-left transition hover:bg-white/10 ${
                  activeDrilldown === "new_customers"
                    ? "border-sky-400/40 bg-sky-500/10"
                    : "border-sky-500/20 bg-sky-500/5"
                }`}
                aria-pressed={activeDrilldown === "new_customers"}
              >
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">New Revenue</div>
                <div className="mt-2 text-3xl font-semibold text-white">
                  {peso(analytics.customer_mix.new_revenue)}
                </div>
                <div className="mt-2 text-sm text-white/60">
                  {formatCount(analytics.customer_mix.new_orders)} orders •{" "}
                  {formatCount(analytics.customer_mix.new_customers)} customers
                </div>
              </button>
              <button
                type="button"
                onClick={() => selectDrilldown("returning_customers")}
                className={`rounded-2xl border p-4 text-left transition hover:bg-white/10 ${
                  activeDrilldown === "returning_customers"
                    ? "border-emerald-400/40 bg-emerald-500/10"
                    : "border-emerald-500/20 bg-emerald-500/5"
                }`}
                aria-pressed={activeDrilldown === "returning_customers"}
              >
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Returning Revenue</div>
                <div className="mt-2 text-3xl font-semibold text-white">
                  {peso(analytics.customer_mix.returning_revenue)}
                </div>
                <div className="mt-2 text-sm text-white/60">
                  {formatCount(analytics.customer_mix.returning_orders)} orders •{" "}
                  {formatCount(analytics.customer_mix.returning_customers)} customers
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => selectDrilldown("returning_customers")}
              className={`w-full rounded-2xl border p-4 text-left transition hover:bg-white/10 ${
                activeDrilldown === "returning_customers"
                  ? "border-emerald-400/40 bg-emerald-500/10"
                  : "border-white/10 bg-white/5"
              }`}
              aria-pressed={activeDrilldown === "returning_customers"}
            >
              <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                Returning Revenue Share
              </div>
              <div className="mt-2 text-3xl font-semibold text-white">
                {formatPercent(analytics.customer_mix.returning_revenue_share)}
              </div>
              <div className="mt-2 text-sm text-white/60">
                Higher returning share usually means loyalty, vouchers, and collector retention are
                paying off.
              </div>
            </button>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Sell-through and Days to Sell</div>
              <div className="text-sm text-white/60">
                Which variants are moving fastest relative to what you stock.
              </div>
            </div>
            <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-100">
              {formatCount(analytics.sell_through.variants_tracked)} variants tracked
            </Badge>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  label: "Lifetime Sell-through",
                  value: formatPercent(analytics.sell_through.overall_sell_through_rate),
                  hint: `${formatCount(analytics.sell_through.sold_qty_lifetime)} sold from ${formatCount(
                    analytics.sell_through.units_added
                  )} stocked`,
                },
                {
                  label: "Range Units Sold",
                  value: formatCount(analytics.sell_through.sold_qty_range),
                  hint: "Paid units within the selected range",
                },
                {
                  label: "Avg Days to First Sale",
                  value: daysLabel(analytics.sell_through.avg_days_to_first_sale),
                  hint: "Time from first stock to first paid order",
                },
              ].map((tile) => (
                <button
                  key={tile.label}
                  type="button"
                  onClick={() => selectDrilldown("sell_through")}
                  className={`rounded-2xl border p-4 text-left transition hover:bg-white/10 ${
                    activeDrilldown === "sell_through"
                      ? "border-amber-400/40 bg-amber-500/10"
                      : "border-white/10 bg-white/5"
                  }`}
                  aria-pressed={activeDrilldown === "sell_through"}
                >
                  <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                    {tile.label}
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-white">{tile.value}</div>
                  <div className="mt-2 text-sm text-white/60">{tile.hint}</div>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {analytics.sell_through.fast_movers.length ? (
                analytics.sell_through.fast_movers.map((item) => (
                  <div
                    key={item.variant_id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Thumbnail src={item.image_url} alt={item.title} />
                      <div className="min-w-0">
                        <Link
                          href={`/product/${item.product_id}`}
                          className="line-clamp-2 text-sm font-medium text-white transition hover:text-accent-200"
                        >
                          {item.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                          <span>{formatConditionLabel(item.condition || "-")}</span>
                          <span>•</span>
                          <span>{[item.brand, item.model].filter(Boolean).join(" ") || "Variant"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid min-w-[320px] flex-1 gap-3 sm:grid-cols-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Sold</div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {formatCount(item.sold_qty_range)}
                        </div>
                        <div className="text-xs text-white/45">
                          {formatCount(item.sold_qty_lifetime)} lifetime
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Sell-through</div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {formatPercent(item.sell_through_rate)}
                        </div>
                        <div className="text-xs text-white/45">
                          {formatCount(item.units_added)} stocked
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">First Sale</div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {daysLabel(item.days_to_first_sale)}
                        </div>
                        <div className="text-xs text-white/45">
                          In stock {daysLabel(item.days_in_stock)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Remaining</div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {formatCount(item.current_qty)}
                        </div>
                        <div className="text-xs text-white/45">{peso(item.price)}</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
                  No sell-through records matched this range yet.
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-lg font-semibold text-white">
              <PackageSearch className="h-5 w-5 text-amber-300" />
              Sold-out Demand
            </div>
            <div className="mt-1 text-sm text-white/60">
              Current sold-out products that still attract views or cart interest.
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  label: "Sold-out Products",
                  value: formatCount(analytics.out_of_stock.sold_out_products),
                },
                { label: "Views", value: formatCount(analytics.out_of_stock.views) },
                { label: "Cart Adds", value: formatCount(analytics.out_of_stock.cart_adds) },
              ].map((tile) => (
                <button
                  key={tile.label}
                  type="button"
                  onClick={() => selectDrilldown("sold_out")}
                  className={`rounded-2xl border p-4 text-left transition hover:bg-white/10 ${
                    activeDrilldown === "sold_out"
                      ? "border-amber-400/40 bg-amber-500/10"
                      : "border-white/10 bg-white/5"
                  }`}
                  aria-pressed={activeDrilldown === "sold_out"}
                >
                  <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                    {tile.label}
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-white">{tile.value}</div>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {analytics.out_of_stock.items.length ? (
                analytics.out_of_stock.items.map((item) => (
                  <div
                    key={item.product_id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <Thumbnail src={item.image_url} alt={item.title} />
                        <div className="min-w-0">
                          <Link
                            href={`/product/${item.product_id}`}
                            className="line-clamp-2 text-sm font-medium text-white transition hover:text-accent-200"
                          >
                            {item.title}
                          </Link>
                          <div className="mt-1 text-xs text-white/50">
                            {[item.brand, item.model, item.variation].filter(Boolean).join(" • ") || "Product"}
                          </div>
                        </div>
                      </div>
                      <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-100">
                        Demand score {formatCount(item.demand_score)}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Views</div>
                        <div className="mt-1 text-lg font-semibold text-white">{formatCount(item.views)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Cart Adds</div>
                        <div className="mt-1 text-lg font-semibold text-white">{formatCount(item.cart_adds)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Paid Orders</div>
                        <div className="mt-1 text-lg font-semibold text-white">{formatCount(item.paid_orders)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Last Activity</div>
                        <div className="mt-1 text-sm font-medium text-white">
                          {formatDateLabel(item.last_activity_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
                  No current sold-out demand signals in this range.
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-lg font-semibold text-white">
              <Warehouse className="h-5 w-5 text-rose-300" />
              Dead Stock and Slow Movers
            </div>
            <div className="mt-1 text-sm text-white/60">
              Variants in stock for {stockHealth.threshold_days}+ days with no sales in the last{" "}
              {stockHealth.recent_sales_days} days.
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  key: "variants" as const,
                  label: "Stale Variants",
                  value: formatCount(stockHealth.stale_variants),
                  hint: "Sort by oldest stock first",
                },
                {
                  key: "units" as const,
                  label: "Stale Units",
                  value: formatCount(stockHealth.stale_units),
                  hint: "Sort by trapped quantity",
                },
                {
                  key: "value" as const,
                  label: "Retail Value",
                  value: peso(stockHealth.stale_retail_value),
                  hint: `Oldest ${daysLabel(stockHealth.max_days_in_stock)}`,
                },
              ].map((tab) => {
                const isActive = staleTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setStaleTab(tab.key);
                      selectDrilldown("stale");
                    }}
                    className={`rounded-2xl border p-4 text-left transition ${
                      isActive
                        ? "border-rose-400/40 bg-rose-500/10 shadow-[0_0_0_1px_rgba(251,113,133,0.15)_inset]"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                    aria-pressed={isActive}
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-white/45">
                      {tab.label}
                    </div>
                    <div className="mt-2 text-3xl font-semibold text-white">{tab.value}</div>
                    <div className="mt-2 text-sm text-white/60">{tab.hint}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/65">
              <span>
                Showing {formatCount(staleItems.length)} stale rows, sorted by {staleSortLabel}.
              </span>
              <span>
                {updatedStaleCount
                  ? `${formatCount(updatedStaleCount)} repriced items moved to the bottom.`
                  : "Use the tiles above as tabs to bring the worst stale items to the top."}
              </span>
            </div>

            <div className="space-y-3">
              {staleItems.length ? (
                <>
                  {staleItems.map((item) => renderStaleItemCard(item))}
                  {false && staleItems.map((item) => {
                  const priceBusy = stalePriceSavingVariantId === item.variant_id;
                  const editorBusy = staleEditorLoadingProductId === item.product_id;

                  return (
                    <div
                      key={item.variant_id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <Thumbnail src={item.image_url} alt={item.title} />
                          <div className="min-w-0">
                            <Link
                              href={`/product/${item.product_id}`}
                              className="line-clamp-2 text-sm font-medium text-white transition hover:text-accent-200"
                            >
                              {item.title}
                            </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                          <span>{formatConditionLabel(item.condition || "-")}</span>
                          <span>•</span>
                          <span>{daysLabel(item.days_in_stock)} in stock</span>
                          <span>•</span>
                          <span>{formatCount(item.sold_recent)} sold recently</span>
                          <span>•</span>
                          <span>{formatCount(item.sold_lifetime)} sold lifetime</span>
                        </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {[
                            { label: "-10%", delta: -10 },
                            { label: "-5%", delta: -5 },
                            { label: "+5%", delta: 5 },
                            { label: "+10%", delta: 10 },
                          ].map((action) => (
                            <Button
                              key={action.label}
                              type="button"
                              size="sm"
                              variant={action.delta < 0 ? "ghost" : "secondary"}
                              onClick={() => void adjustStaleVariantPrice(item, action.delta)}
                              disabled={priceBusy || editorBusy}
                              className="min-w-[64px]"
                            >
                              {priceBusy ? "Saving..." : action.label}
                            </Button>
                          ))}
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => void openStaleEditor(item.product_id)}
                            disabled={priceBusy || editorBusy}
                          >
                            {editorBusy ? "Opening..." : "Edit price"}
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Qty</div>
                        <div className="mt-1 text-lg font-semibold text-white">{formatCount(item.qty)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Unit Price</div>
                        <div className="mt-1 text-lg font-semibold text-white">{peso(item.price)}</div>
                        <div className="text-xs text-white/45">
                          {item.qty > 0 ? `${formatCount(item.qty)} x ${peso(item.price)}` : "No qty"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Retail Value</div>
                        <div className="mt-1 text-lg font-semibold text-white">{peso(item.retail_value)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Last Sold</div>
                        <div className="mt-1 text-sm font-medium text-white">
                          {formatDateLabel(item.last_sold_at)}
                        </div>
                        <div className="text-xs text-white/45">
                          {formatCount(item.sold_lifetime)} lifetime units
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">In Stock Since</div>
                        <div className="mt-1 text-sm font-medium text-white">
                          {formatDateLabel(item.in_stock_since)}
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                  })}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
                  No stale variants for the current thresholds.
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-lg font-semibold text-white">
              <CalendarRange className="h-5 w-5 text-violet-300" />
              Channel and Payment Profitability
            </div>
            <div className="mt-1 text-sm text-white/60">
              Paid order mix after item discounts, grouped by channel and payment method.
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            <div>
              <div className="mb-3 text-sm font-semibold text-white/80">By channel</div>
              <div className="space-y-3">
                {analytics.profitability.channels.length ? (
                  analytics.profitability.channels.map((row) => {
                    const isActive =
                      activeDrilldown === "profitability" &&
                      profitabilityFilter?.type === "channel" &&
                      profitabilityFilter.key === row.key;
                    return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() =>
                        selectDrilldown("profitability", {
                          type: "channel",
                          key: row.key,
                          label: row.label,
                        })
                      }
                      className={`w-full rounded-2xl border p-4 text-left transition hover:bg-white/10 ${
                        isActive
                          ? "border-violet-400/40 bg-violet-500/10"
                          : "border-white/10 bg-white/5"
                      }`}
                      aria-pressed={isActive}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">{row.label}</div>
                          <div className="text-xs text-white/50">{formatCount(row.orders)} orders</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-white">{peso(row.profit)}</div>
                          <div className="text-xs text-white/50">{formatPercent(row.margin)} margin</div>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Sales</div>
                          <div className="mt-1 text-base font-semibold text-white">{peso(row.sales)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">COGS</div>
                          <div className="mt-1 text-base font-semibold text-white">{peso(row.cogs)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Profit</div>
                          <div className="mt-1 text-base font-semibold text-white">{peso(row.profit)}</div>
                        </div>
                      </div>
                    </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
                    No channel profitability data in this range.
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-3 text-sm font-semibold text-white/80">By payment method</div>
              <div className="space-y-3">
                {analytics.profitability.payment_methods.length ? (
                  analytics.profitability.payment_methods.map((row) => {
                    const isActive =
                      activeDrilldown === "profitability" &&
                      profitabilityFilter?.type === "payment" &&
                      profitabilityFilter.key === row.key;
                    return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() =>
                        selectDrilldown("profitability", {
                          type: "payment",
                          key: row.key,
                          label: row.label,
                        })
                      }
                      className={`flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition hover:bg-white/10 ${
                        isActive
                          ? "border-violet-400/40 bg-violet-500/10"
                          : "border-white/10 bg-white/5"
                      }`}
                      aria-pressed={isActive}
                    >
                      <div>
                        <div className="text-sm font-medium text-white">{row.label}</div>
                        <div className="text-xs text-white/50">{formatCount(row.orders)} orders</div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-semibold text-white">{peso(row.sales)}</div>
                        <div className="text-xs text-white/50">
                          {peso(row.profit)} profit • {formatPercent(row.margin)}
                        </div>
                      </div>
                    </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
                    No payment-method profitability data in this range.
                  </div>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <InventoryEditorDrawer
        product={staleEditorProduct}
        onClose={() => setStaleEditorProduct(null)}
        onSaved={() => {
          void load();
          if (drilldownModalOpen) {
            void loadDrilldownModalData();
          }
        }}
      />
      <DrilldownModal
        open={drilldownModalOpen}
        title={drilldownCopy.title}
        hint={drilldownCopy.hint}
        badge={drilldownCopy.badge}
        searchValue={drilldownSearch}
        searchPlaceholder={drilldownSearchPlaceholder}
        statusLine={drilldownModalStatusLine}
        onSearchChange={setDrilldownSearch}
        onClose={() => setDrilldownModalOpen(false)}
        toolbar={
          activeDrilldown === "stale" ? (
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  key: "variants" as const,
                  label: "Stale Variants",
                  value: formatCount(
                    (drilldownModalStockHealth ?? stockHealth).stale_variants
                  ),
                },
                {
                  key: "units" as const,
                  label: "Stale Units",
                  value: formatCount((drilldownModalStockHealth ?? stockHealth).stale_units),
                },
                {
                  key: "value" as const,
                  label: "Retail Value",
                  value: peso(
                    (drilldownModalStockHealth ?? stockHealth).stale_retail_value
                  ),
                },
              ].map((tab) => {
                const isActive = staleTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStaleTab(tab.key)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      isActive
                        ? "border-rose-400/40 bg-rose-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                    aria-pressed={isActive}
                  >
                    <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
                      {tab.label}
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">{tab.value}</div>
                  </button>
                );
              })}
            </div>
          ) : null
        }
      >
        {drilldownModalError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            {drilldownModalError}
          </div>
        ) : null}

        {drilldownModalNotice ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            {drilldownModalNotice}
          </div>
        ) : null}

        {drilldownModalLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
            Loading searchable drilldown...
          </div>
        ) : drilldownShowsOrders ? (
          modalFilteredOrderRows.length ? (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <div className="hidden border-b border-white/10 bg-bg-950/50 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/35 md:grid md:grid-cols-[minmax(0,1.4fr)_0.55fr_0.75fr_0.7fr_0.7fr_1rem] md:gap-3">
                <div>Order</div>
                <div>Items</div>
                <div>Customer</div>
                <div>Status</div>
                <div className="text-right">Total</div>
                <div />
              </div>
              <div className="divide-y divide-white/10">
                {modalFilteredOrderRows.map((order) => renderOrderDrilldownRow(order))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
              No matching orders were found for this drilldown.
            </div>
          )
        ) : activeDrilldown === "stale" ? (
          modalFilteredStaleItems.length ? (
            <div className="space-y-3">
              {modalFilteredStaleItems.map((item) => renderStaleItemCard(item))}
              {false && modalFilteredStaleItems.map((item) => {
                const priceBusy = stalePriceSavingVariantId === item.variant_id;
                const editorBusy = staleEditorLoadingProductId === item.product_id;

                return (
                  <div
                    key={item.variant_id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <Thumbnail src={item.image_url} alt={item.title} />
                        <div className="min-w-0">
                          <Link
                            href={`/product/${item.product_id}`}
                            className="line-clamp-2 text-sm font-medium text-white transition hover:text-accent-200"
                          >
                            {item.title}
                          </Link>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                            <span>{formatConditionLabel(item.condition || "-")}</span>
                            <span>•</span>
                            <span>{daysLabel(item.days_in_stock)} in stock</span>
                            <span>•</span>
                            <span>{formatCount(item.sold_recent)} sold recently</span>
                            <span>•</span>
                            <span>{formatCount(item.sold_lifetime)} sold lifetime</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {[
                          { label: "-10%", delta: -10 },
                          { label: "-5%", delta: -5 },
                          { label: "+5%", delta: 5 },
                          { label: "+10%", delta: 10 },
                        ].map((action) => (
                          <Button
                            key={action.label}
                            type="button"
                            size="sm"
                            variant={action.delta < 0 ? "ghost" : "secondary"}
                            onClick={() => void adjustStaleVariantPrice(item, action.delta)}
                            disabled={priceBusy || editorBusy}
                            className="min-w-[64px]"
                          >
                            {priceBusy ? "Saving..." : action.label}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void openStaleEditor(item.product_id)}
                          disabled={priceBusy || editorBusy}
                        >
                          {editorBusy ? "Opening..." : "Edit price"}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                          Qty
                        </div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {formatCount(item.qty)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                          Unit Price
                        </div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {peso(item.price)}
                        </div>
                        <div className="text-xs text-white/45">
                          {item.qty > 0
                            ? `${formatCount(item.qty)} x ${peso(item.price)}`
                            : "No qty"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                          Retail Value
                        </div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {peso(item.retail_value)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                          Last Sold
                        </div>
                        <div className="mt-1 text-sm font-medium text-white">
                          {formatDateLabel(item.last_sold_at)}
                        </div>
                        <div className="text-xs text-white/45">
                          {formatCount(item.sold_lifetime)} lifetime units
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                          In Stock Since
                        </div>
                        <div className="mt-1 text-sm font-medium text-white">
                          {formatDateLabel(item.in_stock_since)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
              No matching stale inventory was found.
            </div>
          )
        ) : modalFilteredItemRows.length ? (
          <div className="space-y-3">
            {modalFilteredItemRows.map((item) => (
              <div
                key={item.key}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Thumbnail src={item.image_url} alt={item.title} />
                  <div className="min-w-0">
                    <Link
                      href={item.href}
                      className="line-clamp-2 text-sm font-medium text-white transition hover:text-accent-200"
                    >
                      {item.title}
                    </Link>
                    <div className="mt-1 text-xs text-white/50">{item.subtitle}</div>
                  </div>
                </div>
                <div className="grid min-w-[280px] flex-1 gap-3 sm:grid-cols-4">
                  {item.metrics.map((metric) => (
                    <div key={metric.label}>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                        {metric.label}
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {metric.value}
                      </div>
                      {metric.hint ? (
                        <div className="text-xs text-white/45">{metric.hint}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
            No matching items were found for this drilldown.
          </div>
        )}
      </DrilldownModal>
    </div>
  );
}
