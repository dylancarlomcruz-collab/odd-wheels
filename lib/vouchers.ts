export type VoucherKind = "FREE_SHIPPING";

export type Voucher = {
  id: string;
  code?: string | null;
  title?: string | null;
  kind: VoucherKind | string;
  min_subtotal: number;
  shipping_cap: number;
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
  if (toNumber(subtotal) < toNumber(voucher.min_subtotal)) {
    return { eligible: false, discount: 0, reason: "Min spend not met." };
  }
  const discount = calculateShippingDiscount({ subtotal, shippingFee: fee, voucher });
  if (discount <= 0) {
    return { eligible: false, discount: 0, reason: "Not eligible." };
  }
  return { eligible: true, discount };
}
