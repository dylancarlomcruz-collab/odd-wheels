export type Tier = "CLASSIC" | "SILVER" | "GOLD" | "PLATINUM";

export const TIER_THRESHOLDS: Record<Tier, number> = {
  CLASSIC: 0,
  SILVER: 2000,
  GOLD: 5000,
  PLATINUM: 10000,
};

export const TIER_PERKS: Record<
  Tier,
  {
    label: string;
    monthlyVouchers: string[];
    autoApprove: boolean;
    priorityShipping: boolean;
    enhancedTracking: boolean;
  }
> = {
  CLASSIC: {
    label: "Classic",
    monthlyVouchers: [],
    autoApprove: false,
    priorityShipping: false,
    enhancedTracking: false,
  },
  SILVER: {
    label: "Silver",
    monthlyVouchers: ["FS100"],
    autoApprove: false,
    priorityShipping: false,
    enhancedTracking: false,
  },
  GOLD: {
    label: "Gold",
    monthlyVouchers: ["FS100", "FS200"],
    autoApprove: true,
    priorityShipping: false,
    enhancedTracking: false,
  },
  PLATINUM: {
    label: "Platinum",
    monthlyVouchers: ["FS100", "FS200", "FS300"],
    autoApprove: true,
    priorityShipping: true,
    enhancedTracking: true,
  },
};

const ORDERED_TIERS: Tier[] = ["CLASSIC", "SILVER", "GOLD", "PLATINUM"];

function normalizeSpend(value: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function getTierFromSpend(spend: number): Tier {
  const total = normalizeSpend(spend);
  if (total >= TIER_THRESHOLDS.PLATINUM) return "PLATINUM";
  if (total >= TIER_THRESHOLDS.GOLD) return "GOLD";
  if (total >= TIER_THRESHOLDS.SILVER) return "SILVER";
  return "CLASSIC";
}

export function getTierProgress(spend: number) {
  const total = normalizeSpend(spend);
  const tier = getTierFromSpend(total);
  const tierIndex = ORDERED_TIERS.indexOf(tier);
  const nextTier = tierIndex < ORDERED_TIERS.length - 1 ? ORDERED_TIERS[tierIndex + 1] : null;
  const currentMin = TIER_THRESHOLDS[tier];
  const nextMin = nextTier ? TIER_THRESHOLDS[nextTier] : null;
  const progress =
    nextMin && nextMin > currentMin
      ? Math.min(1, Math.max(0, (total - currentMin) / (nextMin - currentMin)))
      : 1;
  const remaining = nextMin ? Math.max(0, nextMin - total) : 0;
  return { tier, nextTier, currentMin, nextMin, progress, remaining, spend: total };
}

export function isAutoApproveTier(tier: Tier | null | undefined) {
  return tier === "GOLD" || tier === "PLATINUM";
}

export function isPlatinumTier(tier: Tier | null | undefined) {
  return tier === "PLATINUM";
}
