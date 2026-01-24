"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/money";

type UserRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  contact_number: string | null;
  email: string | null;
  lifetime_spend: number | null;
  tier: string | null;
  tier_updated_at: string | null;
};

type WalletRow = {
  user_id: string;
  status: string | null;
};

type VoucherCount = {
  total: number;
  available: number;
  used: number;
  expired: number;
};

const TIER_BADGE_CLASS: Record<string, string> = {
  CLASSIC: "border-white/10 text-white/60",
  SILVER: "border-white/20 text-white/80",
  GOLD: "border-amber-500/40 text-amber-200",
  PLATINUM: "border-sky-500/40 text-sky-200",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function normalizeStatus(status: string | null | undefined) {
  return String(status ?? "").toUpperCase();
}

export default function AdminUserTiersPage() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [walletRows, setWalletRows] = React.useState<WalletRow[]>([]);
  const [query, setQuery] = React.useState("");

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id,full_name,username,contact_number,email,lifetime_spend,tier,tier_updated_at"
      )
      .order("tier", { ascending: false })
      .order("lifetime_spend", { ascending: false });

    if (profileError) {
      console.error(profileError);
      setError(profileError.message || "Failed to load users.");
      setLoading(false);
      return;
    }

    const { data: wallets, error: walletError } = await supabase
      .from("voucher_wallet")
      .select("user_id,status");

    if (walletError) {
      console.error(walletError);
      setError(walletError.message || "Failed to load voucher wallet.");
      setLoading(false);
      return;
    }

    setUsers((profiles as UserRow[]) ?? []);
    setWalletRows((wallets as WalletRow[]) ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const walletCounts = React.useMemo(() => {
    const counts = new Map<string, VoucherCount>();
    for (const row of walletRows) {
      const id = row.user_id;
      if (!id) continue;
      const current =
        counts.get(id) ?? { total: 0, available: 0, used: 0, expired: 0 };
      current.total += 1;
      const status = normalizeStatus(row.status);
      if (status === "AVAILABLE") current.available += 1;
      if (status === "USED") current.used += 1;
      if (status === "EXPIRED") current.expired += 1;
      counts.set(id, current);
    }
    return counts;
  }, [walletRows]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const haystack = [
        u.id,
        u.full_name,
        u.username,
        u.contact_number,
        u.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [users, query]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">User tiers and vouchers</div>
            <div className="text-sm text-white/60">
              Overview of tier status and voucher wallet counts.
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={loadUsers} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardBody className="space-y-4">
          {error ? <div className="text-sm text-red-200">{error}</div> : null}

          <Input
            label="Search"
            placeholder="Name, username, email, or user id"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {loading ? (
            <div className="text-sm text-white/60">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-white/60">No matching users.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((user) => {
                const tier = String(user.tier ?? "SILVER").toUpperCase();
                const badgeClass = TIER_BADGE_CLASS[tier] ?? "border-white/20";
                const counts =
                  walletCounts.get(user.id) ?? {
                    total: 0,
                    available: 0,
                    used: 0,
                    expired: 0,
                  };

                return (
                  <div
                    key={user.id}
                    className="rounded-2xl border border-white/10 bg-bg-900/30 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {user.full_name || user.username || "User"}
                        </div>
                        <div className="text-xs text-white/60">{user.id}</div>
                        {user.email ? (
                          <div className="text-xs text-white/50">{user.email}</div>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-white/50">Lifetime spend</div>
                        <div className="text-sm font-semibold">
                          {formatPHP(Number(user.lifetime_spend ?? 0))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/60">
                      <Badge className={badgeClass}>Tier: {tier}</Badge>
                      <span>Updated: {formatDate(user.tier_updated_at)}</span>
                      <span>
                        Vouchers: {counts.available} available / {counts.total} total
                      </span>
                      <span>
                        Used: {counts.used} - Expired: {counts.expired}
                      </span>
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
