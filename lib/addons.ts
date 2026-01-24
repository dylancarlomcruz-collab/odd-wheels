export const PROTECTOR_ADDON_FEE = 40;

export type ProtectorKind = "MAINLINE" | "PREMIUM";

export function protectorKindFromShipClass(
  shipClass: string | null | undefined
): ProtectorKind | null {
  const normalized = String(shipClass ?? "").toUpperCase();
  if (normalized === "HOT_WHEELS_PREMIUM") return "PREMIUM";
  if (normalized === "HOT_WHEELS_MAINLINE") return "MAINLINE";
  return null;
}

export function isProtectorEligibleShipClass(
  shipClass: string | null | undefined
) {
  return protectorKindFromShipClass(shipClass) !== null;
}

export function protectorUnitFee(
  shipClass: string | null | undefined,
  selected: boolean
) {
  if (!selected) return 0;
  return isProtectorEligibleShipClass(shipClass) ? PROTECTOR_ADDON_FEE : 0;
}
