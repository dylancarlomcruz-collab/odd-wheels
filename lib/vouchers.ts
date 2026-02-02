export type VoucherKind = "FREE_SHIPPING" | "SHIPPING_DISCOUNT" | "ORDER_DISCOUNT";

export type Voucher = {
  id: string;
  code?: string | null;
  title?: string | null;
  details?: string | null;
  kind: VoucherKind | string;
  min_subtotal: number;
  shipping_cap: number;
  include_couriers?: string[] | null;
  include_ship_classes?: string[] | null;
  exclude_ship_classes?: string[] | null;
  starts_at?: string | null;
  expires_at?: string | null;
  is_active?: boolean;
};

export type VoucherWallet = {
  id: string;
  status: "AVAILABLE" | "USED" | "EXPIRED" | string;
  claimed_at?: string | null;
  used_at?: string | null;
  expires_at?: string | null;
  voucher: Voucher;
};

type EligibilityInput = {
  voucher: Voucher;
  walletExpiresAt?: string | null;
  subtotal: number;
  shippingFee: number;
  shipClasses?: Array<string | null | undefined>;
  shippingMethod?: string | null;
  now?: Date;
};

export type VoucherEligibility = {
  eligible: boolean;
  discount: number;
  reason?: string;
};

function toNumber(value: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeShipClass(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized.length ? normalized : null;
}

function normalizeShipClassList(values?: Array<string | null | undefined> | null) {
  return (values ?? [])
    .map((value) => normalizeShipClass(value))
    .filter((value): value is string => Boolean(value));
}

function normalizeCourier(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "J&T" || raw === "J&T EXPRESS" || raw === "J&TEXPRESS" || raw === "JT") {
    return "JNT";
  }
  if (raw === "JNT") return "JNT";
  if (raw === "LBC") return "LBC";
  if (raw === "LALAMOVE") return "LALAMOVE";
  return raw;
}

function normalizeCourierList(
  values?: Array<string | null | undefined> | string | null
) {
  if (Array.isArray(values)) {
    return values
      .map((value) => normalizeCourier(value))
      .filter((value): value is string => Boolean(value));
  }
  if (typeof values === "string") {
    const trimmed = values.replace(/[{}]/g, "").trim();
    if (!trimmed) return [];
    return trimmed
      .split(",")
      .map((value) => normalizeCourier(value))
      .filter((value): value is string => Boolean(value));
  }
  return [];
}

function isExpired(dateValue?: string | null, now = new Date()) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < now.getTime();
}

function isNotStarted(dateValue?: string | null, now = new Date()) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() > now.getTime();
}

export function calculateShippingDiscount({
  subtotal,
  shippingFee,
  voucher,
}: {
  subtotal: number;
  shippingFee: number;
  voucher: Voucher;
}) {
  const fee = Math.max(0, toNumber(shippingFee));
  const minSpend = Math.max(0, toNumber(voucher.min_subtotal));
  if (fee <= 0) return 0;
  if (toNumber(subtotal) < minSpend) return 0;
  return Math.min(fee, Math.max(0, toNumber(voucher.shipping_cap)));
}

export function getVoucherEligibility({
  voucher,
  walletExpiresAt,
  subtotal,
  shippingFee,
  shipClasses,
  shippingMethod,
  now = new Date(),
}: EligibilityInput): VoucherEligibility {
  const fee = Math.max(0, toNumber(shippingFee));
  if (fee <= 0) {
    return { eligible: false, discount: 0, reason: "Shipping fee is zero." };
  }
  if (voucher.is_active === false) {
    return { eligible: false, discount: 0, reason: "Voucher is inactive." };
  }
  if (isNotStarted(voucher.starts_at, now)) {
    return { eligible: false, discount: 0, reason: "Not active yet." };
  }
  if (isExpired(voucher.expires_at, now) || isExpired(walletExpiresAt, now)) {
    return { eligible: false, discount: 0, reason: "Voucher expired." };
  }
  const includeCouriers = normalizeCourierList(voucher.include_couriers);
  if (includeCouriers.length) {
    const method = normalizeCourier(shippingMethod);
    if (!method) {
      return {
        eligible: false,
        discount: 0,
        reason: "Select a shipping method.",
      };
    }
    if (!includeCouriers.includes(method)) {
      return {
        eligible: false,
        discount: 0,
        reason: "Not eligible for this courier.",
      };
    }
  }
  const includeClasses = normalizeShipClassList(voucher.include_ship_classes);
  const excludeClasses = normalizeShipClassList(voucher.exclude_ship_classes);
  const normalizedShipClasses = (shipClasses ?? []).map(
    (value) => normalizeShipClass(value) ?? "MINI_GT"
  );
  if (includeClasses.length) {
    const allIncluded = normalizedShipClasses.every((value) =>
      includeClasses.includes(value)
    );
    if (!allIncluded) {
      return {
        eligible: false,
        discount: 0,
        reason: "Contains ineligible items.",
      };
    }
  }
  if (excludeClasses.length) {
    const hasExcluded = normalizedShipClasses.some((value) =>
      excludeClasses.includes(value)
    );
    if (hasExcluded) {
      return {
        eligible: false,
        discount: 0,
        reason: "Contains excluded items.",
      };
    }
  }
  if (toNumber(subtotal) < toNumber(voucher.min_subtotal)) {
    return { eligible: false, discount: 0, reason: "Min spend not met." };
  }
  const discount = calculateShippingDiscount({ subtotal, shippingFee: fee, voucher });
  if (discount <= 0) {
    return { eligible: false, discount: 0, reason: "Not eligible." };
  }
  return { eligible: true, discount };
}
