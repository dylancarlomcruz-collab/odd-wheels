export type InferredFields = {
  brand?: string;
  model?: string;
  color_style?: string;
};

export type NormalizedLookupFields = {
  title?: string;
  brand?: string;
  model?: string;
  variation?: string;
};

const BRAND_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "Mini GT", aliases: ["mini gt", "minigt"] },
  { canonical: "Kaido House", aliases: ["kaido house", "kaido"] },
  { canonical: "Inno64", aliases: ["inno64", "inno 64", "inno"] },
  { canonical: "Tarmac", aliases: ["tarmac", "tarmac works", "tarmacworks"] },
  { canonical: "POP RACE", aliases: ["pop race", "poprace"] },
  { canonical: "BMC", aliases: ["bmc"] },
  { canonical: "Hot Wheels", aliases: ["hot wheels", "hotwheels"] },
  { canonical: "Tomica", aliases: ["tomica"] },
  { canonical: "Focal Horizon", aliases: ["focal horizon", "focalhorizon"] },
  { canonical: "Street Warrior", aliases: ["street warrior", "street warriro", "streetwarrior"] },
  { canonical: "GCD", aliases: ["gcd"] },
];

const COLOR_WORDS = [
  "black","white","silver","grey","gray","red","blue","green","yellow","orange","purple","pink","gold","brown","beige","tan",
  "chrome","matte","carbon","metallic","pearl",
];

export function inferFieldsFromTitle(titleRaw: string): InferredFields {
  const title = stripMarketplaceMentions(titleRaw ?? "").trim();
  if (!title) return {};

  const lower = title.toLowerCase();

  // Brand
  let brand: string | undefined;
  if (lower.includes("kaido house") && lower.includes("mini gt")) {
    brand = "Kaido House";
  }
  for (const b of BRAND_ALIASES) {
    if (b.aliases.some((a) => lower.includes(a))) {
      brand = b.canonical;
      break;
    }
  }

  // Color/style: bracketed or common colors
  let color_style: string | undefined;
  const bracket = title.match(/\[(.+?)\]/) || title.match(/\(([^)]+)\)/);
  if (bracket?.[1]) {
    const txt = bracket[1].trim();
    if (txt && txt.length <= 40) color_style = txt;
  }

  if (!color_style) {
    const foundColors: string[] = [];
    for (const c of COLOR_WORDS) {
      const re = new RegExp(`\\b${escapeRegExp(c)}\\b`, "i");
      if (re.test(title)) foundColors.push(c);
    }
    if (foundColors.length) {
      // Preserve original casing roughly
      color_style = foundColors.map((c) => capitalize(c)).join(" ");
    }
  }

  // Model: best-effort cleanup
  // Remove brand + scale + bracketed segments
  let cleaned = title;
  cleaned = cleaned.replace(/\b1\s*\/\s*\d+\b/gi, "");
  cleaned = cleaned.replace(/\bscale\b/gi, "");
  cleaned = cleaned.replace(/\[[^\]]+\]/g, "");
  cleaned = cleaned.replace(/\([^)]*\)/g, "");

  if (brand) {
    for (const b of BRAND_ALIASES.find((x) => x.canonical === brand)?.aliases ?? []) {
      const re = new RegExp(escapeRegExp(b), "ig");
      cleaned = cleaned.replace(re, "");
    }
  }

  // Remove common filler terms
  cleaned = cleaned
    .replace(/\b(lbwk|liberty walk|works|collection|limited|edition|model|diecast|chase|version|ver\.?|v\d+)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // If title still long, take first ~8 words as a "model" candidate
  const words = cleaned.split(/\s+/).filter(Boolean);
  const model = words.length ? words.slice(0, 8).join(" ") : undefined;

  return {
    brand,
    model,
    color_style,
  };
}

export function normalizeKaidoMiniGtTitle(
  titleRaw: string,
  fallbackColor?: string | null
): NormalizedLookupFields | null {
  const raw = String(titleRaw ?? "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (!lower.includes("kaido house") || !lower.includes("mini gt")) return null;

  const normalized = normalizeTitleBrandAliases(raw);

  const bracket =
    normalized.match(/\(([^)]+)\)/) || normalized.match(/\[([^\]]+)\]/);
  let bracketColor = (bracket?.[1] || bracket?.[2] || "").trim();
  if (
    bracketColor &&
    /(edition|limited|scale|1[:/]\d+|\b20\d{2}\b)/i.test(bracketColor)
  ) {
    bracketColor = "";
  }

  let color = bracketColor;
  if (!color && fallbackColor) {
    color = String(fallbackColor).trim();
  }
  if (!color) {
    const inferred = inferFieldsFromTitle(normalized);
    color = inferred.color_style ?? "";
  }
  if (color && /(edition|limited|scale|1[:/]\d+|\b20\d{2}\b)/i.test(color)) {
    color = "";
  }

  const versionMatch =
    normalized.match(/\bV\d+\b/i) || normalized.match(/\bVer\.?\s*\d+\b/i);
  const version = versionMatch
    ? versionMatch[0].replace(/ver\.?\s*/i, "V").toUpperCase()
    : "";

  let cleaned = normalized
    .replace(/(?:\bkaido\s+house\b\s*){2,}/gi, "Kaido House ")
    .replace(/\bkaido\s+house\b/gi, " ")
    .replace(/\bmini\s*gt\b/gi, " ")
    .replace(/\b(?:x|a-)\b/gi, " ")
    .replace(/\bKHMG\d+\b/gi, " ")
    .replace(/\bhouse\s+racing\b/gi, " ")
    .replace(/\bhouse\s+special\b/gi, " ")
    .replace(/\bhouse\b/gi, " ")
    .replace(/\bno\.?\s*\d+\b/gi, " ")
    .replace(/\b1\s*64\b/gi, " ")
    .replace(/\b1\s*[:/]\s*\d+\b/gi, " ")
    .replace(/\bscale\b/gi, " ")
    .replace(/\b(?:limited|edition|diecast|model|collection|special|car)\b/gi, " ")
    .replace(/\b20\d{2}\b/g, " ")
    .replace(/\bV\d+\b/gi, " ")
    .replace(/\bVer\.?\s*\d+\b/gi, " ")
    .replace(/[-"'|]/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  function splitModelAndDetail(text: string) {
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return { model: "", detail: "" };
    const detailIndex = words.findIndex((word) => {
      const clean = word.replace(/[^a-z0-9]/gi, "").toLowerCase();
      return COLOR_WORDS.includes(clean);
    });
    if (detailIndex > 0) {
      return {
        model: words.slice(0, detailIndex).join(" "),
        detail: words.slice(detailIndex).join(" "),
      };
    }
    return { model: text.trim(), detail: "" };
  }

  const split = splitModelAndDetail(cleaned);
  const model = split.model.trim();
  if (!model) return null;
  const detail = split.detail || color;
  const useInlineDetail = Boolean(
    detail && /(with|design|graphic|hood|livery|stripe|decal)/i.test(detail)
  );
  const titleParts = ["Kaido House", model];
  if (useInlineDetail && detail) {
    titleParts.push(detail);
  } else if (version) {
    titleParts.push(version);
  }
  const title =
    detail && !useInlineDetail
      ? `${titleParts.join(" ")} (${detail})`
      : titleParts.join(" ");

  return {
    title,
    brand: "Kaido House",
    model,
    variation: detail || (version ? version : undefined),
  };
}

export function normalizeBrandAlias(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  const exact = BRAND_ALIASES.find((b) => b.aliases.includes(lower));
  if (exact) return exact.canonical;

  const partial = BRAND_ALIASES.find((b) =>
    b.aliases.some((a) => lower.includes(a))
  );
  return partial ? partial.canonical : value;
}

export function normalizeTitleBrandAliases(titleRaw: string): string {
  const title = stripMarketplaceMentions(titleRaw ?? "");
  if (!title.trim()) return title;
  let out = title;

  for (const b of BRAND_ALIASES) {
    for (const alias of b.aliases) {
      const pattern = new RegExp(`\\b${aliasPattern(alias)}\\b`, "ig");
      out = out.replace(pattern, b.canonical);
    }
  }

  if (/kaido house/i.test(out)) {
    out = out
      .replace(/(\bKaido\s+House\b)(?:\s+House\b)+/gi, "$1")
      .replace(/(?:\bKaido\s+House\b\s*){2,}/gi, "Kaido House ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return out;
}

export function normalizeLookupTitle(
  titleRaw: string | null | undefined,
  brandRaw?: string | null
): string {
  const base = normalizeTitleBrandAliases(String(titleRaw ?? ""));
  const cleanedBase = cleanupLookupTitle(base);
  const normalizedBrand = normalizeBrandAlias(brandRaw) ?? String(brandRaw ?? "").trim();
  if (!normalizedBrand) return cleanedBase;

  const withoutBrand = cleanupLookupTitle(removeBrandFromTitle(cleanedBase, normalizedBrand));
  if (!withoutBrand) return normalizedBrand;

  const startsWithBrand = new RegExp(
    `^${escapeRegExp(normalizedBrand).replace(/\\s+/g, "\\\\s+")}\\b`,
    "i"
  );
  if (startsWithBrand.test(withoutBrand)) return withoutBrand;

  return `${normalizedBrand} ${withoutBrand}`.replace(/\s{2,}/g, " ").trim();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasPattern(alias: string) {
  return escapeRegExp(alias).replace(/\s+/g, "\\s+");
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cleanupLookupTitle(value: string) {
  let out = String(value ?? "");
  out = out.replace(/\b1\s*[:/]\s*64\b/gi, " ");
  out = out.replace(/\(\s*\)/g, " ").replace(/\[\s*\]/g, " ");
  out = out.replace(/\s{2,}/g, " ");
  out = out.replace(/^[\s\-|:]+/g, "");
  out = out.replace(/[\s\-|:]+$/g, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

function stripMarketplaceMentions(value: string) {
  let out = String(value ?? "");
  const patterns = [
    /\s*(?:[\|\-:]\s*)?\bebay\b\s*/gi,
    /\s*(?:[\|\-:]\s*)?\bHobbySearch\s+Diecast\s+Car\s+Store\b\s*/gi,
  ];
  for (const pattern of patterns) {
    out = out.replace(pattern, " ");
  }
  out = out.replace(/\s{2,}/g, " ");
  out = out.replace(/^[\s\-|:]+/g, "");
  out = out.replace(/[\s\-|:]+$/g, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

function removeBrandFromTitle(title: string, brand: string) {
  const brandPattern = escapeRegExp(brand).replace(/\s+/g, "\\s+");
  let out = String(title ?? "");
  out = out.replace(new RegExp(`\\bby\\s+${brandPattern}\\b`, "ig"), " ");
  out = out.replace(new RegExp(`\\b${brandPattern}\\b`, "ig"), " ");
  out = out.replace(/\bby\b\s*$/i, " ");
  return out.replace(/\s{2,}/g, " ").trim();
}
