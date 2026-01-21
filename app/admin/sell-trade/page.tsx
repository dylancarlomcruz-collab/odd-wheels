"use client";

import * as React from "react";
import { ArrowLeftRight, CheckCircle2, Clock, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

type SellTradeRow = {
  id: string;
  user_id: string;
  request_type: string;
  status: string;
  customer_name: string | null;
  customer_contact: string | null;
  customer_email: string | null;
  shipping_method: string | null;
  payload: any;
  photo_urls: string[] | null;
  desired_items: any;
  admin_notes: string | null;
  counter_offer: string | null;
  created_at: string | null;
};

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

function peso(n: number) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `PHP ${Math.round(n)}`;
  }
}

function statusClass(status: string) {
  switch (status) {
    case "APPROVED":
      return "border-emerald-400/40 text-emerald-200";
    case "COUNTERED":
      return "border-amber-400/40 text-amber-200";
    case "REJECTED":
      return "border-red-400/40 text-red-200";
    default:
      return "border-white/10 text-white/80";
  }
}

export default function AdminSellTradePage() {
  const [rows, setRows] = React.useState<SellTradeRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [adminNotes, setAdminNotes] = React.useState<Record<string, string>>({});
  const [counterOffers, setCounterOffers] = React.useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("sell_trade_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message || "Failed to load requests.");
      setRows([]);
    } else {
      setRows((data as SellTradeRow[]) ?? []);
    }
    setLoading(false);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function updateRequest(id: string, status: string) {
    const notes = (adminNotes[id] ?? "").trim();
    const counter = (counterOffers[id] ?? "").trim();
    const { error } = await supabase
      .from("sell_trade_requests")
      .update({
        status,
        admin_notes: notes || null,
        counter_offer: counter || null,
      })
      .eq("id", id);

    if (error) {
      alert(error.message || "Failed to update request.");
      return;
    }
    await load();
  }

  const pending = rows.filter((r) => r.status === "PENDING");
  const approved = rows.filter((r) => r.status === "APPROVED");
  const countered = rows.filter((r) => r.status === "COUNTERED");
  const rejected = rows.filter((r) => r.status === "REJECTED");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xl font-semibold">
              <ArrowLeftRight className="h-5 w-5 text-amber-300" />
              Sell / Trade Offers
            </div>
            <div className="text-sm text-white/60">
              Review sell/trade submissions, counter, approve, or reject with reasons.
            </div>
          </div>
          <Badge>{rows.length}</Badge>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Pending</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
                  <Clock className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-amber-200">
                {pending.length}
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Approved</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-emerald-200">
                {approved.length}
              </div>
            </div>
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Countered</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-200">
                  <ArrowLeftRight className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-sky-200">
                {countered.length}
              </div>
            </div>
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Rejected</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-200">
                  <XCircle className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-red-200">
                {rejected.length}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-white/60">Loading...</div>
          ) : error ? (
            <div className="text-red-300">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-white/60">No requests yet.</div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const payload = parseJsonMaybe(row.payload) ?? {};
                const items = Array.isArray(payload.items) ? payload.items : [];
                const shipping = payload.shipping ?? {};
                const desired = Array.isArray(payload.trade_desired_items)
                  ? payload.trade_desired_items
                  : Array.isArray(row.desired_items)
                  ? row.desired_items
                  : [];
                const photos = Array.isArray(row.photo_urls) ? row.photo_urls : [];
                const issuePhotos = Array.isArray(payload.issue_photo_urls)
                  ? payload.issue_photo_urls
                  : [];
                const targetPrice = payload.target_price;
                const cashAddOn = payload.cash_add_on;
                const payoutMethod = payload.payout_method;
                const requestNotes = payload.notes;

                return (
                  <div key={row.id} className="rounded-2xl border border-white/10 bg-bg-900/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold">#{String(row.id).slice(0, 8)}</div>
                      <Badge className={statusClass(row.status)}>{row.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-white/50">
                      {row.created_at ? new Date(row.created_at).toLocaleString("en-PH") : "-"}
                    </div>
                    <div className="mt-3 text-sm text-white/70">
                      Type: <span className="text-white/90">{row.request_type}</span> - Shipping:{" "}
                      <span className="text-white/90">{row.shipping_method ?? "-"}</span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                        <div className="text-xs text-white/60">Customer</div>
                        <div className="font-medium">{row.customer_name ?? "-"}</div>
                        <div className="text-sm text-white/70">
                          {row.customer_contact ? <div>{row.customer_contact}</div> : null}
                          {row.customer_email ? <div>{row.customer_email}</div> : null}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                        <div className="text-xs text-white/60">Shipping details</div>
                        <div className="text-sm text-white/80">
                          {shipping.method ? <div>Method: {shipping.method}</div> : null}
                          {shipping.availability ? <div>Availability: {shipping.availability}</div> : null}
                          {shipping.details ? <div className="mt-1">Notes: {shipping.details}</div> : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-white/10 bg-paper/5 p-3">
                      <div className="text-xs text-white/60">Request details</div>
                      <div className="text-sm text-white/80">
                        {targetPrice ? <div>Target: {peso(Number(targetPrice))}</div> : null}
                        {cashAddOn ? <div>Cash add-on: {peso(Number(cashAddOn))}</div> : null}
                        {payoutMethod ? <div>Payout: {payoutMethod}</div> : null}
                        {requestNotes ? <div className="mt-1">Notes: {requestNotes}</div> : null}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-sm font-semibold">Items offered</div>
                      {items.length === 0 ? (
                        <div className="text-sm text-white/60 mt-1">No items listed.</div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {items.map((item: any, idx: number) => {
                            const title =
                              item.title ??
                              item.brands ??
                              [item.brand, item.model].filter(Boolean).join(" ") ??
                              "Item";
                            const brandLine =
                              item.brands ??
                              [item.brand, item.model].filter(Boolean).join(" ");
                            return (
                              <div key={`${row.id}-item-${idx}`} className="rounded-xl border border-white/10 bg-paper/5 p-3">
                                <div className="font-medium">{title || "Item"}</div>
                                <div className="text-xs text-white/60">
                                  {brandLine ? `${brandLine}` : "-"}
                                  {item.condition ? ` - ${item.condition}` : ""}
                                  {item.quantity ? ` - Qty ${item.quantity}` : ""}
                                  {item.asking_price ? ` - ${peso(Number(item.asking_price))}` : ""}
                                </div>
                                {item.notes ? <div className="mt-1 text-xs text-yellow-200">Notes: {item.notes}</div> : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {row.request_type === "TRADE" ? (
                      <div className="mt-4">
                        <div className="text-sm font-semibold">Requested shop items</div>
                        {desired.length === 0 ? (
                          <div className="text-sm text-white/60 mt-1">No trade picks.</div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {desired.map((item: any, idx: number) => {
                              const title =
                                item.snapshot_title ?? item.title ?? "Item";
                              const condition =
                                item.snapshot_condition ?? item.condition ?? "-";
                              const qty = Number(item.qty ?? 0);
                              const price = item.snapshot_price ?? item.price;
                              return (
                                <div key={`${row.id}-desired-${idx}`} className="rounded-xl border border-white/10 bg-paper/5 p-3">
                                  <div className="font-medium">{title}</div>
                                  <div className="text-xs text-white/60">
                                    {condition}
                                    {qty ? ` - Qty ${qty}` : ""}
                                    {price ? ` - ${peso(Number(price))}` : ""}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {photos.length ? (
                      <div className="mt-4">
                        <div className="text-sm font-semibold">Item photos</div>
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                          {photos.map((url: string, idx: number) => (
                            <a
                              key={`${row.id}-photo-${idx}`}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-xl border border-white/10 bg-bg-900/40 overflow-hidden"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="Offer photo" className="h-24 w-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {issuePhotos.length ? (
                      <div className="mt-4">
                        <div className="text-sm font-semibold">Issue photos</div>
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                          {issuePhotos.map((url: string, idx: number) => (
                            <a
                              key={`${row.id}-issue-${idx}`}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-xl border border-white/10 bg-bg-900/40 overflow-hidden"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="Issue photo" className="h-24 w-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <Input
                        label="Counteroffer (optional)"
                        placeholder="e.g. PHP 4500 or add PHP 1500 cash"
                        value={counterOffers[row.id] ?? row.counter_offer ?? ""}
                        onChange={(e) =>
                          setCounterOffers((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                      />
                      <Textarea
                        label="Admin notes / reason (optional)"
                        value={adminNotes[row.id] ?? row.admin_notes ?? ""}
                        onChange={(e) =>
                          setAdminNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                        placeholder="Explain your decision or request more info."
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => updateRequest(row.id, "APPROVED")}>
                        Approve
                      </Button>
                      <Button variant="ghost" onClick={() => updateRequest(row.id, "COUNTERED")}>
                        Counter
                      </Button>
                      <Button variant="danger" onClick={() => updateRequest(row.id, "REJECTED")}>
                        Reject
                      </Button>
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
