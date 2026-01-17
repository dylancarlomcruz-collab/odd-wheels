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
  const [pickupSchedule, setPickupSchedule] = React.useState<PickupScheduleState>(
    () => buildEmptyPickupScheduleState()
  );
  const [pickupUnavailable, setPickupUnavailable] = React.useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
    if (error) console.error(error);

    if (data) {
      setSchedule(data.shipping_schedule_text ?? "");
      setCutoff(data.shipping_cutoff_text ?? "");
      setPriorityAvailable(!!data.priority_shipping_available);
      setPriorityNote(data.priority_shipping_note ?? "");
      setPickupSchedule(
        buildPickupScheduleState(
          (data as any).pickup_schedule ?? null,
          data.pickup_schedule_text ?? null
        )
      );
      setPickupUnavailable(!!data.pickup_unavailable);
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
    const { error } = await supabase.from("settings").update({
      shipping_schedule_text: schedule || null,
      shipping_cutoff_text: cutoff || null,
      priority_shipping_available: priorityAvailable,
      priority_shipping_note: priorityNote || null,
      pickup_schedule_text: pickupSummary || null,
      pickup_schedule: pickupPayload,
      pickup_unavailable: pickupUnavailable
    }).eq("id", 1);

    if (error) alert(error.message);
    setSaving(false);
    await load();
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

          <Textarea label="Shipping Schedule (shown on homepage & checkout)" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          <Input label="Shipping Cut-off (optional)" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />

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
