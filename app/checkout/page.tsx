"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/lib/supabase/browser";
import { useCart } from "@/hooks/useCart";
import { useSettings } from "@/hooks/useSettings";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { FeeBreakdown, type FeeLine } from "@/components/checkout/FeeBreakdown";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  LalamoveTimeSlotPicker,
  LALAMOVE_WINDOWS,
  type LalamoveSelection,
  type LalamoveWindowKey,
} from "@/components/checkout/LalamoveTimeSlotPicker";
import { LalamoveMapPickerModal } from "@/components/lalamove/LalamoveMapPickerModal";
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
  mergeShippingDefaults,
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
import { resolveEffectivePrice } from "@/lib/pricing";
import { protectorUnitFee } from "@/lib/addons";
import {
  getVoucherEligibility,
  type Voucher,
  type VoucherWallet,
} from "@/lib/vouchers";

type ShippingMethod = "LALAMOVE" | "JNT" | "LBC" | "PICKUP";
const PHONE_LENGTH = PHONE_MAX_LENGTH;

type VoucherWalletRow = Omit<VoucherWallet, "voucher"> & {
  voucher: Voucher | Voucher[] | null;
};

type PhBarangayLocation = {
  label: string;
  barangay: string;
  city: string;
  province: string;
  district?: string | null;
};

const LALAMOVE_WINDOW_LABELS = new Map<LalamoveWindowKey, string>(
  LALAMOVE_WINDOWS.map((window) => [window.key, window.label] as const),
);

const LEGACY_LALAMOVE_WINDOW_MAP: Record<string, LalamoveWindowKey> = {
  "8-12": "08_12",
  "9-12": "08_12",
  "12-3": "12_15",
  "3-6": "15_18",
  "6-9": "18_21",
};

const LeafletMapPreview = dynamic(
  () => import("@/components/lalamove/LeafletMap"),
  { ssr: false },
);

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
  key: string | null | undefined,
): LalamoveSelection | null {
  if (!date || !key || !isLalamoveWindowKey(key)) return null;
  const label = LALAMOVE_WINDOW_LABELS.get(key);
  if (!label) return null;
  return { date, window_key: key, window_label: label };
}

function buildLalamoveSelectionFromLegacy(
  date: string | null | undefined,
  window: string | null | undefined,
): LalamoveSelection | null {
  if (!date || !window) return null;
  const normalized = String(window).trim();
  if (isLalamoveWindowKey(normalized))
    return buildLalamoveSelection(date, normalized);
  const directLabel = LALAMOVE_WINDOWS.find((w) => w.label === normalized);
  if (directLabel) return buildLalamoveSelection(date, directLabel.key);
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
  slot: LalamoveSlotInput | null | undefined,
): LalamoveSelection | null {
  if (!slot?.date) return null;
  if (slot.window_key && isLalamoveWindowKey(slot.window_key)) {
    const label =
      slot.window_label ?? LALAMOVE_WINDOW_LABELS.get(slot.window_key);
    if (!label) return null;
    return {
      date: slot.date,
      window_key: slot.window_key,
      window_label: label,
    };
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

const LOCATION_SUGGESTION_LIMIT = 20;

function normalizeBarangayLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^brgy\b/i.test(trimmed)) {
    return `Brgy ${trimmed.replace(/^brgy\s*/i, "").trim()}`;
  }
  if (/^barangay\b/i.test(trimmed)) {
    return `Brgy ${trimmed.replace(/^barangay\s*/i, "").trim()}`;
  }
  return trimmed;
}

function buildJntLocationLabel(
  barangay: string,
  city: string,
  province: string,
): string {
  const normalizedBarangay = normalizeBarangayLabel(barangay);
  const parts = [normalizedBarangay, city, province]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.join(" - ");
}

function findBarangayLocationByLabel(
  items: PhBarangayLocation[],
  value: string,
): PhBarangayLocation | null {
  const target = value.trim();
  if (!target) return null;
  return items.find((item) => item.label === target) ?? null;
}

function filterBarangayLocations(
  items: PhBarangayLocation[],
  value: string,
  minChars = 2,
) {
  const query = value.trim().toLowerCase();
  if (query.length < minChars) return [];
  const startsWith: PhBarangayLocation[] = [];
  const contains: PhBarangayLocation[] = [];

  for (const item of items) {
    const lower = item.label.toLowerCase();
    if (lower.startsWith(query)) {
      startsWith.push(item);
    } else if (lower.includes(query)) {
      contains.push(item);
    }
    if (startsWith.length + contains.length >= LOCATION_SUGGESTION_LIMIT) break;
  }

  return [...startsWith, ...contains].slice(0, LOCATION_SUGGESTION_LIMIT);
}

function findBarangayLocationByParts(
  items: PhBarangayLocation[],
  barangay: string,
  city: string,
  province: string,
): PhBarangayLocation | null {
  const normalizedBarangay = normalizeBarangayLabel(barangay);
  const targetCity = city.trim();
  const targetProvince = province.trim();
  if (!normalizedBarangay || !targetCity || !targetProvince) return null;
  return (
    items.find(
      (item) =>
        item.barangay === normalizedBarangay &&
        item.city === targetCity &&
        item.province === targetProvince,
    ) ?? null
  );
}

type CheckoutAuthModalProps = {
  open: boolean;
  checkoutRedirect: string;
};

function CheckoutAuthModal({ open, checkoutRedirect }: CheckoutAuthModalProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open || !mounted) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md">
        <Card className="border border-white/10 bg-bg-900/95 shadow-soft">
          <CardHeader className="space-y-1">
            <div className="text-xl font-semibold">Checkout</div>
            <div className="text-sm text-white/60">
              Login or create an account to complete checkout.
            </div>
          </CardHeader>
          <CardFooter className="flex flex-wrap gap-2">
            <Link
              href={`/auth/login?redirect=${encodeURIComponent(
                checkoutRedirect,
              )}`}
            >
              <Button>Login</Button>
            </Link>
            <Link
              href={`/auth/register?redirect=${encodeURIComponent(
                checkoutRedirect,
              )}`}
            >
              <Button variant="secondary">Create account</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

type VoucherModalProps = {
  open: boolean;
  vouchers: VoucherWallet[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: () => void;
  onClose: () => void;
  subtotal: number;
  shippingFee: number;
};

type JntLocationModalProps = {
  open: boolean;
  value: string;
  locations: PhBarangayLocation[];
  loading: boolean;
  error: string | null;
  onApply: (value: string) => void;
  onClear: () => void;
  onClose: () => void;
};

function JntLocationModal({
  open,
  value,
  locations,
  loading,
  error,
  onApply,
  onClear,
  onClose,
}: JntLocationModalProps) {
  const [draft, setDraft] = React.useState(value);
  const [draftError, setDraftError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setDraft(value);
    setDraftError(null);
  }, [open, value]);

  React.useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  const suggestions = React.useMemo(
    () => filterBarangayLocations(locations, draft, 2),
    [locations, draft],
  );

  if (!open || typeof document === "undefined") return null;

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Card className="border border-white/10 bg-bg-900/95 shadow-soft">
          <CardHeader className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">Find your barangay</div>
              <div className="text-xs text-white/60">
                Search and select your barangay, city, and province.
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              label="Search location"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setDraftError(null);
              }}
              placeholder="Brgy 123 - Manila - Metro Manila"
              hint="Start typing your barangay name."
            />

            {loading ? (
              <div className="text-xs text-white/50">
                Loading location suggestions...
              </div>
            ) : null}
            {error ? <div className="text-xs text-red-200">{error}</div> : null}
            {draftError ? (
              <div className="text-xs text-red-200">{draftError}</div>
            ) : null}

            <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-bg-900/40">
              {suggestions.length ? (
                <div className="divide-y divide-white/5">
                  {suggestions.map((location) => (
                    <button
                      key={location.label}
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm text-white/80 hover:bg-white/5"
                      onClick={() => {
                        onApply(location.label);
                        onClose();
                      }}
                    >
                      {location.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-sm text-white/50">
                  Start typing to see suggestions.
                </div>
              )}
            </div>
          </CardBody>
          <CardFooter className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              Clear selection
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const match = findBarangayLocationByLabel(locations, draft);
                if (!match) {
                  setDraftError("Select a location from the suggestions.");
                  return;
                }
                onApply(match.label);
                onClose();
              }}
            >
              Use this location
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function formatVoucherDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function VoucherModal({
  open,
  vouchers,
  selectedId,
  onSelect,
  onRemove,
  onClose,
  subtotal,
  shippingFee,
}: VoucherModalProps) {
  React.useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const available = vouchers.filter((v) => v.status === "AVAILABLE");

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl">
        <Card className="border border-white/10 bg-bg-900/95 shadow-soft">
          <CardHeader className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">Select a voucher</div>
              <div className="text-xs text-white/60">
                Free shipping vouchers apply to shipping fee only.
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </CardHeader>
          <CardBody className="space-y-3">
            {available.length === 0 ? (
              <div className="text-sm text-white/60">
                No available vouchers.
              </div>
            ) : (
              <div className="space-y-3">
                {available.map((wallet) => {
                  const voucher = wallet.voucher;
                  const eligibility = getVoucherEligibility({
                    voucher,
                    walletExpiresAt: wallet.expires_at ?? null,
                    subtotal,
                    shippingFee,
                  });
                  const isSelected = selectedId === wallet.id;
                  return (
                    <div
                      key={wallet.id}
                      className={`rounded-xl border p-3 ${
                        isSelected
                          ? "border-accent-500/40 bg-accent-500/10"
                          : "border-white/10 bg-bg-900/40"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">
                            {voucher.title || "Free Shipping"}
                          </div>
                          <div className="text-xs text-white/60">
                            Min spend{" "}
                            {formatPHP(Number(voucher.min_subtotal ?? 0))} - Cap{" "}
                            {formatPHP(Number(voucher.shipping_cap ?? 0))}
                          </div>
                        </div>
                        <div className="text-xs text-white/60">
                          Expires:{" "}
                          {formatVoucherDate(
                            wallet.expires_at ?? voucher.expires_at,
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div
                          className={
                            eligibility.eligible
                              ? "text-xs text-emerald-200"
                              : "text-xs text-white/50"
                          }
                        >
                          {eligibility.eligible
                            ? `Eligible - Discount ${formatPHP(eligibility.discount)}`
                            : `Ineligible - ${eligibility.reason ?? "Not eligible"}`}
                        </div>
                        <div className="flex items-center gap-2">
                          {isSelected ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={onRemove}
                            >
                              Remove
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => onSelect(wallet.id)}
                              disabled={!eligibility.eligible}
                            >
                              Apply
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function resolveLalamoveSelections(sd: ShippingDefaults): LalamoveSelection[] {
  const selections: LalamoveSelection[] = [];

  const stored = sd.lalamove?.lalamove;
  const storedSelection = buildLalamoveSelection(
    stored?.date,
    stored?.window_key,
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
    return lines.filter(
      (line) => idSet.has(line.id) || idSet.has(line.variant_id),
    );
  }, [lines, selectedIds]);
  const selectionNote = selectedIds
    ? cartLoading
      ? null
      : selectedLines.length
        ? `${selectedLines.length} selected item(s) from your cart.`
        : "No selected items from your cart. Go back to cart to choose items."
    : null;
  const checkoutRedirect = selectedParam
    ? `/checkout?selected=${encodeURIComponent(selectedParam)}`
    : "/checkout";

  const [msg, setMsg] = React.useState<string | null>(null);

  const [shippingMethod, setShippingMethod] =
    React.useState<ShippingMethod>("LALAMOVE");
  const [region, setRegion] = React.useState<Region>("METRO_MANILA");
  const [lbcCop, setLbcCop] = React.useState(false);
  const [paymentMethod, setPaymentMethod] = React.useState<"GCASH" | "BPI">(
    "GCASH",
  );

  const [defaults, setDefaults] = React.useState<ShippingDefaults>(() =>
    normalizeShippingDefaults({}),
  );
  const [defaultsRaw, setDefaultsRaw] = React.useState<unknown>({});

  const [voucherWallet, setVoucherWallet] = React.useState<VoucherWallet[]>([]);
  const [voucherLoading, setVoucherLoading] = React.useState(false);
  const [voucherError, setVoucherError] = React.useState<string | null>(null);
  const [voucherOpen, setVoucherOpen] = React.useState(false);
  const [selectedVoucherWalletId, setSelectedVoucherWalletId] = React.useState<
    string | null
  >(null);
  const [voucherNotice, setVoucherNotice] = React.useState<string | null>(null);

  // Shared
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [phoneTouched, setPhoneTouched] = React.useState(false);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  // J&T
  const [jtHouseStreetUnit, setJtHouseStreetUnit] = React.useState("");
  const [jtBarangay, setJtBarangay] = React.useState("");
  const [jtCity, setJtCity] = React.useState("");
  const [jtProvince, setJtProvince] = React.useState("");
  const [jtPostalCode, setJtPostalCode] = React.useState("");
  const [jtLocationQuery, setJtLocationQuery] = React.useState("");
  const [jtLocationModalOpen, setJtLocationModalOpen] = React.useState(false);
  const [phBarangayLocations, setPhBarangayLocations] = React.useState<
    PhBarangayLocation[]
  >([]);
  const [locationsLoading, setLocationsLoading] = React.useState(false);
  const [locationsError, setLocationsError] = React.useState<string | null>(
    null,
  );

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
  const [lalamoveMapLink, setLalamoveMapLink] = React.useState("");
  const [lalamoveMapCoords, setLalamoveMapCoords] = React.useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [lalamovePinLoading, setLalamovePinLoading] = React.useState(false);
  const [lalamovePinError, setLalamovePinError] = React.useState<string | null>(
    null,
  );
  const [lalamoveSlots, setLalamoveSlots] = React.useState<LalamoveSelection[]>(
    [],
  );
  const [lalamoveSlotError, setLalamoveSlotError] = React.useState<
    string | null
  >(null);
  const [lalamoveMapPickerOpen, setLalamoveMapPickerOpen] =
    React.useState(false);

  const [pickupDay, setPickupDay] = React.useState("");
  const [pickupSlot, setPickupSlot] = React.useState("");

  const [notes, setNotes] = React.useState("");
  const [saveAsDefault, setSaveAsDefault] = React.useState(false);

  const phoneError = formatPhoneError(phone, phoneTouched || submitAttempted);

  // Priority shipping UI can stay, but DB may not have columns (we handle in lib/orders.ts)
  const priorityAvailable = Boolean(settings?.priority_shipping_available);
  const [priorityRequested, setPriorityRequested] = React.useState(false);

  const pickupSchedule = React.useMemo(() => {
    const schedule: Record<string, string[]> = {};
    const raw = (settings?.pickup_schedule ?? null) as Record<
      string,
      unknown
    > | null;
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
    [pickupSchedule],
  );

  const pickupSlotsForDay = React.useMemo(
    () => (pickupDay ? (pickupSchedule[pickupDay] ?? []) : []),
    [pickupDay, pickupSchedule],
  );

  const pickupUnavailable = Boolean(settings?.pickup_unavailable);

  React.useEffect(() => {
    let mounted = true;
    if (shippingMethod !== "JNT") return undefined;
    if (phBarangayLocations.length) return undefined;

    async function loadLocations() {
      setLocationsLoading(true);
      setLocationsError(null);
      try {
        const res = await fetch("/data/ph-barangay-locations.json");
        if (!res.ok) {
          throw new Error("Failed to load location data.");
        }
        const locations = await res.json();
        if (!mounted) return;
        setPhBarangayLocations(Array.isArray(locations) ? locations : []);
      } catch (err) {
        if (!mounted) return;
        setLocationsError("Failed to load location suggestions.");
      } finally {
        if (mounted) setLocationsLoading(false);
      }
    }

    loadLocations();
    return () => {
      mounted = false;
    };
  }, [shippingMethod, phBarangayLocations.length]);

  React.useEffect(() => {
    if (shippingMethod !== "JNT") return;
    if (!phBarangayLocations.length) return;
    if (jtLocationQuery.trim()) {
      const exact = findBarangayLocationByLabel(
        phBarangayLocations,
        jtLocationQuery,
      );
      if (exact) return;
    }
    const match = findBarangayLocationByParts(
      phBarangayLocations,
      jtBarangay,
      jtCity,
      jtProvince,
    );
    if (!match) return;
    if (match.label !== jtLocationQuery) {
      setJtLocationQuery(match.label);
    }
  }, [
    shippingMethod,
    phBarangayLocations,
    jtLocationQuery,
    jtBarangay,
    jtCity,
    jtProvince,
  ]);

  // Insurance
  const itemsSubtotal = React.useMemo(
    () =>
      (selectedLines ?? []).reduce((sum, l) => {
        const basePrice = resolveEffectivePrice({
          price: Number(l.variant.price),
          sale_price: l.variant.sale_price ?? null,
          discount_percent: l.variant.discount_percent ?? null,
        }).effectivePrice;
        const addOn = protectorUnitFee(
          l.variant.ship_class,
          Boolean(l.protector_selected),
        );
        return sum + (basePrice + addOn) * l.qty;
      }, 0),
    [selectedLines],
  );
  const suggestedInsurance = React.useMemo(
    () => suggestedInsuranceFee(itemsSubtotal),
    [itemsSubtotal],
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
      setDefaultsRaw(rawDefaults ?? {});

      const profileName = (data as any)?.name as string | null;
      const profilePhone = (data as any)?.contact as string | null;
      setName(
        profileName ??
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          "",
      );
      setPhone(
        sanitizePhone(profilePhone ?? user.user_metadata?.contact_number ?? ""),
      );
    }

    run();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  React.useEffect(() => {
    let mounted = true;

    async function loadVouchers() {
      if (!user) {
        setVoucherWallet([]);
        setVoucherLoading(false);
        return;
      }

      setVoucherLoading(true);
      setVoucherError(null);

      const { data, error } = await supabase
        .from("voucher_wallet")
        .select(
          "id,status,claimed_at,used_at,expires_at,voucher:vouchers(id,code,title,kind,min_subtotal,shipping_cap,starts_at,expires_at,is_active)",
        )
        .eq("user_id", user.id)
        .order("claimed_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error("Failed to load vouchers:", error);
        setVoucherError(error.message || "Failed to load vouchers.");
        setVoucherWallet([]);
      } else {
        const rows = (data ?? []) as VoucherWalletRow[];
        const normalized = rows
          .map((row) => {
            const voucher = Array.isArray(row.voucher)
              ? row.voucher[0]
              : row.voucher;
            if (!voucher) return null;
            return { ...row, voucher } as VoucherWallet;
          })
          .filter((row): row is VoucherWallet => Boolean(row));
        setVoucherWallet(normalized);
      }
      setVoucherLoading(false);
    }

    loadVouchers();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // Apply defaults when switching method
  React.useEffect(() => {
    const sd = defaults;
    if (shippingMethod !== "JNT") {
      setJtLocationModalOpen(false);
    }

    if (shippingMethod === "JNT") {
      const normalizedJtBarangay = normalizeBarangayLabel(
        String(sd.jnt?.barangay ?? ""),
      );
      setName(sd.jnt?.recipient_name ?? name);
      setPhone(sanitizePhone(sd.jnt?.contact_number ?? phone));
      setJtHouseStreetUnit(sd.jnt?.house_street_unit ?? "");
      setJtBarangay(normalizedJtBarangay);
      setJtCity(sd.jnt?.city ?? "");
      setJtProvince(sd.jnt?.province ?? "");
      setJtPostalCode(sd.jnt?.postal_code ?? "");
      setJtLocationQuery(
        buildJntLocationLabel(
          normalizedJtBarangay,
          String(sd.jnt?.city ?? ""),
          String(sd.jnt?.province ?? ""),
        ),
      );
      setNotes(sd.jnt?.notes ?? "");

      setLbcFirstName("");
      setLbcLastName("");
      setLbcBranchName("");
      setLbcBranchCity("");
      setLalamoveAddress("");
      setLalamoveImageUrl("");
      setLalamoveMapLink("");
      setLalamoveMapCoords(null);
      setLalamoveSlots([]);
      setLalamoveSlotError(null);
      setLalamovePinError(null);
      setLalamovePinLoading(false);
    }

    if (shippingMethod === "LBC") {
      setLbcFirstName(sd.lbc?.first_name ?? "");
      setLbcLastName(sd.lbc?.last_name ?? "");
      setPhone(sanitizePhone(sd.lbc?.contact_number ?? phone));
      setLbcBranchName(sd.lbc?.branch ?? "");
      setLbcBranchCity(sd.lbc?.city ?? "");
      setNotes(sd.lbc?.notes ?? "");
      setLbcPackageChoice("N_SAKTO");

      setJtHouseStreetUnit("");
      setJtBarangay("");
      setJtCity("");
      setJtProvince("");
      setJtPostalCode("");
      setJtLocationQuery("");
      setLalamoveAddress("");
      setLalamoveImageUrl("");
      setLalamoveMapLink("");
      setLalamoveMapCoords(null);
      setLalamoveSlots([]);
      setLalamoveSlotError(null);
      setLalamovePinError(null);
      setLalamovePinLoading(false);
    }

    if (shippingMethod === "LALAMOVE") {
      setName(sd.lalamove?.recipient_name ?? name);
      setPhone(sanitizePhone(sd.lalamove?.recipient_phone ?? phone));
      setLalamoveAddress(sd.lalamove?.dropoff_address ?? "");
      setLalamoveImageUrl(sd.lalamove?.map_screenshot_url ?? "");
      setLalamoveMapLink(String(sd.lalamove?.map_url ?? ""));
      const mapLat = Number(sd.lalamove?.map_lat);
      const mapLng = Number(sd.lalamove?.map_lng);
      if (Number.isFinite(mapLat) && Number.isFinite(mapLng)) {
        setLalamoveMapCoords({ lat: mapLat, lng: mapLng });
      } else {
        setLalamoveMapCoords(null);
      }
      setLalamoveSlots(resolveLalamoveSelections(sd));
      setLalamoveSlotError(null);
      setNotes(sd.lalamove?.notes ?? "");
      setLalamovePinError(null);
      setLalamovePinLoading(false);

      setJtHouseStreetUnit("");
      setJtBarangay("");
      setJtCity("");
      setJtProvince("");
      setJtPostalCode("");
      setJtLocationQuery("");
      setLbcFirstName("");
      setLbcLastName("");
      setLbcBranchName("");
      setLbcBranchCity("");
    }

    if (shippingMethod === "PICKUP") {
      setLalamoveAddress("");
      setLalamoveImageUrl("");
      setLalamoveMapLink("");
      setLalamoveMapCoords(null);
      setLalamoveSlots([]);
      setLalamoveSlotError(null);
      setLalamovePinError(null);
      setLalamovePinLoading(false);
      setJtHouseStreetUnit("");
      setJtBarangay("");
      setJtCity("");
      setJtProvince("");
      setJtPostalCode("");
      setJtLocationQuery("");
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

  function clearJntLocation() {
    setJtLocationQuery("");
    setJtBarangay("");
    setJtCity("");
    setJtProvince("");
    setJtPostalCode("");
  }

  function onJntLocationChange(nextValue: string) {
    setJtLocationQuery(nextValue);
    const match = findBarangayLocationByLabel(phBarangayLocations, nextValue);
    if (match) {
      setJtBarangay(normalizeBarangayLabel(match.barangay));
      setJtCity(match.city);
      setJtProvince(match.province);
      setJtPostalCode("");
      return;
    }
    setJtBarangay("");
    setJtCity("");
    setJtProvince("");
    setJtPostalCode("");
  }

  async function requestLalamovePin(payload: {
    address?: string;
    lat?: number;
    lng?: number;
  }): Promise<boolean> {
    setLalamovePinError(null);
    setLalamovePinLoading(true);
    let ok = false;

    try {
      const res = await fetch("/api/lalamove/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to pin map.");
      }

      const data = json.data ?? {};
      const mapImageUrl = String(data.map_image_url ?? "");
      const mapUrl = String(data.map_url ?? "");
      const lat = Number(data.lat);
      const lng = Number(data.lng);

      setLalamoveImageUrl(mapImageUrl);
      setLalamoveMapLink(mapUrl);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setLalamoveMapCoords({ lat, lng });
      } else {
        setLalamoveMapCoords(null);
      }

      if (
        !payload.address &&
        typeof data.address === "string" &&
        data.address
      ) {
        setLalamoveAddress(data.address);
      }
      ok = true;
    } catch (err: any) {
      setLalamovePinError(err?.message ?? "Failed to pin map.");
    } finally {
      setLalamovePinLoading(false);
    }
    return ok;
  }

  function onUseCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLalamovePinError("Geolocation is not supported on this device.");
      return;
    }

    setLalamovePinError(null);
    setLalamovePinLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        requestLalamovePin({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        setLalamovePinLoading(false);
        setLalamovePinError(err?.message || "Unable to get current location.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function onSaveLalamoveMapPin(pos: { lat: number; lng: number }) {
    const ok = await requestLalamovePin({ lat: pos.lat, lng: pos.lng });
    if (ok) setLalamoveMapPickerOpen(false);
  }

  async function persistCheckoutDefaults(nextDefaults: ShippingDefaults) {
    if (!user) return;
    const mergedDefaults = mergeShippingDefaults(defaultsRaw, nextDefaults);
    const { data, error } = await supabase
      .from("customers")
      .upsert(
        { id: user.id, shipping_defaults: mergedDefaults },
        { onConflict: "id" },
      )
      .select("shipping_defaults")
      .single();

    if (error) throw error;

    const savedRaw = (data as any)?.shipping_defaults ?? mergedDefaults;
    const savedDefaults = normalizeShippingDefaults(savedRaw);
    setDefaults(savedDefaults);
    setDefaultsRaw(savedRaw ?? mergedDefaults);
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
        })),
      ),
    [selectedLines],
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
    [shipCounts],
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
    const insurance_fee =
      shippingMethod !== "LALAMOVE" && insuranceSelected
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

  const selectedVoucher = React.useMemo(
    () =>
      voucherWallet.find((voucher) => voucher.id === selectedVoucherWalletId) ??
      null,
    [voucherWallet, selectedVoucherWalletId],
  );

  const voucherEligibility = React.useMemo(() => {
    if (!selectedVoucher) return null;
    return getVoucherEligibility({
      voucher: selectedVoucher.voucher,
      walletExpiresAt: selectedVoucher.expires_at ?? null,
      subtotal: itemsSubtotal,
      shippingFee: fees.shipping_fee,
    });
  }, [selectedVoucher, itemsSubtotal, fees.shipping_fee]);

  const shippingDiscount = voucherEligibility?.eligible
    ? voucherEligibility.discount
    : 0;

  React.useEffect(() => {
    if (!selectedVoucherWalletId) {
      setVoucherNotice(null);
      return;
    }
    if (!selectedVoucher || !voucherEligibility?.eligible) {
      setSelectedVoucherWalletId(null);
      setVoucherNotice(
        voucherEligibility?.reason
          ? `Voucher removed: ${voucherEligibility.reason}`
          : "Voucher removed.",
      );
    } else {
      setVoucherNotice(null);
    }
  }, [
    selectedVoucherWalletId,
    selectedVoucher,
    voucherEligibility?.eligible,
    voucherEligibility?.reason,
  ]);

  const total =
    itemsSubtotal +
    fees.shipping_fee +
    fees.cop_fee +
    fees.lalamove_fee +
    fees.priority_fee +
    fees.insurance_fee -
    shippingDiscount;

  const feeLines: FeeLine[] = React.useMemo(() => {
    const subtotalLabel = selectedIds
      ? "Selected items subtotal"
      : "Items subtotal";
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

    if (shippingDiscount > 0) {
      out.push({ label: "Shipping discount", amount: -shippingDiscount });
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

    if (shippingMethod !== "LALAMOVE") {
      if (insuranceSelected)
        out.push({ label: "Shipping insurance", amount: fees.insurance_fee });
      else
        out.push({
          label: "Shipping insurance (optional)",
          amount: suggestedInsurance,
          muted: true,
        });
    }

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
      (l) => l.variant.qty <= 0 || l.qty > l.variant.qty,
    );
    if (invalidLine)
      return setMsg(
        "Some items are sold out or exceed available stock. Please adjust your cart.",
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
      if (!jtHouseStreetUnit.trim())
        return setMsg("House/Street/Unit is required for J&T.");
      if (!jtCity.trim()) return setMsg("City is required for J&T.");
      if (!jtProvince.trim()) return setMsg("Province is required for J&T.");
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
          "Please enter your Lalamove drop-off address / landmark details.",
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
        return setMsg(
          "Pickup schedule not set yet. Please choose another method.",
        );
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

      const jtHouseStreetUnitTrimmed = jtHouseStreetUnit.trim();
      const jtBarangayTrimmed = jtBarangay.trim();
      const jtBarangayNormalized = normalizeBarangayLabel(jtBarangayTrimmed);
      const jtCityTrimmed = jtCity.trim();
      const jtProvinceTrimmed = jtProvince.trim();
      const jtPostalCodeTrimmed = jtPostalCode.trim();

      const jntAddressLine = [
        jtHouseStreetUnitTrimmed,
        jtCityTrimmed,
        jtProvinceTrimmed,
        jtPostalCodeTrimmed,
      ]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ");
      const jntFullAddress = [
        jtHouseStreetUnitTrimmed,
        jtBarangayNormalized,
        jtCityTrimmed,
        jtProvinceTrimmed,
        jtPostalCodeTrimmed,
      ]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ");

      let shipping_details: Record<string, any>;
      if (shippingMethod === "JNT") {
        shipping_details = {
          method: "JNT",
          receiver_name: name.trim(),
          receiver_phone: sanitizedPhone,
          house_street_unit: jtHouseStreetUnitTrimmed,
          barangay: jtBarangayNormalized,
          city: jtCityTrimmed,
          province: jtProvinceTrimmed,
          postal_code: jtPostalCodeTrimmed || null,
          brgy: jtBarangayNormalized,
          address_line: jntAddressLine,
          full_address: jntFullAddress,
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
          map_url: lalamoveMapLink || null,
          map_lat: lalamoveMapCoords?.lat ?? null,
          map_lng: lalamoveMapCoords?.lng ?? null,
          lalamove: lalamoveSlotsPayload[0] ?? null,
          lalamove_slots: lalamoveSlotsPayload,
          notes: notes.trim() || null,
        };
      }

      let nextDefaults: ShippingDefaults | null = null;
      if (saveAsDefault && shippingMethod !== "PICKUP") {
        if (shippingMethod === "JNT") {
          nextDefaults = normalizeShippingDefaults({
            ...defaults,
            jnt: {
              ...defaults.jnt,
              recipient_name: name.trim(),
              contact_number: sanitizedPhone,
              house_street_unit: jtHouseStreetUnitTrimmed,
              barangay: jtBarangayNormalized,
              city: jtCityTrimmed,
              province: jtProvinceTrimmed,
              postal_code: jtPostalCodeTrimmed,
              notes: notes.trim() || "",
            },
          });
        } else if (shippingMethod === "LBC") {
          nextDefaults = normalizeShippingDefaults({
            ...defaults,
            lbc: {
              ...defaults.lbc,
              first_name: lbcFirstName.trim(),
              last_name: lbcLastName.trim(),
              contact_number: sanitizedPhone,
              branch: lbcBranchName.trim(),
              city: lbcBranchCity.trim(),
              notes: notes.trim() || "",
            },
          });
        } else if (shippingMethod === "LALAMOVE") {
          nextDefaults = normalizeShippingDefaults({
            ...defaults,
            lalamove: {
              ...defaults.lalamove,
              recipient_name: name.trim(),
              recipient_phone: sanitizedPhone,
              dropoff_address: lalamoveAddress.trim(),
              notes: notes.trim() || "",
              map_screenshot_url: lalamoveImageUrl || "",
              map_url: lalamoveMapLink || null,
              map_lat: lalamoveMapCoords?.lat ?? null,
              map_lng: lalamoveMapCoords?.lng ?? null,
            },
          });
        }
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
          voucher_id: selectedVoucher?.voucher.id ?? null,
          shipping_discount: shippingDiscount,
          discount_total: shippingDiscount,
          priority_requested: priorityRequested,
          insurance_selected:
            shippingMethod !== "LALAMOVE" && insuranceSelected,
          insurance_fee_user: shippingMethod !== "LALAMOVE" ? insuranceFee : 0,
        },
        selectedLines,
      );

      if (nextDefaults) {
        try {
          await persistCheckoutDefaults(nextDefaults);
        } catch (err) {
          console.error("Failed to save checkout defaults:", err);
        }
      }

      try {
        if (typeof window !== "undefined") {
          const neverShow = window.localStorage.getItem(
            FEEDBACK_NEVER_SHOW_KEY,
          );
          if (!neverShow) {
            window.localStorage.setItem(
              FEEDBACK_PROMPT_KEY,
              JSON.stringify({
                orderId: order?.id ?? null,
                createdAt: new Date().toISOString(),
              }),
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

  if (!user) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="space-y-2 text-white/50">
          <div className="text-2xl font-semibold text-white">Checkout</div>
          <div className="text-sm">
            Log in or create an account to continue.
          </div>
        </div>
        <CheckoutAuthModal open checkoutRedirect={checkoutRedirect} />
      </main>
    );
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
              Required boxes must be filled in. Skipped fields will block
              checkout.
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
                <option value="LBC" disabled={hasLalamoveOnly}>
                  LBC Pickup
                </option>
                <option value="JNT" disabled={hasLalamoveOnly}>
                  J&amp;T
                </option>
                <option value="LALAMOVE">Lalamove</option>
                <option value="PICKUP" disabled={hasLalamoveOnly}>
                  Store
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
                Diorama shipping class requires Lalamove delivery.
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Input
                      label="House/Street/Unit (required)"
                      value={jtHouseStreetUnit}
                      onChange={(e) => setJtHouseStreetUnit(e.target.value)}
                      hint="Street address, building, and unit details."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      label="Barangay / City / Province (required)"
                      value={jtLocationQuery}
                      readOnly
                      placeholder="Click to search your barangay"
                      onClick={() => setJtLocationModalOpen(true)}
                      onFocus={() => setJtLocationModalOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setJtLocationModalOpen(true);
                        }
                      }}
                      className="cursor-pointer"
                      hint="Opens a search pop-up (e.g., Brgy 123 - Manila - Metro Manila)."
                    />
                  </div>
                </div>
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

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={onUseCurrentLocation}
                      disabled={lalamovePinLoading}
                    >
                      {lalamovePinLoading
                        ? "Locating..."
                        : "Use my current location"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setLalamoveMapPickerOpen(true)}
                      disabled={lalamovePinLoading}
                    >
                      Choose from map
                    </Button>
                  </div>
                  {lalamovePinError ? (
                    <div className="text-xs text-red-200">
                      {lalamovePinError}
                    </div>
                  ) : null}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Choose location on map"
                    onClick={() => setLalamoveMapPickerOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setLalamoveMapPickerOpen(true);
                      }
                    }}
                    className="rounded-xl border border-white/10 bg-bg-900/60 p-2 transition hover:border-white/20 cursor-pointer"
                  >
                    {lalamoveMapCoords ? (
                      <LeafletMapPreview
                        center={lalamoveMapCoords}
                        position={lalamoveMapCoords}
                        zoom={16}
                        interactive={false}
                        onPositionChange={() => {}}
                        className="h-40 pointer-events-none"
                      />
                    ) : (
                      <div className="flex h-40 items-center justify-center text-sm text-white/50">
                        Click to choose a location on the map.
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-white/60">
                    {lalamovePinLoading
                      ? "Updating map..."
                      : lalamoveMapCoords
                        ? "Map pinned."
                        : "No map selected yet."}
                  </div>
                </div>

                <LalamoveTimeSlotPicker
                  value={lalamoveSlots}
                  onChange={handleLalamoveSlotChange}
                  error={lalamoveSlotError}
                  helperText={`Lalamove adds a ${formatPHP(
                    FEES.LALAMOVE_CONVENIENCE,
                  )} convenience fee.`}
                />
              </div>
            ) : null}

            {shippingMethod === "PICKUP" ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-bg-900/20 p-4 space-y-2">
                  <div className="font-semibold">Pickup location</div>
                  <div className="text-sm text-white/70">{PICKUP_LOCATION}</div>
                  <div className="text-xs text-white/50">
                    Directory: {PICKUP_DIRECTORY}
                  </div>
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
                    pickupUnavailable ||
                    !pickupDay ||
                    pickupSlotsForDay.length === 0
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
                  <div className="text-xs text-white/50">
                    Pickup schedule not set yet.
                  </div>
                ) : null}
                {!pickupUnavailable &&
                pickupDay &&
                pickupSlotsForDay.length === 0 ? (
                  <div className="text-xs text-white/50">
                    No timeslots for the selected day.
                  </div>
                ) : null}
              </div>
            ) : null}

            {shippingMethod !== "PICKUP" ? (
              <div className="rounded-xl border border-white/10 bg-bg-900/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Checkbox
                    checked={saveAsDefault}
                    onChange={setSaveAsDefault}
                    label="Save this address as my default"
                  />
                  <span className="text-xs text-white/50">
                    Stored in account settings for faster checkout.
                  </span>
                </div>
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

              {shippingMethod !== "LALAMOVE" ? (
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
              ) : null}
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
              Total: <span className="text-price">{formatPHP(total)}</span>
            </div>
          </CardFooter>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="font-semibold">Vouchers</div>
              <div className="text-sm text-white/60">
                Apply free shipping vouchers before checkout.
              </div>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              {voucherLoading ? (
                <div className="text-white/60">Loading vouchers...</div>
              ) : voucherError ? (
                <div className="text-red-200">{voucherError}</div>
              ) : selectedVoucher ? (
                <div className="space-y-1">
                  <div className="font-semibold">
                    {selectedVoucher.voucher.title || "Free Shipping"}
                  </div>
                  <div className="text-xs text-white/60">
                    Min spend{" "}
                    {formatPHP(
                      Number(selectedVoucher.voucher.min_subtotal ?? 0),
                    )}
                    {" - "}
                    Cap{" "}
                    {formatPHP(
                      Number(selectedVoucher.voucher.shipping_cap ?? 0),
                    )}
                  </div>
                  <div className="text-xs text-emerald-200">
                    Applied discount: {formatPHP(shippingDiscount)}
                  </div>
                </div>
              ) : (
                <div className="text-white/60">No voucher applied.</div>
              )}
              {voucherNotice ? (
                <div className="text-xs text-yellow-200">{voucherNotice}</div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setVoucherOpen(true)}
                  disabled={voucherLoading}
                >
                  {selectedVoucher ? "Change voucher" : "Select voucher"}
                </Button>
                {selectedVoucher ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedVoucherWalletId(null)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </CardBody>
          </Card>
          <FeeBreakdown lines={feeLines} total={total} />
        </div>
      </div>
      <JntLocationModal
        open={jtLocationModalOpen}
        value={jtLocationQuery}
        locations={phBarangayLocations}
        loading={locationsLoading}
        error={locationsError}
        onApply={onJntLocationChange}
        onClear={clearJntLocation}
        onClose={() => setJtLocationModalOpen(false)}
      />
      <VoucherModal
        open={voucherOpen}
        vouchers={voucherWallet}
        selectedId={selectedVoucherWalletId}
        onSelect={(id) => {
          setSelectedVoucherWalletId(id);
          setVoucherOpen(false);
        }}
        onRemove={() => setSelectedVoucherWalletId(null)}
        onClose={() => setVoucherOpen(false)}
        subtotal={itemsSubtotal}
        shippingFee={fees.shipping_fee}
      />
      <LalamoveMapPickerModal
        open={lalamoveMapPickerOpen}
        title="Pin Lalamove drop-off"
        initialPosition={lalamoveMapCoords}
        saving={lalamovePinLoading}
        onClose={() => setLalamoveMapPickerOpen(false)}
        onSave={onSaveLalamoveMapPin}
      />
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <React.Suspense
      fallback={
        <main className="mx-auto max-w-3xl px-4 py-10 text-white/60">
          Loading...
        </main>
      }
    >
      <CheckoutContent />
    </React.Suspense>
  );
}
