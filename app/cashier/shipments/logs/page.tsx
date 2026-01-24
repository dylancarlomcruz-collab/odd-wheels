"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type OrderEventRow = {
  id: string;
  order_id: string;
  event_type: string;
  message: string | null;
  created_at: string;
};

const SHIPPING_EVENT_OPTIONS = [
  { value: "ALL", label: "All events" },
  { value: "PACKED", label: "Packed" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
] as const;

function formatEventLabel(value: string) {
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

export default function CashierShipmentsLogsPage() {
  const [events, setEvents] = React.useState<OrderEventRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [eventFilter, setEventFilter] = React.useState("ALL");

  React.useEffect(() => {
    let mounted = true;

    async function loadEvents() {
      setLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from("order_events")
        .select("id,order_id,event_type,message,created_at")
        .in("event_type", ["PACKED", "SHIPPED", "DELIVERED"])
        .order("created_at", { ascending: false })
        .limit(300);

      if (!mounted) return;

      if (loadError) {
        console.error(loadError);
        setError(loadError.message || "Failed to load logs.");
        setEvents([]);
        setLoading(false);
        return;
      }

      setEvents((data as OrderEventRow[]) ?? []);
      setLoading(false);
    }

    loadEvents();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      if (eventFilter !== "ALL" && event.event_type !== eventFilter) return false;
      if (!q) return true;
      const haystack = [
        event.order_id,
        event.event_type,
        event.message,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [events, query, eventFilter]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Shipping logs</div>
            <div className="text-sm text-white/60">Shipping events timeline.</div>
          </div>
          <Badge>{filtered.length}</Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1.4fr_0.6fr]">
            <Input
              label="Search"
              placeholder="Order id or event message"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select
              label="Event"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
            >
              {SHIPPING_EVENT_OPTIONS.map((opt) => (
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
              {filtered.map((event) => (
                <div
                  key={event.id}
                  className="rounded-2xl border border-white/10 bg-bg-900/30 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">
                      Order #{String(event.order_id).slice(0, 8)}
                    </div>
                    <div className="text-xs text-white/50">
                      {formatDate(event.created_at)}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    Event: {formatEventLabel(event.event_type)}
                  </div>
                  {event.message ? (
                    <div className="text-xs text-white/50">{event.message}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
