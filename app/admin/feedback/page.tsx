"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

type CustomerFeedback = {
  id: string;
  created_at: string;
  order_id: string | null;
  user_id: string | null;
  user_email: string | null;
  rating: number | null;
  experience: string | null;
  change: string | null;
  status: string;
};

const STATUS_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "New" },
  { value: "REVIEWED", label: "Reviewed" },
] as const;

const RATING_OPTIONS = [
  { value: "ALL", label: "All ratings" },
  { value: "5", label: "5 stars" },
  { value: "4", label: "4 stars" },
  { value: "3", label: "3 stars" },
  { value: "2", label: "2 stars" },
  { value: "1", label: "1 star" },
] as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-PH");
}

function getOrderLabel(orderId: string | null) {
  if (!orderId) return "General feedback";
  return `Order #${String(orderId).slice(0, 8)}`;
}

function renderStars(rating: number | null) {
  if (!rating) return null;
  const safeRating = Math.max(1, Math.min(5, Math.round(rating)));
  return (
    <div className="flex items-center gap-1 text-amber-300">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={`rating-${value}`}
          className="h-4 w-4"
          fill={value <= safeRating ? "currentColor" : "none"}
        />
      ))}
    </div>
  );
}

export default function AdminFeedbackPage() {
  const [entries, setEntries] = React.useState<CustomerFeedback[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [ratingFilter, setRatingFilter] = React.useState("ALL");

  const loadFeedback = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("customer_feedback")
      .select(
        "id,created_at,order_id,user_id,user_email,rating,experience,change,status",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (loadError) {
      console.error(loadError);
      setError(loadError.message || "Failed to load feedback.");
      setEntries([]);
      setLoading(false);
      return;
    }

    setEntries((data as CustomerFeedback[]) ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  async function toggleStatus(entry: CustomerFeedback) {
    const next = entry.status === "REVIEWED" ? "NEW" : "REVIEWED";
    const { error: updateError } = await supabase
      .from("customer_feedback")
      .update({ status: next })
      .eq("id", entry.id);

    if (updateError) {
      setError(updateError.message || "Failed to update status.");
      return;
    }

    await loadFeedback();
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (statusFilter !== "ALL" && entry.status !== statusFilter) return false;
      if (ratingFilter !== "ALL" && String(entry.rating ?? "") !== ratingFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        entry.user_email,
        entry.user_id,
        entry.order_id,
        entry.experience,
        entry.change,
        entry.status,
        entry.rating ? String(entry.rating) : null,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query, statusFilter, ratingFilter]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Customer feedback</div>
            <div className="text-sm text-white/60">
              Ratings and notes submitted after checkout.
            </div>
          </div>
          <Badge>{filtered.length}</Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1.2fr_0.4fr_0.4fr]">
            <Input
              label="Search"
              placeholder="Order, user, message"
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
            <Select
              label="Rating"
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
            >
              {RATING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {loading ? (
            <div className="text-sm text-white/60">Loading feedback...</div>
          ) : error ? (
            <div className="text-sm text-red-200">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-white/60">No feedback yet.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-white/10 bg-bg-900/30 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold">Customer feedback</div>
                        {entry.status === "REVIEWED" ? (
                          <Badge className="border-emerald-500/30 text-emerald-200">
                            Reviewed
                          </Badge>
                        ) : (
                          <Badge className="border-amber-500/30 text-amber-200">
                            New
                          </Badge>
                        )}
                        {entry.rating ? (
                          <Badge className="border-amber-400/30 text-amber-200">
                            {entry.rating}★
                          </Badge>
                        ) : null}
                      </div>
                      {renderStars(entry.rating)}
                      <div className="text-xs text-white/60">
                        {getOrderLabel(entry.order_id)}
                      </div>
                      {entry.experience ? (
                        <div className="text-sm text-white/80 whitespace-pre-wrap">
                          {entry.experience}
                        </div>
                      ) : null}
                      {entry.change ? (
                        <div className="text-sm text-white/70 whitespace-pre-wrap">
                          <span className="text-white/50">Improve:</span>{" "}
                          {entry.change}
                        </div>
                      ) : null}
                      <div className="text-xs text-white/50">
                        {entry.user_email || entry.user_id ? (
                          <>User: {entry.user_email ?? String(entry.user_id).slice(0, 8)}</>
                        ) : (
                          <>User: Guest</>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-xs text-white/50">
                        {formatDate(entry.created_at)}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStatus(entry)}
                      >
                        {entry.status === "REVIEWED" ? "Mark new" : "Mark reviewed"}
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
