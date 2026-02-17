"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { BarcodeScannerModal } from "@/components/pos/BarcodeScannerModal";
import { normalizeBarcode } from "@/lib/barcode";
import { shipClassFromBrand } from "@/lib/shipping/shipClass";
import {
  inferFieldsFromTitle,
  normalizeKaidoMiniGtTitle,
  normalizeBrandAlias,
  normalizeLookupTitle,
  normalizeTitleBrandAliases,
} from "@/lib/titleInference";
import { formatPHP } from "@/lib/money";
import { toast } from "@/components/ui/toast";
import {
  formatConditionLabel,
  isBlisterCondition,
} from "@/lib/conditions";
import { isLalamoveOnlyShipClass } from "@/lib/shipping/shipClass";
import {
  applyImageCrop,
  cropStyle,
  normalizeCrop,
  parseImageCrop,
  type ImageCrop,
} from "@/lib/imageCrop";

type Product = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_urls: string[] | null;
  is_active: boolean;
  created_at: string;
  product_variants?: Array<{ ship_class: string | null }> | null;
};

type Variant = {
  id: string;
  product_id: string;
  condition:
    | "sealed"
    | "resealed"
    | "near_mint"
    | "unsealed"
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
};

type VariantCondition = Variant["condition"];
type ShipClass =
  | "MINI_GT"
  | "KAIDO"
  | "POPRACE"
  | "ACRYLIC_TRUE_SCALE"
  | "TRUCKS"
  | "BLISTER"
  | "TOMICA"
  | "HOT_WHEELS_MAINLINE"
  | "HOT_WHEELS_PREMIUM"
  | "LOOSE_NO_BOX"
  | "LALAMOVE"
  | "DIORAMA";
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

type InventoryValuation = {
  units: number;
  cost_value: number;
  retail_value: number;
  missing_cost_variants: number;
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

const BULK_CONDITIONS: VariantCondition[] = [
  "sealed",
  "resealed",
  "near_mint",
  "unsealed",
  "with_issues",
  "blistered",
  "sealed_blister",
  "unsealed_blister",
];

const BULK_SHIP_CLASS_FILTER_OPTIONS: Array<{ value: ShipClass; label: string }> = [
  { value: "MINI_GT", label: "Mini GT" },
  { value: "KAIDO", label: "Kaido" },
  { value: "POPRACE", label: "Pop Race" },
  { value: "ACRYLIC_TRUE_SCALE", label: "Acrylic True Scale" },
  { value: "TRUCKS", label: "Trucks" },
  { value: "BLISTER", label: "Blister" },
  { value: "TOMICA", label: "Tomica" },
  { value: "HOT_WHEELS_MAINLINE", label: "Hot Wheels Mainline" },
  { value: "HOT_WHEELS_PREMIUM", label: "Hot Wheels Premium" },
  { value: "LOOSE_NO_BOX", label: "Loose / No Box" },
  { value: "LALAMOVE", label: "Lalamove" },
  { value: "DIORAMA", label: "Diorama" },
];

const WARM_HASH_DEFAULT_IMAGES = 8;
const WARM_HASH_DEFAULT_PRODUCTS = 20;
const WARM_HASH_MAX_IMAGES = 50;
const WARM_HASH_MAX_PRODUCTS = 500;
const WARM_FEATURE_DEFAULT_IMAGES = 6;
const WARM_FEATURE_DEFAULT_PRODUCTS = 20;
const WARM_FEATURE_MAX_IMAGES = 30;
const WARM_FEATURE_MAX_PRODUCTS = 500;
const WARM_BATCH_RETRY_LIMIT = 3;

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
  product: Product,
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

function formatCount(value: number) {
  const num = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-PH").format(num);
}

function VariantDraftPanel({
  draft,
  index,
}: {
  draft: VariantDraft;
  index: number;
}) {
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
          <option value="sealed">Sealed</option>
          <option value="resealed">Resealed</option>
          <option value="near_mint">Near Mint</option>
          <option value="sealed_blister">Sealed blister</option>
          <option value="unsealed">Unsealed</option>
          <option value="unsealed_blister">Unsealed blister</option>
          <option value="blistered">Blistered</option>
          <option value="with_issues">With Issues</option>
        </Select>

        <Select
          label="Shipping Class"
          value={draft.shipClass}
          onChange={() => {}}
          disabled
        >
          <option value="MINI_GT">Mini GT</option>
          <option value="KAIDO">Kaido</option>
          <option value="POPRACE">Pop Race</option>
          <option value="ACRYLIC_TRUE_SCALE">Acrylic True-Scale</option>
          <option value="TRUCKS">Trucks</option>
          <option value="BLISTER">Blister</option>
          <option value="TOMICA">Tomica</option>
          <option value="HOT_WHEELS_MAINLINE">Hot Wheels Mainline</option>
          <option value="HOT_WHEELS_PREMIUM">Hot Wheels Premium</option>
          <option value="LOOSE_NO_BOX">Loose (No Box)</option>
          <option value="LALAMOVE">Lalamove</option>
          <option value="DIORAMA">Diorama (Lalamove)</option>
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

        {draft.condition === "with_issues" ? (
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
  return /\bKaido\s+House\b/i.test(titleValue) ? "Kaido House" : null;
}

export default function AdminInventoryPage() {
  // Inventory valuation
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [assumeZeroCost, setAssumeZeroCost] = React.useState(true);
  const router = useRouter();
  const [valuationActive, setValuationActive] =
    React.useState<InventoryValuation | null>(null);
  const [valuationAll, setValuationAll] =
    React.useState<InventoryValuation | null>(null);
  const [valuationLoading, setValuationLoading] = React.useState(false);
  const [valuationError, setValuationError] = React.useState<string | null>(null);

  // Search
  const [search, setSearch] = React.useState("");
  const [results, setResults] = React.useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(
    null
  );
  const [variants, setVariants] = React.useState<Variant[]>([]);
  const [loadingVariants, setLoadingVariants] = React.useState(false);

  // Barcode lookup
  const [barcodeLookup, setBarcodeLookup] = React.useState("");
  const [lookupLoading, setLookupLoading] = React.useState(false);
  const [lookupMsg, setLookupMsg] = React.useState<string | null>(null);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = React.useState(false);
  const barcodeLookupTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoLookupRef = React.useRef("");
  const barcodeInputRef = React.useRef<HTMLInputElement | null>(null);
  const focusAfterSaveRef = React.useRef(false);
  const conditionTouchedRef = React.useRef(false);
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
  const [productUrlResult, setProductUrlResult] =
    React.useState<ProductUrlLookupData | null>(null);
  const [productUrlSelectedImages, setProductUrlSelectedImages] = React.useState<
    Record<string, boolean>
  >({});

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
  const [bulkHideThumbed, setBulkHideThumbed] = React.useState(true);
  const [bulkShipClassFilter, setBulkShipClassFilter] = React.useState<
    ShipClass[]
  >([]);
  const [bulkSearchTerms, setBulkSearchTerms] = React.useState<Record<string, string>>({});
  const [bulkSearchResults, setBulkSearchResults] = React.useState<Record<string, Product[]>>({});
  const [bulkSearchLoading, setBulkSearchLoading] = React.useState<Record<string, boolean>>({});
  const [bulkSearchHistory, setBulkSearchHistory] = React.useState<Record<string, string[]>>({});
  const [bulkSearchIndex, setBulkSearchIndex] = React.useState<Record<string, number | null>>({});
  const bulkSearchTimersRef = React.useRef<Record<string, number>>({});
  const productEditorRef = React.useRef<HTMLDivElement | null>(null);

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

  // Product fields (edit)
  const [title, setTitle] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [model, setModel] = React.useState("");
  const [variation, setVariation] = React.useState("");
  const [images, setImages] = React.useState<string[]>([]);
  const [selectedImages, setSelectedImages] = React.useState<
    Record<string, boolean>
  >({});

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

  React.useEffect(() => {
    if (isBlisterCondition(condition)) return;
    if (isLalamoveOnlyShipClass(shipClass)) return;
    setShipClass(shipClassFromBrand(brand));
  }, [brand, condition, shipClass]);

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
    void loadValuations();
    void loadBarcodeLogs();
    void loadProtectorStock();
    void loadReviewQueue();
  }, []);

  React.useEffect(() => {
    if (!focusAfterSaveRef.current) return;
    focusAfterSaveRef.current = false;
    window.scrollTo({ top: 0, behavior: "auto" });
    focusBarcodeInput({ preventScroll: false });
  });

  async function loadValuations() {
    setValuationLoading(true);
    setValuationError(null);

    const [activeRes, allRes] = await Promise.all([
      supabase.rpc("fn_admin_inventory_valuation", {
        include_archived: false,
      }),
      supabase.rpc("fn_admin_inventory_valuation", {
        include_archived: true,
      }),
    ]);

    if (activeRes.error || allRes.error) {
      const msg = [activeRes.error?.message, allRes.error?.message]
        .filter(Boolean)
        .join(" | ");
      setValuationError(msg || "Failed to load inventory valuation.");
    }

    if (!activeRes.error) {
      setValuationActive(parseValuation(activeRes.data));
    }
    if (!allRes.error) {
      setValuationAll(parseValuation(allRes.data));
    }

    setValuationLoading(false);
  }

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

  async function runSearch() {
    const q = search.trim();
    if (!q) return;

    const ilike = `%${q}%`;

    // Search products by identity AND variants by barcode, then merge by product id
    const [{ data: pData, error: pErr }, { data: vData, error: vErr }] =
      await Promise.all([
        supabase
          .from("products")
          .select(
            "id,title,brand,model,variation,image_urls,is_active,created_at"
          )
          .or(
            `title.ilike.${ilike},brand.ilike.${ilike},model.ilike.${ilike},variation.ilike.${ilike}`
          )
          .order("created_at", { ascending: false })
          .limit(20),

        supabase
          .from("product_variants")
          .select(
            "product:products(id,title,brand,model,variation,image_urls,is_active,created_at)"
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

  async function loadProduct(p: Product) {
    conditionTouchedRef.current = false;
    titleEditedRef.current = false;
    lastAutoTitleRef.current = "";
    lastAutoIdentityRef.current = { brand: "", model: "", variation: "" };
    setSelectedProduct(p);
    setTitle(p.title ?? "");
    setBrand(p.brand ?? "");
    setModel(p.model ?? "");
    setVariation(p.variation ?? "");
    setImages(Array.isArray(p.image_urls) ? p.image_urls : []);
    setSelectedImages({});
    setLookupMsg(null);
    setQueuedVariants([]);

    setLoadingVariants(true);
    const { data, error } = await supabase
      .from("product_variants")
      .select(
        "id,product_id,condition,issue_notes,issue_photo_urls,public_notes,cost,price,qty,ship_class,barcode,created_at"
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
    applyVariantDefaultsFromExisting(loaded);
    focusBarcodeInput();
  }

  async function loadProductById(productId: string) {
    if (!productId) return;
    const { data, error } = await supabase
      .from("products")
      .select("id,title,brand,model,variation,image_urls,is_active,created_at")
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

  function clearProduct() {
    conditionTouchedRef.current = false;
    titleEditedRef.current = false;
    lastAutoTitleRef.current = "";
    lastAutoIdentityRef.current = { brand: "", model: "", variation: "" };
    setSelectedProduct(null);
    setTitle("");
    setBrand("");
    setModel("");
    setVariation("");
    setImages([]);
    setSelectedImages({});
    setVariants([]);
    setProductUrl("");
    setProductUrlMsg(null);
    setProductUrlResult(null);
    setProductUrlSelectedImages({});
    resetBarcodeLookup();
    setManualImageUrl("");
    setQueuedVariants([]);

    // also clear variant draft
    setCondition(defaultConditionForBrand(""));
    setPublicNotes("");
    setIssuePhotos([]);
    setIssuePhotosUploading(false);
    setIssuePhotosUploadingId(null);
    setCost("");
    setPrice("");
    setQty("1");
    setShipClass(shipClassFromBrand(brand));
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
    setCondition(defaultConditionForBrand(brand));
    setPublicNotes("");
    setIssuePhotos([]);
    setIssuePhotosUploading(false);
    setIssuePhotosUploadingId(null);
    setCost("");
    setPrice("");
    setQty("1");
    setShipClass(shipClassFromBrand(brand));
    setVariantBarcode("");
  }

  function resetBarcodeLookup() {
    setBarcodeLookup("");
    setLookupMsg(null);
    lastAutoLookupRef.current = "";
    if (barcodeLookupTimerRef.current) {
      clearTimeout(barcodeLookupTimerRef.current);
      barcodeLookupTimerRef.current = null;
    }
  }

  const conditionCycle: VariantCondition[] = [
    "unsealed",
    "sealed",
    "with_issues",
    "resealed",
    "near_mint",
    "sealed_blister",
    "unsealed_blister",
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
    setPrice("");
    setQty("1");
  }

  function saveQueuedVariants() {
    if (saving) return;
    const currentDraft = buildVariantDraft();
    const drafts = isDraftEmpty(currentDraft)
      ? queuedVariants
      : [...queuedVariants, currentDraft];
    if (!drafts.length) {
      toast({ intent: "error", message: "Add a variant before saving." });
      return;
    }
    saveNewVariant({ keepProduct: true, drafts, reloadAfterSave: true });
  }

  async function lookupBarcode(override?: string) {
    const code = (override ?? barcodeLookup).trim();
    if (!code) return;

    setLookupLoading(true);
    setLookupMsg(null);

    try {
      const r = await fetch(
        `/api/barcode/lookup?barcode=${encodeURIComponent(code)}`
      );
      const j = await r.json();

      if (!j.ok) {
        setLookupMsg(j.error ?? "No barcode match.");
        return;
      }

      const d = j.data;

      // Fill product identity, but do not overwrite manual edits
      const rawTitle = String(d.title ?? title ?? "");
      const normalizedTitle = normalizeLookupTitle(rawTitle, d.brand ?? null);
      const kaidoNormalized = normalizeKaidoMiniGtTitle(
        normalizedTitle || normalizeTitleBrandAliases(rawTitle),
        d.color_style ?? null
      );

      if (kaidoNormalized) {
        if (kaidoNormalized.title) {
          setTitle((prev) =>
            resolveNormalizedTitle(prev, kaidoNormalized.title)
          );
        }
        if (kaidoNormalized.brand) {
          setBrand((prev) =>
            resolveNormalizedBrand(prev, kaidoNormalized.brand)
          );
        }
        if (kaidoNormalized.model && !model) setModel(kaidoNormalized.model);
        if (kaidoNormalized.variation && !variation)
          setVariation(kaidoNormalized.variation);
      } else {
        if (d.title || title) {
          setTitle((prev) => resolveNormalizedTitle(prev, normalizedTitle));
        }
        const titleBrand = brandFromNormalizedTitle(normalizedTitle);
        if (titleBrand) {
          setBrand(titleBrand);
        } else if (d.brand) {
          setBrand((prev) => resolveNormalizedBrand(prev, d.brand));
        }
        if (d.model && !model) setModel(d.model);
        if (d.color_style && !variation) setVariation(d.color_style);

        const inferred = inferFieldsFromTitle(normalizedTitle);
        if (inferred.brand && !titleBrand) {
          setBrand((prev) => resolveNormalizedBrand(prev, inferred.brand));
        }
        if (!d.model && !model && inferred.model) setModel(inferred.model);
        if (!d.color_style && !variation && inferred.color_style)
          setVariation(inferred.color_style);
      }

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
      if (!variantBarcode.trim()) setVariantBarcode(code);

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
    if (result.model) setModel((prev) => (prev ? prev : result.model!));
    if (result.variation)
      setVariation((prev) => (prev ? prev : result.variation!));

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
      const j = await r.json();

      if (!j.ok) {
        setProductUrlMsg(j.error ?? "URL lookup failed.");
        setProductUrlResult(null);
        setProductUrlSelectedImages({});
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
      const normalizedResult: ProductUrlLookupData = {
        ...d,
        title: normalizedTitle || d.title,
        brand: normalizedBrand ?? d.brand ?? inferred.brand ?? null,
        model: d.model ?? inferred.model ?? null,
        variation: d.variation ?? inferred.color_style ?? null,
        images: imgs,
        source_url: d.source_url ?? url,
      };
      const map: Record<string, boolean> = {};
      imgs.forEach((u) => {
        map[u] = true;
      });

      setProductUrlResult(normalizedResult);
      setProductUrlSelectedImages(map);

      applyLookupResult(normalizedResult, { applyImages: false });

      setProductUrlMsg(
        "URL lookup success. Review details and confirm images before saving."
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
          .select("id,title,brand,model,variation,image_urls,is_active,created_at")
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
            "barcode,ship_class,product:products(id,title,brand,model,variation,image_urls,is_active)"
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
              product_variants: [{ ship_class: row?.ship_class ?? null }],
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
            const hasThumb =
              Array.isArray(target.image_urls) && target.image_urls.length > 0;
            if (!bulkHideThumbed || !hasThumb) {
              await assignBulkUpload(match, target);
              setBulkSearchLoading((prev) => ({ ...prev, [matchId]: false }));
              return;
            }
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
          "id,title,brand,model,variation,image_urls,is_active,product_variants(ship_class)"
        )
        .or(orParts.join(","))
        .limit(60);
      if (error) throw error;

      const unique = new Map<string, Product>();
      ((data as Product[]) ?? []).forEach((p) => unique.set(p.id, p));
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

  async function assignBulkUpload(match: ReviewMatch, product: Product) {
    if (!match?.upload_url) return;
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
    } catch (e: any) {
      toast({
        intent: "error",
        message: e?.message ?? "Failed to apply photo.",
      });
    }
  }

  async function uploadImageFile(
    file: File,
    productIdForPath: string,
    options?: { skipLoading?: boolean }
  ) {
    if (!options?.skipLoading) setManualUploadLoading(true);
    try {
      const url = await uploadFileToStorage(file, productIdForPath);
      setImages((prev) => uniq([...prev, url]));
      setSelectedImages((prev) => ({ ...prev, [url]: true }));
    } finally {
      if (!options?.skipLoading) setManualUploadLoading(false);
    }
  }

  async function uploadImageFiles(files: File[], productIdForPath: string) {
    if (!files.length) return;
    setManualUploadLoading(true);
    try {
      for (const file of files) {
        try {
          await uploadImageFile(file, productIdForPath, { skipLoading: true });
        } catch (e) {
          console.error("Image upload failed", e);
        }
      }
    } finally {
      setManualUploadLoading(false);
    }
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

  function applyVariantDefaultsFromExisting(list: Variant[]) {
    if (!Array.isArray(list) || list.length === 0) return;
    const base = [...list].reverse().find((v) => v) ?? list[list.length - 1];
    if (!base) return;
    const nextCondition = nextConditionFromExisting(list);
    setCondition(nextCondition);
    setVariantBarcode(base.barcode ?? "");
    setCost(base.cost != null ? String(base.cost) : "");
    setPrice("");
    setQty(base.qty != null ? String(base.qty) : "1");
    const baseShipClass =
      (base.ship_class as ShipClass | null) ?? shipClassFromBrand(brand);
    setShipClass(
      isBlisterCondition(nextCondition)
        ? "BLISTER"
        : baseShipClass && isLalamoveOnlyShipClass(baseShipClass)
          ? baseShipClass
          : baseShipClass ?? shipClassFromBrand(brand)
    );
    setPublicNotes(String(base.public_notes ?? base.issue_notes ?? ""));
    setIssuePhotos(Array.isArray(base.issue_photo_urls) ? base.issue_photo_urls : []);
  }

  function nextConditionFromExisting(list: Variant[]): VariantCondition {
    const hasNearMint = list.some((v) => v.condition === "near_mint");
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
      await updateVariant(v, { issue_photo_urls: next });
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
    await updateVariant(v, { issue_photo_urls: next.length ? next : null });
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

  function stepExistingQty(v: Variant, delta: number) {
    const current = Math.trunc(n(v.qty));
    const next = Math.max(0, current + delta);
    updateVariant(v, { qty: next });
  }

  function addQtyToVariant(v: Variant) {
    const raw = addQtyByVariant[v.id] ?? "";
    const parsed = Math.trunc(n(raw));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const current = Math.trunc(n(v.qty));
    const next = Math.max(0, current + parsed);
    updateVariant(v, { qty: next });
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
        const normalizedTitle = normalizeTitleBrandAliases(title).trim();
        const { error: uErr } = await supabase
          .from("products")
          .update({
            title: normalizedTitle,
            brand: brand || null,
            model: model || null,
            variation: variation || null,
            created_at: new Date().toISOString(),
          })
          .eq("id", selectedProduct.id);

      if (uErr) throw uErr;

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
        .select(
          "id,title,brand,model,variation,image_urls,is_active,created_at"
        )
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
        .select(
          "id,title,brand,model,variation,image_urls,is_active,created_at"
        )
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
  }) {
    setSaving(true);
    const reloadAfterSave = Boolean(options?.reloadAfterSave);

    try {
      const normalizedTitle = normalizeTitleBrandAliases(title).trim();
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
            image_urls: [],
            is_active: true,
          })
          .select(
            "id,title,brand,model,variation,image_urls,is_active,created_at"
          )
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
            created_at: new Date().toISOString(),
          })
          .eq("id", productId);
        if (uErr) throw uErr;
      }

      const createdVariants: Variant[] = [];
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
          draft.condition === "near_mint"
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
              draft.condition === "with_issues" && draft.issuePhotos.length
                ? draft.issuePhotos
                : null,
            cost: costN,
            price: priceN,
            qty: qtyN,
            ship_class: draft.shipClass,
            barcode: barcodeValue,
          })
          .select(
            "id,product_id,condition,issue_notes,issue_photo_urls,public_notes,cost,price,qty,ship_class,barcode,created_at"
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
      }

      toast({
        intent: "success",
        message:
          createdVariants.length > 1
            ? `Saved ${createdVariants.length} variants.`
            : "Saved product + variant.",
      });

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
          .select(
            "id,title,brand,model,variation,image_urls,is_active,created_at"
          )
          .single();

        if (pErr) throw pErr;
        const productId = String(product.id);
        const barcodeValue = await generateUniqueBarcode();
        const notesValue =
          item.condition === "with_issues"
            ? issueNoteValue
            : item.condition === "near_mint"
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
    const { error } = await supabase
      .from("product_variants")
      .update(patch)
      .eq("id", v.id);

    if (error) {
      toast({ intent: "error", message: error.message });
      return;
    }
    if (selectedProduct) await loadProduct(selectedProduct);
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

  function formatLogDate(value: string) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString("en-PH");
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
  const activeValuation = valuationActive ?? emptyValuation;
  const allValuation = valuationAll ?? emptyValuation;
  const primaryValuation = includeArchived ? allValuation : activeValuation;
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Inventory</div>
          <div className="text-sm text-white/60">
            Search, edit product identity, manage variants
            (qty/price/cost/barcode), and mark items as sold out.
          </div>
        </CardHeader>

        <CardBody className="space-y-6">
          {/* Inventory worth */}
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
          </div>

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
                {results.map((p) => {
                  const img =
                    Array.isArray(p.image_urls) && p.image_urls.length
                      ? p.image_urls[0]
                      : null;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => loadProduct(p)}
                      className="text-left rounded-xl border border-white/10 bg-paper/5 hover:bg-paper/10 px-3 py-2 flex gap-3"
                    >
                      <div className="h-14 w-14 rounded-lg bg-bg-800 border border-white/10 overflow-hidden flex-shrink-0">
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
                        <div className="font-medium flex items-center justify-between gap-3">
                          <span className="truncate">{p.title}</span>
                          <span
                            className={
                              p.is_active
                                ? "text-accent-700 dark:text-accent-200 text-xs"
                                : "text-red-300 text-xs"
                            }
                          >
                            {p.is_active ? "ACTIVE" : "SOLD OUT"}
                          </span>
                        </div>
                        <div className="text-xs text-white/60">
                          {p.brand ?? "—"} {p.model ? `• ${p.model}` : ""}{" "}
                          {p.variation ? `• ${p.variation}` : ""}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-white/50">
                Search then select a product to edit, or click “New”.
              </div>
            )}
          </div>

          {/* Barcode lookup */}
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
              >
                Scan
              </Button>
              <Button
                variant="secondary"
                onClick={() => lookupBarcode()}
                disabled={lookupLoading}
              >
                {lookupLoading ? "Looking up..." : "Lookup"}
              </Button>
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

          {/* Bulk photo inbox */}
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
                <Checkbox
                  checked={bulkHideThumbed}
                  onChange={setBulkHideThumbed}
                  label="Hide thumbnailed"
                />
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
              <span className="text-xs text-white/60">Ship class filter:</span>
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
                Uploading {bulkUploadProgress.current} of{" "}
                {bulkUploadProgress.total} (
                {Math.round(
                  (bulkUploadProgress.current / bulkUploadProgress.total) * 100
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
                  const results = bulkHideThumbed
                    ? shipFiltered.filter(
                        (p) =>
                          !Array.isArray(p.image_urls) ||
                          p.image_urls.length === 0
                      )
                    : shipFiltered;
                  const filteredByThumbs =
                    bulkHideThumbed &&
                    shipFiltered.length > 0 &&
                    results.length === 0;
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
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                runBulkSearch(match.id);
                                return;
                              }
                              if (e.key === "ArrowUp") {
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
                                      {p.brand ?? "â€”"} {p.model ? `â€¢ ${p.model}` : ""}{" "}
                                      {p.variation ? `â€¢ ${p.variation}` : ""}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : term ? (
                          <div className="text-xs text-white/60">
                            {filteredByShip
                              ? "No matches in selected ship classes."
                              : filteredByThumbs
                                ? "All matches already have thumbnails."
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

          {bulkPreviewUrl ? (
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
                      onClick={() => bulkPreviewUrl && window.open(bulkPreviewUrl, "_blank")}
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
                    src={bulkPreviewUrl}
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

          {/* Product URL lookup */}
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

            {productUrlResult ? (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label="Suggested Title"
                    value={productUrlResult.title ?? ""}
                    readOnly
                  />
                  <Input
                    label="Suggested Brand"
                    value={productUrlResult.brand ?? ""}
                    readOnly
                  />
                  <Input
                    label="Suggested Model"
                    value={productUrlResult.model ?? ""}
                    readOnly
                  />
                  <Input
                    label="Suggested Variation"
                    value={productUrlResult.variation ?? ""}
                    readOnly
                  />
                  <div className="md:col-span-2">
                    <Input
                      label="Source URL"
                      value={productUrlResult.source_url ?? ""}
                      readOnly
                    />
                  </div>
                </div>

                {productUrlResult.images?.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {productUrlResult.images.slice(0, 9).map((u) => (
                      <div
                        key={u}
                        className="rounded-xl border border-white/10 bg-bg-900/40 overflow-hidden"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="h-40 w-full object-cover" />
                        <div className="p-3">
                          <Checkbox
                            checked={!!productUrlSelectedImages[u]}
                            onChange={(v) =>
                              setProductUrlSelectedImages((m) => ({
                                ...m,
                                [u]: v,
                              }))
                            }
                            label="Include image"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-white/50">
                    No images found for this URL.
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() =>
                      productUrlResult &&
                      applyLookupResult(productUrlResult, {
                        selected: productUrlSelectedImages,
                      })
                    }
                    disabled={productUrlLoading || !productUrlResult}
                  >
                    Use result
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Product identity */}
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Product Identity</div>
              {selectedProduct ? (
                <Badge>{selectedProduct.id.slice(0, 8)}</Badge>
              ) : (
                <Badge>NEW</Badge>
              )}
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
                <Input
                  label="Diecast Brand"
                  value={brand}
                  onChange={(e) => {
                    const nextBrand = e.target.value;
                    setBrand(nextBrand);
                    syncTitleFromIdentity(nextBrand, model, variation);
                  }}
                />
                <Input
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
                  const list = Array.from(e.target.files ?? []);
                  if (!list.length) return;
                  const pid = selectedProduct?.id ?? crypto.randomUUID();
                  void uploadImageFiles(list, pid);
                  e.currentTarget.value = "";
                }}
              />
              <div className="text-xs text-white/50 mt-1">
                Select multiple images from your gallery.
              </div>
              <div className="mt-2">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    if (!list.length) return;
                    const pid = selectedProduct?.id ?? crypto.randomUUID();
                    void uploadImageFiles(list, pid);
                    e.currentTarget.value = "";
                  }}
                />
                <div className="text-xs text-white/50 mt-1">Take photo</div>
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
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Existing Variants</div>
              <Badge>{variants.length}</Badge>
            </div>

            {loadingVariants ? (
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
                    v.condition === "with_issues"
                      ? "text-red-200/80"
                      : v.condition === "near_mint"
                        ? "text-amber-200/80"
                        : "text-white/60";
                  const indicatorTone =
                    v.condition === "with_issues"
                      ? "bg-red-400"
                      : v.condition === "near_mint"
                        ? "bg-amber-400"
                        : "";
                  const showIndicator = indicatorTone.length > 0;

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
                          updateVariant(v, { barcode: e.target.value || null })
                        }
                      />
                      <Input
                        label="Cost"
                        value={String(v.cost ?? "")}
                        onChange={(e) =>
                          updateVariant(v, {
                            cost: e.target.value ? n(e.target.value) : null,
                          })
                        }
                      />
                      <Input
                        label="Price"
                        value={String(v.price ?? "")}
                        onChange={(e) =>
                          updateVariant(v, { price: n(e.target.value) })
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
                                updateVariant(v, {
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
                        label="Ship Class"
                        value={v.ship_class ?? ""}
                        onChange={(e) =>
                          updateVariant(v, {
                            ship_class: e.target.value || null,
                          })
                        }
                      >
                        <option value="">—</option>
                        <option value="MINI_GT">MINI_GT</option>
                        <option value="KAIDO">KAIDO</option>
                        <option value="POPRACE">POPRACE</option>
                        <option value="ACRYLIC_TRUE_SCALE">
                          ACRYLIC_TRUE_SCALE
                        </option>
                        <option value="TRUCKS">TRUCKS</option>
                        <option value="BLISTER">BLISTER</option>
                        <option value="TOMICA">TOMICA</option>
                        <option value="HOT_WHEELS_MAINLINE">HOT_WHEELS_MAINLINE</option>
                        <option value="HOT_WHEELS_PREMIUM">HOT_WHEELS_PREMIUM</option>
                        <option value="LOOSE_NO_BOX">LOOSE_NO_BOX</option>
                        <option value="LALAMOVE">LALAMOVE</option>
                        <option value="DIORAMA">DIORAMA</option>
                      </Select>

                      <div className="flex items-end">
                        <Button
                          variant="ghost"
                          onClick={() => deleteVariant(v)}
                        >
                          Delete
                        </Button>
                      </div>

                      <div className="md:col-span-6">
                        <Textarea
                          label="Notes (visible to customers)"
                          value={String(v.public_notes ?? v.issue_notes ?? "")}
                          onChange={(e) =>
                            updateVariant(v, {
                              public_notes: e.target.value || null,
                              issue_notes: null,
                            })
                          }
                        />
                      </div>

                      {v.condition === "with_issues" ? (
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
                            <div className="text-xs text-white/50">Take photo</div>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                void uploadVariantIssueFiles(v, [f]);
                                e.currentTarget.value = "";
                              }}
                            />
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
          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-4 space-y-4">
            <div className="font-semibold">Add New Variant (Condition)</div>

            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Condition"
                value={condition}
                onChange={(e) => {
                  const next = e.target.value as VariantCondition;
                  conditionTouchedRef.current = true;
                  const leavingNearMint =
                    condition === "near_mint" &&
                    publicNotes.trim() === "Near Mint Condition" &&
                    next !== "near_mint";
                  setCondition(next);
                  if (next === "near_mint" && !publicNotes.trim()) {
                    setPublicNotes("Near Mint Condition");
                  } else if (leavingNearMint) {
                    setPublicNotes("");
                  }
                  if (isBlisterCondition(next)) {
                    setShipClass("BLISTER");
                  } else if (shipClass === "BLISTER") {
                    setShipClass(shipClassFromBrand(brand));
                  }
                }}
              >
                <option value="sealed">Sealed</option>
                <option value="resealed">Resealed</option>
                <option value="near_mint">Near Mint</option>
                <option value="sealed_blister">Sealed blister</option>
                <option value="unsealed">Unsealed</option>
                <option value="unsealed_blister">Unsealed blister</option>
                <option value="blistered">Blistered</option>
                <option value="with_issues">With Issues</option>
              </Select>

              <Select
                label="Shipping Class"
                value={shipClass}
                onChange={(e) => setShipClass(e.target.value as ShipClass)}
              >
                <option value="MINI_GT">Mini GT</option>
                <option value="KAIDO">Kaido</option>
                <option value="POPRACE">Pop Race</option>
                <option value="ACRYLIC_TRUE_SCALE">Acrylic True-Scale</option>
                <option value="TRUCKS">Trucks</option>
                <option value="BLISTER">Blister</option>
                <option value="TOMICA">Tomica</option>
                <option value="HOT_WHEELS_MAINLINE">Hot Wheels Mainline</option>
                <option value="HOT_WHEELS_PREMIUM">Hot Wheels Premium</option>
                <option value="LOOSE_NO_BOX">Loose (No Box)</option>
                <option value="LALAMOVE">Lalamove</option>
                <option value="DIORAMA">Diorama (Lalamove)</option>
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
                onChange={(e) =>
                  setCost(e.target.value.replace(/[^0-9.]/g, ""))
                }
                placeholder="(empty)"
              />
              <Input
                label="Selling Price (₱)"
                value={price}
                onChange={(e) =>
                  setPrice(e.target.value.replace(/[^0-9.]/g, ""))
                }
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

              {condition === "with_issues" ? (
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
                    <div className="text-xs text-white/50">Take photo</div>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const folderId = `issue-${selectedProduct?.id ?? crypto.randomUUID()}`;
                        void uploadIssueFiles([f], folderId);
                        e.currentTarget.value = "";
                      }}
                    />
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
              <Button onClick={saveQueuedVariants} disabled={saving}>
                {saving
                  ? "Saving..."
                  : queuedVariants.length
                    ? "Save variants"
                  : "Save"}
              </Button>
              <Button variant="secondary" onClick={queueVariantDraft} disabled={saving}>
                {saving ? "Saving..." : "+ Add another variant"}
              </Button>
            </div>

            <div className="text-xs text-white/50">
              Cost/Price are empty by default. Qty defaults to 1.
            </div>
          </div>

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
                <option value="KAIDO">Kaido</option>
                <option value="POPRACE">Pop Race</option>
                <option value="ACRYLIC_TRUE_SCALE">Acrylic True-Scale</option>
                <option value="TRUCKS">Trucks</option>
                <option value="BLISTER">Blister</option>
                <option value="TOMICA">Tomica</option>
                <option value="HOT_WHEELS_MAINLINE">Hot Wheels Mainline</option>
                <option value="HOT_WHEELS_PREMIUM">Hot Wheels Premium</option>
                <option value="LOOSE_NO_BOX">Loose (No Box)</option>
                <option value="LALAMOVE">Lalamove</option>
                <option value="DIORAMA">Diorama (Lalamove)</option>
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
                <option value="sealed">Sealed</option>
                <option value="unsealed">Unsealed</option>
                <option value="near_mint">Near Mint</option>
                <option value="with_issues">With Issues</option>
                <option value="resealed">Resealed</option>
                <option value="sealed_blister">Sealed blister</option>
                <option value="unsealed_blister">Unsealed blister</option>
                <option value="blistered">Blistered</option>
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
        </CardBody>
      </Card>

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
                <div className="text-xs text-white/50">Product card preview</div>
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
                  className="h-full w-full object-contain"
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

