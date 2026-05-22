"use client";

import * as React from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  ClipboardCopy,
  Clock,
  Receipt,
  ScrollText,
  Wallet,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/browser";
import { useAllOrders } from "@/hooks/useAllOrders";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { ModalShell as OrderDetailsModal } from "@/components/ui/ModalShell";
import { SectionBlock } from "@/components/ui/SectionBlock";
import { DetailGrid } from "@/components/ui/DetailGrid";
import { StatCard } from "@/components/ui/StatCard";
import { toast } from "@/components/ui/toast";

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

function peso(n: number) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `₱${Math.round(n)}`;
  }
}

function normalizePhoneToPlus10(raw: string | null | undefined) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("0") && digits.length === 11) return `+${digits.slice(1)}`;
  if (digits.startsWith("63") && digits.length >= 12) return `+${digits.slice(2)}`;
  if (digits.length === 10) return `+${digits}`;

  return `+${digits.replace(/^0+/, "")}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function msLeft(deadline: string | null, now: number) {
  if (!deadline) return null;
  const t = new Date(deadline).getTime() - now;
  return Math.max(0, t);
}
function fmtCountdown(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}h ${m}m ${ss}s`;
}

function buildCopyPayload(o: any) {
  const details = parseJsonMaybe(o.shipping_details) ?? {};
  const method = String(details.method ?? o.shipping_method ?? "").toUpperCase();

  const phone = normalizePhoneToPlus10(
    details.receiver_phone ??
      details.customer_phone ??
      o.customer_phone ??
      details.phone ??
      o.contact ??
      o.customer_phone
  );

  if (method === "LBC") {
    const first = String(details.first_name ?? "").trim();
    const last = String(details.last_name ?? "").trim();
    const branchName = String(details.branch_name ?? details.branch ?? "").trim();
    const branchCity = String(details.branch_city ?? "").trim();
    const branch = [branchName, branchCity].filter(Boolean).join(", ");
    return [first, last, phone, branch].filter(Boolean).join("\n");
  }

  const name = String(details.receiver_name ?? o.customer_name ?? "").trim();
  const addr =
    method === "LALAMOVE"
      ? String(details.dropoff_address ?? o.address ?? "").trim()
      : String(details.full_address ?? o.address ?? "").trim();

  return [name, phone, addr].filter(Boolean).join("\n");
}

function getAddressOrBranch(method: string, details: any, order: any) {
  const normalized = String(method ?? "").toUpperCase();

  if (normalized === "LBC") {
    const branchName = String(details?.branch_name ?? details?.branch ?? "").trim();
    const branchCity = String(details?.branch_city ?? "").trim();
    const branch = [branchName, branchCity].filter(Boolean).join(", ");
    if (branch) return branch;
  }

  if (normalized === "LALAMOVE") {
    const dropoff = String(details?.dropoff_address ?? order?.address ?? "").trim();
    if (dropoff) return dropoff;
  }

  const addr = String(
    details?.full_address ?? details?.address ?? order?.address ?? ""
  ).trim();
  return addr;
}

function getRecordedAddressValue(method: string, order: any) {
  const rawAddress = order?.address;
  const parsedAddress = parseJsonMaybe(rawAddress);

  if (parsedAddress) {
    const normalizedMethod = String(
      method ?? parsedAddress.method ?? parsedAddress.shipping_method ?? ""
    ).toUpperCase();
    const resolved = getAddressOrBranch(normalizedMethod, parsedAddress, {
      ...order,
      address:
        parsedAddress.full_address ??
        parsedAddress.address ??
        parsedAddress.dropoff_address ??
        parsedAddress.branch_name ??
        rawAddress,
    });

    if (resolved) return resolved;
  }

  return String(rawAddress ?? "-");
}

function getItemThumb(it: any): string | null {
  const urls = it?.product_variant?.product?.image_urls;
  if (Array.isArray(urls) && urls.length) return String(urls[0]);
  return null;
}

function getItemTitle(it: any): string {
  return (
    it?.item_name ||
    it?.product_title ||
    it?.product_variant?.product?.title ||
    "Item"
  );
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

function formatShippingContainer(method: string, details: any) {
  const raw = details?.package ?? details?.pack ?? details?.container ?? null;
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const normalized = value.toUpperCase();

  if (method === "JNT") {
    if (normalized === "SMALL") return "J&T Small pouch";
    if (normalized === "MEDIUM") return "J&T Medium pouch";
  }

  if (method === "LBC") {
    if (normalized === "N_SAKTO") return "LBC N-Sakto";
    if (normalized === "MINIBOX") return "LBC Minibox";
    if (normalized === "SMALL_BOX") return "LBC Small Box";
    if (normalized === "MEDIUM_APPROVAL") return "LBC Medium Box (approval)";
  }

  return normalized.replace(/_/g, " ");
}

const APPROVED_RECEIPTS_FILTER = "APPROVED_RECEIPTS";

const STATUS_META: Record<
  string,
  {
    label: string;
    badgeClass: string;
    borderClass: string;
    icon: React.ElementType;
  }
> = {
  PENDING_APPROVAL: {
    label: "Pending approval",
    badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-200",
    borderClass: "border-l-amber-500/60",
    icon: Clock,
  },
  PAYMENT_SUBMITTED: {
    label: "Receipt submitted",
    badgeClass: "border-sky-500/40 bg-sky-500/15 text-sky-200",
    borderClass: "border-l-sky-500/60",
    icon: Receipt,
  },
  AWAITING_PAYMENT: {
    label: "Awaiting payment",
    badgeClass: "border-indigo-500/40 bg-indigo-500/15 text-indigo-200",
    borderClass: "border-l-indigo-500/60",
    icon: Wallet,
  },
  PAID: {
    label: "Paid",
    badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
    borderClass: "border-emerald-500/60",
    icon: CheckCircle2,
  },
  COMPLETED: {
    label: "Completed",
    badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
    borderClass: "border-emerald-500/60",
    icon: CheckCircle2,
  },
  CANCELLED: {
    label: "Cancelled",
    badgeClass: "border-red-500/40 bg-red-500/15 text-red-200",
    borderClass: "border-red-500/60",
    icon: XCircle,
  },
  VOIDED: {
    label: "Voided",
    badgeClass: "border-red-500/40 bg-red-500/15 text-red-200",
    borderClass: "border-red-500/60",
    icon: XCircle,
  },
};

function getStatusMeta(status: string) {
  return (
    STATUS_META[status] ?? {
      label: status,
      badgeClass: "border-white/20 bg-white/5 text-white/70",
      borderClass: "border-l-white/20",
      icon: Clock,
    }
  );
}

export default function AdminOrdersPage() {
  const { orders, itemsByOrderId, loading, reload } = useAllOrders();
  const [voidReason, setVoidReason] = React.useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [detailOrderId, setDetailOrderId] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string | null>(
    "PENDING_APPROVAL"
  );
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function approveOrder(orderId: string) {
    const { error } = await supabase.rpc("fn_staff_approve_order", {
      p_order_id: orderId,
    });
    if (error) alert(error.message);
    await reload();
    toast({
      message: "Order approved. Any sold-out pending orders were auto-cancelled.",
      intent: "success",
      duration: 2400,
    });
  }

  async function approvePayment(orderId: string, ok: boolean) {
    const { error } = await supabase.rpc("fn_staff_review_payment", {
      p_order_id: orderId,
      p_approve: ok,
      p_note: ok ? null : "Payment rejected",
    });
    if (error) alert(error.message);
    await reload();
  }

  async function voidOrder(orderId: string) {
    const reason = (voidReason[orderId] ?? "").trim() || "Voided by admin";
    const { error } = await supabase.rpc("fn_staff_void_order", {
      p_order_id: orderId,
      p_reason: reason,
    });
    if (error) alert(error.message);
    await reload();
  }

  async function onCopy(o: any) {
    const payload = buildCopyPayload(o);
    const ok = await copyText(payload);
    if (!ok) return alert("Copy failed. Your browser blocked clipboard access.");

    setCopiedId(o.id);
    window.setTimeout(() => setCopiedId((cur) => (cur === o.id ? null : cur)), 1200);
  }

  async function onCopyPhone(phone: string) {
    const value = String(phone ?? "").trim();
    if (!value) return;

    const ok = await copyText(value);
    if (!ok) {
      toast({ intent: "error", message: "Copy failed. Your browser blocked clipboard access." });
      return;
    }

    toast({ intent: "success", message: "Phone copied." });
  }

  const pendingApproval = orders.filter((o) => o.status === "PENDING_APPROVAL");
  const paymentSubmitted = orders.filter((o) => o.status === "PAYMENT_SUBMITTED");
  const awaitingPayment = orders.filter((o) => o.status === "AWAITING_PAYMENT");
  const approvedReceipts = orders.filter((o) => {
    const paymentStatus = String(o.payment_status ?? "").toUpperCase();
    return paymentStatus === "PAID" && Boolean(String(o.receipt_url ?? "").trim());
  });
  const voidedOrders = orders.filter((o) => o.status === "VOIDED");
  const visibleOrders = React.useMemo(() => {
    if (!statusFilter) return orders;
    if (statusFilter === APPROVED_RECEIPTS_FILTER) {
      return orders.filter((o) => {
        const paymentStatus = String(o.payment_status ?? "").toUpperCase();
        return paymentStatus === "PAID" && Boolean(String(o.receipt_url ?? "").trim());
      });
    }
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const summaryCards = [
    {
      status: "PENDING_APPROVAL",
      count: pendingApproval.length,
      countClass: "text-amber-200",
    },
    {
      status: "PAYMENT_SUBMITTED",
      count: paymentSubmitted.length,
      countClass: "text-sky-200",
    },
    {
      status: "AWAITING_PAYMENT",
      count: awaitingPayment.length,
      countClass: "text-indigo-200",
    },
    {
      status: APPROVED_RECEIPTS_FILTER,
      count: approvedReceipts.length,
      countClass: "text-emerald-200",
    },
  ];


  const selectedOrder =
    detailOrderId ? orders.find((order) => String(order.id) === detailOrderId) : null;

  function renderOrderDetails(o: any) {
    const details = parseJsonMaybe(o.shipping_details) ?? {};
    const createdAt = new Date(o.created_at).toLocaleString("en-PH");
    const statusMeta = getStatusMeta(o.status ?? "");
    const shippingMethod = String(
      o.shipping_method ?? details.method ?? "-"
    ).toUpperCase();
    const shippingContainer = formatShippingContainer(shippingMethod, details);
    const customerName =
      details.receiver_name ||
      [details.first_name, details.last_name].filter(Boolean).join(" ") ||
      o.customer_name ||
      "Guest";
    const customerPhone =
      details.receiver_phone ||
      details.phone ||
      o.contact ||
      o.customer_phone ||
      "";
    const customerAddress = getAddressOrBranch(shippingMethod, details, o);
    const deadline = o.payment_deadline ?? o.reserved_expires_at ?? null;
    const left = msLeft(deadline, now);
    const showTimer =
      o.status === "AWAITING_PAYMENT" && !o.payment_hold && left !== null;

    const items = itemsByOrderId[o.id] ?? [];

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-lg font-semibold">Order #{String(o.id).slice(0, 8)}</div>
            <div className="text-xs text-white/60">{createdAt}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-white/50">Status</div>
            <div className="text-sm text-white/80">{statusMeta.label}</div>
          </div>
        </div>

        {showTimer ? (
          <div className="flex items-center gap-2 text-sm text-yellow-200">
            <Clock className="h-4 w-4" />
            Payment window: {fmtCountdown(left!)}
          </div>
        ) : null}
        {o.payment_hold ? (
          <div className="text-sm text-yellow-200">Payment window: ON HOLD</div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
            <div className="text-base font-medium">{customerName || "—"}</div>
            {customerPhone ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-white/70">{customerPhone}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 px-0"
                  title="Copy phone number"
                  aria-label="Copy phone number"
                  onClick={() => onCopyPhone(customerPhone)}
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="mt-1 text-sm text-white/70">—</div>
            )}
            {customerAddress ? (
              <div className="mt-2 text-sm text-white/70">{customerAddress}</div>
            ) : null}
          </div>
          <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
            <div className="text-lg font-semibold">{peso(Number(o.total ?? 0))}</div>
            <div className="mt-1 text-sm text-white/80">
              {shippingMethod || "—"}
            </div>
            <div className="mt-1 text-sm text-white/80">
              {shippingContainer || "—"}
            </div>
          </div>
        </div>

        {o.receipt_url ? (
          <div>
            <div className="text-sm font-semibold">Receipt</div>
            <div className="mt-2 rounded-xl border border-white/10 bg-paper/5 p-3">
              <a href={o.receipt_url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={o.receipt_url}
                  alt="Receipt"
                  className="w-full max-h-80 object-contain rounded-lg bg-neutral-50"
                />
              </a>
              <div className="mt-2 text-xs text-white/50">Click image to enlarge.</div>
            </div>
          </div>
        ) : null}

        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
            <ClipboardCheck className="h-4 w-4" />
            Items ({items.length})
          </div>
          <div className="mt-2">
            {items.length === 0 ? (
              <div className="text-sm text-white/60">No items found for this order.</div>
            ) : (
              <div className="space-y-2">
                {items.map((it: any, idx: number) => {
                  const thumb = getItemThumb(it);
                  const title = getItemTitle(it);
                  const price = getItemPrice(it);
                  const qty = Math.max(1, Number(it?.qty ?? 1));
                  const rawLine = Number(it?.line_total);
                  const line =
                    Number.isFinite(rawLine) && rawLine > 0 ? rawLine : price * qty;

                  return (
                    <div
                      key={`${o.id}-${idx}`}
                      className="rounded-xl border border-white/10 bg-paper/5 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-14 rounded-lg bg-bg-800 border border-white/10 overflow-hidden flex-shrink-0">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt={title} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {title}
                                {qty > 1 ? ` x${qty}` : ""}
                              </div>
                            </div>
                            <div className="text-sm text-white/80">{peso(line)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {o.payment_status === "PAID" ? (
          <div>
            <Button variant="secondary" onClick={() => onCopy(o)}>
              <ClipboardCopy className="mr-2 h-4 w-4" />
              {copiedId === o.id ? "Copied!" : "Copy details"}
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {o.status === "PENDING_APPROVAL" ? (
            <Button variant="secondary" onClick={() => approveOrder(o.id)}>
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Approve order (reserve)
            </Button>
          ) : null}

          {o.status === "PAYMENT_SUBMITTED" ? (
            <>
              <Button variant="secondary" onClick={() => approvePayment(o.id, true)}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve payment
              </Button>
              <Button variant="ghost" onClick={() => approvePayment(o.id, false)}>
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </>
          ) : null}

          {o.status !== "VOIDED" && o.status !== "CANCELLED" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Void reason (optional)"
                value={voidReason[o.id] ?? ""}
                className="w-full sm:w-72"
                onChange={(e) =>
                  setVoidReason((m) => ({
                    ...m,
                    [o.id]: e.target.value,
                  }))
                }
              />
              <Button variant="ghost" onClick={() => voidOrder(o.id)}>
                Void
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderOrderDetailsRefined(o: any) {
    const details = parseJsonMaybe(o.shipping_details) ?? {};
    const createdAt = new Date(o.created_at).toLocaleString("en-PH");
    const statusMeta = getStatusMeta(o.status ?? "");
    const shippingMethod = String(o.shipping_method ?? details.method ?? "-").toUpperCase();
    const shippingContainer = formatShippingContainer(shippingMethod, details);
    const customerName =
      details.receiver_name ||
      [details.first_name, details.last_name].filter(Boolean).join(" ") ||
      o.customer_name ||
      "Guest";
    const customerPhone =
      details.receiver_phone ||
      details.phone ||
      o.contact ||
      o.customer_phone ||
      "";
    const customerAddress = getAddressOrBranch(shippingMethod, details, o);
    const recordedAddress = getRecordedAddressValue(shippingMethod, o);
    const deadline = o.payment_deadline ?? o.reserved_expires_at ?? null;
    const left = msLeft(deadline, now);
    const showTimer = o.status === "AWAITING_PAYMENT" && !o.payment_hold && left !== null;
    const items = itemsByOrderId[o.id] ?? [];
    const receiptUrl = String(o.receipt_url ?? "").trim();
    const lineDiscount = Math.max(
      0,
      Number(o.discount_total ?? 0) - Number(o.shipping_discount ?? 0)
    );

    return (
      <div className="space-y-5">
        <SectionBlock>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[0.72rem] font-medium uppercase tracking-[0.13em] text-white/48">
                Order
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-white">
                #{String(o.id).slice(0, 8)}
              </div>
              <div className="mt-1 text-sm text-white/56">{createdAt}</div>
            </div>
            <div className="text-right">
              <div className="text-[0.72rem] font-medium uppercase tracking-[0.13em] text-white/48">
                Total
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-white">
                {peso(Number(o.total ?? 0))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge className={statusMeta.badgeClass}>{statusMeta.label}</Badge>
            <Badge>Payment {String(o.payment_status ?? "-")}</Badge>
            <Badge>{shippingMethod || "No shipping method"}</Badge>
            <Badge>Channel {String(o.channel ?? "-")}</Badge>
          </div>
          {showTimer ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-yellow-200">
              <Clock className="h-4 w-4" />
              Payment window remaining: {fmtCountdown(left!)}
            </div>
          ) : null}
          {o.payment_hold ? (
            <div className="mt-4 text-sm text-yellow-200">Payment window is currently on hold.</div>
          ) : null}
        </SectionBlock>

        <SectionBlock
          title="Customer & delivery"
          description="Customer and shipping information formatted for quick review."
        >
          <DetailGrid
            items={[
              { label: "Customer", value: customerName || "-" },
              { label: "Recorded customer", value: String(o.customer_name ?? "-") },
              {
                label: "Phone",
                value: customerPhone || "-",
                hint: customerPhone ? "Copy the phone number below when needed." : undefined,
              },
              { label: "Recorded contact", value: String(o.contact ?? "-") },
              { label: "Address / branch", value: customerAddress || "-" },
              { label: "Recorded address", value: recordedAddress || "-" },
              { label: "Shipping method", value: shippingMethod || "-" },
              { label: "Packaging", value: shippingContainer || "-" },
              { label: "Payment method", value: String(o.payment_method ?? "-") },
            ]}
          />
          {customerPhone ? (
            <div className="mt-3">
              <Button variant="ghost" size="sm" onClick={() => onCopyPhone(customerPhone)}>
                <ClipboardCopy className="h-3.5 w-3.5" />
                Copy phone
              </Button>
            </div>
          ) : null}
        </SectionBlock>

        <SectionBlock title="Operational snapshot">
          <DetailGrid
            items={[
              { label: "Full order ID", value: String(o.id ?? "-") },
              { label: "Order status", value: statusMeta.label },
              { label: "Payment status", value: String(o.payment_status ?? "-") },
              { label: "Shipping status", value: String(o.shipping_status ?? "-") },
              { label: "Tracking number", value: String(o.tracking_number ?? "-") },
              { label: "Courier", value: String(o.courier ?? "-") },
              { label: "Channel", value: String(o.channel ?? "-") },
              {
                label: "Payment deadline",
                value: deadline ? new Date(deadline).toLocaleString("en-PH") : "-",
                hint: showTimer ? `Live countdown: ${fmtCountdown(left!)}` : undefined,
              },
              {
                label: "Reserved until",
                value: o.reserved_expires_at
                  ? new Date(o.reserved_expires_at).toLocaleString("en-PH")
                  : "-",
              },
              {
                label: "Shipped at",
                value: o.shipped_at ? new Date(o.shipped_at).toLocaleString("en-PH") : "-",
              },
              {
                label: "Completed at",
                value: o.completed_at
                  ? new Date(o.completed_at).toLocaleString("en-PH")
                  : "-",
              },
              {
                label: "Receipt status",
                value: o.receipt_url ? "Receipt uploaded" : "No receipt uploaded",
              },
            ]}
          />
        </SectionBlock>

        <SectionBlock title="Financials">
          <DetailGrid
            items={[
              { label: "Subtotal", value: peso(Number(o.subtotal ?? 0)) },
              { label: "Shipping fee", value: peso(Number(o.shipping_fee ?? 0)) },
              { label: "Priority fee", value: peso(Number(o.priority_fee ?? 0)) },
              { label: "Rush fee", value: peso(Number(o.rush_fee ?? 0)) },
              { label: "Item discount", value: peso(lineDiscount) },
              { label: "Total", value: peso(Number(o.total ?? 0)) },
            ]}
          />
        </SectionBlock>

        {receiptUrl ? (
          <SectionBlock title="Receipt" description="Open the uploaded receipt in full size.">
            <div className="mb-3 break-all text-xs text-white/50">{receiptUrl}</div>
            <a href={receiptUrl} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptUrl}
                alt="Receipt"
                className="max-h-80 w-full rounded-2xl border border-white/10 bg-neutral-50 object-contain"
              />
            </a>
          </SectionBlock>
        ) : null}

        <SectionBlock
          title={`Items (${items.length})`}
          description="Purchased lines with quantity and value snapshot."
        >
          {items.length === 0 ? (
            <div className="text-sm text-white/60">No items found for this order.</div>
          ) : (
            <div className="space-y-2.5">
              {items.map((it: any, idx: number) => {
                const thumb = getItemThumb(it);
                const title = getItemTitle(it);
                const price = getItemPrice(it);
                const qty = Math.max(1, Number(it?.qty ?? 1));
                const rawLine = Number(it?.line_total);
                const line = Number.isFinite(rawLine) && rawLine > 0 ? rawLine : price * qty;

                return (
                  <div
                    key={`${o.id}-${idx}`}
                    className="surface-subtle flex items-center gap-3 p-3 sm:p-3.5"
                  >
                    <div className="h-14 w-14 overflow-hidden rounded-xl border border-white/10 bg-bg-800 flex-shrink-0">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt={title} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-white">{title}</div>
                          <div className="mt-1 text-sm text-white/58">
                            {qty} x {peso(price)}
                          </div>
                        </div>
                        <div className="text-sm font-medium text-white/88">{peso(line)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionBlock>

        <SectionBlock title="Actions" description="Primary operational actions for this order.">
          <div className="flex flex-wrap gap-2.5">
            {o.payment_status === "PAID" ? (
              <Button variant="secondary" onClick={() => onCopy(o)}>
                <ClipboardCopy className="h-4 w-4" />
                {copiedId === o.id ? "Copied!" : "Copy details"}
              </Button>
            ) : null}

            {o.status === "PENDING_APPROVAL" ? (
              <Button variant="secondary" onClick={() => approveOrder(o.id)}>
                <ClipboardCheck className="h-4 w-4" />
                Approve order
              </Button>
            ) : null}

            {o.status === "PAYMENT_SUBMITTED" ? (
              <>
                <Button variant="secondary" onClick={() => approvePayment(o.id, true)}>
                  <CheckCircle2 className="h-4 w-4" />
                  Approve payment
                </Button>
                <Button variant="ghost" onClick={() => approvePayment(o.id, false)}>
                  <XCircle className="h-4 w-4" />
                  Reject payment
                </Button>
              </>
            ) : null}
          </div>

          {o.status !== "VOIDED" && o.status !== "CANCELLED" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Input
                label="Void reason"
                placeholder="Optional note for the audit trail"
                value={voidReason[o.id] ?? ""}
                onChange={(e) =>
                  setVoidReason((m) => ({
                    ...m,
                    [o.id]: e.target.value,
                  }))
                }
              />
              <Button variant="ghost" onClick={() => voidOrder(o.id)}>
                Void order
              </Button>
            </div>
          ) : null}
        </SectionBlock>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Orders / Approvals</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge>{orders.length}</Badge>
            <Link
              href="/admin/orders/logs"
              className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 px-3 text-sm text-white hover:bg-paper/5"
              aria-label={`Order logs (${voidedOrders.length} voided)`}
            >
              <ScrollText className="h-4 w-4" />
              <span className="ml-1 text-xs text-white/70">{voidedOrders.length}</span>
            </Link>
          </div>
        </CardHeader>

        <CardBody className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => {
              const meta =
                card.status === APPROVED_RECEIPTS_FILTER
                  ? {
                      label: "Approved receipts",
                      icon: ClipboardCheck,
                    }
                  : getStatusMeta(card.status);
              const Icon = meta.icon;
              const active = statusFilter === card.status;
              return (
                <StatCard
                  key={card.status}
                  onClick={() =>
                    setStatusFilter((prev) => (prev === card.status ? null : card.status))
                  }
                  label={meta.label}
                  value={card.count}
                  icon={Icon}
                  active={active}
                  aria-pressed={active}
                  valueClassName={card.countClass}
                  hint={
                    active
                      ? "Showing this queue"
                      : card.status === APPROVED_RECEIPTS_FILTER
                        ? "Tap to review paid receipts"
                        : "Tap to filter"
                  }
                />
              );
            })}
          </div>

          {loading ? (
            <div className="text-white/60">Loading...</div>
          ) : visibleOrders.length === 0 ? (
            <div className="text-white/60">No orders.</div>
          ) : (
            <div className="space-y-3">

              {visibleOrders.map((o: any) => {
                const details = parseJsonMaybe(o.shipping_details) ?? {};
                const shippingMethod = String(
                  o.shipping_method ?? details.method ?? "-"
                ).toUpperCase();
                const shippingContainer = formatShippingContainer(
                  shippingMethod,
                  details
                );
                const customerName =
                  details.receiver_name ||
                  [details.first_name, details.last_name].filter(Boolean).join(" ") ||
                  o.customer_name ||
                  "Guest";
                const customerPhone =
                  details.receiver_phone ||
                  details.phone ||
                  o.contact ||
                  o.customer_phone ||
                  "";
                const customerAddress = getAddressOrBranch(shippingMethod, details, o);
                const courierSummary = shippingContainer || shippingMethod;
                const receiptUrl = String(o.receipt_url ?? "").trim();
                const isApprovedReceipt =
                  String(o.payment_status ?? "").toUpperCase() === "PAID" && Boolean(receiptUrl);
                return (
                  <div
                    key={o.id}
                    className="rounded-2xl bg-bg-900/30 p-4"
                  >
                    <div className="mt-3 rounded-xl border border-white/10 bg-paper/5 p-2 sm:p-3">
                      <div className="grid gap-1 text-[10px] sm:text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 truncate text-[11px] font-medium sm:text-sm">
                            {customerName || "—"}
                          </div>
                          <div className="text-[11px] font-semibold sm:text-sm">
                            {peso(Number(o.total ?? 0))}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 truncate text-white/70">
                            {customerPhone || "—"}
                          </div>
                          <div className="min-w-0 truncate text-right text-white/80">
                            {courierSummary || "—"}
                          </div>
                        </div>
                        <div className="min-w-0 truncate text-white/70">
                          {customerAddress || "—"}
                        </div>
                        {isApprovedReceipt ? (
                          <div className="mt-1 flex items-center gap-2 text-emerald-200">
                            <Receipt className="h-3.5 w-3.5" />
                            <span>Approved receipt on file</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-nowrap items-center gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-10 w-10 p-0 text-white"
                          title={copiedId === o.id ? "Copied" : "Copy"}
                          aria-label={copiedId === o.id ? "Copied" : "Copy"}
                          onClick={() => onCopy(o)}
                        >
                          <ClipboardCopy className="h-6 w-6 text-white" />
                        </Button>
                        {o.status === "PAYMENT_SUBMITTED" ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-10 w-10 p-0 text-white"
                              title="Approve"
                              aria-label="Approve"
                              onClick={() => approvePayment(o.id, true)}
                            >
                              <CheckCircle2 className="h-6 w-6 text-white" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-10 w-10 p-0 text-white"
                              title="Reject"
                              aria-label="Reject"
                              onClick={() => approvePayment(o.id, false)}
                            >
                              <XCircle className="h-6 w-6 text-white" />
                            </Button>
                          </>
                        ) : null}
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-10 w-10 p-0 text-white"
                          title="Show details"
                          aria-label="Show details"
                          onClick={() => setDetailOrderId(String(o.id))}
                        >
                          <ScrollText className="h-6 w-6 text-white" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        <OrderDetailsModal
          open={Boolean(selectedOrder)}
          onClose={() => setDetailOrderId(null)}
          width="xl"
          title={
            selectedOrder
              ? `Order #${String(selectedOrder.id).slice(0, 8)} details`
              : "Order details"
          }
        >
          {selectedOrder ? renderOrderDetailsRefined(selectedOrder) : null}
        </OrderDetailsModal>
        </CardBody>
      </Card>
    </div>
  );
}

