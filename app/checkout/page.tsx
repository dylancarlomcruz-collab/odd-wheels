"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/lib/supabase/browser";
import { useCart } from "@/hooks/useCart";
import { useSettings } from "@/hooks/useSettings";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { FeeBreakdown, type FeeLine } from "@/components/checkout/FeeBreakdown";
import {
  LalamoveTimeSlotPicker,
  LALAMOVE_WINDOWS,
  type LalamoveSelection,
  type LalamoveWindowKey,
} from "@/components/checkout/LalamoveTimeSlotPicker";
import { formatPHP } from "@/lib/money";
import { createOrderFromCart } from "@/lib/orders";
import {
  FEES,
  REGION_LABEL,
  LBC_CAPACITY,
  type LbcPackage,
  type Region,
} from "@/lib/shipping/config";
import { PHONE_MAX_LENGTH, sanitizePhone, validatePhone11 } from "@/lib/phone";
import {
  formatJntAddressLine,
  normalizeShippingDefaults,
  type ShippingDefaults,
} from "@/lib/shippingDefaults";
import {
  jntFee,
  fitsCapacity,
  lbcFee,
  recommendJntPouch,
  recommendLbcPackage,
  shipCountsFromLines,
} from "@/lib/shipping/logic";
import { suggestedInsuranceFee } from "@/lib/shipping/config";

type ShippingMethod = "LALAMOVE" | "JNT" | "LBC" | "PICKUP";
const PHONE_LENGTH = PHONE_MAX_LENGTH;

const LALAMOVE_WINDOW_LABELS = new Map<LalamoveWindowKey, string>(
  LALAMOVE_WINDOWS.map((window) => [window.key, window.label] as const)
);

const LEGACY_LALAMOVE_WINDOW_MAP: Record<string, LalamoveWindowKey> = {
  "8-12": "08_12",
  "9-12": "08_12",
  "12-3": "12_15",
  "3-6": "15_18",
  "6-9": "18_21",
};

const PICKUP_DAYS = [
  { key: "MON", label: "Monday" },
  { key: "TUE", label: "Tuesday" },
  { key: "WED", label: "Wednesday" },
  { key: "THU", label: "Thursday" },
  { key: "FRI", label: "Friday" },
  { key: "SAT", label: "Saturday" },
  { key: "SUN", label: "Sunday" },
] as const;

const PICKUP_LOCATION = "RSquare Mall, Vito Cruz-Taft, Malate, Manila";
const PICKUP_DIRECTORY =
  "Along Taft Ave near LRT-1 Vito Cruz (P. Ocampo) Station / DLSU area";
const FEEDBACK_PROMPT_KEY = "ow_feedback_prompt";
const FEEDBACK_NEVER_SHOW_KEY = "ow_feedback_never_show";

function formatPhoneError(value: string, show: boolean): string | undefined {
  const digits = sanitizePhone(value);
  if (!show || !digits) return undefined;
  return validatePhone11(digits)
    ? undefined
    : "Use an 11-digit PH mobile number (09XXXXXXXXX).";
}

function isLalamoveWindowKey(value: string): value is LalamoveWindowKey {
  return LALAMOVE_WINDOW_LABELS.has(value as LalamoveWindowKey);
}

function buildLalamoveSelection(
  date: string | null | undefined,
  key: string | null | undefined
): LalamoveSelection | null {
  if (!date || !key || !isLalamoveWindowKey(key)) return null;
  const label = LALAMOVE_WINDOW_LABELS.get(key);
  if (!label) return null;
  return { date, window_key: key, window_label: label };
}

function buildLalamoveSelectionFromLegacy(
  date: string | null | undefined,
  window: string | null | undefined
): LalamoveSelection | null {
  if (!date || !window) return null;
  const normalized = String(window).trim();
  if (isLalamoveWindowKey(normalized))
    return buildLalamoveSelection(date, normalized);
  const directLabel = LALAMOVE_WINDOWS.find((w) => w.label === normalized);
  if (directLabel)
    return buildLalamoveSelection(date, directLabel.key);
  const key = LEGACY_LALAMOVE_WINDOW_MAP[normalized];
  return key ? buildLalamoveSelection(date, key) : null;
}

type LalamoveSlotInput = {
  date?: string | null;
  window?: string | null;
  window_key?: string | null;
  window_label?: string | null;
};

function buildLalamoveSelectionFromSlot(
  slot: LalamoveSlotInput | null | undefined
): LalamoveSelection | null {
  if (!slot?.date) return null;
  if (slot.window_key && isLalamoveWindowKey(slot.window_key)) {
    const label =
      slot.window_label ?? LALAMOVE_WINDOW_LABELS.get(slot.window_key);
    if (!label) return null;
    return { date: slot.date, window_key: slot.window_key, window_label: label };
  }
  if (slot.window) {
    return buildLalamoveSelectionFromLegacy(slot.date, slot.window);
  }
  if (slot.window_label) {
    const direct = LALAMOVE_WINDOWS.find((w) => w.label === slot.window_label);
    if (direct) return buildLalamoveSelection(slot.date, direct.key);
  }
  return null;
}

function resolveLalamoveSelections(
  sd: ShippingDefaults
): LalamoveSelection[] {
  const selections: LalamoveSelection[] = [];

  const stored = sd.lalamove?.lalamove;
  const storedSelection = buildLalamoveSelection(
    stored?.date,
    stored?.window_key
  );
  if (storedSelection) selections.push(storedSelection);

  (sd.lalamove?.lalamove_slots ?? []).forEach((slot) => {
    const selection = buildLalamoveSelectionFromSlot(slot);
    if (selection) selections.push(selection);
  });

  (sd.lalamove?.availability ?? []).forEach((slot) => {
    const selection = buildLalamoveSelectionFromLegacy(slot.date, slot.slot);
    if (selection) selections.push(selection);
  });

  const seen = new Set<string>();
  return selections.filter((selection) => {
    const key = `${selection.date}-${selection.window_key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function uploadLalamoveImage(file: File, userId: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("productId", `lalamove-map-${userId}`);
  const res = await fetch("/api/images/upload", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Upload failed");
  return (json.publicUrl as string) || "";
}

function CheckoutContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { lines, loading: cartLoading, reload } = useCart();

  const selectedParam = sp.get("selected");
  const selectedIds = React.useMemo(() => {
    if (!selectedParam) return null;
    return selectedParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }, [selectedParam]);
  const selectedLines = React.useMemo(() => {
    if (!lines?.length) return [];
    if (!selectedIds) return lines;
    const idSet = new Set(selectedIds);
    return lines.filter((line) => idSet.has(line.id));
  }, [lines, selectedIds]);
  const selectionNote = selectedIds
    ? cartLoading
      ? null
      : selectedLines.length
      ? `${selectedLines.length} selected item(s) from your cart.`
      : "No selected items from your cart. Go back to cart to choose items."
    : null;

  const [msg, setMsg] = React.useState<string | null>(null);

  const [shippingMethod, setShippingMethod] =
    React.useState<ShippingMethod>("LALAMOVE");
  const [region, setRegion] = React.useState<Region>("METRO_MANILA");
  const [lbcCop, setLbcCop] = React.useState(false);
  const [paymentMethod, setPaymentMethod] = React.useState<"GCASH" | "BPI">(
    "GCASH"
  );

  const [defaults, setDefaults] = React.useState<ShippingDefaults>(() =>
    normalizeShippingDefaults({})
  );

  // Shared
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [phoneTouched, setPhoneTouched] = React.useState(false);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  // J&T (split)
  const [jtAddressLine, setJtAddressLine] = React.useState("");
  const [jtBrgy, setJtBrgy] = React.useState("");

  // LBC (split)
  const [lbcFirstName, setLbcFirstName] = React.useState("");
  const [lbcLastName, setLbcLastName] = React.useState("");
  const [lbcBranchName, setLbcBranchName] = React.useState("");
  const [lbcBranchCity, setLbcBranchCity] = React.useState("");
  const [lbcPackageChoice, setLbcPackageChoice] =
    React.useState<LbcPackage>("N_SAKTO");

  // Lalamove
  const [lalamoveAddress, setLalamoveAddress] = React.useState("");
  const [lalamoveImageUrl, setLalamoveImageUrl] = React.useState<string>("");
  const [lalamoveUploading, setLalamoveUploading] = React.useState(false);
  const [lalamoveSlots, setLalamoveSlots] = React.useState<
    LalamoveSelection[]
  >([]);
  const [lalamoveSlotError, setLalamoveSlotError] = React.useState<
    string | null
  >(null);

  const [pickupDay, setPickupDay] = React.useState("");
  const [pickupSlot, setPickupSlot] = React.useState("");

  const [notes, setNotes] = React.useState("");

  const phoneError = formatPhoneError(phone, phoneTouched || submitAttempted);

  // Priority shipping UI can stay, but DB may not have columns (we handle in lib/orders.ts)
  const priorityAvailable = Boolean(settings?.priority_shipping_available);
  const [priorityRequested, setPriorityRequested] = React.useState(false);

  const pickupSchedule = React.useMemo(() => {
    const schedule: Record<string, string[]> = {};
    const raw = (settings?.pickup_schedule ?? null) as
      | Record<string, unknown>
      | null;
    if (raw && typeof raw === "object") {
      for (const day of PICKUP_DAYS) {
        const slotsRaw = raw[day.key];
        if (!Array.isArray(slotsRaw)) continue;
        const cleaned = slotsRaw
          .map((slot) => String(slot ?? "").trim())
          .filter(Boolean);
        if (cleaned.length) schedule[day.key] = cleaned;
      }
    }

    if (!Object.keys(schedule).length) {
      const fallback = String(settings?.pickup_schedule_text ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (fallback.length) {
        for (const day of PICKUP_DAYS) {
          schedule[day.key] = fallback.slice();
        }
      }
    }

    return schedule;
  }, [settings?.pickup_schedule, settings?.pickup_schedule_text]);

  const pickupDayOptions = React.useMemo(
    () =>
      PICKUP_DAYS.filter((day) => (pickupSchedule[day.key] ?? []).length > 0),
    [pickupSchedule]
  );

  const pickupSlotsForDay = React.useMemo(
    () => (pickupDay ? pickupSchedule[pickupDay] ?? [] : []),
    [pickupDay, pickupSchedule]
  );

  const pickupUnavailable = Boolean(settings?.pickup_unavailable);

  // Insurance
  const itemsSubtotal = React.useMemo(
    () =>
      (selectedLines ?? []).reduce(
        (sum, l) => sum + Number(l.variant.price) * l.qty,
        0
      ),
    [selectedLines]
  );
  const suggestedInsurance = React.useMemo(
    () => suggestedInsuranceFee(itemsSubtotal),
    [itemsSubtotal]
  );
  const [insuranceSelected, setInsuranceSelected] = React.useState(false);
  const [insuranceFee, setInsuranceFee] = React.useState<number>(0);

  React.useEffect(() => {
    if (!insuranceSelected) setInsuranceFee(suggestedInsurance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedInsurance]);

  // Load defaults
  React.useEffect(() => {
    let mounted = true;

    async function run() {
      if (!user) return;

      const { data, error } = await supabase
        .from("customers")
        .select("shipping_defaults, name, contact")
        .eq("id", user.id)
        .maybeSingle();

      if (!mounted) return;
      if (error) {
        console.error("Failed to load defaults:", error);
        return;
      }

      const rawDefaults =
        ((data as any)?.shipping_defaults as ShippingDefaults | null) ?? {};
      const normalizedDefaults = normalizeShippingDefaults(rawDefaults);
      setDefaults(normalizedDefaults);

      const profileName = (data as any)?.name as string | null;
      const profilePhone = (data as any)?.contact as string | null;
      setName(
        profileName ??
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          ""
      );
      setPhone(
        sanitizePhone(profilePhone ?? user.user_metadata?.contact_number ?? "")
      );
    }

    run();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // Apply defaults when switching method
  React.useEffect(() => {
    const sd = defaults;

    if (shippingMethod === "JNT") {
      setName(sd.jnt?.recipient_name ?? name);
      setPhone(sanitizePhone(sd.jnt?.contact_number ?? phone));
      setJtAddressLine(formatJntAddressLine(sd.jnt));
      setJtBrgy(sd.jnt?.barangay ?? "");
      setNotes(sd.jnt?.notes ?? "");

      setLbcFirstName("");
      setLbcLastName("");
      setLbcBranchName("");
      setLbcBranchCity("");
      setLalamoveAddress("");
      setLalamoveImageUrl("");
      setLalamoveSlots([]);
      setLalamoveSlotError(null);
    }

    if (shippingMethod === "LBC") {
      setLbcFirstName(sd.lbc?.first_name ?? "");
      setLbcLastName(sd.lbc?.last_name ?? "");
      setPhone(sanitizePhone(sd.lbc?.contact_number ?? phone));
      setLbcBranchName(sd.lbc?.branch ?? "");
      setLbcBranchCity(sd.lbc?.city ?? "");
      setNotes(sd.lbc?.notes ?? "");
      setLbcPackageChoice("N_SAKTO");

      setJtAddressLine("");
      setJtBrgy("");
      setLalamoveAddress("");
      setLalamoveImageUrl("");
      setLalamoveSlots([]);
      setLalamoveSlotError(null);
    }

    if (shippingMethod === "LALAMOVE") {
      setName(sd.lalamove?.recipient_name ?? name);
      setPhone(sanitizePhone(sd.lalamove?.recipient_phone ?? phone));
      setLalamoveAddress(sd.lalamove?.dropoff_address ?? "");
      setLalamoveImageUrl(sd.lalamove?.map_screenshot_url ?? "");
      setLalamoveSlots(resolveLalamoveSelections(sd));
      setLalamoveSlotError(null);
      setNotes(sd.lalamove?.notes ?? "");

      setJtAddressLine("");
      setJtBrgy("");
      setLbcFirstName("");
      setLbcLastName("");
      setLbcBranchName("");
      setLbcBranchCity("");
    }

    if (shippingMethod === "PICKUP") {
      setLalamoveAddress("");
      setLalamoveImageUrl("");
      setLalamoveSlots([]);
      setLalamoveSlotError(null);
      setJtAddressLine("");
      setJtBrgy("");
      setLbcFirstName("");
      setLbcLastName("");
      setLbcBranchName("");
      setLbcBranchCity("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingMethod, JSON.stringify(defaults)]);

  React.useEffect(() => {
    if (shippingMethod !== "PICKUP") return;
    const firstDay = pickupDayOptions[0]?.key ?? "";
    if (!firstDay) {
      setPickupDay("");
      setPickupSlot("");
      return;
    }
    if (!pickupDay || !pickupSchedule[pickupDay]?.length) {
      setPickupDay(firstDay);
    }
  }, [shippingMethod, pickupDayOptions, pickupSchedule, pickupDay]);

  React.useEffect(() => {
    if (shippingMethod !== "PICKUP") return;
    const slots = pickupSchedule[pickupDay] ?? [];
    if (!slots.length) {
      setPickupSlot("");
      return;
    }
    if (!pickupSlot || !slots.includes(pickupSlot)) {
      setPickupSlot(slots[0]);
    }
  }, [shippingMethod, pickupSchedule, pickupDay, pickupSlot]);

  async function onPickLalamoveImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setMsg(null);
    setLalamoveUploading(true);
    try {
      const url = await uploadLalamoveImage(file, user.id);
      setLalamoveImageUrl(url);
    } catch (err: any) {
      setMsg(err?.message ?? "Upload failed");
    } finally {
      setLalamoveUploading(false);
      e.target.value = "";
    }
  }

  function handleLalamoveSlotChange(next: LalamoveSelection[]) {
    setLalamoveSlots(next);
    if (next.length) setLalamoveSlotError(null);
  }

  const shipCounts = React.useMemo(
    () =>
      shipCountsFromLines(
        (selectedLines ?? []).map((l) => ({
          ship_class: (l.variant.ship_class as any) ?? null,
          qty: l.qty,
        }))
      ),
    [selectedLines]
  );
  const hasLalamoveOnly = shipCounts.LALAMOVE > 0;

  React.useEffect(() => {
    if (hasLalamoveOnly && shippingMethod !== "LALAMOVE") {
      setShippingMethod("LALAMOVE");
    }
  }, [hasLalamoveOnly, shippingMethod]);

  const lbcFitMap = React.useMemo(
    () => ({
      N_SAKTO: fitsCapacity(shipCounts, LBC_CAPACITY.N_SAKTO),
      MINIBOX: fitsCapacity(shipCounts, LBC_CAPACITY.MINIBOX),
      SMALL_BOX: fitsCapacity(shipCounts, LBC_CAPACITY.SMALL_BOX),
    }),
    [shipCounts]
  );

  const lbcAllowedPacks = React.useMemo(() => {
    const allowed: LbcPackage[] = [];
    if (lbcFitMap.N_SAKTO) allowed.push("N_SAKTO");
    if (lbcFitMap.MINIBOX) allowed.push("MINIBOX");
    if (lbcFitMap.SMALL_BOX) allowed.push("SMALL_BOX");
    return allowed;
  }, [lbcFitMap]);

  React.useEffect(() => {
    if (shippingMethod !== "LBC") return;
    if (!lbcAllowedPacks.length) return;
    if (!lbcAllowedPacks.includes(lbcPackageChoice)) {
      setLbcPackageChoice(lbcAllowedPacks[0]);
    }
  }, [shippingMethod, lbcAllowedPacks, lbcPackageChoice]);

  const shippingMeta = React.useMemo(() => {
    const counts = shipCounts;

    if (shippingMethod === "JNT") {
      const rec = recommendJntPouch(counts);
      if (!rec.ok) return { ok: false as const, error: rec.reason };
      return {
        ok: true as const,
        label: `J&T ${rec.pouch} pouch`,
        fee: jntFee(rec.pouch, region),
        pack: rec.pouch,
      };
    }

    if (shippingMethod === "LBC") {
      const pack = lbcPackageChoice;
      if (lbcFitMap[pack]) {
        return {
          ok: true as const,
          label: `LBC ${pack.replaceAll("_", " ")}`,
          fee: lbcFee(pack, region),
          pack,
        };
      }
      const rec = recommendLbcPackage(counts);
      if (!rec.ok) {
        return {
          ok: true as const,
          label: "LBC Medium Box (subject to approval)",
          fee: 0,
          pack: "MEDIUM_APPROVAL",
          warning: rec.reason,
        };
      }
      return {
        ok: true as const,
        label: `LBC ${rec.pack.replaceAll("_", " ")}`,
        fee: lbcFee(rec.pack, region),
        pack: rec.pack,
      };
    }

    if (shippingMethod === "PICKUP") {
      return { ok: true as const, label: "Store pickup", fee: 0, pack: null };
    }

    return { ok: true as const, label: "Lalamove", fee: 0, pack: null };
  }, [shipCounts, shippingMethod, region, lbcFitMap, lbcPackageChoice]);

  // ✅ COP => shipping fee is paid at branch, so DO NOT include shipping fee in total
  const fees = React.useMemo(() => {
    const shipping_fee =
      shippingMethod === "LALAMOVE" || shippingMethod === "PICKUP"
        ? 0
        : shippingMethod === "LBC" && lbcCop
        ? 0
        : shippingMeta.ok
        ? shippingMeta.fee
        : 0;

    const cop_fee =
      shippingMethod === "LBC" && lbcCop ? FEES.LBC_COP_CONVENIENCE : 0;
    const lalamove_fee =
      shippingMethod === "LALAMOVE" ? FEES.LALAMOVE_CONVENIENCE : 0;
    const priority_fee = priorityRequested ? FEES.PRIORITY_SHIPPING : 0;
    const insurance_fee = insuranceSelected
      ? Math.max(0, Number(insuranceFee) || 0)
      : 0;

    return { shipping_fee, cop_fee, lalamove_fee, priority_fee, insurance_fee };
  }, [
    shippingMethod,
    shippingMeta,
    lbcCop,
    priorityRequested,
    insuranceSelected,
    insuranceFee,
  ]);

  const total =
    itemsSubtotal +
    fees.shipping_fee +
    fees.cop_fee +
    fees.lalamove_fee +
    fees.priority_fee +
    fees.insurance_fee;

  const feeLines: FeeLine[] = React.useMemo(() => {
    const subtotalLabel = selectedIds ? "Selected items subtotal" : "Items subtotal";
    const out: FeeLine[] = [{ label: subtotalLabel, amount: itemsSubtotal }];

    if (shippingMethod === "JNT") {
      out.push({
        label: `Shipping fee (${REGION_LABEL[region]})`,
        amount: fees.shipping_fee,
      });
    }

    if (shippingMethod === "LBC") {
      if (lbcCop) {
        out.push({
          label: `Shipping fee (${REGION_LABEL[region]}) — PAY AT BRANCH`,
          amount: 0,
          muted: true,
        });
      } else {
        out.push({
          label: `Shipping fee (${REGION_LABEL[region]})`,
          amount: fees.shipping_fee,
        });
      }
    }

    if (shippingMethod === "PICKUP") {
      out.push({
        label: "Pickup (store)",
        amount: 0,
        muted: true,
      });
    }

    if (fees.cop_fee > 0)
      out.push({ label: "LBC COP convenience fee", amount: fees.cop_fee });
    if (fees.lalamove_fee > 0)
      out.push({
        label: "Lalamove convenience fee",
        amount: fees.lalamove_fee,
      });
    if (fees.priority_fee > 0)
      out.push({ label: "Priority shipping", amount: fees.priority_fee });

    if (insuranceSelected)
      out.push({ label: "Shipping insurance", amount: fees.insurance_fee });
    else
      out.push({
        label: "Shipping insurance (optional)",
        amount: suggestedInsurance,
        muted: true,
      });

    return out;
  }, [
    itemsSubtotal,
    selectedIds,
    shippingMethod,
    region,
    fees,
    insuranceSelected,
    suggestedInsurance,
    lbcCop,
  ]);

  async function placeOrder() {
    setMsg(null);
    setLalamoveSlotError(null);
    setSubmitAttempted(true);

    if (!user) return setMsg("Please login first.");
    if (!selectedLines.length)
      return setMsg("Please select at least one item in your cart.");

    const invalidLine = selectedLines.find(
      (l) => l.variant.qty <= 0 || l.qty > l.variant.qty
    );
    if (invalidLine)
      return setMsg(
        "Some items are sold out or exceed available stock. Please adjust your cart."
      );

    const sanitizedPhone = sanitizePhone(phone);
    if (!sanitizedPhone) return setMsg("Please fill in Contact Number.");
    if (!validatePhone11(sanitizedPhone))
      return setMsg("Use an 11-digit PH mobile number (09XXXXXXXXX).");

    if (
      shippingMethod === "JNT" ||
      shippingMethod === "LALAMOVE" ||
      shippingMethod === "PICKUP"
    ) {
      if (!name.trim()) return setMsg("Please fill in Name.");
    }

    if (shippingMethod === "JNT") {
      if (!jtBrgy.trim()) return setMsg("Barangay is required for J&T.");
      if (!jtAddressLine.trim())
        return setMsg("Please enter your J&T address.");
    }

    if (shippingMethod === "LBC") {
      if (!lbcFirstName.trim() || !lbcLastName.trim())
        return setMsg("First and Last name are required for LBC.");
      if (!lbcBranchName.trim() || !lbcBranchCity.trim())
        return setMsg("Please enter LBC Branch Name and Branch City.");
    }

    if (shippingMethod === "LALAMOVE") {
      if (!lalamoveAddress.trim())
        return setMsg(
          "Please enter your Lalamove drop-off address / landmark details."
        );
      if (!lalamoveSlots.length) {
        setLalamoveSlotError("Please select at least one Lalamove time slot.");
        return;
      }
    }

    if (shippingMethod === "PICKUP") {
      if (pickupUnavailable) {
        return setMsg("Pickup is currently unavailable.");
      }
      if (!pickupDayOptions.length) {
        return setMsg("Pickup schedule not set yet. Please choose another method.");
      }
      if (!pickupDay.trim()) {
        return setMsg("Please select a pickup day.");
      }
      if (!(pickupSchedule[pickupDay] ?? []).length) {
        return setMsg("Pickup timeslots are not available for that day.");
      }
      if (!pickupSlot.trim()) {
        return setMsg("Please select a pickup time slot.");
      }
    }

    try {
      const lalamoveSlotsPayload = lalamoveSlots.map((slot) => ({
        date: slot.date,
        window: slot.window_key,
        window_key: slot.window_key,
        window_label: slot.window_label,
      }));

      let shipping_details: Record<string, any>;
      if (shippingMethod === "JNT") {
        shipping_details = {
          method: "JNT",
          receiver_name: name.trim(),
          receiver_phone: sanitizedPhone,
          brgy: jtBrgy.trim(),
          address_line: jtAddressLine.trim(),
          full_address: `${jtAddressLine.trim()}, Brgy ${jtBrgy.trim()}`,
          region,
          package: shippingMeta.ok ? shippingMeta.pack : null,
          notes: notes.trim() || null,
        };
      } else if (shippingMethod === "LBC") {
        shipping_details = {
          method: "LBC",
          first_name: lbcFirstName.trim(),
          last_name: lbcLastName.trim(),
          receiver_phone: sanitizedPhone,
          branch_name: lbcBranchName.trim(),
          branch_city: lbcBranchCity.trim(),
          region,
          cop: lbcCop,
          pay_at_branch: lbcCop, // explicit flag
          package: shippingMeta.ok ? shippingMeta.pack : null,
          warning: (shippingMeta as any).warning ?? null,
          notes: notes.trim() || null,
        };
      } else if (shippingMethod === "PICKUP") {
        shipping_details = {
          method: "PICKUP",
          receiver_name: name.trim(),
          receiver_phone: sanitizedPhone,
          pickup_location: PICKUP_LOCATION,
          pickup_directory: PICKUP_DIRECTORY,
          pickup_day: pickupDay.trim(),
          pickup_slot: pickupSlot.trim(),
          notes: notes.trim() || null,
        };
      } else {
        shipping_details = {
          method: "LALAMOVE",
          receiver_name: name.trim(),
          receiver_phone: sanitizedPhone,
          dropoff_address: lalamoveAddress.trim(),
          map_image_url: lalamoveImageUrl || null,
          lalamove: lalamoveSlotsPayload[0] ?? null,
          lalamove_slots: lalamoveSlotsPayload,
          notes: notes.trim() || null,
        };
      }

      const order = await createOrderFromCart(
        {
          userId: user.id,
          payment_method: paymentMethod,
          shipping_method: shippingMethod,
          shipping_region:
            shippingMethod === "LALAMOVE" || shippingMethod === "PICKUP"
              ? null
              : region,
          shipping_details,
          fees,
          priority_requested: priorityRequested,
          insurance_selected: insuranceSelected,
          insurance_fee_user: insuranceFee,
        },
        selectedLines
      );

      try {
        if (typeof window !== "undefined") {
          const neverShow = window.localStorage.getItem(FEEDBACK_NEVER_SHOW_KEY);
          if (!neverShow) {
            window.localStorage.setItem(
              FEEDBACK_PROMPT_KEY,
              JSON.stringify({
                orderId: order?.id ?? null,
                createdAt: new Date().toISOString(),
              })
            );
          }
        }
      } catch {
        // Ignore localStorage issues.
      }

      await reload();
      router.push(`/orders`);
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message ?? "Failed to place order");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Checkout</h1>
        <div className="text-sm text-white/60">
          {settings?.shipping_schedule_text ? (
            <>
              <span className="text-white/70">Shipping schedule:</span>{" "}
              {settings.shipping_schedule_text}
            </>
          ) : (
            "Shipping schedule not set."
          )}
        </div>
        {settings?.shipping_cutoff_text ? (
          <div className="text-sm text-white/50">
            {settings.shipping_cutoff_text}
          </div>
        ) : null}
        {selectionNote ? (
          <div
            className={
              selectedLines.length
                ? "text-xs text-white/60"
                : "text-xs text-red-200"
            }
          >
            {selectionNote}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="font-semibold">Shipping & Payment</div>
            <div className="text-sm text-white/60">
              Fill up details then place your order.
            </div>
            <div className="text-xs text-red-200">
              Required boxes must be filled in. Skipped fields will block checkout.
            </div>
          </CardHeader>

          <CardBody className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Shipping method"
                value={shippingMethod}
                onChange={(e) =>
                  setShippingMethod(e.target.value as ShippingMethod)
                }
              >
                <option value="LALAMOVE">Lalamove</option>
                <option value="JNT" disabled={hasLalamoveOnly}>
                  J&amp;T
                </option>
                <option value="LBC" disabled={hasLalamoveOnly}>
                  LBC Pickup
                </option>
                <option value="PICKUP" disabled={hasLalamoveOnly}>
                  Store Pickup
                </option>
              </Select>

              <Select
                label="Payment method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
              >
                <option value="GCASH">GCash</option>
                <option value="BPI">BPI</option>
              </Select>
            </div>
            {hasLalamoveOnly ? (
              <div className="text-xs text-amber-200">
                Diorama items require Lalamove delivery.
              </div>
            ) : null}

            {shippingMethod === "JNT" || shippingMethod === "LBC" ? (
              <Select
                label="Region (for shipping fee table)"
                value={region}
                onChange={(e) => setRegion(e.target.value as Region)}
              >
                <option value="METRO_MANILA">Metro Manila</option>
                <option value="LUZON">Luzon</option>
                <option value="VISAYAS">Visayas</option>
                <option value="MINDANAO">Mindanao</option>
              </Select>
            ) : null}

            {/* Name + Phone */}
            {shippingMethod !== "LBC" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  label="Contact Number"
                  value={phone}
                  onChange={(e) => setPhone(sanitizePhone(e.target.value))}
                  onBlur={() => setPhoneTouched(true)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={PHONE_LENGTH}
                  error={phoneError}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Contact Number"
                  value={phone}
                  onChange={(e) => setPhone(sanitizePhone(e.target.value))}
                  onBlur={() => setPhoneTouched(true)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={PHONE_LENGTH}
                  error={phoneError}
                />
                <div />
              </div>
            )}

            {shippingMethod === "JNT" ? (
              <div className="space-y-3">
                <Input
                  label="Barangay (required)"
                  value={jtBrgy}
                  onChange={(e) => setJtBrgy(e.target.value)}
                />
                <Textarea
                  label="J&T Address (House/Street/City/Province)"
                  rows={3}
                  value={jtAddressLine}
                  onChange={(e) => setJtAddressLine(e.target.value)}
                />
              </div>
            ) : null}

            {shippingMethod === "LBC" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="First Name"
                    value={lbcFirstName}
                    onChange={(e) => setLbcFirstName(e.target.value)}
                  />
                  <Input
                    label="Last Name"
                    value={lbcLastName}
                    onChange={(e) => setLbcLastName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="LBC Branch Name"
                    value={lbcBranchName}
                    onChange={(e) => setLbcBranchName(e.target.value)}
                  />
                  <Input
                    label="Branch City"
                    value={lbcBranchCity}
                    onChange={(e) => setLbcBranchCity(e.target.value)}
                  />
                </div>

                {lbcAllowedPacks.length ? (
                  <Select
                    label="LBC Package"
                    value={lbcPackageChoice}
                    onChange={(e) =>
                      setLbcPackageChoice(e.target.value as LbcPackage)
                    }
                  >
                    {lbcAllowedPacks.includes("N_SAKTO") ? (
                      <option value="N_SAKTO">N-Sakto pouch</option>
                    ) : null}
                    {lbcAllowedPacks.includes("MINIBOX") ? (
                      <option value="MINIBOX">Mini Box</option>
                    ) : null}
                    {lbcAllowedPacks.includes("SMALL_BOX") ? (
                      <option value="SMALL_BOX">Small Box</option>
                    ) : null}
                  </Select>
                ) : null}

                <label className="flex items-start gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={lbcCop}
                    onChange={(e) => setLbcCop(e.target.checked)}
                    className="h-4 w-4 mt-1"
                  />
                  <div className="space-y-1">
                    <div>
                      <span className="font-semibold">Pay at branch (COP)</span>{" "}
                      (+{formatPHP(FEES.LBC_COP_CONVENIENCE)} convenience fee)
                    </div>
                    <div className="text-xs text-white/60">
                      Shipping/courier fee will be paid at the LBC branch upon
                      pickup, so it is not included in your total.
                    </div>
                  </div>
                </label>
              </div>
            ) : null}

            {shippingMethod === "LALAMOVE" ? (
              <div className="space-y-4">
                <Textarea
                  label="Lalamove Drop-off Address / Landmark"
                  rows={3}
                  value={lalamoveAddress}
                  onChange={(e) => setLalamoveAddress(e.target.value)}
                />

                <div>
                  <div className="mb-1 text-sm text-white/80">
                    Pinned map screenshot (image upload)
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onPickLalamoveImage}
                  />
                  <div className="mt-1 text-xs text-white/60">
                    {lalamoveUploading
                      ? "Uploading..."
                      : lalamoveImageUrl
                      ? "Map screenshot ready."
                      : "No image yet."}
                  </div>
                  {lalamoveImageUrl ? (
                    <img
                      src={lalamoveImageUrl}
                      alt="Lalamove map screenshot"
                      className="mt-2 h-28 w-auto rounded-lg border border-white/10 object-cover"
                    />
                  ) : null}
                </div>

                <LalamoveTimeSlotPicker
                  value={lalamoveSlots}
                  onChange={handleLalamoveSlotChange}
                  error={lalamoveSlotError}
                  helperText={`Lalamove adds a ${formatPHP(
                    FEES.LALAMOVE_CONVENIENCE
                  )} convenience fee.`}
                />
              </div>
            ) : null}

            {shippingMethod === "PICKUP" ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-bg-900/20 p-4 space-y-2">
                  <div className="font-semibold">Pickup location</div>
                  <div className="text-sm text-white/70">{PICKUP_LOCATION}</div>
                  <div className="text-xs text-white/50">Directory: {PICKUP_DIRECTORY}</div>
                </div>

                {pickupUnavailable ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                    Pickup is currently unavailable.
                  </div>
                ) : null}

                <Select
                  label="Pickup day"
                  value={pickupDay}
                  onChange={(e) => setPickupDay(e.target.value)}
                  disabled={pickupUnavailable || pickupDayOptions.length === 0}
                >
                  <option value="">Select a day</option>
                  {pickupDayOptions.map((day) => (
                    <option key={day.key} value={day.key}>
                      {day.label}
                    </option>
                  ))}
                </Select>

                <Select
                  label="Pickup timeslot"
                  value={pickupSlot}
                  onChange={(e) => setPickupSlot(e.target.value)}
                  disabled={
                    pickupUnavailable || !pickupDay || pickupSlotsForDay.length === 0
                  }
                >
                  <option value="">Select a timeslot</option>
                  {pickupSlotsForDay.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </Select>

                {!pickupUnavailable && pickupDayOptions.length === 0 ? (
                  <div className="text-xs text-white/50">Pickup schedule not set yet.</div>
                ) : null}
                {!pickupUnavailable && pickupDay && pickupSlotsForDay.length === 0 ? (
                  <div className="text-xs text-white/50">No timeslots for the selected day.</div>
                ) : null}
              </div>
            ) : null}

            <Textarea
              label="Order notes (optional)"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-bg-900/20 p-4 space-y-2">
                <div className="font-semibold">Priority shipping</div>
                {priorityAvailable ? (
                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                      type="checkbox"
                      checked={priorityRequested}
                      onChange={(e) => setPriorityRequested(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Request priority shipping (+
                    {formatPHP(FEES.PRIORITY_SHIPPING)})
                  </label>
                ) : (
                  <div className="text-sm text-red-200">Not available</div>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-bg-900/20 p-4 space-y-2">
                <div className="font-semibold">
                  Shipping insurance (optional)
                </div>
                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={insuranceSelected}
                    onChange={(e) => setInsuranceSelected(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Add insurance
                </label>
                <Input
                  label="Insurance fee"
                  type="number"
                  min={0}
                  step={1}
                  value={String(insuranceFee)}
                  onChange={(e) => setInsuranceFee(Number(e.target.value))}
                  hint={`Suggested: ${formatPHP(suggestedInsurance)}`}
                />
              </div>
            </div>

            {shippingMeta.ok && (shippingMeta as any).warning ? (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
                {(shippingMeta as any).warning}
              </div>
            ) : null}

            {msg ? <div className="text-sm text-red-200">{msg}</div> : null}
          </CardBody>

          <CardFooter className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Button
              onClick={placeOrder}
              disabled={cartLoading || selectedLines.length === 0}
            >
              Place order
            </Button>
            <div className="text-sm text-white/70">
              Total:{" "}
              <span className="text-price">{formatPHP(total)}</span>
            </div>
          </CardFooter>
        </Card>

        <div className="space-y-4">
          <FeeBreakdown lines={feeLines} total={total} />
        </div>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <RequireAuth>
      <CheckoutContent />
    </RequireAuth>
  );
}



