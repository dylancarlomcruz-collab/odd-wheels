export type FreeShippingSettings = {
  threshold: number;
  couriers?: Array<string | null | undefined> | null;
  ship_classes?: Array<string | null | undefined> | null;
};

export type FreeShippingEligibility = {
  eligible: boolean;
  discount: number;
  reason?: string;
};

type FreeShippingInput = {
  subtotal: number;
  shippingFee: number;
  shippingMethod: string | null | undefined;
  shipClasses: Array<string | null | undefined>;
  settings: FreeShippingSettings;
};

function toNumber(value: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeValue(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized.length ? normalized : null;
}

function normalizeList(values?: Array<string | null | undefined> | null) {
  return (values ?? [])
    .map((value) => normalizeValue(value))
    .filter((value): value is string => Boolean(value));
}

function normalizeShipClasses(values: Array<string | null | undefined>) {
  return values.map((value) => normalizeValue(value) ?? "MINI_GT");
}

export function getFreeShippingEligibility({
  subtotal,
  shippingFee,
  shippingMethod,
  shipClasses,
  settings,
}: FreeShippingInput): FreeShippingEligibility {
  const fee = Math.max(0, toNumber(shippingFee));
  if (fee <= 0) {
    return { eligible: false, discount: 0, reason: "Shipping fee is zero." };
  }

  const threshold = Math.max(0, toNumber(settings.threshold));
  if (threshold <= 0) {
    return { eligible: false, discount: 0, reason: "Free shipping disabled." };
  }
  if (toNumber(subtotal) < threshold) {
    return { eligible: false, discount: 0, reason: "Min spend not met." };
  }

  const allowedCouriers = normalizeList(settings.couriers);
  const method = normalizeValue(shippingMethod);
  if (allowedCouriers.length && (!method || !allowedCouriers.includes(method))) {
    return { eligible: false, discount: 0, reason: "Courier not eligible." };
  }

  const allowedClasses = normalizeList(settings.ship_classes);
  const normalizedShipClasses = normalizeShipClasses(shipClasses);
  if (allowedClasses.length) {
    const allIncluded = normalizedShipClasses.every((value) =>
      allowedClasses.includes(value),
    );
    if (!allIncluded) {
      return {
        eligible: false,
        discount: 0,
        reason: "Contains ineligible items.",
      };
    }
  }

  return { eligible: true, discount: fee };
}
