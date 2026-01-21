"use client";

import Link from "next/link";
import * as React from "react";
import {
  BadgeCheck,
  ClipboardList,
  CreditCard,
  RefreshCw,
  ScanLine,
  Truck,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAllOrders } from "@/hooks/useAllOrders";

function normalizeShippingStatus(raw: string | null | undefined) {
  const status = String(raw ?? "").trim().toUpperCase();
  if (!status || status === "NONE") return "PREPARING_TO_SHIP";
  if (status === "PREPARING") return "PREPARING_TO_SHIP";
  if (status === "TO_SHIP" || status === "PENDING_SHIPMENT") return "PREPARING_TO_SHIP";
  return status;
}

function isCancelled(status: string) {
  return status === "CANCELLED" || status === "VOIDED";
}

export default function CashierDashboardPage() {
  const { orders, loading, reload } = useAllOrders();

  const counts = React.useMemo(() => {
    const pendingApproval = orders.filter((o) => o.status === "PENDING_APPROVAL").length;
    const paymentSubmitted = orders.filter((o) => o.status === "PAYMENT_SUBMITTED").length;
    const awaitingPayment = orders.filter((o) => o.status === "AWAITING_PAYMENT").length;
    const pendingShipping = orders.filter((o) => {
      if (o.payment_status !== "PAID") return false;
      if (isCancelled(String(o.status ?? "").toUpperCase())) return false;
      return normalizeShippingStatus(o.shipping_status) === "PREPARING_TO_SHIP";
    }).length;
    return { pendingApproval, paymentSubmitted, awaitingPayment, pendingShipping };
  }, [orders]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Cashier Dashboard</div>
            <div className="text-sm text-white/60">
              Quick queue summary for approvals, payments, and shipping.
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={reload}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Link
              href="/cashier/orders"
              className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 transition hover:border-amber-500/40"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Pending approval</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
                  <ClipboardList className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-amber-200">
                {counts.pendingApproval}
              </div>
              <div className="text-xs text-white/50">Review orders</div>
            </Link>

            <Link
              href="/cashier/orders"
              className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 transition hover:border-sky-500/40"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Receipt submitted</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-200">
                  <BadgeCheck className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-sky-200">
                {counts.paymentSubmitted}
              </div>
              <div className="text-xs text-white/50">Verify payments</div>
            </Link>

            <Link
              href="/cashier/orders"
              className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 transition hover:border-violet-500/40"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Awaiting payment</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-200">
                  <CreditCard className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-violet-200">
                {counts.awaitingPayment}
              </div>
              <div className="text-xs text-white/50">Follow up</div>
            </Link>

            <Link
              href="/cashier/shipments"
              className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 transition hover:border-indigo-500/40"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Pending shipping</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-200">
                  <Truck className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-indigo-200">
                {counts.pendingShipping}
              </div>
              <div className="text-xs text-white/50">Add tracking</div>
            </Link>
          </div>

          <div>
            <div className="text-sm font-semibold text-white/80">Quick actions</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/cashier/pos"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-900/40 px-4 py-2 text-sm text-white/90 transition hover:bg-bg-900/60"
              >
                <ScanLine className="h-4 w-4" />
                POS checkout
              </Link>
              <Link
                href="/cashier/orders"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-900/40 px-4 py-2 text-sm text-white/90 transition hover:bg-bg-900/60"
              >
                <ClipboardList className="h-4 w-4" />
                Orders & approvals
              </Link>
              <Link
                href="/cashier/shipments"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-900/40 px-4 py-2 text-sm text-white/90 transition hover:bg-bg-900/60"
              >
                <Truck className="h-4 w-4" />
                Shipping status
              </Link>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
