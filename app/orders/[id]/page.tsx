"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { useOrder } from "@/hooks/useOrders";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPHP } from "@/lib/money";
import { formatConditionLabel } from "@/lib/conditions";
import { supabase } from "@/lib/supabase/browser";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  badgeToneClass,
  formatStatusLabel,
  getBadges,
  normalizeShippingStatus,
} from "@/lib/orderBadges";
import { isPlatinumTier } from "@/lib/tier";

type PaymentMethod = {
  id: string;
  method: string;
  label: string;
  account_number: string | null;
  account_name: string | null;
  instructions: string | null;
  qr_image_url: string | null;
  is_active: boolean;
};

function msLeft(expiresAt: string | null) {
  if (!expiresAt) return null;
  return Math.max(0, new Date(expiresAt).getTime() - Date.now());
}

function fmtCountdown(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}h ${m}m ${ss}s`;
}

function formatShippingMethodLabel(raw: string | null | undefined) {
  const method = String(raw ?? "").trim().toUpperCase();
  if (!method) return "-";
  if (method === "JNT" || method === "J&T") return "J&T";
  if (method === "LBC") return "LBC Pickup";
  if (method === "LALAMOVE") return "Lalamove";
  return formatStatusLabel(method);
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

function formatDateMaybe(value: any) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatSlotLabel(slot: any) {
  if (!slot) return null;
  const date = formatDateMaybe(slot.date);
  const windowLabel =
    typeof slot.window_label === "string"
      ? slot.window_label
      : typeof slot.window === "string"
      ? slot.window
      : typeof slot.window_key === "string"
      ? slot.window_key
      : null;
  const parts = [date, windowLabel].filter(Boolean) as string[];
  return parts.length ? parts.join(" - ") : null;
}

function buildShippingSections(order: any, details: Record<string, any>) {
  const sections: { title: string; items: { label: string; value: React.ReactNode }[] }[] =
    [];

  const method = String(details.method ?? order?.shipping_method ?? "").trim().toUpperCase();
  const receiverName =
    details.receiver_name ||
    [details.first_name, details.last_name].filter(Boolean).join(" ") ||
    order?.customer_name;
  const receiverPhone =
    details.receiver_phone || details.phone || order?.customer_phone || order?.contact;
  const receiverEmail = details.receiver_email || details.email || order?.customer_email;
  const orderAddressRaw =
    typeof order?.address === "string" ? order.address.trim() : "";
  const parsedOrderAddress = orderAddressRaw
    ? parseJsonMaybe(orderAddressRaw)
    : null;
  const orderAddress =
    parsedOrderAddress && typeof parsedOrderAddress === "object"
      ? ""
      : orderAddressRaw;
  const dropoffAddress =
    typeof details.dropoff_address === "string"
      ? details.dropoff_address.trim()
      : "";
  const pickupLocation =
    typeof details.pickup_location === "string"
      ? details.pickup_location.trim()
      : "";
  const pickupDirectory =
    typeof details.pickup_directory === "string"
      ? details.pickup_directory.trim()
      : "";
  const pickupDay =
    typeof details.pickup_day === "string" ? details.pickup_day.trim() : "";
  const pickupDayLabel =
    pickupDay === "MON"
      ? "Monday"
      : pickupDay === "TUE"
      ? "Tuesday"
      : pickupDay === "WED"
      ? "Wednesday"
      : pickupDay === "THU"
      ? "Thursday"
      : pickupDay === "FRI"
      ? "Friday"
      : pickupDay === "SAT"
      ? "Saturday"
      : pickupDay === "SUN"
      ? "Sunday"
      : pickupDay;
  const pickupSlot =
    typeof details.pickup_slot === "string" ? details.pickup_slot.trim() : "";
  const fullAddress =
    typeof details.full_address === "string" ? details.full_address.trim() : "";
  const detailAddress =
    typeof details.address === "string" ? details.address.trim() : "";
  const address =
    method === "PICKUP"
      ? pickupLocation || null
      : method === "LBC"
      ? dropoffAddress || null
      : fullAddress ||
        dropoffAddress ||
        orderAddress ||
        detailAddress;
  const addressLabel =
    method === "PICKUP"
      ? "Pickup location"
      : method === "LALAMOVE" || dropoffAddress
      ? "Drop-off address"
      : "Address";
  const branch =
    [details.branch_name || details.branch, details.branch_city]
      .filter(Boolean)
      .join(", ") || null;
  const mapUrl = details.map_url || details.map || details.map_image_url;
  const notes = details.notes || details.note || null;
  const pack = details.package || details.package_size || null;
  const cop = details.cop ?? details.cash_on_pickup;

  const recipientItems: { label: string; value: React.ReactNode }[] = [];
  if (receiverName) recipientItems.push({ label: "Name", value: receiverName });
  if (receiverPhone) recipientItems.push({ label: "Phone", value: receiverPhone });
  if (receiverEmail) recipientItems.push({ label: "Email", value: receiverEmail });
  if (recipientItems.length) sections.push({ title: "Recipient", items: recipientItems });

  const locationItems: { label: string; value: React.ReactNode }[] = [];
  if (address) locationItems.push({ label: addressLabel, value: address });
  if (pickupDirectory && method === "PICKUP") {
    locationItems.push({ label: "Directory", value: pickupDirectory });
  }
  if (branch) locationItems.push({ label: "Branch", value: branch });
  if (mapUrl) {
    locationItems.push({
      label: "Map",
      value: (
        <a
          href={mapUrl}
          target="_blank"
          rel="noreferrer"
          className="text-accent-700 underline hover:text-accent-600 dark:text-accent-200 dark:hover:text-accent-100"
        >
          Open map
        </a>
      ),
    });
  }
  if (locationItems.length) sections.push({ title: "Location", items: locationItems });

  const scheduleItems: { label: string; value: React.ReactNode }[] = [];
  if (pickupDayLabel) {
    scheduleItems.push({ label: "Pickup day", value: pickupDayLabel });
  }
  if (pickupSlot) {
    scheduleItems.push({ label: "Pickup time", value: pickupSlot });
  }
  const selectedSlot = formatSlotLabel(details.lalamove);
  const slotLabels = Array.isArray(details.lalamove_slots)
    ? details.lalamove_slots
        .map((slot: any) => formatSlotLabel(slot))
        .filter(Boolean)
    : [];
  const selectedWindows = Array.from(
    new Set([selectedSlot, ...slotLabels].filter(Boolean))
  ) as string[];
  if (selectedWindows.length) {
    scheduleItems.push({
      label: selectedWindows.length === 1 ? "Selected window" : "Selected windows",
      value: (
        <div className="flex flex-wrap gap-2">
          {selectedWindows.map((label: string, index: number) => (
            <span
              key={`${label}-${index}`}
              className="rounded-md border border-white/10 bg-bg-950/40 px-2 py-1 text-xs text-white/80"
            >
              {label}
            </span>
          ))}
        </div>
      ),
    });
  }
  if (scheduleItems.length)
    sections.push({ title: "Selected schedule", items: scheduleItems });

  const extraItems: { label: string; value: React.ReactNode }[] = [];
  if (pack) extraItems.push({ label: "Package", value: pack });
  if (notes) extraItems.push({ label: "Notes", value: notes });
  if (cop !== null && cop !== undefined) {
    extraItems.push({
      label: "Cash on pickup",
      value: typeof cop === "boolean" ? (cop ? "Yes" : "No") : String(cop),
    });
  }
  if (extraItems.length) sections.push({ title: "Extras", items: extraItems });

  return sections;
}

async function uploadReceipt(file: File, orderId: string) {
  // reuse your existing upload route
  const fd = new FormData();
  fd.append("file", file);
  fd.append("productId", `receipt-${orderId}`); // used as storage path prefix in your route

  const res = await fetch("/api/images/upload", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok || !json?.ok || !json?.publicUrl)
    throw new Error(json?.error || "Upload failed");
  return json.publicUrl as string;
}

function OrderDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const id = params.id;
  const { order, items, loading } = useOrder(id);

  const [tick, setTick] = React.useState(0);
  const [uploading, setUploading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [shippingMsg, setShippingMsg] = React.useState<string | null>(null);
  const [canceling, setCanceling] = React.useState(false);
  const [cancelMsg, setCancelMsg] = React.useState<string | null>(null);
  const [reorderLoading, setReorderLoading] = React.useState(false);
  const [reorderMsg, setReorderMsg] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<any[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = React.useState(false);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod | null>(null);
  const [paymentMethodLoading, setPaymentMethodLoading] = React.useState(false);
  const [paymentMethodError, setPaymentMethodError] = React.useState<string | null>(
    null
  );
  const [copyMsg, setCopyMsg] = React.useState<string | null>(null);
  const [tier, setTier] = React.useState<string | null>(null);
  const [events, setEvents] = React.useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = React.useState(false);

  const deadline =
    order?.expires_at ?? order?.payment_deadline ?? order?.reserved_expires_at ?? null;

  const cancelledReason = String(order?.cancelled_reason ?? "");

  const soldOutVariantIds = React.useMemo(() => {
    return (items ?? [])
      .filter(
        (it) =>
          String(it?.cancel_reason ?? "") === "SOLD_OUT" || Boolean(it?.is_cancelled)
      )
      .map((it) => it?.variant_id)
      .filter(Boolean);
  }, [items]);

  const hasRemainingItems = React.useMemo(() => {
    return (items ?? []).some((it) => {
      const soldOut =
        String(it?.cancel_reason ?? "") === "SOLD_OUT" ||
        Boolean(it?.is_cancelled);
      return !soldOut;
    });
  }, [items]);

  // refresh countdown every second when awaiting payment and not on hold
  React.useEffect(() => {
    if (!order) return;
    const shouldTick =
      order.status === "AWAITING_PAYMENT" &&
      !order.payment_hold &&
      deadline;
    if (!shouldTick) return;

    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [order?.id, order?.status, order?.payment_hold, deadline]);

  React.useEffect(() => {
    let mounted = true;
    const status = String(order?.status ?? "");
    const shouldFetch =
      !!order &&
      order.payment_status !== "PAID" &&
      ["AWAITING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_REVIEW"].includes(status);

    if (!shouldFetch) {
      setPaymentMethod(null);
      setPaymentMethodError(null);
      setPaymentMethodLoading(false);
      return () => {
        mounted = false;
      };
    }

    const method = String(order.payment_method ?? "").trim();
    const methodKey = method.toUpperCase();
    if (!method) {
      setPaymentMethod(null);
      setPaymentMethodError(null);
      setPaymentMethodLoading(false);
      return () => {
        mounted = false;
      };
    }

    const run = async () => {
      setPaymentMethodLoading(true);
      setPaymentMethodError(null);
      try {
        const { data, error } = await supabase
          .from("payment_methods")
          .select(
            "id,method,label,account_number,account_name,instructions,qr_image_url,is_active"
          )
          .eq("method", method)
          .eq("is_active", true)
          .maybeSingle();

        if (!mounted) return;
        if (error) {
          console.error(error);
          setPaymentMethod(null);
          setPaymentMethodError(
            "Payment instructions unavailable. Contact admin."
          );
          return;
        }
        if (!data) {
          if (["GCASH", "BPI"].includes(methodKey)) {
            setPaymentMethodError(
              "Payment instructions unavailable. Contact admin."
            );
          }
          setPaymentMethod(null);
          return;
        }
        setPaymentMethod(data as PaymentMethod);
      } finally {
        if (!mounted) return;
        setPaymentMethodLoading(false);
      }
    };

    run();

    return () => {
      mounted = false;
    };
  }, [order?.id, order?.payment_method, order?.payment_status, order?.status]);

  React.useEffect(() => {
    let mounted = true;
    async function loadTier() {
      if (!user) {
        setTier(null);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("tier")
        .eq("id", user.id)
        .maybeSingle();

      if (!mounted) return;
      if (error) {
        console.error("Failed to load tier:", error);
        setTier(null);
        return;
      }
      setTier((data as any)?.tier ?? "SILVER");
    }

    loadTier();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  React.useEffect(() => {
    let mounted = true;
    async function loadEvents() {
      if (!order || !isPlatinumTier(tier as any)) {
        setEvents([]);
        setEventsLoading(false);
        return;
      }

      setEventsLoading(true);
      const { data, error } = await supabase
        .from("order_events")
        .select("id,event_type,message,created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true });

      if (!mounted) return;
      if (error) {
        console.error("Failed to load order events:", error);
        setEvents([]);
      } else {
        setEvents((data as any[]) ?? []);
      }
      setEventsLoading(false);
    }

    loadEvents();
    return () => {
      mounted = false;
    };
  }, [order?.id, tier]);

  const left = React.useMemo(() => msLeft(deadline), [deadline, tick]);
  const showTimer =
    order?.status === "AWAITING_PAYMENT" &&
    !order?.payment_hold &&
    left !== null;
  const shippingStatus = normalizeShippingStatus(order?.shipping_status);
  const badges = order ? getBadges(order) : [];
  const isPaid = order?.payment_status === "PAID";
  const showPaymentDetails =
    order?.payment_status !== "PAID" &&
    ["AWAITING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_REVIEW"].includes(
      String(order?.status ?? "")
    );
  const canUploadReceipt = React.useMemo(() => {
    if (!order) return false;
    if (order.payment_status === "PAID") return false;
    const status = String(order.status ?? "");
    return ["AWAITING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_REVIEW"].includes(
      status
    );
  }, [order]);
  const methodCode = String(order?.payment_method ?? "").trim().toUpperCase();
  const fallbackMessage = paymentMethodError
    ? paymentMethodError
    : methodCode && !["GCASH", "BPI"].includes(methodCode)
    ? "No online payment required for this method."
    : "Payment instructions unavailable. Contact admin.";
  const shippingDetails = React.useMemo(
    () => parseJsonMaybe(order?.shipping_details) ?? {},
    [order?.shipping_details]
  );
  const shippingDetailsText = React.useMemo(
    () => JSON.stringify(shippingDetails ?? {}, null, 2),
    [shippingDetails]
  );
  const hasShippingDetails = React.useMemo(
    () => Object.keys(shippingDetails ?? {}).length > 0,
    [shippingDetails]
  );
  const canCancel = React.useMemo(() => {
    const status = String(order?.status ?? "");
    return Boolean(
      order &&
        order.payment_status !== "PAID" &&
        [
          "PENDING_PAYMENT",
          "PENDING_APPROVAL",
          "AWAITING_PAYMENT",
          "PAYMENT_SUBMITTED",
          "PAYMENT_REVIEW",
        ].includes(status)
    );
  }, [order]);
  const shippingSections = React.useMemo(
    () => buildShippingSections(order, shippingDetails),
    [order, shippingDetails]
  );

  React.useEffect(() => {
    if (!order || cancelledReason !== "SOLD_OUT") return;
    if (!soldOutVariantIds.length) return;
    let mounted = true;

    (async () => {
      setSuggestionsLoading(true);
      const { data, error } = await supabase.rpc("fn_suggest_similar_products", {
        p_variant_ids: soldOutVariantIds,
        p_limit: 6,
      });

      if (!mounted) return;
      if (error) console.error(error);
      setSuggestions((data as any[]) ?? []);
      setSuggestionsLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [order?.id, cancelledReason, JSON.stringify(soldOutVariantIds)]);

  async function onPickReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !order) return;

    setMsg(null);
    setUploading(true);
    try {
      const url = await uploadReceipt(file, order.id);

      const { error } = await supabase.rpc("fn_buyer_submit_receipt", {
        p_order_id: order.id,
        p_receipt_url: url,
      });

      if (error) throw error;

      setMsg("Receipt uploaded. Waiting for cashier/admin approval.");
      // NOTE: useOrder hook will refresh on navigation; simplest is reload page
      window.location.reload();
    } catch (err: any) {
      setMsg(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function onConfirmReceived() {
    if (!order) return;
    setShippingMsg(null);
    setConfirming(true);
    try {
      const { error } = await supabase.rpc("fn_confirm_received_customer", {
        p_order_id: order.id,
      });
      if (error) throw error;
      window.location.reload();
    } catch (err: any) {
      setShippingMsg(err?.message ?? "Failed to confirm receipt.");
    } finally {
      setConfirming(false);
    }
  }

  async function onReorderRemaining() {
    if (!order) return;
    setReorderMsg(null);
    setReorderLoading(true);
    try {
      const { error } = await supabase.rpc("fn_customer_reorder_remaining", {
        p_order_id: order.id,
      });
      if (error) throw error;
      router.push("/cart");
    } catch (err: any) {
      setReorderMsg(err?.message ?? "Failed to reorder items.");
    } finally {
      setReorderLoading(false);
    }
  }

  async function onCopy(text: string, label: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg(`${label} copied.`);
    } catch (err) {
      console.error(err);
      setCopyMsg("Copy failed. Please select and copy manually.");
    }
  }

  async function onDownloadQr(url: string, label: string) {
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${label || "qr-code"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      console.error(err);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function onCancelOrder() {
    if (!order || !canCancel) return;
    const confirmed = window.confirm(
      "Cancel this order? This cannot be undone."
    );
    if (!confirmed) return;
    setCancelMsg(null);
    setCanceling(true);
    try {
      const { error } = await supabase.rpc(
        "fn_customer_cancel_pending_order",
        {
          p_order_id: order.id,
        }
      );
      if (error) throw error;
      window.location.reload();
    } catch (err: any) {
      setCancelMsg(err?.message ?? "Failed to cancel order.");
    } finally {
      setCanceling(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      {loading ? (
        <div className="text-white/60">Loading...</div>
      ) : !order ? (
        <div className="text-white/60">Order not found.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <button
                type="button"
                onClick={() => router.back()}
                className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-bg-900/40 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <h1 className="text-2xl font-semibold">
                Order #{order.id.slice(0, 8)}
              </h1>
              <div className="text-sm text-white/60">
                Status: {formatStatusLabel(order.status)} | Payment: {formatStatusLabel(order.payment_status)} {order.payment_method ? `(${order.payment_method})` : ""}
              </div>
            </div>

            {badges.length ? (
              <div className="flex flex-wrap gap-2 text-xs">
                {badges.map((badge, index) => (
                  <Badge
                    key={`${badge.label}-${index}`}
                    className={badgeToneClass(badge.tone)}
                  >
                    {badge.label}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          {/* Status banner */}
          <Card>
            <CardHeader>
              <div className="font-semibold">Payment instructions</div>
            </CardHeader>
            <CardBody className="space-y-3 text-sm text-white/70">
              {order.status === "PENDING_APPROVAL" ? (
                <div className="panel p-3">
                  Your order is waiting for admin/cashier approval. Once
                  approved, items will be reserved and you will have 12 hours to
                  pay.
                </div>
              ) : null}

              {order.status === "AWAITING_PAYMENT" ? (
                <div className="panel border-yellow-500/30 bg-yellow-500/10 p-3">
                  {showTimer ? (
                    <div className="text-yellow-100">
                      Pay within:{" "}
                      <span className="font-semibold">
                        {fmtCountdown(left!)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-yellow-100">
                      Payment window is active.
                    </div>
                  )}
                  <div className="mt-2 text-white/70">
                    Pay via <b>{order.payment_method}</b> then upload your
                    receipt below. See payment instructions under this panel.
                    After upload, timer pauses while staff reviews.
                  </div>
                </div>
              ) : null}

              {showPaymentDetails ? (
                <div className="panel p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-white/90">
                      How to pay
                    </div>
                    {paymentMethod?.label || order.payment_method ? (
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/60">
                        {paymentMethod?.label || order.payment_method}
                      </span>
                    ) : null}
                  </div>
                  {copyMsg ? (
                    <div className="text-[11px] text-white/50">{copyMsg}</div>
                  ) : null}
                  {paymentMethodLoading ? (
                    <div className="text-white/60">
                      Loading payment instructions...
                    </div>
                  ) : paymentMethod ? (
                    <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                      <div className="space-y-3">
                        <div className="rounded-lg border border-white/10 bg-bg-950/40 p-3 text-sm text-white/70">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-white/50">Account number</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-white/90">
                                {paymentMethod.account_number || "-"}
                              </span>
                              {paymentMethod.account_number ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] text-white/70 hover:text-white"
                                  onClick={() =>
                                    onCopy(
                                      paymentMethod.account_number!,
                                      "Account number"
                                    )
                                  }
                                >
                                  Copy
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <span className="text-white/50">Account name</span>
                            <span className="text-white/90">
                              {paymentMethod.account_name || "-"}
                            </span>
                          </div>
                        </div>
                        {paymentMethod.instructions ? (
                          <div className="rounded-lg border border-white/10 bg-bg-950/40 p-3 text-xs text-white/60 whitespace-pre-wrap">
                            {paymentMethod.instructions}
                          </div>
                        ) : null}
                      </div>
                      {paymentMethod.qr_image_url ? (
                        <div className="rounded-lg border border-white/10 bg-bg-950/40 p-3">
                          <div className="text-xs text-white/50">QR code</div>
                          <a
                            href={paymentMethod.qr_image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={paymentMethod.qr_image_url}
                              alt={`${paymentMethod.label || methodCode} QR`}
                              className="h-32 w-32 rounded-lg bg-white object-contain"
                            />
                          </a>
                          <div className="mt-2 flex items-center justify-between text-xs text-white/50">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[11px] text-white/70 hover:text-white"
                              onClick={() =>
                                onDownloadQr(
                                  paymentMethod.qr_image_url!,
                                  paymentMethod.method || methodCode || "qr-code"
                                )
                              }
                            >
                              Save QR
                            </Button>
                            <span>Open to enlarge</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-white/60">{fallbackMessage}</div>
                  )}

                  {canUploadReceipt ? (
                    <div className="border-t border-white/10 pt-3 space-y-2">
                      <div className="font-semibold text-white/80">
                        {order.receipt_url
                          ? "Replace receipt"
                          : "Upload receipt"}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={onPickReceipt}
                        disabled={uploading}
                      />
                      <div className="text-xs text-white/60">
                        {uploading
                          ? "Uploading..."
                          : order.receipt_url
                          ? "Upload a new image to replace the current receipt."
                          : "PNG/JPG supported."}
                      </div>
                    </div>
                  ) : null}
                  {order.receipt_url ? (
                    <div className="border-t border-white/10 pt-3 space-y-2">
                      <div className="font-semibold text-white/80">Receipt</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={order.receipt_url}
                        alt="receipt"
                        className="w-full max-h-[420px] object-contain rounded-lg bg-neutral-50"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {order.status === "PAYMENT_SUBMITTED" ? (
                <div className="panel p-3">
                  Receipt submitted. Waiting for cashier/admin approval.
                </div>
              ) : null}

              {order.status === "CANCELLED" ? (
                <div className="panel border-red-500/30 bg-red-500/10 p-3 text-red-700 dark:text-red-100">
                  {cancelledReason === "SOLD_OUT" ? (
                    <div className="space-y-2">
                      <div className="font-semibold text-red-800 dark:text-red-100">Sold out update</div>
                      <div className="text-xs text-red-700/90 dark:text-red-100/90">
                        Sorry about this. The item was approved for an earlier order
                        before we could process yours, so it became unavailable.
                        {hasRemainingItems
                          ? " Any remaining in-stock items were automatically returned to your cart."
                          : " Any remaining items were already out of stock."}
                      </div>
                      <div className="text-xs text-red-700/70 dark:text-red-100/70">
                        We're improving our system to help prevent this in the future.
                        Thank you for your understanding.
                      </div>
                    </div>
                  ) : cancelledReason === "PAYMENT_TIMEOUT" ? (
                    "Order expired due to non-payment. Items returned to inventory."
                  ) : (
                    "Order cancelled."
                  )}
                </div>
              ) : null}

              {order.status === "VOIDED" ? (
                <div className="panel border-red-500/30 bg-red-500/10 p-3 text-red-700 dark:text-red-100">
                  Order voided by staff.
                </div>
              ) : null}

              {msg ? <div className="text-red-200">{msg}</div> : null}

              {canCancel ? (
                <div className="panel border-red-500/20 bg-red-500/5 p-3 space-y-2">
                  <div className="text-sm font-semibold text-red-700 dark:text-red-100">
                    Cancel order
                  </div>
                  <div className="text-xs text-red-700/70 dark:text-red-100/70">
                    Only unpaid pending orders can be cancelled.
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={onCancelOrder}
                    disabled={canceling}
                  >
                    {canceling ? "Cancelling..." : "Cancel order"}
                  </Button>
                  {cancelMsg ? (
                    <div className="text-xs text-red-200/80">{cancelMsg}</div>
                  ) : null}
                </div>
              ) : null}

              {order.status === "CANCELLED" && cancelledReason === "SOLD_OUT" ? (
                <div className="panel p-3 space-y-2">
                  <div className="font-semibold text-white/80">Next steps</div>
                  <div className="text-xs text-white/60">
                    {hasRemainingItems
                      ? "Remaining in-stock items were added to your cart."
                      : "No remaining items were available to return to your cart."}
                  </div>
                  <Button onClick={() => router.push("/cart")}>Go to cart</Button>
                </div>
              ) : null}

              {order.status === "CANCELLED" &&
              cancelledReason === "PAYMENT_TIMEOUT" ? (
                <div className="panel p-3 space-y-2">
                  <div className="font-semibold text-white/80">Next steps</div>
                  <Button onClick={onReorderRemaining} disabled={reorderLoading}>
                    {reorderLoading ? "Reordering..." : "Reorder items"}
                  </Button>
                  {reorderMsg ? (
                    <div className="text-xs text-red-200">{reorderMsg}</div>
                  ) : null}
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="font-semibold">Items</div>
            </CardHeader>
            <CardBody className="space-y-3">
              {items.map((it) => {
                const soldOut =
                  String(it?.cancel_reason ?? "") === "SOLD_OUT" ||
                  Boolean(it?.is_cancelled);
                const qty = Number(it?.qty ?? 0);
                const unitPrice = Number(
                  it?.price_each ?? it?.price ?? it?.unit_price ?? 0
                );
                const storedTotal = Number(it?.line_total ?? 0);
                const lineTotal =
                  Number.isFinite(storedTotal) && storedTotal > 0
                    ? storedTotal
                    : qty * unitPrice;
                const productFromVariant = it?.product_variant?.product ?? null;
                const title =
                  it?.item_name ??
                  it?.product_title ??
                  productFromVariant?.title ??
                  it?.product?.title ??
                  it?.item_id ??
                  "Item";
                const image =
                  (Array.isArray(productFromVariant?.image_urls) &&
                  productFromVariant.image_urls.length
                    ? productFromVariant.image_urls[0]
                    : null) ||
                  (Array.isArray(it?.product?.image_urls) &&
                  it.product.image_urls.length
                    ? it.product.image_urls[0]
                    : null);

                return (
                  <div
                    key={it.id}
                    className="flex items-start justify-between gap-3 border-b border-white/10 pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0 flex items-start gap-3">
                      <div className="h-12 w-12 rounded-lg border border-white/10 bg-bg-800/60 overflow-hidden flex-shrink-0">
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={image}
                            alt=""
                            className="h-full w-full object-contain bg-neutral-50"
                          />
                        ) : (
                          <div className="h-full w-full grid place-items-center text-[10px] text-white/40">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          <span>{title}</span>
                        </div>
                        <div className="text-xs text-white/60">
                          {formatConditionLabel(it.condition, { upper: true })} x {qty}
                        </div>
                        {(() => {
                          const noteValue = String(
                            it.public_notes ?? it.issue_notes ?? ""
                          ).trim();
                          if (!noteValue) return null;
                          const noteTone =
                            String(it.condition) === "with_issues"
                              ? "text-red-200/80"
                              : String(it.condition) === "near_mint"
                                ? "text-amber-200/80"
                                : "text-white/70";
                          const indicatorTone =
                            String(it.condition) === "with_issues"
                              ? "bg-red-400"
                              : String(it.condition) === "near_mint"
                                ? "bg-amber-400"
                                : "";
                          const showIndicator = indicatorTone.length > 0;
                          return (
                            <div className={`text-xs ${noteTone} flex items-center gap-2 truncate`}>
                              {showIndicator ? (
                                <span
                                  className={`h-2 w-2 rounded-full ${indicatorTone}`}
                                  aria-hidden="true"
                                />
                              ) : null}
                              <span>Notes: {noteValue}</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="text-sm text-white/80">
                      {soldOut ? (
                        <span className="font-semibold text-price">Sold out</span>
                      ) : (
                        formatPHP(Number.isFinite(lineTotal) ? lineTotal : 0)
                      )}
                    </div>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          {cancelledReason === "SOLD_OUT" ? (
            <Card>
              <CardHeader>
                <div className="font-semibold">Similar items you may like</div>
              </CardHeader>
              <CardBody className="space-y-3">
                {suggestionsLoading ? (
                  <div className="text-white/60">Loading suggestions...</div>
                ) : suggestions.length === 0 ? (
                  <div className="text-white/60">No similar items available.</div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {suggestions.map((s) => {
                      const img = Array.isArray(s.image_urls)
                        ? s.image_urls[0]
                        : null;
                      return (
                        <Link
                          key={`${s.product_id}-${s.variant_id}`}
                          href={`/product/${s.product_id}`}
                          className="panel p-3 transition hover:border-white/20 hover:bg-paper/10 hover:shadow-glow"
                        >
                          <div className="flex gap-3">
                            <div className="h-12 w-12 rounded-lg bg-bg-800 border border-white/10 overflow-hidden flex-shrink-0">
                              {img ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={img}
                                  alt={s.title}
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {s.title}
                              </div>
                              <div className="text-xs text-white/60">
                                {s.brand ?? "-"}
                                {s.model ? ` ƒ?› ${s.model}` : ""}
                              </div>
                              <div className="text-xs text-price mt-1">
                                {formatPHP(Number(s.price ?? 0))}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div className="font-semibold">Fees</div>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatPHP(Number(order.subtotal))} />
              {Number(order.shipping_fee ?? 0) > 0 ? (
                <Row
                  label="Shipping fee"
                  value={formatPHP(Number(order.shipping_fee ?? 0))}
                />
              ) : null}
              {Number(order.shipping_discount ?? 0) > 0 ? (
                <Row
                  label="Shipping discount"
                  value={`-${formatPHP(Number(order.shipping_discount ?? 0))}`}
                />
              ) : null}
              {Number(order.cop_fee ?? 0) > 0 ? (
                <Row
                  label="COP fee"
                  value={formatPHP(Number(order.cop_fee ?? 0))}
                />
              ) : null}
              {String(order.shipping_method ?? "").toUpperCase() ===
              "LALAMOVE" && Number(order.lalamove_fee ?? 0) > 0 ? (
                <Row
                  label="Lalamove fee"
                  value={formatPHP(Number(order.lalamove_fee ?? 0))}
                />
              ) : null}
              {Number(order.priority_fee ?? 0) > 0 ? (
                <Row
                  label="Priority fee"
                  value={formatPHP(Number(order.priority_fee ?? 0))}
                />
              ) : null}
              {Number(order.insurance_fee ?? 0) > 0 ? (
                <Row
                  label="Insurance fee"
                  value={formatPHP(Number(order.insurance_fee ?? 0))}
                />
              ) : null}
              <div className="border-t border-white/10 pt-2 flex items-center justify-between">
                <div className="font-semibold">Total</div>
                <div className="text-price">{formatPHP(Number(order.total))}</div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="font-semibold">Shipping</div>
            </CardHeader>
            <CardBody className="space-y-3 text-sm text-white/70">
              <div className="grid gap-2 sm:grid-cols-2">
                <Row
                  label="Shipping method"
                  value={formatShippingMethodLabel(order.shipping_method)}
                />
                {order.shipping_region ? (
                  <Row
                    label="Region"
                    value={formatStatusLabel(order.shipping_region)}
                  />
                ) : null}
                {order.courier ? (
                  <Row label="Courier" value={String(order.courier)} />
                ) : null}
                {order.tracking_number ? (
                  <Row
                    label="Tracking number"
                    value={String(order.tracking_number)}
                  />
                ) : null}
                {isPaid && shippingStatus ? (
                  <Row
                    label="Status"
                    value={formatStatusLabel(shippingStatus)}
                  />
                ) : null}
              </div>
              {!isPaid || !shippingStatus ? (
                <div className="panel-muted p-3 text-xs text-white/60">
                  Shipping status appears after payment is confirmed.
                </div>
              ) : null}
              {order.priority_requested ? (
                <div className="panel p-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="text-white/70">Priority</div>
                    <span
                      className={
                        order.priority_approved
                          ? "text-accent-700 dark:text-accent-200"
                          : "text-yellow-700 dark:text-yellow-200"
                      }
                    >
                      {order.priority_approved ? "Approved" : "Pending approval"}
                    </span>
                  </div>
                </div>
              ) : null}
              {shippingSections.length ? (
                <div className="space-y-3">
                  {shippingSections.map((section) => (
                    <div key={section.title} className="panel p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                        {section.title}
                      </div>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        {section.items.map((item) => (
                          <DetailItem
                            key={`${section.title}-${item.label}`}
                            label={item.label}
                            value={item.value}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : hasShippingDetails ? (
                <div className="panel-muted p-3 text-xs text-white/60">
                  Shipping details available, but could not be formatted.
                </div>
              ) : (
                <div className="panel-muted p-3 text-xs text-white/60">
                  No shipping details available.
                </div>
              )}
              {shippingStatus === "SHIPPED" ? (
                <Button onClick={onConfirmReceived} disabled={confirming}>
                  Confirm received
                </Button>
              ) : null}
              {shippingMsg ? (
                <div className="text-sm text-red-200">{shippingMsg}</div>
              ) : null}
            </CardBody>
          </Card>

          {isPlatinumTier(tier as any) ? (
            <Card>
              <CardHeader>
                <div className="font-semibold">Tracking timeline</div>
              </CardHeader>
              <CardBody className="space-y-3 text-sm text-white/70">
                {eventsLoading ? (
                  <div className="text-white/60">Loading timeline...</div>
                ) : events.length === 0 ? (
                  <div className="text-white/60">No tracking events yet.</div>
                ) : (
                  <div className="space-y-3">
                    {events.map((event) => {
                      const label = formatStatusLabel(event.event_type);
                      const when = event.created_at
                        ? new Date(event.created_at).toLocaleString("en-PH", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "-";
                      return (
                        <div
                          key={event.id}
                          className="rounded-xl border border-white/10 bg-bg-900/30 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold text-white/90">{label}</div>
                            <div className="text-xs text-white/50">{when}</div>
                          </div>
                          {event.message ? (
                            <div className="mt-1 text-xs text-white/60">
                              {event.message}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </Card>
          ) : null}
        </>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-white/60">{label}</div>
      <div className="text-right text-white/90">{value}</div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-bg-950/40 p-3">
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-1 text-sm text-white/90 break-words">{value}</div>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <RequireAuth>
      <OrderDetailContent />
    </RequireAuth>
  );
}




