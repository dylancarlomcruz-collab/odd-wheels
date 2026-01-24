"use client";

import * as React from "react";
import { CheckCircle2, ChevronRight, Crown, Shield, Sparkles, Star } from "lucide-react";
import { supabase } from "@/lib/supabase/browser";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatPHP } from "@/lib/money";
import {
  getTierFromSpend,
  getTierProgress,
  TIER_PERKS,
  TIER_THRESHOLDS,
  type Tier,
} from "@/lib/tier";
import { type Voucher, type VoucherWallet } from "@/lib/vouchers";

function formatDateShort(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatVoucherStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").toUpperCase();
  if (!normalized) return "UNKNOWN";
  if (normalized === "AVAILABLE") return "AVAILABLE";
  if (normalized === "USED") return "USED";
  if (normalized === "EXPIRED") return "EXPIRED";
  return normalized;
}

const TIER_ICONS: Record<Tier, React.ElementType> = {
  CLASSIC: Star,
  SILVER: Shield,
  GOLD: Crown,
  PLATINUM: Sparkles,
};

const SPEND_CYCLE_SIZE = 10000;
const SPEND_CYCLE_MILESTONES = [
  { at: 2000, label: "FS100" },
  { at: 4000, label: "FS100 + FS200" },
  { at: 6000, label: "FS100" },
  { at: 8000, label: "FS100 + FS200" },
  { at: 10000, label: "FS100 + FS200 + FS300" },
];

type TierPerks = (typeof TIER_PERKS)[Tier];

type VoucherWalletRow = Omit<VoucherWallet, "voucher"> & {
  voucher: Voucher | Voucher[] | null;
};

function tierAccentClass(tier: Tier) {
  if (tier === "PLATINUM") return "border-sky-500/40 bg-sky-500/10 text-sky-100";
  if (tier === "GOLD") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (tier === "SILVER") return "border-white/20 bg-white/10 text-white/90";
  return "border-white/10 bg-bg-900/40 text-white/70";
}

function tierDotClass(tier: Tier) {
  if (tier === "PLATINUM") return "bg-sky-400/80";
  if (tier === "GOLD") return "bg-amber-400/90";
  if (tier === "SILVER") return "bg-white/70";
  return "bg-white/40";
}

function tierProgressBarClass(tier: Tier) {
  if (tier === "PLATINUM") return "bg-sky-400";
  if (tier === "GOLD") return "bg-amber-400";
  if (tier === "SILVER") return "bg-slate-300";
  return "bg-white/30";
}

function getTierDetailRows(perks: TierPerks) {
  return [
    {
      label: "Spend-based shipping vouchers",
      enabled: true,
    },
    {
      label: "Auto-approve checkout",
      enabled: perks.autoApprove,
    },
    {
      label: "Priority shipping",
      enabled: perks.priorityShipping,
    },
    {
      label: "Enhanced tracking",
      enabled: perks.enhancedTracking,
    },
  ];
}

export default function AccountTierPage() {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [tier, setTier] = React.useState<Tier>("CLASSIC");
  const [lifetimeSpend, setLifetimeSpend] = React.useState(0);
  const [voucherWallet, setVoucherWallet] = React.useState<VoucherWallet[]>([]);
  const [voucherLoading, setVoucherLoading] = React.useState(false);
  const [voucherError, setVoucherError] = React.useState<string | null>(null);
  const [showOtherTiers, setShowOtherTiers] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      if (!user) {
        if (mounted) setLoading(false);
        return;
      }

      setLoading(true);
      setProfileError(null);

      const { data, error } = await supabase
        .from("profiles")
        .select("tier,lifetime_spend")
        .eq("id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error(error);
        setProfileError(error.message || "Failed to load tier.");
      }

      const spend = Number((data as any)?.lifetime_spend ?? 0);
      setLifetimeSpend(spend);
      setTier(getTierFromSpend(spend));
      setLoading(false);
    }

    loadProfile();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  React.useEffect(() => {
    let mounted = true;

    async function loadVouchers() {
      if (!user) {
        setVoucherWallet([]);
        setVoucherLoading(false);
        return;
      }

      setVoucherLoading(true);
      setVoucherError(null);

      const { data, error } = await supabase
        .from("voucher_wallet")
        .select(
          "id,status,claimed_at,used_at,expires_at,voucher:vouchers(id,code,title,kind,min_subtotal,shipping_cap,starts_at,expires_at,is_active)"
        )
        .eq("user_id", user.id)
        .order("claimed_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error("Failed to load vouchers:", error);
        setVoucherError(error.message || "Failed to load vouchers.");
        setVoucherWallet([]);
      } else {
        const rows = (data ?? []) as VoucherWalletRow[];
        const normalized = rows
          .map((row) => {
            const voucher = Array.isArray(row.voucher) ? row.voucher[0] : row.voucher;
            if (!voucher) return null;
            return { ...row, voucher } as VoucherWallet;
          })
          .filter((row): row is VoucherWallet => Boolean(row));
        setVoucherWallet(normalized);
      }
      setVoucherLoading(false);
    }

    loadVouchers();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const tierProgress = React.useMemo(
    () => getTierProgress(lifetimeSpend),
    [lifetimeSpend]
  );
  const resolvedTier = (tier || tierProgress.tier) as Tier;
  const tierPerks = TIER_PERKS[resolvedTier];
  const tiers: Tier[] = ["CLASSIC", "SILVER", "GOLD", "PLATINUM"];
  const isTopTier = !tierProgress.nextTier;
  const spendTarget = Math.max(
    1,
    Number(tierProgress.nextMin ?? TIER_THRESHOLDS.PLATINUM)
  );
  const spendProgress = Math.min(1, Math.max(0, lifetimeSpend / spendTarget));
  const progressToPlatinum = Math.min(
    1,
    Math.max(0, lifetimeSpend / Math.max(1, TIER_THRESHOLDS.PLATINUM))
  );
  const nextTierLabel = tierProgress.nextTier
    ? TIER_PERKS[tierProgress.nextTier].label
    : tierPerks.label;
  const progressHeading = isTopTier
    ? "To maintain current tier"
    : `To reach ${nextTierLabel}`;
  const spendCycle = React.useMemo(() => {
    const normalizedSpend = Math.max(0, lifetimeSpend);
    const cycleSpend = normalizedSpend % SPEND_CYCLE_SIZE;
    const cycleComplete = normalizedSpend > 0 && cycleSpend === 0;
    const displaySpend = cycleComplete ? SPEND_CYCLE_SIZE : cycleSpend;
    const progress = Math.min(1, Math.max(0, displaySpend / SPEND_CYCLE_SIZE));
    const nextMilestone = cycleComplete
      ? SPEND_CYCLE_MILESTONES[0]
      : SPEND_CYCLE_MILESTONES.find((m) => cycleSpend < m.at) ??
        SPEND_CYCLE_MILESTONES[0];
    const lastMilestone = cycleComplete
      ? SPEND_CYCLE_MILESTONES[SPEND_CYCLE_MILESTONES.length - 1]
      : [...SPEND_CYCLE_MILESTONES].filter((m) => cycleSpend >= m.at).slice(-1)[0];
    const remaining = Math.max(0, nextMilestone.at - (cycleComplete ? 0 : cycleSpend));
    return {
      cycleSpend: displaySpend,
      progress,
      nextMilestone,
      lastMilestone,
      remaining,
    };
  }, [lifetimeSpend]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="text-sm text-neutral-300">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <div className="text-lg font-semibold">Tier and vouchers</div>
            <div className="text-sm text-neutral-400">Please log in to view your perks.</div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <section className="rounded-[28px] border border-slate-500/40 bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800 p-6 text-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">
              Odd Wheels Loyalty
            </div>
            <div className="mt-2 text-3xl font-semibold">
              {tierPerks.label.toUpperCase()}
            </div>
            <div className="text-sm text-white/70">
              {user.user_metadata?.username || user.email || user.id.slice(0, 8)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowOtherTiers((prev) => !prev)}
            className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white/90 transition hover:border-white/40 hover:bg-white/20"
          >
            <span className="inline-flex items-center gap-2">
              {showOtherTiers ? "Hide tiers" : "See all tiers"}
              <ChevronRight className="h-4 w-4" />
            </span>
          </button>
        </div>

        <div className="mt-5 rounded-3xl bg-white p-4 text-slate-900 shadow-lg">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">
            {progressHeading}
          </div>
          <div className="mt-3 grid gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Spend</span>
                <span>
                  {formatPHP(lifetimeSpend)} / {formatPHP(spendTarget)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full ${tierProgressBarClass(resolvedTier)}`}
                  style={{ width: `${spendProgress * 100}%` }}
                />
              </div>
              {tierProgress.nextTier ? (
                <div className="text-[11px] text-slate-400">
                  Spend {formatPHP(tierProgress.remaining)} more for{" "}
                  {TIER_PERKS[tierProgress.nextTier].label}.
                </div>
              ) : (
                <div className="text-[11px] text-slate-400">Top tier reached.</div>
              )}
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-400">
            Tier status is based on lifetime paid spend.
          </div>
        </div>
        {profileError ? (
          <div className="mt-3 text-xs text-red-100">{profileError}</div>
        ) : null}
      </section>

      {showOtherTiers ? (
        <section className="rounded-[28px] border border-white/10 bg-bg-900/40 p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">All tiers</div>
            <div className="text-xs text-white/60">Progress to Platinum</div>
          </div>
          <div className="mt-4">
            <div className="relative h-2 rounded-full bg-white/10">
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${tierProgressBarClass(
                  resolvedTier
                )}`}
                style={{ width: `${progressToPlatinum * 100}%` }}
              />
              {tiers.map((tierKey) => {
                const marker = Math.min(
                  100,
                  (TIER_THRESHOLDS[tierKey] / Math.max(1, TIER_THRESHOLDS.PLATINUM)) * 100
                );
                const isCurrent = tierKey === resolvedTier;
                return (
                  <div
                    key={tierKey}
                    className="absolute -top-1.5"
                    style={{ left: `calc(${marker}% - 6px)` }}
                  >
                    <div
                      className={`h-3 w-3 rounded-full border ${
                        isCurrent
                          ? "border-orange-200 bg-orange-400"
                          : "border-white/40 bg-white/30"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-[10px] uppercase tracking-[0.2em] text-white/50">
              {tiers.map((tierKey) => (
                <div key={tierKey} className="text-center">
                  {TIER_PERKS[tierKey].label}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((tierKey) => {
              const Icon = TIER_ICONS[tierKey];
              const isCurrent = tierKey === resolvedTier;
              const perks = TIER_PERKS[tierKey];
              return (
                <div
                  key={tierKey}
                  className={`rounded-2xl border p-4 ${
                    isCurrent
                      ? tierAccentClass(tierKey)
                      : "border-white/10 bg-bg-900/30 text-white/70"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`grid h-10 w-10 place-items-center rounded-full border border-white/20 ${tierDotClass(
                        tierKey
                      )}`}
                    >
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{perks.label}</div>
                      <div className="text-[11px] text-white/60">
                        {formatPHP(Number(TIER_THRESHOLDS[tierKey] ?? 0))}+
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    {getTierDetailRows(perks).map((perk) => (
                      <div key={perk.label} className="flex items-start gap-2 text-[11px]">
                        {perk.enabled ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-white" />
                        ) : (
                          <span className="mt-0.5 h-3.5 w-3.5 rounded-full border border-white/30 text-center text-[9px] text-white/40">
                            -
                          </span>
                        )}
                        <span className={perk.enabled ? "text-white/80" : "text-white/40"}>
                          {perk.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <div className="text-base font-semibold">Voucher benefits</div>
          <div className="text-sm text-neutral-400">
            Vouchers unlock for your next order as you spend.
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="text-sm font-semibold">Spend tracker</div>
            <div className="text-xs text-neutral-400">
              Rewards reset every {formatPHP(SPEND_CYCLE_SIZE)}.
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-300">
                <span>Cycle spend</span>
                <span>
                  {formatPHP(spendCycle.cycleSpend)} / {formatPHP(SPEND_CYCLE_SIZE)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-orange-500"
                  style={{ width: `${spendCycle.progress * 100}%` }}
                />
              </div>
              <div className="text-[11px] text-neutral-400">
                Next reward: {spendCycle.nextMilestone.label} at{" "}
                {formatPHP(spendCycle.nextMilestone.at)} (spend{" "}
                {formatPHP(spendCycle.remaining)} more).
              </div>
              <div className="text-[11px] text-neutral-500">
                Current cycle earned:{" "}
                {spendCycle.lastMilestone?.label ?? "None yet"}.
              </div>
              <div className="text-[11px] text-neutral-500">
                Milestones: 2k FS100, 4k FS100+FS200, 6k FS100, 8k FS100+FS200, 10k
                all (FS100+FS200+FS300).
              </div>
            </div>
          </div>
          {voucherLoading ? (
            <div className="text-sm text-neutral-300">Loading vouchers...</div>
          ) : voucherError ? (
            <div className="text-sm text-red-200">{voucherError}</div>
          ) : voucherWallet.length === 0 ? (
            <div className="text-sm text-neutral-300">No vouchers yet.</div>
          ) : (
            <div className="space-y-4">
              {voucherWallet.map((wallet) => (
                <div
                  key={wallet.id}
                  className="flex overflow-hidden rounded-2xl border border-white/10 bg-bg-900/30"
                >
                  <div className="min-w-[96px] bg-gradient-to-b from-orange-500 to-amber-400 p-3 text-xs font-semibold text-white">
                    {formatVoucherStatus(wallet.status)}
                  </div>
                  <div className="flex-1 space-y-2 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {wallet.voucher.title || "Free Shipping"}
                        </div>
                        <div className="text-xs text-neutral-400">
                          Min spend {formatPHP(Number(wallet.voucher.min_subtotal ?? 0))} - Cap{" "}
                          {formatPHP(Number(wallet.voucher.shipping_cap ?? 0))}
                        </div>
                      </div>
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/70">
                        {formatVoucherStatus(wallet.status)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
                      <span>
                        Expires: {formatDateShort(wallet.expires_at ?? wallet.voucher.expires_at)}
                      </span>
                      {wallet.used_at ? (
                        <span>Used: {formatDateShort(wallet.used_at)}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
