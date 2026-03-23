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

export type ProductSpecialTagStyle = {
  displayClassName: string;
  pickerClassName: string;
  gradientStart: string;
  gradientEnd: string;
  borderColor: string;
  textColor: string;
  glowColor: string;
};

const PRODUCT_SPECIAL_TAG_LABELS = new Map(
  PRODUCT_SPECIAL_TAG_OPTIONS.map((option) => [option.key, option.label] as const)
);
const PRODUCT_SPECIAL_TAG_STYLES: Record<
  ProductSpecialTag,
  ProductSpecialTagStyle
> = {
  exclusive: {
    displayClassName:
      "border-white/85 bg-[linear-gradient(135deg,#1ed4c6_0%,#0f8f83_100%)] text-white shadow-[0_10px_22px_rgba(15,143,131,0.34)]",
    pickerClassName:
      "border-white/85 bg-[linear-gradient(135deg,#1ed4c6_0%,#0f8f83_100%)] text-white shadow-[0_10px_18px_rgba(15,143,131,0.28)] hover:brightness-105",
    gradientStart: "#1ed4c6",
    gradientEnd: "#0f8f83",
    borderColor: "rgba(255,255,255,0.86)",
    textColor: "#ffffff",
    glowColor: "rgba(15,143,131,0.34)",
  },
  limited_edition: {
    displayClassName:
      "border-white/85 bg-[linear-gradient(135deg,#f7bc2a_0%,#db7b08_100%)] text-white shadow-[0_10px_22px_rgba(219,123,8,0.34)]",
    pickerClassName:
      "border-white/85 bg-[linear-gradient(135deg,#f7bc2a_0%,#db7b08_100%)] text-white shadow-[0_10px_18px_rgba(219,123,8,0.28)] hover:brightness-105",
    gradientStart: "#f7bc2a",
    gradientEnd: "#db7b08",
    borderColor: "rgba(255,247,237,0.9)",
    textColor: "#ffffff",
    glowColor: "rgba(219,123,8,0.34)",
  },
  chase: {
    displayClassName:
      "border-white/85 bg-[linear-gradient(135deg,#fb7185_0%,#be123c_100%)] text-white shadow-[0_10px_22px_rgba(190,24,93,0.34)]",
    pickerClassName:
      "border-white/85 bg-[linear-gradient(135deg,#fb7185_0%,#be123c_100%)] text-white shadow-[0_10px_18px_rgba(190,24,93,0.28)] hover:brightness-105",
    gradientStart: "#fb7185",
    gradientEnd: "#be123c",
    borderColor: "rgba(255,228,230,0.9)",
    textColor: "#ffffff",
    glowColor: "rgba(190,24,93,0.34)",
  },
  rare: {
    displayClassName:
      "border-white/85 bg-[linear-gradient(135deg,#8b5cf6_0%,#6d28d9_100%)] text-white shadow-[0_10px_22px_rgba(109,40,217,0.34)]",
    pickerClassName:
      "border-white/85 bg-[linear-gradient(135deg,#8b5cf6_0%,#6d28d9_100%)] text-white shadow-[0_10px_18px_rgba(109,40,217,0.28)] hover:brightness-105",
    gradientStart: "#8b5cf6",
    gradientEnd: "#6d28d9",
    borderColor: "rgba(243,232,255,0.9)",
    textColor: "#ffffff",
    glowColor: "rgba(109,40,217,0.34)",
  },
  new_release: {
    displayClassName:
      "border-white/85 bg-[linear-gradient(135deg,#4ee7b6_0%,#138a67_100%)] text-white shadow-[0_10px_22px_rgba(19,138,103,0.34)]",
    pickerClassName:
      "border-white/85 bg-[linear-gradient(135deg,#4ee7b6_0%,#138a67_100%)] text-white shadow-[0_10px_18px_rgba(19,138,103,0.28)] hover:brightness-105",
    gradientStart: "#4ee7b6",
    gradientEnd: "#138a67",
    borderColor: "rgba(209,250,229,0.9)",
    textColor: "#ffffff",
    glowColor: "rgba(19,138,103,0.34)",
  },
  discontinued: {
    displayClassName:
      "border-white/85 bg-[linear-gradient(135deg,#94a3b8_0%,#475569_100%)] text-white shadow-[0_10px_22px_rgba(71,85,105,0.34)]",
    pickerClassName:
      "border-white/85 bg-[linear-gradient(135deg,#94a3b8_0%,#475569_100%)] text-white shadow-[0_10px_18px_rgba(71,85,105,0.28)] hover:brightness-105",
    gradientStart: "#94a3b8",
    gradientEnd: "#475569",
    borderColor: "rgba(241,245,249,0.9)",
    textColor: "#ffffff",
    glowColor: "rgba(71,85,105,0.34)",
  },
};
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

export function getProductSpecialTagStyle(tag: ProductSpecialTag) {
  return PRODUCT_SPECIAL_TAG_STYLES[tag];
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
