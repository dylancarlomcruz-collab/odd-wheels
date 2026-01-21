"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCheck,
  Clock3,
  Package,
  Star,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Order, OrderItemPreview, useOrders } from "@/hooks/useOrders";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/components/ui/toast";
import { formatPHP } from "@/lib/money";
import { formatConditionLabel } from "@/lib/conditions";
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

type FeedbackPrompt = {
  orderId?: string | null;
  createdAt?: string | null;
};

const FEEDBACK_PROMPT_KEY = "ow_feedback_prompt";
const FEEDBACK_NEVER_SHOW_KEY = "ow_feedback_never_show";
const FEEDBACK_LAST_KEY = "ow_feedback_last";
const FEEDBACK_NEVER_SHOW_TTL_MS = 1000 * 60 * 60 * 24 * 21;

const LEAD_TIME_RULES: Array<{
  labels: string[];
  minDays: number;
  maxDays: number;
}> = [
  { labels: ["NCR", "METRO MANILA", "METRO_MANILA"], minDays: 1, maxDays: 1 },
  { labels: ["SOUTH LUZON", "SOUTHERN LUZON"], minDays: 1, maxDays: 2 },
  { labels: ["NORTH LUZON"], minDays: 1, maxDays: 2 },
  { labels: ["VISAYAS"], minDays: 2, maxDays: 5 },
  { labels: ["MINDANAO"], minDays: 3, maxDays: 6 },
  { labels: ["PUERTO PRINCESA"], minDays: 2, maxDays: 3 },
  { labels: ["BATANES"], minDays: 3, maxDays: 5 },
  { labels: ["CORON"], minDays: 3, maxDays: 4 },
  { labels: ["MINDORO", "MASBATE", "CATANDUANES", "MARINDUQUE"], minDays: 2, maxDays: 4 },
];

const JT_LEAD_TIME_RULES: Array<{
  labels: string[];
  minDays: number;
  maxDays: number;
}> = [
  { labels: ["NCR", "METRO MANILA", "METRO_MANILA"], minDays: 1, maxDays: 2 },
  { labels: ["LUZON", "NORTH LUZON", "SOUTH LUZON"], minDays: 1, maxDays: 2 },
  { labels: ["VISAYAS"], minDays: 3, maxDays: 4 },
  { labels: ["MINDANAO"], minDays: 3, maxDays: 4 },
  {
    labels: [
      "ISLAND",
      "BATANES",
      "CORON",
      "MINDORO",
      "MASBATE",
      "CATANDUANES",
      "MARINDUQUE",
      "PUERTO PRINCESA",
      "PALAWAN",
    ],
    minDays: 5,
    maxDays: 6,
  },
];

function normalizeRegion(raw: string | null | undefined) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/_/g, " ");
}

function isJtCourier(raw: string | null | undefined) {
  const value = String(raw ?? "").toUpperCase();
  return value.includes("J&T") || value.includes("JNT");
}

function getLeadTime(
  region: string | null | undefined,
  courier: string | null | undefined
) {
  const normalized = normalizeRegion(region);
  if (!normalized) return null;
  const rules = isJtCourier(courier) ? JT_LEAD_TIME_RULES : LEAD_TIME_RULES;
  for (const rule of rules) {
    if (rule.labels.includes(normalized)) {
      return rule;
    }
  }
  return null;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function formatArrivalDate(value: Date) {
  return value.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatLeadTimeRange(minDays: number, maxDays: number) {
  if (minDays === maxDays) {
    return minDays === 1 ? "1 day" : `${minDays} days`;
  }
  return `${minDays}-${maxDays} days`;
}

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

function getItemThumb(it: OrderItemPreview): string | null {
  const urls = it?.product_variant?.product?.image_urls;
  if (Array.isArray(urls) && urls.length) return String(urls[0]);
  const fallbackUrls = it?.product?.image_urls;
  if (Array.isArray(fallbackUrls) && fallbackUrls.length) return String(fallbackUrls[0]);
  return null;
}

function getItemTitle(it: OrderItemPreview): string {
  const name = String(it?.item_name ?? "").trim();
  if (name) return name;
  const snapshot = String(it?.name_snapshot ?? "").trim();
  if (snapshot) return snapshot;
  return (
    it?.product_title ||
    it?.product_variant?.product?.title ||
    it?.product?.title ||
    it?.item_id ||
    "Item"
  );
}

function getItemCondition(it: OrderItemPreview): string {
  const raw = it?.condition ?? it?.product_variant?.condition;
  const label = formatConditionLabel(raw, { upper: true });
  return label === "-" ? "" : label;
}

function getItemQty(it: OrderItemPreview): number {
  const qty = Number(it?.qty ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function getItemPrice(it: OrderItemPreview, qty: number): number {
  const line = Number(it?.line_total ?? 0);
  if (Number.isFinite(line) && line > 0) return line;
  const unit = Number(it?.price_each ?? it?.unit_price ?? it?.price ?? 0);
  if (Number.isFinite(unit) && unit > 0) return unit * qty;
  return 0;
}

function OrderCard({
  o,
  stage,
  items = [],
}: {
  o: Order;
  stage?: StageKey | null;
  items?: OrderItemPreview[];
}) {
  const router = useRouter();
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
  const createdAt = o.created_at
    ? new Date(o.created_at).toLocaleString("en-PH")
    : "";
  const badges = getBadges(o);
  const lineTotal = Number(o.total ?? 0);
  const showLineTotal = Number.isFinite(lineTotal) && lineTotal > 0;
  const [canceling, setCanceling] = React.useState(false);
  const [cancelMsg, setCancelMsg] = React.useState<string | null>(null);
  const [showAllItems, setShowAllItems] = React.useState(false);
  const [copyMsg, setCopyMsg] = React.useState<string | null>(null);
  const previewCount = 2;
  const visibleItems = showAllItems ? items : items.slice(0, previewCount);
  const hiddenCount = Math.max(0, items.length - previewCount);
  const hiddenLabel = hiddenCount === 1 ? "item" : "items";
  const canPayNow =
    !isCancelled && stageKey === "TO_PAY" && paymentStatus !== "PAID";
  const tracking =
    stageKey === "SHIPPED" && o.tracking_number
      ? String(o.tracking_number).trim()
      : "";
  const courierLabel = o.courier ? String(o.courier).trim() : "";
  const leadTime =
    stageKey === "SHIPPED"
      ? getLeadTime(o.shipping_region, o.courier ?? o.shipping_method)
      : null;
  const shippedAt = o.shipped_at ? new Date(o.shipped_at) : null;
  const etaLabel =
    stageKey === "SHIPPED" && shippedAt && leadTime
      ? formatArrivalDate(addDays(shippedAt, leadTime.maxDays))
      : "";
  const leadTimeLabel = leadTime
    ? formatLeadTimeRange(leadTime.minDays, leadTime.maxDays)
    : "";

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

  async function onCopyTracking(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!tracking) return;
    try {
      await navigator.clipboard.writeText(tracking);
      setCopyMsg("Copied!");
      window.setTimeout(() => setCopyMsg(null), 1200);
    } catch {
      setCopyMsg("Copy failed");
      window.setTimeout(() => setCopyMsg(null), 1200);
    }
  }

  function onOpenTracking(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    window.open("https://www.lbcexpress.com/track/", "_blank", "noreferrer");
  }

  function onPayNow(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/orders/${o.id}`);
  }

  return (
    <Link
      key={o.id}
      href={`/orders/${o.id}`}
      className="panel block p-4 sm:p-5 transition hover:border-white/20 hover:bg-paper/10"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[180px]">
          <div className="text-base font-semibold">Order #{o.id.slice(0, 8)}</div>
          {createdAt ? (
            <div className="text-xs text-white/50">Placed {createdAt}</div>
          ) : null}
        </div>
        {showLineTotal ? (
          <div className="text-price text-base">{formatPHP(lineTotal)}</div>
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

      {items.length ? (
        <div className="mt-3">
          <div className="w-full rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
            <div className="text-sm font-semibold text-white/80">Items</div>
            <div className="mt-3 space-y-2">
              {visibleItems.map((it, index) => {
                const thumb = getItemThumb(it);
                const title = getItemTitle(it);
                const condition = getItemCondition(it);
                const qty = getItemQty(it);
                const price = getItemPrice(it, qty);
                const subtitle = condition ? `${condition} x${qty}` : `x${qty}`;
                const soldOut =
                  String((it as any)?.cancel_reason ?? "") === "SOLD_OUT" ||
                  Boolean((it as any)?.is_cancelled);
                return (
                  <div
                    key={`${o.id}-item-${index}`}
                    className={`flex items-center gap-3 rounded-xl border border-white/10 p-2 ${
                      soldOut ? "bg-red-500/5" : "bg-paper/5"
                    }`}
                  >
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-bg-900/40">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt={title} className="h-full w-full object-cover" />
                      ) : (
                        <span className="px-1 text-[10px] text-white/50">No photo</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{title}</div>
                      <div className="text-xs text-white/60">{subtitle}</div>
                    </div>
                      {soldOut ? (
                        <div className="text-sm font-semibold text-price">Sold out</div>
                    ) : price > 0 ? (
                      <div className="text-sm text-price">{formatPHP(price)}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {items.length > previewCount ? (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowAllItems((cur) => !cur);
                  }}
                  className="rounded-full border border-white/10 bg-bg-900/40 px-3 py-1 text-[11px] text-white/70 hover:border-white/30 hover:text-white"
                >
                  {showAllItems
                    ? "Show fewer items"
                    : `Show ${hiddenCount} more ${hiddenLabel}`}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tracking ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/60">
          <div>
            Tracking{courierLabel ? ` (${courierLabel})` : ""}:{" "}
            <span className="text-white/90">{tracking}</span>
          </div>
          <button
            type="button"
            onClick={onOpenTracking}
            className="rounded-full border border-white/10 bg-bg-900/40 px-2 py-0.5 text-[10px] text-white/70 hover:border-white/30 hover:text-white"
          >
            Track package
          </button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onCopyTracking}
            className="h-6 px-2 text-[10px]"
          >
            Copy
          </Button>
          {copyMsg ? <span className="text-[10px] text-white/50">{copyMsg}</span> : null}
        </div>
      ) : null}
      {etaLabel ? (
        <div className="mt-2 text-xs text-white/60">
          Expect your items to arrive by:{" "}
          <span className="text-white/90">{etaLabel}</span>
          {leadTimeLabel ? (
            <span className="text-white/50">{` (${leadTimeLabel})`}</span>
          ) : null}
        </div>
      ) : null}

      {canPayNow || canCancel ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canPayNow ? (
            <Button type="button" size="sm" variant="primary" onClick={onPayNow}>
              Pay now
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onCancel}
              disabled={canceling}
              className="border-red-700/60 text-red-100 hover:bg-red-600/20 hover:border-red-600/80"
            >
              {canceling ? "Cancelling..." : "Cancel"}
            </Button>
          ) : null}
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
          Sorry about this. The item was approved for an earlier order before we could
          process yours, so it became unavailable. Any remaining in-stock items were
          automatically returned to your cart. We’re improving our system to help
          prevent this in the future. Thank you for your understanding.
        </div>
      ) : null}
    </Link>
  );
}

function OrdersContent() {
  const { orders, itemsByOrderId, loading } = useOrders();
  const [activeTab, setActiveTab] = React.useState<StageKey>("PENDING_APPROVAL");
  const router = useRouter();
  const [showFeedback, setShowFeedback] = React.useState(false);
  const [feedbackPrompt, setFeedbackPrompt] = React.useState<FeedbackPrompt | null>(null);
  const [rating, setRating] = React.useState(0);
  const [feedbackExperience, setFeedbackExperience] = React.useState("");
  const [feedbackChange, setFeedbackChange] = React.useState("");
  const [feedbackError, setFeedbackError] = React.useState<string | null>(null);
  const [feedbackNeverShow, setFeedbackNeverShow] = React.useState(false);

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

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const neverRaw = window.localStorage.getItem(FEEDBACK_NEVER_SHOW_KEY);
      if (neverRaw) {
        let until: number | null = null;
        try {
          const parsed = JSON.parse(neverRaw);
          if (parsed && typeof parsed.until === "number") {
            until = parsed.until;
          }
        } catch {
          // Ignore parse errors for legacy values.
        }

        if (!until) {
          const fallbackUntil = Date.now() + FEEDBACK_NEVER_SHOW_TTL_MS;
          window.localStorage.setItem(
            FEEDBACK_NEVER_SHOW_KEY,
            JSON.stringify({ until: fallbackUntil })
          );
          return;
        }

        if (Date.now() < until) return;
        window.localStorage.removeItem(FEEDBACK_NEVER_SHOW_KEY);
      }
      const raw = window.localStorage.getItem(FEEDBACK_PROMPT_KEY);
      if (!raw) return;
      let parsed: FeedbackPrompt = {};
      try {
        parsed = JSON.parse(raw) ?? {};
      } catch {
        parsed = { orderId: raw };
      }
      setFeedbackPrompt(parsed);
      setShowFeedback(true);
    } catch {
      // Ignore localStorage issues.
    }
  }, []);

  React.useEffect(() => {
    if (showFeedback) {
      setFeedbackNeverShow(false);
    }
  }, [showFeedback]);

  const promptOrderId = feedbackPrompt?.orderId
    ? String(feedbackPrompt.orderId).slice(0, 8)
    : "";

  const activeList = stageBuckets[activeTab] ?? [];

  function clearFeedbackPrompt() {
    try {
      window.localStorage.removeItem(FEEDBACK_PROMPT_KEY);
    } catch {
      // Ignore localStorage issues.
    }
  }

  function closeFeedback() {
    if (feedbackNeverShow) {
      try {
        window.localStorage.setItem(
          FEEDBACK_NEVER_SHOW_KEY,
          JSON.stringify({ until: Date.now() + FEEDBACK_NEVER_SHOW_TTL_MS })
        );
      } catch {
        // Ignore localStorage issues.
      }
    }
    clearFeedbackPrompt();
    setFeedbackError(null);
    setShowFeedback(false);
  }

  function onSubmitFeedback() {
    const experience = feedbackExperience.trim();
    const change = feedbackChange.trim();
    if (!rating && !experience && !change) {
      setFeedbackError("Add a rating or a quick note before sending.");
      return;
    }

    setFeedbackError(null);
    const payload = {
      orderId: feedbackPrompt?.orderId ?? null,
      rating: rating || null,
      experience: experience || null,
      change: change || null,
      createdAt: new Date().toISOString(),
    };

    try {
      window.localStorage.setItem(FEEDBACK_LAST_KEY, JSON.stringify(payload));
    } catch {
      // Ignore localStorage issues.
    }

    toast({ message: "Thanks for the feedback!", intent: "success", duration: 2200 });
    setRating(0);
    setFeedbackExperience("");
    setFeedbackChange("");
    closeFeedback();
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-bg-900/40 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
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
                <OrderCard
                  key={o.id}
                  o={o}
                  stage={activeTab}
                  items={itemsByOrderId[o.id] ?? []}
                />
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
                  <OrderCard key={o.id} o={o} stage={null} items={itemsByOrderId[o.id] ?? []} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      ) : null}

      {showFeedback ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
            onClick={closeFeedback}
          />
          <div
            className="relative w-full max-w-xl rounded-2xl border border-white/10 bg-gradient-to-br from-bg-900/95 via-bg-900/95 to-bg-800/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-x-8 -top-1 h-1 rounded-full bg-gradient-to-r from-accent-500/80 via-amber-400/80 to-sky-400/80" />
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold">Quick feedback</div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                    1 min
                  </span>
                </div>
                <div className="text-xs text-white/60">
                  Thanks for your order{promptOrderId ? ` #${promptOrderId}` : ""}. How
                  was checkout?
                </div>
              </div>
              <button
                type="button"
                onClick={closeFeedback}
                className="rounded-full border border-white/10 bg-bg-900/40 p-1 text-white/70 transition hover:border-white/30 hover:text-white"
                aria-label="Close feedback"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-bg-900/40 p-3">
              <div className="text-xs text-white/70">Rate your experience</div>
              <div className="mt-2 flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => {
                  const active = rating >= value;
                  return (
                    <button
                      key={`rating-${value}`}
                      type="button"
                      onClick={() => {
                        setRating(value);
                        setFeedbackError(null);
                      }}
                      aria-label={`Rate ${value} star${value === 1 ? "" : "s"}`}
                      className="rounded-full border border-white/10 bg-bg-900/50 p-2 text-white/60 transition hover:border-white/30 hover:text-white"
                    >
                      <Star
                        className={active ? "h-5 w-5 text-amber-300" : "h-5 w-5"}
                        fill={active ? "currentColor" : "none"}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <Textarea
                label="How was your experience and what should we improve?"
                rows={4}
                value={[feedbackExperience, feedbackChange].filter(Boolean).join("\n")}
                onChange={(e) => {
                  const next = e.target.value;
                  setFeedbackExperience(next);
                  setFeedbackChange("");
                  setFeedbackError(null);
                }}
                className="min-h-[140px] text-sm bg-bg-800/40 border-white/10"
              />
            </div>

            {feedbackError ? (
              <div className="mt-2 text-xs text-red-200">{feedbackError}</div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Checkbox
                checked={feedbackNeverShow}
                onChange={setFeedbackNeverShow}
                label="Don't ask again"
                className="text-[11px] text-white/60 [&>span]:text-[11px] [&>span]:text-white/60 [&>input]:h-3 [&>input]:w-3"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={onSubmitFeedback}
                  className="h-9 px-4 text-xs shadow-glow"
                >
                  Send feedback
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={closeFeedback}
                  className="h-9 px-4 text-xs"
                >
                  Later
                </Button>
              </div>
            </div>
          </div>
        </div>
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
