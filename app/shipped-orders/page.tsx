"use client";

import * as React from "react";
import {
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/hooks/useProfile";
import { useSettings } from "@/hooks/useSettings";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/toast";
import { fetchAuthedJson, fetchJson } from "@/lib/api/client";
import {
  formatPublicPackageLabel,
  formatPublicShipmentStatusLabel,
  maskCustomerName,
  PUBLIC_JNT_PACKAGE_OPTIONS,
  PUBLIC_LBC_PACKAGE_OPTIONS,
  titleCaseLocation,
  type PublicShipmentAdminDraft,
  type PublicShipmentView,
} from "@/lib/publicShippedOrders";

type ShipmentRow = Omit<PublicShipmentView, "admin"> & {
  admin?: PublicShipmentAdminDraft;
};

type ShipmentApiResponse = {
  ok: true;
  isAdmin: boolean;
  rows: ShipmentRow[];
};

type ShipmentLookupMatch = {
  id: string;
  customerName: string;
  locationLabel: string;
  shippingMethodLabel: string;
  packageLabel: string;
  shippingStatus: ShipmentRow["shippingStatus"];
  trackingNumber: string | null;
  shippedAt: string | null;
  shipmentDateLabel: string;
  estimatedDeliveryLabel: string | null;
};

type ShipmentLookupResponse = {
  ok: true;
  isAdmin: boolean;
  matches: ShipmentLookupMatch[];
};

type EditDraft = PublicShipmentAdminDraft;

const SHIPPING_DAY_LABELS: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

const SHIPPING_DAY_INDEX: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

const LBC_TRACKING_URL = "https://www.lbcexpress.com/";
const JNT_TRACKING_URL = "https://www.jtexpress.ph/track-and-trace";

function getWeekStartIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date(0).toISOString();
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day);
  return copy.toISOString();
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function formatWeekLabel(weekStartIso: string) {
  const start = new Date(weekStartIso);
  if (Number.isNaN(start.getTime())) return "Unknown week";
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();

  const startLabel = start.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const endLabel = end.toLocaleDateString("en-PH", {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });

  return `${startLabel} - ${endLabel}`;
}

function buildSummaryPreview(draft: EditDraft) {
  const method = draft.shippingMethod === "JNT" ? "J&T" : "LBC";
  const packageLabel = formatPublicPackageLabel(
    draft.shippingMethod,
    draft.packageCode,
  );
  const parts = [
    maskCustomerName(draft.customerName),
    titleCaseLocation(draft.locationLabel || "Unknown"),
    packageLabel || method,
  ];
  if (draft.cop && draft.shippingMethod === "LBC") parts.push("COP");
  return parts.join(" - ");
}

function normalizeEditDraft(
  source: PublicShipmentAdminDraft | undefined,
): EditDraft | null {
  if (!source) return null;
  return {
    ...source,
    shippedAt: source.shippedAt || "",
  };
}

function getPackageOptions(method: "LBC" | "JNT") {
  return method === "JNT"
    ? PUBLIC_JNT_PACKAGE_OPTIONS
    : PUBLIC_LBC_PACKAGE_OPTIONS;
}

function normalizePackageForMethod(method: "LBC" | "JNT", current: string) {
  const options = getPackageOptions(method);
  return options.some((option) => option.value === current)
    ? current
    : options[0].value;
}

function getStatusBadgeClass(status: ShipmentRow["shippingStatus"]) {
  return status === "PENDING_SHIPPING"
    ? "border-amber-500/30 text-amber-200"
    : "border-emerald-500/30 text-emerald-200";
}

function normalizeShippingDays(values: string[] | null | undefined) {
  return (values ?? []).filter((value) => value in SHIPPING_DAY_INDEX);
}

function formatShippingDays(values: string[]) {
  if (!values.length) return null;
  return values.map((value) => SHIPPING_DAY_LABELS[value] ?? value).join(" • ");
}

function getNextShippingDateLabel(values: string[], now = new Date()) {
  const dayIndexes = values
    .map((value) => SHIPPING_DAY_INDEX[value])
    .filter((value) => Number.isInteger(value));
  if (!dayIndexes.length) return null;

  const currentDay = now.getDay();
  const nearestOffset = dayIndexes.reduce(
    (best, dayIndex) => {
      const offset = (dayIndex - currentDay + 7) % 7;
      if (best === null || offset < best) return offset;
      return best;
    },
    null as number | null,
  );

  if (nearestOffset === null) return null;
  const target = new Date(now);
  target.setHours(12, 0, 0, 0);
  target.setDate(target.getDate() + nearestOffset);

  return target.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPublicDateLabel(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ShippedOrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { settings } = useSettings();
  const isAdmin = profile?.role === "admin";
  const canLoad = !authLoading && (!user || !profileLoading);

  const [rows, setRows] = React.useState<ShipmentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchName, setSearchName] = React.useState("");
  const [lookupLoading, setLookupLoading] = React.useState(false);
  const [lookupMatches, setLookupMatches] = React.useState<
    ShipmentLookupMatch[]
  >([]);
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<EditDraft | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    try {
      const payload = isAdmin
        ? await fetchAuthedJson<ShipmentApiResponse>(
            "/api/public/shipped-orders",
          )
        : await fetchJson<ShipmentApiResponse>("/api/public/shipped-orders");
      setRows(payload.rows ?? []);
    } catch (error: any) {
      toast({
        intent: "error",
        message: error?.message ?? "Unable to load shipping orders.",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canLoad, isAdmin]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function lookupShipmentByName(
    event?: React.FormEvent<HTMLFormElement>,
  ) {
    event?.preventDefault();
    const fullName = searchName.trim();
    if (fullName.length < 4) {
      setLookupMatches([]);
      setLookupError("Enter the full customer name used on the order.");
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    try {
      const payload = isAdmin
        ? await fetchAuthedJson<ShipmentLookupResponse>(
            "/api/public/shipped-orders",
            {
              method: "POST",
              body: JSON.stringify({ fullName }),
            },
          )
        : await fetchJson<ShipmentLookupResponse>(
            "/api/public/shipped-orders",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fullName }),
            },
          );
      setLookupMatches(payload.matches ?? []);
      if (!payload.matches?.length) {
        setLookupError("No shipped-board match was found for that full name.");
      }
    } catch (error: any) {
      setLookupMatches([]);
      setLookupError(error?.message ?? "Unable to search shipping orders.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function copyTrackingNumber(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ intent: "success", message: "Tracking number copied." });
    } catch {
      toast({ intent: "error", message: "Unable to copy tracking number." });
    }
  }

  function getCourierTrackingLink(
    shippingMethod: ShipmentRow["shippingMethod"] | string | null | undefined,
  ) {
    if (shippingMethod === "LBC") {
      return { href: LBC_TRACKING_URL, label: "Open LBC" };
    }
    if (shippingMethod === "JNT" || shippingMethod === "J&T") {
      return { href: JNT_TRACKING_URL, label: "Open J&T" };
    }
    return null;
  }

  const visibleRows = React.useMemo(
    () => rows.filter((row) => !row.isOlderThanMonth),
    [rows],
  );
  const archivedRows = React.useMemo(
    () => rows.filter((row) => row.isOlderThanMonth),
    [rows],
  );

  const buildGroups = React.useCallback((sourceRows: ShipmentRow[]) => {
    const groups = new Map<
      string,
      { weekStart: string; weekLabel: string; rows: ShipmentRow[] }
    >();
    for (const row of sourceRows) {
      const weekStart = getWeekStartIso(row.referenceDate);
      const existing = groups.get(weekStart);
      if (existing) {
        existing.rows.push(row);
        continue;
      }
      groups.set(weekStart, {
        weekStart,
        weekLabel: formatWeekLabel(weekStart),
        rows: [row],
      });
    }
    return Array.from(groups.values()).sort(
      (a, b) =>
        new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime(),
    );
  }, []);

  const visibleGroups = React.useMemo(
    () => buildGroups(visibleRows),
    [buildGroups, visibleRows],
  );
  const archiveGroups = React.useMemo(
    () => buildGroups(archivedRows),
    [archivedRows, buildGroups],
  );
  const shippingDays = React.useMemo(
    () => normalizeShippingDays(settings?.shipping_days),
    [settings?.shipping_days],
  );
  const shippingDaysLabel = React.useMemo(
    () => formatShippingDays(shippingDays),
    [shippingDays],
  );
  const nextShippingDateLabel = React.useMemo(
    () => getNextShippingDateLabel(shippingDays),
    [shippingDays],
  );

  function startEdit(row: ShipmentRow) {
    if (!row.admin) return;
    setEditingId(row.id);
    setEditDraft(normalizeEditDraft(row.admin));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function saveEdit(orderId: string) {
    if (!isAdmin || !editDraft) return;
    setBusyId(orderId);
    try {
      await fetchAuthedJson<{ ok: true }>(
        `/api/public/shipped-orders/${orderId}`,
        {
          method: "PATCH",
          body: JSON.stringify(editDraft),
        },
      );
      toast({ intent: "success", message: "Shipping order updated." });
      cancelEdit();
      await load();
    } catch (error: any) {
      toast({
        intent: "error",
        message: error?.message ?? "Unable to update shipped order.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteOrder(orderId: string) {
    if (!isAdmin) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Remove shipping order #${orderId.slice(0, 8)} from the public board?`,
      );
      if (!confirmed) return;
    }
    setBusyId(orderId);
    try {
      await fetchAuthedJson<{ ok: true }>(
        `/api/public/shipped-orders/${orderId}`,
        {
          method: "DELETE",
        },
      );
      toast({
        intent: "success",
        message: "Shipping order removed from the board.",
      });
      if (editingId === orderId) cancelEdit();
      await load();
    } catch (error: any) {
      toast({
        intent: "error",
        message:
          error?.message ?? "Unable to remove shipping order from the board.",
      });
    } finally {
      setBusyId(null);
    }
  }

  const renderGroup = (
    title: string,
    groups: Array<{
      weekStart: string;
      weekLabel: string;
      rows: ShipmentRow[];
    }>,
    archived = false,
  ) => (
    <Card className="overflow-visible">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">{title}</div>
          {archived ? (
            <div className="text-sm text-white/60">Older than 30 days</div>
          ) : null}
        </div>
        <Badge
          className={archived ? "border-orange-500/30 text-orange-200" : ""}
        >
          {groups.reduce((sum, group) => sum + group.rows.length, 0)} order(s)
        </Badge>
      </CardHeader>
      <CardBody className="space-y-4">
        {!groups.length ? (
          <div className="rounded-xl border border-white/10 bg-paper/5 p-4 text-sm text-white/60">
            No orders in this section.
          </div>
        ) : null}
        {groups.map((group) => (
          <div
            key={group.weekStart}
            className="rounded-2xl border border-white/10 bg-paper/5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div className="font-medium">Week of {group.weekLabel}</div>
              <Badge>{group.rows.length} shipment(s)</Badge>
            </div>
            <div className="divide-y divide-white/10">
              {group.rows.map((row) => {
                const isEditing =
                  isAdmin && editingId === row.id && Boolean(editDraft);
                const isBusy = busyId === row.id;
                const packageOptions = editDraft
                  ? getPackageOptions(editDraft.shippingMethod)
                  : [];
                return (
                  <div key={row.id} className="p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="text-base font-semibold text-white">
                          {row.summary}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-white/60">
                          <Badge
                            className={getStatusBadgeClass(row.shippingStatus)}
                          >
                            {formatPublicShipmentStatusLabel(
                              row.shippingStatus,
                            )}
                          </Badge>
                          {row.shippingStatus === "PENDING_SHIPPING" ? (
                            <Badge>
                              {!isAdmin
                                ? `Item will be shipped on ${
                                    formatPublicDateLabel(
                                      row.scheduledShipAt,
                                    ) ??
                                    nextShippingDateLabel ??
                                    "next shipping day"
                                  }`
                                : formatPublicDateLabel(row.scheduledShipAt)
                                  ? `Ships on ${formatPublicDateLabel(row.scheduledShipAt)}`
                                  : "Pending shipping"}
                            </Badge>
                          ) : null}
                          {row.trackingNumber ? (
                            <Badge className="border-sky-500/30 text-sky-200">
                              Tracking {row.trackingNumber}
                            </Badge>
                          ) : null}
                          {row.estimatedDeliveryLabel ? (
                            <Badge className="border-fuchsia-500/30 text-fuchsia-200">
                              {row.estimatedDeliveryLabel}
                            </Badge>
                          ) : null}
                          {row.isOlderThanMonth ? (
                            <Badge className="border-orange-500/30 text-orange-200">
                              Admin only archive
                            </Badge>
                          ) : null}
                        </div>
                        {row.trackingNumber ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                void copyTrackingNumber(row.trackingNumber!)
                              }
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Copy tracking
                            </Button>
                            {getCourierTrackingLink(row.shippingMethod) ? (
                              <a
                                href={
                                  getCourierTrackingLink(row.shippingMethod)!
                                    .href
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-white/10 bg-transparent px-3.5 text-sm font-medium tracking-[-0.01em] text-white/86 transition duration-150 hover:bg-white/[0.05] hover:text-white"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {
                                  getCourierTrackingLink(row.shippingMethod)!
                                    .label
                                }
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      {isAdmin ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(row)}
                            disabled={!row.admin || isBusy}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void deleteOrder(row.id)}
                            disabled={isBusy}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    {isEditing && editDraft ? (
                      <div className="rounded-2xl border border-white/10 bg-bg-950/40 p-4 space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input
                            label="Customer name"
                            value={editDraft.customerName}
                            onChange={(e) =>
                              setEditDraft((current) =>
                                current
                                  ? { ...current, customerName: e.target.value }
                                  : current,
                              )
                            }
                          />
                          <Input
                            label="Public location"
                            value={editDraft.locationLabel}
                            onChange={(e) =>
                              setEditDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      locationLabel: e.target.value,
                                    }
                                  : current,
                              )
                            }
                            hint="Use the city label the customer can recognize."
                          />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Select
                            label="Shipping method"
                            value={editDraft.shippingMethod}
                            onChange={(e) =>
                              setEditDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      shippingMethod: e.target.value as
                                        | "LBC"
                                        | "JNT",
                                      packageCode: normalizePackageForMethod(
                                        e.target.value as "LBC" | "JNT",
                                        current.packageCode,
                                      ),
                                      cop:
                                        e.target.value === "LBC"
                                          ? current.cop
                                          : false,
                                    }
                                  : current,
                              )
                            }
                          >
                            <option value="LBC">LBC</option>
                            <option value="JNT">J&T</option>
                          </Select>
                          <Select
                            label="Packaging"
                            value={editDraft.packageCode}
                            onChange={(e) =>
                              setEditDraft((current) =>
                                current
                                  ? { ...current, packageCode: e.target.value }
                                  : current,
                              )
                            }
                          >
                            {packageOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Select
                            label="Shipping status"
                            value={editDraft.shippingStatus}
                            onChange={(e) =>
                              setEditDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      shippingStatus: e.target.value as
                                        | "PENDING_SHIPPING"
                                        | "SHIPPED",
                                    }
                                  : current,
                              )
                            }
                          >
                            <option value="PENDING_SHIPPING">
                              Pending shipping
                            </option>
                            <option value="SHIPPED">Shipped</option>
                          </Select>
                          <Input
                            label="Tracking number"
                            value={editDraft.trackingNumber}
                            onChange={(e) =>
                              setEditDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      trackingNumber: e.target.value,
                                    }
                                  : current,
                              )
                            }
                          />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input
                            label="Shipped at"
                            type="datetime-local"
                            value={editDraft.shippedAt}
                            onChange={(e) =>
                              setEditDraft((current) =>
                                current
                                  ? { ...current, shippedAt: e.target.value }
                                  : current,
                              )
                            }
                          />
                          <Input
                            label="Pending ship date"
                            type="date"
                            value={editDraft.scheduledShipAt}
                            onChange={(e) =>
                              setEditDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      scheduledShipAt: e.target.value,
                                    }
                                  : current,
                              )
                            }
                          />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="flex items-end">
                            <Checkbox
                              checked={editDraft.cop}
                              onChange={(value) =>
                                setEditDraft((current) =>
                                  current
                                    ? { ...current, cop: value }
                                    : current,
                                )
                              }
                              disabled={editDraft.shippingMethod !== "LBC"}
                              label="COP"
                            />
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-paper/5 p-3 text-sm text-white/70">
                          Public preview:{" "}
                          <span className="font-medium text-white">
                            {buildSummaryPreview(editDraft)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void saveEdit(row.id)}
                            disabled={isBusy}
                          >
                            {isBusy ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={cancelEdit}
                            disabled={isBusy}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Shipping Orders Board</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <Badge className="border-emerald-500/30 text-emerald-200">
                Admin mode
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void load()}
            >
              <RefreshCcw className="mr-1 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-2 pt-0">
          <Badge>{visibleRows.length} visible</Badge>
          {shippingDaysLabel ? (
            <Badge>Shipping days: {shippingDaysLabel}</Badge>
          ) : null}
          {isAdmin && archivedRows.length ? (
            <Badge className="border-orange-500/30 text-orange-200">
              {archivedRows.length} archived
            </Badge>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Find Shipment</div>
        </CardHeader>
        <CardBody className="space-y-4">
          <form
            className="flex flex-col gap-3 md:flex-row md:items-end"
            onSubmit={lookupShipmentByName}
          >
            <div className="flex-1">
              <Input
                label="Full name"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="Enter complete name"
              />
            </div>
            <div className="md:shrink-0">
              <Button type="submit" disabled={lookupLoading}>
                {lookupLoading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : null}
                Search
              </Button>
            </div>
          </form>
          {lookupError ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
              {lookupError}
            </div>
          ) : null}
          {lookupMatches.length ? (
            <div className="space-y-3">
              {lookupMatches.map((match) => (
                <div
                  key={match.id}
                  className="rounded-2xl border border-white/10 bg-paper/5 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">
                        {match.customerName}
                      </div>
                      <div className="text-sm text-white/60">
                        {match.shippingMethodLabel}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge
                      className={getStatusBadgeClass(match.shippingStatus)}
                    >
                      {formatPublicShipmentStatusLabel(match.shippingStatus)}
                    </Badge>
                    {match.trackingNumber ? (
                      <Badge className="border-sky-500/30 text-sky-200">
                        Tracking {match.trackingNumber}
                      </Badge>
                    ) : null}
                    {match.estimatedDeliveryLabel ? (
                      <Badge className="border-fuchsia-500/30 text-fuchsia-200">
                        {match.estimatedDeliveryLabel}
                      </Badge>
                    ) : null}
                  </div>
                  {match.trackingNumber ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void copyTrackingNumber(match.trackingNumber!)
                        }
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy tracking
                      </Button>
                      {getCourierTrackingLink(match.shippingMethodLabel) ? (
                        <a
                          href={
                            getCourierTrackingLink(match.shippingMethodLabel)!
                              .href
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-white/10 bg-transparent px-3.5 text-sm font-medium tracking-[-0.01em] text-white/86 transition duration-150 hover:bg-white/[0.05] hover:text-white"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {
                            getCourierTrackingLink(match.shippingMethodLabel)!
                              .label
                          }
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {loading ? (
        <Card>
          <CardBody className="flex items-center gap-3 text-white/70">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading shipping orders...
          </CardBody>
        </Card>
      ) : (
        <>
          {renderGroup("Public Board", visibleGroups)}
          {isAdmin && archivedRows.length
            ? renderGroup("Admin Archive", archiveGroups, true)
            : null}
        </>
      )}
    </main>
  );
}
