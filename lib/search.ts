import type { ShopProduct } from "@/components/ProductCard";

const BRAND_SYNONYMS: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /\bmini\s*-?\s*gt\b/gi, canonical: "mini gt" },
  { pattern: /\bminigt\b/gi, canonical: "mini gt" },
  { pattern: /\bkaido\s*-?\s*house\b/gi, canonical: "kaido house" },
  { pattern: /\bpop\s*-?\s*race\b/gi, canonical: "pop race" },
  { pattern: /\btarmac\s*works?\b/gi, canonical: "tarmac" },
];

const MODEL_SYNONYMS: Array<{ pattern: RegExp; append: string }> = [
  { pattern: /\br34\b/i, append: "skyline r34" },
  { pattern: /\br33\b/i, append: "skyline r33" },
  { pattern: /\br32\b/i, append: "skyline r32" },
  { pattern: /\bgtr\b/i, append: "gt-r" },
];

export function normalizeSearchTerm(value: string) {
  const raw = String(value ?? "");
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let normalized = ` ${base} `;
  for (const rule of BRAND_SYNONYMS) {
    normalized = normalized.replace(rule.pattern, ` ${rule.canonical} `);
  }
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

export function expandSearchTerms(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const normalized = normalizeSearchTerm(raw);
  const terms = new Set<string>();
  terms.add(raw);
  terms.add(normalized);

  for (const rule of MODEL_SYNONYMS) {
    if (rule.pattern.test(normalized)) {
      terms.add(`${normalized} ${rule.append}`.trim());
      terms.add(rule.append);
    }
  }

  return Array.from(terms)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function sanitizeIlikeTerm(term: string) {
  return term.replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim();
}

export function buildSearchOr(terms: string[]) {
  const clauses: string[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const clean = sanitizeIlikeTerm(term);
    if (!clean) continue;
    const normalizedTokens = normalizeSearchTerm(clean)
      .split(" ")
      .filter(Boolean);
    const allTerms = [clean, ...normalizedTokens].filter(Boolean);
    for (const piece of allTerms) {
      const key = piece.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const ilike = `%${piece}%`;
      clauses.push(`title.ilike.${ilike}`);
      clauses.push(`brand.ilike.${ilike}`);
      clauses.push(`model.ilike.${ilike}`);
      clauses.push(`variation.ilike.${ilike}`);
      clauses.push(`product_variants.public_notes.ilike.${ilike}`);
      clauses.push(`product_variants.issue_notes.ilike.${ilike}`);
    }
  }
  return clauses.join(",");
}

export function buildSearchTermTokens(query: string) {
  return expandSearchTerms(query)
    .map((term) => normalizeSearchTerm(term))
    .map((term) => term.split(" ").filter(Boolean))
    .filter((tokens) => tokens.length > 0);
}

export function buildProductSearchText(product: ShopProduct) {
  const optionNotes = (product.options ?? [])
    .flatMap((option) => [option.public_notes, option.issue_notes])
    .filter(Boolean);
  const raw = [
    product.title,
    product.brand,
    product.model,
    product.variation,
    ...optionNotes,
  ]
    .filter(Boolean)
    .join(" ");
  return normalizeSearchTerm(raw);
}

export function matchesSearchText(text: string, termTokens: string[][]) {
  if (!termTokens.length) return true;
  return termTokens.some((tokens) => tokens.every((t) => text.includes(t)));
}

export function rememberSearchTerm(term: string) {
  if (typeof window === "undefined") return;
  const normalized = normalizeSearchTerm(term);
  if (!normalized) return;
  const payload = {
    term: normalized,
    ts: Date.now(),
  };
  try {
    window.localStorage.setItem("oddwheels:last_search", JSON.stringify(payload));
    const history = readSearchHistory();
    const now = Date.now();
    const existing = history.find((entry) => entry.term === normalized);
    if (existing) {
      existing.count += 1;
      existing.lastUsed = now;
    } else {
      history.push({ term: normalized, count: 1, lastUsed: now });
    }
    const next = history
      .slice()
      .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
      .slice(0, 12);
    window.localStorage.setItem("oddwheels:search_history", JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function getLastSearchTerm() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("oddwheels:last_search");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { term?: string };
    return typeof parsed?.term === "string" ? parsed.term : null;
  } catch {
    return null;
  }
}

type SearchHistoryEntry = {
  term: string;
  count: number;
  lastUsed: number;
};

function readSearchHistory() {
  if (typeof window === "undefined") return [] as SearchHistoryEntry[];
  try {
    const raw = window.localStorage.getItem("oddwheels:search_history");
    if (!raw) return [] as SearchHistoryEntry[];
    const parsed = JSON.parse(raw) as SearchHistoryEntry[];
    if (!Array.isArray(parsed)) return [] as SearchHistoryEntry[];
    return parsed.filter((entry) => entry?.term);
  } catch {
    return [] as SearchHistoryEntry[];
  }
}

export function getSearchHistory(limit = 6) {
  return readSearchHistory()
    .slice()
    .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
    .map((entry) => entry.term)
    .filter(Boolean)
    .slice(0, limit);
}
