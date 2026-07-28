"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/toast";

type AuditLogRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  meta: Record<string, any> | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  created_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  contact: string | null;
  address: string | null;
  shipping_method: string | null;
  shipping_region: string | null;
  shipping_details: Record<string, any> | string | null;
  payment_method: string | null;
  payment_status: string | null;
  shipping_status: string | null;
  status: string | null;
  total: number | null;
  channel: string | null;
};

type OrderItemRow = {
  order_id: string;
  variant_id: string | null;
  item_id: string | null;
  qty: number | null;
  item_name: string | null;
  product_title: string | null;
};

type OrderLogEntry = {
  orderId: string;
  order: OrderRow | null;
  items: OrderItemRow[];
  log: AuditLogRow | null;
};

const ACTION_OPTIONS = [
  { value: "ALL", label: "All actions" },
  { value: "ORDER_APPROVED", label: "Approved" },
  { value: "ORDER_AUTO_APPROVED", label: "Auto approved" },
  { value: "ORDER_PAID_AUTO", label: "Paid auto" },
  { value: "ORDER_VOIDED", label: "Voided" },
  { value: "ORDER_CANCELLED", label: "Cancelled" },
] as const;

const CART_EVENT = "oddwheels:cart-updated";

function formatActionLabel(value: string) {
  return String(value || "")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-PH");
}

function formatPeso(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function parseJsonMaybe(value: unknown) {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, any>;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, any>;
    } catch {
      return null;
    }
  }
  return null;
}

function getOrderId(log: AuditLogRow) {
  const meta = log.meta ?? {};
  const id = meta.order_id ?? meta.orderId ?? meta.id;
  return id ? String(id) : "-";
}

function getOrderCustomerName(order: OrderRow | null | undefined) {
  if (!order) return "";
  const details = parseJsonMaybe(order.shipping_details) ?? {};
  return (
    String(details.receiver_name ?? "").trim() ||
    [details.first_name, details.last_name].filter(Boolean).join(" ").trim() ||
    String(order.customer_name ?? "").trim()
  );
}

function getOrderPhone(order: OrderRow | null | undefined) {
  if (!order) return "";
  const details = parseJsonMaybe(order.shipping_details) ?? {};
  return String(
    details.receiver_phone ??
      details.phone ??
      order.customer_phone ??
      order.contact ??
      ""
  ).trim();
}

function getOrderAddress(order: OrderRow | null | undefined) {
  if (!order) return "";
  const details = parseJsonMaybe(order.shipping_details) ?? {};
  const method = String(order.shipping_method ?? details.method ?? "").toUpperCase();

  if (method === "LBC" || method === "LBC PICKUP") {
    const branchName = String(details.branch_name ?? details.branch ?? "").trim();
    const branchCity = String(details.branch_city ?? "").trim();
    return [branchName, branchCity].filter(Boolean).join(", ");
  }

  if (method === "LALAMOVE") {
    return String(details.dropoff_address ?? order.address ?? "").trim();
  }

  return String(details.full_address ?? details.address ?? order.address ?? "").trim();
}

function getOrderItemsLabel(items: OrderItemRow[]) {
  if (!items.length) return "-";
  return items
    .slice(0, 3)
    .map((item) => {
      const title = String(item.item_name ?? item.product_title ?? "Item").trim();
      const qty = Number(item.qty ?? 0);
      return qty > 1 ? `${title} x${qty}` : title;
    })
    .join(", ");
}

function getEntryAction(entry: OrderLogEntry) {
  return entry.log?.action ?? "ORDER_CREATED";
}

function emitCartUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CART_EVENT, { detail: { source: "admin-order-logs" } })
  );
}

export default function AdminOrderLogsPage() {
  const [logs, setLogs] = React.useState<AuditLogRow[]>([]);
  const [ordersById, setOrdersById] = React.useState<Record<string, OrderRow>>({});
  const [itemsByOrderId, setItemsByOrderId] = React.useState<Record<string, OrderItemRow[]>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("ALL");
  const [addingCartOrderId, setAddingCartOrderId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    async function loadLogs() {
      setLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from("audit_logs")
        .select("id,actor_user_id,action,meta,created_at")
        .like("action", "ORDER_%")
        .order("created_at", { ascending: false })
        .limit(300);

      if (!mounted) return;

      if (loadError) {
        console.error(loadError);
        setError(loadError.message || "Failed to load logs.");
        setLogs([]);
        setOrdersById({});
        setItemsByOrderId({});
        setLoading(false);
        return;
      }

      const nextLogs = (data as AuditLogRow[]) ?? [];
      setLogs(nextLogs);

      const { data: ordersData, error: ordersLoadError } = await supabase
        .from("orders")
        .select(
          "id,created_at,customer_name,customer_phone,contact,address,shipping_method,shipping_region,shipping_details,payment_method,payment_status,shipping_status,status,total,channel"
        )
        .order("created_at", { ascending: false })
        .limit(300);

      if (ordersLoadError) {
        console.error(ordersLoadError);
        setError(ordersLoadError.message || "Failed to load orders.");
        setOrdersById({});
        setItemsByOrderId({});
        setLoading(false);
        return;
      }

      const orderIds = ((ordersData as OrderRow[] | null) ?? []).map((order) => order.id);

      const { data: itemsData, error: itemsLoadError } = orderIds.length
        ? await supabase
            .from("order_items")
            .select("order_id,variant_id,item_id,qty,item_name,product_title")
            .in("order_id", orderIds)
        : { data: [], error: null };

      if (itemsLoadError) {
        console.error(itemsLoadError);
      }

      const nextOrdersById: Record<string, OrderRow> = {};
      for (const order of (ordersData as OrderRow[] | null) ?? []) {
        nextOrdersById[order.id] = order;
      }
      setOrdersById(nextOrdersById);

      const nextItemsByOrderId: Record<string, OrderItemRow[]> = {};
      for (const item of (itemsData as OrderItemRow[] | null) ?? []) {
        const orderId = String(item.order_id);
        if (!nextItemsByOrderId[orderId]) nextItemsByOrderId[orderId] = [];
        nextItemsByOrderId[orderId].push(item);
      }
      setItemsByOrderId(nextItemsByOrderId);

      setLoading(false);
    }

    loadLogs();
    return () => {
      mounted = false;
    };
  }, []);

  async function addOrderToAdminCart(entry: OrderLogEntry) {
    const orderId = String(entry.orderId || "").trim();
    if (!orderId) return;
    if (addingCartOrderId === orderId) return;

    const variantQtyToAdd = new Map<string, number>();
    for (const item of entry.items) {
      const variantId = String(item.variant_id ?? item.item_id ?? "").trim();
      const qty = Math.max(0, Number(item.qty ?? 0));
      if (!variantId || qty <= 0) continue;
      variantQtyToAdd.set(variantId, (variantQtyToAdd.get(variantId) ?? 0) + qty);
    }

    if (!variantQtyToAdd.size) {
      toast({
        intent: "error",
        title: "Nothing to add",
        message: "This order does not have any variant lines that can be added to the admin cart.",
      });
      return;
    }

    setAddingCartOrderId(orderId);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      const userId = String(user?.id ?? "").trim();
      if (!userId) {
        throw new Error("Staff session not found. Please sign in again.");
      }

      const variantIds = Array.from(variantQtyToAdd.keys());
      const [existingRes, inventoryRes] = await Promise.all([
        supabase
          .from("cart_items")
          .select("id,variant_id,qty")
          .eq("user_id", userId)
          .in("variant_id", variantIds),
        supabase.from("product_variants").select("id,qty").in("id", variantIds),
      ]);

      if (existingRes.error) throw existingRes.error;
      if (inventoryRes.error) throw inventoryRes.error;

      const existingMap = new Map<string, { id: string; qty: number }>();
      for (const row of (existingRes.data as any[] | null) ?? []) {
        if (!row?.id || !row?.variant_id) continue;
        existingMap.set(String(row.variant_id), {
          id: String(row.id),
          qty: Math.max(0, Number(row.qty ?? 0)),
        });
      }

      const inventoryMap = new Map<string, number>();
      for (const row of (inventoryRes.data as any[] | null) ?? []) {
        if (!row?.id) continue;
        inventoryMap.set(String(row.id), Math.max(0, Number(row.qty ?? 0)));
      }

      const writes: PromiseLike<any>[] = [];
      let addedVariants = 0;
      let addedUnits = 0;
      let cappedVariants = 0;

      for (const variantId of variantIds) {
        const qtyToAdd = Math.max(0, Number(variantQtyToAdd.get(variantId) ?? 0));
        const available = Math.max(0, Number(inventoryMap.get(variantId) ?? 0));
        if (!qtyToAdd || !available) continue;

        const existing = existingMap.get(variantId);
        if (existing?.id) {
          const nextQty = Math.max(1, Math.min(existing.qty + qtyToAdd, available));
          if (nextQty !== existing.qty) {
            writes.push(supabase.from("cart_items").update({ qty: nextQty }).eq("id", existing.id));
            addedVariants += 1;
            addedUnits += nextQty - existing.qty;
            if (nextQty < existing.qty + qtyToAdd) cappedVariants += 1;
          }
          continue;
        }

        const nextQty = Math.max(1, Math.min(qtyToAdd, available));
        writes.push(
          supabase.from("cart_items").insert({
            user_id: userId,
            variant_id: variantId,
            qty: nextQty,
            protector_selected: false,
          })
        );
        addedVariants += 1;
        addedUnits += nextQty;
        if (nextQty < qtyToAdd) cappedVariants += 1;
      }

      const results = await Promise.all(writes);
      const failed = results.find((result: any) => result?.error);
      if (failed?.error) throw failed.error;

      if (!writes.length) {
        toast({
          intent: "error",
          title: "Nothing added",
          message: "No stock is currently available for this order's items.",
        });
        return;
      }

      emitCartUpdated();
      toast({
        intent: "success",
        title: "Added to admin cart",
        message:
          cappedVariants > 0
            ? `${addedVariants} variant(s) and ${addedUnits} unit(s) were added. ${cappedVariants} variant(s) were capped by current stock.`
            : `${addedVariants} variant(s) and ${addedUnits} unit(s) were added to your admin cart.`,
        action: { label: "View cart", href: "/cart" },
      });
    } catch (e: any) {
      toast({
        intent: "error",
        title: "Admin cart update failed",
        message: e?.message ?? "Could not add this order to the admin cart.",
      });
    } finally {
      setAddingCartOrderId(null);
    }
  }

  const entries = React.useMemo<OrderLogEntry[]>(() => {
    const latestLogByOrderId: Record<string, AuditLogRow> = {};
    for (const log of logs) {
      const orderId = getOrderId(log);
      if (!orderId || orderId === "-") continue;
      if (!latestLogByOrderId[orderId]) latestLogByOrderId[orderId] = log;
    }

    const orderedIds = Object.keys(ordersById).sort((a, b) => {
      const aLog = latestLogByOrderId[a];
      const bLog = latestLogByOrderId[b];
      const aTime = new Date(aLog?.created_at ?? 0).getTime();
      const bTime = new Date(bLog?.created_at ?? 0).getTime();
      if (aTime !== bTime) return bTime - aTime;
      return 0;
    });

    return orderedIds.map((orderId) => ({
      orderId,
      order: ordersById[orderId] ?? null,
      items: itemsByOrderId[orderId] ?? [],
      log: latestLogByOrderId[orderId] ?? null,
    }));
  }, [logs, ordersById, itemsByOrderId]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const action = getEntryAction(entry);
      if (actionFilter !== "ALL" && action !== actionFilter) return false;
      if (!q) return true;
      const order = entry.order;
      const items = entry.items;
      const haystack = [
        entry.orderId,
        action,
        entry.log?.actor_user_id,
        getOrderCustomerName(order),
        getOrderPhone(order),
        getOrderAddress(order),
        order?.shipping_method,
        order?.shipping_region,
        order?.payment_method,
        order?.payment_status,
        order?.shipping_status,
        order?.status,
        order?.channel,
        ...items.map((item) => item.item_name ?? item.product_title ?? ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query, actionFilter]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Order logs</div>
            <div className="text-sm text-white/60">Order actions from audit logs.</div>
          </div>
          <Badge>{filtered.length}</Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1.4fr_0.6fr]">
            <Input
              label="Search"
              placeholder="Order id, action, or staff id"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select
              label="Action"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {loading ? (
            <div className="text-sm text-white/60">Loading logs...</div>
          ) : error ? (
            <div className="text-sm text-red-200">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-white/60">No logs found.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((entry) => {
                const orderId = entry.orderId;
                const order = entry.order;
                const items = entry.items;
                const customerName = getOrderCustomerName(order) || "Unknown customer";
                const phone = getOrderPhone(order) || "-";
                const address = getOrderAddress(order) || "-";
                const shortOrderId =
                  orderId && orderId !== "-" ? String(orderId).slice(0, 8) : "-";
                const action = getEntryAction(entry);
                const hasCartableItems = items.some((item) => {
                  const variantId = String(item.variant_id ?? item.item_id ?? "").trim();
                  return Boolean(variantId) && Math.max(0, Number(item.qty ?? 0)) > 0;
                });
                const isAddingToCart = addingCartOrderId === orderId;

                return (
                  <div
                    key={entry.log?.id ?? orderId}
                    className="rounded-2xl border border-white/10 bg-bg-900/30 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{customerName}</div>
                        <div className="text-xs text-white/50">Order #{shortOrderId}</div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-right text-xs text-white/50">
                          {formatDate(entry.log?.created_at ?? order?.created_at)}
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void addOrderToAdminCart(entry)}
                          disabled={!hasCartableItems || isAddingToCart}
                        >
                          {isAddingToCart ? "Adding..." : "Add to Admin Cart"}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/65">
                      <span>Action: {formatActionLabel(action)}</span>
                      <span>
                        Staff: {entry.log?.actor_user_id ? String(entry.log.actor_user_id).slice(0, 8) : "-"}
                      </span>
                      <span>Total: {order ? formatPeso(order.total) : "-"}</span>
                    </div>

                    {order ? (
                      <div className="mt-3 grid gap-2 text-xs text-white/70 md:grid-cols-2">
                        <div>Phone: {phone}</div>
                        <div>
                          Payment: {String(order.payment_method ?? "-")} /{" "}
                          {String(order.payment_status ?? "-")}
                        </div>
                        <div>
                          Shipping: {String(order.shipping_method ?? "-")} /{" "}
                          {String(order.shipping_status ?? "-")}
                        </div>
                        <div>
                          Status: {String(order.status ?? "-")} / {String(order.channel ?? "-")}
                        </div>
                        <div className="md:col-span-2">Address / branch: {address}</div>
                        <div className="md:col-span-2">Items: {getOrderItemsLabel(items)}</div>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-white/50">
                        Order record unavailable for this log entry.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
