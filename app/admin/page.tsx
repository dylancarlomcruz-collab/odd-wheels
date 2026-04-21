"use client";

import Link from "next/link";
import * as React from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  ClipboardList,
  LayoutGrid,
  PackageSearch,
  PackageX,
  RefreshCw,
  Settings2,
  StickyNote,
  TrendingUp,
  Truck,
  Ticket,
  Users,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { supabase } from "@/lib/supabase/browser";

const PREPARING_SHIPPING_STATUSES = [
  "PREPARING",
  "PREPARING_TO_SHIP",
  "PREPARING TO SHIP",
  "TO_SHIP",
  "PENDING_SHIPMENT",
  "NONE",
];

type GrowthSnapshot = {
  funnelViews: number;
  paidOrders: number;
  viewToPaidRate: number;
  cartToPaidRate: number;
  sellThroughRate: number;
  avgDaysToFirstSale: number;
  soldOutProducts: number;
  soldOutViews: number;
  soldOutCartAdds: number;
  returningRevenueShare: number;
  returningRevenue: number;
  newRevenue: number;
  staleVariants: number;
  staleRetailValue: number;
};

const EMPTY_GROWTH_SNAPSHOT: GrowthSnapshot = {
  funnelViews: 0,
  paidOrders: 0,
  viewToPaidRate: 0,
  cartToPaidRate: 0,
  sellThroughRate: 0,
  avgDaysToFirstSale: 0,
  soldOutProducts: 0,
  soldOutViews: 0,
  soldOutCartAdds: 0,
  returningRevenueShare: 0,
  returningRevenue: 0,
  newRevenue: 0,
  staleVariants: 0,
  staleRetailValue: 0,
};

function peso(value: number) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `PHP ${Math.round(value)}`;
  }
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-PH").format(Math.max(0, Math.round(value)));
}

export default function AdminDashboard() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [growthError, setGrowthError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [counts, setCounts] = React.useState({
    pendingApproval: 0,
    paymentSubmitted: 0,
    awaitingPayment: 0,
    pendingShipping: 0,
    sellTradePending: 0,
    lowStock: 0,
    soldOut: 0,
  });
  const [growthSnapshot, setGrowthSnapshot] =
    React.useState<GrowthSnapshot>(EMPTY_GROWTH_SNAPSHOT);

  const loadCounts = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        pendingApproval,
        paymentSubmitted,
        awaitingPayment,
        sellTrade,
        preparingShipA,
        preparingShipB,
        lowStock,
        soldOut,
      ] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING_APPROVAL"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "PAYMENT_SUBMITTED"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "AWAITING_PAYMENT"),
        supabase
          .from("sell_trade_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("payment_status", "PAID")
          .not("status", "in", "(CANCELLED,VOIDED)")
          .in("shipping_status", PREPARING_SHIPPING_STATUSES),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("payment_status", "PAID")
          .not("status", "in", "(CANCELLED,VOIDED)")
          .is("shipping_status", null),
        supabase
          .from("product_variants")
          .select("id", { count: "exact", head: true })
          .lte("qty", 1)
          .gt("qty", 0),
        supabase
          .from("product_variants")
          .select("id", { count: "exact", head: true })
          .eq("qty", 0),
      ]);

      const firstError =
        pendingApproval.error ||
        paymentSubmitted.error ||
        awaitingPayment.error ||
        sellTrade.error ||
        preparingShipA.error ||
        preparingShipB.error ||
        lowStock.error ||
        soldOut.error;

      if (firstError) throw firstError;

      setCounts({
        pendingApproval: pendingApproval.count ?? 0,
        paymentSubmitted: paymentSubmitted.count ?? 0,
        awaitingPayment: awaitingPayment.count ?? 0,
        pendingShipping:
          (preparingShipA.count ?? 0) + (preparingShipB.count ?? 0),
        sellTradePending: sellTrade.count ?? 0,
        lowStock: lowStock.count ?? 0,
        soldOut: soldOut.count ?? 0,
      });

      try {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const toYmd = (date: Date) => {
          const yyyy = date.getFullYear();
          const mm = String(date.getMonth() + 1).padStart(2, "0");
          const dd = String(date.getDate()).padStart(2, "0");
          return `${yyyy}-${mm}-${dd}`;
        };

        const [analyticsRes, stockHealthRes] = await Promise.all([
          supabase.rpc("fn_admin_growth_analytics", {
            p_from: toYmd(startOfMonth),
            p_to: toYmd(today),
            p_item_limit: 5,
          }),
          supabase.rpc("fn_admin_inventory_stock_health", {
            include_archived: false,
            stale_days: 60,
            recent_sales_days: 30,
            item_limit: 5,
          }),
        ]);

        if (analyticsRes.error) throw analyticsRes.error;
        if (stockHealthRes.error) throw stockHealthRes.error;

        const analytics = analyticsRes.data as any;
        const stockHealth = stockHealthRes.data as any;

        setGrowthSnapshot({
          funnelViews: Number(analytics?.funnel?.views ?? 0) || 0,
          paidOrders: Number(analytics?.funnel?.paid_orders ?? 0) || 0,
          viewToPaidRate: Number(analytics?.funnel?.view_to_paid_rate ?? 0) || 0,
          cartToPaidRate: Number(analytics?.funnel?.cart_to_paid_rate ?? 0) || 0,
          sellThroughRate:
            Number(analytics?.sell_through?.overall_sell_through_rate ?? 0) || 0,
          avgDaysToFirstSale:
            Number(analytics?.sell_through?.avg_days_to_first_sale ?? 0) || 0,
          soldOutProducts: Number(analytics?.out_of_stock?.sold_out_products ?? 0) || 0,
          soldOutViews: Number(analytics?.out_of_stock?.views ?? 0) || 0,
          soldOutCartAdds: Number(analytics?.out_of_stock?.cart_adds ?? 0) || 0,
          returningRevenueShare:
            Number(analytics?.customer_mix?.returning_revenue_share ?? 0) || 0,
          returningRevenue:
            Number(analytics?.customer_mix?.returning_revenue ?? 0) || 0,
          newRevenue: Number(analytics?.customer_mix?.new_revenue ?? 0) || 0,
          staleVariants: Number(stockHealth?.stale_variants ?? 0) || 0,
          staleRetailValue: Number(stockHealth?.stale_retail_value ?? 0) || 0,
        });
        setGrowthError(null);
      } catch (growthErr: any) {
        console.error(growthErr);
        setGrowthSnapshot(EMPTY_GROWTH_SNAPSHOT);
        setGrowthError(growthErr?.message ?? "Failed to load growth snapshot.");
      }

      setLastUpdated(new Date());
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Failed to load dashboard counts.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const updatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <RequireAuth>
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">Admin Dashboard</div>
              <div className="text-sm text-white/60">
                Action queue, inventory health, and quick links.
              </div>
            </div>
            <div className="flex items-center gap-2">
              {updatedLabel ? (
                <div className="text-xs text-white/50">Updated {updatedLabel}</div>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                onClick={loadCounts}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </CardHeader>
          <CardBody className="space-y-6">
            {error ? <div className="text-sm text-red-200">{error}</div> : null}

            <div>
              <div className="text-sm font-semibold text-white/80">Action queue</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Link
                  href="/admin/orders"
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
                  href="/admin/orders"
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
                  href="/admin/orders"
                  className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 transition hover:border-violet-500/40"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                    <span>Awaiting payment</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-200">
                      <ClipboardList className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-violet-200">
                    {counts.awaitingPayment}
                  </div>
                  <div className="text-xs text-white/50">Follow up</div>
                </Link>

                <Link
                  href="/admin/shipments"
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

                <Link
                  href="/admin/sell-trade"
                  className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 transition hover:border-emerald-500/40"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                    <span>Sell / Trade pending</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                      <ArrowLeftRight className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-emerald-200">
                    {counts.sellTradePending}
                  </div>
                  <div className="text-xs text-white/50">Respond to offers</div>
                </Link>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white/80">Growth watchlist</div>
                <Link
                  href="/admin/analytics"
                  className="text-xs text-accent-200 transition hover:text-accent-100"
                >
                  Open analytics
                </Link>
              </div>
              <div className="mt-1 text-xs text-white/50">
                Month-to-date conversion, sourcing, retention, and dead-stock signals.
              </div>
              {growthError ? (
                <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  {growthError}
                </div>
              ) : null}
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Link
                  href="/admin/analytics"
                  className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 transition hover:border-sky-500/40"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                    <span>View to paid</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-200">
                      <TrendingUp className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-sky-200">
                    {formatPercent(growthSnapshot.viewToPaidRate)}
                  </div>
                  <div className="text-xs text-white/50">
                    {formatCount(growthSnapshot.funnelViews)} views •{" "}
                    {formatCount(growthSnapshot.paidOrders)} paid
                  </div>
                </Link>

                <Link
                  href="/admin/analytics"
                  className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 transition hover:border-emerald-500/40"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                    <span>Sell-through</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                      <PackageSearch className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-emerald-200">
                    {formatPercent(growthSnapshot.sellThroughRate)}
                  </div>
                  <div className="text-xs text-white/50">
                    {Math.max(0, Math.round(growthSnapshot.avgDaysToFirstSale))} day avg to first sale
                  </div>
                </Link>

                <Link
                  href="/admin/analytics"
                  className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 transition hover:border-amber-500/40"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                    <span>Sold-out demand</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
                      <PackageX className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-amber-200">
                    {formatCount(growthSnapshot.soldOutProducts)}
                  </div>
                  <div className="text-xs text-white/50">
                    {formatCount(growthSnapshot.soldOutViews)} views •{" "}
                    {formatCount(growthSnapshot.soldOutCartAdds)} cart adds
                  </div>
                </Link>

                <Link
                  href="/admin/analytics"
                  className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 transition hover:border-violet-500/40"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                    <span>Returning revenue</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-200">
                      <Users className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-violet-200">
                    {formatPercent(growthSnapshot.returningRevenueShare)}
                  </div>
                  <div className="text-xs text-white/50">
                    {peso(growthSnapshot.returningRevenue)} repeat •{" "}
                    {peso(growthSnapshot.newRevenue)} new
                  </div>
                </Link>

                <Link
                  href="/admin/analytics"
                  className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 transition hover:border-rose-500/40"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                    <span>Dead stock</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-rose-200">
                    {formatCount(growthSnapshot.staleVariants)}
                  </div>
                  <div className="text-xs text-white/50">
                    {peso(growthSnapshot.staleRetailValue)} tied up
                  </div>
                </Link>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-white/80">Inventory health</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Link
                  href="/admin/inventory/browse"
                  className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 transition hover:border-yellow-500/40"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                    <span>Low stock ({'<=1'})</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-200">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-yellow-200">
                    {counts.lowStock}
                  </div>
                  <div className="text-xs text-white/50">Restock soon</div>
                </Link>

                <Link
                  href="/admin/inventory/browse"
                  className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 transition hover:border-red-500/40"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                    <span>Sold out variants</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-200">
                      <PackageX className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-red-200">
                    {counts.soldOut}
                  </div>
                  <div className="text-xs text-white/50">Update listings</div>
                </Link>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-white/80">Quick actions</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/admin/inventory"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-900/40 px-4 py-2 text-sm text-white/90 transition hover:bg-bg-900/60"
                >
                  <PackageSearch className="h-4 w-4" />
                  Add inventory
                </Link>
                <Link
                  href="/admin/inventory/browse"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-900/40 px-4 py-2 text-sm text-white/90 transition hover:bg-bg-900/60"
                >
                  <LayoutGrid className="h-4 w-4" />
                  Browse products
                </Link>
                <Link
                  href="/admin/orders"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-900/40 px-4 py-2 text-sm text-white/90 transition hover:bg-bg-900/60"
                >
                  <ClipboardList className="h-4 w-4" />
                  Review orders
                </Link>
                <Link
                  href="/admin/shipments"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-900/40 px-4 py-2 text-sm text-white/90 transition hover:bg-bg-900/60"
                >
                  <Truck className="h-4 w-4" />
                  Shipping status
                </Link>
                <Link
                  href="/admin/notices"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-900/40 px-4 py-2 text-sm text-white/90 transition hover:bg-bg-900/60"
                >
                  <StickyNote className="h-4 w-4" />
                  Post notice
                </Link>
                <Link
                  href="/admin/vouchers"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-900/40 px-4 py-2 text-sm text-white/90 transition hover:bg-bg-900/60"
                >
                  <Ticket className="h-4 w-4" />
                  Vouchers
                </Link>
                <Link
                  href="/admin/analytics"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-900/40 px-4 py-2 text-sm text-white/90 transition hover:bg-bg-900/60"
                >
                  <TrendingUp className="h-4 w-4" />
                  Analytics
                </Link>
                <Link
                  href="/admin/settings"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-900/40 px-4 py-2 text-sm text-white/90 transition hover:bg-bg-900/60"
                >
                  <Settings2 className="h-4 w-4" />
                  Settings
                </Link>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </RequireAuth>
  );
}
