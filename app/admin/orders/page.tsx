"use client";

import * as React from "react";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ClipboardCopy,
  Clock,
  Receipt,
  Truck,
  User,
  Wallet,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase/browser";
import { useAllOrders } from "@/hooks/useAllOrders";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatConditionLabel } from "@/lib/conditions";
import { Input } from "@/components/ui/Input";
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

function msLeft(deadline: string | null) {
  if (!deadline) return null;
  const t = new Date(deadline).getTime() - Date.now();
  return Math.max(0, t);
}
function fmtCountdown(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}h ${m}m ${ss}s`;
}

function cleanAddress(raw: any) {
  if (!raw) return "";
  const parsed = parseJsonMaybe(raw);
  if (parsed && typeof parsed === "object") {
    const candidate =
      parsed.full_address ||
      parsed.address ||
      parsed.dropoff_address ||
      parsed.location ||
      parsed.branch ||
      "";
    return String(candidate ?? "").trim();
  }
  return String(raw).trim();
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
  const v = it?.price_each ?? it?.unit_price ?? it?.product_variant?.price;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

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

const PAYMENT_META: Record<
  string,
  { label: string; badgeClass: string; icon: React.ElementType }
> = {
  PAID: {
    label: "Paid",
    badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
    icon: CheckCircle2,
  },
  UNPAID: {
    label: "Unpaid",
    badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-200",
    icon: Clock,
  },
  PENDING: {
    label: "Pending",
    badgeClass: "border-sky-500/40 bg-sky-500/15 text-sky-200",
    icon: Receipt,
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

function getPaymentMeta(status: string) {
  return (
    PAYMENT_META[status] ?? {
      label: status,
      badgeClass: "border-white/20 bg-white/5 text-white/70",
      icon: Receipt,
    }
  );
}

export default function AdminOrdersPage() {
  const { orders, itemsByOrderId, loading, reload } = useAllOrders();
  const [voidReason, setVoidReason] = React.useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

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

  const pendingApproval = orders.filter((o) => o.status === "PENDING_APPROVAL");
  const paymentSubmitted = orders.filter((o) => o.status === "PAYMENT_SUBMITTED");
  const awaitingPayment = orders.filter((o) => o.status === "AWAITING_PAYMENT");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Orders / Approvals</div>
            <div className="text-sm text-white/60">
              Approve orders (reserve stock + start timer), approve receipts, void if needed. Includes POS + WEB.
            </div>
          </div>
          <Badge>{orders.length}</Badge>
        </CardHeader>

        <CardBody className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
              <div className="flex items-center justify-between text-sm text-white/60">
                <span>Pending approval</span>
                <Clock className="h-4 w-4 text-amber-300/80" />
              </div>
              <div className="text-2xl font-semibold text-amber-200">{pendingApproval.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
              <div className="flex items-center justify-between text-sm text-white/60">
                <span>Receipt submitted</span>
                <Receipt className="h-4 w-4 text-sky-300/80" />
              </div>
              <div className="text-2xl font-semibold text-sky-200">{paymentSubmitted.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
              <div className="flex items-center justify-between text-sm text-white/60">
                <span>Awaiting payment</span>
                <Wallet className="h-4 w-4 text-indigo-300/80" />
              </div>
              <div className="text-2xl font-semibold text-indigo-200">{awaitingPayment.length}</div>
            </div>
          </div>

          {loading ? (
            <div className="text-white/60">Loading...</div>
          ) : orders.length === 0 ? (
            <div className="text-white/60">No orders.</div>
          ) : (
            <div className="space-y-3">
              {orders.map((o: any) => {
                const details = parseJsonMaybe(o.shipping_details) ?? {};
                const method = String(details.method ?? o.shipping_method ?? "").toUpperCase();
                const isCop = method === "LBC" && Boolean(details.cop);
                const createdAt = new Date(o.created_at).toLocaleString("en-PH");
                const statusMeta = getStatusMeta(o.status ?? "");
                const paymentMeta = getPaymentMeta(o.payment_status ?? "");
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
                const branch = [details.branch_name || details.branch, details.branch_city]
                  .filter(Boolean)
                  .join(", ");
                const address = cleanAddress(
                  details.full_address ?? details.dropoff_address ?? o.address ?? details.address
                );
                const shippingSummary = branch || address || "-";

                const deadline = o.payment_deadline ?? o.reserved_expires_at ?? null;
                const left = msLeft(deadline);
                const showTimer = o.status === "AWAITING_PAYMENT" && !o.payment_hold && left !== null;

                const items = itemsByOrderId[o.id] ?? [];

                return (
                  <div
                    key={o.id}
                    className={`rounded-2xl border border-white/10 bg-bg-900/30 p-4 border-l-4 ${statusMeta.borderClass}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-lg font-semibold">
                          Order #{String(o.id).slice(0, 8)}
                        </div>
                        <div className="text-xs text-white/60">{createdAt}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-white/50">Total</div>
                        <div className="text-lg font-semibold">{peso(Number(o.total ?? 0))}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Badge className={`gap-1 ${statusMeta.badgeClass}`}>
                        <statusMeta.icon className="h-3.5 w-3.5" />
                        {statusMeta.label}
                      </Badge>
                      <Badge className={`gap-1 ${paymentMeta.badgeClass}`}>
                        <paymentMeta.icon className="h-3.5 w-3.5" />
                        Payment: {paymentMeta.label}
                      </Badge>
                      <Badge className="gap-1">
                        Channel: {o.channel}
                      </Badge>
                      <Badge className="gap-1">
                        <Truck className="h-3.5 w-3.5" />
                        {o.shipping_method}
                      </Badge>
                      {isCop ? (
                        <Badge className="border-yellow-500/40 text-yellow-200">COP</Badge>
                      ) : null}
                    </div>

                    {showTimer ? (
                      <div className="mt-2 flex items-center gap-2 text-sm text-yellow-200">
                        <Clock className="h-4 w-4" />
                        Payment window: {fmtCountdown(left!)}
                      </div>
                    ) : null}
                    {o.payment_hold ? (
                      <div className="mt-2 text-sm text-yellow-200">Payment window: ON HOLD</div>
                    ) : null}

                    <details
                      className="mt-4 rounded-xl border border-white/10 bg-bg-900/20"
                      open={o.status === "PENDING_APPROVAL" || o.status === "PAYMENT_SUBMITTED"}
                    >
                      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-semibold">
                        <span className="flex items-center gap-2 text-white/80">
                          <User className="h-4 w-4" />
                          Order details
                        </span>
                        <ChevronDown className="h-4 w-4 text-white/60" />
                      </summary>
                      <div className="border-t border-white/10 p-3">
                        <div className="grid gap-3 lg:grid-cols-[1.2fr_1.2fr_0.8fr]">
                          <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                            <div className="text-xs uppercase tracking-wide text-white/50">Customer</div>
                            <div className="mt-1 font-medium">{customerName}</div>
                            {customerPhone ? (
                              <div className="text-sm text-white/70">{customerPhone}</div>
                            ) : null}
                          </div>
                          <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                            <div className="text-xs uppercase tracking-wide text-white/50">Shipping</div>
                            <div className="mt-1 text-sm text-white/80">
                              Method: <span className="text-white">{o.shipping_method}</span>
                            </div>
                            <div className="mt-1 text-sm text-white/70">{shippingSummary}</div>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                            <div className="text-xs uppercase tracking-wide text-white/50">Totals</div>
                            <div className="mt-1 text-sm text-white/80">
                              Subtotal: <span className="text-white">{peso(Number(o.subtotal ?? 0))}</span>
                            </div>
                            <div className="text-sm text-white/80">
                              Shipping: <span className="text-white">{peso(Number(o.shipping_fee ?? 0))}</span>
                            </div>
                            <div className="mt-1 font-semibold">Total: {peso(Number(o.total ?? 0))}</div>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-paper/5 p-3">
                          <Button variant="secondary" onClick={() => onCopy(o)}>
                            <ClipboardCopy className="mr-2 h-4 w-4" />
                            {copiedId === o.id ? "Copied!" : "Copy details"}
                          </Button>
                          <div className="text-xs text-white/50">
                            Copies: J&amp;T/Lalamove = Name + Contact + Address | LBC = First + Last + Contact + Branch
                          </div>
                        </div>
                      </div>
                    </details>

                    <details
                      className="mt-3 rounded-xl border border-white/10 bg-bg-900/20"
                      open={o.status === "PENDING_APPROVAL" || o.status === "PAYMENT_SUBMITTED"}
                    >
                      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-semibold">
                        <span className="flex items-center gap-2 text-white/80">
                          <ClipboardCheck className="h-4 w-4" />
                          Items ({items.length})
                        </span>
                        <ChevronDown className="h-4 w-4 text-white/60" />
                      </summary>
                      <div className="border-t border-white/10 p-3">
                        {items.length === 0 ? (
                          <div className="text-sm text-white/60">No items found for this order.</div>
                        ) : (
                          <div className="space-y-2">
                            {items.map((it: any, idx: number) => {
                              const thumb = getItemThumb(it);
                              const title = getItemTitle(it);
                              const condition = formatConditionLabel(
                                it?.condition ?? it?.product_variant?.condition,
                                { upper: true }
                              );
                              const notes = String(it?.issue_notes ?? it?.product_variant?.issue_notes ?? "").trim();
                              const price = getItemPrice(it);
                              const qty = Number(it?.qty ?? 1);
                              const line = Number(it?.line_total ?? price * qty);
                              const barcode = it?.product_variant?.barcode ? String(it.product_variant.barcode) : "";

                              return (
                                <div key={`${o.id}-${idx}`} className="rounded-xl border border-white/10 bg-paper/5 p-3">
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
                                          <div className="font-medium truncate">{title}</div>
                                          <div className="text-xs text-white/60">
                                            {condition ? `${condition} ` : ""}x{qty}
                                            {price ? ` @ ${peso(price)}` : ""}
                                            {barcode ? ` | Barcode: ${barcode}` : ""}
                                          </div>
                                        </div>
                                        <div className="text-sm text-white/80">{peso(line)}</div>
                                      </div>
                                      {notes ? (
                                        <div className="mt-1 text-xs text-yellow-200">Notes: {notes}</div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </details>

                    {/* Actions */}
                    <div className="mt-4 flex flex-wrap gap-2">
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
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

