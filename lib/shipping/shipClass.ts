import { normalizeBrandAlias } from "@/lib/titleInference";
import type { ShipClass } from "@/lib/shipping/config";

export function shipClassFromBrand(rawBrand: string | null | undefined): ShipClass {
  const normalized = normalizeBrandAlias(rawBrand) ?? "";
  const lower = normalized.toLowerCase();

  if (lower.includes("mini gt")) return "MINI_GT";
  if (lower.includes("kaido")) return "KAIDO";
  if (lower.includes("pop race") || lower.includes("poprace")) return "POPRACE";
  if (lower.includes("diorama")) return "LALAMOVE";

  return "ACRYLIC_TRUE_SCALE";
}
