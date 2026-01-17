"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCheck, Clock3, Package, Truck, Wallet } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Order, useOrders } from "@/hooks/useOrders";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPHP } from "@/lib/money";
import { supabase } from "@/lib/supabase/browser";
import {
  badgeToneClass,
  formatStatusLabel,
  getBadges,
  normalizeShippingStatus,
} from "@/lib/orderBadges";

type StageKey =
  | "PENDING_APPROVAL"
  | "TO_PAY"
  | "TO_SHIP"
  | "SHIPPED"
  | "COMPLETED";

const STAGE_ORDER: StageKey[] = [
  "PENDING_APPROVAL",
  "TO_PAY",
  "TO_SHIP",
  "SHIPPED",
  "COMPLETED",
];

const STAGE_META: Record<
  StageKey,
  {
    label: string;
    hint: string;
    empty: string;
    badgeClass: string;
    summaryClass: string;
    icon: typeof Clock3;
  }
> = {
  PENDING_APPROVAL: {
    label: "Pending approval",
    hint: "Waiting for staff approval",
    empty: "No orders pending approval.",
    badgeClass:
      "border-amber-400/70 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
    summaryClass:
      "bg-amber-50 text-amber-800/80 dark:bg-amber-500/5 dark:text-amber-100/80",
    icon: Clock3,
  },
  TO_PAY: {
    label: "To pay",
    hint: "Payment required or under review",
    empty: "No orders waiting for payment.",
    badgeClass:
      "border-orange-400/70 bg-orange-50 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-100",
    summaryClass:
      "bg-orange-50 text-orange-800/80 dark:bg-orange-500/5 dark:text-orange-100/80",
    icon: Wallet,
  },
  TO_SHIP: {
    label: "To ship",
    hint: "Paid orders preparing to ship",
    empty: "No orders preparing to ship.",
    badgeClass:
      "border-sky-400/70 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100",
    summaryClass:
      "bg-sky-50 text-sky-800/80 dark:bg-sky-500/5 dark:text-sky-100/80",
    icon: Package,
  },
  SHIPPED: {
    label: "Shipped",
    hint: "Orders on the way",
    empty: "No shipped orders.",
    badgeClass:
      "border-blue-400/70 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100",
    summaryClass:
      "bg-blue-50 text-blue-800/80 dark:bg-blue-500/5 dark:text-blue-100/80",
    icon: Truck,
  },
  COMPLETED: {
    label: "Completed",
    hint: "Delivered or confirmed received",
    empty: "No completed orders.",
    badgeClass:
      "border-emerald-400/70 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
    summaryClass:
      "bg-emerald-50 text-emerald-800/80 dark:bg-emerald-500/5 dark:text-emerald-100/80",
    icon: CheckCheck,
  },
};

function stageFromOrder(o: Order): StageKey | null {
  const status = String(o.status ?? "").toUpperCase();
  if (status === "VOIDED" || status === "CANCELLED") return null;

  const payment = String(o.payment_status ?? "").toUpperCase() || "UNPAID";
  const shipping = normalizeShippingStatus(o.shipping_status) ?? "";

  const isPendingApproval =
    status === "PENDING_APPROVAL" ||
    status === "PENDING_STAFF_APPROVAL" ||
    status === "PENDING";
  if (isPendingApproval) return "PENDING_APPROVAL";

  if (shipping === "COMPLETED" || status === "COMPLETED") return "COMPLETED";
  if (shipping === "SHIPPED" || status === "SHIPPED") return "SHIPPED";

  const isApprovedOrReserved = [
    "AWAITING_PAYMENT",
    "PAYMENT_SUBMITTED",
    "PAYMENT_REVIEW",
    "RESERVED",
    "APPROVED",
    "ORDER_APPROVED",
  ].includes(status);

  if (payment !== "PAID") {
    if (isApprovedOrReserved) return "TO_PAY";
    return "TO_PAY";
  }

  if (shipping === "PREPARING_TO_SHIP") return "TO_SHIP";
  return "TO_SHIP";
}

function OrderCard({ o, stage }: { o: Order; stage?: StageKey | null }) {
  const stageKey = stage ?? stageFromOrder(o);
  const stageMeta = stageKey ? STAGE_META[stageKey] : null;
  const status = String(o.status ?? "").toUpperCase();
  const isCancelled = status === "CANCELLED" || status === "VOIDED";
  const statusLabel = formatStatusLabel(status);
  const paymentStatus = String(o.payment_status ?? "").toUpperCase();
  const canCancel =
    !isCancelled &&
    paymentStatus !== "PAID" &&
    [
      "PENDING_PAYMENT",
      "PENDING_APPROVAL",
      "PENDING_STAFF_APPROVAL",
      "PENDING",
      "AWAITING_PAYMENT",
      "PAYMENT_SUBMITTED",
      "PAYMENT_REVIEW",
    ].includes(status);
  const shippingStatus = normalizeShippingStatus(o.shipping_status);
  const canShowShipping =
    paymentStatus === "PAID" && !isCancelled && Boolean(shippingStatus);
  const shippingLabel = shippingStatus ? formatStatusLabel(shippingStatus) : "";
  const createdAt = o.created_at
    ? new Date(o.created_at).toLocaleString("en-PH")
    : "";
  const paymentMethod = o.payment_method ? ` (${o.payment_method})` : "";
  const badges = getBadges(o);
  const lineTotal = Number(o.total ?? 0);
  const showLineTotal = Number.isFinite(lineTotal) && lineTotal > 0;
  const [canceling, setCanceling] = React.useState(false);
  const [cancelMsg, setCancelMsg] = React.useState<string | null>(null);

  async function onCancel(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!canCancel) return;
    const confirmed = window.confirm("Cancel this order? This cannot be undone.");
    if (!confirmed) return;
    setCancelMsg(null);
    setCanceling(true);
    try {
      const { error } = await supabase.rpc("fn_customer_cancel_pending_order", {
        p_order_id: o.id,
      });
      if (error) throw error;
      window.location.reload();
    } catch (err: any) {
      setCancelMsg(err?.message ?? "Failed to cancel order.");
    } finally {
      setCanceling(false);
    }
  }

  return (
    <Link
      key={o.id}
      href={`/orders/${o.id}`}
      className="panel block p-4 sm:p-5 transition hover:border-white/20 hover:bg-paper/10"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[180px]">
          <div className="font-semibold">Order #{o.id.slice(0, 8)}</div>
          {createdAt ? (
            <div className="text-xs text-white/50">Placed {createdAt}</div>
          ) : null}
        </div>
        {showLineTotal ? (
          <div className="text-price">{formatPHP(lineTotal)}</div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {badges.length ? (
          badges.map((badge, index) => (
            <Badge key={`${badge.label}-${index}`} className={badgeToneClass(badge.tone)}>
              {badge.label}
            </Badge>
          ))
        ) : stageMeta ? (
          <Badge className={stageMeta.badgeClass}>{stageMeta.label}</Badge>
        ) : (
          <Badge className="border-red-400/70 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100">
            {statusLabel}
          </Badge>
        )}
      </div>

      <div className="mt-2 text-xs text-white/60">
        Order status: {statusLabel} | Payment: {formatStatusLabel(paymentStatus)}
        {paymentMethod}
        {canShowShipping ? ` | Shipping: ${shippingLabel}` : ""}
      </div>
      {canCancel ? (
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={canceling}
            className="h-6 px-2 text-[10px] bg-red-700/60 text-white border border-red-700/60 hover:bg-red-600/80 hover:border-red-600/80"
          >
            {canceling ? "Cancelling..." : "Cancel"}
          </Button>
          {cancelMsg ? (
            <span className="text-[11px] text-red-200/80">{cancelMsg}</span>
          ) : null}
        </div>
      ) : null}
      {o.status === "CANCELLED" && o.cancelled_reason === "PAYMENT_TIMEOUT" ? (
        <div className="mt-2 text-xs text-amber-800 dark:text-amber-100">
          Order expired due to non-payment. Items returned to inventory.
        </div>
      ) : null}
      {o.status === "CANCELLED" && o.cancelled_reason === "SOLD_OUT" ? (
        <div className="mt-2 text-xs text-red-800 dark:text-red-100">
          Items are sold out, please order again.
        </div>
      ) : null}
    </Link>
  );
}

function OrdersContent() {
  const { orders, loading } = useOrders();
  const [activeTab, setActiveTab] = React.useState<StageKey>("PENDING_APPROVAL");

  const activeOrders = React.useMemo(
    () => (orders ?? []).filter((o) => o.status !== "VOIDED" && o.status !== "CANCELLED"),
    [orders]
  );
  const cancelled = React.useMemo(
    () => (orders ?? []).filter((o) => o.status === "VOIDED" || o.status === "CANCELLED"),
    [orders]
  );

  const stageBuckets = React.useMemo(() => {
    const buckets: Record<StageKey, Order[]> = {
      PENDING_APPROVAL: [],
      TO_PAY: [],
      TO_SHIP: [],
      SHIPPED: [],
      COMPLETED: [],
    };
    for (const o of activeOrders) {
      const stage = stageFromOrder(o);
      if (!stage) continue;
      buckets[stage].push(o);
    }
    return buckets;
  }, [activeOrders]);

  React.useEffect(() => {
    if (loading) return;
    const firstWithOrders =
      STAGE_ORDER.find((key) => stageBuckets[key].length > 0) ?? "PENDING_APPROVAL";
    setActiveTab((cur) => (cur === firstWithOrders ? cur : firstWithOrders));
  }, [loading, stageBuckets]);

  const activeList = stageBuckets[activeTab] ?? [];

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">My Orders</h1>
        <div className="text-sm text-white/60">Track your orders and shipping updates.</div>
      </div>

      <div className="-mx-4 px-4">
        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-visible">
          {STAGE_ORDER.map((key) => {
            const meta = STAGE_META[key];
            const count = stageBuckets[key].length;
            const active = key === activeTab;
            const Icon = meta.icon;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`relative snap-start shrink-0 rounded-full border bg-bg-900/20 px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60 ${
                  active
                    ? "border-accent-500/60 text-white"
                    : "border-white/10 text-white/70 hover:border-white/30 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <Icon className="h-4 w-4 opacity-70" />
                  <span>{meta.label}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      active
                        ? "border-accent-500/40 text-accent-900 dark:text-accent-100"
                        : "border-white/10 text-white/60"
                    }`}
                  >
                    {loading ? "..." : count}
                  </span>
                </span>
                {active ? (
                  <span className="pointer-events-none absolute inset-x-4 -bottom-1 h-0.5 rounded-full bg-accent-500/80" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">{STAGE_META[activeTab].label}</div>
            <div className="text-xs text-white/60">{STAGE_META[activeTab].hint}</div>
          </div>
          <Badge className={STAGE_META[activeTab].badgeClass}>
            {loading ? "..." : activeList.length}
          </Badge>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="text-white/60">Loading...</div>
          ) : activeList.length === 0 ? (
            <div className="text-white/60">{STAGE_META[activeTab].empty}</div>
          ) : (
            <div className="space-y-3">
              {activeList.map((o) => (
                <OrderCard key={o.id} o={o} stage={activeTab} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {cancelled.length ? (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="font-semibold">Cancelled / Voided</div>
            <Badge className="border-red-400/70 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100">
              {cancelled.length}
            </Badge>
          </CardHeader>
          <CardBody>
            {loading ? (
              <div className="text-white/60">Loading...</div>
            ) : (
              <div className="space-y-3">
                {cancelled.map((o) => (
                  <OrderCard key={o.id} o={o} stage={null} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      ) : null}
    </main>
  );
}

export default function OrdersPage() {
  return (
    <RequireAuth>
      <OrdersContent />
    </RequireAuth>
  );
}
