export type Region = "METRO_MANILA" | "LUZON" | "VISAYAS" | "MINDANAO";
export type Courier = "LBC" | "JNT" | "LALAMOVE";

export type ShipClass = "MINI_GT" | "KAIDO" | "ACRYLIC_TRUE_SCALE";

export type JntPouch = "SMALL" | "MEDIUM"; // Large not available per SRS
export type LbcPackage = "N_SAKTO" | "MINIBOX" | "SMALL_BOX"; // Medium requires approval (not auto)

export const REGION_LABEL: Record<Region, string> = {
  METRO_MANILA: "Metro Manila",
  LUZON: "Luzon",
  VISAYAS: "Visayas",
  MINDANAO: "Mindanao",
};

export const JNT_RATES: Record<JntPouch, Record<Region, number>> = {
  SMALL: { METRO_MANILA: 65, LUZON: 75, VISAYAS: 95, MINDANAO: 100 },
  MEDIUM: { METRO_MANILA: 85, LUZON: 125, VISAYAS: 155, MINDANAO: 165 },
};

export const LBC_RATES: Record<LbcPackage, Record<Region, number>> = {
  N_SAKTO: { METRO_MANILA: 60, LUZON: 70, VISAYAS: 90, MINDANAO: 90 },
  MINIBOX: { METRO_MANILA: 110, LUZON: 125, VISAYAS: 125, MINDANAO: 125 },
  SMALL_BOX: { METRO_MANILA: 140, LUZON: 140, VISAYAS: 140, MINDANAO: 140 },
};

// Capacity rules: maximum pieces per class for each package.
// Interpretation: you can ship up to the max count for that class.
export const JNT_CAPACITY: Record<JntPouch, Record<ShipClass, number>> = {
  SMALL: { MINI_GT: 2, KAIDO: 2, ACRYLIC_TRUE_SCALE: 1 },
  MEDIUM: { MINI_GT: 8, KAIDO: 8, ACRYLIC_TRUE_SCALE: 4 }, // x4 of small
};

export const LBC_CAPACITY: Record<LbcPackage, Record<ShipClass, number>> = {
  N_SAKTO: { MINI_GT: 2, KAIDO: 1, ACRYLIC_TRUE_SCALE: 1 },
  MINIBOX: { MINI_GT: 9, KAIDO: 4, ACRYLIC_TRUE_SCALE: 4 },
  SMALL_BOX: {
    MINI_GT: Math.floor(9 * 3.5),
    KAIDO: Math.floor(4 * 3.5),
    ACRYLIC_TRUE_SCALE: Math.floor(4 * 3.5),
  },
};

export const FEES = {
  LBC_COP_CONVENIENCE: 20,
  LALAMOVE_CONVENIENCE: 50,
  PRIORITY_SHIPPING: 50,
};

export function suggestedInsuranceFee(itemSubtotal: number): number {
  // ₱5 per ₱500 declared value
  const declared = Math.max(0, itemSubtotal);
  const units = Math.ceil(declared / 500);
  return units * 5;
}
