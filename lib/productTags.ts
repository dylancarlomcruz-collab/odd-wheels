export const PRODUCT_SPECIAL_TAG_OPTIONS = [
  { key: "exclusive", label: "Exclusive" },
  { key: "limited_edition", label: "Limited Edition" },
  { key: "chase", label: "Chase" },
  { key: "rare", label: "Rare" },
  { key: "new_release", label: "New Release" },
  { key: "discontinued", label: "Discontinued" },
] as const;

export type ProductSpecialTag =
  (typeof PRODUCT_SPECIAL_TAG_OPTIONS)[number]["key"];

const PRODUCT_SPECIAL_TAG_LABELS = new Map(
  PRODUCT_SPECIAL_TAG_OPTIONS.map((option) => [option.key, option.label] as const)
);
const PRODUCT_SPECIAL_TAG_ALIAS_MAP = new Map<string, ProductSpecialTag>([
  ["exclusive", "exclusive"],
  ["limited", "limited_edition"],
  ["limited_edition", "limited_edition"],
  ["limited edition", "limited_edition"],
  ["chase", "chase"],
  ["chaser", "chase"],
  ["rare", "rare"],
  ["new_release", "new_release"],
  ["new release", "new_release"],
  ["discontinued", "discontinued"],
  ["discontinue", "discontinued"],
]);
const NEW_RELEASE_WINDOW_MS = 1000 * 60 * 60 * 24 * 30;

function normalizeTagValue(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTagToken(value: string | null | undefined) {
  return normalizeTagValue(value).replace(/\s+/g, "_");
}

function normalizeTagText(value: string | null | undefined) {
  return normalizeTagValue(value);
}

function isNewRelease(createdAt: string | null | undefined) {
  if (!createdAt) return false;
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = Date.now() - timestamp;
  return ageMs >= 0 && ageMs <= NEW_RELEASE_WINDOW_MS;
}

export function normalizeProductSpecialTags(
  values: ReadonlyArray<string | null | undefined> | null | undefined
): ProductSpecialTag[] {
  const resolved = new Set<ProductSpecialTag>();

  for (const rawValue of values ?? []) {
    const normalizedValue = normalizeTagValue(rawValue);
    const normalizedToken = normalizeTagToken(rawValue);
    const match =
      PRODUCT_SPECIAL_TAG_ALIAS_MAP.get(normalizedValue) ??
      PRODUCT_SPECIAL_TAG_ALIAS_MAP.get(normalizedToken);
    if (match) {
      resolved.add(match);
    }
  }

  return PRODUCT_SPECIAL_TAG_OPTIONS.map((option) => option.key).filter((key) =>
    resolved.has(key)
  );
}

export function getProductSpecialTagLabel(tag: ProductSpecialTag) {
  return PRODUCT_SPECIAL_TAG_LABELS.get(tag) ?? tag;
}

export function inferProductSpecialTags(input: {
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  variation?: string | null;
  createdAt?: string | null;
}): ProductSpecialTag[] {
  const text = normalizeTagText(
    [input.title, input.brand, input.model, input.variation]
      .filter(Boolean)
      .join(" ")
  );
  const detected = new Set<ProductSpecialTag>();

  if (/\bexclusive\b/i.test(text)) {
    detected.add("exclusive");
  }
  if (/\blimited(?:\s+edition)?\b/i.test(text)) {
    detected.add("limited_edition");
  }
  if (/\bchase(?:r)?\b/i.test(text)) {
    detected.add("chase");
  }
  if (/\brare\b/i.test(text)) {
    detected.add("rare");
  }
  if (/\bnew\s+release\b/i.test(text) || isNewRelease(input.createdAt)) {
    detected.add("new_release");
  }
  if (/\bdiscontinue(?:d)?\b/i.test(text)) {
    detected.add("discontinued");
  }

  return PRODUCT_SPECIAL_TAG_OPTIONS.map((option) => option.key).filter((key) =>
    detected.has(key)
  );
}
