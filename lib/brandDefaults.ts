import { normalizeBrandAlias } from "@/lib/titleInference";

const DEFAULT_VARIANT_PRICE_BY_BRAND: Record<string, string> = {
};

export function getDefaultVariantPriceForBrand(
  rawBrand: string | null | undefined
) {
  const normalized =
    normalizeBrandAlias(rawBrand)?.trim() ?? String(rawBrand ?? "").trim();
  if (!normalized) return "";
  return DEFAULT_VARIANT_PRICE_BY_BRAND[normalized] ?? "";
}

export function getDefaultVariantPriceNumberForBrand(
  rawBrand: string | null | undefined
) {
  const rawPrice = getDefaultVariantPriceForBrand(rawBrand);
  const parsed = Number(rawPrice);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
