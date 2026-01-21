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
  const address = cleanAddress(
    details.full_address || details.dropoff_address || o.address || details.address
  );
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

function getCustomerName(o: any, details: Record<string, any>) {
  return (
    details.receiver_name ||
    [details.first_name, details.last_name].filter(Boolean).join(" ") ||
    o.customer_name ||
    "Guest"
  );
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
  const [activeCourier, setActiveCourier] = React.useState<string>("ALL");
  const [scanOrderId, setScanOrderId] = React.useState<string | null>(null);
  const [scanCourier, setScanCourier] = React.useState<string>("");
  const [scanError, setScanError] = React.useState<string | null>(null);
  const [scanSupported, setScanSupported] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  const shippingDays = React.useMemo(
    () => pickShippingDays(notices),
    [notices]
  );
  const shippingDaysLabel = shippingDays || "the posted shipping days";

  React.useEffect(() => {
    setScanSupported(typeof window !== "undefined" && "BarcodeDetector" in window);
  }, []);

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

  React.useEffect(() => {
    if (!scanOrderId || !scanSupported) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    const orderId = scanOrderId;

    const start = async () => {
      try {
        const BarcodeDetectorClass = (window as any).BarcodeDetector;
        if (!BarcodeDetectorClass) {
          setScanError("Camera scanning is not supported in this browser.");
          return;
        }
        const detector = new BarcodeDetectorClass({
          formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"],
        });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes?.length) {
              const raw = String(barcodes[0].rawValue ?? "").trim();
              if (raw) {
                onDraftChange(orderId, "tracking", raw);
                await runRpc(orderId, "fn_mark_shipped", {
                  p_order_id: orderId,
                  p_courier: scanCourier,
                  p_tracking_number: raw,
                });
                setScanOrderId(null);
                setScanCourier("");
                return;
              }
            }
          } catch (err) {
            setScanError("Unable to scan. Try again.");
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (err: any) {
        setScanError(err?.message ?? "Camera access failed.");
      }
    };

    start();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [scanOrderId, scanSupported]);

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

  const preparingOrders = React.useMemo(
    () =>
      paidOrders.filter(
        (o) => normalizeShippingStatus(o.shipping_status) === "PREPARING TO SHIP"
      ),
    [paidOrders]
  );

  const courierGroups = React.useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const o of preparingOrders) {
      const draft = drafts[o.id] ?? { courier: "", tracking: "" };
      const key = String(draft.courier || o.shipping_method || "Other").trim() || "Other";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(o);
    }
    return grouped;
  }, [preparingOrders, drafts]);

  const courierTabs = React.useMemo(
    () => ["ALL", ...Object.keys(courierGroups).sort()],
    [courierGroups]
  );

  const bulkOrders =
    activeTab === "PREPARING TO SHIP"
      ? activeCourier === "ALL"
        ? preparingOrders
        : courierGroups[activeCourier] ?? []
      : [];

  React.useEffect(() => {
    if (activeTab !== "PREPARING TO SHIP") return;
    if (activeCourier !== "ALL" && !courierGroups[activeCourier]) {
      setActiveCourier("ALL");
    }
  }, [activeTab, activeCourier, courierGroups]);

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

  async function undoShipped(orderId: string) {
    setBusyById((cur) => ({ ...cur, [orderId]: true }));
    setErrorById((cur) => ({ ...cur, [orderId]: "" }));
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          shipping_status: "PREPARING TO SHIP",
          tracking_number: null,
          courier: null,
          shipped_at: null,
        })
        .eq("id", orderId);
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

        <CardBody className="space-y-4">
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

          {activeTab === "PREPARING TO SHIP" ? (
            <div className="rounded-2xl border border-white/10 bg-bg-900/20 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Bulk tracking entry</div>
                  <div className="text-xs text-white/60">
                    Type or scan a waybill number. Focus the field and scan with a barcode scanner, or use camera scan.
                  </div>
                </div>
                <Badge>{bulkOrders.length}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {courierTabs.map((tab) => {
                  const active = activeCourier === tab;
                  return (
                    <Button
                      key={tab}
                      size="sm"
                      variant={active ? "primary" : "ghost"}
                      onClick={() => setActiveCourier(tab)}
                    >
                      {tab === "ALL" ? "All couriers" : tab}
                      {tab === "ALL"
                        ? ` (${preparingOrders.length})`
                        : ` (${courierGroups[tab]?.length ?? 0})`}
                    </Button>
                  );
                })}
              </div>
              {bulkOrders.length === 0 ? (
                <div className="text-sm text-white/60">No orders ready for tracking.</div>
              ) : (
                <div className="space-y-2">
                  {bulkOrders.map((o: any) => {
                    const details = parseJsonMaybe(o.shipping_details) ?? {};
                    const customerName = getCustomerName(o, details);
                    const draft = drafts[o.id] ?? { courier: "", tracking: "" };
                    const courierLabel = String(draft.courier || o.shipping_method || "").trim();
                    const canMarkShipped = draft.tracking.trim().length > 0;
                    const busy = Boolean(busyById[o.id]);

                    return (
                      <div key={o.id} className="rounded-xl border border-white/10 bg-paper/5 p-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{customerName}</div>
                            <div className="text-xs text-white/50">
                              #{String(o.id).slice(0, 8)}
                              {courierLabel ? ` - ${courierLabel}` : ""}
                            </div>
                          </div>
                          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                            <Input
                              value={draft.tracking}
                              placeholder="Waybill / tracking"
                              onChange={(e) => onDraftChange(o.id, "tracking", e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && canMarkShipped && !busy) {
                                  runRpc(o.id, "fn_mark_shipped", {
                                    p_order_id: o.id,
                                    p_courier: draft.courier || o.shipping_method,
                                    p_tracking_number: draft.tracking.trim(),
                                  });
                                }
                              }}
                              className="h-8 w-full px-3 text-xs sm:w-56"
                            />
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setScanError(null);
                                  setScanCourier(draft.courier || o.shipping_method || "");
                                  setScanOrderId(o.id);
                                }}
                                disabled={busy}
                              >
                              Scan
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                runRpc(o.id, "fn_mark_shipped", {
                                  p_order_id: o.id,
                                  p_courier: draft.courier || o.shipping_method,
                                  p_tracking_number: draft.tracking.trim(),
                                })
                              }
                              disabled={busy || !canMarkShipped}
                            >
                              Mark shipped
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

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
                const createdAt = new Date(o.created_at).toLocaleString("en-PH");
                const customerName = getCustomerName(o, details);
                const customerPhone =
                  details.receiver_phone ||
                  details.phone ||
                  o.customer_phone ||
                  o.contact ||
                  "";
                const customerAddress = cleanAddress(
                  details.full_address || details.dropoff_address || o.address || details.address
                );
                const orderTotal = peso(Number(o.total ?? 0));

                return (
                  <div key={o.id} className="rounded-2xl border border-white/10 bg-bg-900/30 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold">#{String(o.id).slice(0, 8)}</div>
                        <div className="text-xs text-white/60">{createdAt}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-white/50">Total</div>
                        <div className="text-base font-semibold">{orderTotal}</div>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Badge className={shippingStatusBadge(shippingStatus)}>
                        {shippingStatus}
                      </Badge>
                      <Badge>Channel: {o.channel}</Badge>
                      <Badge>Status: {o.status}</Badge>
                      <Badge>Payment: {o.payment_status}</Badge>
                      <Badge>Shipping: {o.shipping_method}</Badge>
                      {isCop ? (
                        <Badge className="border-yellow-500/40 text-yellow-200">COP</Badge>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                      <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/50">Customer</div>
                        <div className="mt-1 font-medium">{customerName}</div>
                        {customerPhone ? (
                          <div className="text-sm text-white/70">{customerPhone}</div>
                        ) : null}
                        {customerAddress ? (
                          <div className="mt-1 text-xs text-white/60">{customerAddress}</div>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-white/50">Totals</div>
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
                      <div className="mt-3 rounded-xl border border-accent-500/30 bg-accent-500/10 p-3 text-xs text-white/80">
                        Ships on or before {shippingDaysLabel}. Add +P50 rush fee if requested.
                      </div>
                    ) : null}

                    {shippingStatus === "SHIPPED" ? (
                      <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-white/80">
                        Shipment is on the way. Track in the {o.shipping_method} app.
                        <div className="mt-2 text-xs text-white/70">
                          Courier: <span className="text-white/90">{o.courier ?? o.shipping_method ?? "-"}</span> | Tracking: <span className="text-white/90">{o.tracking_number ?? "-"}</span>
                        </div>
                      </div>
                    ) : null}

                    {shippingStatus === "COMPLETED" ? (
                      <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-white/80">
                        Completed{ o.completed_at ? ` on ${new Date(o.completed_at).toLocaleString("en-PH")}` : "."}
                      </div>
                    ) : null}

                    {shippingStatus === "PREPARING TO SHIP" ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1.2fr]">
                        <Select
                          label="Courier"
                          value={draft.courier}
                          onChange={(e) => onDraftChange(o.id, "courier", e.target.value)}
                          className="h-9 text-sm"
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
                          className="h-9 text-sm"
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
                      </details>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => onCopy(o)}>
                        {copiedId === o.id ? "Copied!" : "Copy details"}
                      </Button>

                      {shippingStatus === "PREPARING TO SHIP" ? (
                        <>
                          <Button
                            size="sm"
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
                            size="sm"
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
                              size="sm"
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
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              runRpc(o.id, "fn_mark_completed_staff", {
                                p_order_id: o.id,
                              })
                            }
                            disabled={busy}
                          >
                            Mark as completed
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => undoShipped(o.id)}
                            disabled={busy}
                          >
                            Undo shipped
                          </Button>
                        </>
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
      {scanOrderId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-bg-900/95 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white/90">
                Scan tracking number
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setScanOrderId(null);
                  setScanCourier("");
                }}
              >
                Close
              </Button>
            </div>
            {scanSupported ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black">
                <video ref={videoRef} className="h-64 w-full object-cover" />
              </div>
            ) : (
              <div className="mt-3 text-sm text-white/70">
                Camera scanning is not supported in this browser. Please type or
                use a barcode scanner.
              </div>
            )}
            {scanError ? (
              <div className="mt-2 text-sm text-red-200">{scanError}</div>
            ) : null}
            <div className="mt-2 text-xs text-white/50">
              Point the camera at the waybill barcode. The code will fill in automatically.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

