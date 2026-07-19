"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { BarcodeScannerModal } from "@/components/pos/BarcodeScannerModal";
import { toast } from "@/components/ui/toast";
import { normalizeBarcode } from "@/lib/barcode";
import { useCart } from "@/hooks/useCart";
import {
  ALL_VARIANT_CONDITIONS,
  formatConditionLabel,
} from "@/lib/conditions";
import { formatPHP } from "@/lib/money";
import { cropStyle, parseImageCrop } from "@/lib/imageCrop";
import { isScheduledRelease } from "@/lib/inventoryRelease";

type RefresherCondition = (typeof ALL_VARIANT_CONDITIONS)[number];

type BrandTab = {
  name: string;
  sort_order: number;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_urls: string[] | null;
  is_active: boolean;
  product_variants: Array<{
    id: string;
    condition: RefresherCondition;
    barcode: string | null;
    qty: number | null;
    price: number | null;
    ship_class: string | null;
    release_at: string | null;
  }> | null;
};

type VariantRow = {
  id: string;
  condition: RefresherCondition;
  barcode: string | null;
  qty: number | null;
  price: number | null;
  ship_class: string | null;
  release_at: string | null;
  product:
    | {
        id: string;
        title: string;
        brand: string | null;
        model: string | null;
        variation: string | null;
        image_urls: string[] | null;
        is_active: boolean;
      }
    | Array<{
        id: string;
        title: string;
        brand: string | null;
        model: string | null;
        variation: string | null;
        image_urls: string[] | null;
        is_active: boolean;
      }>
    | null;
};

function getVariantProduct(
  product: VariantRow["product"]
) {
  if (Array.isArray(product)) return product[0] ?? null;
  return product;
}

type RefresherItem = {
  product_id: string;
  variant_id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_urls: string[];
  image_url: string | null;
  product_active: boolean;
  condition: RefresherCondition;
  barcode: string | null;
  qty: number;
  price: number;
  ship_class: string | null;
  release_at: string | null;
};

type RefresherViewMode = "scoped" | "seen" | "remaining" | "units_remaining";
type PersistedSeenRecord = RefresherItem & { seen_at: number; seen_qty: number };
type FullyCountedPopup = {
  item: RefresherItem;
  seenQty: number;
  token: number;
};
type SeenItemRow = {
  variant_id: string;
  product_id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation: string | null;
  image_urls: string[] | null;
  image_url: string | null;
  product_active: boolean | null;
  condition: RefresherCondition;
  barcode: string | null;
  qty: number | string | null;
  seen_qty?: number | string | null;
  price: number | string | null;
  ship_class: string | null;
  release_at: string | null;
  seen_at: string | null;
};

const ALL_BRANDS_VALUE = "__ALL_BRANDS__";
const SEEN_ITEMS_STORAGE_KEY = "oddwheels:inventory_refresher_seen_items";
const SHIP_CLASS_OPTIONS = [
  "MINI_GT",
  "SMALL_BOX_FIGURE",
  "KAIDO",
  "BBR",
  "POPRACE",
  "TARMAC_BOX",
  "ACRYLIC_TRUE_SCALE",
  "TARMAC_ACRYLIC",
  "TRUCKS",
  "BLISTER",
  "TOMICA",
  "TOMICA_LIMITED_VINTAGE_NEO",
  "HOT_WHEELS_MAINLINE",
  "HOT_WHEELS_PREMIUM",
  "LOOSE_NO_BOX",
  "LALAMOVE",
  "FIGURES_DIORAMA",
] as const;

type RefresherItemEditDraft = {
  title: string;
  brand: string;
  model: string;
  variation: string;
  condition: RefresherCondition;
  barcode: string;
  price: string;
  ship_class: string;
  release_at: string;
};

function normalizeSearchText(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLiveVariant(releaseAt: string | null | undefined) {
  if (!releaseAt) return true;
  if (!isScheduledRelease(releaseAt)) return true;
  return Date.parse(releaseAt) <= Date.now();
}

function matchesSearch(item: RefresherItem, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const barcode = normalizeBarcode(query);
  if (barcode) {
    const itemBarcode = normalizeBarcode(item.barcode ?? "");
    if (itemBarcode.includes(barcode)) return true;
  }

  const haystack = normalizeSearchText(
    [
      item.title,
      item.brand,
      item.model,
      item.variation,
      item.barcode,
      formatConditionLabel(item.condition),
      item.ship_class,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return normalizedQuery
    .split(" ")
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function matchesScope(
  item: Pick<RefresherItem, "brand" | "condition">,
  selectedBrand: string,
  allVariants: boolean,
  selectedConditions: RefresherCondition[]
) {
  if (
    selectedBrand !== ALL_BRANDS_VALUE &&
    (item.brand?.trim() || "Unknown") !== selectedBrand
  ) {
    return false;
  }
  if (
    !allVariants &&
    selectedConditions.length &&
    !selectedConditions.includes(item.condition)
  ) {
    return false;
  }
  return true;
}

function normalizePersistedSeenRecords(records: PersistedSeenRecord[]) {
  return [...records].sort((a, b) => b.seen_at - a.seen_at);
}

function clampSeenQty(seenQty: number, totalQty: number) {
  return Math.max(0, Math.min(seenQty, Math.max(0, totalQty)));
}

function normalizeNullableText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeShipClassValue(value: string) {
  const trimmed = value.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

function toDatetimeLocalInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocalInputValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function createEditDraft(item: RefresherItem): RefresherItemEditDraft {
  return {
    title: item.title,
    brand: item.brand ?? "",
    model: item.model ?? "",
    variation: item.variation ?? "",
    condition: item.condition,
    barcode: item.barcode ?? "",
    price: String(item.price ?? 0),
    ship_class: item.ship_class ?? "",
    release_at: toDatetimeLocalInputValue(item.release_at),
  };
}

function mergePersistedSeenRecords(...sources: PersistedSeenRecord[][]) {
  const byVariantId = new Map<string, PersistedSeenRecord>();
  sources.flat().forEach((record) => {
    const existing = byVariantId.get(record.variant_id);
    if (!existing || record.seen_at >= existing.seen_at) {
      byVariantId.set(record.variant_id, record);
    }
  });
  return normalizePersistedSeenRecords(Array.from(byVariantId.values()));
}

function shouldSyncSeenRecords(
  localRecords: PersistedSeenRecord[],
  remoteRecords: PersistedSeenRecord[]
) {
  if (!localRecords.length) return false;
  const remoteByVariantId = new Map(
    remoteRecords.map((record) => [record.variant_id, record.seen_at] as const)
  );
  return localRecords.some((record) => {
    const remoteSeenAt = remoteByVariantId.get(record.variant_id);
    return remoteSeenAt == null || record.seen_at > remoteSeenAt;
  });
}

function parsePersistedSeenRecords(raw: string | null): PersistedSeenRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const parsedRecords = parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Partial<PersistedSeenRecord>;
        const variantId = String(record.variant_id ?? "").trim();
        const productId = String(record.product_id ?? "").trim();
        const title = String(record.title ?? "").trim();
        const condition = record.condition;
        if (
          !variantId ||
          !productId ||
          !title ||
          !condition ||
          !ALL_VARIANT_CONDITIONS.includes(condition as RefresherCondition)
        ) {
          return null;
        }

        return {
          product_id: productId,
          variant_id: variantId,
          title,
          brand:
            typeof record.brand === "string" && record.brand.trim()
              ? record.brand
              : null,
          model:
            typeof record.model === "string" && record.model.trim()
              ? record.model
              : null,
          variation:
            typeof record.variation === "string" && record.variation.trim()
              ? record.variation
              : null,
          image_urls: Array.isArray(record.image_urls)
            ? record.image_urls.filter(
                (value): value is string =>
                  typeof value === "string" && value.trim().length > 0
              )
            : [],
          image_url:
            typeof record.image_url === "string" && record.image_url.trim()
              ? record.image_url
              : null,
          product_active: Boolean(record.product_active),
          condition: condition as RefresherCondition,
          barcode:
            typeof record.barcode === "string" && record.barcode.trim()
              ? record.barcode
              : null,
          qty: Math.max(0, Number(record.qty ?? 0)),
          seen_qty: clampSeenQty(
            Math.max(0, Number(record.seen_qty ?? 1)),
            Math.max(0, Number(record.qty ?? 0))
          ),
          price: Number(record.price ?? 0),
          ship_class:
            typeof record.ship_class === "string" && record.ship_class.trim()
              ? record.ship_class
              : null,
          release_at:
            typeof record.release_at === "string" && record.release_at.trim()
              ? record.release_at
              : null,
          seen_at: Number(record.seen_at ?? Date.now()),
        };
      })
      .filter(Boolean) as PersistedSeenRecord[];
    return normalizePersistedSeenRecords(parsedRecords);
  } catch {
    return [];
  }
}

function readPersistedSeenRecords() {
  if (typeof window === "undefined") return [];
  try {
    return parsePersistedSeenRecords(window.localStorage.getItem(SEEN_ITEMS_STORAGE_KEY));
  } catch {
    return [];
  }
}

function mapSeenItemRowToRecord(row: SeenItemRow): PersistedSeenRecord {
  return {
    product_id: row.product_id,
    variant_id: row.variant_id,
    title: row.title,
    brand: row.brand,
    model: row.model,
    variation: row.variation,
    image_urls: Array.isArray(row.image_urls)
      ? row.image_urls.filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0
        )
      : [],
    image_url: row.image_url,
    product_active: Boolean(row.product_active),
    condition: row.condition,
    barcode: row.barcode,
    qty: Math.max(0, Number(row.qty ?? 0)),
    seen_qty: clampSeenQty(
      Math.max(0, Number(row.seen_qty ?? (Number(row.qty ?? 0) > 0 ? 1 : 0))),
      Math.max(0, Number(row.qty ?? 0))
    ),
    price: Number(row.price ?? 0),
    ship_class: row.ship_class,
    release_at: row.release_at,
    seen_at: row.seen_at ? Date.parse(row.seen_at) || Date.now() : Date.now(),
  };
}

function mapSeenRecordToRow(record: PersistedSeenRecord, userId: string) {
  return {
    user_id: userId,
    variant_id: record.variant_id,
    product_id: record.product_id,
    title: record.title,
    brand: record.brand,
    model: record.model,
    variation: record.variation,
    image_urls: record.image_urls,
    image_url: record.image_url,
    product_active: record.product_active,
    condition: record.condition,
    barcode: record.barcode,
    qty: record.qty,
    seen_qty: record.seen_qty,
    price: record.price,
    ship_class: record.ship_class,
    release_at: record.release_at,
    seen_at: new Date(record.seen_at).toISOString(),
  };
}

function mergeSeenRecordsWithInventory(
  records: PersistedSeenRecord[],
  flattenedByVariantId: Map<string, RefresherItem>
) {
  return normalizePersistedSeenRecords(
    records.map((record) => {
      const latest = flattenedByVariantId.get(record.variant_id);
      if (!latest) {
        return {
          ...record,
          seen_qty: clampSeenQty(record.seen_qty, record.qty),
        };
      }
      return {
        ...latest,
        seen_at: record.seen_at,
        seen_qty: clampSeenQty(record.seen_qty, latest.qty),
      };
    })
  );
}

function variantSort(a: RefresherItem, b: RefresherItem) {
  return (
    String(a.brand ?? "").localeCompare(String(b.brand ?? ""), undefined, {
      sensitivity: "base",
    }) ||
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) ||
    a.condition.localeCompare(b.condition, undefined, { sensitivity: "base" }) ||
    String(a.barcode ?? "").localeCompare(String(b.barcode ?? ""))
  );
}

function buildBrandTabs(items: RefresherItem[], brandTabs: BrandTab[]) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = item.brand?.trim() || "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const ordered: Array<{ value: string; label: string; count: number }> = [];
  brandTabs
    .filter((tab) => counts.has(tab.name))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .forEach((tab) => {
      ordered.push({
        value: tab.name,
        label: tab.name,
        count: counts.get(tab.name) ?? 0,
      });
      counts.delete(tab.name);
    });

  Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([name, count]) => {
      ordered.push({ value: name, label: name, count });
    });

  return [
    {
      value: ALL_BRANDS_VALUE,
      label: "All Brands",
      count: items.length,
    },
    ...ordered,
  ];
}

function ItemPhotoThumb({
  item,
  sizeClass,
  emptyLabel,
}: {
  item: RefresherItem;
  sizeClass: string;
  emptyLabel: string;
}) {
  const image = item.image_url ? parseImageCrop(item.image_url) : null;

  return (
    <div className={`relative shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20 ${sizeClass}`}>
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            alt={item.title}
            className="h-full w-full object-cover bg-neutral-50"
            style={cropStyle(image.crop)}
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-white/35">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

function RefresherItemCard({
  item,
  seenQty,
  unseenQty,
  onMarkSeen,
  onMarkUnseen,
  onReduceQty,
  onSetSoldOut,
  onHideProduct,
  onStartEdit,
  onCancelEdit,
  onEditDraftChange,
  onSaveEdit,
  isEditing,
  editDraft,
  busyKey,
}: {
  item: RefresherItem;
  seenQty: number;
  unseenQty: number;
  onMarkSeen: (variantId: string) => void;
  onMarkUnseen: (variantId: string) => void;
  onReduceQty: (item: RefresherItem, nextQty: number) => Promise<void>;
  onSetSoldOut: (item: RefresherItem) => Promise<void>;
  onHideProduct: (item: RefresherItem) => Promise<void>;
  onStartEdit: (item: RefresherItem) => void;
  onCancelEdit: () => void;
  onEditDraftChange: (patch: Partial<RefresherItemEditDraft>) => void;
  onSaveEdit: () => Promise<void>;
  isEditing: boolean;
  editDraft: RefresherItemEditDraft | null;
  busyKey: string | null;
}) {
  const fullySeen = unseenQty <= 0 && item.qty > 0;
  const partiallySeen = seenQty > 0 && unseenQty > 0;
  const editBusy = busyKey === `edit:${item.variant_id}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex gap-3">
        <ItemPhotoThumb item={item} sizeClass="h-20 w-20" emptyLabel="No Image" />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium leading-tight">{item.title}</div>
            <Badge
              className={
                fullySeen
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                  : partiallySeen
                    ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
                  : "border-amber-400/40 bg-amber-500/15 text-amber-100"
              }
            >
              {fullySeen ? "Fully Counted" : partiallySeen ? "Partially Counted" : "Uncounted"}
            </Badge>
            {!item.product_active ? (
              <Badge className="border-white/10 bg-white/[0.06] text-white/70">
                Hidden
              </Badge>
            ) : item.qty <= 0 ? (
              <Badge className="border-red-400/40 bg-red-500/15 text-red-100">
                Sold Out
              </Badge>
            ) : null}
          </div>

          <div className="text-xs text-white/55">
            {[item.brand, item.model, item.variation].filter(Boolean).join(" | ") || "-"}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
            <Badge className="border-white/10 bg-white/[0.04] text-white/75">
              {formatConditionLabel(item.condition)}
            </Badge>
            <span>Stock {item.qty}</span>
            <span>Seen {seenQty}</span>
            <span>Unseen {unseenQty}</span>
            <span>{formatPHP(item.price)}</span>
            <span>Barcode: {item.barcode ?? "-"}</span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant={isEditing ? "secondary" : "ghost"}
              size="sm"
              onClick={() => (isEditing ? onCancelEdit() : onStartEdit(item))}
            >
              {isEditing ? "Close editor" : "Edit details"}
            </Button>
            {unseenQty > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={unseenQty <= 0}
                onClick={() => onMarkSeen(item.variant_id)}
              >
                Count seen +1
              </Button>
            ) : null}
            {seenQty > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onMarkUnseen(item.variant_id)}
              >
                Undo seen -1
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              disabled={busyKey === item.variant_id || item.qty <= 0}
              onClick={() => void onReduceQty(item, Math.max(0, item.qty - 1))}
            >
              {busyKey === item.variant_id ? "Saving..." : "Sold -1"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busyKey === item.variant_id || item.qty <= 0}
              onClick={() => void onSetSoldOut(item)}
            >
              Set qty 0
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busyKey === `hide:${item.product_id}`}
              onClick={() => void onHideProduct(item)}
            >
              {busyKey === `hide:${item.product_id}` ? "Saving..." : "Hide from live"}
            </Button>
          </div>

          {isEditing && editDraft ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Input
                  label="Title"
                  value={editDraft.title}
                  onChange={(e) => onEditDraftChange({ title: e.target.value })}
                />
                <Input
                  label="Brand"
                  value={editDraft.brand}
                  onChange={(e) => onEditDraftChange({ brand: e.target.value })}
                />
                <Input
                  label="Model"
                  value={editDraft.model}
                  onChange={(e) => onEditDraftChange({ model: e.target.value })}
                />
                <Input
                  label="Variation"
                  value={editDraft.variation}
                  onChange={(e) => onEditDraftChange({ variation: e.target.value })}
                />
                <Select
                  label="Condition"
                  value={editDraft.condition}
                  onChange={(e) =>
                    onEditDraftChange({
                      condition: e.target.value as RefresherCondition,
                    })
                  }
                >
                  {ALL_VARIANT_CONDITIONS.map((condition) => (
                    <option key={condition} value={condition}>
                      {formatConditionLabel(condition)}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Ship Class"
                  value={editDraft.ship_class}
                  onChange={(e) => onEditDraftChange({ ship_class: e.target.value })}
                >
                  <option value="">None</option>
                  {SHIP_CLASS_OPTIONS.map((shipClass) => (
                    <option key={shipClass} value={shipClass}>
                      {shipClass}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Price"
                  inputMode="decimal"
                  value={editDraft.price}
                  onChange={(e) => onEditDraftChange({ price: e.target.value })}
                />
                <Input
                  label="Barcode"
                  value={editDraft.barcode}
                  onChange={(e) => onEditDraftChange({ barcode: e.target.value })}
                />
                <Input
                  label="Release At"
                  type="datetime-local"
                  value={editDraft.release_at}
                  onChange={(e) => onEditDraftChange({ release_at: e.target.value })}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={editBusy}
                  onClick={() => void onSaveEdit()}
                >
                  {editBusy ? "Saving..." : "Save changes"}
                </Button>
                <Button variant="ghost" size="sm" disabled={editBusy} onClick={onCancelEdit}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function InventoryRefresher({
  inventoryUnitsInStock = null,
}: {
  inventoryUnitsInStock?: number | null;
}) {
  const cart = useCart();
  const [items, setItems] = React.useState<RefresherItem[]>([]);
  const [brandTabs, setBrandTabs] = React.useState<BrandTab[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedBrand, setSelectedBrand] = React.useState(ALL_BRANDS_VALUE);
  const [allVariants, setAllVariants] = React.useState(true);
  const [brandsCollapsed, setBrandsCollapsed] = React.useState(false);
  const [selectedConditions, setSelectedConditions] = React.useState<
    RefresherCondition[]
  >([]);
  const [listSearchQuery, setListSearchQuery] = React.useState("");
  const [listConditionsCollapsed, setListConditionsCollapsed] = React.useState(false);
  const [selectedListConditions, setSelectedListConditions] = React.useState<
    RefresherCondition[]
  >([]);
  const [viewMode, setViewMode] = React.useState<RefresherViewMode>("remaining");
  const [seenRecords, setSeenRecords] = React.useState<PersistedSeenRecord[]>(
    () => readPersistedSeenRecords()
  );
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
  const [lastAddedVariantId, setLastAddedVariantId] = React.useState<string | null>(null);
  const [lastAddedSnapshot, setLastAddedSnapshot] = React.useState<RefresherItem | null>(null);
  const [editingVariantId, setEditingVariantId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<RefresherItemEditDraft | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [fullyCountedPopup, setFullyCountedPopup] = React.useState<FullyCountedPopup | null>(
    null
  );
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const scanBufferRef = React.useRef("");
  const scanTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanActiveRef = React.useRef(false);
  const lastScanAtRef = React.useRef(0);

  const loadInventory = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) {
        setLoading(false);
        setError(authError.message || "Failed to load staff session.");
        return;
      }

      const userId = authData.user?.id ?? null;
      setCurrentUserId(userId);

      const legacySeenRecords = readPersistedSeenRecords();
      const [
        { data: variantRows, error: variantsError },
        { data: brandRows, error: brandError },
        { data: seenRows, error: seenError },
      ] = await Promise.all([
        supabase
          .from("product_variants")
          .select(
            "id,condition,barcode,qty,price,ship_class,release_at,product:products!inner(id,title,brand,model,variation,image_urls,is_active)"
          )
          .gt("qty", 0),
        supabase
          .from("brand_tabs")
          .select("name,sort_order,is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        userId
            ? supabase
              .from("inventory_refresher_seen_items")
              .select(
                "variant_id,product_id,title,brand,model,variation,image_urls,image_url,product_active,condition,barcode,qty,seen_qty,price,ship_class,release_at,seen_at"
              )
              .order("seen_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (variantsError || brandError || seenError) {
        setLoading(false);
        setError(
          variantsError?.message ||
            brandError?.message ||
            seenError?.message ||
            "Failed to load inventory."
        );
        return;
      }

      const flattened = ((variantRows as VariantRow[] | null) ?? [])
        .flatMap((variant) => {
          const product = getVariantProduct(variant.product);
          if (!product) return [];
          const imageUrls = Array.isArray(product.image_urls)
            ? product.image_urls.filter((url): url is string => Boolean(url))
            : [];

          return [
            {
              product_id: product.id,
              variant_id: variant.id,
              title: product.title,
              brand: product.brand,
              model: product.model,
              variation: product.variation,
              image_urls: imageUrls,
              image_url: imageUrls[0] ?? null,
              product_active: product.is_active,
              condition: variant.condition,
              barcode: variant.barcode,
              qty: Math.max(0, Number(variant.qty ?? 0)),
              price: Number(variant.price ?? 0),
              ship_class: variant.ship_class,
              release_at: variant.release_at,
            },
          ];
        })
        .sort(variantSort);
      const liveItems = flattened.filter(
        (item) => item.qty > 0 && item.product_active && isLiveVariant(item.release_at)
      );
      const flattenedByVariantId = new Map(
        flattened.map((item) => [item.variant_id, item] as const)
      );
      const remoteSeenRecords = ((seenRows as SeenItemRow[] | null) ?? []).map(
        mapSeenItemRowToRecord
      );
      const mergedSeenRecords = mergeSeenRecordsWithInventory(
        mergePersistedSeenRecords(remoteSeenRecords, legacySeenRecords),
        flattenedByVariantId
      );

      if (userId && shouldSyncSeenRecords(legacySeenRecords, remoteSeenRecords)) {
        const { error: syncError } = await supabase
          .from("inventory_refresher_seen_items")
          .upsert(
            mergedSeenRecords.map((record) => mapSeenRecordToRow(record, userId)),
            { onConflict: "user_id,variant_id" }
          );
        if (syncError) {
          toast({
            intent: "error",
            title: "Seen list sync failed",
            message: "Supabase could not import the cached seen items on this device.",
          });
        }
      }

      setItems(liveItems);
      setBrandTabs((brandRows as BrandTab[] | null) ?? []);
      setSeenRecords(mergedSeenRecords);
      setLastAddedSnapshot((prev) => {
        if (!prev) return prev;
        return flattenedByVariantId.get(prev.variant_id) ?? prev;
      });
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setError(
        error instanceof Error
          ? error.message || "Failed to load inventory."
          : "Failed to load inventory."
      );
    }
  }, []);

  const upsertSeenRecord = React.useCallback(
    async (record: PersistedSeenRecord) => {
      if (!currentUserId) return;
      const { error: syncError } = await supabase
        .from("inventory_refresher_seen_items")
        .upsert(mapSeenRecordToRow(record, currentUserId), {
          onConflict: "user_id,variant_id",
        });

      if (syncError) {
        toast({
          intent: "error",
          title: "Seen list sync failed",
          message: "The item was saved locally but could not be synced to Supabase.",
        });
      }
    },
    [currentUserId]
  );

  const deleteSeenRecord = React.useCallback(
    async (variantId: string) => {
      if (!currentUserId) return;
      const { error: deleteError } = await supabase
        .from("inventory_refresher_seen_items")
        .delete()
        .eq("user_id", currentUserId)
        .eq("variant_id", variantId);

      if (deleteError) {
        toast({
          intent: "error",
          title: "Seen list sync failed",
          message: "Supabase could not remove that seen item. The page will reload its saved list.",
        });
        void loadInventory();
      }
    },
    [currentUserId, loadInventory]
  );

  React.useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  React.useEffect(() => {
    if (loading || scannerOpen) return;
    focusSearchInput();
  }, [loading, scannerOpen]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (scannerOpen) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditableTarget =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        Boolean(target?.isContentEditable);
      const isSearchInput = target === searchInputRef.current;
      const suppressScanCapture = Boolean(
        target?.closest?.('[data-disable-scan-capture="true"]')
      );

      if (suppressScanCapture || (isEditableTarget && !isSearchInput)) {
        scanBufferRef.current = "";
        scanActiveRef.current = false;
        if (scanTimerRef.current) {
          clearTimeout(scanTimerRef.current);
        }
        return;
      }

      const key = event.key;
      const now = Date.now();

      if (key === "Enter") {
        const candidate = scanBufferRef.current;
        if (candidate.length >= 6) {
          processScannedValue(candidate);
          scanBufferRef.current = "";
          scanActiveRef.current = false;
          event.preventDefault();
        }
        return;
      }

      if (!/^[0-9]$/.test(key)) return;

      const gap = now - lastScanAtRef.current;
      if (gap > 400) {
        scanBufferRef.current = "";
        scanActiveRef.current = false;
      }

      lastScanAtRef.current = now;
      scanBufferRef.current += key;

      const scannerLike = gap <= 80 || scanBufferRef.current.length >= 3;
      if (!scannerLike) return;

      scanActiveRef.current = true;
      setQuery(scanBufferRef.current);
      if (!isSearchInput) {
        focusSearchInput();
      }

      if (isEditableTarget && !isSearchInput) {
        event.preventDefault();
      }

      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
      }
      scanTimerRef.current = setTimeout(() => {
        const candidate = scanBufferRef.current;
        scanBufferRef.current = "";
        scanActiveRef.current = false;
        if (candidate.length >= 6) {
          processScannedValue(candidate);
        }
      }, 250);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
      }
    };
  }, [processScannedValue, scannerOpen]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        SEEN_ITEMS_STORAGE_KEY,
        JSON.stringify(seenRecords)
      );
    } catch {
      // ignore
    }
  }, [seenRecords]);

  React.useEffect(() => {
    if (!fullyCountedPopup) return;
    const timeoutId = window.setTimeout(() => {
      setFullyCountedPopup((current) =>
        current?.token === fullyCountedPopup.token ? null : current
      );
    }, 4000);
    return () => window.clearTimeout(timeoutId);
  }, [fullyCountedPopup]);

  const seenQtyByVariantId = React.useMemo(
    () =>
      new Map(
        seenRecords.map((record) => [
          record.variant_id,
          clampSeenQty(record.seen_qty, record.qty),
        ] as const)
      ),
    [seenRecords]
  );

  const getSeenQty = React.useCallback(
    (variantId: string, totalQty: number) =>
      clampSeenQty(seenQtyByVariantId.get(variantId) ?? 0, totalQty),
    [seenQtyByVariantId]
  );

  const getUnseenQty = React.useCallback(
    (variantId: string, totalQty: number) =>
      Math.max(0, totalQty - getSeenQty(variantId, totalQty)),
    [getSeenQty]
  );

  const brandOptions = React.useMemo(
    () => buildBrandTabs(items, brandTabs),
    [items, brandTabs]
  );

  const scopedItems = React.useMemo(() => {
    return items.filter((item) =>
      matchesScope(item, selectedBrand, allVariants, selectedConditions)
    );
  }, [allVariants, items, selectedBrand, selectedConditions]);

  const searchResults = React.useMemo(() => {
    const searchableItems = scopedItems.filter(
      (item) => getSeenQty(item.variant_id, item.qty) < item.qty
    );
    if (!query.trim()) return searchableItems;
    return searchableItems.filter((item) => matchesSearch(item, query)).sort((a, b) => {
      const queryBarcode = normalizeBarcode(query);
      const aBarcode = normalizeBarcode(a.barcode ?? "");
      const bBarcode = normalizeBarcode(b.barcode ?? "");
      const aExact = queryBarcode && aBarcode === queryBarcode ? 1 : 0;
      const bExact = queryBarcode && bBarcode === queryBarcode ? 1 : 0;
      return bExact - aExact || variantSort(a, b);
    });
  }, [getSeenQty, scopedItems, query]);

  const remainingItems = React.useMemo(
    () => scopedItems.filter((item) => getUnseenQty(item.variant_id, item.qty) > 0),
    [getUnseenQty, scopedItems]
  );

  const seenItems = React.useMemo(
    () =>
      seenRecords.filter((item) =>
        matchesScope(item, selectedBrand, allVariants, selectedConditions) &&
        clampSeenQty(item.seen_qty, item.qty) > 0
      ),
    [allVariants, seenRecords, selectedBrand, selectedConditions]
  );

  const filterListItems = React.useCallback(
    (sourceItems: RefresherItem[]) =>
      sourceItems.filter((item) => {
        if (
          selectedListConditions.length > 0 &&
          !selectedListConditions.includes(item.condition)
        ) {
          return false;
        }
        if (!listSearchQuery.trim()) return true;
        return matchesSearch(item, listSearchQuery);
      }),
    [listSearchQuery, selectedListConditions]
  );

  const filteredScopedItems = React.useMemo(
    () => filterListItems(scopedItems),
    [filterListItems, scopedItems]
  );

  const filteredSeenItems = React.useMemo(
    () => filterListItems(seenItems),
    [filterListItems, seenItems]
  );

  const filteredRemainingItems = React.useMemo(
    () => filterListItems(remainingItems),
    [filterListItems, remainingItems]
  );

  const listConditionCounts = React.useMemo(() => {
    const sourceItems =
      viewMode === "seen"
        ? seenItems
        : viewMode === "scoped"
          ? scopedItems
          : remainingItems;

    return ALL_VARIANT_CONDITIONS.map((condition) => ({
      condition,
      count: sourceItems.filter((item) => item.condition === condition).length,
    }));
  }, [remainingItems, scopedItems, seenItems, viewMode]);

  const seenUnitsCount = React.useMemo(
    () => scopedItems.reduce((sum, item) => sum + getSeenQty(item.variant_id, item.qty), 0),
    [getSeenQty, scopedItems]
  );

  const unitsRemainingCount = React.useMemo(
    () =>
      scopedItems.reduce((sum, item) => sum + getUnseenQty(item.variant_id, item.qty), 0),
    [getUnseenQty, scopedItems]
  );

  const isFullInventoryScope =
    selectedBrand === ALL_BRANDS_VALUE &&
    allVariants &&
    selectedConditions.length === 0;

  const syncedUnitsRemainingCount =
    isFullInventoryScope &&
    seenItems.length === 0 &&
    inventoryUnitsInStock != null
      ? inventoryUnitsInStock
      : unitsRemainingCount;

  const displayedItems = React.useMemo(() => {
    switch (viewMode) {
      case "scoped":
        return filteredScopedItems;
      case "seen":
        return [...filteredSeenItems].sort(
          (a, b) =>
            getSeenQty(b.variant_id, b.qty) - getSeenQty(a.variant_id, a.qty) ||
            variantSort(a, b)
        );
      case "units_remaining":
        return [...filteredRemainingItems].sort(
          (a, b) =>
            getUnseenQty(b.variant_id, b.qty) - getUnseenQty(a.variant_id, a.qty) ||
            variantSort(a, b)
        );
      case "remaining":
      default:
        return filteredRemainingItems;
    }
  }, [
    filteredRemainingItems,
    filteredScopedItems,
    filteredSeenItems,
    getSeenQty,
    getUnseenQty,
    viewMode,
  ]);

  const listMeta = React.useMemo(() => {
    switch (viewMode) {
      case "scoped":
        return {
          title: "Scoped Variants",
          countLabel: `${filteredScopedItems.length} variants`,
          emptyMessage: "No variants match the current scope.",
        };
      case "seen":
        return {
          title: "Seen Items",
          countLabel: `${filteredSeenItems.length} variants, ${filteredSeenItems.reduce(
            (sum, item) => sum + getSeenQty(item.variant_id, item.qty),
            0
          )} units counted`,
          emptyMessage:
            listSearchQuery.trim() || selectedListConditions.length > 0
              ? "No seen items match the current filters."
              : "No variants have been saved to the seen list yet.",
        };
      case "units_remaining":
        return {
          title: "Units Remaining",
          countLabel: `${filteredRemainingItems.length} variants, ${
            listSearchQuery.trim() || selectedListConditions.length > 0
              ? filteredRemainingItems.reduce(
                  (sum, item) => sum + getUnseenQty(item.variant_id, item.qty),
                  0
                )
              : syncedUnitsRemainingCount
          } units`,
          emptyMessage:
            listSearchQuery.trim() || selectedListConditions.length > 0
              ? "No remaining units match the current filters."
              : "There are no remaining units in the current scope.",
        };
      case "remaining":
      default:
        return {
          title: "Remaining To Check",
          countLabel: `${filteredRemainingItems.length} variants`,
          emptyMessage:
            listSearchQuery.trim() || selectedListConditions.length > 0
              ? "No variants match the current filters."
              : "Everything in the current scope has been seen.",
        };
    }
  }, [
    filteredRemainingItems,
    filteredScopedItems.length,
    filteredSeenItems,
    getSeenQty,
    getUnseenQty,
    query,
    remainingItems,
    seenUnitsCount,
    scopedItems.length,
    seenItems.length,
    listSearchQuery,
    selectedListConditions.length,
    syncedUnitsRemainingCount,
    viewMode,
  ]);

  const exactSingleMatch = React.useMemo(() => {
    const normalized = normalizeBarcode(query);
    if (!normalized) return null;
    const exact = searchResults.filter(
      (item) => normalizeBarcode(item.barcode ?? "") === normalized
    );
    return exact.length === 1 ? exact[0] : null;
  }, [query, searchResults]);

  const singleSearchMatch = React.useMemo(() => {
    return searchResults.length === 1 ? searchResults[0] : null;
  }, [searchResults]);

  const suggestionItems = React.useMemo(() => {
    const normalized = normalizeBarcode(query);
    if (normalized && exactSingleMatch) return [];
    if (!query.trim()) return [];
    return searchResults.slice(0, 8);
  }, [exactSingleMatch, query, searchResults]);

  const lastAddedItem = React.useMemo(() => {
    const latestSeenRecord = seenRecords[0];
    if (latestSeenRecord) {
      return (
        items.find((item) => item.variant_id === latestSeenRecord.variant_id) ??
        latestSeenRecord
      );
    }
    if (!lastAddedVariantId) return lastAddedSnapshot;
    return (
      items.find((item) => item.variant_id === lastAddedVariantId) ??
      lastAddedSnapshot
    );
  }, [items, lastAddedSnapshot, lastAddedVariantId, seenRecords]);

  function focusSearchInput() {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }

  function showFullyCountedPopup(item: RefresherItem, seenQty: number) {
    setFullyCountedPopup({
      item,
      seenQty: clampSeenQty(seenQty, item.qty),
      token: Date.now(),
    });
  }

  function addItemToSession(item: RefresherItem, options?: { clearQuery?: boolean }) {
    const seenAt = Date.now();
    const currentSeenQty = getSeenQty(item.variant_id, item.qty);
    if (currentSeenQty >= item.qty) {
      if (options?.clearQuery) setQuery("");
      showFullyCountedPopup(item, currentSeenQty);
      focusSearchInput();
      toast({
        intent: "success",
        title: "Already fully counted",
        message: `${item.title} has already been counted up to its stock qty.`,
      });
      return;
    }

    const nextRecord = {
      ...item,
      seen_at: seenAt,
      seen_qty: clampSeenQty(currentSeenQty + 1, item.qty),
    };
    setSeenRecords((prev) => mergePersistedSeenRecords([nextRecord], prev));
    setLastAddedVariantId(item.variant_id);
    setLastAddedSnapshot(item);
    if (options?.clearQuery) setQuery("");
    focusSearchInput();
    void upsertSeenRecord(nextRecord);
    if (nextRecord.seen_qty >= item.qty && item.qty > 0) {
      showFullyCountedPopup(item, nextRecord.seen_qty);
    }
    toast({
      intent: "success",
      title: nextRecord.seen_qty >= item.qty && item.qty > 0 ? "Fully counted" : "Counted",
      message: `${item.title} (${formatConditionLabel(item.condition)}) seen ${nextRecord.seen_qty}/${item.qty}.`,
    });
  }

  function markSeen(variantId: string) {
    const item = items.find((entry) => entry.variant_id === variantId);
    if (!item) return;
    addItemToSession(item, { clearQuery: true });
  }

  async function addAllUnseenToAdminCart() {
    if (busyKey === "bulk-admin-cart") return;
    if (!cart.isLoggedIn) {
      toast({
        intent: "error",
        title: "Admin cart unavailable",
        message: "Sign in to add unseen items to the admin cart.",
      });
      return;
    }

    const unseenItems = remainingItems;
    if (unseenItems.length === 0) {
      toast({
        intent: "success",
        title: "Nothing to add",
        message: "There are no unseen items left in the current scope.",
      });
      return;
    }

    setBusyKey("bulk-admin-cart");
    let addedVariants = 0;
    let addedUnits = 0;
    let cappedVariants = 0;

    try {
      for (const item of unseenItems) {
        const unseenQty = getUnseenQty(item.variant_id, item.qty);
        if (unseenQty <= 0) continue;
        const result = await cart.add(item.variant_id, unseenQty);
        addedVariants += 1;
        addedUnits += Math.max(0, result.nextQty - result.prevQty);
        if (result.capped) cappedVariants += 1;
      }
    } catch (error) {
      setBusyKey(null);
      toast({
        intent: "error",
        title: "Admin cart update failed",
        message:
          error instanceof Error ? error.message : "Could not add unseen items to the admin cart.",
      });
      return;
    }

    setBusyKey(null);
    toast({
      intent: "success",
      title: "Unseen items added",
      message:
        cappedVariants > 0
          ? `${addedVariants} variant(s) and ${addedUnits} unit(s) were added to the admin cart. ${cappedVariants} variant(s) were capped by current stock.`
          : `${addedVariants} variant(s) and ${addedUnits} unit(s) were added to the admin cart.`,
      action: { label: "View cart", href: "/cart" },
    });
  }

  function markUnseen(variantId: string) {
    const seenRecord = seenRecords.find((item) => item.variant_id === variantId);
    if (!seenRecord) return;

    const nextSeenQty = clampSeenQty(seenRecord.seen_qty - 1, seenRecord.qty);
    if (nextSeenQty <= 0) {
      setSeenRecords((prev) => prev.filter((item) => item.variant_id !== variantId));
      void deleteSeenRecord(variantId);
      return;
    }

    const nextRecord = {
      ...seenRecord,
      seen_qty: nextSeenQty,
      seen_at: Date.now(),
    };
    setSeenRecords((prev) => mergePersistedSeenRecords([nextRecord], prev));
    void upsertSeenRecord(nextRecord);
  }

  function toggleCondition(condition: RefresherCondition) {
    setSelectedConditions((prev) =>
      prev.includes(condition)
        ? prev.filter((value) => value !== condition)
        : [...prev, condition]
    );
  }

  function toggleListCondition(condition: RefresherCondition) {
    setSelectedListConditions((prev) =>
      prev.includes(condition)
        ? prev.filter((value) => value !== condition)
        : [...prev, condition]
    );
  }

  function startEditingItem(item: RefresherItem) {
    setEditingVariantId(item.variant_id);
    setEditDraft(createEditDraft(item));
  }

  function cancelEditingItem() {
    setEditingVariantId(null);
    setEditDraft(null);
  }

  function updateEditDraft(patch: Partial<RefresherItemEditDraft>) {
    setEditDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function applyItemDetailsLocally(
    variantId: string,
    productId: string,
    nextItem: RefresherItem
  ) {
    setItems((prev) =>
      prev.map((row) =>
        row.variant_id === variantId || row.product_id === productId
          ? {
              ...row,
              title: nextItem.title,
              brand: nextItem.brand,
              model: nextItem.model,
              variation: nextItem.variation,
              condition: row.variant_id === variantId ? nextItem.condition : row.condition,
              barcode: row.variant_id === variantId ? nextItem.barcode : row.barcode,
              price: row.variant_id === variantId ? nextItem.price : row.price,
              ship_class: row.variant_id === variantId ? nextItem.ship_class : row.ship_class,
              release_at: row.variant_id === variantId ? nextItem.release_at : row.release_at,
            }
          : row
      )
    );
    setSeenRecords((prev) =>
      prev.map((record) =>
        record.variant_id === variantId || record.product_id === productId
          ? {
              ...record,
              title: nextItem.title,
              brand: nextItem.brand,
              model: nextItem.model,
              variation: nextItem.variation,
              condition:
                record.variant_id === variantId ? nextItem.condition : record.condition,
              barcode: record.variant_id === variantId ? nextItem.barcode : record.barcode,
              price: record.variant_id === variantId ? nextItem.price : record.price,
              ship_class:
                record.variant_id === variantId ? nextItem.ship_class : record.ship_class,
              release_at:
                record.variant_id === variantId ? nextItem.release_at : record.release_at,
            }
          : record
      )
    );
    setLastAddedSnapshot((prev) =>
      prev && (prev.variant_id === variantId || prev.product_id === productId)
        ? {
            ...prev,
            title: nextItem.title,
            brand: nextItem.brand,
            model: nextItem.model,
            variation: nextItem.variation,
            condition: prev.variant_id === variantId ? nextItem.condition : prev.condition,
            barcode: prev.variant_id === variantId ? nextItem.barcode : prev.barcode,
            price: prev.variant_id === variantId ? nextItem.price : prev.price,
            ship_class: prev.variant_id === variantId ? nextItem.ship_class : prev.ship_class,
            release_at: prev.variant_id === variantId ? nextItem.release_at : prev.release_at,
          }
        : prev
    );
  }

  async function saveEditingItem() {
    if (!editingVariantId || !editDraft) return;

    const item = items.find((entry) => entry.variant_id === editingVariantId);
    if (!item) {
      toast({
        intent: "error",
        title: "Item not found",
        message: "That variant is no longer available in the current list.",
      });
      cancelEditingItem();
      return;
    }

    const title = editDraft.title.trim();
    const price = Number(editDraft.price);
    if (!title) {
      toast({
        intent: "error",
        title: "Title required",
        message: "Enter an item title before saving.",
      });
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast({
        intent: "error",
        title: "Invalid price",
        message: "Price must be a valid non-negative number.",
      });
      return;
    }

    const productPayload = {
      title,
      brand: normalizeNullableText(editDraft.brand),
      model: normalizeNullableText(editDraft.model),
      variation: normalizeNullableText(editDraft.variation),
    };
    const variantPayload = {
      condition: editDraft.condition,
      barcode: normalizeNullableText(editDraft.barcode),
      price,
      ship_class: normalizeShipClassValue(editDraft.ship_class),
      release_at: fromDatetimeLocalInputValue(editDraft.release_at),
    };

    setBusyKey(`edit:${editingVariantId}`);

    const { error: productError } = await supabase
      .from("products")
      .update(productPayload)
      .eq("id", item.product_id);

    if (productError) {
      setBusyKey(null);
      toast({
        intent: "error",
        title: "Product update failed",
        message: productError.message,
      });
      return;
    }

    const { error: variantError } = await supabase
      .from("product_variants")
      .update(variantPayload)
      .eq("id", editingVariantId);

    if (variantError) {
      setBusyKey(null);
      toast({
        intent: "error",
        title: "Variant update failed",
        message: variantError.message,
      });
      return;
    }

    const nextItem: RefresherItem = {
      ...item,
      ...productPayload,
      ...variantPayload,
      brand: productPayload.brand,
      model: productPayload.model,
      variation: productPayload.variation,
      barcode: variantPayload.barcode,
      ship_class: variantPayload.ship_class,
      release_at: variantPayload.release_at,
    };

    applyItemDetailsLocally(editingVariantId, item.product_id, nextItem);
    setBusyKey(null);
    toast({
      intent: "success",
      title: "Item updated",
      message: `${nextItem.title} details were saved.`,
    });
    cancelEditingItem();
  }

  async function syncProductActiveState(productId: string, nextVariantQty: number, variantId: string) {
    const siblingHasStock = items.some(
      (item) =>
        item.product_id === productId &&
        item.variant_id !== variantId &&
        item.qty > 0
    );
    const shouldStayActive = siblingHasStock || nextVariantQty > 0;
    if (shouldStayActive) return true;

    const { error: productError } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", productId);

    if (productError) {
      toast({
        intent: "error",
        title: "Product status update failed",
        message: productError.message,
      });
      return false;
    }

    return false;
  }

  async function reduceQty(item: RefresherItem, nextQty: number) {
    setBusyKey(item.variant_id);
    const { error: variantError } = await supabase
      .from("product_variants")
      .update({ qty: nextQty })
      .eq("id", item.variant_id);

    if (variantError) {
      setBusyKey(null);
      toast({
        intent: "error",
        title: "Inventory update failed",
        message: variantError.message,
      });
      return;
    }

    const stillActive = await syncProductActiveState(item.product_id, nextQty, item.variant_id);

    const nextSnapshot =
      nextQty > 0 && stillActive
        ? { ...item, qty: nextQty, product_active: stillActive }
        : { ...item, qty: 0, product_active: stillActive };
    setItems((prev) =>
      prev
        .map((row) =>
          row.variant_id === item.variant_id
            ? { ...row, qty: nextQty, product_active: stillActive }
            : row
        )
        .filter((row) => row.qty > 0 && row.product_active)
    );
    if (lastAddedVariantId === item.variant_id) {
      setLastAddedSnapshot(nextSnapshot);
    }
    setSeenRecords((prev) =>
      prev.map((record) =>
        record.variant_id === item.variant_id
          ? {
              ...record,
              qty: nextQty,
              product_active: stillActive,
              seen_qty: clampSeenQty(record.seen_qty, nextQty),
            }
          : record
      )
    );
    setBusyKey(null);
  }

  async function setSoldOut(item: RefresherItem) {
    await reduceQty(item, 0);
  }

  async function hideProduct(item: RefresherItem) {
    setBusyKey(`hide:${item.product_id}`);
    const { error: productError } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", item.product_id);

    if (productError) {
      setBusyKey(null);
      toast({
        intent: "error",
        title: "Hide failed",
        message: productError.message,
      });
      return;
    }

    setItems((prev) => prev.filter((row) => row.product_id !== item.product_id));
    if (lastAddedVariantId && item.product_id === lastAddedSnapshot?.product_id) {
      setLastAddedSnapshot({ ...item, product_active: false, qty: 0 });
    }
    setSeenRecords((prev) =>
      prev.map((record) =>
        record.product_id === item.product_id
          ? { ...record, product_active: false }
          : record
      )
    );
    setBusyKey(null);
  }

  function handleSearchSubmit() {
    if (exactSingleMatch) {
      addItemToSession(exactSingleMatch, { clearQuery: true });
      return;
    }
    if (singleSearchMatch) {
      addItemToSession(singleSearchMatch, { clearQuery: true });
      return;
    }
    if (searchResults.length > 0) {
      focusSearchInput();
      return;
    }
    toast({
      intent: "error",
      title: "No single match",
      message: "Use a more exact name or scan the barcode.",
    });
    focusSearchInput();
  }

  function processScannedValue(rawValue: string) {
    const normalized = normalizeBarcode(rawValue);
    if (!normalized) return;

    const exactMatches = items.filter(
      (item) => normalizeBarcode(item.barcode ?? "") === normalized
    );

    if (exactMatches.length === 1) {
      addItemToSession(exactMatches[0], { clearQuery: true });
      return;
    }

    setQuery(normalized);
  }

  React.useEffect(() => {
    if (!exactSingleMatch) return;
    const barcode = normalizeBarcode(query);
    if (!barcode) return;
    const timer = window.setTimeout(() => {
      addItemToSession(exactSingleMatch, { clearQuery: true });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [exactSingleMatch, query]);

  return (
    <div className="space-y-6">
      {fullyCountedPopup ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-emerald-400/40 bg-bg-950/95 p-3 shadow-2xl backdrop-blur">
            <div className="flex items-start gap-3">
              <ItemPhotoThumb
                item={fullyCountedPopup.item}
                sizeClass="h-20 w-20"
                emptyLabel="No Img"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-emerald-100">
                    Fully Counted
                  </div>
                  <Badge className="border-emerald-400/40 bg-emerald-500/15 text-emerald-100">
                    {formatConditionLabel(fullyCountedPopup.item.condition)}
                  </Badge>
                </div>
                <div className="truncate text-base font-medium text-white">
                  {fullyCountedPopup.item.title}
                </div>
                <div className="truncate text-xs text-white/55">
                  {[
                    fullyCountedPopup.item.brand,
                    fullyCountedPopup.item.model,
                    fullyCountedPopup.item.variation,
                  ]
                    .filter(Boolean)
                    .join(" | ") || "-"}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/70">
                  <span>
                    Seen {fullyCountedPopup.seenQty}/{fullyCountedPopup.item.qty}
                  </span>
                  <span>{formatPHP(fullyCountedPopup.item.price)}</span>
                  <span>Barcode: {fullyCountedPopup.item.barcode ?? "-"}</span>
                </div>
                <div className="text-xs text-emerald-200/90">
                  This variant is fully counted.
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFullyCountedPopup(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-semibold">Inventory Refresher</div>
            <div className="text-sm text-white/60">
              Scan or type what you physically still have. Anything left in the
              remaining list is likely sold, missing, or needs quantity correction.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setScannerOpen(true)}>
              Scan
            </Button>
            <Button
              variant="secondary"
              onClick={() => void addAllUnseenToAdminCart()}
              disabled={
                loading ||
                cart.loading ||
                remainingItems.length === 0 ||
                busyKey === "bulk-admin-cart"
              }
            >
              {busyKey === "bulk-admin-cart"
                ? "Adding unseen..."
                : `Add all unseen to admin cart (${remainingItems.length})`}
            </Button>
            <Button variant="ghost" onClick={() => void loadInventory()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh inventory"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <button
            type="button"
            onClick={() => setViewMode("scoped")}
            className={[
              "rounded-xl border bg-paper/5 p-3 text-left transition",
              viewMode === "scoped"
                ? "border-accent-500 bg-accent-500/10"
                : "border-white/10 hover:border-white/20 hover:bg-paper/10",
            ].join(" ")}
          >
            <div className="text-xs text-white/60">Scoped variants</div>
            <div className="text-lg font-semibold">{scopedItems.length}</div>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("seen")}
            className={[
              "rounded-xl border bg-paper/5 p-3 text-left transition",
              viewMode === "seen"
                ? "border-accent-500 bg-accent-500/10"
                : "border-white/10 hover:border-white/20 hover:bg-paper/10",
            ].join(" ")}
          >
            <div className="text-xs text-white/60">Seen units</div>
            <div className="text-lg font-semibold">{seenUnitsCount}</div>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("remaining")}
            className={[
              "rounded-xl border bg-paper/5 p-3 text-left transition",
              viewMode === "remaining"
                ? "border-accent-500 bg-accent-500/10"
                : "border-white/10 hover:border-white/20 hover:bg-paper/10",
            ].join(" ")}
          >
            <div className="text-xs text-white/60">Unseen units</div>
            <div className="text-lg font-semibold">{syncedUnitsRemainingCount}</div>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("units_remaining")}
            className={[
              "rounded-xl border bg-paper/5 p-3 text-left transition",
              viewMode === "units_remaining"
                ? "border-accent-500 bg-accent-500/10"
                : "border-white/10 hover:border-white/20 hover:bg-paper/10",
            ].join(" ")}
          >
            <div className="text-xs text-white/60">Variants remaining</div>
            <div className="text-lg font-semibold">{remainingItems.length}</div>
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div className="space-y-3">
            <div className="relative">
              <Input
                ref={searchInputRef}
                placeholder="Scan barcode or type title / brand / model / variation..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearchSubmit();
                  }
                }}
              />
              {suggestionItems.length ? (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-bg-950/98 shadow-2xl backdrop-blur">
                  <div className="border-b border-white/10 px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] text-white/45">
                    Possible matches
                  </div>
                  <div className="max-h-80 overflow-auto p-2">
                    {suggestionItems.map((item) => (
                      <button
                        key={`suggestion-${item.variant_id}`}
                        type="button"
                        onClick={() => addItemToSession(item, { clearQuery: true })}
                        className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/[0.06]"
                      >
                        <ItemPhotoThumb item={item} sizeClass="h-16 w-16" emptyLabel="No Img" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-white">
                            {item.title}
                          </div>
                          <div className="truncate text-xs text-white/55">
                            {[item.brand, item.model, item.variation]
                              .filter(Boolean)
                              .join(" | ") || "-"}
                          </div>
                          <div className="mt-1 text-[11px] text-white/40">
                            {item.image_urls.length > 1
                              ? `${item.image_urls.length} product photos`
                              : item.image_urls.length === 1
                                ? "1 product photo"
                                : "No product photo"}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-white/65">
                          <div>{formatConditionLabel(item.condition)}</div>
                          <div>{formatPHP(item.price)}</div>
                          <div>Qty {item.qty}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-medium">Last added to available items</div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={
                    !lastAddedItem ||
                    getSeenQty(lastAddedItem.variant_id, lastAddedItem.qty) <= 0
                  }
                  onClick={() => {
                    if (!lastAddedItem) return;
                    markUnseen(lastAddedItem.variant_id);
                    toast({
                      intent: "success",
                      title: "Reverted",
                      message: `${lastAddedItem.title} had one counted unit removed.`,
                    });
                  }}
                >
                  Revert add
                </Button>
              </div>

              {lastAddedItem ? (
                <div className="mt-3">
                  <RefresherItemCard
                    item={lastAddedItem}
                    seenQty={getSeenQty(lastAddedItem.variant_id, lastAddedItem.qty)}
                    unseenQty={getUnseenQty(lastAddedItem.variant_id, lastAddedItem.qty)}
                    onMarkSeen={markSeen}
                    onMarkUnseen={markUnseen}
                    onReduceQty={reduceQty}
                    onSetSoldOut={setSoldOut}
                    onHideProduct={hideProduct}
                    onStartEdit={startEditingItem}
                    onCancelEdit={cancelEditingItem}
                    onEditDraftChange={updateEditDraft}
                    onSaveEdit={saveEditingItem}
                    isEditing={editingVariantId === lastAddedItem.variant_id}
                    editDraft={
                      editingVariantId === lastAddedItem.variant_id ? editDraft : null
                    }
                    busyKey={busyKey}
                  />
                </div>
              ) : (
                <div className="mt-3 text-sm text-white/55">
                  Scan a barcode or type an exact item name, then it will appear here automatically.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-medium">Search scope</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBrandsCollapsed((prev) => !prev)}
                  aria-expanded={!brandsCollapsed}
                  aria-controls="inventory-refresher-brand-scope"
                  className="rounded-full border border-white/10 bg-bg-900/40 px-3 py-1.5 text-xs text-white/75 transition hover:bg-bg-900/70"
                >
                  {brandsCollapsed ? "Expand brands" : "Collapse brands"}
                </button>
                <Checkbox
                  checked={allVariants}
                  onChange={(checked) => {
                    setAllVariants(checked);
                    if (checked) setSelectedConditions([]);
                  }}
                  label="All variants"
                />
              </div>
            </div>
            <div className="mt-2 text-xs text-white/45">
              Active brand:{" "}
              <span className="text-white/75">
                {brandOptions.find((brand) => brand.value === selectedBrand)?.label ?? "All Brands"}
              </span>
            </div>
            {brandsCollapsed ? null : (
              <div
                id="inventory-refresher-brand-scope"
                className="mt-2 flex flex-wrap gap-2"
              >
                {brandOptions.map((brand) => (
                  <button
                    key={brand.value}
                    type="button"
                    onClick={() => setSelectedBrand(brand.value)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-xs transition",
                      selectedBrand === brand.value
                        ? "border-accent-500 bg-accent-500/20 text-white"
                        : "border-white/10 bg-bg-900/40 text-white/70 hover:bg-bg-900/70",
                    ].join(" ")}
                  >
                    {brand.label} ({brand.count})
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium">Conditions in scope</div>
            <Checkbox
              checked={allVariants || selectedConditions.length === 0}
              onChange={(checked) => {
                if (checked) {
                  setAllVariants(true);
                  setSelectedConditions([]);
                }
              }}
              label="All conditions"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {ALL_VARIANT_CONDITIONS.map((condition) => {
              const count = items.filter((item) => item.condition === condition).length;
              const active = selectedConditions.includes(condition);
              return (
                <button
                  key={condition}
                  type="button"
                  disabled={allVariants}
                  onClick={() => {
                    setAllVariants(false);
                    toggleCondition(condition);
                  }}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-45",
                    active
                      ? "border-accent-500 bg-accent-500/20 text-white"
                      : "border-white/10 bg-bg-900/40 text-white/70 hover:bg-bg-900/70",
                  ].join(" ")}
                >
                  {formatConditionLabel(condition)} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <div className="font-semibold">{listMeta.title}</div>
              <div className="w-full max-w-md">
                <Input
                  placeholder={`Search ${listMeta.title.toLowerCase()} by title, barcode, class, or condition...`}
                  value={listSearchQuery}
                  onChange={(e) => setListSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="text-sm text-white/50">{listMeta.countLabel}</div>
          </div>
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-paper/5 p-4 text-sm text-white/60">
            Loading live inventory...
          </div>
        ) : null}
        {!loading && !displayedItems.length ? (
          <div
            className={[
              "rounded-xl border p-4 text-sm",
              viewMode === "remaining" || viewMode === "units_remaining"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                : "border-white/10 bg-paper/5 text-white/60",
            ].join(" ")}
          >
            {listMeta.emptyMessage}
          </div>
        ) : null}
        {!loading &&
        Boolean(query.trim()) &&
        !suggestionItems.length &&
        !singleSearchMatch &&
        !exactSingleMatch ? (
          <div className="rounded-xl border border-white/10 bg-paper/5 p-4 text-sm text-white/60">
            No single match found for the current search.
          </div>
        ) : null}
        {displayedItems.slice(0, 48).map((item) => (
          <RefresherItemCard
            key={`${viewMode}-${item.variant_id}`}
            item={item}
            seenQty={getSeenQty(item.variant_id, item.qty)}
            unseenQty={getUnseenQty(item.variant_id, item.qty)}
            onMarkSeen={markSeen}
            onMarkUnseen={markUnseen}
            onReduceQty={reduceQty}
            onSetSoldOut={setSoldOut}
            onHideProduct={hideProduct}
            onStartEdit={startEditingItem}
            onCancelEdit={cancelEditingItem}
            onEditDraftChange={updateEditDraft}
            onSaveEdit={saveEditingItem}
            isEditing={editingVariantId === item.variant_id}
            editDraft={editingVariantId === item.variant_id ? editDraft : null}
            busyKey={busyKey}
          />
        ))}
        </div>

        <aside className="h-fit rounded-xl border border-white/10 bg-paper/5 p-3 xl:sticky xl:top-24">
            <button
              type="button"
              onClick={() => setListConditionsCollapsed((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div>
                <div className="text-sm font-medium">Condition filter</div>
                <div className="text-xs text-white/45">
                  {selectedListConditions.length > 0
                    ? `${selectedListConditions.length} selected`
                    : "All conditions"}
                </div>
              </div>
              <div className="text-xs text-white/55">
                {listConditionsCollapsed ? "Expand" : "Collapse"}
              </div>
            </button>
            {!listConditionsCollapsed ? (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setSelectedListConditions([])}
                  className={[
                    "w-full rounded-lg border px-3 py-2 text-left text-xs transition",
                    selectedListConditions.length === 0
                      ? "border-accent-500 bg-accent-500/20 text-white"
                      : "border-white/10 bg-bg-900/40 text-white/70 hover:bg-bg-900/70",
                  ].join(" ")}
                >
                  All conditions
                </button>
                {listConditionCounts.map(({ condition, count }) => (
                  <button
                    key={`list-${viewMode}-${condition}`}
                    type="button"
                    onClick={() => toggleListCondition(condition)}
                    className={[
                      "w-full rounded-lg border px-3 py-2 text-left text-xs transition",
                      selectedListConditions.includes(condition)
                        ? "border-accent-500 bg-accent-500/20 text-white"
                        : "border-white/10 bg-bg-900/40 text-white/70 hover:bg-bg-900/70",
                    ].join(" ")}
                  >
                    {formatConditionLabel(condition)} ({count})
                  </button>
                ))}
              </div>
            ) : null}
          </aside>
      </div>

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(value) => {
          processScannedValue(value);
          setScannerOpen(false);
        }}
      />
    </div>
  );
}

