"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPHP } from "@/lib/money";
import { getOptimizedImageUrl } from "@/lib/imageUrl";
import {
  inferFieldsFromTitle,
  normalizeBrandAlias,
  normalizeTitleBrandAliases,
} from "@/lib/titleInference";
import { formatConditionLabel } from "@/lib/conditions";

type SheetRow = {
  id: string;
  condition: string | null;
  ship_class: string | null;
  qty: number | null;
  price: number | null;
  product: {
    id: string;
    title: string;
    brand: string | null;
    model: string | null;
    variation: string | null;
    image_urls: string[] | null;
  } | null;
};

type ExportRow = SheetRow & {
  price_min: number | null;
  price_max: number | null;
  qty_total: number | null;
  variant_count: number;
};

const PAGE_SIZE = 200;
const EXPORT_PAGE_SIZE = 1000;
const CARD_EXPORT_SIZE = 1080;
const CARD_FOLDER_LIMIT = 80;
const EIGHT_UP_WIDTH = 1080;
const EIGHT_UP_HEIGHT = 1080;
const GRID_COLS = 3;
const GRID_ROWS = 3;
const GRID_PAGE_SIZE = GRID_COLS * GRID_ROWS;
const EXPORT_THUMB_WIDTH = 960;
const EXPORT_THUMB_HEIGHT = 720;
const EXPORT_THUMB_QUALITY = 100;
let cachedNoisePattern: CanvasPattern | null = null;
let cachedNoiseContext: CanvasRenderingContext2D | null = null;

function formatBrand(row: SheetRow) {
  const rawBrand = row.product?.brand ?? "";
  const normalized = normalizeBrandAlias(rawBrand);
  if (normalized) return normalized;
  const inferred = inferFieldsFromTitle(row.product?.title ?? "");
  return inferred.brand ?? "Unknown";
}

const BOXED_TRUESCALE_BRANDS = new Set(
  [
    "Mini GT",
    "Kaido House",
    "Pop Race",
    "Tarmac",
    "Tarmac Works",
    "TLVN",
    "TLV-N",
    "Tomica Limited Vintage",
    "Tomica Limited Vintage Neo",
    "Masdi",
    "XCarToys",
    "X Car Toys",
  ].map((brand) => brand.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
);
const BOXED_TRUESCALE_ACRYLIC_OVERRIDES = new Set(
  ["Masdi", "XCarToys", "X Car Toys"].map((brand) =>
    brand.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  )
);
const TRUESCALE_NO_MARKET_SPLIT_BRANDS = new Set(
  ["Kaido House", "Pop Race"].map((brand) =>
    brand.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  )
);
const MINI_GT_BRANDS = new Set(
  ["Mini GT", "MiniGT"].map((brand) =>
    brand.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  )
);
const TOMICA_BRANDS = new Set(
  ["Tomica", "Takara Tomy", "Takara Tomy Tomica"].map((brand) =>
    brand.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  )
);
const HOT_WHEELS_BRANDS = new Set(
  ["Hot Wheels", "Hot Wheels Premium"].map((brand) =>
    brand.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  )
);
const DOWNLOAD_CATEGORY_ORDER = [
  "Truescales JDM",
  "Truescales EUR/US",
  "Mini GT JDM",
  "Mini GT EUR/US",
  "Boxed Truescales",
  "Blistered Truescales",
  "Figures and Dioramas",
  "Tomica",
  "Hot Wheels",
  "Trucks",
  "Others",
];

function normalizeCategoryBrand(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const JDM_MAKES = new Set(
  [
    "Toyota",
    "Nissan",
    "Honda",
    "Mazda",
    "Subaru",
    "Mitsubishi",
    "Lexus",
    "Infiniti",
    "Suzuki",
    "Isuzu",
  ].map((make) => make.toLowerCase())
);

const JDM_MODEL_HINTS: RegExp[] = [
  /\bsupra\b/i,
  /\bskyline\b/i,
  /\bg\s*t\s*-?\s*r\b/i,
  /\bcivic\b/i,
  /\bcrx\b/i,
  /\bdel\s*sol\b/i,
  /\bintegra\b/i,
  /\bnsx\b/i,
  /\bs2000\b/i,
  /\bs660\b/i,
  /\btype\s*r\b/i,
  /\bsilvia\b/i,
  /\b180\s*sx\b/i,
  /\b200\s*sx\b/i,
  /\b240\s*sx\b/i,
  /\bae86\b/i,
  /\btrueno\b/i,
  /\blevin\b/i,
  /\bgt\s*-?\s*86\b/i,
  /\bgr\s*-?\s*86\b/i,
  /\brx\s*-?\s*7\b/i,
  /\brx\s*-?\s*8\b/i,
  /\bmazdaspeed\b/i,
  /\bmx\s*-?\s*5\b/i,
  /\bmiata\b/i,
  /\bmr\s*-?\s*2\b/i,
  /\bchaser\b/i,
  /\bcresta\b/i,
  /\bmark\s*ii\b/i,
  /\baristo\b/i,
  /\bsoarer\b/i,
  /\bcelsior\b/i,
  /\bcrown\b/i,
  /\bcentury\b/i,
  /\bhiace\b/i,
  /\balphard\b/i,
  /\bvellfire\b/i,
  /\bfairlady\b/i,
  /\bz\s*(?:32|33|34)\b/i,
  /\b(?:z32|z33|z34)\b/i,
  /\bimpreza\b/i,
  /\bwrx\b/i,
  /\bsti\b/i,
  /\bevo\b/i,
  /\bevolution\b/i,
  /\b(?:r32|r33|r34|r35)\b/i,
  /\b(?:s13|s14|s15)\b/i,
  /\b(?:bnr32|bnr33|bnr34)\b/i,
  /\b(?:jzx90|jzx100|jzx110)\b/i,
  /\b(?:fc3s|fd3s|sa22)\b/i,
];

function hasJdmModelHint(value: string) {
  if (!value) return false;
  return JDM_MODEL_HINTS.some((pattern) => pattern.test(value));
}

function isJdmMarket(row: SheetRow) {
  const inferred = inferVehicleMakeModel(row);
  const makeKey = String(inferred.make ?? "").toLowerCase();
  if (makeKey && JDM_MAKES.has(makeKey)) return true;
  const title = normalizeTitleBrandAliases(row.product?.title ?? "");
  const extra = `${row.product?.model ?? ""} ${row.product?.variation ?? ""}`;
  const combined = `${title} ${extra}`;
  if (/\bjdm\b/i.test(combined)) return true;
  return hasJdmModelHint(combined);
}

function formatDownloadCategory(row: SheetRow) {
  const shipClass = String(row.ship_class ?? "").toUpperCase().trim();
  const brandKey = normalizeCategoryBrand(formatBrand(row));
  let baseCategory = "Others";
  if (shipClass && shipClass !== "UNASSIGNED") {
    if (shipClass === "ACRYLIC_TRUE_SCALE") baseCategory = "Truescales";
    else if (shipClass === "MINI_GT") baseCategory = "Mini GT";
    else if (shipClass === "BLISTER") baseCategory = "Blistered Truescales";
    else if (shipClass === "FIGURES_DIORAMA") baseCategory = "Figures and Dioramas";
    else if (shipClass === "TRUCKS") baseCategory = "Trucks";
    if (shipClass === "HOT_WHEELS_MAINLINE" || shipClass === "HOT_WHEELS_PREMIUM") {
      baseCategory = "Hot Wheels";
    }
  }
  if (
    (baseCategory === "Truescales" ||
      baseCategory === "Boxed Truescales" ||
      baseCategory === "Others") &&
    MINI_GT_BRANDS.has(brandKey)
  ) {
    baseCategory = "Mini GT";
  }
  if (baseCategory === "Others") {
    if (BOXED_TRUESCALE_BRANDS.has(brandKey)) baseCategory = "Boxed Truescales";
    else if (TOMICA_BRANDS.has(brandKey)) baseCategory = "Tomica";
    else if (HOT_WHEELS_BRANDS.has(brandKey)) baseCategory = "Hot Wheels";
  }

  if (
    baseCategory === "Truescales" ||
    baseCategory === "Boxed Truescales" ||
    baseCategory === "Mini GT"
  ) {
    if (
      baseCategory === "Truescales" &&
      BOXED_TRUESCALE_ACRYLIC_OVERRIDES.has(brandKey)
    ) {
      baseCategory = "Boxed Truescales";
    }
    if (baseCategory === "Mini GT") {
      return `${baseCategory} ${isJdmMarket(row) ? "JDM" : "EUR/US"}`;
    }
    if (baseCategory === "Truescales") {
      if (TRUESCALE_NO_MARKET_SPLIT_BRANDS.has(brandKey)) {
        return baseCategory;
      }
      return `${baseCategory} ${isJdmMarket(row) ? "JDM" : "EUR/US"}`;
    }
    return baseCategory;
  }

  return baseCategory;
}

function formatDownloadTitle(category: string) {
  if (!category) return "Collection";
  return `${category} Collection`;
}

const FALLBACK_DIECAST_BRANDS = [
  "Mini GT",
  "Kaido House",
  "Inno64",
  "Tarmac",
  "Tarmac Works",
  "POP RACE",
  "Pop Race",
  "Hot Wheels",
  "Tomica",
  "BMC",
  "GCD",
  "Focal Horizon",
  "Street Warrior",
  "Street Weapon",
  "StreetWeapon",
  "Howie",
  "Howie Model",
  "Para64",
  "Para 64",
  "Auto World",
  "Greenlight",
  "Johnny Lightning",
  "M2 Machines",
  "Matchbox",
  "Majorette",
  "Kyosho",
  "Welly",
  "Maisto",
];

let runtimeDiecastBrands: string[] = [];

function setRuntimeDiecastBrands(list: string[]) {
  runtimeDiecastBrands = list.filter(Boolean);
  VEHICLE_CACHE.clear();
}

function getDiecastBrands() {
  const merged = [...runtimeDiecastBrands, ...FALLBACK_DIECAST_BRANDS];
  return Array.from(new Set(merged.filter(Boolean)));
}

const VEHICLE_MAKE_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "Toyota", aliases: ["toyota", "trd"] },
  { canonical: "Nissan", aliases: ["nissan", "nismo"] },
  { canonical: "Honda", aliases: ["honda"] },
  { canonical: "Mazda", aliases: ["mazda"] },
  { canonical: "Subaru", aliases: ["subaru"] },
  { canonical: "Mitsubishi", aliases: ["mitsubishi", "mitsubushi"] },
  { canonical: "Lexus", aliases: ["lexus"] },
  { canonical: "Acura", aliases: ["acura"] },
  { canonical: "Infiniti", aliases: ["infiniti"] },
  { canonical: "Suzuki", aliases: ["suzuki"] },
  { canonical: "Isuzu", aliases: ["isuzu"] },
  { canonical: "Kia", aliases: ["kia"] },
  { canonical: "Hyundai", aliases: ["hyundai"] },
  { canonical: "Genesis", aliases: ["genesis"] },
  { canonical: "BMW", aliases: ["bmw"] },
  { canonical: "Mercedes-Benz", aliases: ["mercedes", "mercedes-benz", "benz"] },
  { canonical: "Audi", aliases: ["audi"] },
  { canonical: "Volkswagen", aliases: ["volkswagen", "vw"] },
  { canonical: "Porsche", aliases: ["porsche"] },
  { canonical: "Ferrari", aliases: ["ferrari"] },
  { canonical: "Lamborghini", aliases: ["lamborghini", "lambo"] },
  { canonical: "McLaren", aliases: ["mclaren", "mc laren"] },
  { canonical: "Aston Martin", aliases: ["aston martin", "astonmartin"] },
  { canonical: "Bentley", aliases: ["bentley"] },
  { canonical: "Rolls-Royce", aliases: ["rolls-royce", "rolls royce"] },
  { canonical: "Jaguar", aliases: ["jaguar"] },
  { canonical: "Land Rover", aliases: ["land rover", "landrover", "range rover"] },
  { canonical: "Mini", aliases: ["mini cooper", "mini"] },
  { canonical: "Alfa Romeo", aliases: ["alfa romeo", "alfaromeo"] },
  { canonical: "Fiat", aliases: ["fiat"] },
  { canonical: "Maserati", aliases: ["maserati"] },
  { canonical: "Lotus", aliases: ["lotus"] },
  { canonical: "Pagani", aliases: ["pagani"] },
  { canonical: "Bugatti", aliases: ["bugatti"] },
  { canonical: "Koenigsegg", aliases: ["koenigsegg"] },
  { canonical: "Peugeot", aliases: ["peugeot"] },
  { canonical: "Renault", aliases: ["renault"] },
  { canonical: "Citroen", aliases: ["citroen"] },
  { canonical: "Skoda", aliases: ["skoda"] },
  { canonical: "Seat", aliases: ["seat"] },
  { canonical: "Opel", aliases: ["opel"] },
  { canonical: "Vauxhall", aliases: ["vauxhall"] },
  { canonical: "Lancia", aliases: ["lancia"] },
  { canonical: "Volvo", aliases: ["volvo"] },
  { canonical: "Saab", aliases: ["saab"] },
  { canonical: "Tesla", aliases: ["tesla"] },
  { canonical: "Chevrolet", aliases: ["chevrolet", "chevy"] },
  { canonical: "Ford", aliases: ["ford"] },
  { canonical: "Dodge", aliases: ["dodge"] },
  { canonical: "Chrysler", aliases: ["chrysler"] },
  { canonical: "Jeep", aliases: ["jeep"] },
  { canonical: "Cadillac", aliases: ["cadillac"] },
  { canonical: "GMC", aliases: ["gmc"] },
  { canonical: "Hummer", aliases: ["hummer"] },
  { canonical: "Ram", aliases: ["ram"] },
];

const VEHICLE_COLOR_WORDS = new Set([
  "black",
  "white",
  "silver",
  "grey",
  "gray",
  "red",
  "blue",
  "green",
  "yellow",
  "orange",
  "purple",
  "pink",
  "gold",
  "brown",
  "beige",
  "tan",
  "chrome",
  "matte",
  "carbon",
  "metallic",
  "pearl",
]);

function isColorToken(token: string) {
  const cleaned = String(token ?? "").toLowerCase();
  if (!cleaned) return false;
  if (VEHICLE_COLOR_WORDS.has(cleaned)) return true;
  const parts = cleaned.split(/[^a-z]+/).filter(Boolean);
  return parts.length > 0 && parts.every((part) => VEHICLE_COLOR_WORDS.has(part));
}

const VEHICLE_STOP_WORDS = new Set([
  "DIECAST",
  "MODEL",
  "CAR",
  "SCALE",
  "EDITION",
  "LIMITED",
  "EXCLUSIVE",
  "VERSION",
  "VER",
  "RESERVE",
  "CHASE",
  "SET",
  "SERIES",
  "COLLECTION",
  "WITH",
  "W",
  "W/",
  "RHD",
  "LHD",
]);

const VEHICLE_UPPER_WORDS = new Set([
  "GT",
  "GTR",
  "GT-R",
  "GTS",
  "GTO",
  "RS",
  "RSR",
  "AMG",
  "LBWK",
  "LB",
  "RWB",
  "JDM",
  "EVO",
  "NSX",
  "ZL1",
  "ZR1",
  "TRD",
  "STI",
  "TYPE",
  "TYPE-R",
  "TYPE-S",
  "V6",
  "V8",
  "V10",
  "V12",
  "FD",
  "FC",
  "EK9",
  "EG6",
  "DC2",
  "S15",
  "S13",
  "S14",
  "AE86",
  "R32",
  "R33",
  "R34",
]);

const MAKE_LOOKUP = VEHICLE_MAKE_ALIASES.flatMap((entry) =>
  entry.aliases.map((alias) => ({
    canonical: entry.canonical,
    alias,
    pattern: new RegExp(
      `\\b${alias
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\s+/g, "\\s+")
        .replace(/-/g, "[-\\s]?")}\\b`,
      "i"
    ),
    length: alias.length,
  }))
).sort((a, b) => b.length - a.length);

const VEHICLE_CACHE = new Map<string, { make: string; model: string }>();

function stripDiecastBrands(value: string, extra: string[] = []) {
  let out = String(value ?? "");
  const list = Array.from(new Set([...getDiecastBrands(), ...extra])).filter(
    Boolean
  );
  for (const brand of list) {
    const pattern = new RegExp(
      `\\b${brand
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\s+/g, "\\s+")
        .replace(/-/g, "[-\\s]?")}\\b`,
      "ig"
    );
    out = out.replace(pattern, " ");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function stripVehicleMake(value: string, make: string | null | undefined) {
  const raw = String(value ?? "");
  const mk = String(make ?? "").trim();
  if (!raw || !mk || mk === "Unknown") return raw;
  const pattern = new RegExp(
    `\\b${mk
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\s+/g, "\\s+")
      .replace(/-/g, "[-\\s]?")}\\b`,
    "ig"
  );
  return raw.replace(pattern, " ").replace(/\s{2,}/g, " ").trim();
}

function formatName(row: SheetRow) {
  const title = row.product?.title ?? "";
  return cleanDiecastTitle(normalizeTitleBrandAliases(title).trim()) || "Untitled";
}

function buildExportRowsForDownload(rows: SheetRow[]): ExportRow[] {
  const grouped = new Map<string, SheetRow[]>();
  for (const row of rows) {
    const key = row.product?.id ? `product:${row.product.id}` : `row:${row.id}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }

  const result: ExportRow[] = [];
  for (const bucket of grouped.values()) {
    const sample = bucket[0];
    let minPrice: number | null = null;
    let maxPrice: number | null = null;
    let qtyTotal = 0;
    let hasQty = false;

    for (const row of bucket) {
      if (typeof row.price === "number" && !Number.isNaN(row.price)) {
        minPrice = minPrice === null ? row.price : Math.min(minPrice, row.price);
        maxPrice = maxPrice === null ? row.price : Math.max(maxPrice, row.price);
      }
      if (typeof row.qty === "number" && !Number.isNaN(row.qty)) {
        qtyTotal += row.qty;
        hasQty = true;
      }
    }

    result.push({
      ...sample,
      price_min: minPrice,
      price_max: maxPrice,
      qty_total: hasQty ? qtyTotal : null,
      variant_count: bucket.length,
    });
  }

  return result;
}

function formatExportPrice(row: ExportRow) {
  const min = row.price_min;
  const max = row.price_max;
  if (min === null && max === null) return "-";
  if (min !== null && max !== null && min !== max) {
    return `${formatPHP(min)} - ${formatPHP(max)}`;
  }
  const price = min ?? max;
  return price === null ? "-" : formatPHP(price);
}

function formatExportCondition(row: ExportRow) {
  if (row.variant_count > 1) return "MULTI VARIANTS";
  return formatCompactCondition(row.condition);
}

function normalizeSheetRows(data: any[]): SheetRow[] {
  return (data ?? []).map((row) => ({
    ...row,
    product: Array.isArray(row.product)
      ? row.product[0] ?? null
      : row.product ?? null,
  }));
}

const DROP_TOKENS = new Set([
  "SCALE",
  "DIECAST",
  "MODEL",
  "CAR",
  "IN",
  "BOX",
  "EBAY",
  "EXCLUSIVE",
  "LIMITED",
  "EDITION",
  "LHD",
  "RHD",
]);

const UPPER_WORDS = new Set([
  "GT",
  "GTR",
  "GT-R",
  "GTS",
  "GTO",
  "RS",
  "RSR",
  "AMG",
  "LBWK",
  "LB",
  "RWB",
  "JDM",
  "EVO",
  "NSX",
  "ZL1",
  "ZR1",
  "TRD",
]);

function cleanupModel(raw: string, brand: string) {
  let cleaned = normalizeTitleBrandAliases(raw || "").trim();
  if (!cleaned) return "Unknown";

  cleaned = cleaned.replace(/\[[^\]]+\]|\([^)]*\)/g, " ");
  cleaned = cleaned.replace(/[,|]/g, " ");
  cleaned = cleaned.replace(/\b1\s*[:/]\s*\d+\b/gi, " ");
  cleaned = cleaned.replace(/\b1\s*-\s*\d+\b/gi, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  let tokens = cleaned.split(/\s+/).filter(Boolean);

  const brandTokens = brand
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (brandTokens.length && tokens.length >= brandTokens.length) {
    const head = tokens.slice(0, brandTokens.length).map((t) => t.toLowerCase());
    const brandLower = brandTokens.map((t) => t.toLowerCase());
    if (head.join(" ") === brandLower.join(" ")) {
      tokens = tokens.slice(brandTokens.length);
    }
  }

  while (tokens.length) {
    const token = tokens[0];
    if (/^[A-Z0-9]+[-/][A-Z0-9]+$/i.test(token)) {
      tokens.shift();
      continue;
    }
    if (/^\d{4,}[A-Z-]*$/i.test(token)) {
      tokens.shift();
      continue;
    }
    break;
  }

  tokens = tokens.filter((token) => {
    if (!token) return false;
    const upper = token.toUpperCase();
    if (DROP_TOKENS.has(upper)) return false;
    if (/^(19|20)\d{2}$/.test(token)) return false;
    if (/^1[:/-]\d+$/i.test(token)) return false;
    return true;
  });

  if (!tokens.length) return "Unknown";

  const formatPart = (part: string) => {
    if (!part) return "";
    const upper = part.toUpperCase();
    if (/[0-9]/.test(part)) return upper;
    if (UPPER_WORDS.has(upper)) return upper;
    if (part.length <= 2) return upper;
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  };

  const formatToken = (token: string) => {
    const parts = token.split(/[-/]/);
    const seps = token.match(/[-/]/g) ?? [];
    const nextParts = parts.map(formatPart);
    let out = "";
    for (let i = 0; i < nextParts.length; i += 1) {
      out += nextParts[i];
      if (seps[i]) out += seps[i];
    }
    return out;
  };

  return tokens.map(formatToken).join(" ").trim() || "Unknown";
}

function cleanDiecastTitle(value: string) {
  let out = String(value ?? "");
  const patterns = [
    /\bdiecast\s+car\s+models?\b/gi,
    /\bdiecast\s+model\s+cars?\b/gi,
    /\bdiecast\s+models?\b/gi,
    /\bdiecast\s+cars?\b/gi,
    /\bdiecast\s+model\b/gi,
    /\bmodel\s+cars?\b/gi,
    /\bcar\s+models?\b/gi,
  ];
  for (const pattern of patterns) {
    out = out.replace(pattern, " ");
  }
  out = out.replace(/\(\s*\)/g, " ");
  out = out.replace(/\[\s*\]/g, " ");
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}

function formatModel(row: SheetRow) {
  return formatVehicleModel(row);
}

function modelSortKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferVehicleMakeModel(row: SheetRow) {
  const cacheKey = row.id || row.product?.id || "";
  if (cacheKey && VEHICLE_CACHE.has(cacheKey)) {
    return VEHICLE_CACHE.get(cacheKey)!;
  }

  const titleRaw = normalizeTitleBrandAliases(row.product?.title ?? "");
  const extra = [row.product?.model ?? "", row.product?.variation ?? ""]
    .filter(Boolean)
    .join(" ");
  const extraBrands = [row.product?.brand ?? ""].filter(Boolean) as string[];
  const combined = stripDiecastBrands(`${titleRaw} ${extra}`.trim(), extraBrands);
  const lower = combined.toLowerCase();

  let make: string | null = null;
  let makePattern: RegExp | null = null;
  for (const entry of MAKE_LOOKUP) {
    if (entry.pattern.test(lower)) {
      make = entry.canonical;
      makePattern = entry.pattern;
      break;
    }
  }

  let working = combined;
  if (makePattern) {
    if (
      make === "Land Rover" &&
      /range\\s+rover/i.test(makePattern.source)
    ) {
      if (/\\bland\\s+rover\\b/i.test(combined)) {
        makePattern = /\bland\s+rover\b/i;
      } else {
        makePattern = null;
      }
    }
  }
  if (makePattern) {
    const makeGlobal = new RegExp(makePattern.source, "ig");
    working = working.replace(makeGlobal, " ");
  }

  working = working
    .replace(/\[[^\]]+\]|\([^)]*\)/g, " ")
    .replace(/\b1\s*[:/]\s*\d+\b/gi, " ")
    .replace(/\b1\s*-\s*\d+\b/gi, " ")
    .replace(/\bscale\b/gi, " ")
    .replace(/[,|]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const tokens = working.split(/\s+/).filter(Boolean);
  while (tokens.length) {
    const token = tokens[0];
    if (!token) {
      tokens.shift();
      continue;
    }
    if (isColorToken(token)) {
      tokens.shift();
      continue;
    }
    const upper = token.toUpperCase();
    if (VEHICLE_STOP_WORDS.has(upper)) {
      tokens.shift();
      continue;
    }
    if (/^(19|20)\d{2}$/.test(token)) {
      tokens.shift();
      continue;
    }
    if (/^\d{4,}[A-Z-]*$/i.test(token)) {
      tokens.shift();
      continue;
    }
    break;
  }

  const modelTokens: string[] = [];
  for (const token of tokens) {
    if (!token) continue;
    const upper = token.toUpperCase();
    if (VEHICLE_STOP_WORDS.has(upper)) break;
    if (isColorToken(token)) break;
    modelTokens.push(token);
    if (modelTokens.length >= 8) break;
  }

  let cleanedTokens = modelTokens.filter(Boolean);
  const deduped: string[] = [];
  for (const token of cleanedTokens) {
    const last = deduped[deduped.length - 1];
    if (last && last.toLowerCase() === token.toLowerCase()) continue;
    deduped.push(token);
  }
  cleanedTokens = deduped;

  if (cleanedTokens.length > 1 && cleanedTokens.length % 2 === 0) {
    const half = cleanedTokens.length / 2;
    const firstHalf = cleanedTokens.slice(0, half);
    const secondHalf = cleanedTokens.slice(half);
    const matches = firstHalf.every(
      (token, idx) => token.toLowerCase() === secondHalf[idx]?.toLowerCase()
    );
    if (matches) cleanedTokens = firstHalf;
  }

  let modelText = cleanedTokens.join(" ").trim();
  if (!modelText) {
    const fallback =
      row.product?.model ??
      inferFieldsFromTitle(row.product?.title ?? "").model ??
      "";
    modelText = cleanupModel(fallback, make ?? "");
  }

  if (make && modelText.toLowerCase().startsWith(make.toLowerCase())) {
    modelText = modelText.slice(make.length).trim();
  }

  const formatPart = (part: string) => {
    if (!part) return "";
    const upper = part.toUpperCase();
    if (/[0-9]/.test(part)) return upper;
    if (VEHICLE_UPPER_WORDS.has(upper)) return upper;
    if (part.length <= 2) return upper;
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  };

  const formatToken = (token: string) => {
    const parts = token.split(/[-/]/);
    const seps = token.match(/[-/]/g) ?? [];
    const nextParts = parts.map(formatPart);
    let out = "";
    for (let i = 0; i < nextParts.length; i += 1) {
      out += nextParts[i];
      if (seps[i]) out += seps[i];
    }
    return out;
  };

  const model = modelText
    ? modelText
        .split(/\s+/)
        .map(formatToken)
        .join(" ")
        .trim()
    : "Unknown";

  const result = {
    make: make ?? "Unknown",
    model: model || "Unknown",
  };

  if (cacheKey) VEHICLE_CACHE.set(cacheKey, result);
  return result;
}

function formatVehicleMake(row: SheetRow) {
  return inferVehicleMakeModel(row).make || "Unknown";
}

function formatVehicleModel(row: SheetRow) {
  return inferVehicleMakeModel(row).model || "Unknown";
}

function formatVehicleDisplayModel(row: SheetRow) {
  const inferred = inferVehicleMakeModel(row);
  const make = inferred.make || "Unknown";
  const model = inferred.model || "Unknown";
  if (make === "Unknown") return model;
  if (model === "Unknown") return make;
  if (model.toLowerCase().startsWith(make.toLowerCase())) return model;
  return `${make} ${model}`.trim();
}

function inferVehicleMakeModelFromFields(fields: {
  id?: string;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  variation?: string | null;
}) {
  const row: SheetRow = {
    id: fields.id ?? "",
    condition: null,
    ship_class: null,
    qty: null,
    price: null,
    product: {
      id: fields.id ?? "",
      title: fields.title ?? "",
      brand: fields.brand ?? null,
      model: fields.model ?? null,
      variation: fields.variation ?? null,
      image_urls: null,
    },
  };
  return inferVehicleMakeModel(row);
}

function normalizeModelValue(value: string, make: string, extraBrands: string[] = []) {
  let cleaned = stripDiecastBrands(value, extraBrands);
  cleaned = stripVehicleMake(cleaned, make);
  cleaned = cleaned.replace(/\b1\s*[:/]\s*\d+\b/gi, " ");
  cleaned = cleaned.replace(/\bscale\b/gi, " ");
  cleaned = cleaned.replace(/\bmodel\b/gi, " ");
  cleaned = cleaned.replace(/\bdiecast\b/gi, " ");
  cleaned = cleaned.replace(/[,|]/g, " ");
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  if (!cleaned) return "";
  const normalized = cleanupModel(cleaned, make);
  return normalized === "Unknown" ? "" : normalized;
}

function tokenize(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function includesAllTokens(haystack: string, needle: string) {
  const hayTokens = new Set(tokenize(haystack));
  const needleTokens = tokenize(needle);
  if (!needleTokens.length) return false;
  return needleTokens.every((token) => hayTokens.has(token));
}

function shouldReplaceModel(current: string, inferred: string) {
  const currentClean = current.trim();
  if (!currentClean) return true;
  if (currentClean.length <= 2) return true;
  const upper = currentClean.toUpperCase();
  if (VEHICLE_STOP_WORDS.has(upper)) return true;
  if (includesAllTokens(currentClean, inferred)) return false;
  if (!includesAllTokens(inferred, currentClean) && inferred.length > currentClean.length) {
    return true;
  }
  return false;
}

function updateTitleWithMakeModel(
  title: string,
  make: string,
  model: string
) {
  const base = String(title ?? "").trim();
  if (!base) return `${make} ${model}`.trim();
  const hasMake = includesAllTokens(base, make);
  const hasModel = includesAllTokens(base, model);
  if (hasMake && hasModel) return base;
  let addition = "";
  if (!hasMake && !hasModel) {
    addition = `${make} ${model}`;
  } else if (!hasMake) {
    addition = make;
  } else if (!hasModel) {
    addition = model;
  }
  if (!addition) return base;
  return `${base} ${addition}`.replace(/\s{2,}/g, " ").trim();
}

function normalizeForCompare(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureMakeInModel(make: string, model: string) {
  const mk = String(make ?? "").trim();
  const md = String(model ?? "").trim();
  if (!mk) return md;
  if (!md) return mk;
  const mkNorm = normalizeForCompare(mk);
  const mdNorm = normalizeForCompare(md);
  if (!mkNorm || !mdNorm) return `${mk} ${md}`.trim();
  if (mdNorm.startsWith(mkNorm)) return md;
  if (includesAllTokens(mdNorm, mkNorm) || includesAllTokens(mkNorm, mdNorm)) {
    return md;
  }
  return `${mk} ${md}`.trim();
}

function vehicleSortKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCondition(value: string | null) {
  return formatConditionLabel(value, { upper: true });
}

const COMPACT_CONDITION_LABELS: Record<string, string> = {
  sealed: "SEALED",
  sealed_unsealed: "SEALED/UNSEALED",
  resealed: "RESEAL",
  near_mint: "NEAR MINT",
  unsealed: "UNSEAL",
  with_issues: "ISSUES",
  sealed_blister: "BLISTER",
  unsealed_blister: "BLISTER",
  blistered: "BLISTER",
};

function formatCompactCondition(value: string | null) {
  const key = String(value ?? "").toLowerCase();
  return COMPACT_CONDITION_LABELS[key] ?? formatCondition(value);
}

function normalizeSearchText(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatShipClassSearch(row: SheetRow) {
  const raw = String(row.ship_class ?? "").trim();
  if (!raw) return "";
  return `${raw} ${raw.replace(/_/g, " ")}`.trim();
}

function getMarketSearchTags(row: SheetRow) {
  if (isJdmMarket(row)) {
    return ["jdm", "jp", "japan"];
  }
  return ["eur", "eu", "europe", "us", "usa", "eur/us", "eurus"];
}

function buildRowSearchText(row: SheetRow) {
  const parts = [
    formatName(row),
    formatBrand(row),
    formatVehicleDisplayModel(row),
    formatVehicleMake(row),
    formatVehicleModel(row),
    row.product?.title ?? "",
    row.product?.brand ?? "",
    row.product?.model ?? "",
    row.product?.variation ?? "",
    formatCondition(row.condition),
    formatCompactCondition(row.condition),
    formatDownloadCategory(row),
    formatShipClassSearch(row),
    ...getMarketSearchTags(row),
  ];
  return normalizeSearchText(parts.join(" "));
}

function rowMatchesSearch(row: SheetRow, tokens: string[]) {
  if (!tokens.length) return true;
  const haystack = buildRowSearchText(row);
  return tokens.every((token) => haystack.includes(token));
}

function escapeCsv(value: string | number) {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function escapeHtml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getThumbUrl(
  rawUrl: string,
  {
    width = 200,
    height = 200,
    quality = 65,
    format = "webp",
    resize = "contain",
  }: {
    width?: number;
    height?: number;
    quality?: number;
    format?: "webp" | "jpeg" | "png";
    resize?: "cover" | "contain";
  } = {}
) {
  if (!rawUrl) return rawUrl;
  return getOptimizedImageUrl(rawUrl, {
    width,
    height,
    quality,
    format,
    resize,
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function trackedTextWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  tracking: number
) {
  if (!text) return 0;
  let width = 0;
  for (let i = 0; i < text.length; i += 1) {
    width += ctx.measureText(text[i]).width;
    if (i < text.length - 1) width += tracking;
  }
  return width;
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number
) {
  let cursor = x;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + tracking;
  }
}

function drawTrackedCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  tracking: number
) {
  const width = trackedTextWidth(ctx, text, tracking);
  drawTrackedText(ctx, text, centerX - width / 2, y, tracking);
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0) {
    const next = `${truncated}...`;
    if (ctx.measureText(next).width <= maxWidth) return next;
    truncated = truncated.slice(0, -1);
  }
  return text;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
      continue;
    }
    if (lines.length + 1 >= maxLines) {
      const remaining = `${current} ${word} ${words.slice(i + 1).join(" ")}`.trim();
      lines.push(truncateText(ctx, remaining, maxWidth));
      return lines;
    }
    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

function drawContainImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const imgWidth =
    (image as HTMLImageElement).naturalWidth ||
    (image as ImageBitmap).width ||
    width;
  const imgHeight =
    (image as HTMLImageElement).naturalHeight ||
    (image as ImageBitmap).height ||
    height;
  const scale = Math.min(width / imgWidth, height / imgHeight);
  const drawWidth = imgWidth * scale;
  const drawHeight = imgHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const imgWidth =
    (image as HTMLImageElement).naturalWidth ||
    (image as ImageBitmap).width ||
    width;
  const imgHeight =
    (image as HTMLImageElement).naturalHeight ||
    (image as ImageBitmap).height ||
    height;
  const scale = Math.max(width / imgWidth, height / imgHeight);
  const drawWidth = imgWidth * scale;
  const drawHeight = imgHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality = 0.92) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to render card image."));
      },
      type,
      quality
    );
  });
}

async function loadImageBitmap(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if ("createImageBitmap" in window) {
      return await createImageBitmap(blob);
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image failed to load"));
    });
    img.src = objectUrl;
    const imageEl = await imagePromise;
    URL.revokeObjectURL(objectUrl);
    return imageEl;
  } catch {
    return null;
  }
}

async function loadImageWithFallback(primary: string, fallback?: string | null) {
  if (!primary && fallback) return await loadImageBitmap(fallback);
  if (!primary) return null;
  const first = await loadImageBitmap(primary);
  if (first || !fallback) return first;
  return await loadImageBitmap(fallback);
}

function getNoisePattern(ctx: CanvasRenderingContext2D) {
  if (cachedNoisePattern && cachedNoiseContext === ctx) return cachedNoisePattern;
  const noiseCanvas = document.createElement("canvas");
  noiseCanvas.width = 128;
  noiseCanvas.height = 128;
  const noiseCtx = noiseCanvas.getContext("2d");
  if (!noiseCtx) return null;
  const imageData = noiseCtx.createImageData(128, 128);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const value = Math.floor(Math.random() * 255);
    imageData.data[i] = value;
    imageData.data[i + 1] = value;
    imageData.data[i + 2] = value;
    imageData.data[i + 3] = Math.floor(Math.random() * 35);
  }
  noiseCtx.putImageData(imageData, 0, 0);
  cachedNoisePattern = ctx.createPattern(noiseCanvas, "repeat");
  cachedNoiseContext = ctx;
  return cachedNoisePattern;
}

function renderCardCanvas(
  ctx: CanvasRenderingContext2D,
  row: SheetRow,
  image: CanvasImageSource | null
) {
  const size = CARD_EXPORT_SIZE;
  ctx.clearRect(0, 0, size, size);

  const bg = ctx.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, "#0f1016");
  bg.addColorStop(1, "#171826");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const glow1 = ctx.createRadialGradient(
    size * 0.85,
    size * 0.1,
    0,
    size * 0.85,
    size * 0.1,
    size * 0.38
  );
  glow1.addColorStop(0, "rgba(255,176,90,0.25)");
  glow1.addColorStop(1, "rgba(255,176,90,0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, size, size);

  const glow2 = ctx.createRadialGradient(
    size * 0.2,
    size * 0.85,
    0,
    size * 0.2,
    size * 0.85,
    size * 0.5
  );
  glow2.addColorStop(0, "rgba(255,210,140,0.14)");
  glow2.addColorStop(1, "rgba(255,210,140,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, size, size);

  const noise = getNoisePattern(ctx);
  if (noise) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = noise;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(255,176,90,0.35)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = "rgba(255,176,90,0.55)";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 14, 14, size - 28, size - 28, 56);
  ctx.stroke();
  ctx.restore();

  const brand = formatBrand(row).toUpperCase();
  ctx.save();
  ctx.fillStyle = "rgba(255,198,106,0.95)";
  ctx.font = '900 34px "Arial Black", Impact, sans-serif';
  ctx.textBaseline = "middle";
  drawTrackedCenteredText(ctx, brand, size / 2, 90, 8);
  ctx.restore();

  const panelWidth = Math.round(size * 0.82);
  const panelHeight = Math.round(size * 0.58);
  const panelX = Math.round((size - panelWidth) / 2);
  const panelY = 150;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#fffdf8";
  drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 34);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, panelX + 1, panelY + 1, panelWidth - 2, panelHeight - 2, 32);
  ctx.stroke();
  ctx.restore();

  const imagePadding = 0;
  const imgX = panelX + imagePadding;
  const imgY = panelY + imagePadding;
  const imgW = panelWidth - imagePadding * 2;
  const imgH = panelHeight - imagePadding * 2;

  if (image) {
    ctx.save();
    ctx.beginPath();
    drawRoundedRect(ctx, imgX, imgY, imgW, imgH, 32);
    ctx.clip();
    drawCoverImage(ctx, image, imgX, imgY, imgW, imgH);
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    drawRoundedRect(ctx, imgX, imgY, imgW, imgH, 22);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.font = '600 28px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No image", imgX + imgW / 2, imgY + imgH / 2);
    ctx.restore();
  }

  const title = formatName(row);
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = '600 30px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = "top";
  const titleX = 70;
  const titleY = panelY + panelHeight + 44;
  const titleLines = wrapText(ctx, title, size - titleX * 2, 2);
  const lineHeight = 38;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, titleX, titleY + i * lineHeight);
  });
  ctx.restore();

  const condition = formatCompactCondition(row.condition);
  ctx.save();
  ctx.font = '700 20px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const pillPaddingX = 18;
  const pillHeight = 44;
  const pillTextWidth = ctx.measureText(condition).width;
  const pillWidth = Math.max(pillTextWidth + pillPaddingX * 2, 120);
  const pillX = 70;
  const pillY = size - 70 - pillHeight;
  ctx.fillStyle = "rgba(255,180,90,0.16)";
  ctx.strokeStyle = "rgba(255,180,90,0.55)";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#6ef2d6";
  ctx.fillText(condition, pillX + pillPaddingX, pillY + pillHeight / 2);
  ctx.restore();

  const priceLabel =
    row.price === null || row.price === undefined
      ? "-"
      : formatPHP(Number(row.price));
  ctx.save();
  ctx.font = '800 60px "Arial Black", Impact, sans-serif';
  ctx.fillStyle = "rgba(255,198,106,0.98)";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(priceLabel, size - 70, size - 70);
  ctx.restore();
}

function renderEightUpCanvas(
  ctx: CanvasRenderingContext2D,
  rows: ExportRow[],
  images: Array<CanvasImageSource | null>,
  category: string
) {
  const width = EIGHT_UP_WIDTH;
  const height = EIGHT_UP_HEIGHT;
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#0f1016");
  bg.addColorStop(1, "#171826");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const noise = getNoisePattern(ctx);
  if (noise) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = noise;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255,138,0,0.55)";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 1, 1, width - 2, height - 2, 24);
  ctx.stroke();
  ctx.restore();

  const padding = 14;
  const headerHeight = 36;
  const footerHeight = 24;
  const gridX = padding;
  const gridY = padding + headerHeight;
  const gridW = width - padding * 2;
  const gridH = height - padding * 2 - headerHeight - footerHeight;
  const cols = GRID_COLS;
  const rowsCount = GRID_ROWS;
  const gap = 12;
  const cardW = (gridW - gap * (cols - 1)) / cols;
  const cardH = (gridH - gap * (rowsCount - 1)) / rowsCount;

  const headerTitle = formatDownloadTitle(category);
  if (headerTitle) {
    ctx.save();
    ctx.fillStyle = "#ff8a00";
    ctx.font = '800 22px "Arial Black", Impact, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(255,138,0,0.35)";
    ctx.shadowBlur = 8;
    ctx.fillText(
      headerTitle.toUpperCase(),
      width / 2,
      padding + headerHeight / 2
    );
    ctx.restore();
  }

  const footerY = height - padding - footerHeight / 2;
  ctx.save();
  ctx.font = '700 12px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = "middle";
  const prefix = "EXPLORE THE FULL ";
  const suffix = " COLLECTION AT ODD-WHEELS.COM";
  const highlight = category ? category.toUpperCase() : "COLLECTION";
  const prefixWidth = ctx.measureText(prefix).width;
  const highlightWidth = ctx.measureText(highlight).width;
  const suffixWidth = ctx.measureText(suffix).width;
  const totalWidth = prefixWidth + highlightWidth + suffixWidth;
  let startX = width / 2 - totalWidth / 2;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(prefix, startX, footerY);
  startX += prefixWidth;
  ctx.fillStyle = "#ff8a00";
  ctx.fillText(highlight, startX, footerY);
  startX += highlightWidth;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(suffix, startX, footerY);
  ctx.restore();

  for (let i = 0; i < GRID_PAGE_SIZE; i += 1) {
    const col = i % cols;
    const rowIdx = Math.floor(i / cols);
    const x = gridX + col * (cardW + gap);
    const y = gridY + rowIdx * (cardH + gap);
    const row = rows[i];
    const image = images[i] ?? null;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;
    const cardBg = ctx.createLinearGradient(x, y, x, y + cardH);
    cardBg.addColorStop(0, "#1b1c23");
    cardBg.addColorStop(1, "#14151b");
    ctx.fillStyle = cardBg;
    drawRoundedRect(ctx, x, y, cardW, cardH, 16);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x, y, cardW, cardH, 16);
    ctx.stroke();
    ctx.restore();

    if (!row) continue;

    const pad = 10;
    const innerX = x + pad;
    let cursorY = y + pad;
    const innerW = cardW - pad * 2;

    const brand = formatBrand(row).toUpperCase();
    ctx.save();
    ctx.fillStyle = "rgba(255,210,140,0.9)";
    ctx.font = '700 10px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = "top";
    drawTrackedCenteredText(
      ctx,
      truncateText(ctx, brand, innerW),
      innerX + innerW / 2,
      cursorY,
      2
    );
    ctx.restore();
    cursorY += 16;

    const metaHeight = 16;
    const metaY = y + cardH - pad - metaHeight;
    const titleLines = wrapText(ctx, formatName(row), innerW, 2);
    const lineHeight = 14;
    const titleHeight = titleLines.length * lineHeight;
    const variantsHeight = row.variant_count > 1 ? 12 : 0;
    const variantsGap = row.variant_count > 1 ? 2 : 0;
    const spacingAfterImage = 6;
    const availableHeight = metaY - 6 - cursorY;
    const imageHeight = Math.max(
      110,
      availableHeight - titleHeight - variantsHeight - variantsGap - spacingAfterImage
    );
    const imageY = cursorY;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    drawRoundedRect(ctx, innerX, imageY, innerW, imageHeight, 10);
    ctx.fill();
    ctx.restore();

    if (image) {
      ctx.save();
      ctx.beginPath();
      drawRoundedRect(ctx, innerX, imageY, innerW, imageHeight, 10);
      ctx.clip();
      drawContainImage(ctx, image, innerX, imageY, innerW, imageHeight);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.font = '600 11px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No image", innerX + innerW / 2, imageY + imageHeight / 2);
      ctx.restore();
    }

    cursorY = imageY + imageHeight + spacingAfterImage;

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = '600 12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    titleLines.forEach((line, idx) => {
      ctx.fillText(line, innerX, cursorY + idx * lineHeight);
    });
    ctx.restore();
    cursorY += titleHeight + variantsGap;

    if (row.variant_count > 1) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = '600 10px "Segoe UI", Arial, sans-serif';
      ctx.textBaseline = "top";
      ctx.fillText("Multiple variants available", innerX, cursorY);
      ctx.restore();
    }

    const condition = formatExportCondition(row);
    ctx.save();
    ctx.font = '700 9px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const pillPadding = 6;
    const pillHeight = metaHeight;
    const pillWidth = Math.max(ctx.measureText(condition).width + pillPadding * 2, 44);
    drawRoundedRect(ctx, innerX, metaY, pillWidth, pillHeight, pillHeight / 2);
    ctx.fillStyle = "rgba(255,180,90,0.12)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,180,90,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(condition, innerX + pillPadding, metaY + pillHeight / 2);
    ctx.restore();

    const price = formatExportPrice(row);
    ctx.save();
    ctx.font = '700 13px "Segoe UI", Arial, sans-serif';
    const priceWidth = ctx.measureText(price).width;
    const circleRadius = 9;
    const circleX = innerX + innerW - priceWidth - 6 - circleRadius * 2;
    const circleY = metaY + pillHeight / 2;
    ctx.fillStyle = "rgba(255,184,92,0.14)";
    ctx.strokeStyle = "rgba(255,184,92,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(circleX + circleRadius, circleY, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffb85c";
    ctx.font = '700 9px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🛒", circleX + circleRadius, circleY + 0.5);
    ctx.font = '700 13px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(price, circleX + circleRadius * 2 + 6, circleY + 0.5);
    ctx.restore();
  }
}

export default function InventorySheetPage() {
  const [rows, setRows] = React.useState<SheetRow[]>([]);
  const [page, setPage] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [exporting, setExporting] = React.useState(false);
  const [exportingZip, setExportingZip] = React.useState(false);
  const [exportingSheet, setExportingSheet] = React.useState(false);
  const [exportingCards, setExportingCards] = React.useState(false);
  const [exportingTenUp, setExportingTenUp] = React.useState(false);
  const [exportingEightUpZip, setExportingEightUpZip] = React.useState(false);
  const [previewingCard, setPreviewingCard] = React.useState(false);
  const [exportMsg, setExportMsg] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [cardGroupMode, setCardGroupMode] = React.useState<
    | "brand"
    | "ship_class"
    | "ship_class_brand"
    | "brand_ship_class"
    | "download_category"
    | "none"
  >("download_category");
  const [syncingModel, setSyncingModel] = React.useState(false);
  const [brandSyncTick, setBrandSyncTick] = React.useState(0);

  const normalizedSearch = React.useMemo(
    () => normalizeSearchText(searchTerm),
    [searchTerm]
  );
  const searchTokens = React.useMemo(
    () => (normalizedSearch ? normalizedSearch.split(/\s+/).filter(Boolean) : []),
    [normalizedSearch]
  );

  const filteredRows = React.useMemo(() => {
    if (!searchTokens.length) return rows;
    return rows.filter((row) => rowMatchesSearch(row, searchTokens));
  }, [rows, searchTokens, brandSyncTick]);

  const totalQty = React.useMemo(
    () => filteredRows.reduce((sum, row) => sum + Number(row.qty ?? 0), 0),
    [filteredRows]
  );

  const groupedRows = React.useMemo(
    () => groupRows(filteredRows),
    [filteredRows, brandSyncTick]
  );

  async function loadPage(nextPage: number, replace = false) {
    if (loading) return;
    setLoading(true);
    setError(null);

    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error: qErr } = await supabase
      .from("product_variants")
      .select(
        "id,condition,ship_class,qty,price, product:products(id,title,brand,model,variation,image_urls)"
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    setLoading(false);

    if (qErr) {
      setError(qErr.message || "Failed to load inventory sheet.");
      return;
    }

    const batch = normalizeSheetRows((data as any[]) ?? []);
    setRows((prev) => (replace ? batch : [...prev, ...batch]));
    setPage(nextPage);
    setHasMore(batch.length === PAGE_SIZE);
  }

  function groupRows(source: SheetRow[]) {
    const map = new Map<string, SheetRow[]>();
    for (const row of source) {
      const make = formatVehicleMake(row);
      const list = map.get(make) ?? [];
      list.push(row);
      map.set(make, list);
    }
    const entries = Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    return entries.map(([make, list]) => ({
      brand: make,
      rows: list.sort((a, b) => {
        const aKey = vehicleSortKey(formatVehicleModel(a));
        const bKey = vehicleSortKey(formatVehicleModel(b));
        const modelCmp = aKey.localeCompare(bKey);
        if (modelCmp !== 0) return modelCmp;
        return formatName(a).localeCompare(formatName(b));
      }),
    }));
  }

  async function fetchAllRows() {
    let all: SheetRow[] = [];
    let pageIndex = 0;
    while (true) {
      const from = pageIndex * EXPORT_PAGE_SIZE;
      const to = from + EXPORT_PAGE_SIZE - 1;
      const { data, error: qErr } = await supabase
        .from("product_variants")
        .select(
          "id,condition,ship_class,qty,price, product:products(id,title,brand,model,variation,image_urls)"
        )
        .gt("qty", 0)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (qErr) throw new Error(qErr.message || "Failed to export inventory.");
      const batch = normalizeSheetRows((data as any[]) ?? []);
      all = [...all, ...batch];
      if (batch.length < EXPORT_PAGE_SIZE) break;
      pageIndex += 1;
    }
    return all;
  }

  async function fetchAllProducts() {
    let all: Array<{
      id: string;
      title: string | null;
      brand: string | null;
      model: string | null;
      variation: string | null;
    }> = [];
    let pageIndex = 0;
    while (true) {
      const from = pageIndex * EXPORT_PAGE_SIZE;
      const to = from + EXPORT_PAGE_SIZE - 1;
      const { data, error: qErr } = await supabase
        .from("products")
        .select("id,title,brand,model,variation")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (qErr) throw new Error(qErr.message || "Failed to load products.");
      const batch = (data ?? []) as Array<{
        id: string;
        title: string | null;
        brand: string | null;
        model: string | null;
        variation: string | null;
      }>;
      all = [...all, ...batch];
      if (batch.length < EXPORT_PAGE_SIZE) break;
      pageIndex += 1;
    }
    return all;
  }

  async function downloadCsv() {
    if (exporting) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const allRows = await fetchAllRows();
      const headers = [
        "Name",
        "Make",
        "Model",
        "Condition",
        "Qty",
        "Price",
        "Photo URL",
      ];
      const lines = [headers.join(",")];
      for (const row of allRows) {
        const photoUrl = row.product?.image_urls?.[0] ?? "";
        const inferred = inferVehicleMakeModel(row);
        const values = [
          formatName(row),
          inferred.make,
          inferred.model,
          formatCondition(row.condition),
          Number(row.qty ?? 0),
          Number(row.price ?? 0),
          photoUrl,
        ];
        lines.push(values.map(escapeCsv).join(","));
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "inventory-sheet.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message ?? "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  function fileSafe(value: string, maxLength = 80) {
    return value
      .replace(/[^a-z0-9\-_ ]/gi, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, maxLength);
  }

  function formatShipClassFolder(row: SheetRow) {
    const raw = String(row.ship_class ?? "UNASSIGNED").trim();
    const pretty = raw
      ? raw
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/\b\w/g, (char) => char.toUpperCase())
      : "UNASSIGNED";
    return fileSafe(pretty) || "UNASSIGNED";
  }

  function formatExportFileName(row: SheetRow) {
    const makeModel = formatVehicleDisplayModel(row);
    if (makeModel && !/^unknown$/i.test(makeModel)) return makeModel;
    const fallback = formatName(row);
    if (fallback && !/^untitled$/i.test(fallback)) return fallback;
    return "item";
  }

  function extractExtension(url: string) {
    try {
      const pathname = new URL(url).pathname;
      const match = pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i);
      if (match?.[1]) return `.${match[1].toLowerCase()}`;
    } catch {
      // ignore
    }
    return ".jpg";
  }

  async function downloadZip() {
    if (exportingZip) return;
    setExportingZip(true);
    setExportMsg(null);
    setError(null);

    try {
      const allRows = await fetchAllRows();
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      const headers = [
        "Name",
        "Make",
        "Model",
        "Condition",
        "Qty",
        "Price",
        "Photo File",
        "Photo URL",
      ];
      const lines = [headers.join(",")];

      let addedPhotos = 0;
      let skippedPhotos = 0;

      for (const row of allRows) {
        const photoUrl = row.product?.image_urls?.[0] ?? "";
        let photoFile = "";

        if (photoUrl) {
          try {
            const res = await fetch(photoUrl);
            if (res.ok) {
              const blob = await res.blob();
              const base = fileSafe(formatExportFileName(row), 140) || "item";
              const ext = extractExtension(photoUrl);
              const shipFolder = formatShipClassFolder(row);
              const brandFolder = fileSafe(formatBrand(row)) || "Unknown";
              photoFile = `${shipFolder}/${brandFolder}/${base}_${row.id.slice(0, 8)}${ext}`;
              zip.file(photoFile, blob);
              addedPhotos += 1;
            } else {
              skippedPhotos += 1;
            }
          } catch {
            skippedPhotos += 1;
          }
        }

        const inferred = inferVehicleMakeModel(row);
        const values = [
          formatName(row),
          inferred.make,
          inferred.model,
          formatCondition(row.condition),
          Number(row.qty ?? 0),
          Number(row.price ?? 0),
          photoFile,
          photoUrl,
        ];
        lines.push(values.map(escapeCsv).join(","));
      }

      zip.file("inventory-sheet.csv", lines.join("\n"));

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "inventory-sheet.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const summary = [`${addedPhotos} photos added`];
      if (skippedPhotos) summary.push(`${skippedPhotos} skipped`);
      setExportMsg(summary.join(" | "));
    } catch (err: any) {
      setError(err?.message ?? "Export failed.");
    } finally {
      setExportingZip(false);
    }
  }

  async function syncProductMakeModel() {
    if (syncingModel) return;
    const confirmed = confirm(
      "This will update product titles and model fields using inferred make/model data. Continue?"
    );
    if (!confirmed) return;

    setSyncingModel(true);
    setExportMsg(null);
    setError(null);
    try {
      const products = await fetchAllProducts();
      const updates: Array<{ id: string; title?: string | null; model?: string | null }> = [];

      for (const product of products) {
        const inferred = inferVehicleMakeModelFromFields(product);
        const make = inferred.make && inferred.make !== "Unknown" ? inferred.make : "";
        const model = inferred.model && inferred.model !== "Unknown" ? inferred.model : "";

        const currentModel = String(product.model ?? "").trim();
        const cleanedModel = normalizeModelValue(currentModel, make, [
          product.brand ?? "",
        ]);
        const nextModel = model
          ? shouldReplaceModel(cleanedModel, model)
            ? model
            : cleanedModel
          : cleanedModel;
        const combinedModel = make ? ensureMakeInModel(make, nextModel) : nextModel;

        const currentTitle = String(product.title ?? "").trim();
        const nextTitle =
          make && model ? updateTitleWithMakeModel(currentTitle, make, model) : currentTitle;
        const cleanedTitle = cleanDiecastTitle(nextTitle || currentTitle);
        const safeTitle = cleanedTitle.trim() || currentTitle.trim();

        const modelChanged =
          Boolean(combinedModel) &&
          normalizeForCompare(combinedModel) !== normalizeForCompare(currentModel);
        const titleChanged = safeTitle !== currentTitle;

        if (modelChanged || titleChanged) {
          updates.push({
            id: product.id,
            title: safeTitle,
            ...(modelChanged ? { model: combinedModel } : {}),
          });
        }
      }

      if (!updates.length) {
        setExportMsg("No updates needed.");
        return;
      }

      const batchSize = 100;
      let updated = 0;
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        const { error: upErr } = await supabase
          .from("products")
          .upsert(batch, { onConflict: "id" });
        if (upErr) throw upErr;
        updated += batch.length;
        if (updated % 200 === 0) {
          setExportMsg(`Updated ${updated} of ${updates.length} products...`);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      setExportMsg(`Updated ${updated} products.`);
      VEHICLE_CACHE.clear();
      await loadPage(0, true);
    } catch (err: any) {
      setError(err?.message ?? "Update failed.");
    } finally {
      setSyncingModel(false);
    }
  }

  function getCardFolder(
    zip: any,
    row: SheetRow,
    mode:
      | "brand"
      | "ship_class"
      | "ship_class_brand"
      | "brand_ship_class"
      | "download_category"
      | "none"
  ) {
    const parts = getCardFolderParts(row, mode);
    return resolveZipFolder(zip, parts);
  }

  function getCardFolderParts(
    row: SheetRow,
    mode:
      | "brand"
      | "ship_class"
      | "ship_class_brand"
      | "brand_ship_class"
      | "download_category"
      | "none"
  ) {
    const brand = fileSafe(formatBrand(row)) || "Unknown";
    const shipClass = formatShipClassFolder(row);
    const category = formatDownloadCategory(row) || "Others";

    if (mode === "none") return [];
    if (mode === "brand") return [brand];
    if (mode === "ship_class") return [shipClass];
    if (mode === "ship_class_brand") return [shipClass, brand];
    if (mode === "brand_ship_class") return [brand, shipClass];
    if (mode === "download_category") {
      const safeCategory = fileSafe(category, 60) || "Others";
      return [safeCategory];
    }
    return [];
  }

  function resolveZipFolder(zip: any, parts: string[]) {
    let folder = zip;
    for (const part of parts) {
      folder = folder.folder(part) ?? folder;
    }
    return folder;
  }

  function normalizeCardConditionKey(value: string | null) {
    return String(value ?? "").toLowerCase().trim();
  }

  function mergeSealedUnsealedRows(source: SheetRow[]) {
    const output: SheetRow[] = [];
    const merged = new Map<
      string,
      {
        index: number;
        hasSealed: boolean;
        hasUnsealed: boolean;
        preferred: "sealed" | "unsealed";
      }
    >();

    for (const row of source) {
      const conditionKey = normalizeCardConditionKey(row.condition);
      if (conditionKey !== "sealed" && conditionKey !== "unsealed") {
        output.push(row);
        continue;
      }

      const productId = row.product?.id ?? row.id;
      const mapKey = `${productId}::sealed_unsealed`;
      const entry = merged.get(mapKey);

      if (!entry) {
        output.push(row);
        merged.set(mapKey, {
          index: output.length - 1,
          hasSealed: conditionKey === "sealed",
          hasUnsealed: conditionKey === "unsealed",
          preferred: conditionKey === "sealed" ? "sealed" : "unsealed",
        });
        continue;
      }

      if (conditionKey === "sealed") entry.hasSealed = true;
      if (conditionKey === "unsealed") entry.hasUnsealed = true;

      if (conditionKey === "sealed" && entry.preferred !== "sealed") {
        output[entry.index] = row;
        entry.preferred = "sealed";
      }

      if (entry.hasSealed && entry.hasUnsealed) {
        output[entry.index] = {
          ...output[entry.index],
          condition: "sealed_unsealed",
        };
      }
    }

    return output;
  }

  async function downloadCardsZip() {
    if (exportingCards) return;
    setExportingCards(true);
    setExportMsg(null);
    setError(null);

    try {
      const allRows = await fetchAllRows();
      const grouped = groupRows(allRows);
      const orderedRows = grouped.flatMap((group) => group.rows);
      const cardRows = mergeSealedUnsealedRows(orderedRows);
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      const canvas = document.createElement("canvas");
      canvas.width = CARD_EXPORT_SIZE;
      canvas.height = CARD_EXPORT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not available.");

      let generated = 0;
      let missingImage = 0;
      let processed = 0;
      const total = cardRows.length;
      const folderCounts = new Map<string, number>();
      setExportMsg(`Rendering 0 of ${total} cards...`);

      for (const row of cardRows) {
        const baseParts = getCardFolderParts(row, cardGroupMode);
        let targetFolder = zip;
        if (baseParts.length) {
          const baseKey = baseParts.join("/");
          const count = folderCounts.get(baseKey) ?? 0;
          const bucket = Math.floor(count / CARD_FOLDER_LIMIT) + 1;
          folderCounts.set(baseKey, count + 1);
          const splitParts = [...baseParts];
          if (bucket > 1) {
            const lastIdx = splitParts.length - 1;
            splitParts[lastIdx] = `${splitParts[lastIdx]} (${bucket})`;
          }
          targetFolder = resolveZipFolder(zip, splitParts);
        }

        const imageUrl = row.product?.image_urls?.[0] ?? "";
        const image = imageUrl ? await loadImageBitmap(imageUrl) : null;
        if (!imageUrl || !image) missingImage += 1;

        renderCardCanvas(ctx, row, image);
        const blob = await canvasToBlob(canvas, "image/png");
        const safeName = fileSafe(formatExportFileName(row), 140) || "item";
        const condition = fileSafe(formatCompactCondition(row.condition));
        const name = `${safeName}_${condition}_${row.id.slice(0, 8)}.png`;
        targetFolder.file(name, blob);

        if (image && "close" in image) {
          try {
            (image as ImageBitmap).close();
          } catch {
            // ignore
          }
        }

        generated += 1;
        processed += 1;
        if (processed % 15 === 0) {
          setExportMsg(`Rendering ${processed} of ${total} cards...`);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "inventory-cards.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const groupLabel =
        {
          download_category: "9-up category",
          brand: "brand",
          ship_class: "class",
          ship_class_brand: "class to brand",
          brand_ship_class: "brand to class",
          none: "no folders",
        }[cardGroupMode] ?? cardGroupMode.replace(/_/g, " ");
      const summary = [`${generated} cards`, `grouped by ${groupLabel}`];
      if (missingImage) summary.push(`${missingImage} missing images`);
      setExportMsg(summary.join(" | "));
    } catch (err: any) {
      setError(err?.message ?? "Export failed.");
    } finally {
      setExportingCards(false);
    }
  }

  async function blobToDataUrl(blob: Blob) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read image."));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsDataURL(blob);
    });
  }

  async function previewCardSample() {
    if (previewingCard) return;
    setPreviewingCard(true);
    setExportMsg(null);
    setError(null);

    try {
      const sampleRow = rows[0] ?? (await fetchAllRows())[0];
      if (!sampleRow) throw new Error("No products available to preview.");

      const imageUrl = sampleRow.product?.image_urls?.[0] ?? "";
      const image = imageUrl ? await loadImageBitmap(imageUrl) : null;

      const canvas = document.createElement("canvas");
      canvas.width = CARD_EXPORT_SIZE;
      canvas.height = CARD_EXPORT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not available.");

      renderCardCanvas(ctx, sampleRow, image);
      const blob = await canvasToBlob(canvas, "image/png");
      const dataUrl = await blobToDataUrl(blob);

      if (image && "close" in image) {
        try {
          (image as ImageBitmap).close();
        } catch {
          // ignore
        }
      }

      const title = escapeHtml(formatName(sampleRow));
      const brand = escapeHtml(formatBrand(sampleRow).toUpperCase());
      const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Card Preview</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top right, rgba(255,176,90,0.18), transparent 55%),
          radial-gradient(circle at bottom left, rgba(255,210,140,0.12), transparent 55%),
          #0f1016;
        color: #fff;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      }
      .frame {
        width: min(92vw, 520px);
        display: grid;
        gap: 12px;
        text-align: center;
      }
      .meta {
        font-size: 12px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: rgba(255,198,106,0.9);
      }
      img {
        width: 100%;
        height: auto;
        border-radius: 24px;
        box-shadow: 0 22px 50px rgba(0,0,0,0.45);
      }
      .title {
        font-size: 14px;
        color: rgba(255,255,255,0.8);
      }
    </style>
  </head>
  <body>
    <div class="frame">
      <div class="meta">${brand}</div>
      <img src="${dataUrl}" alt="${title}" />
      <div class="title">${title}</div>
    </div>
  </body>
</html>`;

      const url = URL.createObjectURL(
        new Blob([html], { type: "text/html;charset=utf-8;" })
      );
      const opened = window.open(url, "_blank");
      if (!opened) {
        throw new Error("Preview blocked. Allow popups to preview.");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      setExportMsg("Card preview opened.");
    } catch (err: any) {
      setError(err?.message ?? "Preview failed.");
    } finally {
      setPreviewingCard(false);
    }
  }

  async function fetchPhotoMap(rows: SheetRow[], limit = 5) {
    const urls = rows
      .map((row) => row.product?.image_urls?.[0])
      .filter((url): url is string => Boolean(url))
      .map((url) =>
        getThumbUrl(url, { width: 140, height: 140, quality: 60 })
      ) as string[];
    const unique = Array.from(new Set(urls));
    const map = new Map<string, string>();
    let index = 0;

    const workers = Array.from({ length: Math.min(limit, unique.length) }).map(
      async () => {
        while (index < unique.length) {
          const current = unique[index];
          index += 1;
          if (!current) continue;
          try {
            const res = await fetch(current);
            if (!res.ok) continue;
            const blob = await res.blob();
            const dataUrl = await blobToDataUrl(blob);
            map.set(current, dataUrl);
          } catch {
            // Skip failures.
          }
        }
      }
    );

    await Promise.all(workers);
    return map;
  }

  async function downloadSheetHtml() {
    if (exportingSheet) return;
    setExportingSheet(true);
    setExportMsg(null);
    setError(null);

    try {
      const allRows = await fetchAllRows();
      const grouped = groupRows(allRows);
      const photoMap = await fetchPhotoMap(allRows);

      const rowsHtml = grouped
        .map((group) => {
          const groupHeader = `<tr class="group"><td colspan="6">${group.brand} (${group.rows.length})</td></tr>`;
          const bodyRows = group.rows
            .map((row) => {
              const photoUrl = row.product?.image_urls?.[0] ?? "";
              const photo = photoMap.get(photoUrl) ?? "";
              const imageCell = photo
                ? `<img src="${photo}" alt=""/>`
                : `<span class="no-image">No image</span>`;
              return `
                <tr>
                  <td class="photo">${imageCell}</td>
                  <td>${escapeCsv(formatName(row))}</td>
                  <td class="muted">${escapeCsv(formatVehicleDisplayModel(row))}</td>
                  <td class="muted">${escapeCsv(formatCondition(row.condition))}</td>
                  <td class="num">${Number(row.qty ?? 0)}</td>
                  <td class="num">${formatPHP(Number(row.price ?? 0))}</td>
                </tr>
              `;
            })
            .join("");
          return `${groupHeader}${bodyRows}`;
        })
        .join("");

      const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Inventory Sheet</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b0b0c;
        --panel: #121317;
        --line: rgba(255,255,255,0.08);
        --text: #f8fafc;
        --muted: rgba(255,255,255,0.7);
        --accent: rgba(255, 140, 66, 0.8);
      }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      .wrap {
        max-width: 1200px;
        margin: 32px auto;
        padding: 0 20px 32px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 16px;
        margin-bottom: 16px;
      }
      .title {
        font-size: 24px;
        font-weight: 700;
      }
      .subtitle {
        font-size: 13px;
        color: var(--muted);
      }
      .meta {
        display: flex;
        gap: 10px;
        font-size: 12px;
        color: var(--muted);
      }
      .meta span {
        padding: 6px 10px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: #1a1b20;
      }
      .table-wrap {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel);
        overflow: hidden;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      thead {
        background: #15161b;
      }
      th, td {
        padding: 10px 14px;
        border-bottom: 1px solid var(--line);
        text-align: left;
      }
      th {
        font-size: 12px;
        color: var(--muted);
        font-weight: 600;
      }
      .group td {
        background: #101116;
        font-weight: 600;
        color: var(--text);
        border-bottom: 1px solid var(--line);
      }
      .photo {
        width: 56px;
      }
      .photo img {
        height: 44px;
        width: 44px;
        object-fit: cover;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: #f8fafc;
      }
      .no-image {
        display: inline-flex;
        width: 44px;
        height: 44px;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        border: 1px solid var(--line);
        font-size: 10px;
        color: var(--muted);
      }
      .muted {
        color: var(--muted);
      }
      .num {
        text-align: right;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        <div>
          <div class="title">Inventory Sheet</div>
          <div class="subtitle">Snapshot export with photos</div>
        </div>
        <div class="meta">
          <span>${allRows.length} rows</span>
          <span>${allRows.reduce((sum, row) => sum + Number(row.qty ?? 0), 0)} qty</span>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Photo</th>
              <th>Name</th>
              <th>Model</th>
              <th>Condition</th>
              <th style="text-align:right;">Qty</th>
              <th style="text-align:right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  </body>
</html>`;

      const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "inventory-sheet.html";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setExportMsg("HTML sheet downloaded with embedded photos.");
    } catch (err: any) {
      setError(err?.message ?? "Export failed.");
    } finally {
      setExportingSheet(false);
    }
  }

  function buildGridPages(source: ExportRow[]) {
    const isTrueScaleGroup = (value: string) =>
      value === "Truescales" || value.startsWith("Truescales ");
    const sorted = [...source].sort((a, b) => {
      const catA = formatDownloadCategory(a);
      const catB = formatDownloadCategory(b);
      const orderA = DOWNLOAD_CATEGORY_ORDER.indexOf(catA);
      const orderB = DOWNLOAD_CATEGORY_ORDER.indexOf(catB);
      if (orderA !== orderB) {
        return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
      }
      if (isTrueScaleGroup(catA) && isTrueScaleGroup(catB)) {
        const modelA = vehicleSortKey(formatVehicleDisplayModel(a));
        const modelB = vehicleSortKey(formatVehicleDisplayModel(b));
        const modelCmp = modelA.localeCompare(modelB);
        if (modelCmp !== 0) return modelCmp;
        const nameA = formatName(a).toLowerCase();
        const nameB = formatName(b).toLowerCase();
        return nameA.localeCompare(nameB);
      }
      const brandA = normalizeCategoryBrand(formatBrand(a));
      const brandB = normalizeCategoryBrand(formatBrand(b));
      const brandCmp = brandA.localeCompare(brandB);
      if (brandCmp !== 0) return brandCmp;
      const modelA = vehicleSortKey(formatVehicleDisplayModel(a));
      const modelB = vehicleSortKey(formatVehicleDisplayModel(b));
      const modelCmp = modelA.localeCompare(modelB);
      if (modelCmp !== 0) return modelCmp;
      const nameA = formatName(a).toLowerCase();
      const nameB = formatName(b).toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const pages: Array<{ group: string; rows: ExportRow[] }> = [];
    let currentGroup = "";
    let bucket: ExportRow[] = [];

    const flush = () => {
      if (!bucket.length) return;
      for (let i = 0; i < bucket.length; i += GRID_PAGE_SIZE) {
        pages.push({
          group: currentGroup || "Unassigned",
          rows: bucket.slice(i, i + GRID_PAGE_SIZE),
        });
      }
      bucket = [];
    };

    for (const row of sorted) {
      const group = formatDownloadCategory(row) || "Others";
      if (!currentGroup) {
        currentGroup = group;
      }
      if (group !== currentGroup) {
        flush();
        currentGroup = group;
      }
      bucket.push(row);
    }

    flush();
    return pages;
  }

  async function downloadEightUpHtml() {
    if (exportingTenUp) return;
    setExportingTenUp(true);
    setExportMsg(null);
    setError(null);

    try {
      const allRows = await fetchAllRows();
      const exportRows = buildExportRowsForDownload(allRows);
      const pages = buildGridPages(exportRows);

      const pagesHtml = pages
        .map((page, pageIndex) => {
          const cardsHtml = Array.from({ length: GRID_PAGE_SIZE }).map((_, idx) => {
            const row = page.rows[idx];
            if (!row) {
              return `<div class="card empty"></div>`;
            }
            const photoUrl = row.product?.image_urls?.[0] ?? "";
            const fullUrl = photoUrl ? escapeHtml(photoUrl) : "";
            const thumbUrl = photoUrl
              ? getThumbUrl(photoUrl, {
                  width: EXPORT_THUMB_WIDTH,
                  height: EXPORT_THUMB_HEIGHT,
                  quality: EXPORT_THUMB_QUALITY,
                  format: "webp",
                })
              : "";
            const fallbackAttr = thumbUrl
              ? ` onerror="this.onerror=null;this.src=&quot;${escapeHtml(
                  thumbUrl
                )}&quot;;"`
              : "";
            const imageCell = fullUrl
              ? `<img src="${fullUrl}" alt="" loading="lazy" decoding="async" width="${EXPORT_THUMB_WIDTH}" height="${EXPORT_THUMB_HEIGHT}"${fallbackAttr}/>`
              : `<div class="img-placeholder">No image</div>`;
            const cardBrand = escapeHtml(formatBrand(row).toUpperCase());
            const titleText = escapeHtml(formatName(row));
            const condition = escapeHtml(formatExportCondition(row));
            const price = escapeHtml(formatExportPrice(row));
            const variantsNote =
              row.variant_count > 1
                ? `<div class="card-variants">Multiple variants available</div>`
                : "";
            return `
              <div class="card">
                <div class="card-brand">${cardBrand}</div>
                <div class="card-image">${imageCell}</div>
                <div class="card-title">${titleText}</div>
                ${variantsNote}
                <div class="card-meta">
                  <span class="card-condition">${condition}</span>
                  <span class="card-price">
                    <span class="card-cart">🛒</span>
                    ${price}
                  </span>
                </div>
              </div>
            `;
          });
          const footerCategory = escapeHtml(page.group.toUpperCase());

          return `
            <section class="page" data-page="${pageIndex + 1}">
              <div class="page-frame">
                <div class="page-header">
                  <div class="page-title">${escapeHtml(
                    formatDownloadTitle(page.group)
                  )}</div>
                </div>
                <div class="page-grid">
                  ${cardsHtml.join("")}
                </div>
                <div class="page-footer">
                  EXPLORE THE FULL
                  <span class="page-footer__accent">${footerCategory}</span>
                  COLLECTION AT ODD-WHEELS.COM
                </div>
              </div>
            </section>
          `;
        })
        .join("");

      const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Inventory 9-up Pages</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b0b0f;
        --panel: #15161c;
        --panel-2: #0f1117;
        --stroke: rgba(255,255,255,0.1);
        --accent: #ff8a00;
        --accent-soft: rgba(255,138,0,0.25);
        --text: #f8fafc;
        --muted: rgba(255,255,255,0.7);
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: var(--bg);
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        color: var(--text);
        -webkit-print-color-adjust: exact;
      }
      @page {
        size: 1080px 1080px;
        margin: 0;
      }
      .page {
        width: 1080px;
        height: 1080px;
        margin: 0 auto 32px;
        padding: 0;
        position: relative;
        background: transparent;
        border: none;
        border-radius: 0;
        box-shadow: none;
        page-break-after: always;
      }
      .page-frame {
        width: 100%;
        height: 100%;
        margin: 0;
        border: 1px solid rgba(255,138,0,0.55);
        border-radius: 24px;
        padding: 14px;
        background: linear-gradient(180deg, rgba(20,20,26,0.92), rgba(12,12,16,0.96));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .page-header {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 36px;
      }
      .page-title {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent);
        text-shadow: 0 6px 18px rgba(255,138,0,0.35);
      }
      .page-grid {
        display: grid;
        grid-template-columns: repeat(${GRID_COLS}, minmax(0, 1fr));
        grid-template-rows: repeat(${GRID_ROWS}, minmax(0, 1fr));
        gap: 12px;
        flex: 1;
      }
      .page-footer {
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        text-align: center;
        color: rgba(255,255,255,0.72);
        margin-bottom: 2px;
      }
      .page-footer__accent {
        color: var(--accent);
        font-weight: 700;
        margin: 0 6px;
      }
      .card {
        background: linear-gradient(180deg, #1b1c23 0%, #14151b 100%);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 16px;
        padding: 10px 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        box-shadow: 0 10px 22px rgba(0,0,0,0.45);
      }
      .card.empty {
        background: transparent;
        border: 1px dashed rgba(255,255,255,0.08);
        box-shadow: none;
      }
      .card-brand {
        font-size: 10px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        text-align: center;
        color: rgba(255,210,140,0.9);
        font-weight: 700;
      }
      .card-image {
        background: #ffffff;
        border-radius: 10px;
        flex: 1 1 0;
        min-height: 0;
        display: grid;
        place-items: center;
        overflow: hidden;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);
      }
      .card-image img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
        image-rendering: auto;
        transform: translateZ(0);
      }
      .img-placeholder {
        color: rgba(0,0,0,0.5);
        font-size: 11px;
        text-align: center;
      }
      .card-title {
        font-size: 12px;
        line-height: 1.25;
        color: var(--text);
        min-height: 28px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .card-variants {
        font-size: 10px;
        color: rgba(255,255,255,0.7);
        letter-spacing: 0.03em;
      }
      .card-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: auto;
      }
      .card-condition {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 3px 6px;
        border-radius: 999px;
        border: 1px solid rgba(255,180,90,0.45);
        background: rgba(255,180,90,0.12);
        color: rgba(255,255,255,0.85);
      }
      .card-price {
        font-size: 13px;
        font-weight: 700;
        color: #ffb85c;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .card-cart {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: rgba(255,184,92,0.14);
        border: 1px solid rgba(255,184,92,0.45);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
      }
    </style>
  </head>
  <body>
    ${pagesHtml}
  </body>
</html>`;

      const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "inventory-9up.html";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setExportMsg(`9-up pages downloaded (${pages.length} pages).`);
    } catch (err: any) {
      setError(err?.message ?? "Export failed.");
    } finally {
      setExportingTenUp(false);
    }
  }

  async function downloadEightUpZip() {
    if (exportingEightUpZip) return;
    setExportingEightUpZip(true);
    setExportMsg(null);
    setError(null);

    try {
      const allRows = await fetchAllRows();
      const exportRows = buildExportRowsForDownload(allRows);
      const pages = buildGridPages(exportRows);
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      const canvas = document.createElement("canvas");
      canvas.width = EIGHT_UP_WIDTH;
      canvas.height = EIGHT_UP_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not available.");

      let processed = 0;
      setExportMsg(`Rendering 0 of ${pages.length} pages...`);

      const pageCounts = new Map<string, number>();

      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        const images = await Promise.all(
          page.rows.map(async (row) => {
            const imageUrl = row.product?.image_urls?.[0] ?? "";
            const thumbUrl = imageUrl
              ? getThumbUrl(imageUrl, {
                  width: EXPORT_THUMB_WIDTH,
                  height: EXPORT_THUMB_HEIGHT,
                  quality: EXPORT_THUMB_QUALITY,
                  format: "webp",
                })
              : "";
            return await loadImageWithFallback(imageUrl, thumbUrl);
          })
        );
        while (images.length < GRID_PAGE_SIZE) images.push(null);

        renderEightUpCanvas(ctx, page.rows, images, page.group);
        const blob = await canvasToBlob(canvas, "image/png");
        const safeGroup = fileSafe(page.group || "Unassigned", 60) || "Unassigned";
        const groupFolder = zip.folder(safeGroup) ?? zip;
        const nextCount = (pageCounts.get(safeGroup) ?? 0) + 1;
        pageCounts.set(safeGroup, nextCount);
        const name = `page_${String(nextCount).padStart(3, "0")}.png`;
        groupFolder.file(name, blob);

        for (const image of images) {
          if (image && "close" in image) {
            try {
              (image as ImageBitmap).close();
            } catch {
              // ignore
            }
          }
        }

        processed += 1;
        if (processed % 5 === 0) {
          setExportMsg(`Rendering ${processed} of ${pages.length} pages...`);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "inventory-9up-pages.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setExportMsg(`9-up ZIP downloaded (${pages.length} pages).`);
    } catch (err: any) {
      setError(err?.message ?? "Export failed.");
    } finally {
      setExportingEightUpZip(false);
    }
  }

  React.useEffect(() => {
    loadPage(0, true);
  }, []);

  React.useEffect(() => {
    let active = true;
    supabase
      .from("brand_tabs")
      .select("name")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) return;
        const list = (data ?? [])
          .map((row: any) => String(row.name ?? "").trim())
          .filter(Boolean);
        if (list.length) {
          setRuntimeDiecastBrands(list);
          setBrandSyncTick((tick) => tick + 1);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!expanded) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [expanded]);

  return (
    <Card
      className={
        expanded
          ? "fixed inset-0 z-50 w-screen h-screen max-w-none rounded-none overflow-hidden"
          : undefined
      }
    >
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">Inventory Sheet</div>
          <div className="text-sm text-white/60">
            All variants listed in a spreadsheet-style view.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <input
              className="h-9 w-56 rounded-md border border-white/10 bg-bg-900/60 px-3 text-xs text-white/80 placeholder:text-white/40"
              placeholder="Search (name, model, JDM, EUR, US)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchTerm("")}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <Badge>{filteredRows.length} rows</Badge>
          <Badge>{totalQty} qty</Badge>
          {searchTerm ? (
            <span className="text-xs text-white/50">
              of {rows.length} loaded
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? "Exit full screen" : "Full screen"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={downloadCsv}
            disabled={exporting}
          >
            {exporting ? "Preparing..." : "Download CSV"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={downloadSheetHtml}
            disabled={exportingSheet}
          >
            {exportingSheet ? "Preparing..." : "Download HTML (Photos)"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={downloadEightUpHtml}
            disabled={exportingTenUp}
          >
            {exportingTenUp ? "Preparing..." : "Download 9-up (Inner Box)"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={downloadEightUpZip}
            disabled={exportingEightUpZip}
          >
            {exportingEightUpZip ? "Preparing..." : "Download 9-up ZIP"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={syncProductMakeModel}
            disabled={syncingModel}
          >
            {syncingModel ? "Syncing..." : "Sync Make/Model"}
          </Button>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-white/10 bg-bg-900/60 px-2 text-xs text-white/80"
              value={cardGroupMode}
              onChange={(e) =>
                setCardGroupMode(
                  e.target.value as
                    | "brand"
                    | "ship_class"
                    | "ship_class_brand"
                    | "brand_ship_class"
                    | "download_category"
                    | "none"
                )
              }
            >
              <option value="download_category">Group by 9-up category</option>
              <option value="brand">Group by brand</option>
              <option value="ship_class">Group by class</option>
              <option value="ship_class_brand">Class to brand</option>
              <option value="brand_ship_class">Brand to class</option>
              <option value="none">No folders</option>
            </select>
            <Button
              variant="secondary"
              size="sm"
              onClick={downloadCardsZip}
              disabled={exportingCards}
            >
              {exportingCards ? "Preparing..." : "Download Cards ZIP"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={previewCardSample}
              disabled={previewingCard}
            >
              {previewingCard ? "Preparing..." : "Preview Card"}
            </Button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={downloadZip}
            disabled={exportingZip}
          >
            {exportingZip ? "Preparing..." : "Download ZIP + Photos"}
          </Button>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {error ? <div className="text-sm text-red-300">{error}</div> : null}
        {exportMsg ? <div className="text-sm text-white/60">{exportMsg}</div> : null}

        <div
          className={[
            "rounded-xl border border-white/10 bg-bg-900/30 overflow-auto",
            expanded ? "max-h-[calc(100vh-200px)]" : "max-h-[70vh]",
          ].join(" ")}
        >
          <table className="min-w-[900px] w-full text-sm">
            <thead className="sticky top-0 bg-bg-900/90 backdrop-blur">
              <tr className="text-left text-white/70">
                <th className="px-4 py-3">Photo</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Condition</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((group) => (
                <React.Fragment key={group.brand}>
                  <tr className="border-t border-white/10 bg-bg-950/40">
                    <td className="px-4 py-2 text-sm font-semibold" colSpan={6}>
                      {group.brand} ({group.rows.length})
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-white/5 text-white/90"
                    >
                      <td className="px-4 py-3">
                        <div className="h-12 w-12 rounded-lg border border-white/10 bg-bg-900/50 overflow-hidden">
                          {row.product?.image_urls?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={getThumbUrl(row.product.image_urls[0], {
                                width: 96,
                                height: 96,
                                quality: 60,
                              })}
                              alt=""
                              className="h-full w-full object-cover bg-neutral-50"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="h-full w-full grid place-items-center text-[10px] text-white/40">
                              No image
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatName(row)}</td>
                      <td className="px-4 py-3 text-white/70">
                        {formatVehicleDisplayModel(row)}
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        {formatCondition(row.condition)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {Number(row.qty ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatPHP(Number(row.price ?? 0))}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {!filteredRows.length && !loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-white/50"
                  >
                    {searchTerm ? "No matching items." : "No items yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {loading ? <div className="text-sm text-white/60">Loading...</div> : null}

        {hasMore && !loading ? (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => loadPage(page + 1)}>
              Load more
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
