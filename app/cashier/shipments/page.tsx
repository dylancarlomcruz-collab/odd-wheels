"use client";

import * as React from "react";
import { useAllOrders } from "@/hooks/useAllOrders";
import { useNotices } from "@/hooks/useNotices";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatConditionLabel } from "@/lib/conditions";

const SHIPPING_TABS = [
  { key: "PREPARING TO SHIP", label: "Preparing to ship" },
  { key: "SHIPPED", label: "Shipped" },
  { key: "COMPLETED", label: "Completed" },
] as const;

type ShippingTabKey = (typeof SHIPPING_TABS)[number]["key"];

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
    return `PHP ${Math.round(n)}`;
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

function buildCopyPayload(o: any) {
  const details = parseJsonMaybe(o.shipping_details) ?? {};
  const method = String(details.method ?? o.shipping_method ?? "").toUpperCase();

  const phone = normalizePhoneToPlus10(
    details.receiver_phone ??
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

function normalizeShippingStatus(raw: string | null | undefined) {
  const status = String(raw ?? "").trim().toUpperCase();
  if (!status || status === "NONE") return "PREPARING TO SHIP";
  if (status === "PREPARING" || status === "PREPARING_TO_SHIP") {
    return "PREPARING TO SHIP";
  }
  if (status === "TO_SHIP" || status === "PENDING_SHIPMENT") {
    return "PREPARING TO SHIP";
  }
  return status;
}

function shippingStatusBadge(status: string) {
  switch (status) {
    case "SHIPPED":
      return "border-sky-500/30 text-sky-200";
    case "COMPLETED":
      return "border-emerald-500/30 text-emerald-200";
    default:
      return "border-yellow-500/30 text-yellow-200";
  }
}

function buildCourierOptions(method: string | null | undefined) {
  const base = [
    "LBC",
    "Lalamove",
    "J&T Express",
    "JRS",
    "Ninja Van",
    "Grab",
    "Other",
  ];
  const cleaned = String(method ?? "").trim();
  const combined = cleaned ? [cleaned, ...base] : base;
  const seen = new Set<string>();
  return combined.filter((opt) => {
    const key = opt.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildShippingSummary(o: any, details: Record<string, any>) {
  const receiverName =
    details.receiver_name ||
    [details.first_name, details.last_name].filter(Boolean).join(" ") ||
    o.customer_name;
  const receiverPhone =
    details.receiver_phone || details.phone || o.customer_phone || o.contact;
  const address =
    details.full_address || details.dropoff_address || o.address || details.address;
  const branch =
    [details.branch_name || details.branch, details.branch_city]
      .filter(Boolean)
      .join(", ") || null;
  const notes = details.notes || details.note || null;
  const pack = details.package || details.package_size || null;

  return [
    { label: "Method", value: o.shipping_method },
    { label: "Region", value: o.shipping_region || null },
    { label: "Receiver", value: receiverName || null },
    { label: "Phone", value: receiverPhone || null },
    { label: "Address", value: address || null },
    { label: "Branch", value: branch },
    { label: "Package", value: pack },
    { label: "Notes", value: notes },
  ].filter((row) => row.value);
}

function pickShippingDays(notices: { title: string; body: string }[]) {
  // Best-effort parse of shipping days from Notice Board entries.
  const candidate = notices.find(
    (n) => /ship/i.test(n.title ?? "") || /ship/i.test(n.body ?? "")
  );
  if (!candidate) return null;

  const text = `${candidate.title ?? ""}\n${candidate.body ?? ""}`.trim();
  const match = text.match(
    /ship(?:s|ping)?\s+(?:in|within|on or before)\s+([^\n.]+)/i
  );
  if (match?.[1]) return match[1].trim();

  const fallback = String(candidate.body ?? candidate.title ?? "").trim();
  if (!fallback) return null;
  return fallback.split("\n")[0].trim();
}

export default function CashierShipmentsPage() {
  const { orders, itemsByOrderId, loading, reload } = useAllOrders();
  const { notices } = useNotices(10);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] =
    React.useState<ShippingTabKey>("PREPARING TO SHIP");
  const [drafts, setDrafts] = React.useState<
    Record<string, { courier: string; tracking: string }>
  >({});
  const [busyById, setBusyById] = React.useState<Record<string, boolean>>({});
  const [errorById, setErrorById] = React.useState<Record<string, string>>({});

  const shippingDays = React.useMemo(
    () => pickShippingDays(notices),
    [notices]
  );
  const shippingDaysLabel = shippingDays || "the posted shipping days";

  React.useEffect(() => {
    if (!orders.length) return;
    setDrafts((cur) => {
      const next = { ...cur };
      for (const o of orders) {
        if (!next[o.id]) {
          next[o.id] = {
            courier: String(o.courier ?? o.shipping_method ?? ""),
            tracking: String(o.tracking_number ?? ""),
          };
        }
      }
      return next;
    });
  }, [orders]);

  const paidOrders = React.useMemo(
    () =>
      orders.filter((o) => {
        const payment = String(o.payment_status ?? "").toUpperCase();
        const status = String(o.status ?? "").toUpperCase();
        if (payment !== "PAID") return false;
        if (status === "CANCELLED" || status === "VOIDED") return false;
        const shipping = normalizeShippingStatus(o.shipping_status);
        return (
          shipping === "PREPARING TO SHIP" ||
          shipping === "SHIPPED" ||
          shipping === "COMPLETED"
        );
      }),
    [orders]
  );

  const tabCounts = React.useMemo(() => {
    return paidOrders.reduce(
      (acc, o) => {
        const status = normalizeShippingStatus(o.shipping_status);
        if (acc[status] !== undefined) acc[status] += 1;
        return acc;
      },
      {
        "PREPARING TO SHIP": 0,
        SHIPPED: 0,
        COMPLETED: 0,
      } as Record<string, number>
    );
  }, [paidOrders]);

  const filtered = React.useMemo(
    () =>
      paidOrders.filter(
        (o) => normalizeShippingStatus(o.shipping_status) === activeTab
      ),
    [paidOrders, activeTab]
  );

  async function runRpc(
    orderId: string,
    fn: string,
    params: Record<string, any>
  ) {
    setBusyById((cur) => ({ ...cur, [orderId]: true }));
    setErrorById((cur) => ({ ...cur, [orderId]: "" }));
    try {
      const { error } = await supabase.rpc(fn, params);
      if (error) throw error;
      await reload();
    } catch (err: any) {
      setErrorById((cur) => ({
        ...cur,
        [orderId]: err?.message ?? "Action failed.",
      }));
    } finally {
      setBusyById((cur) => ({ ...cur, [orderId]: false }));
    }
  }

  async function onCopy(o: any) {
    const payload = buildCopyPayload(o);
    const ok = await copyText(payload);
    if (!ok) return alert("Copy failed. Your browser blocked clipboard access.");

    setCopiedId(o.id);
    window.setTimeout(() => setCopiedId((cur) => (cur === o.id ? null : cur)), 1200);
  }

  function onDraftChange(orderId: string, key: "courier" | "tracking", value: string) {
    setDrafts((cur) => ({
      ...cur,
      [orderId]: { ...(cur[orderId] ?? { courier: "", tracking: "" }), [key]: value },
    }));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Shipping Status</div>
            <div className="text-sm text-white/60">
              Paid orders ready for shipping updates and tracking.
            </div>
          </div>
          <Badge>{paidOrders.length}</Badge>
        </CardHeader>

        <CardBody className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {SHIPPING_TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <Button
                  key={tab.key}
                  size="sm"
                  variant={active ? "primary" : "ghost"}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label} ({tabCounts[tab.key] ?? 0})
                </Button>
              );
            })}
          </div>

          {loading ? (
            <div className="text-white/60">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-white/60">No orders in this stage.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((o: any) => {
                const details = parseJsonMaybe(o.shipping_details) ?? {};
                const method = String(details.method ?? o.shipping_method ?? "");
                const isCop = String(method).toUpperCase() === "LBC" && Boolean(details.cop);
                const items = itemsByOrderId[o.id] ?? [];
                const shippingStatus = normalizeShippingStatus(o.shipping_status);
                const rawStatus = String(o.shipping_status ?? "").trim().toUpperCase();
                const needsPreparing = !rawStatus || rawStatus === "NONE";
                const rushFee = Number(o.rush_fee ?? 0);
                const priorityFee = Number(o.priority_fee ?? 0);
                const draft = drafts[o.id] ?? { courier: "", tracking: "" };
                const canMarkShipped = draft.tracking.trim().length > 0;
                const busy = Boolean(busyById[o.id]);
                const error = errorById[o.id];
                const shippingSummary = buildShippingSummary(o, details);

                return (
                  <div key={o.id} className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold">#{String(o.id).slice(0, 8)}</div>
                        <div className="text-sm text-white/60">
                          {new Date(o.created_at).toLocaleString("en-PH")}
                        </div>
                      </div>
                      <Badge className={shippingStatusBadge(shippingStatus)}>
                        {shippingStatus}
                      </Badge>
                    </div>

                    <div className="mt-2 text-sm text-white/70">
                      Channel: <span className="text-white/90">{o.channel}</span> | Order status:{" "}
                      <span className="text-white/90">{o.status}</span> | Payment:{" "}
                      <span className="text-white/90">{o.payment_status}</span> | Shipping:{" "}
                      <span className="text-white/90">{o.shipping_method}</span>
                      {isCop ? <span className="ml-2 text-yellow-200">| COP (Pay at branch)</span> : null}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                        <div className="text-xs text-white/60">Customer</div>
                        <div className="font-medium">{o.customer_name ?? "-"}</div>
                        <div className="text-sm text-white/70">
                          {(o.contact ?? o.customer_phone) ? <div>{o.contact ?? o.customer_phone}</div> : null}
                          {o.address ? <div className="mt-1">{o.address}</div> : null}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                        <div className="text-xs text-white/60">Totals</div>
                        <div className="mt-1 text-sm text-white/80">
                          Subtotal: <span className="text-white">{peso(Number(o.subtotal ?? 0))}</span>
                        </div>
                        <div className="text-sm text-white/80">
                          Shipping: <span className="text-white">{peso(Number(o.shipping_fee ?? 0))}</span>
                        </div>
                        <div className="text-sm text-white/80">
                          Rush fee: <span className="text-white">{peso(rushFee)}</span>
                        </div>
                        {priorityFee > 0 ? (
                          <div className="text-sm text-white/80">
                            Priority fee: <span className="text-white">{peso(priorityFee)}</span>
                          </div>
                        ) : null}
                        <div className="mt-1 font-semibold">Total: {peso(Number(o.total ?? 0))}</div>
                      </div>
                    </div>

                    {shippingStatus === "PREPARING TO SHIP" ? (
                      <div className="mt-4 rounded-xl border border-accent-500/30 bg-accent-500/10 p-3 text-sm text-white/80">
                        Please be patient with the orders. It will be shipped on or before{" "}
                        {shippingDaysLabel}. If you have any questions or want to add +₱50 rush fee,
                        please notify the admin.
                      </div>
                    ) : null}

                    {shippingStatus === "SHIPPED" ? (
                      <div className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-white/80">
                        Your orders are on the way. Please track your orders in the{" "}
                        {o.shipping_method} app.
                        <div className="mt-2 text-sm text-white/70">
                          Courier:{" "}
                          <span className="text-white/90">
                            {o.courier ?? o.shipping_method ?? "-"}
                          </span>{" "}
                          | Tracking:{" "}
                          <span className="text-white/90">{o.tracking_number ?? "-"}</span>
                        </div>
                      </div>
                    ) : null}

                    {shippingStatus === "COMPLETED" ? (
                      <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-white/80">
                        Completed{ o.completed_at ? ` on ${new Date(o.completed_at).toLocaleString("en-PH")}` : "."}
                      </div>
                    ) : null}

                    {shippingStatus === "PREPARING TO SHIP" ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <Select
                          label="Courier"
                          value={draft.courier}
                          onChange={(e) => onDraftChange(o.id, "courier", e.target.value)}
                        >
                          {buildCourierOptions(o.shipping_method).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </Select>
                        <Input
                          label="Tracking number"
                          value={draft.tracking}
                          placeholder="Enter tracking number"
                          onChange={(e) => onDraftChange(o.id, "tracking", e.target.value)}
                        />
                      </div>
                    ) : null}

                    <div className="mt-4 space-y-3">
                      <details className="rounded-xl border border-white/10 bg-paper/5 p-3">
                        <summary className="cursor-pointer text-sm font-semibold">
                          Items ({items.length})
                        </summary>
                        {items.length === 0 ? (
                          <div className="text-sm text-white/60 mt-2">
                            No items found for this order.
                          </div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {items.map((it: any, idx: number) => {
                              const thumb = getItemThumb(it);
                              const title = getItemTitle(it);
                              const condition = formatConditionLabel(
                                it?.condition ?? it?.product_variant?.condition,
                                { upper: true }
                              );
                              const notes = String(
                                it?.issue_notes ?? it?.product_variant?.issue_notes ?? ""
                              ).trim();
                              const price = getItemPrice(it);
                              const qty = Number(it?.qty ?? 1);
                              const line = Number(it?.line_total ?? price * qty);

                              return (
                                <div
                                  key={`${o.id}-${idx}`}
                                  className="rounded-xl border border-white/10 bg-bg-900/30 p-3 flex gap-3"
                                >
                                  <div className="h-14 w-14 rounded-lg bg-bg-800 border border-white/10 overflow-hidden flex-shrink-0">
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
                                      {condition ? `${condition} | ` : ""}
                                      {qty} x {peso(price)} | Line: {peso(line)}
                                    </div>
                                    {notes ? (
                                      <div className="mt-1 text-xs text-yellow-200">
                                        Notes: {notes}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </details>

                      <details className="group rounded-xl border border-white/10 bg-paper/5 p-3">
                        <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold">
                          <span>Shipping details</span>
                          <span className="text-xs text-white/50 group-open:hidden">
                            View
                          </span>
                        </summary>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {shippingSummary.length ? (
                            shippingSummary.map((row) => (
                              <div
                                key={row.label}
                                className="rounded-lg border border-white/10 bg-bg-900/40 p-3"
                              >
                                <div className="text-[11px] uppercase tracking-wide text-white/50">
                                  {row.label}
                                </div>
                                <div className="mt-1 text-sm text-white/90 break-words">
                                  {row.value}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-white/60">
                              No shipping details available.
                            </div>
                          )}
                        </div>
                        <details className="mt-3 rounded-lg border border-white/10 bg-bg-900/40 p-3">
                          <summary className="cursor-pointer text-xs font-semibold text-white/70">
                            Raw shipping JSON
                          </summary>
                          <pre className="mt-2 text-xs text-white/70 whitespace-pre-wrap">
                            {JSON.stringify(details, null, 2)}
                          </pre>
                        </details>
                      </details>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button variant="secondary" onClick={() => onCopy(o)}>
                        {copiedId === o.id ? "Copied!" : "Copy details"}
                      </Button>

                      {shippingStatus === "PREPARING TO SHIP" ? (
                        <>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              runRpc(o.id, "fn_add_rush_fee", {
                                p_order_id: o.id,
                                p_amount: 50,
                              })
                            }
                            disabled={busy || rushFee > 0}
                          >
                            {rushFee > 0 ? "Rush fee added" : "Add Rush Fee (+₱50)"}
                          </Button>
                          <Button
                            onClick={() =>
                              runRpc(o.id, "fn_mark_shipped", {
                                p_order_id: o.id,
                                p_courier: draft.courier || o.shipping_method,
                                p_tracking_number: draft.tracking.trim(),
                              })
                            }
                            disabled={busy || !canMarkShipped}
                          >
                            Mark as shipped
                          </Button>
                          {needsPreparing ? (
                            <Button
                              variant="ghost"
                              onClick={() =>
                                runRpc(o.id, "fn_set_shipping_preparing", {
                                  p_order_id: o.id,
                                })
                              }
                              disabled={busy}
                            >
                              Set to preparing
                            </Button>
                          ) : null}
                        </>
                      ) : null}

                      {shippingStatus === "SHIPPED" ? (
                        <Button
                          onClick={() =>
                            runRpc(o.id, "fn_mark_completed_staff", {
                              p_order_id: o.id,
                            })
                          }
                          disabled={busy}
                        >
                          Mark as completed
                        </Button>
                      ) : null}
                    </div>

                    {error ? <div className="mt-2 text-sm text-red-200">{error}</div> : null}
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

