"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import JsBarcode from "jsbarcode";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { BarcodeScannerModal } from "@/components/pos/BarcodeScannerModal";
import { InventoryRefresher } from "@/components/admin/InventoryRefresher";
import {
  InventoryWorthMovementChart,
  type InventoryWorthMovementMetric,
  type InventoryWorthMovementPoint,
} from "@/components/admin/InventoryWorthMovementChart";
import { ProductSpecialTagPicker } from "@/components/admin/ProductSpecialTagPicker";
import { normalizeBarcode } from "@/lib/barcode";
import { shipClassFromBrand } from "@/lib/shipping/shipClass";
import {
  inferFieldsFromTitle,
  normalizeKaidoMiniGtTitle,
  normalizeBrandAlias,
  normalizeLookupTitle,
  normalizeLookupField,
  normalizeTitleBrandAliases,
} from "@/lib/titleInference";
import { formatPHP } from "@/lib/money";
import { toast } from "@/components/ui/toast";
import {
  ALL_VARIANT_CONDITIONS,
  formatConditionLabel,
  isBlisterCondition,
  isIssueCondition,
  isLoosePackagingCondition,
  isNearMintCondition,
  supportsIssueDetailCondition,
} from "@/lib/conditions";
import { isLalamoveOnlyShipClass } from "@/lib/shipping/shipClass";
import {
  applyImageCrop,
  cropStyle,
  normalizeCrop,
  parseImageCrop,
  type ImageCrop,
} from "@/lib/imageCrop";
import {
  normalizeProductSpecialTags,
  type ProductSpecialTag,
} from "@/lib/productTags";
import {
  datetimeLocalToIso,
  formatReleaseDateTime,
  getProductReleaseSummary,
  getReleaseBadgeClass,
  getVariantReleaseLabel,
  isScheduledRelease,
} from "@/lib/inventoryRelease";

type Product = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  special_tags: string[] | null;
  image_urls: string[] | null;
  is_active: boolean;
  created_at: string;
  product_variants?: Array<{
    ship_class: string | null;
    condition?: string | null;
    qty?: number | null;
    release_at?: string | null;
  }> | null;
};
type ProductSummary = Pick<
  Product,
  | "id"
  | "title"
  | "brand"
  | "model"
  | "variation"
  | "special_tags"
  | "image_urls"
  | "is_active"
> & {
  product_variants?: Array<{
    ship_class: string | null;
    condition?: string | null;
    qty?: number | null;
    release_at?: string | null;
  }> | null;
};

type Variant = {
  id: string;
  product_id: string;
  condition:
    | "sealed"
    | "resealed"
    | "near_mint"
    | "sealed_near_mint_box"
    | "sealed_near_mint_blister"
    | "sealed_not_mint_box"
    | "sealed_not_mint_blister"
    | "unsealed"
    | "unsealed_no_box"
    | "unsealed_no_acrylic"
    | "unsealed_incomplete"
    | "unsealed_near_mint_box"
    | "unsealed_near_mint_blister"
    | "wheelswapped"
    | "customized"
    | "with_issues"
    | "blistered"
    | "sealed_blister"
    | "unsealed_blister";
  issue_notes: string | null;
  issue_photo_urls: string[] | null;
  public_notes: string | null;
  cost: number | null;
  price: number;
  qty: number;
  ship_class: string | null;
  barcode: string | null;
  created_at: string;
  release_at: string | null;
};

type VariantCondition = Variant["condition"];
type ShipClass =
  | "MINI_GT"
  | "SMALL_BOX_FIGURE"
  | "KAIDO"
  | "BBR"
  | "POPRACE"
  | "TARMAC_BOX"
  | "ACRYLIC_TRUE_SCALE"
  | "TARMAC_ACRYLIC"
  | "TRUCKS"
  | "BLISTER"
  | "TOMICA"
  | "TOMICA_LIMITED_VINTAGE_NEO"
  | "HOT_WHEELS_MAINLINE"
  | "HOT_WHEELS_PREMIUM"
  | "LOOSE_NO_BOX"
  | "LALAMOVE"
  | "FIGURES_DIORAMA";
type VariantDraft = {
  id: string;
  condition: VariantCondition;
  publicNotes: string;
  issuePhotos: string[];
  cost: string;
  price: string;
  qty: string;
  shipClass: ShipClass;
  variantBarcode: string;
};
type LookupData = {
  title: string | null;
  brand: string | null;
  model: string | null;
  variation: string | null;
  images: string[];
};
type ProductUrlLookupData = LookupData & {
  source_url?: string;
};
type ExistingBarcodeMatch = {
  id: string;
  product_id: string;
  qty: number;
  condition: VariantCondition;
  ship_class: ShipClass | null;
  barcode: string | null;
  cost: number | null;
  price: number;
  sale_price: number | null;
  discount_percent: number | null;
  release_at: string | null;
  product: Product | null;
};

type InventoryValuation = {
  units: number;
  cost_value: number;
  retail_value: number;
  missing_cost_variants: number;
};
type InventoryStockHealthItem = {
  variant_id: string;
  product_id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  condition: VariantCondition;
  qty: number;
  price: number;
  retail_value: number;
  days_in_stock: number;
  in_stock_since: string | null;
  first_stocked_at: string | null;
  last_stock_added_at: string | null;
  last_qty_changed_at: string | null;
  sold_recent: number;
  sold_lifetime: number;
  last_sold_at: string | null;
  image_url: string | null;
};
type InventoryStockHealth = {
  threshold_days: number;
  recent_sales_days: number;
  stale_variants: number;
  stale_units: number;
  stale_retail_value: number;
  max_days_in_stock: number;
  items: InventoryStockHealthItem[];
};
type BarcodeLog = {
  id: string;
  created_at: string;
  product_id: string | null;
  product_title: string | null;
  description: string | null;
  barcode: string;
};
type HotWheelsBulkItem = {
  line: number;
  title: string;
  model: string;
  variation: string;
  price: number;
  qty: number;
  condition: VariantCondition;
};
type AutoMatchResult = {
  ok?: boolean;
  file?: string;
  uploadUrl?: string;
  upload_url?: string;
  status?: "APPLIED" | "NEEDS_REVIEW" | "NO_MATCH" | "ERROR" | string;
  reviewReason?: string;
  review_reason?: string;
  matchedProductId?: string;
  matched_product_id?: string;
  confidence?: number | null;
  distance?: number | null;
  error?: string;
};
type ReviewMatch = {
  id: string;
  created_at: string;
  upload_url: string;
  upload_hash: string | null;
  upload_hashes?: { hash_algo: string; image_hash: string }[] | null;
  status: string;
  review_reason: string | null;
  candidates: any;
};
type UploadCandidate = {
  product_id: string;
  image_url: string;
  distance: number;
  confidence: number;
  algo_distances?: Record<string, number>;
};
type InventoryView = "editor" | "scheduled" | "refresher" | "insights";
type VariantWorthRow = {
  id: string;
  cost: number | null;
  price: number | null;
  product_id: string | null;
  product:
    | {
        is_active: boolean | null;
      }
    | {
        is_active: boolean | null;
      }[]
    | null;
};
type VariantMovementRow = {
  variant_id: string | null;
  qty_delta: number | null;
  recorded_at: string | null;
};
type ScheduledPostingItem = {
  id: string;
  product_id: string;
  condition: VariantCondition;
  qty: number;
  price: number | null;
  ship_class: string | null;
  barcode: string | null;
  release_at: string | null;
  product: Product | null;
};

const BULK_CONDITIONS: VariantCondition[] = [...ALL_VARIANT_CONDITIONS];
const CONDITION_SELECT_OPTIONS: VariantCondition[] = [...ALL_VARIANT_CONDITIONS];

const BULK_SHIP_CLASS_FILTER_OPTIONS: Array<{ value: ShipClass; label: string }> = [
  { value: "MINI_GT", label: "Mini GT" },
  { value: "SMALL_BOX_FIGURE", label: "Small Box Figure" },
  { value: "KAIDO", label: "Kaido" },
  { value: "BBR", label: "BBR" },
  { value: "POPRACE", label: "Pop Race" },
  { value: "TARMAC_BOX", label: "Tarmac Box" },
  { value: "ACRYLIC_TRUE_SCALE", label: "Acrylic True Scale" },
  { value: "TARMAC_ACRYLIC", label: "Tarmac Acrylic" },
  { value: "TRUCKS", label: "Trucks" },
  { value: "BLISTER", label: "Blister" },
  { value: "TOMICA", label: "Tomica" },
  { value: "TOMICA_LIMITED_VINTAGE_NEO", label: "Tomica Limited Vintage Neo" },
  { value: "HOT_WHEELS_MAINLINE", label: "Hot Wheels Mainline" },
  { value: "HOT_WHEELS_PREMIUM", label: "Hot Wheels Premium" },
  { value: "LOOSE_NO_BOX", label: "Loose / No Box" },
  { value: "LALAMOVE", label: "Lalamove" },
  { value: "FIGURES_DIORAMA", label: "Figures & Diorama" },
];

const DEFAULT_COST_BY_SHIP_CLASS: Partial<Record<ShipClass, string>> = {
  ACRYLIC_TRUE_SCALE: "700",
  TARMAC_ACRYLIC: "700",
  MINI_GT: "450",
  SMALL_BOX_FIGURE: "450",
  BBR: "500",
  POPRACE: "500",
  TARMAC_BOX: "500",
  KAIDO: "500",
  TOMICA_LIMITED_VINTAGE_NEO: "700",
};
const DEFAULT_BRAND_SUGGESTIONS = ["Tomica Limited Vintage Neo"];

const WARM_HASH_DEFAULT_IMAGES = 8;
const WARM_HASH_DEFAULT_PRODUCTS = 20;
const WARM_HASH_MAX_IMAGES = 50;
const WARM_HASH_MAX_PRODUCTS = 500;
const WARM_FEATURE_DEFAULT_IMAGES = 6;
const WARM_FEATURE_DEFAULT_PRODUCTS = 20;
const WARM_FEATURE_MAX_IMAGES = 30;
const WARM_FEATURE_MAX_PRODUCTS = 500;
const WARM_BATCH_RETRY_LIMIT = 3;
const INVENTORY_SCHEDULE_SETTINGS_KEY = "oddwheels:admin_inventory_schedule";
const NIIMBOT_LABEL_WIDTH_MM = 50;
const NIIMBOT_LABEL_HEIGHT_MM = 30;
const NIIMBOT_LABEL_DP_MM = 8;

type InventoryBarcodeLabelData = {
  title: string;
  subtitle?: string | null;
  barcodeValue: string;
};

function autoMatchBadgeClass(status: string) {
  switch (status) {
    case "APPLIED":
      return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
    case "NEEDS_REVIEW":
      return "border-amber-400/40 bg-amber-500/15 text-amber-100";
    case "NO_MATCH":
      return "border-white/15 bg-white/5 text-white/70";
    case "ERROR":
      return "border-red-400/40 bg-red-500/15 text-red-100";
    default:
      return "";
  }
}

function mergeFileList(prev: File[], next: File[]) {
  const seen = new Set(prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`));
  const merged = [...prev];
  next.forEach((file) => {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(file);
  });
  return merged;
}

function normalizeCandidates(raw: any): UploadCandidate[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as UploadCandidate[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as UploadCandidate[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function wrapInventoryLabelText(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines: number
) {
  const words = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (!words.length) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
}

function createInventoryBarcodeLabelCanvas(data: InventoryBarcodeLabelData) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(NIIMBOT_LABEL_WIDTH_MM * NIIMBOT_LABEL_DP_MM);
  canvas.height = Math.round(NIIMBOT_LABEL_HEIGHT_MM * NIIMBOT_LABEL_DP_MM);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to render barcode label.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  const paddingX = 18;
  const maxWidth = canvas.width - paddingX * 2;
  let y = 10;

  ctx.font = "bold 20px Arial";
  const titleLines = wrapInventoryLabelText(ctx, data.title, maxWidth, 2);
  titleLines.forEach((line) => {
    ctx.fillText(line, paddingX, y);
    y += 22;
  });

  const subtitle = String(data.subtitle ?? "").trim();
  if (subtitle) {
    ctx.font = "14px Arial";
    const subtitleLines = wrapInventoryLabelText(ctx, subtitle, maxWidth, 1);
    subtitleLines.forEach((line) => {
      ctx.fillText(line, paddingX, y);
      y += 16;
    });
  }

  y += 4;

  const barcodeCanvas = document.createElement("canvas");
  const barcodeValue = String(data.barcodeValue ?? "").trim();
  const fallbackBarcode = barcodeValue
    .replace(/[^0-9A-Z\-. $/+%]/gi, "")
    .trim();

  try {
    JsBarcode(barcodeCanvas, barcodeValue || fallbackBarcode || "000000000000", {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
      width: 2,
      height: 62,
    });
  } catch {
    JsBarcode(barcodeCanvas, fallbackBarcode || "000000000000", {
      format: "CODE39",
      displayValue: false,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
      width: 2,
      height: 62,
    });
  }

  const targetHeight = 62;
  ctx.drawImage(barcodeCanvas, paddingX, y, maxWidth, targetHeight);
  y += targetHeight + 4;

  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    barcodeValue || fallbackBarcode || "000000000000",
    canvas.width / 2,
    y
  );
  ctx.textAlign = "left";

  return canvas;
}

function supportsDirectNiimbotPrinting() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  if (!window.isSecureContext) return false;

  const bluetooth = (navigator as Navigator & {
    bluetooth?: { requestDevice?: unknown };
  }).bluetooth;

  return Boolean(bluetooth && typeof bluetooth.requestDevice === "function");
}

function getNiimbotSupportMessage() {
  if (typeof window === "undefined") {
    return "Direct Bluetooth printing is only available in supported browsers.";
  }
  if (!window.isSecureContext) {
    return "Niimbot requires HTTPS or localhost in a secure browser context.";
  }
  if (!supportsDirectNiimbotPrinting()) {
    return "Direct Bluetooth printing is not supported in this browser.";
  }
  return null;
}

const SEARCH_TOKEN_ALIASES: Record<string, string[]> = {
  lbwk: ["liberty", "walk", "libertywalk"],
  "libertywalk": ["lbwk", "liberty", "walk"],
  "rocketbunny": ["rocket", "bunny"],
  "rocket": ["rocketbunny"],
  "bunny": ["rocketbunny"],
  s13: ["silvia"],
  s14: ["silvia"],
  s15: ["silvia"],
  r32: ["skyline"],
  r33: ["skyline"],
  r34: ["skyline"],
  r35: ["gtr", "gt", "r"],
  ae86: ["trueno", "sprinter"],
  fd3s: ["rx7", "rx-7"],
  fc3s: ["rx7", "rx-7"],
  eg6: ["civic"],
  ek9: ["civic", "type", "r"],
  dc2: ["integra"],
  dc5: ["integra"],
  "gt-r": ["gtr"],
  gtr: ["gt", "r"],
  rx7: ["rx-7"],
  supra: ["toyota"],
  silvia: ["nissan"],
  skyline: ["nissan"],
  civic: ["honda"],
  nsx: ["honda"],
};

function normalizeSearchText(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearch(value: string) {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

function expandSearchTokens(tokens: string[]) {
  const expanded = new Set<string>();
  tokens.forEach((t) => {
    if (!t) return;
    expanded.add(t);
    const aliases = SEARCH_TOKEN_ALIASES[t];
    if (aliases) {
      aliases.forEach((alias) => {
        tokenizeSearch(alias).forEach((a) => expanded.add(a));
      });
    }
  });
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const combo = `${tokens[i]}${tokens[i + 1]}`;
    if (combo.length >= 3 && combo.length <= 12) {
      expanded.add(combo);
    }
  }
  return Array.from(expanded);
}

function scoreSearchResult(
  product: ProductSummary,
  tokens: string[],
  normalizedQuery: string
) {
  const title = normalizeSearchText(product.title ?? "");
  const brand = normalizeSearchText(product.brand ?? "");
  const model = normalizeSearchText(product.model ?? "");
  const variation = normalizeSearchText(product.variation ?? "");
  const all = [title, brand, model, variation].filter(Boolean).join(" ").trim();
  const allCompact = all.replace(/\s+/g, "");
  const queryCompact = normalizedQuery.replace(/\s+/g, "");

  const titleWords = new Set(title.split(" ").filter(Boolean));
  const modelWords = new Set(model.split(" ").filter(Boolean));
  const variationWords = new Set(variation.split(" ").filter(Boolean));
  const brandWords = new Set(brand.split(" ").filter(Boolean));

  let score = 0;
  if (normalizedQuery && all.includes(normalizedQuery)) score += 14;
  if (queryCompact && allCompact.includes(queryCompact)) score += 8;

  let matched = 0;
  tokens.forEach((token) => {
    if (!token) return;
    const inModel = modelWords.has(token) || model.includes(token);
    const inVariation = variationWords.has(token) || variation.includes(token);
    const inTitle = titleWords.has(token) || title.includes(token);
    const inBrand = brandWords.has(token) || brand.includes(token);

    if (inModel || inVariation) {
      score += 5;
      matched += 1;
      if (/[a-z]*\d+[a-z]*/.test(token)) score += 2;
    } else if (inTitle) {
      score += 3;
      matched += 1;
    } else if (inBrand) {
      score += 1;
      matched += 1;
    } else if (all.includes(token)) {
      score += 1;
      matched += 1;
    } else {
      score -= 2;
    }
  });

  if (matched === tokens.length && tokens.length > 0) score += 6;
  if (tokens.length >= 2) {
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const phrase = `${tokens[i]} ${tokens[i + 1]}`;
      if (all.includes(phrase)) score += 3;
    }
  }

  return score;
}

function n(v: any, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function clampBatchValue(
  raw: string,
  min: number,
  max: number,
  fallback: number
) {
  const value = Math.trunc(Number(raw));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function parseBulkNumber(raw: string | undefined, fallback = NaN) {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : fallback;
}

function titleCase(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function properLookupCase(value: string | null | undefined) {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const lowerCount = (raw.match(/[a-z]/g) ?? []).length;
  const upperCount = (raw.match(/[A-Z]/g) ?? []).length;
  const mostlyUpper = upperCount > 0 && lowerCount <= upperCount * 0.2;
  let next = mostlyUpper ? titleCase(raw) : raw;
  next = next
    .replace(/\bGt\b/g, "GT")
    .replace(/\bGtr\b/g, "GTR")
    .replace(/\bLbwk\b/g, "LBWK")
    .replace(/\bRhd\b/g, "RHD")
    .replace(/\bLhd\b/g, "LHD");
  return next;
}

function normalizeBulkCondition(
  raw: string | undefined,
  fallback: VariantCondition
): VariantCondition {
  const cleaned = String(raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleaned) return fallback;
  const aliasMap: Partial<Record<string, VariantCondition>> = {
    nm_box: "sealed_near_mint_box",
    near_mint_box: "sealed_near_mint_box",
    sealed_nm_box: "sealed_near_mint_box",
    sealed_near_mint_box: "sealed_near_mint_box",
    unsealed_nm_box: "unsealed_near_mint_box",
    unsealed_near_mint_box: "unsealed_near_mint_box",
    unsealed_no_box: "unsealed_no_box",
    no_box: "unsealed_no_box",
    nm_blister: "sealed_near_mint_blister",
    near_mint_blister: "sealed_near_mint_blister",
    sealed_nm_blister: "sealed_near_mint_blister",
    sealed_near_mint_blister: "sealed_near_mint_blister",
    unsealed_nm_blister: "unsealed_near_mint_blister",
    unsealed_near_mint_blister: "unsealed_near_mint_blister",
    unsealed_no_acrylic: "unsealed_no_acrylic",
    no_acrylic: "unsealed_no_acrylic",
    incomplete: "unsealed_incomplete",
    unsealed_incomplete: "unsealed_incomplete",
    wheelswap: "wheelswapped",
    wheel_swap: "wheelswapped",
    wheelswapped: "wheelswapped",
    custom: "customized",
    customized: "customized",
    not_mint_box: "sealed_not_mint_box",
    sealed_not_mint_box: "sealed_not_mint_box",
    not_mint_blister: "sealed_not_mint_blister",
    sealed_not_mint_blister: "sealed_not_mint_blister",
  };
  if (aliasMap[cleaned]) return aliasMap[cleaned]!;
  const match = BULK_CONDITIONS.find((value) => value === cleaned);
  return match ?? fallback;
}

function splitBulkLine(line: string) {
  if (line.includes("\t")) {
    return line.split("\t").map((part) => part.trim());
  }
  return line.split(",").map((part) => part.trim());
}

function parseHotWheelsBulkLines(
  raw: string,
  fallbackCondition: VariantCondition
) {
  const items: HotWheelsBulkItem[] = [];
  const errors: string[] = [];
  const rows = raw.split(/\r?\n/);
  rows.forEach((row, index) => {
    const trimmed = row.trim();
    if (!trimmed) return;
    const parts = splitBulkLine(trimmed);
    const lineNo = index + 1;
    const hasPrice = (value: string | undefined) =>
      Number.isFinite(parseBulkNumber(value));

    let title = parts[0] ?? "";
    let model = "";
    let variation = "";
    let priceValue = "";
    let qtyValue = "1";
    let conditionValue = "";

    if (parts.length >= 3 && hasPrice(parts[2])) {
      model = parts[0] ?? "";
      variation = parts[1] ?? "";
      priceValue = parts[2] ?? "";
      qtyValue = parts[3] ?? "1";
      conditionValue = parts[4] ?? "";
    } else if (parts.length >= 4 && hasPrice(parts[3])) {
      title = parts[0] ?? "";
      model = parts[1] ?? "";
      variation = parts[2] ?? "";
      priceValue = parts[3] ?? "";
      qtyValue = parts[4] ?? "1";
      conditionValue = parts[5] ?? "";
    } else if (parts.length >= 2 && hasPrice(parts[1])) {
      title = parts[0] ?? "";
      priceValue = parts[1] ?? "";
      qtyValue = parts[2] ?? "1";
      conditionValue = parts[3] ?? "";
    } else {
      errors.push(
        `Line ${lineNo}: include model + color + price (use commas to separate fields).`
      );
      return;
    }

    if (!title.trim() && !model.trim()) {
      errors.push(`Line ${lineNo}: title is required.`);
      return;
    }

    const price = parseBulkNumber(priceValue);
    if (!Number.isFinite(price) || price <= 0) {
      errors.push(`Line ${lineNo}: price must be a number.`);
      return;
    }

    const qtyRaw = parseBulkNumber(qtyValue, 1);
    const qty = Math.max(1, Math.trunc(qtyRaw));
    const condition = normalizeBulkCondition(conditionValue, fallbackCondition);
    items.push({
      line: lineNo,
      title: title.trim(),
      model: model.trim(),
      variation: variation.trim(),
      price,
      qty,
      condition,
    });
  });

  return { items, errors };
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function parseValuation(raw: any): InventoryValuation | null {
  if (!raw) return null;
  let data = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  return {
    units: Math.trunc(n((data as any).units)),
    cost_value: n((data as any).cost_value),
    retail_value: n((data as any).retail_value),
    missing_cost_variants: Math.trunc(n((data as any).missing_cost_variants)),
  };
}

function countLiveInventoryUnits(products: Product[] | null | undefined) {
  let activeUnits = 0;
  let allUnits = 0;

  for (const product of products ?? []) {
    for (const variant of product.product_variants ?? []) {
      const qty = Math.max(0, Math.trunc(n(variant?.qty)));
      if (qty <= 0) continue;
      if (isScheduledRelease(variant?.release_at ?? null)) continue;

      allUnits += qty;
      if (product.is_active) {
        activeUnits += qty;
      }
    }
  }

  return { activeUnits, allUnits };
}

type LiveUnitCountRow = {
  qty?: number | string | null;
  release_at?: string | null;
  product?: {
    is_active?: boolean | null;
  } | null;
};

function countLiveInventoryUnitsFromRows(rows: LiveUnitCountRow[] | null | undefined) {
  let activeUnits = 0;
  let allUnits = 0;

  for (const row of rows ?? []) {
    const qty = Math.max(0, Math.trunc(n(row?.qty)));
    if (qty <= 0) continue;
    if (isScheduledRelease(row?.release_at ?? null)) continue;

    allUnits += qty;
    if (row?.product?.is_active) {
      activeUnits += qty;
    }
  }

  return { activeUnits, allUnits };
}

function parseStockHealthItem(raw: any): InventoryStockHealthItem | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, any>;
  const variantId = String(record.variant_id ?? "").trim();
  const productId = String(record.product_id ?? "").trim();
  const title = String(record.title ?? "").trim();
  if (!variantId || !productId || !title) return null;

  const maybeString = (value: any) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text || null;
  };

  return {
    variant_id: variantId,
    product_id: productId,
    title,
    brand: maybeString(record.brand),
    model: maybeString(record.model),
    variation: maybeString(record.variation),
    condition: String(record.condition ?? "unsealed") as VariantCondition,
    qty: Math.max(0, Math.trunc(n(record.qty))),
    price: n(record.price),
    retail_value: n(record.retail_value),
    days_in_stock: Math.max(0, Math.trunc(n(record.days_in_stock))),
    in_stock_since: maybeString(record.in_stock_since),
    first_stocked_at: maybeString(record.first_stocked_at),
    last_stock_added_at: maybeString(record.last_stock_added_at),
    last_qty_changed_at: maybeString(record.last_qty_changed_at),
    sold_recent: Math.max(0, Math.trunc(n(record.sold_recent))),
    sold_lifetime: Math.max(0, Math.trunc(n(record.sold_lifetime))),
    last_sold_at: maybeString(record.last_sold_at),
    image_url: maybeString(record.image_url),
  };
}

function parseStockHealth(raw: any): InventoryStockHealth | null {
  if (!raw) return null;
  let data = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;

  const items = Array.isArray((data as any).items)
    ? ((data as any).items
        .map(parseStockHealthItem)
        .filter(Boolean) as InventoryStockHealthItem[])
    : [];

  return {
    threshold_days: Math.max(1, Math.trunc(n((data as any).threshold_days, 60))),
    recent_sales_days: Math.max(
      1,
      Math.trunc(n((data as any).recent_sales_days, 30))
    ),
    stale_variants: Math.max(0, Math.trunc(n((data as any).stale_variants))),
    stale_units: Math.max(0, Math.trunc(n((data as any).stale_units))),
    stale_retail_value: n((data as any).stale_retail_value),
    max_days_in_stock: Math.max(
      0,
      Math.trunc(n((data as any).max_days_in_stock))
    ),
    items,
  };
}

function formatCount(value: number) {
  const num = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-PH").format(num);
}

function ymd(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getDefaultCostForShipClass(value: ShipClass | null | undefined) {
  if (!value) return "";
  return DEFAULT_COST_BY_SHIP_CLASS[value] ?? "";
}

function roundUpToNext49Or99(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const rounded = Math.ceil(value);
  const base = Math.floor(rounded / 100) * 100;
  const remainder = rounded - base;
  return remainder <= 49 ? base + 49 : base + 99;
}

function getSuggestedPriceFromCost(value: string | number | null | undefined) {
  const costValue =
    typeof value === "number" ? value : n(String(value ?? "").trim(), NaN);
  if (!Number.isFinite(costValue) || costValue <= 0) return "";
  return String(roundUpToNext49Or99(costValue * 1.5));
}

function getMarginInfo(
  costValue: string | number | null | undefined,
  priceValue: string | number | null | undefined
) {
  const costNum =
    typeof costValue === "number" ? costValue : n(String(costValue ?? "").trim(), NaN);
  const priceNum =
    typeof priceValue === "number" ? priceValue : n(String(priceValue ?? "").trim(), NaN);
  if (!Number.isFinite(costNum) || costNum <= 0 || !Number.isFinite(priceNum) || priceNum <= 0) {
    return null;
  }

  const margin = ((priceNum - costNum) / costNum) * 100;
  const roundedMargin =
    Math.abs(margin - Math.round(margin)) < 0.05
      ? Math.round(margin).toString()
      : margin.toFixed(1);

  return {
    text: `${roundedMargin}% margin`,
    className:
      margin < 0
        ? "text-rose-300"
        : margin < 35
          ? "text-amber-200"
          : "text-emerald-200",
  };
}

function mergeBrandSuggestions(
  current: string[],
  nextValues: Array<string | null | undefined>
) {
  const seen = new Set<string>();
  const merged: string[] = [];

  const push = (rawValue: string | null | undefined) => {
    const normalized = normalizeBrandAlias(rawValue)?.trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(normalized);
  };

  current.forEach(push);
  nextValues.forEach(push);

  return merged
    .slice()
    .sort((a, b) =>
      a.localeCompare(b, "en", {
        sensitivity: "base",
        numeric: true,
      })
    );
}

function VariantDraftPanel({
  draft,
  index,
}: {
  draft: VariantDraft;
  index: number;
}) {
  const marginInfo = getMarginInfo(draft.cost, draft.price);
  return (
    <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-4">
      <div className="font-semibold">Variant draft {index + 1}</div>
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Condition"
          value={draft.condition}
          onChange={() => {}}
          disabled
        >
          {CONDITION_SELECT_OPTIONS.map((conditionOption) => (
            <option key={conditionOption} value={conditionOption}>
              {formatConditionLabel(conditionOption)}
            </option>
          ))}
        </Select>

        <Select
          label="Shipping Class"
          value={draft.shipClass}
          onChange={() => {}}
          disabled
        >
          <option value="MINI_GT">Mini GT</option>
          <option value="SMALL_BOX_FIGURE">Small Box Figure</option>
          <option value="KAIDO">Kaido</option>
          <option value="BBR">BBR</option>
          <option value="POPRACE">Pop Race</option>
          <option value="TARMAC_BOX">Tarmac Box</option>
          <option value="ACRYLIC_TRUE_SCALE">Acrylic True-Scale</option>
          <option value="TARMAC_ACRYLIC">Tarmac Acrylic</option>
          <option value="TRUCKS">Trucks</option>
          <option value="BLISTER">Blister</option>
          <option value="TOMICA">Tomica</option>
          <option value="TOMICA_LIMITED_VINTAGE_NEO">
            Tomica Limited Vintage Neo
          </option>
          <option value="HOT_WHEELS_MAINLINE">Hot Wheels Mainline</option>
          <option value="HOT_WHEELS_PREMIUM">Hot Wheels Premium</option>
          <option value="LOOSE_NO_BOX">Loose (No Box)</option>
          <option value="LALAMOVE">Lalamove</option>
          <option value="FIGURES_DIORAMA">Figures & Diorama (Lalamove)</option>
        </Select>

        <Input
          label="Variant Barcode (optional)"
          value={draft.variantBarcode}
          readOnly
          disabled
        />
        <div />

        <Input label="Cost (₱)" value={draft.cost} placeholder="(empty)" readOnly disabled />
        <Input
          label="Selling Price (₱)"
          labelSuffix={
            marginInfo ? (
              <span className={marginInfo.className}>{marginInfo.text}</span>
            ) : null
          }
          value={draft.price}
          placeholder="(empty)"
          readOnly
          disabled
        />
        <div className="space-y-1">
          <div className="text-sm text-white/80">Quantity</div>
          <Input value={draft.qty} placeholder="(empty)" readOnly disabled />
        </div>

        <Textarea
          label="Notes (visible to customers)"
          value={draft.publicNotes}
          className="md:col-span-2"
          readOnly
          disabled
        />

        {supportsIssueDetailCondition(draft.condition) ? (
          <div className="space-y-3 md:col-span-2">
            <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3 space-y-3">
              <div className="text-sm font-medium">Issue Photos (optional)</div>
              {draft.issuePhotos.length ? (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {draft.issuePhotos.map((u) => (
                    <div
                      key={u}
                      className="rounded-xl border border-white/10 bg-bg-900/40 overflow-hidden"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="h-32 w-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-white/50">No issue photos yet.</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function resolveNormalizedBrand(
  current: string,
  incoming: string | null | undefined
) {
  const normalized = normalizeBrandAlias(incoming);
  if (!normalized) return current;
  if (!current.trim()) return normalized;
  if (current.trim().toLowerCase() === normalized.toLowerCase()) {
    return normalized;
  }
  return current;
}

function resolveNormalizedTitle(current: string, incoming: string | null | undefined) {
  const incomingValue = String(incoming ?? "").trim();
  if (!incomingValue) return current;
  const normalizedIncoming = normalizeTitleBrandAliases(incomingValue);
  if (!current.trim()) return normalizedIncoming;
  const normalizedCurrent = normalizeTitleBrandAliases(current);
  if (
    normalizedCurrent.toLowerCase() === normalizedIncoming.toLowerCase() &&
    current !== normalizedIncoming
  ) {
    return normalizedIncoming;
  }
  return current;
}

function brandFromNormalizedTitle(titleValue: string) {
  if (
    /\bTomica\s+Limited\s+Vintage\s+Neo\b/i.test(titleValue) ||
    /\bTLVN\b/i.test(titleValue) ||
    /\bTLV-N\b/i.test(titleValue)
  ) {
    return "Tomica Limited Vintage Neo";
  }
  if (/\bKaido\s+House\b/i.test(titleValue)) return "Kaido House";
  return null;
}

export default function AdminInventoryPage() {
  // Inventory analytics
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [assumeZeroCost, setAssumeZeroCost] = React.useState(true);
  const today = React.useMemo(() => new Date(), []);
  const [worthMovementFrom, setWorthMovementFrom] = React.useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return ymd(start);
  });
  const [worthMovementTo, setWorthMovementTo] = React.useState(() => ymd(today));
  const [worthMovementMetric, setWorthMovementMetric] =
    React.useState<InventoryWorthMovementMetric>("retail");
  const [worthMovementPoints, setWorthMovementPoints] = React.useState<
    InventoryWorthMovementPoint[]
  >([]);
  const [worthMovementLoading, setWorthMovementLoading] = React.useState(false);
  const [worthMovementError, setWorthMovementError] = React.useState<string | null>(
    null
  );
  const router = useRouter();
  const [valuationActive, setValuationActive] =
    React.useState<InventoryValuation | null>(null);
  const [valuationAll, setValuationAll] =
    React.useState<InventoryValuation | null>(null);
  const [stockHealthActive, setStockHealthActive] =
    React.useState<InventoryStockHealth | null>(null);
  const [stockHealthAll, setStockHealthAll] =
    React.useState<InventoryStockHealth | null>(null);
  const [valuationLoading, setValuationLoading] = React.useState(false);
  const [valuationError, setValuationError] = React.useState<string | null>(null);

  // Search
  const [search, setSearch] = React.useState("");
  const [results, setResults] = React.useState<Product[]>([]);
  const [compactAddMode, setCompactAddMode] = React.useState(true);
  const [showAllSearchResults, setShowAllSearchResults] = React.useState(false);
  const [showExistingVariants, setShowExistingVariants] = React.useState(false);
  const [showAdvancedTools, setShowAdvancedTools] = React.useState(false);
  const [inventoryView, setInventoryView] =
    React.useState<InventoryView>("editor");
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(
    null
  );
  const [variants, setVariants] = React.useState<Variant[]>([]);
  const [scheduleReleaseEnabled, setScheduleReleaseEnabled] = React.useState(false);
  const [scheduledReleaseAtInput, setScheduledReleaseAtInput] =
    React.useState("");
  const [rescheduleLiveVariants, setRescheduleLiveVariants] =
    React.useState(false);
  const [publishScheduledNow, setPublishScheduledNow] = React.useState(false);
  const [loadingVariants, setLoadingVariants] = React.useState(false);
  const [savingVariantIds, setSavingVariantIds] = React.useState<
    Record<string, boolean>
  >({});
  const [scheduledPostingItems, setScheduledPostingItems] = React.useState<
    ScheduledPostingItem[]
  >([]);
  const [scheduledPostingLoading, setScheduledPostingLoading] =
    React.useState(false);
  const [scheduledPostingError, setScheduledPostingError] = React.useState<
    string | null
  >(null);
  const [scheduledPostingSearch, setScheduledPostingSearch] = React.useState("");

  // Barcode lookup
  const [barcodeLookup, setBarcodeLookup] = React.useState("");
  const [lookupLoading, setLookupLoading] = React.useState(false);
  const [lookupMsg, setLookupMsg] = React.useState<string | null>(null);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = React.useState(false);
  const [quickAddEnabled, setQuickAddEnabled] = React.useState(false);
  const [quickAddConfigOpen, setQuickAddConfigOpen] = React.useState(false);
  const [quickAddQty, setQuickAddQty] = React.useState("1");
  const [quickAddCondition, setQuickAddCondition] = React.useState<
    VariantCondition | "any"
  >("any");
  const [quickAddBusy, setQuickAddBusy] = React.useState(false);
  const quickAddInFlightRef = React.useRef<Set<string>>(new Set());
  const quickAddRecentRef = React.useRef<Map<string, number>>(new Map());
  const [existingBarcodePrompt, setExistingBarcodePrompt] = React.useState<{
    barcode: string;
    matches: ExistingBarcodeMatch[];
  } | null>(null);
  const [existingBarcodeVariantId, setExistingBarcodeVariantId] =
    React.useState("");
  const [existingBarcodeAddQty, setExistingBarcodeAddQty] = React.useState("1");
  const [existingBarcodeActionLoading, setExistingBarcodeActionLoading] =
    React.useState(false);
  const [newCardTitle, setNewCardTitle] = React.useState("");
  const [newCardBrand, setNewCardBrand] = React.useState("");
  const [newCardModel, setNewCardModel] = React.useState("");
  const [newCardVariation, setNewCardVariation] = React.useState("");
  const barcodeLookupTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoLookupRef = React.useRef("");
  const scheduleSettingsLoadedRef = React.useRef(false);
  const barcodeInputRef = React.useRef<HTMLInputElement | null>(null);
  const modelInputRef = React.useRef<HTMLInputElement | null>(null);
  const focusAfterSaveRef = React.useRef(false);
  const conditionTouchedRef = React.useRef(false);
  const costTouchedRef = React.useRef(false);
  const lastAutoCostRef = React.useRef("");
  const priceTouchedRef = React.useRef(false);
  const lastAutoPriceRef = React.useRef("");
  const titleEditedRef = React.useRef(false);
  const lastAutoTitleRef = React.useRef("");
  const titleCommaStageRef = React.useRef(0);
  const lastAutoIdentityRef = React.useRef({
    brand: "",
    model: "",
    variation: "",
  });

  // Product URL lookup
  const [productUrl, setProductUrl] = React.useState("");
  const [productUrlLoading, setProductUrlLoading] = React.useState(false);
  const [productUrlMsg, setProductUrlMsg] = React.useState<string | null>(null);

  // Auto-match uploads
  const [autoMatchFiles, setAutoMatchFiles] = React.useState<File[]>([]);
  const [autoMatchMinConfidence, setAutoMatchMinConfidence] =
    React.useState("0.9");
  const [autoMatchLoading, setAutoMatchLoading] = React.useState(false);
  const [autoMatchMsg, setAutoMatchMsg] = React.useState<string | null>(null);
  const [autoMatchResults, setAutoMatchResults] = React.useState<
    AutoMatchResult[]
  >([]);
  const [autoMatchDragging, setAutoMatchDragging] = React.useState(false);
  const [autoMatchProgress, setAutoMatchProgress] = React.useState<{
    current: number;
    total: number;
  } | null>(null);
  const [warmUpFrom, setWarmUpFrom] = React.useState(0);
  const warmUpFromRef = React.useRef(0);
  const [warmUpMaxImages, setWarmUpMaxImages] = React.useState(
    String(WARM_HASH_DEFAULT_IMAGES)
  );
  const [warmUpMaxProducts, setWarmUpMaxProducts] = React.useState(
    String(WARM_HASH_DEFAULT_PRODUCTS)
  );
  const [warmUpLoading, setWarmUpLoading] = React.useState(false);
  const [warmUpAuto, setWarmUpAuto] = React.useState(false);
  const warmUpAutoRef = React.useRef(false);
  const [warmUpMsg, setWarmUpMsg] = React.useState<string | null>(null);
  const [warmFeatureFrom, setWarmFeatureFrom] = React.useState(0);
  const warmFeatureFromRef = React.useRef(0);
  const [warmFeatureMaxImages, setWarmFeatureMaxImages] =
    React.useState(String(WARM_FEATURE_DEFAULT_IMAGES));
  const [warmFeatureMaxProducts, setWarmFeatureMaxProducts] =
    React.useState(String(WARM_FEATURE_DEFAULT_PRODUCTS));
  const [warmFeatureIncludeOcr, setWarmFeatureIncludeOcr] =
    React.useState(false);
  const [warmFeatureLoading, setWarmFeatureLoading] = React.useState(false);
  const [warmFeatureAuto, setWarmFeatureAuto] = React.useState(false);
  const warmFeatureAutoRef = React.useRef(false);
  const [warmFeatureMsg, setWarmFeatureMsg] = React.useState<string | null>(
    null
  );

  // Auto-match review queue
  const [reviewMatches, setReviewMatches] = React.useState<ReviewMatch[]>([]);
  const [reviewLoading, setReviewLoading] = React.useState(false);
  const [reviewError, setReviewError] = React.useState<string | null>(null);
  const [reviewActionId, setReviewActionId] = React.useState<string | null>(
    null
  );
  const [reviewProductMap, setReviewProductMap] = React.useState<
    Record<string, Product>
  >({});
  const [bulkUploadLoading, setBulkUploadLoading] = React.useState(false);
  const [bulkUploadMsg, setBulkUploadMsg] = React.useState<string | null>(null);
  const [bulkUploadProgress, setBulkUploadProgress] = React.useState<{
    current: number;
    total: number;
  } | null>(null);
  const [bulkPreviewUrl, setBulkPreviewUrl] = React.useState<string | null>(null);
  const [bulkPreviewError, setBulkPreviewError] = React.useState(false);
  const [bulkShipClassFilter, setBulkShipClassFilter] = React.useState<
    ShipClass[]
  >([]);
  const [bulkSearchTerms, setBulkSearchTerms] = React.useState<Record<string, string>>({});
  const [bulkSearchResults, setBulkSearchResults] = React.useState<
    Record<string, ProductSummary[]>
  >({});
  const [bulkSearchLoading, setBulkSearchLoading] = React.useState<Record<string, boolean>>({});
  const [bulkSearchHistory, setBulkSearchHistory] = React.useState<Record<string, string[]>>({});
  const [bulkSearchIndex, setBulkSearchIndex] = React.useState<Record<string, number | null>>({});
  const bulkSearchTimersRef = React.useRef<Record<string, number>>({});
  const bulkSearchInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const productEditorRef = React.useRef<HTMLDivElement | null>(null);
  const existingVariantsSectionRef = React.useRef<HTMLDivElement | null>(null);
  const newVariantSectionRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    return () => {
      warmUpAutoRef.current = false;
      warmFeatureAutoRef.current = false;
      const timers = bulkSearchTimersRef.current;
      Object.keys(timers).forEach((key) => {
        window.clearTimeout(timers[key]);
      });
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(INVENTORY_SCHEDULE_SETTINGS_KEY);
      if (!raw) {
        scheduleSettingsLoadedRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as {
        enabled?: boolean;
        releaseAtInput?: string;
      } | null;
      setScheduleReleaseEnabled(Boolean(parsed?.enabled));
      setScheduledReleaseAtInput(String(parsed?.releaseAtInput ?? ""));
    } catch {
      // Ignore bad local settings and keep defaults.
    } finally {
      scheduleSettingsLoadedRef.current = true;
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined" || !scheduleSettingsLoadedRef.current) return;
    try {
      window.localStorage.setItem(
        INVENTORY_SCHEDULE_SETTINGS_KEY,
        JSON.stringify({
          enabled: scheduleReleaseEnabled,
          releaseAtInput: scheduledReleaseAtInput,
        })
      );
    } catch {
      // Ignore localStorage failures.
    }
  }, [scheduleReleaseEnabled, scheduledReleaseAtInput]);

  // Product fields (edit)
  const [title, setTitle] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [brandSuggestions, setBrandSuggestions] = React.useState<string[]>([]);
  const [brandAutocompleteOpen, setBrandAutocompleteOpen] = React.useState(false);
  const [brandSuggestionIndex, setBrandSuggestionIndex] = React.useState(-1);
  const [model, setModel] = React.useState("");
  const [variation, setVariation] = React.useState("");
  const [specialTags, setSpecialTags] = React.useState<ProductSpecialTag[]>([]);
  const [images, setImages] = React.useState<string[]>([]);
  const [selectedImages, setSelectedImages] = React.useState<
    Record<string, boolean>
  >({});
  const brandInputRef = React.useRef<HTMLInputElement | null>(null);

  const filteredBrandSuggestions = React.useMemo(() => {
    const query = brand.trim().toLowerCase();
    const startsWith: string[] = [];
    const includes: string[] = [];

    for (const suggestion of brandSuggestions) {
      const normalizedSuggestion = suggestion.toLowerCase();
      if (!query) {
        startsWith.push(suggestion);
        continue;
      }
      if (normalizedSuggestion === query) continue;
      if (normalizedSuggestion.startsWith(query)) {
        startsWith.push(suggestion);
        continue;
      }
      if (normalizedSuggestion.includes(query)) {
        includes.push(suggestion);
      }
    }

    return [...startsWith, ...includes].slice(0, 8);
  }, [brand, brandSuggestions]);
  const showBrandSuggestions =
    brandAutocompleteOpen && filteredBrandSuggestions.length > 0;

  function syncTitleFromIdentity(
    nextBrand: string,
    nextModel: string,
    nextVariation: string
  ) {
    const next = [nextBrand, nextModel, nextVariation]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" ");
    const currentTitle = title.trim();
    const lastAuto = lastAutoTitleRef.current.trim();
    const canAuto =
      !titleEditedRef.current || (lastAuto && currentTitle === lastAuto);
    if (!canAuto) return;
    if (!next && !currentTitle) return;
    if (next === currentTitle) return;
    setTitle(next);
    lastAutoTitleRef.current = next;
  }

  function syncIdentityFromTitle(nextTitle: string) {
    const stage = titleCommaStageRef.current;
    if (stage <= 0) return;

    const normalized = nextTitle.replace(/\s+/g, " ").trim();
    const lastAuto = lastAutoIdentityRef.current;
    const brandPart = (lastAuto.brand || brand).trim();
    const modelPart = (lastAuto.model || model).trim();

    if (!brandPart) return;

    let remainder = normalized;
    if (remainder.toLowerCase().startsWith(brandPart.toLowerCase())) {
      remainder = remainder.slice(brandPart.length).trim();
    }

    let nextModel = "";
    let nextVariation = "";
    if (stage === 1) {
      nextModel = remainder;
    } else {
      let variationPart = remainder;
      if (
        modelPart &&
        variationPart.toLowerCase().startsWith(modelPart.toLowerCase())
      ) {
        variationPart = variationPart.slice(modelPart.length).trim();
      } else if (!modelPart) {
        nextModel = remainder;
      }
      nextVariation = variationPart;
    }

    const currentBrand = brand.trim();
    const currentModel = model.trim();
    const currentVariation = variation.trim();

    const canSetBrand =
      titleEditedRef.current || !currentBrand || currentBrand === lastAuto.brand;
    const canSetModel =
      titleEditedRef.current || !currentModel || currentModel === lastAuto.model;
    const canSetVariation =
      titleEditedRef.current ||
      !currentVariation ||
      currentVariation === lastAuto.variation;

    if (canSetModel && nextModel !== currentModel) {
      setModel(nextModel);
      lastAuto.model = nextModel;
    }
    if (canSetVariation && nextVariation !== currentVariation) {
      setVariation(nextVariation);
      lastAuto.variation = nextVariation;
    }
  }

  function selectBrandSuggestion(nextBrand: string) {
    setBrand(nextBrand);
    setBrandAutocompleteOpen(false);
    setBrandSuggestionIndex(-1);
    syncTitleFromIdentity(nextBrand, model, variation);
    requestAnimationFrame(() => {
      brandInputRef.current?.focus();
    });
  }

  function moveBrandSuggestion(direction: 1 | -1) {
    if (!filteredBrandSuggestions.length) return;
    setBrandAutocompleteOpen(true);
    setBrandSuggestionIndex((prev) => {
      const start = prev < 0 ? (direction > 0 ? 0 : filteredBrandSuggestions.length - 1) : prev;
      return (start + direction + filteredBrandSuggestions.length) % filteredBrandSuggestions.length;
    });
  }

  function handleBrandInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!filteredBrandSuggestions.length) return;

    if (event.key === "Tab") {
      event.preventDefault();
      moveBrandSuggestion(event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveBrandSuggestion(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveBrandSuggestion(-1);
      return;
    }

    if (event.key === "Enter" && showBrandSuggestions) {
      event.preventDefault();
      const nextIndex = brandSuggestionIndex >= 0 ? brandSuggestionIndex : 0;
      const nextBrand = filteredBrandSuggestions[nextIndex];
      if (nextBrand) {
        selectBrandSuggestion(nextBrand);
      }
      return;
    }

    if (event.key === "Escape") {
      setBrandAutocompleteOpen(false);
      setBrandSuggestionIndex(-1);
    }
  }

  // Manual image
  const [manualImageUrl, setManualImageUrl] = React.useState("");
  const [manualUploadLoading, setManualUploadLoading] = React.useState(false);
  const [cropEditor, setCropEditor] = React.useState<{
    index: number;
    baseUrl: string;
    crop: ImageCrop;
  } | null>(null);
  const cropFrameRef = React.useRef<HTMLDivElement | null>(null);
  const cropDragRef = React.useRef<{
    startX: number;
    startY: number;
    crop: ImageCrop;
    rect: DOMRect;
  } | null>(null);

  // New variant fields
  const [condition, setCondition] = React.useState<VariantCondition>("unsealed");
  const [publicNotes, setPublicNotes] = React.useState("");
  const [issuePhotos, setIssuePhotos] = React.useState<string[]>([]);
  const [issuePhotosUploading, setIssuePhotosUploading] = React.useState(false);
  const [issuePhotosUploadingId, setIssuePhotosUploadingId] =
    React.useState<string | null>(null);
  const [cost, setCost] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [qty, setQty] = React.useState("1");
  const [shipClass, setShipClass] = React.useState<ShipClass>(
    "ACRYLIC_TRUE_SCALE"
  );
  const [variantBarcode, setVariantBarcode] = React.useState("");
  const [queuedVariants, setQueuedVariants] = React.useState<VariantDraft[]>([]);

  const [saving, setSaving] = React.useState(false);
  const [barcodeLogs, setBarcodeLogs] = React.useState<BarcodeLog[]>([]);
  const [barcodeLogsLoading, setBarcodeLogsLoading] = React.useState(false);
  const [barcodeLogsError, setBarcodeLogsError] = React.useState<string | null>(
    null
  );
  const [niimbotState, setNiimbotState] = React.useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [niimbotPrinterName, setNiimbotPrinterName] = React.useState<string>("");
  const [printingBarcodeLabels, setPrintingBarcodeLabels] =
    React.useState(false);
  const niimbotLibRef = React.useRef<any>(null);
  const niimbotClientRef = React.useRef<any>(null);
  const [showBarcodeLogs, setShowBarcodeLogs] = React.useState(false);
  const [addQtyByVariant, setAddQtyByVariant] = React.useState<
    Record<string, string>
  >({});
  const [bulkBrand, setBulkBrand] = React.useState("");
  const [bulkShipClass, setBulkShipClass] =
    React.useState<ShipClass>("HOT_WHEELS_MAINLINE");
  const [bulkHotWheelsCost, setBulkHotWheelsCost] = React.useState("");
  const [bulkHotWheelsCondition, setBulkHotWheelsCondition] =
    React.useState<VariantCondition>("sealed");
  const [bulkHotWheelsLines, setBulkHotWheelsLines] = React.useState("");
  const [bulkHotWheelsIssueNotes, setBulkHotWheelsIssueNotes] =
    React.useState("");
  const [bulkHotWheelsErrors, setBulkHotWheelsErrors] = React.useState<
    string[]
  >([]);
  const [bulkHotWheelsSaving, setBulkHotWheelsSaving] = React.useState(false);
  const [protectorStockMainline, setProtectorStockMainline] = React.useState("");
  const [protectorStockPremium, setProtectorStockPremium] = React.useState("");
  const [protectorStockLoading, setProtectorStockLoading] = React.useState(false);
  const [protectorStockSaving, setProtectorStockSaving] = React.useState(false);
  const [protectorStockMsg, setProtectorStockMsg] = React.useState<
    string | null
  >(null);
  function isHotWheelsShipClass(value: ShipClass) {
    return value === "HOT_WHEELS_MAINLINE" || value === "HOT_WHEELS_PREMIUM";
  }

  function defaultConditionForBrand(
    value: string | null | undefined
  ): VariantCondition {
    return isHotWheelsShipClass(shipClassFromBrand(value)) ? "sealed" : "unsealed";
  }

  function applyDefaultCostForShipClass(
    nextShipClass: ShipClass,
    options?: { force?: boolean; currentCost?: string }
  ) {
    const nextDefaultCost = getDefaultCostForShipClass(nextShipClass);
    const currentCost = String(options?.currentCost ?? cost).trim();
    const previousAutoCost = lastAutoCostRef.current;
    const shouldApplyDefault =
      options?.force ||
      !costTouchedRef.current ||
      !currentCost ||
      currentCost === previousAutoCost;

    if (!shouldApplyDefault) return;

    costTouchedRef.current = false;
    lastAutoCostRef.current = nextDefaultCost;
    setCost(nextDefaultCost);
    applySuggestedPriceFromCost(nextDefaultCost, {
      force: options?.force,
      currentPrice: price,
    });
  }

  function adoptDraftCost(nextCost: string | null | undefined, nextShipClass: ShipClass) {
    const cleaned = String(nextCost ?? "").trim();
    lastAutoCostRef.current = getDefaultCostForShipClass(nextShipClass);

    if (cleaned) {
      costTouchedRef.current = true;
      setCost(cleaned);
      applySuggestedPriceFromCost(cleaned, {
        force: true,
        currentPrice: "",
      });
      return;
    }

    applyDefaultCostForShipClass(nextShipClass, {
      force: true,
      currentCost: "",
    });
  }

  function handleCostChange(nextValue: string) {
    const cleaned = nextValue.replace(/[^0-9.]/g, "");
    costTouchedRef.current = true;
    setCost(cleaned);
    applySuggestedPriceFromCost(cleaned, {
      currentPrice: price,
    });
  }

  function handleCostInputClick() {
    const currentCost = cost.trim();
    if (!currentCost) return;

    const defaultCost = getDefaultCostForShipClass(shipClass);
    if (
      currentCost !== lastAutoCostRef.current &&
      currentCost !== defaultCost
    ) {
      return;
    }

    costTouchedRef.current = true;
    setCost("");
  }

  function applySuggestedPriceFromCost(
    nextCost: string | number | null | undefined,
    options?: { force?: boolean; currentPrice?: string }
  ) {
    const nextDefaultPrice = getSuggestedPriceFromCost(nextCost);
    const currentPrice = String(options?.currentPrice ?? price).trim();
    const previousAutoPrice = lastAutoPriceRef.current;
    const shouldApplyDefault =
      options?.force ||
      !priceTouchedRef.current ||
      !currentPrice ||
      currentPrice === previousAutoPrice;

    if (!shouldApplyDefault) return;

    priceTouchedRef.current = false;
    lastAutoPriceRef.current = nextDefaultPrice;
    setPrice(nextDefaultPrice);
  }

  function handlePriceChange(nextValue: string) {
    priceTouchedRef.current = true;
    setPrice(nextValue.replace(/[^0-9.]/g, ""));
  }

  function handlePriceInputClick() {
    const currentPrice = price.trim();
    if (!currentPrice) return;
    priceTouchedRef.current = true;
    setPrice("");
  }

  React.useEffect(() => {
    if (isBlisterCondition(condition)) return;
    if (isLalamoveOnlyShipClass(shipClass)) return;
    const nextShipClass = shipClassFromBrand(brand);
    if (shipClass !== nextShipClass) {
      setShipClass(nextShipClass);
    }
  }, [brand]);

  React.useEffect(() => {
    if (conditionTouchedRef.current) return;
    if (variants.length || queuedVariants.length) return;
    if (
      isHotWheelsShipClass(shipClassFromBrand(brand)) &&
      condition === "unsealed"
    ) {
      setCondition("sealed");
    }
  }, [brand, condition, queuedVariants.length, variants.length]);

  React.useEffect(() => {
    applyDefaultCostForShipClass(shipClass);
  }, [shipClass]);

  React.useEffect(() => {
    if (!filteredBrandSuggestions.length) {
      setBrandSuggestionIndex(-1);
      return;
    }
    setBrandSuggestionIndex((prev) =>
      prev >= filteredBrandSuggestions.length ? filteredBrandSuggestions.length - 1 : prev
    );
  }, [filteredBrandSuggestions.length]);

  React.useEffect(() => {
    void loadValuations();
    void loadBarcodeLogs();
    void loadProtectorStock();
    void loadBrandSuggestions();
  }, []);

  React.useEffect(() => {
    if (inventoryView !== "scheduled") return;
    void loadScheduledPostingItems();
  }, [inventoryView]);

  React.useEffect(() => {
    if (!focusAfterSaveRef.current) return;
    focusAfterSaveRef.current = false;
    window.scrollTo({ top: 0, behavior: "auto" });
    focusBarcodeInput({ preventScroll: false });
  });

  React.useEffect(() => {
    if (!compactAddMode) return;
    setShowAllSearchResults(false);
  }, [search, results.length, compactAddMode]);

  function handleVariantConditionChange(next: VariantCondition) {
    conditionTouchedRef.current = true;
    const leavingNearMint =
      isNearMintCondition(condition) &&
      publicNotes.trim() === "Near Mint Condition" &&
      !isNearMintCondition(next);
    setCondition(next);
    if (isNearMintCondition(next) && !publicNotes.trim()) {
      setPublicNotes("Near Mint Condition");
    } else if (leavingNearMint) {
      setPublicNotes("");
    }
    if (isBlisterCondition(next)) {
      setShipClass("BLISTER");
    } else if (isLoosePackagingCondition(next)) {
      setShipClass("LOOSE_NO_BOX");
    } else if (shipClass === "BLISTER" || shipClass === "LOOSE_NO_BOX") {
      setShipClass(shipClassFromBrand(brand));
    }
  }

  async function loadValuations() {
    try {
      setValuationLoading(true);
      setValuationError(null);

      const [
        activeRes,
        allRes,
        activeHealthRes,
        allHealthRes,
        unitCountRes,
      ] = await Promise.all([
        supabase.rpc("fn_admin_inventory_valuation", {
          include_archived: false,
        }),
        supabase.rpc("fn_admin_inventory_valuation", {
          include_archived: true,
        }),
        supabase.rpc("fn_admin_inventory_stock_health", {
          include_archived: false,
        }),
        supabase.rpc("fn_admin_inventory_stock_health", {
          include_archived: true,
        }),
        supabase
          .from("product_variants")
          .select("qty,release_at,product:products!inner(is_active)")
          .gt("qty", 0),
      ]);

      if (
        activeRes.error ||
        allRes.error ||
        activeHealthRes.error ||
        allHealthRes.error ||
        unitCountRes.error
      ) {
        const msg = [
          activeRes.error?.message
            ? `Active valuation: ${activeRes.error.message}`
            : null,
          allRes.error?.message ? `All valuation: ${allRes.error.message}` : null,
          activeHealthRes.error?.message
            ? `Active stock health: ${activeHealthRes.error.message}`
            : null,
          allHealthRes.error?.message
            ? `All stock health: ${allHealthRes.error.message}`
            : null,
          unitCountRes.error?.message
            ? `Inventory unit count: ${unitCountRes.error.message}`
            : null,
        ]
          .filter(Boolean)
          .join(" | ");
        setValuationError(msg || "Failed to load inventory analytics.");
      }

      const liveUnitCounts = unitCountRes.error
        ? null
        : countLiveInventoryUnitsFromRows(
            (unitCountRes.data as LiveUnitCountRow[] | null) ?? []
          );
      const activeValuationParsed = parseValuation(activeRes.data);
      const allValuationParsed = parseValuation(allRes.data);

      if (!activeRes.error) {
        setValuationActive(
          activeValuationParsed
            ? {
                ...activeValuationParsed,
                units: liveUnitCounts?.activeUnits ?? activeValuationParsed.units,
              }
            : null
        );
      } else {
        setValuationActive(null);
      }
      if (!allRes.error) {
        setValuationAll(
          allValuationParsed
            ? {
                ...allValuationParsed,
                units: liveUnitCounts?.allUnits ?? allValuationParsed.units,
              }
            : null
        );
      } else {
        setValuationAll(null);
      }
      if (!activeHealthRes.error) {
        setStockHealthActive(parseStockHealth(activeHealthRes.data));
      } else {
        setStockHealthActive(null);
      }
      if (!allHealthRes.error) {
        setStockHealthAll(parseStockHealth(allHealthRes.data));
      } else {
        setStockHealthAll(null);
      }
    } catch (error) {
      setValuationActive(null);
      setValuationAll(null);
      setStockHealthActive(null);
      setStockHealthAll(null);
      setValuationError(
        error instanceof Error
          ? error.message || "Failed to load inventory analytics."
          : "Failed to load inventory analytics."
      );
    } finally {
      setValuationLoading(false);
    }
  }

  const loadWorthMovement = React.useCallback(async () => {
    const startDate = new Date(`${worthMovementFrom}T00:00:00`);
    const endDate = new Date(`${worthMovementTo}T23:59:59`);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate.getTime() < startDate.getTime()
    ) {
      setWorthMovementPoints([]);
      setWorthMovementError("Choose a valid date range.");
      return;
    }

    try {
      setWorthMovementLoading(true);
      setWorthMovementError(null);

      const { data: movementData, error: movementError } = await supabase
        .from("variant_stock_movements")
        .select("variant_id,qty_delta,recorded_at")
        .gte("recorded_at", `${worthMovementFrom}T00:00:00`)
        .lte("recorded_at", `${worthMovementTo}T23:59:59`)
        .order("recorded_at", { ascending: true })
        .limit(20000);

      if (movementError) throw movementError;

      const movements = (movementData as VariantMovementRow[] | null) ?? [];
      if (!movements.length) {
        setWorthMovementPoints([]);
        return;
      }

      const variantIds = Array.from(
        new Set(
          movements
            .map((row) => String(row.variant_id ?? "").trim())
            .filter(Boolean)
        )
      );

      const variantMap = new Map<string, VariantWorthRow>();
      if (variantIds.length) {
        const { data: variantData, error: variantError } = await supabase
          .from("product_variants")
          .select("id,cost,price,product_id,product:products!inner(is_active)")
          .in("id", variantIds)
          .limit(20000);

        if (variantError) throw variantError;

        ((variantData as unknown as VariantWorthRow[] | null) ?? []).forEach((row) => {
          if (row?.id) variantMap.set(String(row.id), row);
        });
      }

      const byDate = new Map<string, InventoryWorthMovementPoint>();

      for (const movement of movements) {
        const variantId = String(movement.variant_id ?? "").trim();
        const variant = variantMap.get(variantId);
        if (!variant) continue;
        const productIsActive = Array.isArray(variant.product)
          ? variant.product[0]?.is_active
          : variant.product?.is_active;
        if (!includeArchived && !productIsActive) continue;

        const recordedAt = movement.recorded_at ? new Date(movement.recorded_at) : null;
        if (!recordedAt || Number.isNaN(recordedAt.getTime())) continue;

        const key = ymd(recordedAt);
        const qtyDelta = Number(movement.qty_delta ?? 0);
        const retailPrice = Number(variant.price ?? 0);
        const rawCost = variant.cost == null ? null : Number(variant.cost);
        const effectiveCost = rawCost == null ? (assumeZeroCost ? 0 : null) : rawCost;

        const current = byDate.get(key) ?? {
          date: key,
          retail: 0,
          cost: 0,
          profit: 0,
          units: 0,
        };

        current.units += qtyDelta;
        current.retail += qtyDelta * (Number.isFinite(retailPrice) ? retailPrice : 0);
        if (effectiveCost != null && Number.isFinite(effectiveCost)) {
          current.cost += qtyDelta * effectiveCost;
          current.profit += qtyDelta * ((Number.isFinite(retailPrice) ? retailPrice : 0) - effectiveCost);
        }

        byDate.set(key, current);
      }

      const points = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
      setWorthMovementPoints(points);
    } catch (error) {
      setWorthMovementPoints([]);
      setWorthMovementError(
        error instanceof Error
          ? error.message || "Failed to load inventory worth movement."
          : "Failed to load inventory worth movement."
      );
    } finally {
      setWorthMovementLoading(false);
    }
  }, [assumeZeroCost, includeArchived, worthMovementFrom, worthMovementTo]);

  React.useEffect(() => {
    if (inventoryView !== "insights") return;
    void loadValuations();
    void loadWorthMovement();
  }, [inventoryView, loadWorthMovement]);

  async function loadBarcodeLogs() {
    setBarcodeLogsLoading(true);
    setBarcodeLogsError(null);

    const { data, error } = await supabase
      .from("barcode_logs")
      .select("id,created_at,product_id,product_title,description,barcode")
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      setBarcodeLogsError(error.message || "Failed to load barcode log.");
      setBarcodeLogs([]);
    } else {
      setBarcodeLogs((data as BarcodeLog[]) ?? []);
    }

    setBarcodeLogsLoading(false);
  }

  async function loadProtectorStock() {
    setProtectorStockLoading(true);
    setProtectorStockMsg(null);
    const { data, error } = await supabase
      .from("settings")
      .select("protector_stock, protector_stock_mainline, protector_stock_premium")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      toast({
        intent: "error",
        message: error.message || "Failed to load protector stock.",
      });
      setProtectorStockLoading(false);
      return;
    }

    const fallback = Number((data as any)?.protector_stock ?? 0);
    const mainline = Number(
      (data as any)?.protector_stock_mainline ?? fallback
    );
    const premium = Number(
      (data as any)?.protector_stock_premium ?? fallback
    );

    setProtectorStockMainline(
      Number.isFinite(mainline) ? String(Math.max(0, Math.trunc(mainline))) : "0"
    );
    setProtectorStockPremium(
      Number.isFinite(premium) ? String(Math.max(0, Math.trunc(premium))) : "0"
    );
    setProtectorStockLoading(false);
  }

  async function loadBrandSuggestions() {
    const [{ data: productRows, error: productError }, { data: brandTabRows, error: brandTabError }] =
      await Promise.all([
        supabase
          .from("products")
          .select("brand")
          .not("brand", "is", null)
          .limit(1000),
        supabase
          .from("brand_tabs")
          .select("name")
          .limit(200),
      ]);

    if (productError) {
      console.error("Failed to load product brand suggestions", productError);
    }
    if (brandTabError) {
      console.error("Failed to load brand tab suggestions", brandTabError);
    }

    const productBrands = ((productRows as Array<{ brand?: string | null }> | null) ?? []).map(
      (row) => row.brand ?? null
    );
    const brandTabNames = ((brandTabRows as Array<{ name?: string | null }> | null) ?? []).map(
      (row) => row.name ?? null
    );

    setBrandSuggestions((prev) =>
      mergeBrandSuggestions(prev, [
        ...productBrands,
        ...brandTabNames,
        ...DEFAULT_BRAND_SUGGESTIONS,
      ])
    );
  }

  async function saveProtectorStock() {
    if (protectorStockSaving) return;
    setProtectorStockSaving(true);
    setProtectorStockMsg(null);
    const mainlineRaw = Number(protectorStockMainline);
    const premiumRaw = Number(protectorStockPremium);
    const mainlineValue = Number.isFinite(mainlineRaw)
      ? Math.max(0, Math.trunc(mainlineRaw))
      : 0;
    const premiumValue = Number.isFinite(premiumRaw)
      ? Math.max(0, Math.trunc(premiumRaw))
      : 0;

    const { error } = await supabase
      .from("settings")
      .update({
        protector_stock_mainline: mainlineValue,
        protector_stock_premium: premiumValue,
        protector_stock: mainlineValue + premiumValue,
      })
      .eq("id", 1);

    if (error) {
      toast({
        intent: "error",
        message: error.message || "Failed to save protector stock.",
      });
    } else {
      setProtectorStockMsg("Protector stock updated.");
      setProtectorStockMainline(String(mainlineValue));
      setProtectorStockPremium(String(premiumValue));
    }
    setProtectorStockSaving(false);
  }

  async function loadScheduledPostingItems() {
    setScheduledPostingLoading(true);
    setScheduledPostingError(null);
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("product_variants")
        .select(
          "id,product_id,condition,qty,price,ship_class,barcode,release_at,product:products(id,title,brand,model,variation,special_tags,image_urls,is_active,created_at)"
        )
        .gt("qty", 0)
        .gt("release_at", nowIso)
        .order("release_at", { ascending: true })
        .limit(500);

      if (error) throw error;

      const nextItems = ((data as any[] | null) ?? [])
        .map((row) => {
          const productRaw = Array.isArray(row?.product)
            ? row.product[0] ?? null
            : row?.product ?? null;
          return {
            id: String(row?.id ?? ""),
            product_id: String(row?.product_id ?? ""),
            condition: row?.condition as VariantCondition,
            qty: Number(row?.qty ?? 0),
            price:
              row?.price === null || typeof row?.price === "undefined"
                ? null
                : Number(row.price),
            ship_class: row?.ship_class ? String(row.ship_class) : null,
            barcode: row?.barcode ? String(row.barcode) : null,
            release_at: row?.release_at ? String(row.release_at) : null,
            product: productRaw ? (productRaw as Product) : null,
          } satisfies ScheduledPostingItem;
        })
        .filter((item) => item.product?.is_active !== false);
      setScheduledPostingItems(nextItems);
    } catch (error: any) {
      setScheduledPostingError(
        error?.message ?? "Failed to load scheduled posting items."
      );
      setScheduledPostingItems([]);
    } finally {
      setScheduledPostingLoading(false);
    }
  }

  async function runSearch() {
    const q = search.trim();
    if (!q) return;

    const ilike = `%${q}%`;

    // Search products by identity AND variants by barcode, then merge by product id
    const [{ data: pData, error: pErr }, { data: vData, error: vErr }] =
      await Promise.all([
        supabase
          .from("products")
          .select("*")
          .or(
            `title.ilike.${ilike},brand.ilike.${ilike},model.ilike.${ilike},variation.ilike.${ilike}`
          )
          .order("created_at", { ascending: false })
          .limit(20),

        supabase
          .from("product_variants")
          .select(
            "product:products(*)"
          )
          .ilike("barcode", ilike)
          .limit(20),
      ]);

    if (pErr) console.error(pErr);
    if (vErr) console.error(vErr);

    const merged: Product[] = [];
    const seen = new Set<string>();

    (pData as any[] | null)?.forEach((p) => {
      if (!p?.id || seen.has(p.id)) return;
      seen.add(p.id);
      merged.push(p as any);
    });

    (vData as any[] | null)?.forEach((row) => {
      const p = row?.product;
      if (!p?.id || seen.has(p.id)) return;
      seen.add(p.id);
      merged.push(p as any);
    });

    setResults(merged);
  }

  async function loadProduct(
    p: Product,
    options?: { focusBarcode?: boolean }
  ) {
    conditionTouchedRef.current = false;
    priceTouchedRef.current = false;
    titleEditedRef.current = false;
    lastAutoTitleRef.current = "";
    lastAutoIdentityRef.current = { brand: "", model: "", variation: "" };
    setSelectedProduct(p);
    setTitle(p.title ?? "");
    setBrand(p.brand ?? "");
    setBrandSuggestions((prev) => mergeBrandSuggestions(prev, [p.brand ?? null]));
    setModel(p.model ?? "");
    setVariation(p.variation ?? "");
    setSpecialTags(normalizeProductSpecialTags(p.special_tags));
    setImages(Array.isArray(p.image_urls) ? p.image_urls : []);
    setSelectedImages({});
    setLookupMsg(null);
    setQueuedVariants([]);
    setSavingVariantIds({});
    setAddQtyByVariant({});
    setRescheduleLiveVariants(false);
    setPublishScheduledNow(false);
    setLoadingVariants(true);
    const { data, error } = await supabase
      .from("product_variants")
      .select(
        "id,product_id,condition,issue_notes,issue_photo_urls,public_notes,cost,price,qty,ship_class,barcode,created_at,release_at"
      )
      .eq("product_id", p.id)
      .order("created_at", { ascending: false });

    setLoadingVariants(false);

    if (error) {
      console.error(error);
      setVariants([]);
      return;
    }
    const loaded = (data as any) ?? [];
    setVariants(loaded);
    applyVariantDefaultsFromExisting(loaded, p.brand ?? "");
    if (options?.focusBarcode ?? true) {
      focusBarcodeInput();
    }
  }

  async function loadProductById(productId: string) {
    if (!productId) return;
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .maybeSingle();

    if (error || !data) {
      toast({
        intent: "error",
        message: "Product not found for this match.",
      });
      return;
    }

    await loadProduct(data as Product);
    productEditorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function openProductForQuickVariantMode(
    product: Product,
    mode: "existing" | "new"
  ) {
    setShowExistingVariants(mode === "existing");
    await loadProduct(product, { focusBarcode: false });

    requestAnimationFrame(() => {
      const target =
        mode === "existing"
          ? existingVariantsSectionRef.current
          : newVariantSectionRef.current;
      target?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function openScheduledPostingItem(item: ScheduledPostingItem) {
    if (!item.product) return;
    setInventoryView("editor");
    await loadProduct(item.product, { focusBarcode: false });
    requestAnimationFrame(() => {
      productEditorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function syncVariantQtyIfSelected(
    productId: string,
    variantId: string,
    qtyValue: number
  ) {
    if (selectedProduct?.id !== productId) return;
    setVariants((prev) =>
      prev.map((variant) =>
        variant.id === variantId ? { ...variant, qty: qtyValue } : variant
      )
    );
  }

  function updateVariantDraft(variantId: string, patch: Partial<Variant>) {
    setVariants((prev) =>
      prev.map((variant) =>
        variant.id === variantId ? { ...variant, ...patch } : variant
      )
    );
  }

  function upsertVariantIfSelected(productId: string, nextVariant: Variant) {
    if (selectedProduct?.id !== productId) return;
    setVariants((prev) => [
      nextVariant,
      ...prev.filter((variant) => variant.id !== nextVariant.id),
    ]);
  }

  async function addToExistingVariantFromBarcodePrompt() {
    if (!existingBarcodePrompt) return;
    const target =
      existingBarcodePrompt.matches.find((v) => v.id === existingBarcodeVariantId) ??
      existingBarcodePrompt.matches[0];
    if (!target) return;

    const delta = Math.trunc(n(existingBarcodeAddQty, NaN));
    if (!Number.isFinite(delta) || delta <= 0) {
      toast({ intent: "error", message: "Enter a valid quantity to add." });
      return;
    }

    setExistingBarcodeActionLoading(true);
    try {
      const nextQty = Math.max(0, Math.trunc(n(target.qty, 0)) + delta);
      const nextReleaseAt = getNextVariantReleaseAt(
        target,
        resolveScheduledReleaseAt()
      );
      const { error } = await supabase
        .from("product_variants")
        .update({ qty: nextQty, release_at: nextReleaseAt })
        .eq("id", target.id);
      if (error) throw error;

      if (selectedProduct?.id === target.product_id) {
        updateVariantDraft(target.id, {
          qty: nextQty,
          release_at: nextReleaseAt,
        });
      }
      setVariantBarcode(existingBarcodePrompt.barcode);
      setLookupMsg(
        `Added ${delta} unit${delta === 1 ? "" : "s"} to existing variant.`
      );
      toast({
        intent: "success",
        message: `Existing variant updated (+${delta}).`,
      });
      clearBarcodeInputAfterAdd();
      setExistingBarcodePrompt(null);
      setExistingBarcodeVariantId("");
      setExistingBarcodeAddQty("1");
      focusBarcodeInput();
    } catch (e: any) {
      toast({ intent: "error", message: e?.message ?? "Update failed." });
    } finally {
      setExistingBarcodeActionLoading(false);
    }
  }

  async function buildDuplicatePromptVariantPayload(fallbackBarcode: string) {
    if (!cost || !price || !qty) {
      throw new Error("Cost, price, and quantity are required for a new variant.");
    }

    const costN = n(cost, NaN);
    const priceN = n(price, NaN);
    const qtyN = Math.trunc(n(qty, NaN));
    if (!Number.isFinite(costN) || !Number.isFinite(priceN)) {
      throw new Error("Enter valid cost and selling price.");
    }
    if (!Number.isFinite(qtyN) || qtyN < 0) {
      throw new Error("Enter a valid quantity.");
    }
    if (condition === "with_issues" && !publicNotes.trim()) {
      throw new Error("Notes are required for with issues.");
    }

    let generatedBarcode: string | null = null;
    let barcodeValue =
      normalizeBarcode(variantBarcode) || normalizeBarcode(fallbackBarcode) || "";
    if (!barcodeValue) {
      barcodeValue = await generateUniqueBarcode();
      generatedBarcode = barcodeValue;
    }

    const notesValue = publicNotes.trim();
    const resolvedNotes =
      isNearMintCondition(condition)
        ? notesValue || "Near Mint Condition"
        : notesValue || null;

    return {
      payload: {
        condition,
        public_notes: resolvedNotes,
        issue_notes: null,
        issue_photo_urls:
          supportsIssueDetailCondition(condition) && issuePhotos.length
            ? issuePhotos
            : null,
        cost: costN,
        price: priceN,
        qty: qtyN,
        ship_class: shipClass,
        barcode: barcodeValue,
        release_at: resolveScheduledReleaseAt(),
      },
      barcodeValue,
      generatedBarcode,
    };
  }

  async function createNewVariantFromBarcodePrompt() {
    if (!existingBarcodePrompt) return;
    const target =
      existingBarcodePrompt.matches.find((v) => v.id === existingBarcodeVariantId) ??
      existingBarcodePrompt.matches[0];
    if (!target) return;

    setExistingBarcodeActionLoading(true);
    try {
      const { payload, barcodeValue, generatedBarcode } =
        await buildDuplicatePromptVariantPayload(existingBarcodePrompt.barcode);

      const { data: createdVariant, error } = await supabase
        .from("product_variants")
        .insert({
          product_id: target.product_id,
          ...payload,
        })
        .select(
          "id,product_id,condition,issue_notes,issue_photo_urls,public_notes,cost,price,qty,ship_class,barcode,created_at,release_at"
        )
        .single();
      if (error) throw error;

      if (generatedBarcode) {
        await recordGeneratedBarcode(
          target.product_id,
          generatedBarcode,
          condition,
          target.product?.title ?? undefined
        );
      }

      if (createdVariant) {
        upsertVariantIfSelected(target.product_id, createdVariant as Variant);
      }
      setVariantBarcode(barcodeValue);
      setLookupMsg("New variant created for this existing product.");
      toast({ intent: "success", message: "New variant created." });
      clearBarcodeInputAfterAdd();
      setExistingBarcodePrompt(null);
      setExistingBarcodeVariantId("");
      setExistingBarcodeAddQty("1");
      focusBarcodeInput();
    } catch (e: any) {
      toast({ intent: "error", message: e?.message ?? "Failed to create variant." });
    } finally {
      setExistingBarcodeActionLoading(false);
    }
  }

  async function createNewProductCardFromBarcodePrompt() {
    if (!existingBarcodePrompt) return;
    const normalizedTitle = normalizeTitleBrandAliases(newCardTitle).trim();
    if (!normalizedTitle) {
      toast({ intent: "error", message: "Product title is required." });
      return;
    }

    setExistingBarcodeActionLoading(true);
    try {
      const { payload, barcodeValue, generatedBarcode } =
        await buildDuplicatePromptVariantPayload(existingBarcodePrompt.barcode);

      const normalizedBrand = normalizeBrandAlias(newCardBrand) ?? newCardBrand.trim();
      const normalizedModel = newCardModel.trim();
      const normalizedVariation = newCardVariation.trim();
      const seedImages =
        selectedExistingBarcodeMatch?.product?.image_urls &&
        selectedExistingBarcodeMatch.product.image_urls.length
          ? selectedExistingBarcodeMatch.product.image_urls
          : [];

      const { data: createdProduct, error: productError } = await supabase
        .from("products")
        .insert({
          title: normalizedTitle,
          brand: normalizedBrand || null,
          model: normalizedModel || null,
          variation: normalizedVariation || null,
          image_urls: seedImages,
          is_active: true,
        })
        .select("*")
        .single();
      if (productError || !createdProduct) {
        throw productError ?? new Error("Failed to create product card.");
      }

      const { error: variantError } = await supabase
        .from("product_variants")
        .insert({
          product_id: String(createdProduct.id),
          ...payload,
        });
      if (variantError) throw variantError;

      if (generatedBarcode) {
        await recordGeneratedBarcode(
          String(createdProduct.id),
          generatedBarcode,
          condition,
          normalizedTitle,
          [normalizedBrand, normalizedModel, normalizedVariation]
            .filter(Boolean)
            .join(" ")
        );
      }

      await loadProduct(createdProduct as Product);
      setVariantBarcode(barcodeValue);
      setSearch(normalizedTitle);
      setLookupMsg("Created a new product card and variant.");
      toast({ intent: "success", message: "New product card created." });
      clearBarcodeInputAfterAdd();
      setExistingBarcodePrompt(null);
      setExistingBarcodeVariantId("");
      setExistingBarcodeAddQty("1");
      setNewCardTitle("");
      setNewCardBrand("");
      setNewCardModel("");
      setNewCardVariation("");
      focusBarcodeInput();
    } catch (e: any) {
      toast({
        intent: "error",
        message: e?.message ?? "Failed to create product card.",
      });
    } finally {
      setExistingBarcodeActionLoading(false);
    }
  }

  function clearProduct() {
    conditionTouchedRef.current = false;
    costTouchedRef.current = false;
    priceTouchedRef.current = false;
    titleEditedRef.current = false;
    lastAutoTitleRef.current = "";
    lastAutoIdentityRef.current = { brand: "", model: "", variation: "" };
    setSelectedProduct(null);
    setTitle("");
    setBrand("");
    setModel("");
    setVariation("");
    setSpecialTags([]);
    setImages([]);
    setSelectedImages({});
    setVariants([]);
    setProductUrl("");
    setProductUrlMsg(null);
    resetBarcodeLookup();
    setManualImageUrl("");
    setQueuedVariants([]);
    setRescheduleLiveVariants(false);
    setPublishScheduledNow(false);

    // also clear variant draft
    const nextShipClass = shipClassFromBrand("");
    setCondition(defaultConditionForBrand(""));
    setPublicNotes("");
    setIssuePhotos([]);
    setIssuePhotosUploading(false);
    setIssuePhotosUploadingId(null);
    applyDefaultCostForShipClass(nextShipClass, {
      force: true,
      currentCost: "",
    });
    setQty("1");
    setShipClass(nextShipClass);
    setVariantBarcode("");
  }

  function clearFieldsForBarcodeLookup() {
    conditionTouchedRef.current = false;
    costTouchedRef.current = false;
    priceTouchedRef.current = false;
    titleEditedRef.current = false;
    lastAutoTitleRef.current = "";
    lastAutoIdentityRef.current = { brand: "", model: "", variation: "" };
    setSearch("");
    setResults([]);
    setShowAllSearchResults(false);
    setSelectedProduct(null);
    setTitle("");
    setBrand("");
    setModel("");
    setVariation("");
    setSpecialTags([]);
    setImages([]);
    setSelectedImages({});
    setCropEditor(null);
    setVariants([]);
    setSavingVariantIds({});
    setAddQtyByVariant({});
    setProductUrl("");
    setProductUrlMsg(null);
    setManualImageUrl("");
    setQueuedVariants([]);
    setLookupMsg(null);
    setExistingBarcodePrompt(null);
    setExistingBarcodeVariantId("");
    setExistingBarcodeAddQty("1");
    setRescheduleLiveVariants(false);
    setPublishScheduledNow(false);
    setNewCardTitle("");
    setNewCardBrand("");
    setNewCardModel("");
    setNewCardVariation("");

    const nextShipClass = shipClassFromBrand("");
    setCondition(defaultConditionForBrand(""));
    setPublicNotes("");
    setIssuePhotos([]);
    setIssuePhotosUploading(false);
    setIssuePhotosUploadingId(null);
    applyDefaultCostForShipClass(nextShipClass, {
      force: true,
      currentCost: "",
    });
    setQty("1");
    setShipClass(nextShipClass);
    setVariantBarcode("");
  }

  function buildVariantDraft(): VariantDraft {
    return {
      id: crypto.randomUUID(),
      condition,
      publicNotes,
      issuePhotos: [...issuePhotos],
      cost,
      price,
      qty,
      shipClass,
      variantBarcode,
    };
  }

  function isDraftEmpty(draft: VariantDraft) {
    return (
      !draft.cost &&
      !draft.price &&
      !draft.variantBarcode &&
      !draft.publicNotes.trim() &&
      draft.issuePhotos.length === 0
    );
  }

  function resetVariantDraft() {
    conditionTouchedRef.current = false;
    costTouchedRef.current = false;
    priceTouchedRef.current = false;
    const nextShipClass = shipClassFromBrand(brand);
    setCondition(defaultConditionForBrand(brand));
    setPublicNotes("");
    setIssuePhotos([]);
    setIssuePhotosUploading(false);
    setIssuePhotosUploadingId(null);
    applyDefaultCostForShipClass(nextShipClass, {
      force: true,
      currentCost: "",
    });
    setQty("1");
    setShipClass(nextShipClass);
    setVariantBarcode("");
  }

  function resolveScheduledReleaseAt() {
    if (!scheduleReleaseEnabled) return null;
    const scheduledReleaseAt = datetimeLocalToIso(scheduledReleaseAtInput);
    if (!scheduledReleaseAt) {
      throw new Error("Choose a release date and time, or turn scheduling off.");
    }
    if (new Date(scheduledReleaseAt).getTime() <= Date.now()) {
      throw new Error(
        "Release time must be in the future. Turn scheduling off to publish immediately."
      );
    }
    return scheduledReleaseAt;
  }

  function getNextVariantReleaseAt(
    variant: Pick<Variant, "qty" | "release_at">,
    scheduledReleaseAt: string | null
  ) {
    let nextReleaseAt = variant.release_at ?? null;

    if (scheduledReleaseAt) {
      return scheduledReleaseAt;
    }

    if (publishScheduledNow && isScheduledRelease(variant.release_at)) {
      nextReleaseAt = null;
    }

    return nextReleaseAt;
  }

  async function applyScheduledReleaseToExistingVariants(
    currentVariants: Variant[],
    scheduledReleaseAt: string | null
  ) {
    const updates = currentVariants
      .map((variant) => ({
        id: variant.id,
        currentReleaseAt: variant.release_at ?? null,
        nextReleaseAt: getNextVariantReleaseAt(variant, scheduledReleaseAt),
      }))
      .filter((variant) => variant.currentReleaseAt !== variant.nextReleaseAt);

    if (!updates.length) return;

    const results = await Promise.all(
      updates.map((variant) =>
        supabase
          .from("product_variants")
          .update({ release_at: variant.nextReleaseAt })
          .eq("id", variant.id)
      )
    );

    const failed = results.find((result) => result.error);
    if (failed?.error) {
      throw failed.error;
    }
  }

  function resetBarcodeLookup() {
    setBarcodeLookup("");
    setLookupMsg(null);
    setExistingBarcodePrompt(null);
    setExistingBarcodeVariantId("");
    setExistingBarcodeAddQty("1");
    setNewCardTitle("");
    setNewCardBrand("");
    setNewCardModel("");
    setNewCardVariation("");
    lastAutoLookupRef.current = "";
    if (barcodeLookupTimerRef.current) {
      clearTimeout(barcodeLookupTimerRef.current);
      barcodeLookupTimerRef.current = null;
    }
  }

  function openExistingBarcodePrompt(
    barcode: string,
    matches: ExistingBarcodeMatch[]
  ) {
    if (!matches.length) return;
    const baseMatch = matches[0];
    const baseProduct = baseMatch.product;
    setExistingBarcodePrompt({ barcode, matches });
    setExistingBarcodeVariantId(baseMatch.id);
    setExistingBarcodeAddQty("1");
    setVariantBarcode(barcode);
    setShipClass(
      (baseMatch.ship_class as ShipClass | null) ??
        shipClassFromBrand(baseProduct?.brand ?? brand)
    );
    setNewCardTitle(title.trim() || baseProduct?.title || "");
    setNewCardBrand(brand.trim() || baseProduct?.brand || "");
    setNewCardModel(model.trim() || baseProduct?.model || "");
    setNewCardVariation(variation.trim() || baseProduct?.variation || "");
  }

  function closeExistingBarcodePrompt() {
    if (existingBarcodeActionLoading) return;
    setExistingBarcodePrompt(null);
    setExistingBarcodeVariantId("");
    setExistingBarcodeAddQty("1");
    setNewCardTitle("");
    setNewCardBrand("");
    setNewCardModel("");
    setNewCardVariation("");
  }

  const conditionCycle: VariantCondition[] = [
    "unsealed",
    "unsealed_no_box",
    "unsealed_no_acrylic",
    "unsealed_incomplete",
    "unsealed_near_mint_box",
    "wheelswapped",
    "customized",
    "sealed",
    "with_issues",
    "resealed",
    "near_mint",
    "sealed_near_mint_box",
    "sealed_not_mint_box",
    "sealed_blister",
    "sealed_near_mint_blister",
    "sealed_not_mint_blister",
    "unsealed_blister",
    "unsealed_near_mint_blister",
    "blistered",
  ];

  function nextCondition(current: VariantCondition) {
    const idx = conditionCycle.indexOf(current);
    if (idx === -1) return conditionCycle[0];
    return conditionCycle[(idx + 1) % conditionCycle.length];
  }

  function queueVariantDraft() {
    if (saving) return;
    if (!cost || !price || !qty) {
      toast({
        intent: "error",
        message: "Complete cost, price, and quantity first.",
      });
      return;
    }
    setQueuedVariants((prev) => [...prev, buildVariantDraft()]);
    setCondition(nextCondition(condition));
    applySuggestedPriceFromCost(cost, {
      force: true,
      currentPrice: "",
    });
    setQty("1");
  }

  function saveQueuedVariants(options?: { printBarcodes?: boolean }) {
    if (saving || printingBarcodeLabels) return;
    const currentDraft = buildVariantDraft();
    const drafts = isDraftEmpty(currentDraft)
      ? queuedVariants
      : [...queuedVariants, currentDraft];
    if (!drafts.length) {
      toast({ intent: "error", message: "Add a variant before saving." });
      return;
    }
    saveNewVariant({
      keepProduct: true,
      drafts,
      reloadAfterSave: true,
      printBarcodes: Boolean(options?.printBarcodes),
    });
  }

  async function tryQuickAddFromBarcodeMatches(
    code: string,
    matches: ExistingBarcodeMatch[]
  ) {
    if (!quickAddEnabled || !matches.length) return false;
    const delta = Math.trunc(n(quickAddQty, NaN));
    if (!Number.isFinite(delta) || delta <= 0) {
      toast({ intent: "error", message: "Quick Add quantity must be at least 1." });
      setQuickAddConfigOpen(true);
      return false;
    }

    const preferred =
      quickAddCondition === "any"
        ? matches[0]
        : matches.find((m) => m.condition === quickAddCondition) ?? null;
    if (!preferred) {
      if (quickAddCondition !== "any") {
        openExistingBarcodePrompt(code, matches);
        handleVariantConditionChange(quickAddCondition);
        setShipClass(
          (matches[0]?.ship_class as ShipClass | null) ??
            shipClassFromBrand(matches[0]?.product?.brand ?? brand)
        );
        setLookupMsg(
          `Quick Add did not find ${formatConditionLabel(
            quickAddCondition
          )}. Create a new variant in the popup.`
        );
        toast({
          intent: "error",
          message: `${formatConditionLabel(
            quickAddCondition
          )} variation not found. Create new variant.`,
        });
        return true;
      }
      return false;
    }

    const now = Date.now();
    if (quickAddRecentRef.current.size > 300) {
      const cutoff = now - 60_000;
      quickAddRecentRef.current.forEach((value, key) => {
        if (value < cutoff) quickAddRecentRef.current.delete(key);
      });
    }
    const actionKey = `${preferred.id}:${delta}:${code}`;
    const recentAt = quickAddRecentRef.current.get(actionKey) ?? 0;
    if (quickAddInFlightRef.current.has(actionKey)) {
      return true;
    }
    if (now - recentAt < 1200) {
      return true;
    }

    quickAddInFlightRef.current.add(actionKey);
    setQuickAddBusy(true);
    try {
      const nextQty = Math.max(0, Math.trunc(n(preferred.qty, 0)) + delta);
      const nextReleaseAt = getNextVariantReleaseAt(
        preferred,
        resolveScheduledReleaseAt()
      );
      const { error } = await supabase
        .from("product_variants")
        .update({ qty: nextQty, release_at: nextReleaseAt })
        .eq("id", preferred.id);
      if (error) throw error;

      if (selectedProduct?.id === preferred.product_id) {
        updateVariantDraft(preferred.id, {
          qty: nextQty,
          release_at: nextReleaseAt,
        });
      }
      setVariantBarcode(code);
      const conditionLabel = formatConditionLabel(preferred.condition, {
        upper: true,
      });
      setLookupMsg(
        `Quick add applied: +${delta} to ${conditionLabel}.`
      );
      toast({
        intent: "success",
        message: `Quick add +${delta} (${conditionLabel}).`,
      });
      quickAddRecentRef.current.set(actionKey, Date.now());
      clearBarcodeInputAfterAdd();
      focusBarcodeInput();
      return true;
    } catch (e: any) {
      toast({ intent: "error", message: e?.message ?? "Quick add failed." });
      return false;
    } finally {
      quickAddInFlightRef.current.delete(actionKey);
      setQuickAddBusy(false);
    }
  }

  async function lookupBarcode(override?: string) {
    const code = normalizeBarcode(override ?? barcodeLookup);
    if (!code) return;

    clearFieldsForBarcodeLookup();
    setBarcodeLookup(code);
    setLookupLoading(true);
    setLookupMsg(null);

    try {
      const { data: existingRows, error: existingError } = await supabase
        .from("product_variants")
        .select(
          "id,product_id,qty,condition,ship_class,barcode,cost,price,sale_price,discount_percent,release_at,product:products(*)"
        )
        .eq("barcode", code)
        .limit(20);
      if (existingError) throw existingError;

      const existingMatches = ((existingRows as any[]) ?? [])
        .map((row) => ({
          id: String(row?.id ?? "").trim(),
          product_id: String(row?.product_id ?? "").trim(),
          qty: Math.max(0, Math.trunc(n(row?.qty, 0))),
          condition: (row?.condition ?? "unsealed") as VariantCondition,
          ship_class: (row?.ship_class ?? null) as ShipClass | null,
          barcode: row?.barcode ? String(row.barcode) : null,
          cost:
            row?.cost == null || row?.cost === ""
              ? null
              : n(row.cost, 0),
          price: n(row?.price, 0),
          sale_price:
            row?.sale_price == null || row?.sale_price === ""
              ? null
              : n(row.sale_price, 0),
          discount_percent:
            row?.discount_percent == null || row?.discount_percent === ""
              ? null
              : n(row.discount_percent, 0),
          release_at: row?.release_at ? String(row.release_at) : null,
          product: row?.product ? (row.product as Product) : null,
        }))
        .filter((row) => row.id && row.product_id) as ExistingBarcodeMatch[];

      if (existingMatches.length) {
        if (quickAddEnabled) {
          const quickAdded = await tryQuickAddFromBarcodeMatches(code, existingMatches);
          if (quickAdded) return;
        }
        openExistingBarcodePrompt(code, existingMatches);
        setLookupMsg("Barcode already exists in inventory. Choose an action.");
        return;
      }

      const r = await fetch(
        `/api/barcode/lookup?barcode=${encodeURIComponent(code)}`
      );
      const j = await r.json();

      if (!j.ok) {
        setLookupMsg(j.error ?? "No barcode match.");
        return;
      }

      const d = j.data;

      // Barcode lookup starts from a blank editor state, so do not reuse prior values.
      const rawTitle = String(d.title ?? "");
      const normalizedTitle = properLookupCase(
        normalizeLookupTitle(rawTitle, d.brand ?? null)
      );
      const kaidoNormalized = normalizeKaidoMiniGtTitle(
        normalizedTitle || normalizeTitleBrandAliases(rawTitle),
        d.color_style ?? null
      );
      let nextTitle = "";
      let nextBrand = "";
      let nextModel = "";
      let nextVariation = "";

      if (kaidoNormalized) {
        nextTitle = resolveNormalizedTitle(
          "",
          properLookupCase(kaidoNormalized.title)
        );
        nextBrand = resolveNormalizedBrand("", kaidoNormalized.brand);
        nextModel = properLookupCase(
          normalizeLookupField(kaidoNormalized.model)
        );
        nextVariation = properLookupCase(
          normalizeLookupField(kaidoNormalized.variation)
        );
      } else {
        const titleBrand = brandFromNormalizedTitle(normalizedTitle);
        const cleanedModel = properLookupCase(normalizeLookupField(d.model));
        const cleanedVariation = properLookupCase(
          normalizeLookupField(d.color_style)
        );
        const inferred = inferFieldsFromTitle(normalizedTitle);
        const inferredModel = properLookupCase(
          normalizeLookupField(inferred.model)
        );
        const inferredVariation = properLookupCase(
          normalizeLookupField(inferred.color_style)
        );

        nextTitle = resolveNormalizedTitle("", normalizedTitle);
        nextBrand = titleBrand || resolveNormalizedBrand("", d.brand);
        if (!titleBrand) {
          nextBrand = resolveNormalizedBrand(nextBrand, inferred.brand);
        }
        nextModel = cleanedModel || inferredModel;
        nextVariation = cleanedVariation || inferredVariation;
      }

      setTitle(nextTitle);
      setBrand(nextBrand);
      setModel(nextModel);
      setVariation(nextVariation);

      // Fill images (select first 3 by default)
      const imgs = (d.images ?? []).filter(Boolean);
      if (imgs.length) {
        setImages(imgs);
        const map: Record<string, boolean> = {};
        imgs.slice(0, 3).forEach((u: string) => (map[u] = true));
        setSelectedImages(map);
      }

      // ✅ IMPORTANT: barcode lookup should prefill Variant Barcode so it gets saved.
      // Barcode belongs to product_variants, not products.
      setVariantBarcode(code);

      setLookupMsg(
        "Barcode lookup success. Review details and confirm images before saving."
      );
    } catch (e: any) {
      setLookupMsg(e?.message ?? "Lookup failed.");
    } finally {
      setLookupLoading(false);
    }
  }

  React.useEffect(() => {
    return () => {
      if (barcodeLookupTimerRef.current) {
        clearTimeout(barcodeLookupTimerRef.current);
      }
    };
  }, []);

  function focusBarcodeInput(options?: { preventScroll?: boolean }) {
    const preventScroll = options?.preventScroll ?? true;
    requestAnimationFrame(() => {
      const el = barcodeInputRef.current;
      if (!el) return;
      try {
        el.focus({ preventScroll });
      } catch {
        el.focus();
      }
    });
  }

  function scheduleBarcodeLookup(nextValue: string) {
    const code = nextValue.trim();
    if (!code || code.length < 6 || lookupLoading) return;
    if (code === lastAutoLookupRef.current) return;
    if (barcodeLookupTimerRef.current) {
      clearTimeout(barcodeLookupTimerRef.current);
    }
    barcodeLookupTimerRef.current = setTimeout(() => {
      if (lookupLoading) return;
      if (code === lastAutoLookupRef.current) return;
      lastAutoLookupRef.current = code;
      setBarcodeLookup(code);
      lookupBarcode(code);
    }, 200);
  }

  function clearBarcodeInputAfterAdd() {
    setBarcodeLookup("");
    lastAutoLookupRef.current = "";
    if (barcodeLookupTimerRef.current) {
      clearTimeout(barcodeLookupTimerRef.current);
      barcodeLookupTimerRef.current = null;
    }
  }

  function applyLookupResult(
    result: LookupData,
    options?: { selected?: Record<string, boolean>; applyImages?: boolean }
  ) {
    const normalizedTitle = normalizeLookupTitle(
      String(result.title ?? ""),
      result.brand ?? null
    );
    if (normalizedTitle) {
      setTitle((prev) => resolveNormalizedTitle(prev, normalizedTitle));
    }
    const titleBrand = brandFromNormalizedTitle(normalizedTitle);
    if (titleBrand) {
      setBrand(titleBrand);
    } else if (result.brand) {
      setBrand((prev) => resolveNormalizedBrand(prev, result.brand));
    }
    const cleanedModel = normalizeLookupField(result.model);
    const cleanedVariation = normalizeLookupField(result.variation);
    if (cleanedModel) setModel((prev) => (prev ? prev : cleanedModel));
    if (cleanedVariation)
      setVariation((prev) => (prev ? prev : cleanedVariation));

    if (options?.applyImages === false) return;

    const resultImages = Array.isArray(result.images)
      ? result.images.filter(Boolean)
      : [];
    if (!resultImages.length) return;

    const selected = options?.selected;
    const toAdd = selected
      ? resultImages.filter((u) => selected[u])
      : resultImages;

    if (!toAdd.length) return;

    setImages((prev) => uniq([...prev, ...toAdd]));
    setSelectedImages((prev) => {
      const next = { ...prev };
      toAdd.slice(0, 3).forEach((u) => {
        next[u] = true;
      });
      return next;
    });
  }

  async function lookupProductUrl() {
    const url = normalizeUrlInput(productUrl);
    if (!url) return;

    if (url !== productUrl.trim()) {
      setProductUrl(url);
    }

    setProductUrlLoading(true);
    setProductUrlMsg(null);

    try {
      const r = await fetch(
        `/api/product-url/lookup?url=${encodeURIComponent(url)}`
      );
      const raw = await r.text();
      let j: any = null;
      try {
        j = JSON.parse(raw);
      } catch {
        j = null;
      }

      if (!j || typeof j !== "object") {
        const statusText = `URL lookup endpoint error (${r.status}).`;
        setProductUrlMsg(statusText);
        return;
      }

      if (!j.ok) {
        setProductUrlMsg(j.error ?? "URL lookup failed.");
        return;
      }

      const d = j.data as ProductUrlLookupData;
      const rawTitle = String(d.title ?? "").trim();
      const normalizedBrand = normalizeBrandAlias(d.brand) ?? d.brand;
      const normalizedTitle = normalizeLookupTitle(
        rawTitle,
        normalizedBrand ?? d.brand ?? null
      );
      const imgs = Array.isArray(d.images)
        ? d.images.filter(Boolean).slice(0, 9)
        : [];
      const inferred = inferFieldsFromTitle(normalizedTitle || rawTitle);
      const cleanedModel = normalizeLookupField(d.model ?? inferred.model);
      const cleanedVariation = normalizeLookupField(
        d.variation ?? inferred.color_style
      );
      const normalizedResult: ProductUrlLookupData = {
        ...d,
        title: properLookupCase(normalizedTitle || d.title || rawTitle),
        brand: normalizedBrand ?? d.brand ?? inferred.brand ?? null,
        model: properLookupCase(cleanedModel) || null,
        variation: properLookupCase(cleanedVariation) || null,
        images: imgs,
        source_url: d.source_url ?? url,
      };

      // Apply URL lookup result immediately to Product Identity + images.
      applyLookupResult(normalizedResult);

      setProductUrlMsg(
        "URL lookup success. Product identity and images were updated."
      );
    } catch (e: any) {
      setProductUrlMsg(e?.message ?? "Lookup failed.");
    } finally {
      setProductUrlLoading(false);
    }
  }

  function normalizeUrlInput(value: string) {
    const raw = value.trim();
    if (!raw) return "";
    const firstIdx = raw.search(/https?:\/\//i);
    if (firstIdx === -1) return raw;
    let candidate = raw.slice(firstIdx);
    const nextIdx = candidate.toLowerCase().indexOf("http", 1);
    if (nextIdx > 0) {
      candidate = candidate.slice(0, nextIdx);
    }
    return candidate.replace(/[)\],.]+$/g, "").trim();
  }

  function resetAutoMatch() {
    setAutoMatchFiles([]);
    setAutoMatchResults([]);
    setAutoMatchMsg(null);
    setAutoMatchProgress(null);
  }

  async function runAutoMatchUpload() {
    if (!autoMatchFiles.length) {
      setAutoMatchMsg("Select image files first.");
      return;
    }

    setAutoMatchLoading(true);
    setAutoMatchMsg(null);
    setAutoMatchResults([]);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated.");

      const minConfidence = Number(autoMatchMinConfidence);
      const results: AutoMatchResult[] = [];
      const total = autoMatchFiles.length;
      setAutoMatchProgress({ current: 0, total });

      for (let i = 0; i < autoMatchFiles.length; i += 1) {
        const file = autoMatchFiles[i];
        setAutoMatchProgress({ current: i, total });

        const form = new FormData();
        form.append("file", file);
        if (Number.isFinite(minConfidence)) {
          form.append("minConfidence", String(minConfidence));
        }

        try {
          const res = await fetch("/api/images/auto-match", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });
          const raw = await res.text();
          let json: any = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            throw new Error(raw || `Upload failed (${res.status})`);
          }
          if (!json?.ok) {
            results.push({
              ok: false,
              file: file.name,
              error: json?.error ?? "Auto match failed."
            });
          } else if (Array.isArray(json?.results) && json.results.length) {
            results.push(json.results[0] as AutoMatchResult);
          } else {
            results.push({
              ok: false,
              file: file.name,
              error: "No result returned."
            });
          }
        } catch (e: any) {
          results.push({
            ok: false,
            file: file.name,
            error: e?.message ?? "Upload failed."
          });
        }
      }

      setAutoMatchProgress({ current: total, total });
      setAutoMatchResults(results);
      setAutoMatchFiles([]);

      const applied = results.filter((r) => r.status === "APPLIED").length;
      const review = results.filter((r) => r.status === "NEEDS_REVIEW").length;
      const noMatch = results.filter((r) => r.status === "NO_MATCH").length;
      const errors = results.filter(
        (r) => r.status === "ERROR" || r.ok === false
      ).length;

      setAutoMatchMsg(
        `Done. Applied ${applied}, review ${review}, no match ${noMatch}, errors ${errors}.`
      );
      void loadReviewQueue();
    } catch (e: any) {
      setAutoMatchMsg(e?.message ?? "Auto match failed.");
    } finally {
      setAutoMatchLoading(false);
      setAutoMatchProgress(null);
    }
  }

  async function loadReviewQueue() {
    setReviewLoading(true);
    setReviewError(null);
    try {
      let data: ReviewMatch[] | null = null;
      let error: { message?: string } | null = null;
      const initial = await supabase
        .from("product_upload_matches")
        .select(
          "id,created_at,upload_url,upload_hash,upload_hashes,status,review_reason,candidates"
        )
        .in("status", ["NEEDS_REVIEW", "NO_MATCH"])
        .order("created_at", { ascending: false })
        .limit(50);
      data = initial.data as ReviewMatch[] | null;
      error = initial.error as { message?: string } | null;

      if (error) {
        const msg = String(error.message ?? "");
        if (msg.includes("upload_hashes")) {
          const retry = await supabase
            .from("product_upload_matches")
            .select(
              "id,created_at,upload_url,upload_hash,status,review_reason,candidates"
            )
            .in("status", ["NEEDS_REVIEW", "NO_MATCH"])
            .order("created_at", { ascending: false })
            .limit(50);
          if (retry.error) throw retry.error;
          data = retry.data as ReviewMatch[] | null;
        } else {
          throw error;
        }
      }
      const matches = (data as ReviewMatch[]) ?? [];
      setReviewMatches(matches);

      const candidateIds = new Set<string>();
      matches.forEach((match) => {
        normalizeCandidates(match.candidates).forEach((candidate) => {
          if (candidate?.product_id) candidateIds.add(candidate.product_id);
        });
      });

      if (candidateIds.size > 0) {
        const ids = Array.from(candidateIds);
        const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select("*")
          .in("id", ids);

        if (!productsError && productsData) {
          const map: Record<string, Product> = {};
          (productsData as Product[]).forEach((product) => {
            map[product.id] = product;
          });
          setReviewProductMap(map);
        } else {
          setReviewProductMap({});
        }
      } else {
        setReviewProductMap({});
      }
    } catch (e: any) {
      setReviewError(e?.message ?? "Failed to load review queue.");
      setReviewMatches([]);
    } finally {
      setReviewLoading(false);
    }
  }

  async function applyReviewCandidate(
    match: ReviewMatch,
    candidate: UploadCandidate
  ) {
    if (!candidate?.product_id || !match?.upload_url) return;
    setReviewActionId(match.id);
    try {
      const { data: product, error } = await supabase
        .from("products")
        .select("image_urls")
        .eq("id", candidate.product_id)
        .maybeSingle();

      if (error || !product) {
        throw new Error("Product not found.");
      }

      const current = Array.isArray(product.image_urls)
        ? product.image_urls
        : [];
      const filtered = current.filter((url: string) => url && url !== match.upload_url);
      const updated = [match.upload_url, ...filtered];

      const { error: updateError } = await supabase
        .from("products")
        .update({ image_urls: updated, created_at: new Date().toISOString() })
        .eq("id", candidate.product_id);

      if (updateError) throw updateError;

      const uploadHashes = Array.isArray(match.upload_hashes)
        ? match.upload_hashes
        : [];
      const hashRows = uploadHashes
        .filter((hash) => hash?.hash_algo && hash?.image_hash)
        .map((hash) => ({
          product_id: candidate.product_id,
          image_url: match.upload_url,
          image_hash: hash.image_hash,
          hash_algo: hash.hash_algo,
        }));

      if (!hashRows.length && match.upload_hash) {
        hashRows.push({
          product_id: candidate.product_id,
          image_url: match.upload_url,
          image_hash: match.upload_hash,
          hash_algo: "dhash-64",
        });
      }

      if (hashRows.length) {
        await supabase.from("product_image_hashes").upsert(hashRows, {
          onConflict: "product_id,image_url,hash_algo",
        });
      }

      await supabase
        .from("product_upload_matches")
        .update({
          status: "APPLIED",
          matched_product_id: candidate.product_id,
          matched_image_url: candidate.image_url,
          confidence: candidate.confidence,
          distance: candidate.distance,
          applied_at: new Date().toISOString(),
          review_reason: null,
        })
        .eq("id", match.id);

      toast({ intent: "success", message: "Applied match." });
      setReviewMatches((prev) => prev.filter((m) => m.id !== match.id));
    } catch (e: any) {
      toast({
        intent: "error",
        message: e?.message ?? "Failed to apply match.",
      });
    } finally {
      setReviewActionId(null);
    }
  }

  async function markReviewNoMatch(match: ReviewMatch) {
    setReviewActionId(match.id);
    try {
      const { error } = await supabase
        .from("product_upload_matches")
        .update({ status: "NO_MATCH", review_reason: "MANUAL" })
        .eq("id", match.id);
      if (error) throw error;
      toast({ intent: "success", message: "Marked as no match." });
      setReviewMatches((prev) => prev.filter((m) => m.id !== match.id));
    } catch (e: any) {
      toast({
        intent: "error",
        message: e?.message ?? "Failed to update match.",
      });
    } finally {
      setReviewActionId(null);
    }
  }

  async function deleteBulkUpload(match: ReviewMatch) {
    if (!match?.id) return;
    setReviewActionId(match.id);
    try {
      const { error } = await supabase
        .from("product_upload_matches")
        .delete()
        .eq("id", match.id);
      if (error) throw error;

      setReviewMatches((prev) => prev.filter((m) => m.id !== match.id));
      setBulkSearchTerms((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
      setBulkSearchResults((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
      setBulkSearchHistory((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
      setBulkSearchIndex((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
      setBulkSearchLoading((prev) => {
        const next = { ...prev };
        delete next[match.id];
        return next;
      });
      const timers = bulkSearchTimersRef.current;
      if (timers[match.id]) {
        window.clearTimeout(timers[match.id]);
        delete timers[match.id];
      }
      toast({ intent: "success", message: "Upload deleted." });
    } catch (e: any) {
      toast({
        intent: "error",
        message: e?.message ?? "Failed to delete upload.",
      });
    } finally {
      setReviewActionId(null);
    }
  }

  function resetWarmUp() {
    warmUpFromRef.current = 0;
    setWarmUpFrom(0);
    setWarmUpMsg(null);
  }

  function resetWarmFeatureWarmUp() {
    warmFeatureFromRef.current = 0;
    setWarmFeatureFrom(0);
    setWarmFeatureMsg(null);
  }

  function stopWarmUpAuto() {
    warmUpAutoRef.current = false;
    setWarmUpAuto(false);
  }

  function stopWarmFeatureAuto() {
    warmFeatureAutoRef.current = false;
    setWarmFeatureAuto(false);
  }

  async function runWarmUpBatch(): Promise<any | null> {
    setWarmUpLoading(true);
    setWarmUpMsg(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated.");

      const maxImages = clampBatchValue(
        warmUpMaxImages,
        1,
        WARM_HASH_MAX_IMAGES,
        WARM_HASH_DEFAULT_IMAGES
      );
      const maxProducts = clampBatchValue(
        warmUpMaxProducts,
        1,
        WARM_HASH_MAX_PRODUCTS,
        WARM_HASH_DEFAULT_PRODUCTS
      );
      if (String(maxImages) !== warmUpMaxImages) {
        setWarmUpMaxImages(String(maxImages));
      }
      if (String(maxProducts) !== warmUpMaxProducts) {
        setWarmUpMaxProducts(String(maxProducts));
      }
      const from = warmUpFromRef.current;

      const res = await fetch("/api/images/warm-hashes", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          maxImages,
          maxProducts,
        }),
      });

      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(raw || `Warm up failed (${res.status})`);
      }

      if (!json?.ok) {
        const detail = json?.stage
          ? `${json?.error ?? "Warm up failed."} (stage: ${json.stage})`
          : json?.error ?? "Warm up failed.";
        throw new Error(detail);
      }

      const nextFrom = Number.isFinite(json?.nextFrom)
        ? Number(json.nextFrom)
        : from;
      warmUpFromRef.current = nextFrom;
      setWarmUpFrom(nextFrom);

      const warmUpNote =
        json?.stoppedEarly && json?.timeBudgetMs
          ? ` Stopped early to keep the batch under ${Math.round(
              Number(json.timeBudgetMs) / 1000
            )}s.`
          : "";
      setWarmUpMsg(
        `Batch done. Hashed ${json?.hashedImages ?? 0} new images, scanned ${
          json?.processedProducts ?? 0
        } products. Next batch starts at ${nextFrom}.${warmUpNote}`
      );
      return json;
    } catch (e: any) {
      setWarmUpMsg(e?.message ?? "Warm up failed.");
      return null;
    } finally {
      setWarmUpLoading(false);
    }
  }

  async function runWarmFeatureBatch(): Promise<any | null> {
    setWarmFeatureLoading(true);
    setWarmFeatureMsg(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated.");

      const maxImages = clampBatchValue(
        warmFeatureMaxImages,
        1,
        WARM_FEATURE_MAX_IMAGES,
        WARM_FEATURE_DEFAULT_IMAGES
      );
      const maxProducts = clampBatchValue(
        warmFeatureMaxProducts,
        1,
        WARM_FEATURE_MAX_PRODUCTS,
        WARM_FEATURE_DEFAULT_PRODUCTS
      );
      if (String(maxImages) !== warmFeatureMaxImages) {
        setWarmFeatureMaxImages(String(maxImages));
      }
      if (String(maxProducts) !== warmFeatureMaxProducts) {
        setWarmFeatureMaxProducts(String(maxProducts));
      }
      const from = warmFeatureFromRef.current;

      const res = await fetch("/api/images/warm-features", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          maxImages,
          maxProducts,
          includeOcr: warmFeatureIncludeOcr,
        }),
      });

      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(raw || `Warm up failed (${res.status})`);
      }

      if (!json?.ok) {
        const detail = json?.stage
          ? `${json?.error ?? "Warm up failed."} (stage: ${json.stage})`
          : json?.error ?? "Warm up failed.";
        throw new Error(detail);
      }

      const nextFrom = Number.isFinite(json?.nextFrom)
        ? Number(json.nextFrom)
        : from;
      warmFeatureFromRef.current = nextFrom;
      setWarmFeatureFrom(nextFrom);

      const warmFeatureNote =
        json?.stoppedEarly && json?.timeBudgetMs
          ? ` Stopped early to keep the batch under ${Math.round(
              Number(json.timeBudgetMs) / 1000
            )}s.`
          : "";
      setWarmFeatureMsg(
        `Batch done. Updated ${json?.updatedImages ?? 0} images, scanned ${
          json?.processedProducts ?? 0
        } products. Next batch starts at ${nextFrom}.${warmFeatureNote}`
      );
      return json;
    } catch (e: any) {
      setWarmFeatureMsg(e?.message ?? "Warm up failed.");
      return null;
    } finally {
      setWarmFeatureLoading(false);
    }
  }

  async function runWarmUpContinuous() {
    if (warmUpAutoRef.current) return;
    warmUpAutoRef.current = true;
    setWarmUpAuto(true);
    try {
      let failures = 0;
      while (warmUpAutoRef.current) {
        const before = warmUpFromRef.current;
        const result = await runWarmUpBatch();
        if (!result) {
          failures += 1;
          if (failures >= WARM_BATCH_RETRY_LIMIT) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        failures = 0;
        const nextFrom = Number.isFinite(result?.nextFrom)
          ? Number(result.nextFrom)
          : before;
        const processed = Number(result?.processedProducts ?? 0);
        if (processed === 0 || nextFrom === before) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } finally {
      stopWarmUpAuto();
    }
  }

  async function runWarmFeatureContinuous() {
    if (warmFeatureAutoRef.current) return;
    warmFeatureAutoRef.current = true;
    setWarmFeatureAuto(true);
    try {
      let failures = 0;
      while (warmFeatureAutoRef.current) {
        const before = warmFeatureFromRef.current;
        const result = await runWarmFeatureBatch();
        if (!result) {
          failures += 1;
          if (failures >= WARM_BATCH_RETRY_LIMIT) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        failures = 0;
        const nextFrom = Number.isFinite(result?.nextFrom)
          ? Number(result.nextFrom)
          : before;
        const processed = Number(result?.processedProducts ?? 0);
        if (processed === 0 || nextFrom === before) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } finally {
      stopWarmFeatureAuto();
    }
  }

  async function uploadFileToStorage(file: File, folderId: string) {
    const form = new FormData();
    form.append("file", file);
    form.append("productId", folderId);

    const r = await fetch("/api/images/upload", {
      method: "POST",
      body: form,
    });
    const j = await r.json();
    if (!j.ok || !j.publicUrl) throw new Error(j.error ?? "Upload failed");
    return j.publicUrl as string;
  }

  async function uploadBulkPhotos(files: File[]) {
    if (!files.length) return;
    setBulkUploadLoading(true);
    setBulkUploadMsg(null);
    setBulkUploadProgress({ current: 0, total: files.length });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id ?? null;
      const folderId = `bulk-${new Date().toISOString().slice(0, 10)}`;
      let uploaded = 0;

      for (let idx = 0; idx < files.length; idx += 1) {
        const file = files[idx];
        setBulkUploadProgress({ current: idx + 1, total: files.length });
        try {
          const url = await uploadFileToStorage(file, folderId);
          const payload: any = {
            upload_url: url,
            status: "NO_MATCH",
            review_reason: "MANUAL_UPLOAD",
          };
          if (userId) payload.uploader_user_id = userId;
          const { error } = await supabase
            .from("product_upload_matches")
            .insert(payload);
          if (error) throw error;
          uploaded += 1;
        } catch (e) {
          console.error("Bulk upload failed", e);
        }
      }

      setBulkUploadMsg(`Uploaded ${uploaded} photo(s) to inbox.`);
      await loadReviewQueue();
    } catch (e: any) {
      setBulkUploadMsg(e?.message ?? "Bulk upload failed.");
    } finally {
      setBulkUploadLoading(false);
      setBulkUploadProgress(null);
    }
  }

  async function runBulkSearch(
    matchId: string,
    termOverride?: string,
    options?: { recordHistory?: boolean }
  ) {
    const term = (termOverride ?? bulkSearchTerms[matchId] ?? "").trim();
    if (!term) {
      setBulkSearchResults((prev) => ({ ...prev, [matchId]: [] }));
      return;
    }
    const recordHistory = options?.recordHistory ?? true;
    if (recordHistory && term.length >= 2) {
      setBulkSearchHistory((prev) => {
        const list = prev[matchId] ?? [];
        if (list[list.length - 1] === term) return prev;
        const next = [...list, term].slice(-20);
        return { ...prev, [matchId]: next };
      });
      setBulkSearchIndex((prev) => ({ ...prev, [matchId]: null }));
    }
    setBulkSearchLoading((prev) => ({ ...prev, [matchId]: true }));
    try {
      const barcode = normalizeBarcode(term);
      if (barcode.length >= 6) {
        const { data: barcodeData, error: barcodeError } = await supabase
          .from("product_variants")
          .select(
            "barcode,ship_class,condition,product:products(*)"
          )
          .eq("barcode", barcode)
          .limit(20);
        if (barcodeError) throw barcodeError;
        const shipFilterActive = bulkShipClassFilter.length > 0;
        const allowedShips = new Set(bulkShipClassFilter);
        const filteredBarcodeRows = (barcodeData ?? []).filter((row: any) => {
          if (!shipFilterActive) return true;
          const ship = row?.ship_class as ShipClass | null | undefined;
          return ship ? allowedShips.has(ship) : false;
        });
        const fromBarcode = filteredBarcodeRows
          .map((row: any) => {
            const product = row?.product as Product | null;
            if (!product) return null;
            return {
              ...product,
              product_variants: [
                {
                  ship_class: row?.ship_class ?? null,
                  condition: row?.condition ?? null,
                },
              ],
            };
          })
          .filter(Boolean) as Product[];
        if (fromBarcode.length) {
          const unique = new Map<string, Product>();
          fromBarcode.forEach((p) => {
            const existing: any = unique.get(p.id);
            if (!existing) {
              unique.set(p.id, p);
              return;
            }
            const nextVariants = [
              ...((existing as any).product_variants ?? []),
              ...((p as any).product_variants ?? []),
            ];
            unique.set(p.id, { ...existing, product_variants: nextVariants });
          });
          const uniqueList = Array.from(unique.values());
            const match = reviewMatches.find((m) => m.id === matchId);
            if (match && uniqueList.length === 1) {
              const target = uniqueList[0];
              await assignBulkUpload(match, target);
              setBulkSearchLoading((prev) => ({ ...prev, [matchId]: false }));
              return;
            }
          setBulkSearchResults((prev) => ({
            ...prev,
            [matchId]: uniqueList,
          }));
          setBulkSearchLoading((prev) => ({ ...prev, [matchId]: false }));
          return;
        }
      }

      const normalizedBase = normalizeLookupTitle(term, null) || term;
      const normalizedQuery = normalizeSearchText(normalizedBase);
      const tokens = expandSearchTokens(tokenizeSearch(normalizedBase));
      const searchTerms = tokens.length ? tokens : tokenizeSearch(term);
      const orParts: string[] = [];
      searchTerms.forEach((t) => {
        const cleaned = t.replace(/[(),]/g, " ").trim();
        if (!cleaned) return;
        const ilike = `%${cleaned}%`;
        orParts.push(
          `title.ilike.${ilike}`,
          `brand.ilike.${ilike}`,
          `model.ilike.${ilike}`,
          `variation.ilike.${ilike}`
        );
      });

      const { data, error } = await supabase
        .from("products")
        .select(
          "*, product_variants(ship_class,condition,qty,release_at)"
        )
        .or(orParts.join(","))
        .limit(60);
      if (error) throw error;

      const unique = new Map<string, ProductSummary>();
      ((data as ProductSummary[]) ?? []).forEach((p) => unique.set(p.id, p));
      const ranked = Array.from(unique.values())
        .map((p) => ({
          product: p,
          score: scoreSearchResult(p, tokens, normalizedQuery),
        }))
        .sort((a, b) => b.score - a.score)
        .map((row) => row.product);
      setBulkSearchResults((prev) => ({
        ...prev,
        [matchId]: ranked,
      }));
    } catch (e: any) {
      setBulkSearchResults((prev) => ({ ...prev, [matchId]: [] }));
      toast({
        intent: "error",
        message: e?.message ?? "Search failed.",
      });
    } finally {
      setBulkSearchLoading((prev) => ({ ...prev, [matchId]: false }));
    }
  }

  function scheduleBulkSearch(matchId: string, nextValue: string) {
    setBulkSearchTerms((prev) => ({ ...prev, [matchId]: nextValue }));
    setBulkSearchIndex((prev) => ({ ...prev, [matchId]: null }));
    const trimmed = nextValue.trim();
    if (!trimmed) {
      setBulkSearchResults((prev) => ({ ...prev, [matchId]: [] }));
      return;
    }
    const timers = bulkSearchTimersRef.current;
    if (timers[matchId]) window.clearTimeout(timers[matchId]);
    timers[matchId] = window.setTimeout(() => {
      runBulkSearch(matchId, trimmed);
    }, 300);
  }

  function focusBulkSearchInput(targetId: string | null | undefined) {
    if (!targetId) return;
    requestAnimationFrame(() => {
      const el = bulkSearchInputRefs.current[targetId];
      if (!el) return;
      el.focus();
      try {
        el.select();
      } catch {
        // ignore
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function focusNextBulkSearchInput(currentId: string) {
    const idx = reviewMatches.findIndex((m) => m.id === currentId);
    if (idx === -1) return;
    const nextId = reviewMatches[idx + 1]?.id ?? reviewMatches[idx - 1]?.id;
    focusBulkSearchInput(nextId);
  }

  function focusPreviousBulkSearchInput(currentId: string) {
    const idx = reviewMatches.findIndex((m) => m.id === currentId);
    if (idx === -1) return;
    const prevId = reviewMatches[idx - 1]?.id;
    focusBulkSearchInput(prevId);
  }

  async function assignBulkUpload(match: ReviewMatch, product: ProductSummary) {
    if (!match?.upload_url) return;
    const nextFocusId = (() => {
      const idx = reviewMatches.findIndex((m) => m.id === match.id);
      if (idx === -1) return null;
      return reviewMatches[idx - 1]?.id ?? reviewMatches[idx + 1]?.id ?? null;
    })();
    try {
      const current = Array.isArray(product.image_urls) ? product.image_urls : [];
      const filtered = current.filter((url) => url && url !== match.upload_url);
      const updated = [match.upload_url, ...filtered];

      const { error: updateError } = await supabase
        .from("products")
        .update({ image_urls: updated, created_at: new Date().toISOString() })
        .eq("id", product.id);
      if (updateError) throw updateError;

      if (selectedProduct?.id === product.id) {
        setImages(updated);
        setSelectedImages((prev) => ({ ...prev, [match.upload_url]: true }));
      }

      const { error: matchError } = await supabase
        .from("product_upload_matches")
        .update({
          status: "APPLIED",
          matched_product_id: product.id,
          matched_image_url: match.upload_url,
          review_reason: null,
          applied_at: new Date().toISOString(),
        })
        .eq("id", match.id);
      if (matchError) throw matchError;

      setReviewMatches((prev) => prev.filter((m) => m.id !== match.id));
      setBulkSearchTerms((prev) => ({ ...prev, [match.id]: "" }));
      setBulkSearchResults((prev) => ({ ...prev, [match.id]: [] }));
      toast({ intent: "success", message: "Thumbnail applied." });
      if (nextFocusId) {
        requestAnimationFrame(() => focusBulkSearchInput(nextFocusId));
      }
    } catch (e: any) {
      toast({
        intent: "error",
        message: e?.message ?? "Failed to apply photo.",
      });
    }
  }

  async function uploadImageFile(file: File, productIdForPath: string) {
    return await uploadFileToStorage(file, productIdForPath);
  }

  async function uploadImageFiles(files: File[], productIdForPath: string) {
    if (!files.length) return;
    setManualUploadLoading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        try {
          const url = await uploadImageFile(file, productIdForPath);
          uploaded.push(url);
        } catch (e) {
          console.error("Image upload failed", e);
        }
      }
      if (uploaded.length) {
        setImages((prev) => uniq([...uploaded, ...prev]));
        setSelectedImages((prev) => {
          const next = { ...prev };
          uploaded.forEach((url) => {
            next[url] = true;
          });
          return next;
        });
      }
    } finally {
      setManualUploadLoading(false);
    }
  }

  function orderUploadedFilesTopToBottom(files: File[]) {
    return files
      .map((file, index) => ({ file, index }))
      .sort((a, b) => {
        const aTs = Number.isFinite(a.file.lastModified)
          ? a.file.lastModified
          : 0;
        const bTs = Number.isFinite(b.file.lastModified)
          ? b.file.lastModified
          : 0;
        if (aTs !== bTs) return aTs - bTs;
        return a.index - b.index;
      })
      .map((entry) => entry.file);
  }

  function handleImagePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    if (!files.length) return;
    e.preventDefault();
    const pid = selectedProduct?.id ?? crypto.randomUUID();
    void uploadImageFiles(files, pid);
  }

  function applyVariantDefaultsFromExisting(
    list: Variant[],
    sourceBrand: string = brand
  ) {
    if (!Array.isArray(list) || list.length === 0) return;
    const base = [...list].reverse().find((v) => v) ?? list[list.length - 1];
    if (!base) return;
    const nextCondition = nextConditionFromExisting(list);
    const baseShipClass =
      (base.ship_class as ShipClass | null) ?? shipClassFromBrand(sourceBrand);
    const nextShipClass = (
      isBlisterCondition(nextCondition)
        ? "BLISTER"
        : baseShipClass && isLalamoveOnlyShipClass(baseShipClass)
          ? baseShipClass
          : baseShipClass ?? shipClassFromBrand(sourceBrand)
    ) as ShipClass;
    setCondition(nextCondition);
    setVariantBarcode(base.barcode ?? "");
    adoptDraftCost(base.cost != null ? String(base.cost) : "", nextShipClass);
    setQty(base.qty != null ? String(base.qty) : "1");
    setShipClass(nextShipClass);
    setPublicNotes(String(base.public_notes ?? base.issue_notes ?? ""));
    setIssuePhotos(Array.isArray(base.issue_photo_urls) ? base.issue_photo_urls : []);
  }

  function nextConditionFromExisting(list: Variant[]): VariantCondition {
    const hasNearMint = list.some((v) => v.condition === "near_mint");
    const hasNearMintBox = list.some(
      (v) => v.condition === "sealed_near_mint_box"
    );
    const hasUnsealedNearMintBox = list.some(
      (v) => v.condition === "unsealed_near_mint_box"
    );
    const hasNotMintBox = list.some(
      (v) => v.condition === "sealed_not_mint_box"
    );
    const hasNearMintBlister = list.some(
      (v) => v.condition === "sealed_near_mint_blister"
    );
    const hasUnsealedNearMintBlister = list.some(
      (v) => v.condition === "unsealed_near_mint_blister"
    );
    const hasNotMintBlister = list.some(
      (v) => v.condition === "sealed_not_mint_blister"
    );
    const hasUnsealedNoBox = list.some((v) => v.condition === "unsealed_no_box");
    const hasUnsealedNoAcrylic = list.some(
      (v) => v.condition === "unsealed_no_acrylic"
    );
    const hasResealed = list.some((v) => v.condition === "resealed");
    const hasSealed = list.some((v) => v.condition === "sealed");
    const hasUnsealed = list.some((v) => v.condition === "unsealed");
    const hasSealedBlister = list.some(
      (v) => v.condition === "sealed_blister"
    );
    const hasUnsealedBlister = list.some(
      (v) => v.condition === "unsealed_blister"
    );
    const hasBlistered = list.some((v) => v.condition === "blistered");
    if (hasNearMint) return "near_mint";
    if (hasNearMintBox) return "sealed_near_mint_box";
    if (hasUnsealedNoBox) return "unsealed_no_box";
    if (hasUnsealedNoAcrylic) return "unsealed_no_acrylic";
    if (hasUnsealedNearMintBox) return "unsealed_near_mint_box";
    if (hasNotMintBox) return "sealed_not_mint_box";
    if (hasNearMintBlister) return "sealed_near_mint_blister";
    if (hasUnsealedNearMintBlister) return "unsealed_near_mint_blister";
    if (hasNotMintBlister) return "sealed_not_mint_blister";
    if (hasResealed) return "resealed";
    if (hasSealed && hasUnsealed) return "with_issues";
    if (hasSealed) return "unsealed";
    if (hasUnsealed) return "sealed";
    if (hasSealedBlister && hasUnsealedBlister) return "with_issues";
    if (hasSealedBlister) return "unsealed_blister";
    if (hasUnsealedBlister) return "sealed_blister";
    if (hasBlistered) return "blistered";
    return "unsealed";
  }

  async function uploadIssueFiles(files: File[], folderId: string) {
    if (!files.length) return;
    setIssuePhotosUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        try {
          const url = await uploadFileToStorage(file, folderId);
          uploaded.push(url);
        } catch (e) {
          console.error("Issue photo upload failed", e);
        }
      }
      if (uploaded.length) {
        setIssuePhotos((prev) => uniq([...prev, ...uploaded]));
      }
    } finally {
      setIssuePhotosUploading(false);
    }
  }

  function handleIssuePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    if (!files.length) return;
    e.preventDefault();
    const folderId = `issue-${selectedProduct?.id ?? crypto.randomUUID()}`;
    void uploadIssueFiles(files, folderId);
  }

  function removeIssuePhoto(url: string) {
    setIssuePhotos((prev) => prev.filter((u) => u !== url));
  }

  async function uploadVariantIssueFiles(v: Variant, files: File[]) {
    if (!files.length) return;
    setIssuePhotosUploadingId(v.id);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        try {
          const url = await uploadFileToStorage(file, `issue-${v.id}`);
          uploaded.push(url);
        } catch (e) {
          console.error("Issue photo upload failed", e);
        }
      }
      if (!uploaded.length) return;
      const next = uniq([...(v.issue_photo_urls ?? []), ...uploaded]);
      updateVariantDraft(v.id, { issue_photo_urls: next });
    } finally {
      setIssuePhotosUploadingId(null);
    }
  }

  function handleVariantIssuePaste(v: Variant, e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    if (!files.length) return;
    e.preventDefault();
    void uploadVariantIssueFiles(v, files);
  }

  async function removeVariantIssuePhoto(v: Variant, url: string) {
    const next = (v.issue_photo_urls ?? []).filter((u) => u !== url);
    updateVariantDraft(v.id, { issue_photo_urls: next.length ? next : null });
  }

  function addManualUrl() {
    const u = manualImageUrl.trim();
    if (!u) return;
    addImageUrls([u]);
    setManualImageUrl("");
    setCropEditor(null);
  }

  function updateImageUrlAtIndex(index: number, nextUrl: string) {
    setImages((prev) => {
      if (!prev[index] || prev[index] === nextUrl) return prev;
      const next = [...prev];
      const prevUrl = next[index];
      next[index] = nextUrl;
      setSelectedImages((prevSelected) => {
        const updated = { ...prevSelected };
        const wasSelected = !!updated[prevUrl];
        delete updated[prevUrl];
        if (wasSelected) updated[nextUrl] = true;
        return updated;
      });
      return next;
    });
  }

  function openCropEditor(url: string, index: number) {
    const parsed = parseImageCrop(url);
    setCropEditor({
      index,
      baseUrl: parsed.src,
      crop: parsed.crop ?? { zoom: 1, x: 0, y: 0, rotate: 0 },
    });
  }

  function beginCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!cropEditor || !cropFrameRef.current) return;
    const rect = cropFrameRef.current.getBoundingClientRect();
    cropDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      crop: cropEditor.crop,
      rect,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!cropDragRef.current) return;
    const { startX, startY, crop, rect } = cropDragRef.current;
    const dx = ((event.clientX - startX) / rect.width) * 100;
    const dy = ((event.clientY - startY) / rect.height) * 100;
    setCropEditor((prev) =>
      prev
        ? {
            ...prev,
            crop: normalizeCrop({
              ...crop,
              x: crop.x + dx,
              y: crop.y + dy,
            }),
          }
        : prev
    );
  }

  function endCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!cropDragRef.current) return;
    cropDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function addImageUrls(urls: string[]) {
    const cleaned = urls.map((u) => u.trim()).filter(Boolean);
    if (!cleaned.length) return;
    setImages((prev) => uniq([...prev, ...cleaned]));
    setSelectedImages((prev) => {
      const next = { ...prev };
      cleaned.forEach((u) => {
        next[u] = true;
      });
      return next;
    });
  }

  function handleManualUrlPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    const urls = text
      .split(/\s+/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u));
    if (!urls.length) return;
    e.preventDefault();
    addImageUrls(urls);
    setManualImageUrl("");
  }

  function stepNewQty(delta: number) {
    setQty((prev) => {
      const current = Math.trunc(n(prev));
      const next = Math.max(0, current + delta);
      return String(next);
    });
  }

  function stepQuickAddQty(delta: number) {
    setQuickAddQty((prev) => {
      const current = Math.max(1, Math.trunc(n(prev, 1)));
      const next = Math.max(1, current + delta);
      return String(next);
    });
  }

  function stepExistingQty(v: Variant, delta: number) {
    const current = Math.trunc(n(v.qty));
    const next = Math.max(0, current + delta);
    updateVariantDraft(v.id, { qty: next });
  }

  function addQtyToVariant(v: Variant) {
    const raw = addQtyByVariant[v.id] ?? "";
    const parsed = Math.trunc(n(raw));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const current = Math.trunc(n(v.qty));
    const next = Math.max(0, current + parsed);
    updateVariantDraft(v.id, { qty: next });
    setAddQtyByVariant((prev) => ({ ...prev, [v.id]: "" }));
  }

  function reorderImages(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setImages((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleImageDrop(e: React.DragEvent, targetIndex: number) {
    const raw = e.dataTransfer.getData("text/plain");
    const fromIndex = Number(raw);
    if (!Number.isFinite(fromIndex)) return;
    reorderImages(fromIndex, targetIndex);
  }

  async function importSelectedImages(productId: string) {
    const selected = images.filter((u) => selectedImages[u]);

    const kept: string[] = [];

    for (const url of selected) {
      // Already hosted in Supabase Storage
      if (url.includes("/storage/v1/object/public/")) {
        kept.push(url);
        continue;
      }

      const r = await fetch("/api/images/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageUrl: url, productId }),
      });
      const j = await r.json();
      if (j.ok && j.publicUrl) kept.push(j.publicUrl);
    }

    // If import failed, still keep original selected URLs
    return kept.length ? kept : selected;
  }

  async function saveProductOnly() {
    if (!selectedProduct) {
      toast({ intent: "error", message: "Select a product first." });
      return;
    }

    setSaving(true);
    try {
        const scheduledReleaseAt = resolveScheduledReleaseAt();
        const normalizedTitle = normalizeTitleBrandAliases(title).trim();
        const { error: uErr } = await supabase
          .from("products")
          .update({
            title: normalizedTitle,
            brand: brand || null,
            model: model || null,
            variation: variation || null,
            special_tags: specialTags,
            created_at: new Date().toISOString(),
          })
          .eq("id", selectedProduct.id);

      if (uErr) throw uErr;
      await applyScheduledReleaseToExistingVariants(variants, scheduledReleaseAt);

      const hasSelected = Object.values(selectedImages).some(Boolean);
      if (hasSelected) {
        const imported = await importSelectedImages(selectedProduct.id);
        const { error: imgErr } = await supabase
          .from("products")
          .update({ image_urls: imported })
          .eq("id", selectedProduct.id);
        if (imgErr) throw imgErr;
      }

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", selectedProduct.id)
        .single();

      if (error) throw error;
      if (data) await loadProduct(data as any);

      toast({ intent: "success", message: "Product updated." });
      focusBarcodeInput();
    } catch (e: any) {
      toast({ intent: "error", message: e?.message ?? "Update failed" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(active: boolean) {
    if (!selectedProduct) return;

    setSaving(true);
    try {
      const { error: uErr } = await supabase
        .from("products")
        .update({ is_active: active })
        .eq("id", selectedProduct.id);
      if (uErr) throw uErr;

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", selectedProduct.id)
        .single();

      if (error) throw error;
      if (data) await loadProduct(data as any);
    } catch (e: any) {
      toast({ intent: "error", message: e?.message ?? "Update failed" });
    } finally {
      setSaving(false);
    }
  }

  async function saveNewVariant(options?: {
    keepProduct?: boolean;
    drafts?: VariantDraft[];
    reloadAfterSave?: boolean;
    printBarcodes?: boolean;
  }) {
    setSaving(true);
    const reloadAfterSave = Boolean(options?.reloadAfterSave);

    try {
      const normalizedTitle = normalizeTitleBrandAliases(title).trim();
      const scheduledReleaseAt = resolveScheduledReleaseAt();
      if (!normalizedTitle) throw new Error("Title is required.");

      const draftList = (options?.drafts?.length
        ? options?.drafts
        : [buildVariantDraft()]
      ).filter(Boolean) as VariantDraft[];

      if (!draftList.length) throw new Error("No variants to save.");

      const keepProduct = Boolean(options?.keepProduct);

      // Create product if none selected
      let productId = selectedProduct?.id;
      let createdProduct: Product | null = null;
      let importedImages: string[] | null = null;

      if (!productId) {
        const { data: p, error: pErr } = await supabase
          .from("products")
          .insert({
            title: normalizedTitle,
            brand: brand || null,
            model: model || null,
            variation: variation || null,
            special_tags: specialTags,
            image_urls: [],
            is_active: true,
          })
          .select("*")
          .single();

        if (pErr) throw pErr;
        const createdProductId = String(p.id);
        productId = createdProductId;
        createdProduct = p as Product;

        const hasSelected = Object.values(selectedImages).some(Boolean);
        if (hasSelected) {
          const imported = await importSelectedImages(createdProductId);
          importedImages = imported;
          const { error: imgErr } = await supabase
            .from("products")
            .update({ image_urls: imported })
            .eq("id", createdProductId);
          if (imgErr) throw imgErr;
        }
      } else {
        // Update identity fields when adding a new variant to existing product
        const { error: uErr } = await supabase
          .from("products")
          .update({
            title: normalizedTitle,
            brand: brand || null,
            model: model || null,
            variation: variation || null,
            special_tags: specialTags,
            created_at: new Date().toISOString(),
          })
          .eq("id", productId);
        if (uErr) throw uErr;
      }

      const createdVariants: Variant[] = [];
      const labelsToPrint: InventoryBarcodeLabelData[] = [];
      for (const [idx, draft] of draftList.entries()) {
        if (!draft.cost || !draft.price || !draft.qty) {
          throw new Error(`Variant ${idx + 1}: cost, price, and qty are required.`);
        }

        const costN = n(draft.cost);
        const priceN = n(draft.price);
        const qtyN = Math.trunc(n(draft.qty));

        if (!Number.isFinite(costN) || !Number.isFinite(priceN)) {
          throw new Error(`Variant ${idx + 1}: cost/price must be valid numbers.`);
        }
        if (!Number.isFinite(qtyN)) {
          throw new Error(`Variant ${idx + 1}: qty must be a valid number.`);
        }
        if (qtyN < 0) {
          throw new Error(`Variant ${idx + 1}: qty cannot be negative.`);
        }
        if (draft.condition === "with_issues" && !draft.publicNotes.trim()) {
          throw new Error(`Variant ${idx + 1}: notes are required.`);
        }

        let generatedBarcode: string | null = null;
        let barcodeValue = draft.variantBarcode.trim() || null;
        if (!barcodeValue) {
          barcodeValue = await generateUniqueBarcode();
          generatedBarcode = barcodeValue;
        }

        const notesValue = draft.publicNotes.trim();
        const resolvedNotes =
          isNearMintCondition(draft.condition)
            ? notesValue || "Near Mint Condition"
            : notesValue || null;

        const { data: createdVariant, error: vErr } = await supabase
          .from("product_variants")
          .insert({
            product_id: productId!,
            condition: draft.condition,
            public_notes: resolvedNotes,
            issue_notes: null,
            issue_photo_urls:
              supportsIssueDetailCondition(draft.condition) &&
              draft.issuePhotos.length
                ? draft.issuePhotos
                : null,
            cost: costN,
            price: priceN,
            qty: qtyN,
            ship_class: draft.shipClass,
            barcode: barcodeValue,
            release_at: scheduledReleaseAt,
          })
          .select(
            "id,product_id,condition,issue_notes,issue_photo_urls,public_notes,cost,price,qty,ship_class,barcode,created_at,release_at"
          )
          .single();

        if (vErr) throw vErr;
        createdVariants.push(createdVariant as Variant);

        if (generatedBarcode) {
          await recordGeneratedBarcode(
            productId!,
            generatedBarcode,
            draft.condition,
            normalizedTitle
          );
        }

        labelsToPrint.push({
          title: normalizedTitle,
          subtitle: formatConditionLabel(draft.condition),
          barcodeValue,
        });
      }

      toast({
        intent: "success",
        message:
          createdVariants.length > 1
            ? `Saved ${createdVariants.length} variants.`
            : "Saved product + variant.",
      });

      if (options?.printBarcodes) {
        try {
          await printInventoryBarcodeLabels(labelsToPrint);
        } catch (printError: any) {
          toast({
            intent: "error",
            message:
              printError?.message ??
              "Saved successfully, but barcode printing failed.",
          });
        }
      }

      if (reloadAfterSave) {
        clearProduct();
        setSearch("");
        setResults([]);
        window.scrollTo({ top: 0, behavior: "auto" });
        focusAfterSaveRef.current = true;
        router.refresh();
        return;
      }

      if (keepProduct && productId) {
        if (!selectedProduct && createdProduct) {
          const nextImages = importedImages ?? createdProduct.image_urls ?? [];
          const nextProduct = {
            ...createdProduct,
            title: normalizedTitle,
            brand: brand || null,
            model: model || null,
            variation: variation || null,
            special_tags: specialTags,
            image_urls: nextImages,
          };
          setSelectedProduct(nextProduct);
          setImages(Array.isArray(nextImages) ? nextImages : []);
        } else if (selectedProduct) {
          setSelectedProduct({
            ...selectedProduct,
            title: normalizedTitle,
            brand: brand || null,
            model: model || null,
            variation: variation || null,
            special_tags: specialTags,
          });
        }

        if (createdVariants.length) {
          setVariants((prev) => [...createdVariants, ...prev]);
        }
        setQueuedVariants([]);
        resetVariantDraft();
        resetBarcodeLookup();
        focusBarcodeInput();
        return;
      }

      setQueuedVariants([]);
      resetVariantDraft();

      clearProduct();
      focusBarcodeInput();
      return;
    } catch (e: any) {
      toast({ intent: "error", message: e?.message ?? "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function saveHotWheelsBulk() {
    if (bulkHotWheelsSaving) return;
    setBulkHotWheelsErrors([]);
    const costValue = n(bulkHotWheelsCost, NaN);
    if (!Number.isFinite(costValue) || costValue <= 0) {
      toast({ intent: "error", message: "Enter a valid shared cost." });
      return;
    }

    const parsed = parseHotWheelsBulkLines(
      bulkHotWheelsLines,
      bulkHotWheelsCondition
    );
    if (!parsed.items.length) {
      const fallbackError = parsed.errors.length
        ? parsed.errors
        : ["Add at least one item line."];
      setBulkHotWheelsErrors(fallbackError);
      toast({ intent: "error", message: "No valid bulk lines found." });
      return;
    }
    if (parsed.errors.length) {
      setBulkHotWheelsErrors(parsed.errors);
      toast({
        intent: "error",
        message: "Fix the highlighted bulk add lines first.",
      });
      return;
    }

    const issueNoteValue = bulkHotWheelsIssueNotes.trim();
    if (
      parsed.items.some((item) => item.condition === "with_issues") &&
      !issueNoteValue
    ) {
      const noteError = "Notes are required for With Issues items.";
      setBulkHotWheelsErrors([noteError]);
      toast({ intent: "error", message: noteError });
      return;
    }

    setBulkHotWheelsSaving(true);
    const brandValue = bulkBrand.trim();
    if (!brandValue) {
      setBulkHotWheelsSaving(false);
      toast({ intent: "error", message: "Brand is required for bulk add." });
      return;
    }
    let scheduledReleaseAt: string | null = null;
    try {
      scheduledReleaseAt = resolveScheduledReleaseAt();
    } catch (error: any) {
      setBulkHotWheelsSaving(false);
      toast({ intent: "error", message: error?.message ?? "Invalid release time." });
      return;
    }
    const shipClassValue: ShipClass = bulkShipClass;
    let created = 0;
    const errors: string[] = [];

    for (const item of parsed.items) {
      try {
        const normalizedModel = titleCase(item.model);
        const normalizedVariation = titleCase(item.variation);
        const computedTitle = [
          brandValue,
          normalizedModel,
          normalizedVariation,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();
        const normalizedTitle = normalizeTitleBrandAliases(
          computedTitle || item.title
        ).trim();
        if (!normalizedTitle) {
          throw new Error("Title is required.");
        }

        const { data: product, error: pErr } = await supabase
          .from("products")
          .insert({
            title: normalizedTitle,
            brand: brandValue,
            model: normalizedModel || null,
            variation: normalizedVariation || null,
            image_urls: [],
            is_active: true,
          })
          .select("*")
          .single();

        if (pErr) throw pErr;
        const productId = String(product.id);
        const barcodeValue = await generateUniqueBarcode();
        const notesValue =
          isIssueCondition(item.condition)
            ? issueNoteValue
            : isNearMintCondition(item.condition)
              ? "Near Mint Condition"
              : null;

        const { error: vErr } = await supabase
          .from("product_variants")
          .insert({
            product_id: productId,
            condition: item.condition,
            public_notes: notesValue,
            issue_notes: null,
            issue_photo_urls: null,
            cost: costValue,
            price: item.price,
            qty: item.qty,
            ship_class: shipClassValue,
            barcode: barcodeValue,
            release_at: scheduledReleaseAt,
          })
          .select("id")
          .single();

        if (vErr) throw vErr;
        const detailOverride = [
          brandValue,
          normalizedModel,
          normalizedVariation,
        ]
          .filter(Boolean)
          .join(" ");
        await recordGeneratedBarcode(
          productId,
          barcodeValue,
          item.condition,
          normalizedTitle,
          detailOverride
        );
        created += 1;
      } catch (err: any) {
        errors.push(
          `Line ${item.line}: ${err?.message ?? "Failed to create item."}`
        );
      }
    }

    if (created > 0) {
      toast({
        intent: "success",
        message: `Added ${created} bulk items.`,
      });
      setBulkHotWheelsLines("");
      setBulkHotWheelsIssueNotes("");
    }
    if (errors.length) {
      setBulkHotWheelsErrors(errors);
      toast({
        intent: "error",
        message: `${errors.length} items failed to add.`,
      });
    }
    setBulkHotWheelsSaving(false);
  }

  async function updateVariant(v: Variant, patch: Partial<Variant>) {
    const { data, error } = await supabase
      .from("product_variants")
      .update(patch)
      .eq("id", v.id)
      .select(
        "id,product_id,condition,issue_notes,issue_photo_urls,public_notes,cost,price,qty,ship_class,barcode,created_at,release_at"
      )
      .single();

    if (error) {
      toast({ intent: "error", message: error.message });
      return null;
    }
    if (data) {
      setVariants((prev) =>
        prev.map((variant) =>
          variant.id === v.id ? (data as Variant) : variant
        )
      );
      return data as Variant;
    }
    return null;
  }

  async function saveExistingVariant(v: Variant) {
    const priceValue = n(v.price, NaN);
    const qtyValue = Math.max(0, Math.trunc(n(v.qty, NaN)));
    const costValue =
      v.cost == null || String(v.cost).trim() === ""
        ? null
        : n(v.cost, NaN);

    if (!Number.isFinite(priceValue)) {
      toast({ intent: "error", message: "Enter a valid selling price." });
      return;
    }
    if (!Number.isFinite(qtyValue)) {
      toast({ intent: "error", message: "Enter a valid quantity." });
      return;
    }
    if (costValue != null && !Number.isFinite(costValue)) {
      toast({ intent: "error", message: "Enter a valid cost." });
      return;
    }

    const notesValue = String(v.public_notes ?? v.issue_notes ?? "").trim();
      const resolvedNotes =
        isNearMintCondition(v.condition)
        ? notesValue || "Near Mint Condition"
        : notesValue || null;

    setSavingVariantIds((prev) => ({ ...prev, [v.id]: true }));
    try {
      const scheduledReleaseAt = resolveScheduledReleaseAt();
      const updated = await updateVariant(v, {
        barcode: normalizeBarcode(v.barcode ?? "") || null,
        cost: costValue,
        price: priceValue,
        qty: qtyValue,
        ship_class: v.ship_class || null,
        release_at: getNextVariantReleaseAt(v, scheduledReleaseAt),
        public_notes: resolvedNotes,
        issue_notes: null,
        issue_photo_urls:
          supportsIssueDetailCondition(v.condition) &&
          v.issue_photo_urls &&
          v.issue_photo_urls.length
            ? v.issue_photo_urls
            : null,
      });
      if (!updated) return;
      toast({ intent: "success", message: "Variant saved." });
    } finally {
      setSavingVariantIds((prev) => ({ ...prev, [v.id]: false }));
    }
  }

  function generateBarcodeCandidate() {
    const stamp = Date.now().toString();
    const rand = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, "0");
    return (stamp + rand).slice(-12);
  }

  async function generateUniqueBarcode() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateBarcodeCandidate();
      const { data, error } = await supabase
        .from("product_variants")
        .select("id")
        .eq("barcode", candidate)
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) return candidate;
    }
    throw new Error("Unable to generate a unique barcode.");
  }

  async function recordGeneratedBarcode(
    productId: string,
    barcode: string,
    variantCondition: string,
    productTitle?: string,
    detailOverride?: string
  ) {
    const detail =
      detailOverride ?? [brand, model, variation].filter(Boolean).join(" ");
    const conditionLabel = variantCondition
      ? `Condition: ${formatConditionLabel(variantCondition, { upper: true })}`
      : "";
    const description = [detail, conditionLabel].filter(Boolean).join(" • ");
    const titleValue = String(productTitle ?? title ?? "").trim();

    const { data, error } = await supabase
      .from("barcode_logs")
      .insert({
        product_id: productId,
        product_title: titleValue || null,
        description: description || null,
        barcode,
      })
      .select("id,created_at,product_id,product_title,description,barcode")
      .single();

    if (error) {
      console.error("Failed to record barcode log:", error);
      return;
    }

    if (data) {
      setBarcodeLogs((prev) => [data as BarcodeLog, ...prev].slice(0, 25));
    }
  }

  const loadNiimbotLib = React.useCallback(async () => {
    if (niimbotLibRef.current) return niimbotLibRef.current;
    const lib = await import("@mmote/niimbluelib");
    niimbotLibRef.current = lib;
    return lib;
  }, []);

  const ensureNiimbotClient = React.useCallback(async () => {
    const supportMessage = getNiimbotSupportMessage();
    if (supportMessage) {
      throw new Error(supportMessage);
    }

    const lib = await loadNiimbotLib();
    if (!niimbotClientRef.current) {
      const client = lib.instantiateClient("bluetooth");
      client.on("connect", (event: any) => {
        const name = String(event?.info?.deviceName ?? "").trim();
        setNiimbotPrinterName(name);
        setNiimbotState("connected");
      });
      client.on("disconnect", () => {
        setNiimbotState("disconnected");
        setNiimbotPrinterName("");
      });
      niimbotClientRef.current = client;
    }

    return { lib, client: niimbotClientRef.current };
  }, [loadNiimbotLib]);

  const printInventoryBarcodeLabels = React.useCallback(
    async (labels: InventoryBarcodeLabelData[]) => {
      const printable = labels.filter(
        (label) => String(label.barcodeValue ?? "").trim().length > 0
      );
      if (!printable.length) {
        throw new Error("No barcode labels available to print.");
      }

      setPrintingBarcodeLabels(true);
      let client: any = null;
      try {
        const niimbot = await ensureNiimbotClient();
        const lib = niimbot.lib;
        client = niimbot.client;

        if (niimbotState !== "connected") {
          setNiimbotState("connecting");
          await client.connect();
          if (typeof client.fetchPrinterInfo === "function") {
            await client.fetchPrinterInfo();
          }
        }

        if (typeof client.stopHeartbeat === "function") {
          client.stopHeartbeat();
        }

        const printTaskName =
          (typeof client.getPrintTaskType === "function" &&
            client.getPrintTaskType()) ||
          "B1";
        const printTask = client.abstraction.newPrintTask(printTaskName, {
          totalPages: printable.length,
          density: 3,
          speed: 1,
          labelType: lib.LabelType.WithGaps,
          statusPollIntervalMs: 100,
          statusTimeoutMs: 8000,
        });

        await printTask.printInit();
        for (let index = 0; index < printable.length; index += 1) {
          const canvas = createInventoryBarcodeLabelCanvas(printable[index]);
          const encoded = lib.ImageEncoder.encodeCanvas(canvas, "top");
          await printTask.printPage(encoded, index + 1);
          await printTask.waitForFinished();
        }
        await printTask.printEnd();

        toast({
          intent: "success",
          message:
            printable.length === 1
              ? `Barcode printed${niimbotPrinterName ? ` on ${niimbotPrinterName}` : ""}.`
              : `${printable.length} barcode labels printed${niimbotPrinterName ? ` on ${niimbotPrinterName}` : ""}.`,
        });
      } finally {
        try {
          if (client && typeof client.startHeartbeat === "function") {
            client.startHeartbeat();
          }
        } catch {
          // Ignore heartbeat restart failures.
        }
        setPrintingBarcodeLabels(false);
      }
    },
    [ensureNiimbotClient, niimbotPrinterName, niimbotState]
  );

  function formatLogDate(value: string) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString("en-PH");
  }

  React.useEffect(() => {
    return () => {
      try {
        niimbotClientRef.current?.disconnect?.();
      } catch {
        // Ignore cleanup disconnect failures.
      }
    };
  }, []);

  function formatDateTimeLabel(value: string | null | undefined) {
    if (!value) return "Never";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString("en-PH");
  }

  function formatDaysLabel(value: number) {
    const days = Math.max(0, Math.trunc(value));
    return `${formatCount(days)} day${days === 1 ? "" : "s"}`;
  }

  function getBarcodeDetail(log: BarcodeLog) {
    const raw = String(log.description ?? "").trim();
    if (raw) {
      if (/condition:/i.test(raw)) {
        const withoutCondition = raw.split(/condition:/i)[0];
        return withoutCondition.replace(/[•›|\-–—\s]+$/g, "").trim();
      }
      const parts = raw
        .split("ƒ?›")
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length) {
        return parts[0].replace(/[•›|\-–—\s]+$/g, "").trim();
      }
      return raw.replace(/[•›|\-–—\s]+$/g, "").trim();
    }
    return String(log.product_title ?? "Item").trim() || "Item";
  }

  function downloadBarcodeLogsCsv() {
    if (!barcodeLogs.length) return;
    const rows = barcodeLogs.map((log) => [
      getBarcodeDetail(log),
      String(log.barcode ?? "").trim(),
    ]);
    const escape = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;
    const csv = rows
      .map((row) => row.map((value) => escape(String(value ?? ""))).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `generated-barcodes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function deleteVariant(v: Variant) {
    if (
      !confirm("Delete this variant? (Only do this if it has no sales history)")
    )
      return;

    const { data, error } = await supabase.rpc("fn_delete_variant", {
      p_variant_id: v.id,
      p_delete_cart_items: true,
    });

    if (error) {
      toast({ intent: "error", message: error.message });
      return;
    }

    if (!data?.ok) {
      const reason =
        data?.error === "HAS_ORDERS"
          ? "Cannot delete. This variant is linked to orders."
          : data?.error === "NOT_FOUND"
            ? "Variant not found."
            : "Delete failed.";
      toast({ intent: "error", message: reason });
      return;
    }

    toast({ intent: "success", message: "Variant deleted." });
    if (selectedProduct) await loadProduct(selectedProduct);
  }

  const emptyValuation: InventoryValuation = {
    units: 0,
    cost_value: 0,
    retail_value: 0,
    missing_cost_variants: 0,
  };
  const emptyStockHealth: InventoryStockHealth = {
    threshold_days: 60,
    recent_sales_days: 30,
    stale_variants: 0,
    stale_units: 0,
    stale_retail_value: 0,
    max_days_in_stock: 0,
    items: [],
  };
  const activeValuation = valuationActive ?? emptyValuation;
  const allValuation = valuationAll ?? emptyValuation;
  const activeStockHealth = stockHealthActive ?? emptyStockHealth;
  const allStockHealth = stockHealthAll ?? emptyStockHealth;
  const primaryValuation = includeArchived ? allValuation : activeValuation;
  const primaryStockHealth = includeArchived ? allStockHealth : activeStockHealth;
  const primaryMissing = primaryValuation.missing_cost_variants;
  const showUnknownCost = !assumeZeroCost && primaryMissing > 0;
  const costValueLabel = showUnknownCost
    ? "N/A"
    : formatPHP(primaryValuation.cost_value);
  const retailValueLabel = formatPHP(primaryValuation.retail_value);
  const profitValueLabel = showUnknownCost
    ? "N/A"
    : formatPHP(primaryValuation.retail_value - primaryValuation.cost_value);
  const activeCostLabel =
    !assumeZeroCost && activeValuation.missing_cost_variants > 0
      ? "N/A"
      : formatPHP(activeValuation.cost_value);
  const allCostLabel =
    !assumeZeroCost && allValuation.missing_cost_variants > 0
      ? "N/A"
      : formatPHP(allValuation.cost_value);
  const bulkHotWheelsPreview = React.useMemo(
    () => parseHotWheelsBulkLines(bulkHotWheelsLines, bulkHotWheelsCondition),
    [bulkHotWheelsCondition, bulkHotWheelsLines]
  );
  const selectedProductWithVariants = React.useMemo(() => {
    if (!selectedProduct) return null;
    return {
      ...selectedProduct,
      product_variants: variants,
    };
  }, [selectedProduct, variants]);
  const releaseSummary = React.useMemo(() => {
    if (!selectedProductWithVariants) return null;
    return getProductReleaseSummary(selectedProductWithVariants);
  }, [selectedProductWithVariants]);
  const hasLiveVariants = React.useMemo(
    () =>
      variants.some(
        (variant) =>
          Number(variant.qty ?? 0) > 0 && !isScheduledRelease(variant.release_at)
      ),
    [variants]
  );
  const hasScheduledVariants = React.useMemo(
    () => variants.some((variant) => isScheduledRelease(variant.release_at)),
    [variants]
  );
  const scheduledPostingFilteredItems = React.useMemo(() => {
    const term = scheduledPostingSearch.trim().toLowerCase();
    if (!term) return scheduledPostingItems;
    return scheduledPostingItems.filter((item) => {
      const product = item.product;
      return [
        product?.title,
        product?.brand,
        product?.model,
        product?.variation,
        item.barcode,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [scheduledPostingItems, scheduledPostingSearch]);
  const scheduledPostingProductCount = React.useMemo(
    () => new Set(scheduledPostingFilteredItems.map((item) => item.product_id)).size,
    [scheduledPostingFilteredItems]
  );
  const scheduledPostingUnitCount = React.useMemo(
    () =>
      scheduledPostingFilteredItems.reduce(
        (sum, item) => sum + Math.max(0, Number(item.qty ?? 0)),
        0
      ),
    [scheduledPostingFilteredItems]
  );
  const nextScheduledPostingAt = scheduledPostingFilteredItems[0]?.release_at ?? null;
  const scheduledReleasePreview = React.useMemo(() => {
    const scheduledReleaseAt = datetimeLocalToIso(scheduledReleaseAtInput);
    return scheduledReleaseAt ? formatReleaseDateTime(scheduledReleaseAt) : null;
  }, [scheduledReleaseAtInput]);
  const selectedExistingBarcodeMatch = React.useMemo(() => {
    if (!existingBarcodePrompt?.matches.length) return null;
    return (
      existingBarcodePrompt.matches.find(
        (match) => match.id === existingBarcodeVariantId
      ) ?? existingBarcodePrompt.matches[0]
    );
  }, [existingBarcodePrompt, existingBarcodeVariantId]);
  const selectedExistingBarcodeEffectivePrice = React.useMemo(() => {
    if (!selectedExistingBarcodeMatch) return 0;
    if (selectedExistingBarcodeMatch.sale_price != null) {
      return selectedExistingBarcodeMatch.sale_price;
    }
    if ((selectedExistingBarcodeMatch.discount_percent ?? 0) > 0) {
      return Number(
        (
          selectedExistingBarcodeMatch.price *
          ((100 -
            Math.min(
              Math.max(selectedExistingBarcodeMatch.discount_percent ?? 0, 0),
              100
            )) /
            100)
        ).toFixed(2)
      );
    }
    return selectedExistingBarcodeMatch.price;
  }, [selectedExistingBarcodeMatch]);
  const newVariantMarginInfo = React.useMemo(
    () => getMarginInfo(cost, price),
    [cost, price]
  );
  const visibleSearchResults =
    compactAddMode && !showAllSearchResults ? results.slice(0, 4) : results;
  const hiddenSearchResultCount = Math.max(0, results.length - visibleSearchResults.length);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">Inventory</div>
              <div className="text-sm text-white/60">
                Search, edit product identity, manage variants
                (qty/price/cost/barcode), and mark items as sold out.
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => setCompactAddMode((prev) => !prev)}
            >
              {compactAddMode ? "Compact Add: ON" : "Compact Add: OFF"}
            </Button>
          </div>
        </CardHeader>

        <CardBody className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setInventoryView("editor")}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                inventoryView === "editor"
                  ? "border-accent-500 bg-accent-500/20 text-white"
                  : "border-white/10 bg-bg-900/40 text-white/70 hover:bg-bg-900/70"
              }`}
            >
              Inventory Editor
            </button>
            <button
              type="button"
              onClick={() => setInventoryView("refresher")}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                inventoryView === "refresher"
                  ? "border-accent-500 bg-accent-500/20 text-white"
                  : "border-white/10 bg-bg-900/40 text-white/70 hover:bg-bg-900/70"
              }`}
            >
              Inventory Refresher
            </button>
            <button
              type="button"
              onClick={() => setInventoryView("insights")}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                inventoryView === "insights"
                  ? "border-accent-500 bg-accent-500/20 text-white"
                  : "border-white/10 bg-bg-900/40 text-white/70 hover:bg-bg-900/70"
              }`}
            >
              Inventory Insights
            </button>
            <button
              type="button"
              onClick={() => setInventoryView("scheduled")}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                inventoryView === "scheduled"
                  ? "border-accent-500 bg-accent-500/20 text-white"
                  : "border-white/10 bg-bg-900/40 text-white/70 hover:bg-bg-900/70"
              }`}
            >
              Scheduled Posting
            </button>
          </div>

          {inventoryView === "refresher" ? (
            <InventoryRefresher inventoryUnitsInStock={valuationActive?.units ?? null} />
          ) : null}

          {inventoryView === "scheduled" ? (
            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">Scheduled Posting Queue</div>
                  <div className="text-sm text-white/60">
                    Future-release variants that will go live automatically based on
                    their scheduled release time.
                  </div>
                </div>
                <Button
                  variant="ghost"
                  onClick={loadScheduledPostingItems}
                  disabled={scheduledPostingLoading}
                >
                  {scheduledPostingLoading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                  <div className="text-xs text-white/60">Scheduled variants</div>
                  <div className="text-lg font-semibold">
                    {scheduledPostingFilteredItems.length}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                  <div className="text-xs text-white/60">Products affected</div>
                  <div className="text-lg font-semibold">
                    {scheduledPostingProductCount}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                  <div className="text-xs text-white/60">Units scheduled</div>
                  <div className="text-lg font-semibold">
                    {scheduledPostingUnitCount}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                  <div className="text-xs text-white/60">Next release</div>
                  <div className="text-sm font-semibold">
                    {nextScheduledPostingAt
                      ? formatReleaseDateTime(nextScheduledPostingAt)
                      : "None"}
                  </div>
                </div>
              </div>

              <div className="max-w-xl">
                <Input
                  placeholder="Search scheduled items by title, brand, model, variation, or barcode..."
                  value={scheduledPostingSearch}
                  onChange={(e) => setScheduledPostingSearch(e.target.value)}
                />
              </div>

              {scheduledPostingError ? (
                <div className="text-sm text-red-200">{scheduledPostingError}</div>
              ) : null}

              {scheduledPostingLoading && !scheduledPostingItems.length ? (
                <div className="text-sm text-white/60">Loading scheduled items...</div>
              ) : null}

              {!scheduledPostingLoading && !scheduledPostingFilteredItems.length ? (
                <div className="rounded-xl border border-white/10 bg-paper/5 p-4 text-sm text-white/60">
                  No scheduled items found.
                </div>
              ) : null}

              {scheduledPostingFilteredItems.length ? (
                <div className="grid gap-3">
                  {scheduledPostingFilteredItems.map((item) => {
                    const product = item.product;
                    const imageUrl =
                      Array.isArray(product?.image_urls) && product.image_urls.length
                        ? product.image_urls[0]
                        : null;
                    const metaLine = [product?.brand, product?.model, product?.variation]
                      .filter(Boolean)
                      .join(" | ");

                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-white/10 bg-paper/5 p-3"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                          <div className="h-20 w-20 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={product?.title ?? "Scheduled item"}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-white/35">
                                No Image
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium leading-tight">
                                {product?.title ?? "Unknown product"}
                              </div>
                              <Badge className="border-amber-400/45 bg-amber-500/18 text-amber-100">
                                Scheduled
                              </Badge>
                            </div>
                            {metaLine ? (
                              <div className="text-xs text-white/55">{metaLine}</div>
                            ) : null}
                            <div className="text-xs text-white/65">
                              {formatConditionLabel(item.condition)} | Qty{" "}
                              {Math.max(0, Number(item.qty ?? 0))} | Price{" "}
                              {formatPHP(Number(item.price ?? 0))}
                            </div>
                            <div className="text-xs text-white/50">
                              Ship class: {item.ship_class ?? "-"}
                              {" | "}Barcode: {item.barcode ?? "-"}
                            </div>
                            <div className="text-xs text-white/50">
                              Releases at {formatReleaseDateTime(item.release_at)}
                            </div>
                          </div>

                          <div className="shrink-0">
                            <Button
                              variant="secondary"
                              onClick={() => void openScheduledPostingItem(item)}
                              disabled={!product}
                            >
                              Open in editor
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {inventoryView === "insights" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Inventory Worth</div>
                    <div className="text-xs text-white/60">
                      Scope: {includeArchived ? "All inventory (active + sold out)" : "Active products only"}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Checkbox
                      checked={includeArchived}
                      onChange={setIncludeArchived}
                      label="Include sold out"
                    />
                    <Checkbox
                      checked={assumeZeroCost}
                      onChange={setAssumeZeroCost}
                      label="Missing cost = 0"
                    />
                    <Button
                      variant="ghost"
                      onClick={() => {
                        void loadValuations();
                        void loadWorthMovement();
                      }}
                      disabled={valuationLoading || worthMovementLoading}
                    >
                      {valuationLoading || worthMovementLoading ? "Refreshing..." : "Refresh"}
                    </Button>
                  </div>
                </div>

                {valuationError ? (
                  <div className="text-sm text-red-200">{valuationError}</div>
                ) : null}
                {!valuationActive && !valuationAll && valuationLoading ? (
                  <div className="text-sm text-white/60">Loading valuation...</div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                    <div className="text-xs text-white/60">Units in stock</div>
                    <div className="text-lg font-semibold">
                      {formatCount(primaryValuation.units)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                    <div className="text-xs text-white/60">Cost basis</div>
                    <div className="text-lg font-semibold">{costValueLabel}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                    <div className="text-xs text-white/60">Retail value</div>
                    <div className="text-lg font-semibold">{retailValueLabel}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                    <div className="text-xs text-white/60">Potential profit</div>
                    <div className="text-lg font-semibold">{profitValueLabel}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                    <div className="text-xs text-white/60">Missing cost variants</div>
                    <div className="text-lg font-semibold">
                      {formatCount(primaryMissing)}
                    </div>
                  </div>
                </div>

                {showUnknownCost ? (
                  <div className="text-xs text-yellow-200">
                    Missing cost for {formatCount(primaryMissing)} variants. Enable
                    "Missing cost = 0" to estimate cost and profit.
                  </div>
                ) : null}

                <div className="text-xs text-white/50 space-y-1">
                  <div>
                    Active: {formatCount(activeValuation.units)} units | Cost{" "}
                    {activeCostLabel} | Retail{" "}
                    {formatPHP(activeValuation.retail_value)} | Missing cost{" "}
                    {formatCount(activeValuation.missing_cost_variants)}
                  </div>
                  <div>
                    All: {formatCount(allValuation.units)} units | Cost {allCostLabel}{" "}
                    | Retail {formatPHP(allValuation.retail_value)} | Missing cost{" "}
                    {formatCount(allValuation.missing_cost_variants)}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[180px_180px_minmax(0,1fr)]">
                  <Input
                    label="From"
                    type="date"
                    value={worthMovementFrom}
                    onChange={(e) => setWorthMovementFrom(e.target.value)}
                  />
                  <Input
                    label="To"
                    type="date"
                    value={worthMovementTo}
                    onChange={(e) => setWorthMovementTo(e.target.value)}
                  />
                  <div className="rounded-xl border border-white/10 bg-paper/5 px-3 py-3 text-xs text-white/60 md:self-end">
                    Uses stock movement history with current variant cost and price snapshots
                    to show daily net movement in inventory worth.
                  </div>
                </div>

                {worthMovementError ? (
                  <div className="text-sm text-red-200">{worthMovementError}</div>
                ) : null}

                <InventoryWorthMovementChart
                  from={worthMovementFrom}
                  to={worthMovementTo}
                  loading={worthMovementLoading}
                  metric={worthMovementMetric}
                  points={worthMovementPoints}
                  onMetricChange={setWorthMovementMetric}
                />

                <div className="rounded-xl border border-white/10 bg-paper/5 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">Slow Stock</div>
                      <div className="text-xs text-white/60">
                        Variants still in stock after{" "}
                        {formatCount(primaryStockHealth.threshold_days)}+ days with
                        no paid sales in the last{" "}
                        {formatCount(primaryStockHealth.recent_sales_days)} days.
                      </div>
                    </div>
                    <div className="text-xs text-white/50">
                      Oldest current stock:{" "}
                      {formatDaysLabel(primaryStockHealth.max_days_in_stock)}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3">
                      <div className="text-xs text-white/60">Stale variants</div>
                      <div className="text-lg font-semibold">
                        {formatCount(primaryStockHealth.stale_variants)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3">
                      <div className="text-xs text-white/60">Units sitting</div>
                      <div className="text-lg font-semibold">
                        {formatCount(primaryStockHealth.stale_units)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3">
                      <div className="text-xs text-white/60">
                        Retail value at risk
                      </div>
                      <div className="text-lg font-semibold">
                        {formatPHP(primaryStockHealth.stale_retail_value)}
                      </div>
                    </div>
                  </div>

                  {primaryStockHealth.items.length ? (
                    <div className="space-y-2">
                      {primaryStockHealth.items.map((item) => {
                        const safeMetaLine = [item.brand, item.model, item.variation]
                          .filter(Boolean)
                          .join(" | ");

                        return (
                          <div
                            key={item.variant_id}
                            className="rounded-xl border border-white/10 bg-bg-900/40 p-3"
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                                {item.image_url ? (
                                  <img
                                    src={item.image_url}
                                    alt={item.title}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-white/35">
                                    No Image
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="font-medium leading-tight">
                                  {item.title}
                                </div>
                                {safeMetaLine ? (
                                  <div className="text-xs text-white/55">
                                    {safeMetaLine}
                                  </div>
                                ) : null}
                                <div className="text-xs text-white/65">
                                  {formatConditionLabel(item.condition)} | Qty{" "}
                                  {formatCount(item.qty)} | In stock{" "}
                                  {formatDaysLabel(item.days_in_stock)}
                                </div>
                                <div className="text-xs text-white/50">
                                  In stock since{" "}
                                  {formatDateTimeLabel(
                                    item.in_stock_since ?? item.first_stocked_at
                                  )}
                                  {" | "}Last added{" "}
                                  {formatDateTimeLabel(item.last_stock_added_at)}
                                  {" | "}Last qty change{" "}
                                  {formatDateTimeLabel(item.last_qty_changed_at)}
                                </div>
                                <div className="text-xs text-white/50">
                                  Recent sold: {formatCount(item.sold_recent)}
                                  {" | "}Lifetime sold:{" "}
                                  {formatCount(item.sold_lifetime)}
                                  {" | "}Last sold{" "}
                                  {formatDateTimeLabel(item.last_sold_at)}
                                </div>
                              </div>

                              <div className="shrink-0 text-left lg:text-right">
                                <div className="text-sm font-semibold">
                                  {formatPHP(item.retail_value)}
                                </div>
                                <div className="text-xs text-white/50">
                                  on hand value
                                </div>
                                <Button
                                  variant="ghost"
                                  className="mt-2"
                                  onClick={() => router.push(`/product/${item.product_id}`)}
                                >
                                  View page
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-white/60">
                      No in-stock variants currently meet the slow-stock rule for
                      this scope.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {inventoryView === "editor" ? (
          <>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium">Release scheduling</div>
                <div className="text-xs text-white/60">
                  When enabled, every inventory change on this page is saved with
                  the same future go-live time.
                </div>
              </div>
              {scheduledReleasePreview ? (
                <Badge className="border-amber-400/45 bg-amber-500/18 text-amber-100">
                  Goes live {scheduledReleasePreview}
                </Badge>
              ) : null}
            </div>

            <Checkbox
              checked={scheduleReleaseEnabled}
              onChange={setScheduleReleaseEnabled}
              label="Schedule release"
            />

            {scheduleReleaseEnabled ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Go live at"
                  type="datetime-local"
                  value={scheduledReleaseAtInput}
                  onChange={(e) => setScheduledReleaseAtInput(e.target.value)}
                />
                <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-50/90">
                  New variants, added stock, edited variants, and product saves on
                  this page will all use this release time.
                </div>
              </div>
            ) : null}

            {releaseSummary ? (
              <div className="text-xs text-white/55">
                Current product status: {releaseSummary.label}
              </div>
            ) : (
              <div className="text-xs text-white/55">
                New items publish immediately when scheduling is off.
              </div>
            )}

            {scheduleReleaseEnabled && selectedProduct ? (
              <div className="text-xs text-amber-100/85">
                Saving this product will reschedule all of its variants to the
                selected go-live time.
              </div>
            ) : null}

            {!scheduleReleaseEnabled && selectedProduct && hasScheduledVariants ? (
              <Checkbox
                checked={publishScheduledNow}
                onChange={setPublishScheduledNow}
                label="Publish existing scheduled variants immediately on save"
              />
            ) : null}
          </div>

          {/* Inventory worth */}
          {false ? (
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Inventory Worth</div>
                <div className="text-xs text-white/60">
                  Scope: {includeArchived ? "All inventory (active + sold out)" : "Active products only"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Checkbox
                  checked={includeArchived}
                  onChange={setIncludeArchived}
                  label="Include sold out"
                />
                <Checkbox
                  checked={assumeZeroCost}
                  onChange={setAssumeZeroCost}
                  label="Missing cost = 0"
                />
                <Button
                  variant="ghost"
                  onClick={loadValuations}
                  disabled={valuationLoading}
                >
                  {valuationLoading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>

            {valuationError ? (
              <div className="text-sm text-red-200">{valuationError}</div>
            ) : null}
            {!valuationActive && !valuationAll && valuationLoading ? (
              <div className="text-sm text-white/60">Loading valuation...</div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                <div className="text-xs text-white/60">Units in stock</div>
                <div className="text-lg font-semibold">
                  {formatCount(primaryValuation.units)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                <div className="text-xs text-white/60">Cost basis</div>
                <div className="text-lg font-semibold">{costValueLabel}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                <div className="text-xs text-white/60">Retail value</div>
                <div className="text-lg font-semibold">{retailValueLabel}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                <div className="text-xs text-white/60">Potential profit</div>
                <div className="text-lg font-semibold">{profitValueLabel}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                <div className="text-xs text-white/60">Missing cost variants</div>
                <div className="text-lg font-semibold">
                  {formatCount(primaryMissing)}
                </div>
              </div>
            </div>

            {showUnknownCost ? (
              <div className="text-xs text-yellow-200">
                Missing cost for {formatCount(primaryMissing)} variants. Enable
                "Missing cost = 0" to estimate cost and profit.
              </div>
            ) : null}

            <div className="text-xs text-white/50 space-y-1">
              <div>
                Active: {formatCount(activeValuation.units)} units | Cost{" "}
                {activeCostLabel} | Retail{" "}
                {formatPHP(activeValuation.retail_value)} | Missing cost{" "}
                {formatCount(activeValuation.missing_cost_variants)}
              </div>
              <div>
                All: {formatCount(allValuation.units)} units | Cost {allCostLabel}{" "}
                | Retail {formatPHP(allValuation.retail_value)} | Missing cost{" "}
                {formatCount(allValuation.missing_cost_variants)}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-paper/5 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">Slow Stock</div>
                  <div className="text-xs text-white/60">
                    Variants still in stock after{" "}
                    {formatCount(primaryStockHealth.threshold_days)}+ days with
                    no paid sales in the last{" "}
                    {formatCount(primaryStockHealth.recent_sales_days)} days.
                  </div>
                </div>
                <div className="text-xs text-white/50">
                  Oldest current stock:{" "}
                  {formatDaysLabel(primaryStockHealth.max_days_in_stock)}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3">
                  <div className="text-xs text-white/60">Stale variants</div>
                  <div className="text-lg font-semibold">
                    {formatCount(primaryStockHealth.stale_variants)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3">
                  <div className="text-xs text-white/60">Units sitting</div>
                  <div className="text-lg font-semibold">
                    {formatCount(primaryStockHealth.stale_units)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3">
                  <div className="text-xs text-white/60">
                    Retail value at risk
                  </div>
                  <div className="text-lg font-semibold">
                    {formatPHP(primaryStockHealth.stale_retail_value)}
                  </div>
                </div>
              </div>

              {primaryStockHealth.items.length ? (
                <div className="space-y-2">
                  {primaryStockHealth.items.map((item) => {
                    const metaLine = [item.brand, item.model, item.variation]
                      .filter(Boolean)
                      .join(" • ");

                    const safeMetaLine = [item.brand, item.model, item.variation]
                      .filter(Boolean)
                      .join(" | ");

                    return (
                      <div
                        key={item.variant_id}
                        className="rounded-xl border border-white/10 bg-bg-900/40 p-3"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-white/35">
                                No Image
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="font-medium leading-tight">
                              {item.title}
                            </div>
                            {safeMetaLine ? (
                              <div className="text-xs text-white/55">
                                {safeMetaLine}
                              </div>
                            ) : null}
                            <div className="text-xs text-white/65">
                              {formatConditionLabel(item.condition)} | Qty{" "}
                              {formatCount(item.qty)} | In stock{" "}
                              {formatDaysLabel(item.days_in_stock)}
                            </div>
                            <div className="text-xs text-white/50">
                              In stock since{" "}
                              {formatDateTimeLabel(
                                item.in_stock_since ?? item.first_stocked_at
                              )}
                              {" | "}Last added{" "}
                              {formatDateTimeLabel(item.last_stock_added_at)}
                              {" | "}Last qty change{" "}
                              {formatDateTimeLabel(item.last_qty_changed_at)}
                            </div>
                            <div className="text-xs text-white/50">
                              Recent sold: {formatCount(item.sold_recent)}
                              {" | "}Lifetime sold:{" "}
                              {formatCount(item.sold_lifetime)}
                              {" | "}Last sold{" "}
                              {formatDateTimeLabel(item.last_sold_at)}
                            </div>
                          </div>

                          <div className="shrink-0 text-left lg:text-right">
                            <div className="text-sm font-semibold">
                              {formatPHP(item.retail_value)}
                            </div>
                            <div className="text-xs text-white/50">
                              on hand value
                            </div>
                            <Button
                              variant="ghost"
                              className="mt-2"
                              onClick={() => router.push(`/product/${item.product_id}`)}
                            >
                              View page
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-white/60">
                  No in-stock variants currently meet the slow-stock rule for
                  this scope.
                </div>
              )}
            </div>
          </div>
          ) : null}

          {/* Search */}
          <div
            ref={productEditorRef}
            className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3"
          >
            <div className="font-semibold">Search products</div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Search title/brand/model/variation... (or barcode)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void runSearch();
                    }
                  }}
                />
              </div>
              <Button variant="secondary" onClick={runSearch}>
                Search
              </Button>
              <Button variant="ghost" onClick={clearProduct}>
                New
              </Button>
            </div>

            {results.length ? (
              <div className="grid gap-2">
                {visibleSearchResults.map((p) => {
                  const img =
                    Array.isArray(p.image_urls) && p.image_urls.length
                      ? p.image_urls[0]
                      : null;

                  return (
                    <div
                      key={p.id}
                      className="rounded-xl border border-white/10 bg-paper/5 px-3 py-2 transition hover:bg-paper/10"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <button
                          type="button"
                          onClick={() => loadProduct(p)}
                          className="flex min-w-0 flex-1 gap-3 text-left"
                        >
                          <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-white/10 bg-bg-800">
                            {img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={img}
                                alt={p.title}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3 font-medium">
                              <span className="truncate">{p.title}</span>
                              <span
                                className={
                                  p.is_active
                                    ? "text-xs text-accent-700 dark:text-accent-200"
                                    : "text-xs text-red-300"
                                }
                              >
                                {p.is_active ? "ACTIVE" : "SOLD OUT"}
                              </span>
                            </div>
                            <div className="text-xs text-white/60">
                              {p.brand ?? "-"} {p.model ? `• ${p.model}` : ""}{" "}
                              {p.variation ? `• ${p.variation}` : ""}
                            </div>
                          </div>
                        </button>

                        <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void openProductForQuickVariantMode(p, "existing")}
                          >
                            Existing Variant
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void openProductForQuickVariantMode(p, "new")}
                          >
                            New Variant
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {hiddenSearchResultCount > 0 ? (
                  <Button
                    variant="ghost"
                    onClick={() => setShowAllSearchResults(true)}
                  >
                    Show {hiddenSearchResultCount} more result
                    {hiddenSearchResultCount === 1 ? "" : "s"}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-white/50">
                Search then select a product to edit, or click “New”.
              </div>
            )}
          </div>

          {/* Lookup tools */}
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
              <div className="font-semibold">
                Barcode Lookup (for identity + images)
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Scan or enter barcode..."
                    value={barcodeLookup}
                    autoFocus
                    ref={barcodeInputRef}
                    onChange={(e) => {
                      const next = e.target.value;
                      setBarcodeLookup(next);
                      scheduleBarcodeLookup(next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Tab" && !e.shiftKey) {
                        e.preventDefault();
                        brandInputRef.current?.focus();
                        return;
                      }
                      if (e.key === "Enter") {
                        e.preventDefault();
                        lookupBarcode();
                      }
                    }}
                  />
                </div>
              <Button
                variant="secondary"
                onClick={() => setBarcodeScannerOpen(true)}
                disabled={quickAddBusy}
              >
                Scan
              </Button>
              <Button
                variant="secondary"
                onClick={() => lookupBarcode()}
                disabled={lookupLoading || quickAddBusy}
              >
                {lookupLoading ? "Looking up..." : "Lookup"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Checkbox
                checked={quickAddEnabled}
                onChange={(next) => {
                  setQuickAddEnabled(next);
                  if (next) setQuickAddConfigOpen(true);
                }}
                label="Quick Add"
                disabled={quickAddBusy}
              />
              {quickAddEnabled ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setQuickAddConfigOpen(true)}
                    disabled={quickAddBusy}
                  >
                    Edit
                  </Button>
                  <div className="text-xs text-white/60">
                    +{Math.max(1, Math.trunc(n(quickAddQty, 1)))} each scan |{" "}
                    {quickAddCondition === "any"
                      ? "Any variation"
                      : formatConditionLabel(quickAddCondition)}
                  </div>
                </>
              ) : null}
            </div>

            {lookupMsg ? (
              <div className="text-sm text-white/70">{lookupMsg}</div>
            ) : null}

              <BarcodeScannerModal
                open={barcodeScannerOpen}
                onClose={() => setBarcodeScannerOpen(false)}
                onScan={(value) => {
                  const next = normalizeBarcode(value);
                  if (!next) return;
                  lastAutoLookupRef.current = next;
                  setBarcodeLookup(next);
                  lookupBarcode(next);
                  setBarcodeScannerOpen(false);
                  focusBarcodeInput();
                }}
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
              <div className="font-semibold">Item URL Lookup</div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Paste product URL..."
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      const normalized = normalizeUrlInput(text);
                      if (!normalized) return;
                      setProductUrl(normalized);
                      requestAnimationFrame(() => lookupProductUrl());
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        lookupProductUrl();
                      }
                    }}
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={lookupProductUrl}
                  disabled={productUrlLoading}
                >
                  {productUrlLoading ? "Looking up..." : "Lookup URL"}
                </Button>
              </div>

              {productUrlMsg ? (
                <div className="text-sm text-white/70">{productUrlMsg}</div>
              ) : null}
              <div className="text-xs text-white/50">
                URL lookup auto-fills Product Identity and adds images directly.
              </div>
            </div>
          </div>

          {/* Product identity */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Product Identity</div>
              <div className="flex flex-wrap items-center gap-2">
                {releaseSummary ? (
                  <Badge className={getReleaseBadgeClass(releaseSummary.state)}>
                    {releaseSummary.label}
                  </Badge>
                ) : null}
                {selectedProduct ? (
                  <Badge>{selectedProduct.id.slice(0, 8)}</Badge>
                ) : (
                  <Badge>NEW</Badge>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Title"
                  value={title}
                  onChange={(e) => {
                    const rawTitle = e.target.value;
                    const commaCount = (rawTitle.match(/,/g) || []).length;
                    const nextTitle = rawTitle.replace(/,/g, " ");
                    if (nextTitle.trim()) {
                      titleEditedRef.current = true;
                    } else {
                      titleEditedRef.current = false;
                      lastAutoTitleRef.current = "";
                      titleCommaStageRef.current = 0;
                      lastAutoIdentityRef.current = {
                        brand: "",
                        model: "",
                        variation: "",
                      };
                    }
                    if (commaCount) {
                      const normalizedTitle = nextTitle.replace(/\s+/g, " ").trim();
                      const previousStage = titleCommaStageRef.current;
                      const nextStage = Math.min(previousStage + commaCount, 2);
                      if (previousStage < 1 && nextStage >= 1) {
                        const nextBrand = normalizedTitle;
                        if (nextBrand) {
                          setBrand(nextBrand);
                          lastAutoIdentityRef.current.brand = nextBrand;
                        }
                      }
                      if (previousStage < 2 && nextStage >= 2) {
                        const brandPart = lastAutoIdentityRef.current.brand;
                        let remainder = normalizedTitle;
                        if (
                          brandPart &&
                          remainder.toLowerCase().startsWith(brandPart.toLowerCase())
                        ) {
                          remainder = remainder.slice(brandPart.length).trim();
                        }
                        if (remainder) {
                          setModel(remainder);
                          lastAutoIdentityRef.current.model = remainder;
                        }
                      }
                      titleCommaStageRef.current = nextStage;
                    }
                    setTitle(nextTitle);
                    syncIdentityFromTitle(nextTitle);
                  }}
                />
                <div className="relative">
                  <Input
                    ref={brandInputRef}
                    label="Diecast Brand"
                    role="combobox"
                    aria-expanded={showBrandSuggestions}
                    aria-controls="inventory-brand-suggestions"
                    aria-activedescendant={
                      brandSuggestionIndex >= 0
                        ? `inventory-brand-suggestion-${brandSuggestionIndex}`
                        : undefined
                    }
                    autoComplete="off"
                    value={brand}
                    onFocus={() => {
                      if (filteredBrandSuggestions.length) {
                        setBrandAutocompleteOpen(true);
                      }
                    }}
                    onBlur={() => {
                      setBrandAutocompleteOpen(false);
                      setBrandSuggestionIndex(-1);
                    }}
                    onChange={(e) => {
                      const nextBrand = e.target.value;
                      setBrand(nextBrand);
                      setBrandAutocompleteOpen(true);
                      setBrandSuggestionIndex(-1);
                      syncTitleFromIdentity(nextBrand, model, variation);
                    }}
                    onKeyDown={handleBrandInputKeyDown}
                  />
                  {showBrandSuggestions ? (
                    <div
                      id="inventory-brand-suggestions"
                      role="listbox"
                      className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-2xl border border-[#2d3a22] bg-[#192014] shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
                    >
                      {filteredBrandSuggestions.map((suggestion, index) => {
                        const isActive = index === brandSuggestionIndex;
                        return (
                          <button
                            key={suggestion}
                            id={`inventory-brand-suggestion-${index}`}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onMouseEnter={() => setBrandSuggestionIndex(index)}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selectBrandSuggestion(suggestion);
                            }}
                            className={[
                              "flex w-full items-center px-4 py-3 text-left text-sm transition",
                              isActive
                                ? "bg-[#27331e] text-white"
                                : "text-[#eef4e7]/90 hover:bg-[#222c1b]",
                            ].join(" ")}
                          >
                            {suggestion}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <Input
                  ref={modelInputRef}
                  label="Car Model"
                  value={model}
                  onChange={(e) => {
                    const nextModel = e.target.value;
                    setModel(nextModel);
                    syncTitleFromIdentity(brand, nextModel, variation);
                  }}
                />
                <Input
                  label="Color / Style (Variation)"
                  value={variation}
                  onChange={(e) => {
                    const nextVariation = e.target.value;
                    setVariation(nextVariation);
                    syncTitleFromIdentity(brand, model, nextVariation);
                  }}
                />
              </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Product tags</div>
              <ProductSpecialTagPicker
                value={specialTags}
                onChange={setSpecialTags}
                disabled={saving}
              />
              <div className="text-xs text-white/50">
                These tags drive the standout badges shown on shop product cards.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={saveProductOnly}
                disabled={!selectedProduct || saving}
              >
                Save Product Changes
              </Button>

              {selectedProduct ? (
                selectedProduct.is_active ? (
                  <Button
                    variant="ghost"
                    onClick={() => toggleArchive(false)}
                    disabled={saving}
                  >
                    Mark sold out
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => toggleArchive(true)}
                    disabled={saving}
                  >
                    Restore to active
                  </Button>
                )
              ) : null}
            </div>
          </div>

          {/* Images */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Images</div>
              <Badge>Confirm before saving</Badge>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="md:col-span-2">
                <Input
                  label="Add image URL (optional)"
                  placeholder="https://..."
                  value={manualImageUrl}
                  onChange={(e) => setManualImageUrl(e.target.value)}
                  onPaste={handleManualUrlPaste}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={addManualUrl}
                  disabled={!manualImageUrl.trim()}
                >
                  Add URL
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
              <div className="text-sm font-medium mb-2">
                Upload image files (optional)
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const list = orderUploadedFilesTopToBottom(
                    Array.from(e.target.files ?? [])
                  );
                  if (!list.length) return;
                  const pid = selectedProduct?.id ?? crypto.randomUUID();
                  void uploadImageFiles(list, pid);
                  e.currentTarget.value = "";
                }}
              />
              <div className="text-xs text-white/50 mt-1">
                Select multiple images from your gallery.
              </div>
              <div className="text-xs text-white/50 mt-1">
                Mobile opens your photo library.
              </div>
              {manualUploadLoading ? (
                <div className="text-xs text-white/60 mt-1">Uploading...</div>
              ) : null}
              <div className="text-xs text-white/50 mt-1">
                Requires bucket:{" "}
                <code className="text-white/70">product-images</code>
              </div>
            </div>

            <div
              className="rounded-xl border border-dashed border-white/15 bg-bg-900/40 p-3 text-sm text-white/60"
              tabIndex={0}
              onClick={(e) => (e.currentTarget as HTMLDivElement).focus()}
              onPaste={handleImagePaste}
            >
              Paste image here (click box, then press Ctrl+V).
            </div>

            {images.length === 0 ? (
              <div className="text-sm text-white/50">No images yet.</div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {images.slice(0, 9).map((u, idx) => {
                    const preview = parseImageCrop(u);
                    return (
                      <div
                        key={`${u}-${idx}`}
                        draggable
                        className="rounded-xl border border-white/10 bg-bg-900/40 overflow-hidden"
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(idx));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleImageDrop(e, idx);
                        }}
                      >
                        <div
                          className="aspect-[4/3] w-full overflow-hidden bg-neutral-50 cursor-pointer"
                          onClick={() => openCropEditor(u, idx)}
                          title="Click to adjust crop"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={preview.src}
                            alt=""
                            className="h-full w-full object-contain"
                            style={cropStyle(preview.crop)}
                          />
                        </div>
                        <div className="p-3 space-y-2">
                          <Checkbox
                            checked={!!selectedImages[u]}
                            onChange={(v) =>
                              setSelectedImages((m) => ({ ...m, [u]: v }))
                            }
                            label="Use this image"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => openCropEditor(u, idx)}
                            >
                              Adjust crop
                            </Button>
                            <a
                              href={preview.src}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-white/60 hover:text-white"
                            >
                              Open original
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-white/50">
                  Drag images to reorder.
                </div>
              </>
            )}
          </div>

          {/* Variants list (edit) */}
          <div
            ref={existingVariantsSectionRef}
            className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="font-semibold">Existing Variants</div>
                <Badge>{variants.length}</Badge>
              </div>
              {compactAddMode && variants.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowExistingVariants((prev) => !prev)}
                >
                  {showExistingVariants ? "Hide" : "Show"}
                </Button>
              ) : null}
            </div>

            {compactAddMode && variants.length > 0 && !showExistingVariants ? (
              <div className="text-xs text-white/60">
                Hidden to keep add flow compact. Click "Show" to edit existing variants.
              </div>
            ) : loadingVariants ? (
              <div className="text-white/60">Loading variants…</div>
            ) : variants.length === 0 ? (
              <div className="text-white/60">
                No variants yet for this product.
              </div>
            ) : (
              <div className="space-y-3">
                {variants.map((v) => {
                  const noteValue = String(
                    v.public_notes ?? v.issue_notes ?? ""
                  ).trim();
                  const noteTone =
                    isIssueCondition(v.condition)
                      ? "text-red-200/80"
                      : isNearMintCondition(v.condition)
                        ? "text-amber-200/80"
                        : "text-white/60";
                  const indicatorTone =
                    isIssueCondition(v.condition)
                      ? "bg-red-400"
                      : isNearMintCondition(v.condition)
                        ? "bg-amber-400"
                        : "";
                  const showIndicator = indicatorTone.length > 0;
                  const isSavingVariant = Boolean(savingVariantIds[v.id]);

                  return (
                    <div
                      key={v.id}
                      className="rounded-xl border border-white/10 bg-paper/5 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">
                            {formatConditionLabel(v.condition, {
                              upper: true,
                              shipClass: v.ship_class,
                            })}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge
                              className={getReleaseBadgeClass(
                                isScheduledRelease(v.release_at)
                                  ? "scheduled"
                                  : v.release_at
                                    ? "released"
                                    : Number(v.qty ?? 0) > 0
                                      ? "live"
                                      : "draft"
                              )}
                            >
                              {getVariantReleaseLabel(v)}
                            </Badge>
                          </div>
                          {noteValue ? (
                            <div
                              className={`mt-1 flex items-center gap-2 text-xs ${noteTone}`}
                            >
                              {showIndicator ? (
                                <span
                                  className={`h-2 w-2 rounded-full ${indicatorTone}`}
                                  aria-hidden="true"
                                />
                              ) : null}
                              <span>{noteValue}</span>
                            </div>
                          ) : null}
                        </div>
                        <div className="text-xs text-white/50">
                          Variant #{v.id.slice(0, 8)}
                        </div>
                      </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-6">
                      <Input
                        label="Barcode"
                        value={v.barcode ?? ""}
                        onChange={(e) =>
                          updateVariantDraft(v.id, {
                            barcode: e.target.value || null,
                          })
                        }
                      />
                      <Input
                        label="Cost"
                        value={String(v.cost ?? "")}
                        onChange={(e) =>
                          updateVariantDraft(v.id, {
                            cost: e.target.value ? n(e.target.value) : null,
                          })
                        }
                      />
                      <Input
                        label="Price"
                        value={String(v.price ?? "")}
                        onChange={(e) =>
                          updateVariantDraft(v.id, { price: n(e.target.value) })
                        }
                      />
                      <div className="space-y-1">
                        <div className="text-sm text-white/80">Qty</div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            type="button"
                            className="h-10 w-10 px-0"
                            onClick={() => stepExistingQty(v, -1)}
                            aria-label="Decrease quantity"
                          >
                            -
                          </Button>
                          <div className="flex-1">
                            <Input
                              value={String(v.qty ?? 0)}
                              onChange={(e) =>
                                updateVariantDraft(v.id, {
                                  qty: Math.max(
                                    0,
                                    Math.trunc(n(e.target.value))
                                  ),
                                })
                              }
                            />
                          </div>
                          <Button
                            variant="ghost"
                            type="button"
                            className="h-10 w-10 px-0"
                            onClick={() => stepExistingQty(v, 1)}
                            aria-label="Increase quantity"
                          >
                            +
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            value={addQtyByVariant[v.id] ?? ""}
                            onChange={(e) =>
                              setAddQtyByVariant((prev) => ({
                                ...prev,
                                [v.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addQtyToVariant(v);
                              }
                            }}
                            placeholder="Add qty"
                            aria-label="Add quantity"
                            className="flex-1"
                          />
                          <Button
                            variant="secondary"
                            type="button"
                            className="h-10 px-3 text-xs"
                            onClick={() => addQtyToVariant(v)}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                      <Select
                        label="Class"
                        value={v.ship_class ?? ""}
                        onChange={(e) =>
                          updateVariantDraft(v.id, {
                            ship_class: e.target.value || null,
                          })
                        }
                      >
                        <option value="">—</option>
                        <option value="MINI_GT">MINI_GT</option>
                        <option value="SMALL_BOX_FIGURE">SMALL_BOX_FIGURE</option>
                        <option value="KAIDO">KAIDO</option>
                        <option value="BBR">BBR</option>
                        <option value="POPRACE">POPRACE</option>
                        <option value="TARMAC_BOX">TARMAC_BOX</option>
                        <option value="ACRYLIC_TRUE_SCALE">
                          ACRYLIC_TRUE_SCALE
                        </option>
                        <option value="TARMAC_ACRYLIC">TARMAC_ACRYLIC</option>
                        <option value="TRUCKS">TRUCKS</option>
                        <option value="BLISTER">BLISTER</option>
                        <option value="TOMICA">TOMICA</option>
                        <option value="TOMICA_LIMITED_VINTAGE_NEO">
                          Tomica Limited Vintage Neo
                        </option>
                        <option value="HOT_WHEELS_MAINLINE">HOT_WHEELS_MAINLINE</option>
                        <option value="HOT_WHEELS_PREMIUM">HOT_WHEELS_PREMIUM</option>
                        <option value="LOOSE_NO_BOX">LOOSE_NO_BOX</option>
                        <option value="LALAMOVE">LALAMOVE</option>
                        <option value="FIGURES_DIORAMA">DIORAMA</option>
                      </Select>

                      <div className="flex items-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => void saveExistingVariant(v)}
                          disabled={isSavingVariant}
                        >
                          {isSavingVariant ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => deleteVariant(v)}
                          disabled={isSavingVariant}
                        >
                          Delete
                        </Button>
                      </div>

                      <div className="md:col-span-6">
                        <Textarea
                          label="Notes (visible to customers)"
                          value={String(v.public_notes ?? v.issue_notes ?? "")}
                          onChange={(e) =>
                            updateVariantDraft(v.id, {
                              public_notes: e.target.value || null,
                              issue_notes: null,
                            })
                          }
                        />
                      </div>

                      {supportsIssueDetailCondition(v.condition) ? (
                        <div className="md:col-span-6 space-y-3">
                          <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3 space-y-3">
                            <div className="text-sm font-medium">
                              Issue Photos (optional)
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(e) => {
                                const list = Array.from(e.target.files ?? []);
                                if (!list.length) return;
                                void uploadVariantIssueFiles(v, list);
                                e.currentTarget.value = "";
                              }}
                            />
                            <div className="text-xs text-white/50">
                              Mobile opens your photo library.
                            </div>
                            <div
                              className="rounded-lg border border-dashed border-white/15 bg-bg-900/40 p-2 text-xs text-white/60"
                              tabIndex={0}
                              onClick={(e) =>
                                (e.currentTarget as HTMLDivElement).focus()
                              }
                              onPaste={(e) => handleVariantIssuePaste(v, e)}
                            >
                              Paste issue photo here (click box, then press Ctrl+V).
                            </div>
                            {issuePhotosUploadingId === v.id ? (
                              <div className="text-xs text-white/60">
                                Uploading...
                              </div>
                            ) : null}

                            {v.issue_photo_urls?.length ? (
                              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                                {v.issue_photo_urls.map((u) => (
                                  <div
                                    key={u}
                                    className="rounded-xl border border-white/10 bg-bg-900/40 overflow-hidden"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={u}
                                      alt=""
                                      className="h-32 w-full object-cover"
                                    />
                                    <div className="p-2">
                                      <Button
                                        variant="ghost"
                                        type="button"
                                        onClick={() => removeVariantIssuePhoto(v, u)}
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-white/50">
                                No issue photos yet.
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              </div>
            )}
          </div>

          {queuedVariants.length ? (
            <div className="space-y-4">
              {queuedVariants.map((draft, idx) => (
                <VariantDraftPanel key={draft.id} draft={draft} index={idx} />
              ))}
            </div>
          ) : null}

          {/* Add new variant */}
          <div
            ref={newVariantSectionRef}
            className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">Add New Variant (Condition)</div>
              {scheduleReleaseEnabled && scheduledReleasePreview ? (
                <Badge className="border-amber-400/45 bg-amber-500/18 text-amber-100">
                  Scheduled for {scheduledReleasePreview}
                </Badge>
              ) : (
                <Badge className="border-emerald-400/45 bg-emerald-500/18 text-emerald-100">
                  Publish immediately
                </Badge>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Condition"
                value={condition}
                onChange={(e) =>
                  handleVariantConditionChange(e.target.value as VariantCondition)
                }
              >
                {CONDITION_SELECT_OPTIONS.map((conditionOption) => (
                  <option key={conditionOption} value={conditionOption}>
                    {formatConditionLabel(conditionOption)}
                  </option>
                ))}
              </Select>

              <Select
                label="Shipping Class"
                value={shipClass}
                onChange={(e) => setShipClass(e.target.value as ShipClass)}
              >
                <option value="MINI_GT">Mini GT</option>
                <option value="SMALL_BOX_FIGURE">Small Box Figure</option>
                <option value="KAIDO">Kaido</option>
                <option value="BBR">BBR</option>
                <option value="POPRACE">Pop Race</option>
                <option value="TARMAC_BOX">Tarmac Box</option>
                <option value="ACRYLIC_TRUE_SCALE">Acrylic True-Scale</option>
                <option value="TARMAC_ACRYLIC">Tarmac Acrylic</option>
                <option value="TRUCKS">Trucks</option>
                <option value="BLISTER">Blister</option>
                <option value="TOMICA">Tomica</option>
                <option value="TOMICA_LIMITED_VINTAGE_NEO">
                  Tomica Limited Vintage Neo
                </option>
                <option value="HOT_WHEELS_MAINLINE">Hot Wheels Mainline</option>
                <option value="HOT_WHEELS_PREMIUM">Hot Wheels Premium</option>
                <option value="LOOSE_NO_BOX">Loose (No Box)</option>
                <option value="LALAMOVE">Lalamove</option>
                <option value="FIGURES_DIORAMA">Figures & Diorama (Lalamove)</option>
              </Select>

              <Input
                label="Variant Barcode (optional)"
                value={variantBarcode}
                onChange={(e) => setVariantBarcode(e.target.value)}
              />
              <div />

              <Input
                label="Cost (₱)"
                value={cost}
                onChange={(e) => handleCostChange(e.target.value)}
                onClick={handleCostInputClick}
                placeholder="(empty)"
              />
              <Input
                label="Selling Price (₱)"
                labelSuffix={
                  newVariantMarginInfo ? (
                    <span className={newVariantMarginInfo.className}>
                      {newVariantMarginInfo.text}
                    </span>
                  ) : null
                }
                value={price}
                onChange={(e) => handlePriceChange(e.target.value)}
                onClick={handlePriceInputClick}
                placeholder="(empty)"
              />
              <div className="space-y-1">
                <div className="text-sm text-white/80">Quantity</div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    type="button"
                    className="h-10 w-10 px-0"
                    onClick={() => stepNewQty(-1)}
                    aria-label="Decrease quantity"
                  >
                    -
                  </Button>
                  <div className="flex-1">
                    <Input
                      value={qty}
                      onChange={(e) =>
                        setQty(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      placeholder="(empty)"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    type="button"
                    className="h-10 w-10 px-0"
                    onClick={() => stepNewQty(1)}
                    aria-label="Increase quantity"
                  >
                    +
                  </Button>
                </div>
              </div>

              <Textarea
                label={
                  condition === "with_issues"
                    ? "Notes (required)"
                    : "Notes (visible to customers)"
                }
                value={publicNotes}
                onChange={(e) => setPublicNotes(e.target.value)}
                className="md:col-span-2"
              />

              {supportsIssueDetailCondition(condition) ? (
                <div className="space-y-3 md:col-span-2">
                  <div className="rounded-xl border border-white/10 bg-bg-900/40 p-3 space-y-3">
                    <div className="text-sm font-medium">
                      Issue Photos (optional)
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? []);
                        if (!list.length) return;
                        const folderId = `issue-${selectedProduct?.id ?? crypto.randomUUID()}`;
                        void uploadIssueFiles(list, folderId);
                        e.currentTarget.value = "";
                      }}
                    />
                    <div className="text-xs text-white/50">
                      Mobile opens your photo library.
                    </div>
                    <div
                      className="rounded-lg border border-dashed border-white/15 bg-bg-900/40 p-2 text-xs text-white/60"
                      tabIndex={0}
                      onClick={(e) =>
                        (e.currentTarget as HTMLDivElement).focus()
                      }
                      onPaste={handleIssuePaste}
                    >
                      Paste issue photo here (click box, then press Ctrl+V).
                    </div>
                    {issuePhotosUploading ? (
                      <div className="text-xs text-white/60">
                        Uploading...
                      </div>
                    ) : null}

                    {issuePhotos.length ? (
                      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                        {issuePhotos.map((u) => (
                          <div
                            key={u}
                            className="rounded-xl border border-white/10 bg-bg-900/40 overflow-hidden"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={u}
                              alt=""
                              className="h-32 w-full object-cover"
                            />
                            <div className="p-2">
                              <Button
                                variant="ghost"
                                type="button"
                                onClick={() => removeIssuePhoto(u)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-white/50">
                        No issue photos yet.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => saveQueuedVariants()}
                disabled={saving || printingBarcodeLabels}
              >
                {saving
                  ? "Saving..."
                  : queuedVariants.length
                    ? "Save variants"
                  : "Save"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => saveQueuedVariants({ printBarcodes: true })}
                disabled={saving || printingBarcodeLabels}
              >
                {saving
                  ? "Saving..."
                  : printingBarcodeLabels
                    ? "Printing..."
                    : "Save & Print Barcode"}
              </Button>
              <Button
                variant="secondary"
                onClick={queueVariantDraft}
                disabled={saving || printingBarcodeLabels}
              >
                {saving || printingBarcodeLabels ? "Saving..." : "+ Add another variant"}
              </Button>
            </div>

            <div className="text-xs text-white/50">
              Cost/Price are empty by default. Qty defaults to 1.
            </div>
            {niimbotState === "connected" ? (
              <div className="text-xs text-emerald-200/80">
                Niimbot connected{niimbotPrinterName ? `: ${niimbotPrinterName}` : ""}.
              </div>
            ) : null}
          </div>

          {compactAddMode ? (
            <div className="rounded-2xl border border-white/10 bg-bg-900/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-white/60">
                  Advanced tools (bulk add, logs, protector stock)
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvancedTools((prev) => !prev)}
                >
                  {showAdvancedTools ? "Hide advanced" : "Show advanced"}
                </Button>
              </div>
            </div>
          ) : null}

          {!compactAddMode || showAdvancedTools ? (
          <>
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold">General Bulk Add</div>
                <div className="text-sm text-white/60">
                  Create multiple items without barcode lookup. One line equals
                  one product + one variant.
                </div>
              </div>
              <div className="text-xs text-white/50">
                Format: Model, Color, Price, Qty, Condition
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Input
                label="Brand"
                value={bulkBrand}
                onChange={(e) => setBulkBrand(e.target.value)}
                placeholder="e.g. Hot Wheels"
              />
              <Select
                label="Shipping class"
                value={bulkShipClass}
                onChange={(e) => setBulkShipClass(e.target.value as ShipClass)}
              >
                <option value="MINI_GT">Mini GT</option>
                <option value="SMALL_BOX_FIGURE">Small Box Figure</option>
                <option value="KAIDO">Kaido</option>
                <option value="BBR">BBR</option>
                <option value="POPRACE">Pop Race</option>
                <option value="TARMAC_BOX">Tarmac Box</option>
                <option value="ACRYLIC_TRUE_SCALE">Acrylic True-Scale</option>
                <option value="TARMAC_ACRYLIC">Tarmac Acrylic</option>
                <option value="TRUCKS">Trucks</option>
                <option value="BLISTER">Blister</option>
                <option value="TOMICA">Tomica</option>
                <option value="TOMICA_LIMITED_VINTAGE_NEO">
                  Tomica Limited Vintage Neo
                </option>
                <option value="HOT_WHEELS_MAINLINE">Hot Wheels Mainline</option>
                <option value="HOT_WHEELS_PREMIUM">Hot Wheels Premium</option>
                <option value="LOOSE_NO_BOX">Loose (No Box)</option>
                <option value="LALAMOVE">Lalamove</option>
                <option value="FIGURES_DIORAMA">Figures & Diorama (Lalamove)</option>
              </Select>
              <Input
                label="Shared cost (PHP)"
                value={bulkHotWheelsCost}
                onChange={(e) =>
                  setBulkHotWheelsCost(e.target.value.replace(/[^0-9.]/g, ""))
                }
                inputMode="decimal"
                placeholder="e.g. 120"
              />
              <Select
                label="Default condition"
                value={bulkHotWheelsCondition}
                onChange={(e) =>
                  setBulkHotWheelsCondition(e.target.value as VariantCondition)
                }
              >
                {CONDITION_SELECT_OPTIONS.map((conditionOption) => (
                  <option key={conditionOption} value={conditionOption}>
                    {formatConditionLabel(conditionOption)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="text-xs text-white/50">
              Brand will be set to {bulkBrand.trim() || "your input"} and shipping
              class will match the selection.
            </div>

            <Textarea
              label="Notes (for With Issues items)"
              value={bulkHotWheelsIssueNotes}
              onChange={(e) => {
                setBulkHotWheelsIssueNotes(e.target.value);
                if (bulkHotWheelsErrors.length) {
                  setBulkHotWheelsErrors([]);
                }
              }}
              placeholder="e.g. Card crease on top right"
            />

            <Textarea
              label="Items (one per line)"
              value={bulkHotWheelsLines}
              onChange={(e) => {
                setBulkHotWheelsLines(e.target.value);
                if (bulkHotWheelsErrors.length) {
                  setBulkHotWheelsErrors([]);
                }
              }}
              placeholder={`Civic Type R, Championship White, 399, 1\nNissan Skyline R34, Midnight Purple, 299, 2`}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={saveHotWheelsBulk} disabled={bulkHotWheelsSaving}>
                {bulkHotWheelsSaving ? "Adding..." : "Add bulk items"}
              </Button>
              <div className="text-xs text-white/60">
                {bulkHotWheelsPreview.items.length} ready,{" "}
                {bulkHotWheelsPreview.errors.length} errors
              </div>
            </div>

            {bulkHotWheelsErrors.length ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200 space-y-1">
                {bulkHotWheelsErrors.slice(0, 8).map((err) => (
                  <div key={err}>{err}</div>
                ))}
                {bulkHotWheelsErrors.length > 8 ? (
                  <div>...and {bulkHotWheelsErrors.length - 8} more.</div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Generated barcode log */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="font-semibold">Generated Barcodes</div>
                <Badge>{barcodeLogs.length}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setShowBarcodeLogs((prev) => !prev)}
                >
                  {showBarcodeLogs ? "Collapse" : "Expand"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={downloadBarcodeLogsCsv}
                  disabled={!barcodeLogs.length}
                >
                  Download Excel
                </Button>
              </div>
            </div>

            {showBarcodeLogs ? (
              barcodeLogsLoading ? (
                <div className="text-white/60">Loading...</div>
              ) : barcodeLogsError ? (
                <div className="text-sm text-red-300">{barcodeLogsError}</div>
              ) : barcodeLogs.length === 0 ? (
                <div className="text-sm text-white/50">No generated barcodes yet.</div>
              ) : (
                <div className="space-y-3">
                  {barcodeLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-xl border border-white/10 bg-paper/5 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">
                          {log.product_title ?? "Item"}
                        </div>
                        <div className="text-xs text-white/50">
                          {formatLogDate(log.created_at)}
                        </div>
                      </div>
                      {log.description ? (
                        <div className="text-sm text-white/60">
                          {log.description}
                        </div>
                      ) : null}
                      <div className="text-sm text-white/80">
                        Barcode: <span className="font-medium">{log.barcode}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="text-sm text-white/50">Collapsed.</div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">Hot Wheels Protectors</div>
                <div className="text-sm text-white/60">
                  Control protector add-on stock for Mainline and Premium.
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={loadProtectorStock}
                disabled={protectorStockLoading}
              >
                {protectorStockLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Mainline protectors (pcs)"
                value={protectorStockMainline}
                onChange={(e) => setProtectorStockMainline(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 50"
              />
              <Input
                label="Premium protectors (pcs)"
                value={protectorStockPremium}
                onChange={(e) => setProtectorStockPremium(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 50"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={saveProtectorStock} disabled={protectorStockSaving}>
                {protectorStockSaving ? "Saving..." : "Save protector stock"}
              </Button>
              {protectorStockMsg ? (
                <div className="text-xs text-white/60">{protectorStockMsg}</div>
              ) : null}
            </div>
          </div>

          {false ? (
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold">Bulk photo inbox</div>
                <div className="text-xs text-white/60">
                  Upload multiple photos and assign each to a product. The
                  uploaded photo becomes the first thumbnail.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadReviewQueue}
                  disabled={reviewLoading}
                >
                  {reviewLoading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
              <span className="text-xs text-white/60">Class filter:</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBulkShipClassFilter([])}
                disabled={bulkShipClassFilter.length === 0}
              >
                All
              </Button>
              {BULK_SHIP_CLASS_FILTER_OPTIONS.map((opt) => {
                const active = bulkShipClassFilter.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setBulkShipClassFilter((prev) =>
                        prev.includes(opt.value)
                          ? prev.filter((v) => v !== opt.value)
                          : [...prev, opt.value]
                      )
                    }
                    className={`h-8 rounded-full border px-3 text-xs transition ${
                      active
                        ? "border-accent-500 bg-accent-500/20 text-white"
                        : "border-white/10 bg-bg-900/40 text-white/70 hover:bg-bg-900/70"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    if (!list.length) return;
                    void uploadBulkPhotos(list);
                    e.currentTarget.value = "";
                  }}
                />
                <div className="text-xs text-white/50">
                  Select multiple images. They will be stored in the inbox until
                  you assign them.
                </div>
              </div>
              <div className="text-xs text-white/60">
                {bulkUploadLoading ? "Uploading..." : bulkUploadMsg}
              </div>
            </div>
            {bulkUploadProgress ? (
              <div className="text-xs text-white/60">
                Uploading {bulkUploadProgress!.current} of{" "}
                {bulkUploadProgress!.total} (
                {Math.round(
                  (bulkUploadProgress!.current / bulkUploadProgress!.total) * 100
                )}
                %)
              </div>
            ) : null}

            {reviewError ? (
              <div className="text-xs text-red-200">{reviewError}</div>
            ) : null}

            {!reviewLoading && reviewMatches.length === 0 ? (
              <div className="text-xs text-white/60">
                No photos in inbox.
              </div>
            ) : null}

            {reviewMatches.length ? (
              <div className="grid gap-3">
                {reviewMatches.map((match) => {
                  const uploadUrl = match.upload_url;
                  const createdAt = match.created_at
                    ? new Date(match.created_at).toLocaleString("en-PH")
                    : "";
                  const term = bulkSearchTerms[match.id] ?? "";
                  const resultsRaw = bulkSearchResults[match.id] ?? [];
                  const shipFiltered =
                    bulkShipClassFilter.length === 0
                      ? resultsRaw
                      : resultsRaw.filter((p) => {
                          const variants =
                            ((p as any).product_variants as Array<{
                              ship_class: string | null;
                            }> | null) ?? [];
                          if (!variants.length) return false;
                          return variants.some(
                            (v) =>
                              v.ship_class &&
                              bulkShipClassFilter.includes(
                                v.ship_class as ShipClass
                              )
                          );
                        });
                  const results = shipFiltered;
                  const filteredByShip =
                    bulkShipClassFilter.length > 0 &&
                    resultsRaw.length > 0 &&
                    shipFiltered.length === 0;
                  const searching = bulkSearchLoading[match.id] ?? false;
                  return (
                    <div
                      key={match.id}
                      className="rounded-xl border border-white/10 bg-bg-900/40 p-3 space-y-3"
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (!uploadUrl) return;
                            setBulkPreviewError(false);
                            setBulkPreviewUrl(uploadUrl);
                          }}
                          className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl border border-white/10 bg-bg-950/60 overflow-hidden flex-shrink-0"
                          aria-label="View upload"
                        >
                          {uploadUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={uploadUrl}
                              alt="Upload"
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </button>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-sm font-medium truncate">
                            {match.review_reason ?? "Uploaded photo"}
                          </div>
                          {createdAt ? (
                            <div className="text-xs text-white/50">
                              {createdAt}
                            </div>
                          ) : null}
                        </div>
                        <div className="ml-auto">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => deleteBulkUpload(match)}
                            disabled={reviewActionId === match.id}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            className="flex-1"
                            placeholder="Search product title/brand/model..."
                            value={term}
                            onChange={(e) =>
                              scheduleBulkSearch(match.id, e.target.value)
                            }
                            ref={(node) => {
                              bulkSearchInputRefs.current[match.id] = node;
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                runBulkSearch(match.id);
                                return;
                              }
                              if (e.key === "ArrowUp") {
                                if (!e.altKey && !e.ctrlKey && !e.metaKey) {
                                  e.preventDefault();
                                  focusPreviousBulkSearchInput(match.id);
                                  return;
                                }
                                const history = bulkSearchHistory[match.id] ?? [];
                                if (!history.length) return;
                                e.preventDefault();
                                const currentIdx = bulkSearchIndex[match.id];
                                const nextIdx =
                                  currentIdx === null || typeof currentIdx === "undefined"
                                    ? history.length - 1
                                    : Math.max(0, currentIdx - 1);
                                const nextTerm = history[nextIdx] ?? "";
                                setBulkSearchIndex((prev) => ({
                                  ...prev,
                                  [match.id]: nextIdx,
                                }));
                                setBulkSearchTerms((prev) => ({
                                  ...prev,
                                  [match.id]: nextTerm,
                                }));
                                runBulkSearch(match.id, nextTerm, { recordHistory: false });
                                return;
                              }
                              if (e.key === "ArrowDown") {
                                if (!e.altKey && !e.ctrlKey && !e.metaKey) {
                                  e.preventDefault();
                                  focusNextBulkSearchInput(match.id);
                                  return;
                                }
                              }
                            }}
                          />
                          <Button
                            variant="secondary"
                            onClick={() => runBulkSearch(match.id)}
                            disabled={searching}
                          >
                            {searching ? "Searching..." : "Search"}
                          </Button>
                        </div>

                        {results.length ? (
                          <div className="grid gap-2">
                            {results.map((p) => {
                              const img =
                                Array.isArray(p.image_urls) && p.image_urls.length
                                  ? p.image_urls[0]
                                  : null;
                              const conditions = Array.from(
                                new Set(
                                  (((p as any).product_variants ??
                                    []) as Array<{ condition?: string | null }>).map(
                                    (v) => v?.condition
                                  )
                                )
                              )
                                .filter(Boolean)
                                .map((c) =>
                                  formatConditionLabel(String(c), { upper: true })
                                );
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => assignBulkUpload(match, p)}
                                  className="text-left rounded-xl border border-white/10 bg-paper/5 hover:bg-paper/10 px-3 py-2 flex gap-3"
                                >
                                  <div className="h-12 w-12 rounded-lg bg-bg-800 border border-white/10 overflow-hidden flex-shrink-0">
                                    {img ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={img}
                                        alt={p.title}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : null}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium truncate">
                                      {p.title}
                                    </div>
                            <div className="text-xs text-white/60">
                          {p.brand ?? "-"} {p.model ? `• ${p.model}` : ""}{" "}
                              {p.variation ? `• ${p.variation}` : ""}
                        </div>
                                    {conditions.length ? (
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {conditions.map((c) => (
                                          <span
                                            key={c}
                                            className="rounded-full border border-white/10 bg-bg-900/50 px-2 py-0.5 text-[10px] text-white/70"
                                          >
                                            {c}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : term ? (
                          <div className="text-xs text-white/60">
                            {filteredByShip
                              ? "No matches in selected classes."
                              : "No products found."}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          ) : null}
          </>
          ) : null}

          {false ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
              onClick={() => setBulkPreviewUrl(null)}
            >
              <div
                className="max-h-full w-full max-w-4xl rounded-2xl border border-white/10 bg-bg-900/95 p-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 pb-3">
                  <div className="text-sm font-semibold">Photo preview</div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        bulkPreviewUrl && window.open(bulkPreviewUrl, "_blank")
                      }
                    >
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setBulkPreviewUrl(null)}
                    >
                      Close
                    </Button>
                  </div>
                </div>
                <div className="relative w-full min-h-[240px] rounded-xl border border-white/10 bg-black/40 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bulkPreviewUrl ?? undefined}
                    alt="Upload preview"
                    className="w-full max-h-[75vh] object-contain"
                    onError={() => setBulkPreviewError(true)}
                  />
                  {bulkPreviewError ? (
                    <div className="absolute text-sm text-white/70">
                      Unable to load preview.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          </>
          ) : null}
        </CardBody>
      </Card>

      {quickAddConfigOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={() => setQuickAddConfigOpen(false)}
            aria-label="Close quick add settings"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-bg-900/95 p-5 shadow-soft space-y-4">
            <div>
              <div className="text-xs text-white/60">Barcode Quick Add</div>
              <div className="text-lg font-semibold">Quick Add Settings</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-white/80">Quantity per scan</div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  type="button"
                  className="h-10 w-10 px-0"
                  onClick={() => stepQuickAddQty(-1)}
                  aria-label="Decrease quick add quantity"
                >
                  -
                </Button>
                <div className="flex-1">
                  <Input
                    value={quickAddQty}
                    onChange={(e) =>
                      setQuickAddQty(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    placeholder="1"
                  />
                </div>
                <Button
                  variant="ghost"
                  type="button"
                  className="h-10 w-10 px-0"
                  onClick={() => stepQuickAddQty(1)}
                  aria-label="Increase quick add quantity"
                >
                  +
                </Button>
              </div>
            </div>
            <Select
              label="Preferred variation"
              value={quickAddCondition}
              onChange={(e) =>
                setQuickAddCondition(e.target.value as VariantCondition | "any")
              }
            >
              <option value="any">Any variation (first match)</option>
              {CONDITION_SELECT_OPTIONS.map((conditionOption) => (
                <option key={conditionOption} value={conditionOption}>
                  {formatConditionLabel(conditionOption)}
                </option>
              ))}
            </Select>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() => setQuickAddConfigOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {existingBarcodePrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={closeExistingBarcodePrompt}
            aria-label="Close barcode action prompt"
          />
          <div className="relative w-full max-w-5xl max-h-[88vh] overflow-y-auto rounded-2xl border border-white/10 bg-bg-900/95 p-5 shadow-soft">
            <div className="text-xs text-white/60">Barcode already exists</div>
            <div className="mt-1 text-lg font-semibold">{existingBarcodePrompt.barcode}</div>
            <div className="mt-2 text-sm text-white/70">
              Choose whether to add stock to an existing variant, or create a new
              variant in this same popup, or save as a new product card.
            </div>

            {existingBarcodePrompt.matches.length > 1 ? (
              <div className="mt-4">
                <Select
                  label="Existing variant"
                  value={existingBarcodeVariantId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setExistingBarcodeVariantId(nextId);
                    const match = existingBarcodePrompt.matches.find(
                      (item) => item.id === nextId
                    );
                    if (match?.ship_class) {
                      setShipClass(match.ship_class);
                    } else {
                      setShipClass(
                        shipClassFromBrand(match?.product?.brand ?? brand)
                      );
                    }
                  }}
                >
                  {existingBarcodePrompt.matches.map((match) => {
                    const productTitle = match.product?.title?.trim() || "Untitled";
                    return (
                      <option key={match.id} value={match.id}>
                        {productTitle} - {formatConditionLabel(match.condition)} (qty {match.qty})
                      </option>
                    );
                  })}
                </Select>
              </div>
            ) : null}

            {selectedExistingBarcodeMatch ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">
                <div className="font-medium">
                  {selectedExistingBarcodeMatch.product?.title ?? "Untitled product"}
                </div>
                <div className="mt-1 text-xs text-white/60">
                  {selectedExistingBarcodeMatch.product?.brand ?? "-"}
                  {selectedExistingBarcodeMatch.product?.model
                    ? ` - ${selectedExistingBarcodeMatch.product.model}`
                    : ""}
                  {selectedExistingBarcodeMatch.product?.variation
                    ? ` - ${selectedExistingBarcodeMatch.product.variation}`
                    : ""}
                </div>
                <div className="mt-1 text-xs text-white/60">
                  Condition {formatConditionLabel(selectedExistingBarcodeMatch.condition)} -
                  {" "}Current qty {selectedExistingBarcodeMatch.qty}
                </div>
                <div className="mt-1 text-xs text-white/60">
                  Cost{" "}
                  {selectedExistingBarcodeMatch.cost == null
                    ? "-"
                    : formatPHP(selectedExistingBarcodeMatch.cost)}
                  {" | "}Selling{" "}
                  {selectedExistingBarcodeMatch.sale_price != null ||
                  (selectedExistingBarcodeMatch.discount_percent ?? 0) > 0 ? (
                    <>
                      <span className="line-through opacity-60">
                        {formatPHP(selectedExistingBarcodeMatch.price)}
                      </span>
                      {" -> "}
                      {formatPHP(selectedExistingBarcodeEffectivePrice)}
                    </>
                  ) : (
                    formatPHP(selectedExistingBarcodeMatch.price)
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-4 space-y-3">
                <div className="font-semibold">Add To Existing Variant</div>
                {selectedExistingBarcodeMatch ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                    Existing price:{" "}
                    {selectedExistingBarcodeMatch.sale_price != null ||
                    (selectedExistingBarcodeMatch.discount_percent ?? 0) > 0 ? (
                      <>
                        <span className="line-through opacity-60">
                          {formatPHP(selectedExistingBarcodeMatch.price)}
                        </span>
                        {" -> "}
                        {formatPHP(selectedExistingBarcodeEffectivePrice)}
                      </>
                    ) : (
                      formatPHP(selectedExistingBarcodeMatch.price)
                    )}
                  </div>
                ) : null}
                <Input
                  type="number"
                  min={1}
                  step={1}
                  label="Quantity to add"
                  value={existingBarcodeAddQty}
                  onChange={(e) => setExistingBarcodeAddQty(e.target.value)}
                  disabled={existingBarcodeActionLoading}
                />
                <Button
                  onClick={addToExistingVariantFromBarcodePrompt}
                  disabled={existingBarcodeActionLoading}
                >
                  {existingBarcodeActionLoading ? "Processing..." : "Add to existing variant"}
                </Button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-4 space-y-4">
                <div className="font-semibold">Add New Variant (Condition)</div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Select
                    label="Condition"
                    value={condition}
                    onChange={(e) =>
                      handleVariantConditionChange(e.target.value as VariantCondition)
                    }
                    disabled={existingBarcodeActionLoading}
                  >
                    {CONDITION_SELECT_OPTIONS.map((conditionOption) => (
                      <option key={conditionOption} value={conditionOption}>
                        {formatConditionLabel(conditionOption)}
                      </option>
                    ))}
                  </Select>

                  <Select
                    label="Shipping Class"
                    value={shipClass}
                    onChange={(e) => setShipClass(e.target.value as ShipClass)}
                    disabled={existingBarcodeActionLoading}
                  >
                    <option value="MINI_GT">Mini GT</option>
                    <option value="SMALL_BOX_FIGURE">Small Box Figure</option>
                    <option value="KAIDO">Kaido</option>
                    <option value="BBR">BBR</option>
                    <option value="POPRACE">Pop Race</option>
                    <option value="TARMAC_BOX">Tarmac Box</option>
                    <option value="ACRYLIC_TRUE_SCALE">Acrylic True-Scale</option>
                    <option value="TARMAC_ACRYLIC">Tarmac Acrylic</option>
                    <option value="TRUCKS">Trucks</option>
                    <option value="BLISTER">Blister</option>
                    <option value="TOMICA">Tomica</option>
                    <option value="TOMICA_LIMITED_VINTAGE_NEO">
                      Tomica Limited Vintage Neo
                    </option>
                    <option value="HOT_WHEELS_MAINLINE">Hot Wheels Mainline</option>
                    <option value="HOT_WHEELS_PREMIUM">Hot Wheels Premium</option>
                    <option value="LOOSE_NO_BOX">Loose (No Box)</option>
                    <option value="LALAMOVE">Lalamove</option>
                    <option value="FIGURES_DIORAMA">Figures & Diorama (Lalamove)</option>
                  </Select>

                  <Input
                    label="Variant Barcode (optional)"
                    value={variantBarcode}
                    onChange={(e) => setVariantBarcode(e.target.value)}
                    disabled={existingBarcodeActionLoading}
                  />
                  <div />

                  <Input
                    label="Cost (₱)"
                    value={cost}
                    onChange={(e) => handleCostChange(e.target.value)}
                    onClick={handleCostInputClick}
                    placeholder="(empty)"
                    disabled={existingBarcodeActionLoading}
                  />
                  <Input
                    label="Selling Price (₱)"
                    labelSuffix={
                      newVariantMarginInfo ? (
                        <span className={newVariantMarginInfo.className}>
                          {newVariantMarginInfo.text}
                        </span>
                      ) : null
                    }
                    value={price}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    onClick={handlePriceInputClick}
                    placeholder="(empty)"
                    disabled={existingBarcodeActionLoading}
                  />

                  <div className="space-y-1">
                    <div className="text-sm text-white/80">Quantity</div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        type="button"
                        className="h-10 w-10 px-0"
                        onClick={() => stepNewQty(-1)}
                        aria-label="Decrease quantity"
                        disabled={existingBarcodeActionLoading}
                      >
                        -
                      </Button>
                      <div className="flex-1">
                        <Input
                          value={qty}
                          onChange={(e) =>
                            setQty(e.target.value.replace(/[^0-9]/g, ""))
                          }
                          placeholder="(empty)"
                          disabled={existingBarcodeActionLoading}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        type="button"
                        className="h-10 w-10 px-0"
                        onClick={() => stepNewQty(1)}
                        aria-label="Increase quantity"
                        disabled={existingBarcodeActionLoading}
                      >
                        +
                      </Button>
                    </div>
                  </div>

                  <Textarea
                    label={
                      condition === "with_issues"
                        ? "Notes (required)"
                        : "Notes (visible to customers)"
                    }
                    value={publicNotes}
                    onChange={(e) => setPublicNotes(e.target.value)}
                    className="md:col-span-2"
                    disabled={existingBarcodeActionLoading}
                  />
                </div>

                {supportsIssueDetailCondition(condition) ? (
                  <div className="text-xs text-white/60">
                    Issue photos can be added after saving from the variant editor.
                  </div>
                ) : null}

                <Button
                  variant="secondary"
                  onClick={createNewVariantFromBarcodePrompt}
                  disabled={existingBarcodeActionLoading}
                >
                  {existingBarcodeActionLoading ? "Processing..." : "Save new variant"}
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-bg-900/40 p-4 space-y-4">
              <div className="font-semibold">Create New Product Card + Variant</div>
              <div className="text-xs text-white/60">
                Use this when you do not want to attach the scanned barcode to the
                existing product card.
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Product Title"
                  value={newCardTitle}
                  onChange={(e) => setNewCardTitle(e.target.value)}
                  disabled={existingBarcodeActionLoading}
                />
                <Input
                  label="Brand"
                  value={newCardBrand}
                  onChange={(e) => setNewCardBrand(e.target.value)}
                  disabled={existingBarcodeActionLoading}
                />
                <Input
                  label="Model"
                  value={newCardModel}
                  onChange={(e) => setNewCardModel(e.target.value)}
                  disabled={existingBarcodeActionLoading}
                />
                <Input
                  label="Variation"
                  value={newCardVariation}
                  onChange={(e) => setNewCardVariation(e.target.value)}
                  disabled={existingBarcodeActionLoading}
                />
              </div>
              <Button
                variant="secondary"
                onClick={createNewProductCardFromBarcodePrompt}
                disabled={existingBarcodeActionLoading}
              >
                {existingBarcodeActionLoading
                  ? "Processing..."
                  : "Save as new product card"}
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                onClick={closeExistingBarcodePrompt}
                disabled={existingBarcodeActionLoading}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {cropEditor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setCropEditor(null)}
            aria-label="Close crop editor"
          />
          <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-bg-900/95 p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs text-white/50">Mobile web + inventory sheet preview</div>
                <div className="text-lg font-semibold">Adjust image crop</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCropEditor(null)}
              >
                Close
              </Button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr]">
              <div
                ref={cropFrameRef}
                className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-neutral-50 cursor-move select-none touch-none"
                onPointerDown={beginCropDrag}
                onPointerMove={updateCropDrag}
                onPointerUp={endCropDrag}
                onPointerCancel={endCropDrag}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cropEditor.baseUrl}
                  alt="Card preview"
                  className="h-full w-full object-cover bg-white"
                  style={cropStyle(cropEditor.crop)}
                />
                <div className="pointer-events-none absolute inset-0 border border-white/70 shadow-[0_0_0_9999px_rgba(255,255,255,0.6)] dark:border-white/40 dark:shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
              </div>

              <div className="space-y-4">
                <div className="text-xs text-white/60">
                  Drag the image to position it inside the visible frame.
                </div>
                <div>
                  <div className="text-xs text-white/60">Zoom</div>
                  <input
                    type="range"
                    min={1}
                    max={2.5}
                    step={0.05}
                    value={cropEditor.crop.zoom}
                    onChange={(e) =>
                      setCropEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              crop: normalizeCrop({
                                ...prev.crop,
                                zoom: Number(e.target.value),
                              }),
                            }
                          : prev
                      )
                    }
                    className="mt-2 w-full"
                  />
                </div>

                <div>
                  <div className="text-xs text-white/60">Horizontal</div>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={cropEditor.crop.x}
                    onChange={(e) =>
                      setCropEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              crop: normalizeCrop({
                                ...prev.crop,
                                x: Number(e.target.value),
                              }),
                            }
                          : prev
                      )
                    }
                    className="mt-2 w-full"
                  />
                </div>

                <div>
                  <div className="text-xs text-white/60">Vertical</div>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={cropEditor.crop.y}
                    onChange={(e) =>
                      setCropEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              crop: normalizeCrop({
                                ...prev.crop,
                                y: Number(e.target.value),
                              }),
                            }
                          : prev
                      )
                    }
                    className="mt-2 w-full"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setCropEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              crop: normalizeCrop({
                                ...prev.crop,
                                rotate: (prev.crop.rotate ?? 0) - 90,
                              }),
                            }
                          : prev
                      )
                    }
                  >
                    Rotate Left
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setCropEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              crop: normalizeCrop({
                                ...prev.crop,
                                rotate: (prev.crop.rotate ?? 0) + 90,
                              }),
                            }
                          : prev
                      )
                    }
                  >
                    Rotate Right
                  </Button>
                  <div className="text-xs text-white/60">
                    {(cropEditor.crop.rotate ?? 0) % 360}°
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() =>
                  setCropEditor((prev) =>
                    prev
                      ? { ...prev, crop: { zoom: 1, x: 0, y: 0, rotate: 0 } }
                      : prev
                  )
                }
              >
                Reset
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setCropEditor(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const nextUrl = applyImageCrop(
                      cropEditor.baseUrl,
                      cropEditor.crop
                    );
                    updateImageUrlAtIndex(cropEditor.index, nextUrl);
                    setCropEditor(null);
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

