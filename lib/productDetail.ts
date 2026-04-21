import { normalizeSearchTerm } from "@/lib/search";

const SUPABASE_PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export type RelatedProductInput = {
  key: string;
  title: string;
  brand: string | null;
  model: string | null;
};

export function getProductPageHref(productId: string) {
  const id = String(productId ?? "").trim();
  return `/product/${encodeURIComponent(id)}`;
}

export function getAbsoluteProductPageUrl(productId: string) {
  const href = getProductPageHref(productId);
  if (typeof window === "undefined") return href;
  try {
    return new URL(href, window.location.origin).toString();
  } catch {
    return href;
  }
}

export function normalizeProductImageUrl(raw: string | null | undefined) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = SUPABASE_PUBLIC_URL.replace(/\/$/, "");
  if (!base) return trimmed;
  if (trimmed.startsWith("/storage/") || trimmed.startsWith("storage/")) {
    const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return `${base}${path}`;
  }
  return trimmed;
}

export function getRelatedProducts<T extends RelatedProductInput>(
  target: RelatedProductInput,
  pool: T[] | null | undefined,
  limit = 6
) {
  if (!pool?.length) return [];

  const targetText = normalizeSearchTerm(
    `${target.title} ${target.brand ?? ""} ${target.model ?? ""}`
  );
  const targetTokens = new Set(
    targetText
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean)
  );
  const targetBrand = normalizeSearchTerm(target.brand ?? "");
  const targetModel = normalizeSearchTerm(target.model ?? "");

  const scored = pool
    .filter((item) => item.key !== target.key)
    .map((item) => {
      let score = 0;
      const text = normalizeSearchTerm(
        `${item.title} ${item.brand ?? ""} ${item.model ?? ""}`
      );
      if (targetBrand && normalizeSearchTerm(item.brand ?? "") === targetBrand) {
        score += 3;
      }
      if (targetModel && text.includes(targetModel)) {
        score += 2;
      }
      const overlap = text
        .split(" ")
        .filter(Boolean)
        .reduce((total, token) => total + (targetTokens.has(token) ? 1 : 0), 0);
      score += overlap;
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);

  const picked = new Set(scored.map((item) => item.key));
  const fallback = pool.filter(
    (item) => item.key !== target.key && !picked.has(item.key)
  );

  return scored.concat(fallback).slice(0, limit);
}
