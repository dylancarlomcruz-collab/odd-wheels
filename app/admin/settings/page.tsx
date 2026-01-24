"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";

const PICKUP_DAYS = [
  { key: "MON", label: "Monday" },
  { key: "TUE", label: "Tuesday" },
  { key: "WED", label: "Wednesday" },
  { key: "THU", label: "Thursday" },
  { key: "FRI", label: "Friday" },
  { key: "SAT", label: "Saturday" },
  { key: "SUN", label: "Sunday" },
] as const;

type PickupDayKey = (typeof PICKUP_DAYS)[number]["key"];
type PickupScheduleState = Record<
  PickupDayKey,
  { enabled: boolean; slots: string }
>;

function parseSlotLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildEmptyPickupScheduleState(): PickupScheduleState {
  const state = {} as PickupScheduleState;
  for (const day of PICKUP_DAYS) {
    state[day.key] = { enabled: false, slots: "" };
  }
  return state;
}

function buildPickupScheduleState(
  raw: unknown,
  fallbackText?: string | null
): PickupScheduleState {
  const base = buildEmptyPickupScheduleState();
  if (raw && typeof raw === "object") {
    const schedule = raw as Record<string, unknown>;
    for (const day of PICKUP_DAYS) {
      const slotsRaw = schedule[day.key];
      if (!Array.isArray(slotsRaw)) continue;
      const cleaned = slotsRaw
        .map((slot) => String(slot ?? "").trim())
        .filter(Boolean);
      if (!cleaned.length) continue;
      base[day.key] = { enabled: true, slots: cleaned.join("\n") };
    }
  }

  const hasAny = Object.values(base).some(
    (day) => day.enabled && day.slots.trim()
  );
  if (!hasAny && fallbackText) {
    const fallbackSlots = parseSlotLines(fallbackText);
    if (fallbackSlots.length) {
      for (const day of PICKUP_DAYS) {
        base[day.key] = { enabled: true, slots: fallbackSlots.join("\n") };
      }
    }
  }

  return base;
}

function buildPickupSchedulePayload(state: PickupScheduleState) {
  const payload: Record<string, string[]> = {};
  for (const day of PICKUP_DAYS) {
    const entry = state[day.key];
    if (!entry?.enabled) continue;
    const slots = parseSlotLines(entry.slots);
    if (slots.length) payload[day.key] = slots;
  }
  return payload;
}

function buildPickupScheduleSummary(payload: Record<string, string[]>) {
  const lines: string[] = [];
  for (const day of PICKUP_DAYS) {
    const slots = payload[day.key];
    if (!slots?.length) continue;
    lines.push(`${day.label}: ${slots.join(", ")}`);
  }
  return lines.join("\n");
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [schedule, setSchedule] = React.useState("");
  const [cutoff, setCutoff] = React.useState("");
  const [priorityAvailable, setPriorityAvailable] = React.useState(false);
  const [priorityNote, setPriorityNote] = React.useState("");
  const [freeShippingThreshold, setFreeShippingThreshold] = React.useState("");
  const [protectorStockMainline, setProtectorStockMainline] = React.useState("");
  const [protectorStockPremium, setProtectorStockPremium] = React.useState("");
  const [pickupSchedule, setPickupSchedule] = React.useState<PickupScheduleState>(
    () => buildEmptyPickupScheduleState()
  );
  const [pickupUnavailable, setPickupUnavailable] = React.useState(false);
  const [headerLogoUrl, setHeaderLogoUrl] = React.useState("");
  const [logoUploading, setLogoUploading] = React.useState(false);
  const [logoMsg, setLogoMsg] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
    if (error) console.error(error);

    if (data) {
      setSchedule(data.shipping_schedule_text ?? "");
      setCutoff(data.shipping_cutoff_text ?? "");
      setPriorityAvailable(!!data.priority_shipping_available);
      setPriorityNote(data.priority_shipping_note ?? "");
      setFreeShippingThreshold(
        data.free_shipping_threshold !== null && data.free_shipping_threshold !== undefined
          ? String(data.free_shipping_threshold)
          : ""
      );
      const fallbackProtector =
        data.protector_stock !== null && data.protector_stock !== undefined
          ? Number(data.protector_stock)
          : null;
      setProtectorStockMainline(
        data.protector_stock_mainline !== null &&
          data.protector_stock_mainline !== undefined
          ? String(data.protector_stock_mainline)
          : fallbackProtector !== null
            ? String(fallbackProtector)
            : ""
      );
      setProtectorStockPremium(
        data.protector_stock_premium !== null &&
          data.protector_stock_premium !== undefined
          ? String(data.protector_stock_premium)
          : fallbackProtector !== null
            ? String(fallbackProtector)
            : ""
      );
      setPickupSchedule(
        buildPickupScheduleState(
          (data as any).pickup_schedule ?? null,
          data.pickup_schedule_text ?? null
        )
      );
      setPickupUnavailable(!!data.pickup_unavailable);
      setHeaderLogoUrl((data as any).header_logo_url ?? "");
    }

    setLoading(false);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    const pickupPayload = buildPickupSchedulePayload(pickupSchedule);
    const pickupSummary = buildPickupScheduleSummary(pickupPayload);
    const thresholdRaw = Number(freeShippingThreshold);
    const threshold =
      freeShippingThreshold.trim() === ""
        ? null
        : Number.isFinite(thresholdRaw)
        ? thresholdRaw
        : null;
    const protectorMainlineRaw = Number(protectorStockMainline);
    const protectorMainlineValue = Number.isFinite(protectorMainlineRaw)
      ? Math.max(0, Math.trunc(protectorMainlineRaw))
      : 0;
    const protectorPremiumRaw = Number(protectorStockPremium);
    const protectorPremiumValue = Number.isFinite(protectorPremiumRaw)
      ? Math.max(0, Math.trunc(protectorPremiumRaw))
      : 0;
    const { error } = await supabase.from("settings").update({
      shipping_schedule_text: schedule || null,
      shipping_cutoff_text: cutoff || null,
      priority_shipping_available: priorityAvailable,
      priority_shipping_note: priorityNote || null,
      free_shipping_threshold: threshold,
      protector_stock_mainline: protectorMainlineValue,
      protector_stock_premium: protectorPremiumValue,
      protector_stock: protectorMainlineValue + protectorPremiumValue,
      pickup_schedule_text: pickupSummary || null,
      pickup_schedule: pickupPayload,
      pickup_unavailable: pickupUnavailable,
      header_logo_url: headerLogoUrl || null
    }).eq("id", 1);

    if (error) alert(error.message);
    setSaving(false);
    await load();
  }

  async function uploadLogo(file: File) {
    setLogoMsg(null);
    setLogoUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("productId", "header-logo");
      const res = await fetch("/api/images/upload", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!json?.ok || !json?.publicUrl) {
        throw new Error(json?.error ?? "Upload failed.");
      }
      setHeaderLogoUrl(String(json.publicUrl));
      setLogoMsg("Logo uploaded. Click Save settings to apply.");
    } catch (err: any) {
      setLogoMsg(err?.message ?? "Logo upload failed.");
    } finally {
      setLogoUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Settings</div>
          <div className="text-sm text-white/60">Controls what buyers see on homepage and checkout.</div>
        </CardHeader>
        <CardBody className="space-y-4">
          {loading ? <div className="text-white/60">Loading...</div> : null}

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="font-semibold">Branding</div>
            <div className="text-sm text-white/60">
              Update the header logo with a public image URL.
            </div>
            <Input
              label="Header logo URL"
              value={headerLogoUrl}
              onChange={(e) => setHeaderLogoUrl(e.target.value)}
              placeholder="https://..."
            />
            <div>
              <div className="text-xs text-white/60 mb-2">Upload logo image</div>
              <input
                type="file"
                accept="image/*"
                disabled={logoUploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await uploadLogo(file);
                  e.target.value = "";
                }}
              />
              {logoUploading ? (
                <div className="text-xs text-white/60 mt-2">Uploading...</div>
              ) : null}
              {logoMsg ? (
                <div className="text-xs text-white/60 mt-2">{logoMsg}</div>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl border border-white/10 bg-bg-900/40 overflow-hidden">
                {headerLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={headerLogoUrl}
                    alt="Header logo preview"
                    className="h-full w-full object-cover bg-neutral-50"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center text-[10px] text-white/40">
                    Default
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setHeaderLogoUrl("")}
              >
                Use default logo
              </Button>
            </div>
          </div>

          <Textarea label="Shipping Schedule (shown on homepage & checkout)" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          <Input label="Shipping Cut-off (optional)" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
          <Input
            label="Free shipping threshold (PHP)"
            value={freeShippingThreshold}
            onChange={(e) => setFreeShippingThreshold(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 2000"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Protector stock (Hot Wheels Mainline)"
              value={protectorStockMainline}
              onChange={(e) => setProtectorStockMainline(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 100"
            />
            <Input
              label="Protector stock (Hot Wheels Premium)"
              value={protectorStockPremium}
              onChange={(e) => setProtectorStockPremium(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 100"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="font-semibold">Priority Shipping</div>
            <div className="text-sm text-white/60">If enabled, buyers can request Priority Shipping (+₱50). Approval is done by cashier/admin.</div>
            <Checkbox checked={priorityAvailable} onChange={setPriorityAvailable} label="Priority Shipping available" />
            <Textarea label="Priority Shipping note (optional)" value={priorityNote} onChange={(e) => setPriorityNote(e.target.value)} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="font-semibold">Pickup (Store)</div>
            <div className="text-sm text-white/60">
              Pick which days are available and add timeslots for each.
            </div>
            <Checkbox
              checked={pickupUnavailable}
              onChange={setPickupUnavailable}
              label="Pickup unavailable"
            />
            <div className="grid gap-3 md:grid-cols-2">
              {PICKUP_DAYS.map((day) => {
                const entry = pickupSchedule[day.key];
                return (
                  <div
                    key={day.key}
                    className="rounded-xl border border-white/10 bg-bg-900/20 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{day.label}</div>
                      <Checkbox
                        checked={entry.enabled}
                        onChange={(checked) =>
                          setPickupSchedule((prev) => ({
                            ...prev,
                            [day.key]: { ...prev[day.key], enabled: checked },
                          }))
                        }
                        label="Available"
                      />
                    </div>
                    <Textarea
                      label="Timeslots (one per line)"
                      value={entry.slots}
                      onChange={(e) =>
                        setPickupSchedule((prev) => ({
                          ...prev,
                          [day.key]: {
                            ...prev[day.key],
                            slots: e.target.value,
                          },
                        }))
                      }
                      placeholder="10:00 AM - 1:00 PM&#10;2:00 PM - 6:00 PM"
                      disabled={pickupUnavailable || !entry.enabled}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
