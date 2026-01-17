export type InferredFields = {
  brand?: string;
  model?: string;
  color_style?: string;
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
  const title = (titleRaw ?? "").trim();
  if (!title) return {};

  const lower = title.toLowerCase();

  // Brand
  let brand: string | undefined;
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
  const title = String(titleRaw ?? "");
  if (!title.trim()) return title;
  let out = title;

  for (const b of BRAND_ALIASES) {
    for (const alias of b.aliases) {
      const pattern = new RegExp(`\\b${aliasPattern(alias)}\\b`, "ig");
      out = out.replace(pattern, b.canonical);
    }
  }

  return out;
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
