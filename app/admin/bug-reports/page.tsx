"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

type BugReport = {
  id: string;
  message: string;
  page_url: string | null;
  user_email: string | null;
  user_id: string | null;
  user_agent: string | null;
  status: string;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "New" },
  { value: "RESOLVED", label: "Resolved" },
] as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-PH");
}

export default function AdminBugReportsPage() {
  const [reports, setReports] = React.useState<BugReport[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");

  const loadReports = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("bug_reports")
      .select("id,message,page_url,user_email,user_id,user_agent,status,created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (loadError) {
      console.error(loadError);
      setError(loadError.message || "Failed to load bug reports.");
      setReports([]);
      setLoading(false);
      return;
    }

    setReports((data as BugReport[]) ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadReports();
  }, [loadReports]);

  async function toggleStatus(report: BugReport) {
    const next = report.status === "RESOLVED" ? "NEW" : "RESOLVED";
    const { error: updateError } = await supabase
      .from("bug_reports")
      .update({ status: next })
      .eq("id", report.id);

    if (updateError) {
      setError(updateError.message || "Failed to update status.");
      return;
    }

    await loadReports();
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((report) => {
      if (statusFilter !== "ALL" && report.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        report.message,
        report.page_url,
        report.user_email,
        report.user_id,
        report.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [reports, query, statusFilter]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Bug reports</div>
            <div className="text-sm text-white/60">Customer reports sent from the menu.</div>
          </div>
          <Badge>{filtered.length}</Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1.4fr_0.6fr]">
            <Input
              label="Search"
              placeholder="Message, page, user"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {loading ? (
            <div className="text-sm text-white/60">Loading bug reports...</div>
          ) : error ? (
            <div className="text-sm text-red-200">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-white/60">No bug reports yet.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((report) => (
                <div
                  key={report.id}
                  className="rounded-2xl border border-white/10 bg-bg-900/30 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">Bug report</div>
                        {report.status === "RESOLVED" ? (
                          <Badge className="border-emerald-500/30 text-emerald-200">
                            Resolved
                          </Badge>
                        ) : (
                          <Badge className="border-amber-500/30 text-amber-200">New</Badge>
                        )}
                      </div>
                      <div className="text-sm text-white/80 whitespace-pre-wrap">
                        {report.message}
                      </div>
                      {report.page_url ? (
                        <a
                          href={report.page_url}
                          className="block text-xs text-sky-200/80 hover:text-sky-200"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {report.page_url}
                        </a>
                      ) : null}
                      <div className="text-xs text-white/50">
                        {report.user_email || report.user_id ? (
                          <>User: {report.user_email ?? String(report.user_id).slice(0, 8)}</>
                        ) : (
                          <>User: Guest</>
                        )}
                      </div>
                      {report.user_agent ? (
                        <div className="text-xs text-white/40">{report.user_agent}</div>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-xs text-white/50">
                        {formatDate(report.created_at)}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStatus(report)}
                      >
                        {report.status === "RESOLVED" ? "Reopen" : "Mark resolved"}
                      </Button>
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
