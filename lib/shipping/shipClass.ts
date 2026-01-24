import { normalizeBrandAlias } from "@/lib/titleInference";
import type { ShipClass } from "@/lib/shipping/config";

export function shipClassFromBrand(rawBrand: string | null | undefined): ShipClass {
  const raw = String(rawBrand ?? "");
  const rawLower = raw.toLowerCase();
  if (rawLower.includes("hot wheels premium") || rawLower.includes("hotwheels premium")) {
    return "HOT_WHEELS_PREMIUM";
  }

  const normalized = normalizeBrandAlias(rawBrand) ?? "";
  const lower = normalized.toLowerCase();

  if (lower.includes("mini gt")) return "MINI_GT";
  if (lower.includes("kaido")) return "KAIDO";
  if (lower.includes("tomica")) return "TOMICA";
  if (lower.includes("hot wheels") || lower.includes("hotwheels")) {
    return "HOT_WHEELS_MAINLINE";
  }
  if (lower.includes("pop race") || lower.includes("poprace")) return "POPRACE";
  if (lower.includes("diorama")) return "DIORAMA";

  return "ACRYLIC_TRUE_SCALE";
}

export function isLalamoveOnlyShipClass(
  value: string | null | undefined
): boolean {
  return value === "LALAMOVE" || value === "DIORAMA";
}
