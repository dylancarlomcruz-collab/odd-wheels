"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { useAllOrders } from "@/hooks/useAllOrders";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";

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
              <div className="text-sm text-white/60">Pending approval</div>
              <div className="text-2xl font-semibold">{pendingApproval.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
              <div className="text-sm text-white/60">Receipt submitted</div>
              <div className="text-2xl font-semibold">{paymentSubmitted.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
              <div className="text-sm text-white/60">Awaiting payment</div>
              <div className="text-2xl font-semibold">{awaitingPayment.length}</div>
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

                const deadline = o.payment_deadline ?? o.reserved_expires_at ?? null;
                const left = msLeft(deadline);
                const showTimer = o.status === "AWAITING_PAYMENT" && !o.payment_hold && left !== null;

                const items = itemsByOrderId[o.id] ?? [];

                return (
                  <div key={o.id} className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold">#{String(o.id).slice(0, 8)}</div>
                      <div className="text-sm text-white/60">{new Date(o.created_at).toLocaleString("en-PH")}</div>
                    </div>

                    <div className="mt-2 text-sm text-white/70">
                      Channel: <span className="text-white/90">{o.channel}</span> • Status: <span className="text-white/90">{o.status}</span> • Payment:{" "}
                      <span className="text-white/90">{o.payment_status}</span> • Shipping:{" "}
                      <span className="text-white/90">{o.shipping_method}</span>
                      {isCop ? <span className="ml-2 text-yellow-200">• COP (Pay at branch)</span> : null}
                    </div>

                    {showTimer ? (
                      <div className="mt-2 text-sm text-yellow-200">Payment window: {fmtCountdown(left!)}</div>
                    ) : null}
                    {o.payment_hold ? (
                      <div className="mt-2 text-sm text-yellow-200">Payment window: ON HOLD</div>
                    ) : null}

                    {/* Customer + totals */}
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                        <div className="text-xs text-white/60">Customer</div>
                        <div className="font-medium">{o.customer_name ?? "—"}</div>
                        <div className="text-sm text-white/70">
                          {(o.contact ?? o.customer_phone) ? <div>{o.contact ?? o.customer_phone}</div> : null}
                          {o.address ? <div className="mt-1">{o.address}</div> : null}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                        <div className="text-xs text-white/60">Totals</div>
                        <div className="mt-1 text-sm text-white/80">Subtotal: <span className="text-white">{peso(Number(o.subtotal ?? 0))}</span></div>
                        <div className="text-sm text-white/80">Shipping: <span className="text-white">{peso(Number(o.shipping_fee ?? 0))}</span></div>
                        <div className="mt-1 font-semibold">Total: {peso(Number(o.total ?? 0))}</div>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="mt-4">
                      <div className="text-sm font-semibold">Items</div>
                      {items.length === 0 ? (
                        <div className="text-sm text-white/60 mt-1">No items found for this order.</div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {items.map((it: any, idx: number) => {
                            const thumb = getItemThumb(it);
                            const title = getItemTitle(it);
                            const condition = String(it?.condition ?? it?.product_variant?.condition ?? "").toUpperCase();
                            const notes = String(it?.issue_notes ?? it?.product_variant?.issue_notes ?? "").trim();
                            const price = getItemPrice(it);
                            const qty = Number(it?.qty ?? 1);
                            const line = Number(it?.line_total ?? price * qty);
                            const barcode = it?.product_variant?.barcode ? String(it.product_variant.barcode) : "";

                            return (
                              <div key={`${o.id}-${idx}`} className="rounded-xl border border-white/10 bg-paper/5 p-3 flex gap-3">
                                <div className="h-14 w-14 rounded-lg bg-bg-800 border border-white/10 overflow-hidden flex-shrink-0">
                                  {thumb ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={thumb} alt={title} className="h-full w-full object-cover" />
                                  ) : null}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium truncate">{title}</div>
                                  <div className="text-xs text-white/60">
                                    {condition ? `${condition} • ` : ""}{qty} × {peso(price)} • Line: {peso(line)}
                                    {barcode ? ` • Barcode: ${barcode}` : ""}
                                  </div>
                                  {notes ? <div className="mt-1 text-xs text-yellow-200">Notes: {notes}</div> : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Customer preview + Copy */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button variant="secondary" onClick={() => onCopy(o)}>
                        {copiedId === o.id ? "Copied!" : "Copy details"}
                      </Button>
                      <div className="text-xs text-white/50">
                        Copies: J&amp;T/Lalamove = Name + Contact + Address • LBC = First + Last + Contact + Branch
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {o.status === "PENDING_APPROVAL" ? (
                        <Button variant="secondary" onClick={() => approveOrder(o.id)}>
                          Approve order (reserve)
                        </Button>
                      ) : null}

                      {o.status === "PAYMENT_SUBMITTED" ? (
                        <>
                          <Button variant="secondary" onClick={() => approvePayment(o.id, true)}>
                            Approve payment
                          </Button>
                          <Button variant="ghost" onClick={() => approvePayment(o.id, false)}>
                            Reject
                          </Button>
                        </>
                      ) : null}

                      {o.status !== "VOIDED" && o.status !== "CANCELLED" ? (
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Void reason (optional)"
                            value={voidReason[o.id] ?? ""}
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

