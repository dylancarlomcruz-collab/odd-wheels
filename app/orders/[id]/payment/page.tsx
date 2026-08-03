"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useOrder } from "@/hooks/useOrders";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatPHP } from "@/lib/money";
import { formatConditionLabel } from "@/lib/conditions";
import { formatStatusLabel } from "@/lib/orderBadges";
import { fetchAuthedJson, fetchJson } from "@/lib/api/client";
import {
  buildOrderDetailHref,
  buildOrderPaymentHref,
} from "@/lib/orders";
import { saveGuestOrderAccess } from "@/lib/guestOrderAccess";

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

async function uploadReceipt(file: File, orderId: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("productId", `receipt-${orderId}`);

  const res = await fetch("/api/images/upload", { method: "POST", body: fd });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok || !json?.publicUrl) {
    throw new Error(json?.error || "Upload failed");
  }
  return json.publicUrl as string;
}

function OrderPaymentContent({
  guestAccessToken = null,
}: {
  guestAccessToken?: string | null;
}) {
  const params = useParams<{ id: string }>();
  const id = String(params.id ?? "").trim();
  const isGuestView = Boolean(guestAccessToken);
  const { order, items, loading } = useOrder(id, { guestAccessToken });

  const [tick, setTick] = React.useState(0);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod | null>(
    null
  );
  const [paymentMethodLoading, setPaymentMethodLoading] = React.useState(false);
  const [paymentMethodError, setPaymentMethodError] = React.useState<string | null>(
    null
  );
  const [uploading, setUploading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [copyMsg, setCopyMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isGuestView || !order?.id || !guestAccessToken) return;
    saveGuestOrderAccess(String(order.id), String(guestAccessToken));
  }, [guestAccessToken, isGuestView, order?.id]);

  const status = String(order?.status ?? "").trim().toUpperCase();
  const paymentStatus = String(order?.payment_status ?? "").trim().toUpperCase();
  const deadline =
    order?.expires_at ?? order?.payment_deadline ?? order?.reserved_expires_at ?? null;
  const left = React.useMemo(() => msLeft(deadline), [deadline, tick]);
  const showTimer =
    status === "AWAITING_PAYMENT" && !order?.payment_hold && left !== null;
  const isPendingApproval =
    status === "PENDING_APPROVAL" ||
    status === "PENDING_STAFF_APPROVAL" ||
    status === "PENDING";
  const canUploadReceipt =
    paymentStatus !== "PAID" &&
    ["AWAITING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_REVIEW"].includes(status);
  const methodCode = String(order?.payment_method ?? "").trim().toUpperCase();
  const orderHref = buildOrderDetailHref(id, { accessToken: guestAccessToken });
  const paymentHref = buildOrderPaymentHref(id, { accessToken: guestAccessToken });

  React.useEffect(() => {
    if (!(status === "AWAITING_PAYMENT" && !order?.payment_hold && deadline)) {
      return;
    }
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [deadline, order?.payment_hold, status]);

  React.useEffect(() => {
    let mounted = true;

    async function run() {
      if (!id || !order || paymentStatus === "PAID" || !methodCode) {
        setPaymentMethod(null);
        setPaymentMethodError(null);
        setPaymentMethodLoading(false);
        return;
      }

      setPaymentMethodLoading(true);
      setPaymentMethodError(null);
      try {
        const path = `/api/orders/${encodeURIComponent(
          id
        )}/payment-details${isGuestView ? `?access=${encodeURIComponent(String(guestAccessToken ?? ""))}` : ""}`;
        const payload = isGuestView
          ? await fetchJson<{ ok: true; paymentMethod: PaymentMethod | null }>(path)
          : await fetchAuthedJson<{
              ok: true;
              paymentMethod: PaymentMethod | null;
            }>(path);
        if (!mounted) return;
        setPaymentMethod(payload.paymentMethod ?? null);
        if (!payload.paymentMethod && ["GCASH", "BPI"].includes(methodCode)) {
          setPaymentMethodError(
            "Payment instructions are unavailable right now. Please contact admin."
          );
        }
      } catch (error: any) {
        if (!mounted) return;
        setPaymentMethod(null);
        setPaymentMethodError(
          error?.message ??
            "Payment instructions are unavailable right now. Please contact admin."
        );
      } finally {
        if (!mounted) return;
        setPaymentMethodLoading(false);
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [guestAccessToken, id, isGuestView, methodCode, order, paymentStatus]);

  async function onPickReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !order) return;

    setMsg(null);
    setUploading(true);
    try {
      const url = await uploadReceipt(file, order.id);
      const path = `/api/orders/${encodeURIComponent(
        order.id
      )}/receipt${isGuestView ? `?access=${encodeURIComponent(String(guestAccessToken ?? ""))}` : ""}`;

      if (isGuestView) {
        await fetchJson(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiptUrl: url }),
        });
      } else {
        await fetchAuthedJson(path, {
          method: "POST",
          body: JSON.stringify({ receiptUrl: url }),
        });
      }

      setMsg("Receipt uploaded. Waiting for cashier/admin approval.");
      window.location.assign(paymentHref);
    } catch (error: any) {
      setMsg(error?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function onCopy(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyMsg(`${label} copied.`);
    } catch {
      setCopyMsg("Copy failed. Please copy it manually.");
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="text-white/60">Loading payment page...</div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="text-white/60">Order not found.</div>
      </main>
    );
  }

  const fallbackMessage = paymentMethodError
    ? paymentMethodError
    : methodCode && !["GCASH", "BPI"].includes(methodCode)
    ? "No online payment instructions are required for this method."
    : "Payment instructions are unavailable right now. Please contact admin.";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={orderHref}
            className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-bg-900/40 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            View full order
          </Link>
          <h1 className="text-2xl font-semibold">Payment</h1>
          <div className="text-sm text-white/60">
            Order #{String(order.id ?? "").slice(0, 8)} | Status:{" "}
            {formatStatusLabel(order.status)} | Payment:{" "}
            {formatStatusLabel(order.payment_status)}
          </div>
        </div>
        <div className="text-right text-sm text-white/60">
          <div>Amount due</div>
          <div className="text-2xl font-semibold text-white">
            {formatPHP(Number(order.total ?? 0))}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="font-semibold">Payment status</div>
        </CardHeader>
        <CardBody className="space-y-3 text-sm text-white/70">
          {isPendingApproval ? (
            <div className="rounded-2xl border border-white/10 bg-bg-950/40 p-4">
              <div className="font-semibold text-white">Order submitted</div>
              <div className="mt-1">
                Your order is waiting for staff approval before receipt upload opens.
                You can already review the payment details below.
              </div>
            </div>
          ) : null}

          {status === "AWAITING_PAYMENT" ? (
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4">
              <div className="font-semibold text-yellow-100">
                {showTimer ? `Pay within ${fmtCountdown(left!)}` : "Payment window is active."}
              </div>
              <div className="mt-1 text-white/70">
                Send payment using the details below, then upload your receipt on this
                page.
              </div>
            </div>
          ) : null}

          {status === "PAYMENT_SUBMITTED" || status === "PAYMENT_REVIEW" ? (
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4">
              <div className="font-semibold text-sky-100">
                Receipt submitted
              </div>
              <div className="mt-1 text-white/70">
                Staff is reviewing your payment. You can replace the receipt below if
                needed.
              </div>
            </div>
          ) : null}

          {paymentStatus === "PAID" ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="font-semibold text-emerald-100">Payment confirmed</div>
              <div className="mt-1 text-white/70">
                This order is already marked as paid.
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">How to pay</div>
              {paymentMethod?.label || order.payment_method ? (
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/60">
                  {paymentMethod?.label || order.payment_method}
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardBody className="space-y-4 text-sm text-white/70">
            {copyMsg ? <div className="text-[11px] text-white/50">{copyMsg}</div> : null}
            {paymentMethodLoading ? (
              <div className="text-white/60">Loading payment instructions...</div>
            ) : paymentMethod ? (
              <>
                <div className="rounded-2xl border border-white/10 bg-bg-950/40 p-4">
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
                            onCopy(paymentMethod.account_number!, "Account number")
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
                  <div className="rounded-2xl border border-white/10 bg-bg-950/40 p-4 text-xs whitespace-pre-wrap">
                    {paymentMethod.instructions}
                  </div>
                ) : null}
                {paymentMethod.qr_image_url ? (
                  <div className="rounded-2xl border border-white/10 bg-bg-950/40 p-4">
                    <div className="text-xs text-white/50">QR code</div>
                    <a
                      href={paymentMethod.qr_image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={paymentMethod.qr_image_url}
                        alt={`${paymentMethod.label || methodCode} QR`}
                        className="h-40 w-40 rounded-xl bg-white object-contain"
                      />
                    </a>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-bg-950/40 p-4">
                {fallbackMessage}
              </div>
            )}

            {canUploadReceipt ? (
              <div className="rounded-2xl border border-white/10 bg-bg-950/40 p-4 space-y-3">
                <div className="font-semibold text-white">
                  {order.receipt_url ? "Replace receipt" : "Upload receipt"}
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
                    : "PNG and JPG are supported."}
                </div>
              </div>
            ) : isPendingApproval ? (
              <div className="rounded-2xl border border-white/10 bg-bg-950/40 p-4 text-xs text-white/60">
                Receipt upload will unlock after staff approval.
              </div>
            ) : null}

            {msg ? <div className="text-sm text-white/80">{msg}</div> : null}

            {order.receipt_url ? (
              <div className="rounded-2xl border border-white/10 bg-bg-950/40 p-4 space-y-3">
                <div className="font-semibold text-white/90">Current receipt</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={order.receipt_url}
                  alt="receipt"
                  className="w-full max-h-[420px] rounded-xl bg-neutral-50 object-contain"
                />
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="font-semibold">Order summary</div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="space-y-3">
              {(items ?? []).map((item: any, index: number) => {
                const title =
                  item?.item_name ||
                  item?.product_title ||
                  item?.product_variant?.product?.title ||
                  "Item";
                const condition = String(
                  item?.condition ?? item?.product_variant?.condition ?? ""
                ).trim();
                const qty = Number(item?.qty ?? 0);
                const lineTotal = Number(
                  item?.line_total ?? item?.unit_price ?? item?.price_each ?? 0
                );
                const imageUrl =
                  item?.image_url ||
                  item?.product_variant?.product?.image_urls?.[0] ||
                  null;

                return (
                  <div
                    key={`${item?.id ?? item?.variant_id ?? index}`}
                    className="flex gap-3 rounded-2xl border border-white/10 bg-bg-950/40 p-3"
                  >
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={title}
                        className="h-16 w-16 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-xl bg-white/5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm font-semibold text-white">
                        {title}
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        {condition ? formatConditionLabel(condition) : "Condition unavailable"}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-white/60">
                        <span>Qty {qty}</span>
                        <span>{formatPHP(lineTotal)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-white/10 bg-bg-950/40 p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between text-white/60">
                <span>Subtotal</span>
                <span>{formatPHP(Number(order.subtotal ?? 0))}</span>
              </div>
              <div className="flex items-center justify-between text-white/60">
                <span>Shipping</span>
                <span>{formatPHP(Number(order.shipping_fee ?? 0))}</span>
              </div>
              <div className="flex items-center justify-between text-white font-semibold">
                <span>Total</span>
                <span>{formatPHP(Number(order.total ?? 0))}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={orderHref}
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-white/10 bg-transparent px-4 text-sm font-medium tracking-[-0.01em] text-white/86 transition duration-150 hover:bg-white/[0.05] hover:text-white"
              >
                View full order
              </Link>
              <Link
                href="/orders"
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-accent-300/20 bg-[linear-gradient(180deg,rgba(229,120,51,0.96),rgba(195,91,31,0.98))] px-4 text-sm font-medium tracking-[-0.01em] text-white shadow-[0_14px_34px_rgba(217,106,43,0.22)] transition duration-150 hover:brightness-[1.05]"
              >
                All orders
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}

export default function OrderPaymentPage() {
  const searchParams = useSearchParams();
  const guestAccessToken = searchParams.get("access");

  if (guestAccessToken) {
    return <OrderPaymentContent guestAccessToken={guestAccessToken} />;
  }

  return (
    <RequireAuth>
      <OrderPaymentContent />
    </RequireAuth>
  );
}
