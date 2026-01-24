"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type AuditLogRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  meta: Record<string, any> | null;
  created_at: string;
};

const ACTION_OPTIONS = [
  { value: "ALL", label: "All actions" },
  { value: "ORDER_APPROVED", label: "Approved" },
  { value: "ORDER_AUTO_APPROVED", label: "Auto approved" },
  { value: "ORDER_PAID_AUTO", label: "Paid auto" },
  { value: "ORDER_VOIDED", label: "Voided" },
  { value: "ORDER_CANCELLED", label: "Cancelled" },
] as const;

function formatActionLabel(value: string) {
  return String(value || "")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-PH");
}

function getOrderId(log: AuditLogRow) {
  const meta = log.meta ?? {};
  const id = meta.order_id ?? meta.orderId ?? meta.id;
  return id ? String(id) : "-";
}

export default function AdminOrderLogsPage() {
  const [logs, setLogs] = React.useState<AuditLogRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("ALL");

  React.useEffect(() => {
    let mounted = true;

    async function loadLogs() {
      setLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from("audit_logs")
        .select("id,actor_user_id,action,meta,created_at")
        .like("action", "ORDER_%")
        .order("created_at", { ascending: false })
        .limit(300);

      if (!mounted) return;

      if (loadError) {
        console.error(loadError);
        setError(loadError.message || "Failed to load logs.");
        setLogs([]);
        setLoading(false);
        return;
      }

      setLogs((data as AuditLogRow[]) ?? []);
      setLoading(false);
    }

    loadLogs();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (actionFilter !== "ALL" && log.action !== actionFilter) return false;
      if (!q) return true;
      const haystack = [
        getOrderId(log),
        log.action,
        log.actor_user_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [logs, query, actionFilter]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Order logs</div>
            <div className="text-sm text-white/60">Order actions from audit logs.</div>
          </div>
          <Badge>{filtered.length}</Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1.4fr_0.6fr]">
            <Input
              label="Search"
              placeholder="Order id, action, or staff id"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select
              label="Action"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {loading ? (
            <div className="text-sm text-white/60">Loading logs...</div>
          ) : error ? (
            <div className="text-sm text-red-200">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-white/60">No logs found.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-white/10 bg-bg-900/30 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">
                      Order #{String(getOrderId(log)).slice(0, 8)}
                    </div>
                    <div className="text-xs text-white/50">
                      {formatDate(log.created_at)}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    Action: {formatActionLabel(log.action)}
                  </div>
                  <div className="text-xs text-white/50">
                    Staff: {log.actor_user_id ? String(log.actor_user_id).slice(0, 8) : "-"}
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
