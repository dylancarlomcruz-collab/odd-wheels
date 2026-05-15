export type Region = "METRO_MANILA" | "LUZON" | "VISAYAS" | "MINDANAO";
export type Courier = "LBC" | "JNT" | "LALAMOVE" | "INTERNATIONAL";

export type ShipClass =
  | "MINI_GT"
  | "SMALL_BOX_FIGURE"
  | "KAIDO"
  | "POPRACE"
  | "ACRYLIC_TRUE_SCALE"
  | "TRUCKS"
  | "BLISTER"
  | "TOMICA"
  | "TOMICA_LIMITED_VINTAGE_NEO"
  | "HOT_WHEELS_MAINLINE"
  | "HOT_WHEELS_PREMIUM"
  | "LOOSE_NO_BOX"
  | "LALAMOVE"
  | "FIGURES_DIORAMA";

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
  N_SAKTO: { METRO_MANILA: 54, LUZON: 64, VISAYAS: 94, MINDANAO: 94 },
  MINIBOX: { METRO_MANILA: 85, LUZON: 135, VISAYAS: 135, MINDANAO: 135 },
  SMALL_BOX: { METRO_MANILA: 114, LUZON: 155, VISAYAS: 165, MINDANAO: 165 },
};

// Capacity rules: maximum pieces per class for each package.
// Interpretation: you can ship up to the max count for that class.
export const JNT_CAPACITY: Record<JntPouch, Record<ShipClass, number>> = {
  SMALL: {
    MINI_GT: 2,
    SMALL_BOX_FIGURE: 2,
    KAIDO: 2,
    POPRACE: 2,
    ACRYLIC_TRUE_SCALE: 1,
    TRUCKS: 0,
    BLISTER: 0,
    TOMICA: 10,
    TOMICA_LIMITED_VINTAGE_NEO: 10,
    HOT_WHEELS_MAINLINE: 0,
    HOT_WHEELS_PREMIUM: 0,
    LOOSE_NO_BOX: 10,
    LALAMOVE: 0,
    FIGURES_DIORAMA: 0,
  },
  MEDIUM: {
    MINI_GT: 8,
    SMALL_BOX_FIGURE: 8,
    KAIDO: 8,
    POPRACE: 8,
    ACRYLIC_TRUE_SCALE: 4,
    TRUCKS: 1,
    BLISTER: 2,
    TOMICA: 30,
    TOMICA_LIMITED_VINTAGE_NEO: 30,
    HOT_WHEELS_MAINLINE: 8,
    HOT_WHEELS_PREMIUM: 6,
    LOOSE_NO_BOX: 30,
    LALAMOVE: 0,
    FIGURES_DIORAMA: 0,
  }, // x4 of small
};

export const LBC_CAPACITY: Record<LbcPackage, Record<ShipClass, number>> = {
  N_SAKTO: {
    MINI_GT: 2,
    SMALL_BOX_FIGURE: 2,
    KAIDO: 1,
    POPRACE: 1,
    ACRYLIC_TRUE_SCALE: 1,
    TRUCKS: 0,
    BLISTER: 0,
    TOMICA: 4,
    TOMICA_LIMITED_VINTAGE_NEO: 4,
    HOT_WHEELS_MAINLINE: 0,
    HOT_WHEELS_PREMIUM: 0,
    LOOSE_NO_BOX: 4,
    LALAMOVE: 0,
    FIGURES_DIORAMA: 0,
  },
  MINIBOX: {
    MINI_GT: 9,
    SMALL_BOX_FIGURE: 9,
    KAIDO: 4,
    POPRACE: 4,
    ACRYLIC_TRUE_SCALE: 4,
    TRUCKS: 1,
    BLISTER: 1,
    TOMICA: 20,
    TOMICA_LIMITED_VINTAGE_NEO: 20,
    HOT_WHEELS_MAINLINE: 8,
    HOT_WHEELS_PREMIUM: 6,
    LOOSE_NO_BOX: 20,
    LALAMOVE: 0,
    FIGURES_DIORAMA: 0,
  },
  SMALL_BOX: {
    MINI_GT: Math.floor(9 * 3.5),
    SMALL_BOX_FIGURE: Math.floor(9 * 3.5),
    KAIDO: Math.floor(4 * 3.5),
    POPRACE: Math.floor(4 * 3.5),
    ACRYLIC_TRUE_SCALE: Math.floor(4 * 3.5),
    TRUCKS: 3,
    BLISTER: 8,
    TOMICA: 20,
    TOMICA_LIMITED_VINTAGE_NEO: 20,
    HOT_WHEELS_MAINLINE: 20,
    HOT_WHEELS_PREMIUM: 16,
    LOOSE_NO_BOX: 20,
    LALAMOVE: 0,
    FIGURES_DIORAMA: 0,
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
