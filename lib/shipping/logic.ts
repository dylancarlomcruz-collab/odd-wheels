import { JNT_CAPACITY, JNT_RATES, LBC_CAPACITY, LBC_RATES, type JntPouch, type LbcPackage, type Region, type ShipClass } from "./config";

export type ShipCounts = Record<ShipClass, number>;

export function emptyShipCounts(): ShipCounts {
  return {
    MINI_GT: 0,
    SMALL_BOX_FIGURE: 0,
    KAIDO: 0,
    POPRACE: 0,
    TARMAC_BOX: 0,
    ACRYLIC_TRUE_SCALE: 0,
    TARMAC_ACRYLIC: 0,
    TRUCKS: 0,
    BLISTER: 0,
    TOMICA: 0,
    TOMICA_LIMITED_VINTAGE_NEO: 0,
    HOT_WHEELS_MAINLINE: 0,
    HOT_WHEELS_PREMIUM: 0,
    LOOSE_NO_BOX: 0,
    LALAMOVE: 0,
    FIGURES_DIORAMA: 0,
  };
}

export function fitsCapacity(counts: ShipCounts, capacity: Record<ShipClass, number>): boolean {
  const normalized =
    counts.TRUCKS > 0
      ? {
          ...counts,
          ACRYLIC_TRUE_SCALE:
            counts.ACRYLIC_TRUE_SCALE + counts.TARMAC_ACRYLIC + counts.TRUCKS * 4,
          TARMAC_ACRYLIC: 0,
        }
      : counts;
  let fillUsage = 0;

  for (const shipClass of Object.keys(normalized) as ShipClass[]) {
    const count = normalized[shipClass];
    if (count <= 0) continue;

    const classCapacity = capacity[shipClass];
    if (classCapacity <= 0) return false;

    fillUsage += count / classCapacity;
    if (fillUsage > 1.000001) return false;
  }

  return true;
}

export function recommendJntPouch(counts: ShipCounts): { ok: true; pouch: JntPouch } | { ok: false; reason: string } {
  if (fitsCapacity(counts, JNT_CAPACITY.SMALL)) return { ok: true, pouch: "SMALL" };
  if (fitsCapacity(counts, JNT_CAPACITY.MEDIUM)) return { ok: true, pouch: "MEDIUM" };
  return { ok: false, reason: "Cart exceeds J&T medium pouch capacity." };
}

export function recommendLbcPackage(counts: ShipCounts): { ok: true; pack: LbcPackage } | { ok: false; reason: string } {
  if (fitsCapacity(counts, LBC_CAPACITY.N_SAKTO)) return { ok: true, pack: "N_SAKTO" };
  if (fitsCapacity(counts, LBC_CAPACITY.MINIBOX)) return { ok: true, pack: "MINIBOX" };
  if (fitsCapacity(counts, LBC_CAPACITY.SMALL_BOX)) return { ok: true, pack: "SMALL_BOX" };
  return { ok: false, reason: "Cart requires LBC Medium Box (subject to admin approval)." };
}

export function jntFee(pouch: JntPouch, region: Region): number {
  return JNT_RATES[pouch][region];
}

export function lbcFee(pack: LbcPackage, region: Region): number {
  return LBC_RATES[pack][region];
}

export function shipCountsFromLines(lines: Array<{ ship_class: ShipClass | null; qty: number }>): ShipCounts {
  const c = emptyShipCounts();
  for (const line of lines) {
    const cls = line.ship_class ?? "MINI_GT";
    const bucket = cls === "FIGURES_DIORAMA" ? "LALAMOVE" : cls;
    c[bucket] += Math.max(0, line.qty);
  }
  return c;
}
