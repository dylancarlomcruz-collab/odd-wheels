"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Download, MessageCircle } from "lucide-react";
import { useCart, type CartLine } from "@/hooks/useCart";
import ProductCard, { type ShopProduct } from "@/components/ProductCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { ModalShell } from "@/components/ui/ModalShell";
import { formatPHP } from "@/lib/money";
import { useBuyerProducts } from "@/hooks/useBuyerProducts";
import { useBuyerShopProducts } from "@/hooks/useBuyerShopProducts";
import { recommendSimilar } from "@/lib/recommendations";
import {
  formatConditionLabel,
  isIssueCondition,
  isNearMintCondition,
} from "@/lib/conditions";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "@/components/ui/toast";
import { resolveEffectivePrice } from "@/lib/pricing";
import { formatTitle } from "@/lib/text";
import { applyImageFallback, buildSrcSet, getOptimizedImageUrl } from "@/lib/imageUrl";
import {
  fetchSalesCustomerSuggestions,
  type SalesCustomerSuggestion,
} from "@/lib/salesCustomers";
import {
  PROTECTOR_ADDON_FEE,
  isProtectorEligibleShipClass,
  protectorKindFromShipClass,
  protectorUnitFee,
} from "@/lib/addons";
import {
  JNT_CAPACITY,
  LBC_CAPACITY,
  REGION_LABEL,
  REGION_BRANCH_CITY_OPTIONS,
  type JntPouch,
  type LbcPackage,
  type Region,
} from "@/lib/shipping/config";
import {
  fitsCapacity,
  jntFee,
  lbcFee,
  recommendLbcPackage,
  shipCountsFromLines,
} from "@/lib/shipping/logic";
import { sanitizePhone } from "@/lib/phone";
import { supabase } from "@/lib/supabase/browser";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/components/auth/AuthProvider";
import { normalizeShippingDefaults } from "@/lib/shippingDefaults";
import { saveGuestOrderAccess } from "@/lib/guestOrderAccess";
import {
  resolveShopControls,
  SHOP_ADD_TO_CART_DISABLED_MESSAGE,
  SHOP_CHECKOUT_DISABLED_MESSAGE,
} from "@/lib/shopControls";
import { createOrderFromCart } from "@/lib/orders";

function normalizeValue(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized.length ? normalized : null;
}

function normalizeList(values?: Array<string | null | undefined> | null) {
  return (values ?? [])
    .map((value) => normalizeValue(value))
    .filter((value): value is string => Boolean(value));
}

function normalizeShipClasses(values: Array<string | null | undefined>) {
  return values.map((value) => normalizeValue(value) ?? "MINI_GT");
}

function formatCourierLabel(value: string) {
  switch (value) {
    case "JNT":
      return "J&T";
    case "INTERNATIONAL":
      return "International";
    case "LALAMOVE":
      return "Lalamove";
    default:
      return value;
  }
}

function parseNumberInput(value: string) {
  const cleaned = String(value ?? "").replace(/[^0-9.]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function formatEditableMoneyInput(value: number) {
  const rounded = roundMoney(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function normalizeSettingList(
  values?: Array<string | null | undefined> | string | null,
) {
  if (Array.isArray(values)) return values;
  if (typeof values === "string") {
    const trimmed = values.replace(/[{}]/g, "").trim();
    if (!trimmed) return [];
    return trimmed.split(",").map((value) => value.trim());
  }
  return [];
}

function normalizeSettingListUpper(
  values?: Array<string | null | undefined> | string | null,
) {
  return normalizeSettingList(values)
    .map((value) => String(value ?? "").trim().toUpperCase())
    .filter(Boolean);
}

function intersectLists<T>(lists: T[][]) {
  if (!lists.length) return [];
  return lists.reduce((acc, list) => acc.filter((value) => list.includes(value)));
}

type AdminShippingMethod = "LBC" | "JNT" | "LALAMOVE" | "PICKUP";
type AdminSelectableLbcPackage = LbcPackage | "MEDIUM_APPROVAL";
const ADMIN_SHIPPING_METHODS: AdminShippingMethod[] = [
  "LBC",
  "JNT",
  "LALAMOVE",
  "PICKUP",
];
const FACEBOOK_CHECKOUT_URL =
  "https://www.facebook.com/messages/t/108966858477162";
const FACEBOOK_CHECKOUT_STORAGE_KEY = "oddwheels:facebook-checkout";
const FACEBOOK_LBC_BRANCH_CITY_DATALIST_ID =
  "facebook-lbc-branch-city-options";
const PICKUP_DAYS = [
  { key: "MON", label: "Monday" },
  { key: "TUE", label: "Tuesday" },
  { key: "WED", label: "Wednesday" },
  { key: "THU", label: "Thursday" },
  { key: "FRI", label: "Friday" },
  { key: "SAT", label: "Saturday" },
  { key: "SUN", label: "Sunday" },
] as const;
const PICKUP_LOCATION = "RSquare Mall, Vito Cruz-Taft, Malate, Manila";
const PICKUP_DIRECTORY =
  "Along Taft Ave near LRT-1 Vito Cruz (P. Ocampo) Station / DLSU area";

type AdminShippingMeta =
  | {
      ok: true;
      shippingFee: number;
      packagingCode: JntPouch | AdminSelectableLbcPackage | null;
      packagingLabel: string | null;
      note?: string;
      warning?: string;
    }
  | {
      ok: false;
      shippingFee: number;
      packagingCode: null;
      packagingLabel: null;
      error: string;
    };

function normalizeAdminShippingMethod(
  value: string | null | undefined,
): AdminShippingMethod {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    normalized === "J&T" ||
    normalized === "J&T EXPRESS" ||
    normalized === "J&TEXPRESS" ||
    normalized === "JT"
  ) {
    return "JNT";
  }
  if (
    normalized === "LBC" ||
    normalized === "JNT" ||
    normalized === "LALAMOVE" ||
    normalized === "PICKUP"
  ) {
    return normalized;
  }
  return "LBC";
}

function normalizeAdminRegion(value: string | null | undefined): Region {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    normalized === "METRO_MANILA" ||
    normalized === "LUZON" ||
    normalized === "VISAYAS" ||
    normalized === "MINDANAO"
  ) {
    return normalized;
  }
  return "METRO_MANILA";
}

function normalizeAdminJntPouch(value: string | null | undefined): JntPouch {
  return String(value ?? "").trim().toUpperCase() === "MEDIUM" ? "MEDIUM" : "SMALL";
}

function normalizeAdminLbcPackage(
  value: string | null | undefined,
): AdminSelectableLbcPackage {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (
    normalized === "N_SAKTO" ||
    normalized === "MINIBOX" ||
    normalized === "SMALL_BOX" ||
    normalized === "MEDIUM_APPROVAL"
  ) {
    return normalized;
  }
  return "N_SAKTO";
}

function formatAdminRegionLabel(region: Region) {
  return region === "METRO_MANILA" ? "NCR" : REGION_LABEL[region];
}

function formatJntPouchLabel(pouch: JntPouch) {
  return pouch === "MEDIUM" ? "J&T Medium pouch" : "J&T Small pouch";
}

function formatLbcPackageLabel(pack: AdminSelectableLbcPackage) {
  switch (pack) {
    case "N_SAKTO":
      return "LBC N-Sakto pouch";
    case "MINIBOX":
      return "LBC Mini box";
    case "SMALL_BOX":
      return "LBC Small box";
    case "MEDIUM_APPROVAL":
      return "LBC Medium box (approval required)";
    default:
      return pack;
  }
}

function recommendAllowedJntPouch(
  counts: ReturnType<typeof shipCountsFromLines>,
  allowed: JntPouch[],
): { ok: true; pouch: JntPouch } | { ok: false; reason: string } {
  const ordered: JntPouch[] = ["SMALL", "MEDIUM"];
  const candidates = allowed.length
    ? ordered.filter((pouch) => allowed.includes(pouch))
    : ordered;
  for (const pouch of candidates) {
    if (fitsCapacity(counts, JNT_CAPACITY[pouch])) {
      return { ok: true, pouch };
    }
  }
  if (allowed.length) {
    return {
      ok: false,
      reason: "J&T pouch restrictions do not fit this cart.",
    };
  }
  return { ok: false, reason: "Cart is too large for J&T." };
}

type CartInvoiceItem = {
  name: string;
  qty: number;
  amount: number;
  condition: string | null;
  notes: string | null;
  imageUrl: string | null;
};

type CartInvoicePayload = {
  customerName: string;
  shippingMethod: string;
  shippingDetails: string;
  shippingRegion: string | null;
  packagingLabel: string | null;
  items: CartInvoiceItem[];
  totalQty: number;
  totalLines: number;
  subtotalAmount: number;
  shippingFeeAmount: number;
  discountAmount: number;
  manualAdjustmentAmount: number;
  suggestedTotalAmount: number;
  totalAmount: number;
};

type FacebookCheckoutFormState = {
  customerName: string;
  contactNumber: string;
  shippingMethod: AdminShippingMethod;
  shippingRegion: Region;
  lbcBranchName: string;
  lbcBranchCity: string;
  lbcPackage: AdminSelectableLbcPackage;
  jntPouch: JntPouch;
  jntHouseStreetUnit: string;
  jntBarangay: string;
  jntCity: string;
  jntProvince: string;
  jntPostalCode: string;
  lalamoveAddress: string;
  pickupDay: string;
  pickupSlot: string;
  notes: string;
};

type FacebookCheckoutSnapshotPayload = {
  customerName: string;
  contactNumber: string;
  shippingMethodLabel: string;
  shippingLines: string[];
  notes: string;
  items: CartInvoiceItem[];
  totalQty: number;
  totalLines: number;
  subtotalAmount: number;
  generatedAt: Date;
};

type FacebookSnapshotResult = {
  blob: Blob;
  fileName: string;
};

type InvoicePdfRenderOptions = {
  includeImages: boolean;
  imageQuality: number;
  maxImageDimension: number;
  photoSize: number;
};

const MAX_PDF_DOWNLOAD_BYTES = 24 * 1024 * 1024;
const CART_INVOICE_RENDER_STAGES: InvoicePdfRenderOptions[] = [
  { includeImages: true, imageQuality: 0.68, maxImageDimension: 900, photoSize: 88 },
  { includeImages: true, imageQuality: 0.55, maxImageDimension: 720, photoSize: 82 },
  { includeImages: true, imageQuality: 0.42, maxImageDimension: 560, photoSize: 76 },
  { includeImages: true, imageQuality: 0.32, maxImageDimension: 420, photoSize: 70 },
  { includeImages: false, imageQuality: 0.28, maxImageDimension: 360, photoSize: 64 },
];

function sanitizeFileName(value: string) {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").trim();
  return cleaned || "customer";
}

function getFacebookSnapshotFileName(customerName: string) {
  const fileDate = new Date().toISOString().slice(0, 10);
  return `facebook-checkout-${sanitizeFileName(customerName)}-${fileDate}.png`;
}

function pdfMoney(value: number) {
  const rounded = Number.isFinite(value) ? Math.round(value) : 0;
  try {
    return `PHP ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(rounded)}`;
  } catch {
    return `PHP ${rounded}`;
  }
}

function formatPdfSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function downloadBlobAsFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function getDefaultFacebookCheckoutForm(): FacebookCheckoutFormState {
  return {
    customerName: "",
    contactNumber: "",
    shippingMethod: "LBC",
    shippingRegion: "METRO_MANILA",
    lbcBranchName: "",
    lbcBranchCity: "",
    lbcPackage: "N_SAKTO",
    jntPouch: "SMALL",
    jntHouseStreetUnit: "",
    jntBarangay: "",
    jntCity: "",
    jntProvince: "",
    jntPostalCode: "",
    lalamoveAddress: "",
    pickupDay: "",
    pickupSlot: "",
    notes: "",
  };
}

function formatPickupDayLabel(value: string) {
  return PICKUP_DAYS.find((day) => day.key === value)?.label ?? value;
}

function formatFacebookCheckoutMethodLabel(value: AdminShippingMethod) {
  if (value === "JNT") return "J&T";
  if (value === "PICKUP") return "Store pickup";
  return formatCourierLabel(value);
}

function hasAtLeastTwoWords(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length >= 2;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines.length ? lines : [normalized];
}

async function buildFacebookCheckoutSnapshotBlob(
  payload: FacebookCheckoutSnapshotPayload
) {
  const width = 1080;
  const padding = 56;
  const cardGap = 24;
  const infoLineHeight = 34;
  const itemImageSize = 96;
  const itemNameWidth = 420;
  const itemRowBaseHeight = 48;
  const itemImageGap = 20;
  const imageCache = new Map<string, HTMLImageElement | null>();

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) {
    throw new Error("Snapshot renderer is unavailable in this browser.");
  }

  measureCtx.font = "700 30px Arial";
  const itemRows = await Promise.all(
    payload.items.map(async (item) => {
      const lines = wrapCanvasText(measureCtx, item.name, itemNameWidth);
      const note = item.notes?.trim() ? `Notes: ${item.notes.trim()}` : "";
      measureCtx.font = "400 20px Arial";
      const noteLines = note ? wrapCanvasText(measureCtx, note, itemNameWidth) : [];
      const rowHeight = Math.max(
        itemRowBaseHeight + lines.length * 32 + noteLines.length * 24,
        124
      );

      let image: HTMLImageElement | null = null;
      if (item.imageUrl) {
        if (imageCache.has(item.imageUrl)) {
          image = imageCache.get(item.imageUrl) ?? null;
        } else {
          try {
            const response = await fetch(item.imageUrl);
            if (response.ok) {
              const dataUrl = await blobToDataUrl(await response.blob());
              image = await new Promise<HTMLImageElement>((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = () => reject(new Error("Failed to load item image."));
                el.src = dataUrl;
              });
            }
          } catch {
            image = null;
          }
          imageCache.set(item.imageUrl, image);
        }
      }

      return {
        ...item,
        image,
        titleLines: lines,
        noteLines,
        rowHeight,
      };
    })
  );

  const recipientLine = payload.shippingLines.find((line) =>
    line.startsWith("Recipient:")
  );
  const recipientName = recipientLine
    ? recipientLine.slice("Recipient:".length).trim()
    : "";
  const sameRecipient =
    recipientName.length > 0 &&
    recipientName.localeCompare(payload.customerName.trim(), undefined, {
      sensitivity: "accent",
    }) === 0;

  const infoRows: string[] = [
    sameRecipient
      ? `Customer / Recipient: ${payload.customerName}`
      : `Customer: ${payload.customerName}`,
    `Contact: ${payload.contactNumber}`,
    `Shipping: ${payload.shippingMethodLabel}`,
  ];
  infoRows.push(
    ...payload.shippingLines.filter(
      (line) => !(sameRecipient && line.startsWith("Recipient:"))
    )
  );
  if (payload.notes.trim()) {
    infoRows.push(`Notes: ${payload.notes.trim()}`);
  }

  measureCtx.font = "500 24px Arial";
  const wrappedInfoRows = infoRows.flatMap((row) =>
    wrapCanvasText(measureCtx, row, width - padding * 2 - 48)
  );

  const headerHeight = 178;
  const infoHeight = 56 + wrappedInfoRows.length * infoLineHeight;
  const itemsHeight =
    78 + itemRows.reduce((sum, item) => sum + item.rowHeight + 14, 0);
  const summaryHeight = 172;
  const footerHeight = 72;
  const height =
    padding +
    headerHeight +
    cardGap +
    infoHeight +
    cardGap +
    itemsHeight +
    cardGap +
    summaryHeight +
    footerHeight +
    padding;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Snapshot renderer is unavailable in this browser.");
  }

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#09090b");
  gradient.addColorStop(0.55, "#111116");
  gradient.addColorStop(1, "#1d1108");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(229, 120, 51, 0.16)";
  ctx.beginPath();
  ctx.arc(width - 120, 110, 170, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(110, height - 120, 150, 0, Math.PI * 2);
  ctx.fill();

  const cardX = padding;
  const cardWidth = width - padding * 2;
  let cursorY = padding;

  ctx.fillStyle = "rgba(11, 11, 14, 0.86)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cardX, cursorY, cardWidth, headerHeight, 30);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f0c49a";
  ctx.font = "700 22px Arial";
  ctx.fillText("ODD WHEELS", cardX + 36, cursorY + 42);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 48px Arial";
  ctx.fillText("Facebook Checkout", cardX + 36, cursorY + 98);
  ctx.fillStyle = "rgba(255,255,255,0.68)";
  ctx.font = "400 24px Arial";
  ctx.fillText(
    "Download this image and send it in Messenger with your order inquiry.",
    cardX + 36,
    cursorY + 136
  );
  ctx.textAlign = "right";
  ctx.fillStyle = "#f0c49a";
  ctx.font = "600 22px Arial";
  ctx.fillText(
    payload.generatedAt.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    cardX + cardWidth - 36,
    cursorY + 42
  );
  ctx.textAlign = "left";
  cursorY += headerHeight + cardGap;

  ctx.fillStyle = "rgba(11, 11, 14, 0.9)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.beginPath();
  ctx.roundRect(cardX, cursorY, cardWidth, infoHeight, 26);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f0c49a";
  ctx.font = "700 24px Arial";
  ctx.fillText("Shipping details", cardX + 28, cursorY + 40);
  ctx.fillStyle = "#ffffff";
  ctx.font = "500 24px Arial";
  let infoY = cursorY + 84;
  for (const row of wrappedInfoRows) {
    ctx.fillText(row, cardX + 28, infoY);
    infoY += infoLineHeight;
  }
  cursorY += infoHeight + cardGap;

  ctx.fillStyle = "rgba(11, 11, 14, 0.9)";
  ctx.beginPath();
  ctx.roundRect(cardX, cursorY, cardWidth, itemsHeight, 26);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f0c49a";
  ctx.font = "700 24px Arial";
  ctx.fillText("Selected items", cardX + 28, cursorY + 40);

  const colItemX = cardX + 28;
  const colQtyX = cardX + 760;
  const colAmountX = cardX + cardWidth - 30;
  let rowY = cursorY + 74;

  for (const item of itemRows) {
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.beginPath();
    ctx.roundRect(colItemX, rowY, cardWidth - 56, item.rowHeight, 18);
    ctx.fill();

    const imageX = colItemX + 14;
    const imageY = rowY + Math.max(14, (item.rowHeight - itemImageSize) / 2);
    if (item.image) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(imageX, imageY, itemImageSize, itemImageSize, 14);
      ctx.clip();
      ctx.drawImage(item.image, imageX, imageY, itemImageSize, itemImageSize);
      ctx.restore();
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 30px Arial";
    const textX = imageX + itemImageSize + itemImageGap;
    let textY = rowY + 38;
    for (const line of item.titleLines) {
      ctx.fillText(line, textX, textY);
      textY += 32;
    }

    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.font = "500 20px Arial";
    const meta = [item.condition, item.noteLines.length ? null : item.notes]
      .filter(Boolean)
      .join("  •  ");
    if (meta) {
      ctx.fillText(meta, textX, textY + 4);
      textY += 28;
    }
    if (item.noteLines.length) {
      for (const noteLine of item.noteLines) {
        ctx.fillText(noteLine, textX, textY + 4);
        textY += 24;
      }
    }

    ctx.fillStyle = "#f0c49a";
    ctx.font = "700 28px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(item.qty), colQtyX, rowY + item.rowHeight / 2 + 10);
    ctx.textAlign = "right";
    ctx.fillText(formatPHP(item.amount), colAmountX, rowY + item.rowHeight / 2 + 10);
    ctx.textAlign = "left";

    rowY += item.rowHeight + 14;
  }
  cursorY += itemsHeight + cardGap;

  ctx.fillStyle = "rgba(30, 18, 9, 0.95)";
  ctx.beginPath();
  ctx.roundRect(cardX, cursorY, cardWidth, summaryHeight, 26);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f0c49a";
  ctx.font = "700 24px Arial";
  ctx.fillText("Summary", cardX + 28, cursorY + 40);

  ctx.fillStyle = "#ffffff";
  ctx.font = "500 24px Arial";
  ctx.fillText(`Items selected: ${payload.totalLines}`, cardX + 28, cursorY + 82);
  ctx.fillText(`Total quantity: ${payload.totalQty}`, cardX + 28, cursorY + 118);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText("Selected subtotal", cardX + cardWidth - 30, cursorY + 76);
  ctx.fillStyle = "#f0c49a";
  ctx.font = "700 42px Arial";
  ctx.fillText(
    formatPHP(payload.subtotalAmount),
    cardX + cardWidth - 30,
    cursorY + 128
  );
  ctx.textAlign = "left";

  ctx.fillStyle = "rgba(255,255,255,0.56)";
  ctx.font = "500 20px Arial";
  ctx.fillText(
    "Shipping fee will be finalized in Facebook Messenger.",
    cardX + 28,
    cursorY + 154
  );

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "500 18px Arial";
  ctx.fillText(
    "Attach this snapshot when you continue to Facebook checkout.",
    cardX,
    height - padding + 18
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) {
    throw new Error("Failed to create order snapshot image.");
  }
  return blob;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image data."));
    reader.readAsDataURL(blob);
  });
}

async function imageBlobToPdfDataUrl(
  blob: Blob,
  options: InvoicePdfRenderOptions
): Promise<string> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image decode failed"));
      el.src = objectUrl;
    });

    const srcW = Math.max(1, img.naturalWidth || 1);
    const srcH = Math.max(1, img.naturalHeight || 1);
    const targetRatio = 4 / 3;
    let cropW = srcW;
    let cropH = srcH;
    if (srcW / srcH > targetRatio) {
      cropW = srcH * targetRatio;
    } else {
      cropH = srcW / targetRatio;
    }
    const sx = Math.max(0, (srcW - cropW) / 2);
    const sy = Math.max(0, (srcH - cropH) / 2);
    const outW = Math.max(
      220,
      Math.min(options.maxImageDimension, Math.round(options.photoSize * 3))
    );
    const outH = Math.max(165, Math.round(outW * 0.75));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return await blobToDataUrl(blob);
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, outW, outH);
    return canvas.toDataURL("image/jpeg", options.imageQuality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadImageDataUrl(
  url: string,
  cache: Map<string, string | null>,
  options: InvoicePdfRenderOptions
) {
  if (!options.includeImages) return null;
  const cacheKey = `${url}::${options.maxImageDimension}::${options.imageQuality.toFixed(2)}`;
  const existing = cache.get(cacheKey);
  if (existing !== undefined) return existing;

  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("URL is not an image.");
    const dataUrl = await imageBlobToPdfDataUrl(blob, options);
    cache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch {
    cache.set(cacheKey, null);
    return null;
  }
}

function imageFormatForDataUrl(dataUrl: string): "PNG" | "JPEG" {
  return dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
}

function drawInvoiceCustomerHeader(
  doc: any,
  payload: CartInvoicePayload,
  pageWidth: number,
  marginX: number,
  marginTop: number
) {
  const fullWidth = pageWidth - marginX * 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(144, 113, 67);
  doc.text("ODD WHEELS", marginX, marginTop);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(48, 48, 48);
  doc.text("FB Cart Invoice", marginX, marginTop + 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(26, 26, 26);
  const nameLines = doc.splitTextToSize(payload.customerName || "Customer", fullWidth);
  doc.text(nameLines.slice(0, 2), marginX, marginTop + 38);
  const underlineY = marginTop + 48 + Math.max(0, nameLines.length - 1) * 20;
  doc.setDrawColor(225, 214, 190);
  doc.line(marginX, underlineY, pageWidth - marginX, underlineY);
  return underlineY + 8;
}

function drawInvoiceTableHeader(
  doc: any,
  topY: number,
  pageWidth: number,
  marginX: number,
  photoLeft: number,
  nameLeft: number,
  qtyCenter: number,
  amountRight: number
) {
  doc.setFillColor(245, 246, 248);
  doc.roundedRect(marginX, topY, pageWidth - marginX * 2, 20, 6, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(88, 88, 88);
  doc.text("PHOTO", photoLeft, topY + 13);
  doc.text("PRODUCT", nameLeft, topY + 13);
  doc.text("QTY", qtyCenter, topY + 13, { align: "center" });
  doc.text("AMOUNT", amountRight, topY + 13, { align: "right" });
  return topY + 20;
}

function drawInvoiceImageFrame(
  doc: any,
  dataUrl: string | null,
  x: number,
  y: number,
  width: number,
  height: number
) {
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(x, y, width, height, 8, 8, "F");

  if (!dataUrl) return;

  try {
    doc.addImage(
      dataUrl,
      imageFormatForDataUrl(dataUrl),
      x,
      y,
      width,
      height,
      undefined,
      "FAST"
    );
    doc.setDrawColor(225, 225, 225);
    doc.roundedRect(x, y, width, height, 8, 8, "S");
  } catch {
    return;
  }
}

function drawInvoiceTotalsSection(
  doc: any,
  payload: CartInvoicePayload,
  x: number,
  y: number,
  width: number
) {
  doc.setFillColor(252, 250, 246);
  doc.roundedRect(x, y, width, 92, 12, 12, "F");
  doc.setDrawColor(226, 216, 196);
  doc.roundedRect(x, y, width, 92, 12, 12, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(28, 28, 28);
  doc.text("Summary", x + 14, y + 18);

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x + 14, y + 28, 78, 28, 8, 8, "F");
  doc.roundedRect(x + 98, y + 28, 78, 28, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(144, 113, 67);
  doc.text("QTY", x + 24, y + 39);
  doc.text("LINES", x + 108, y + 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(28, 28, 28);
  doc.text(String(payload.totalQty), x + 24, y + 51);
  doc.text(String(payload.totalLines), x + 108, y + 51);

  const rightX = x + width - 14;
  let lineY = y + 30;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(78, 78, 78);
  doc.text("Subtotal", rightX - 118, lineY);
  doc.text(pdfMoney(payload.subtotalAmount), rightX, lineY, { align: "right" });
  lineY += 14;
  if (payload.shippingFeeAmount > 0) {
    doc.text("Shipping fee", rightX - 118, lineY);
    doc.text(pdfMoney(payload.shippingFeeAmount), rightX, lineY, { align: "right" });
    lineY += 14;
  }
  if (payload.discountAmount > 0) {
    doc.text("Discount", rightX - 118, lineY);
    doc.text(`-${pdfMoney(payload.discountAmount)}`, rightX, lineY, { align: "right" });
    lineY += 14;
  }
  if (payload.manualAdjustmentAmount !== 0) {
    doc.text("Manual adjustment", rightX - 118, lineY);
    doc.text(
      `${payload.manualAdjustmentAmount > 0 ? "+" : "-"}${pdfMoney(Math.abs(payload.manualAdjustmentAmount))}`,
      rightX,
      lineY,
      { align: "right" }
    );
    lineY += 14;
  }

  doc.setDrawColor(226, 216, 196);
  doc.line(x + 14, y + 66, x + width - 14, y + 66);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(28, 28, 28);
  doc.text("Total amount", rightX - 118, y + 83);
  doc.setTextColor(144, 113, 67);
  doc.text(pdfMoney(payload.totalAmount), rightX, y + 83, { align: "right" });
}

async function buildAdminCartInvoicePdfBlob(
  payload: CartInvoicePayload,
  imageCache: Map<string, string | null>,
  now: Date,
  options: InvoicePdfRenderOptions
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const marginTop = 14;
  const marginBottom = 16;
  const totalsHeight = 92;

  const photoLeft = marginX + 12;
  const photoWidth = options.photoSize;
  const photoHeight = Math.round(options.photoSize * 0.75);
  const nameLeft = photoLeft + photoWidth + 14;
  const qtyCenter = pageWidth - 112;
  const amountRight = pageWidth - marginX - 14;
  const nameMaxWidth = qtyCenter - 34 - nameLeft;

  let headerBottom = drawInvoiceCustomerHeader(doc, payload, pageWidth, marginX, marginTop);
  let y = drawInvoiceTableHeader(
    doc,
    headerBottom + 6,
    pageWidth,
    marginX,
    photoLeft,
    nameLeft,
    qtyCenter,
    amountRight
  ) + 6;

  if (payload.items.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(70, 70, 70);
    doc.text("No selected cart items.", marginX, y + 18);
    y += 36;
  } else {
    for (const [index, item] of payload.items.entries()) {
      const productName = item.name?.trim() || "Item";
      const titleLines = doc.splitTextToSize(productName, nameMaxWidth);
      const conditionText = item.condition?.trim() ? `Condition: ${item.condition.trim()}` : null;
      const noteText = item.notes?.trim() ? `Notes: ${item.notes.trim()}` : null;
      const conditionLines = conditionText ? doc.splitTextToSize(conditionText, nameMaxWidth) : [];
      const noteLines = noteText ? doc.splitTextToSize(noteText, nameMaxWidth) : [];
      const textHeight =
        titleLines.length * 11 +
        (conditionLines.length ? conditionLines.length * 9 + 5 : 0) +
        (noteLines.length ? noteLines.length * 9 + 5 : 0);
      const rowHeight = Math.max(photoHeight + 12, textHeight + 16);
      const rowBottom = y + rowHeight;
      const isLastItem = index === payload.items.length - 1;
      const requiredBottomSpace = isLastItem ? totalsHeight + 8 : 0;

      if (rowBottom + requiredBottomSpace > pageHeight - marginBottom) {
        doc.addPage();
        headerBottom = marginTop;
        y = drawInvoiceTableHeader(
          doc,
          headerBottom,
          pageWidth,
          marginX,
          photoLeft,
          nameLeft,
          qtyCenter,
          amountRight
        ) + 6;
      }

      const cardX = marginX;
      const cardWidth = pageWidth - marginX * 2;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(cardX, y, cardWidth, rowHeight, 12, 12, "F");
      doc.setDrawColor(232, 232, 232);
      doc.roundedRect(cardX, y, cardWidth, rowHeight, 12, 12, "S");

      const dataUrl =
        options.includeImages && item.imageUrl
          ? await loadImageDataUrl(item.imageUrl, imageCache, options)
          : null;
      drawInvoiceImageFrame(doc, dataUrl, photoLeft, y + 6, photoWidth, photoHeight);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(18, 18, 18);
      doc.text(titleLines, nameLeft, y + 18);

      let textY = y + 18 + titleLines.length * 11;
      if (conditionLines.length) {
        doc.setFillColor(248, 244, 236);
        doc.roundedRect(nameLeft, textY - 8, Math.min(nameMaxWidth, 150), 14, 6, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(144, 113, 67);
        doc.text(conditionLines, nameLeft + 6, textY + 1);
        textY += conditionLines.length * 9 + 3;
      }
      if (noteLines.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(92, 92, 92);
        doc.text(noteLines, nameLeft, textY);
      }

      doc.setFillColor(250, 250, 250);
      doc.roundedRect(qtyCenter - 20, y + rowHeight / 2 - 12, 40, 24, 8, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(24, 24, 24);
      doc.text(String(item.qty), qtyCenter, y + rowHeight / 2 + 3, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(24, 24, 24);
      doc.text(pdfMoney(item.amount), amountRight, y + rowHeight / 2 + 3, {
        align: "right",
      });

      y += rowHeight + 6;
    }
  }

  if (y + totalsHeight > pageHeight - marginBottom) {
    doc.addPage();
    y = marginTop;
  }
  drawInvoiceTotalsSection(doc, payload, marginX, y, pageWidth - marginX * 2);

  return doc.output("blob") as Blob;
}

async function exportAdminCartInvoicePdf(
  payload: CartInvoicePayload,
  imageCache: Map<string, string | null>
) {
  const now = new Date();
  const fileDate = now.toISOString().slice(0, 10);
  const fileName = `invoice-${sanitizeFileName(payload.customerName)}-${fileDate}.pdf`;

  let lastBlob: Blob | null = null;
  for (const stage of CART_INVOICE_RENDER_STAGES) {
    const blob = await buildAdminCartInvoicePdfBlob(payload, imageCache, now, stage);
    lastBlob = blob;
    if (blob.size <= MAX_PDF_DOWNLOAD_BYTES) {
      downloadBlobAsFile(blob, fileName);
      return;
    }
  }

  const finalSize = lastBlob ? formatPdfSize(lastBlob.size) : "unknown size";
  throw new Error(
    `Invoice PDF exceeds 24MB (${finalSize}) even after compression. Please reduce cart items/images and try again.`
  );
}

function resolveOrderId(data: any): string | null {
  if (!data) return null;
  if (typeof data === "string" || typeof data === "number") return String(data);
  if (typeof data === "object") {
    return (
      data.order_id ??
      data.orderId ??
      data.id ??
      data.order?.id ??
      data.data?.id ??
      null
    );
  }
  return null;
}

function resolveGuestOrderAccessToken(data: any): string | null {
  if (!data || typeof data !== "object") return null;
  const token = String(
    data.guest_access_token ?? data.order?.guest_access_token ?? ""
  ).trim();
  return token || null;
}

function CartContent() {
  const { lines, loading, updateQty, updateProtector, remove, add, reload, isLoggedIn } =
    useCart();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const isAdminUser = profile?.role === "admin";
  const isAdminMode = isAdminUser;
  const { settings } = useSettings();
  const profileShippingDefaults = React.useMemo(
    () => normalizeShippingDefaults(profile?.shipping_defaults ?? null),
    [profile?.shipping_defaults]
  );
  const shopControls = React.useMemo(
    () => resolveShopControls(settings),
    [settings]
  );
  const selectAllRef = React.useRef<HTMLInputElement>(null);
  const invoiceImageCacheRef = React.useRef(new Map<string, string | null>());

  const { products: allProducts } = useBuyerProducts({ brand: "all" });
  const { products: shopProducts } = useBuyerShopProducts({ brand: "all" });

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [previewLine, setPreviewLine] = React.useState<CartLine | null>(null);
  const [activeImage, setActiveImage] = React.useState("");
  const [unsealedAck, setUnsealedAck] = React.useState(false);
  const [fbCustomerName, setFbCustomerName] = React.useState("");
  const [fbCustomerSuggestions, setFbCustomerSuggestions] = React.useState<
    SalesCustomerSuggestion[]
  >([]);
  const [fbShippingMethod, setFbShippingMethod] =
    React.useState<AdminShippingMethod>("LBC");
  const [fbShippingRegion, setFbShippingRegion] =
    React.useState<Region>("METRO_MANILA");
  const [fbLbcPackage, setFbLbcPackage] =
    React.useState<AdminSelectableLbcPackage>("N_SAKTO");
  const [fbJntPouch, setFbJntPouch] = React.useState<JntPouch>("SMALL");
  const [fbShippingDetails, setFbShippingDetails] = React.useState("");
  const [fbDiscountType, setFbDiscountType] = React.useState<"AMOUNT" | "PERCENT">(
    "AMOUNT"
  );
  const [fbDiscountValue, setFbDiscountValue] = React.useState("");
  const [adminFinalPriceInput, setAdminFinalPriceInput] = React.useState("");
  const [adminFinalPriceTouched, setAdminFinalPriceTouched] = React.useState(false);
  const [sellingAsPos, setSellingAsPos] = React.useState(false);
  const [generatingInvoice, setGeneratingInvoice] = React.useState(false);
  const [clearingCart, setClearingCart] = React.useState(false);
  const [facebookCheckoutOpen, setFacebookCheckoutOpen] = React.useState(false);
  const [facebookCheckoutForm, setFacebookCheckoutForm] =
    React.useState<FacebookCheckoutFormState>(() =>
      getDefaultFacebookCheckoutForm()
    );
  const [downloadingFacebookSnapshot, setDownloadingFacebookSnapshot] =
    React.useState(false);
  const [facebookSnapshotPreviewUrl, setFacebookSnapshotPreviewUrl] =
    React.useState<string | null>(null);
  const [facebookSnapshotFileName, setFacebookSnapshotFileName] =
    React.useState<string | null>(null);
  const facebookSnapshotGenerationRef = React.useRef(0);
  const [creatingFacebookOrder, setCreatingFacebookOrder] = React.useState(false);
  const [openingFacebookMessenger, setOpeningFacebookMessenger] =
    React.useState(false);
  const adminCustomerSuggestionListId = "admin-cart-customer-suggestions";
  const pickupSchedule = React.useMemo(() => {
    const schedule: Record<string, string[]> = {};
    const raw = (settings?.pickup_schedule ?? null) as Record<
      string,
      unknown
    > | null;

    if (raw && typeof raw === "object") {
      for (const day of PICKUP_DAYS) {
        const slotsRaw = raw[day.key];
        if (!Array.isArray(slotsRaw)) continue;
        const cleaned = slotsRaw
          .map((slot) => String(slot ?? "").trim())
          .filter(Boolean);
        if (cleaned.length) {
          schedule[day.key] = cleaned;
        }
      }
    }

    if (!Object.keys(schedule).length) {
      const fallback = String(settings?.pickup_schedule_text ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (fallback.length) {
        for (const day of PICKUP_DAYS) {
          schedule[day.key] = fallback.slice();
        }
      }
    }

    return schedule;
  }, [settings?.pickup_schedule, settings?.pickup_schedule_text]);
  const clearFacebookSnapshot = React.useCallback(() => {
    setFacebookSnapshotPreviewUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      return null;
    });
    setFacebookSnapshotFileName(null);
  }, []);
  React.useEffect(() => {
    return () => {
      clearFacebookSnapshot();
    };
  }, [clearFacebookSnapshot]);
  const pickupDayOptions = React.useMemo(
    () =>
      PICKUP_DAYS.filter((day) => (pickupSchedule[day.key] ?? []).length > 0),
    [pickupSchedule]
  );
  const pickupSlotsForDay = React.useMemo(
    () =>
      facebookCheckoutForm.pickupDay
        ? (pickupSchedule[facebookCheckoutForm.pickupDay] ?? [])
        : [],
    [facebookCheckoutForm.pickupDay, pickupSchedule]
  );
  const pickupUnavailable = Boolean(settings?.pickup_unavailable);
  const facebookLbcBranchCitySuggestions = React.useMemo(() => {
    const values = REGION_BRANCH_CITY_OPTIONS[facebookCheckoutForm.shippingRegion] ?? [];
    return values.map((value) => String(value).trim()).filter(Boolean);
  }, [facebookCheckoutForm.shippingRegion]);

  const selectedLines = React.useMemo(
    () => lines.filter((line) => selectedIds.includes(line.id)),
    [lines, selectedIds],
  );
  const protectorFallbackStock = React.useMemo(
    () => Math.max(0, Number(settings?.protector_stock ?? 0)),
    [settings?.protector_stock]
  );
  const protectorStockByKind = React.useMemo(() => {
    const mainlineRaw = Number(settings?.protector_stock_mainline ?? NaN);
    const premiumRaw = Number(settings?.protector_stock_premium ?? NaN);
    const mainlineValue = Number.isFinite(mainlineRaw)
      ? Math.max(0, Math.trunc(mainlineRaw))
      : 0;
    const premiumValue = Number.isFinite(premiumRaw)
      ? Math.max(0, Math.trunc(premiumRaw))
      : 0;
    const useFallback =
      protectorFallbackStock > 0 && mainlineValue === 0 && premiumValue === 0;
    return {
      MAINLINE: useFallback ? protectorFallbackStock : mainlineValue,
      PREMIUM: useFallback ? protectorFallbackStock : premiumValue,
    };
  }, [
    settings?.protector_stock_mainline,
    settings?.protector_stock_premium,
    protectorFallbackStock,
  ]);
  const selectedProtectorCounts = React.useMemo(
    () =>
      lines.reduce(
        (sum, line) => {
          const kind = protectorKindFromShipClass(line.variant.ship_class);
          if (!kind || !line.protector_selected) return sum;
          sum[kind] += line.qty;
          return sum;
        },
        { MAINLINE: 0, PREMIUM: 0 }
      ),
    [lines],
  );
  const protectorRemainingByKind = React.useMemo(
    () => ({
      MAINLINE: Math.max(
        0,
        protectorStockByKind.MAINLINE - selectedProtectorCounts.MAINLINE
      ),
      PREMIUM: Math.max(
        0,
        protectorStockByKind.PREMIUM - selectedProtectorCounts.PREMIUM
      ),
    }),
    [protectorStockByKind, selectedProtectorCounts]
  );
  const hasNonSealedInCart = React.useMemo(() => {
    const isSealed = (value: string | null | undefined) => {
      const normalized = String(value ?? "").toLowerCase().trim();
      return (
        normalized === "sealed" ||
        normalized === "sealed_blister" ||
        normalized === "sealed_near_mint_box" ||
        normalized === "sealed_near_mint_blister" ||
        normalized === "sealed_not_mint_box" ||
        normalized === "sealed_not_mint_blister"
      );
    };
    return lines.some((line) => !isSealed(line.variant.condition));
  }, [lines]);
  const hasNonSealedSelected = React.useMemo(() => {
    const isSealed = (value: string | null | undefined) => {
      const normalized = String(value ?? "").toLowerCase().trim();
      return (
        normalized === "sealed" ||
        normalized === "sealed_blister" ||
        normalized === "sealed_near_mint_box" ||
        normalized === "sealed_near_mint_blister" ||
        normalized === "sealed_not_mint_box" ||
        normalized === "sealed_not_mint_blister"
      );
    };
    return selectedLines.some((line) => !isSealed(line.variant.condition));
  }, [selectedLines]);
  const lineUnitPrice = React.useCallback(
    (line: CartLine) =>
      resolveEffectivePrice({
        price: Number(line.variant.price),
        sale_price: line.variant.sale_price ?? null,
        discount_percent: line.variant.discount_percent ?? null,
      }).effectivePrice,
    []
  );
  const selectedSubtotal = roundMoney(
    selectedLines.reduce((acc, l) => {
      const addOn = protectorUnitFee(
        l.variant.ship_class,
        Boolean(l.protector_selected)
      );
      return acc + (lineUnitPrice(l) + addOn) * l.qty;
    }, 0)
  );
  const adminShipCounts = React.useMemo(
    () =>
      shipCountsFromLines(
        selectedLines.map((line) => ({
          ship_class: (normalizeValue(line.variant.ship_class) as any) ?? null,
          qty: Math.max(1, Number(line.qty ?? 0)),
        }))
      ),
    [selectedLines]
  );
  const adminHasLalamoveOnly = adminShipCounts.LALAMOVE > 0;
  const adminAllowedCourierValues = React.useMemo(() => {
    const raw = normalizeSettingListUpper(settings?.allowed_couriers ?? null);
    const unique = Array.from(new Set(raw));
    return unique.filter(
      (value): value is AdminShippingMethod =>
        value === "LBC" ||
        value === "JNT" ||
        value === "LALAMOVE" ||
        value === "PICKUP"
    );
  }, [settings?.allowed_couriers]);
  const adminItemCourierValues = React.useMemo(() => {
    const lists = selectedLines
      .map((line) => normalizeSettingListUpper(line.variant.allowed_couriers ?? null))
      .filter((list) => list.length > 0);
    if (!lists.length) return [];
    const intersection = intersectLists(lists);
    return intersection.filter(
      (value): value is AdminShippingMethod =>
        value === "LBC" ||
        value === "JNT" ||
        value === "LALAMOVE" ||
        value === "PICKUP"
    );
  }, [selectedLines]);
  const adminCourierRestricted = adminAllowedCourierValues.length > 0;
  const adminItemCourierRestricted = adminItemCourierValues.length > 0;
  const adminAllowedCourierSet = React.useMemo(
    () => new Set(adminAllowedCourierValues),
    [adminAllowedCourierValues]
  );
  const adminItemCourierSet = React.useMemo(
    () => new Set(adminItemCourierValues),
    [adminItemCourierValues]
  );
  const adminAvailableShippingMethods = React.useMemo(() => {
    let base = [...ADMIN_SHIPPING_METHODS];
    if (adminCourierRestricted) {
      base = base.filter((method) => adminAllowedCourierSet.has(method));
    }
    if (adminItemCourierRestricted) {
      base = base.filter((method) => adminItemCourierSet.has(method));
    }
    const restrictionsActive = adminCourierRestricted || adminItemCourierRestricted;
    if (!base.length && restrictionsActive) return [];
    const normalized = base.length ? base : [...ADMIN_SHIPPING_METHODS];
    if (adminHasLalamoveOnly) {
      return normalized.includes("LALAMOVE")
        ? (["LALAMOVE"] as AdminShippingMethod[])
        : [];
    }
    return normalized;
  }, [
    adminAllowedCourierSet,
    adminCourierRestricted,
    adminHasLalamoveOnly,
    adminItemCourierRestricted,
    adminItemCourierSet,
  ]);
  const adminAllowedLbcPackages = React.useMemo(() => {
    const raw = normalizeSettingListUpper(settings?.allowed_lbc_packages ?? null);
    const unique = Array.from(new Set(raw));
    return unique.filter(
      (value): value is LbcPackage =>
        value === "N_SAKTO" || value === "MINIBOX" || value === "SMALL_BOX"
    );
  }, [settings?.allowed_lbc_packages]);
  const adminItemLbcPackages = React.useMemo(() => {
    const lists = selectedLines
      .map((line) => normalizeSettingListUpper(line.variant.allowed_lbc_packages ?? null))
      .filter((list) => list.length > 0);
    if (!lists.length) return [];
    const intersection = intersectLists(lists);
    return intersection.filter(
      (value): value is LbcPackage =>
        value === "N_SAKTO" || value === "MINIBOX" || value === "SMALL_BOX"
    );
  }, [selectedLines]);
  const adminAllowedLbcSet = React.useMemo(
    () => new Set(adminAllowedLbcPackages),
    [adminAllowedLbcPackages]
  );
  const adminItemLbcSet = React.useMemo(
    () => new Set(adminItemLbcPackages),
    [adminItemLbcPackages]
  );
  const adminLbcRestrictionsActive =
    adminAllowedLbcPackages.length > 0 || adminItemLbcPackages.length > 0;
  const adminLbcFitMap = React.useMemo(
    () => ({
      N_SAKTO: fitsCapacity(adminShipCounts, LBC_CAPACITY.N_SAKTO),
      MINIBOX: fitsCapacity(adminShipCounts, LBC_CAPACITY.MINIBOX),
      SMALL_BOX: fitsCapacity(adminShipCounts, LBC_CAPACITY.SMALL_BOX),
    }),
    [adminShipCounts]
  );
  const adminAvailableLbcPackages = React.useMemo(() => {
    const allowed: LbcPackage[] = [];
    if (adminLbcFitMap.N_SAKTO) allowed.push("N_SAKTO");
    if (adminLbcFitMap.MINIBOX) allowed.push("MINIBOX");
    if (adminLbcFitMap.SMALL_BOX) allowed.push("SMALL_BOX");
    if (!adminLbcRestrictionsActive) return allowed;
    let filtered = allowed;
    if (adminAllowedLbcPackages.length) {
      filtered = filtered.filter((pack) => adminAllowedLbcSet.has(pack));
    }
    if (adminItemLbcPackages.length) {
      filtered = filtered.filter((pack) => adminItemLbcSet.has(pack));
    }
    return filtered;
  }, [
    adminAllowedLbcPackages.length,
    adminAllowedLbcSet,
    adminItemLbcPackages.length,
    adminItemLbcSet,
    adminLbcFitMap,
    adminLbcRestrictionsActive,
  ]);
  const adminLbcFallbackWarning = React.useMemo(() => {
    if (adminLbcRestrictionsActive || adminAvailableLbcPackages.length > 0) {
      return null;
    }
    const recommendation = recommendLbcPackage(adminShipCounts);
    return recommendation.ok ? null : recommendation.reason;
  }, [adminAvailableLbcPackages.length, adminLbcRestrictionsActive, adminShipCounts]);
  const adminAllowedJntPouches = React.useMemo(() => {
    const raw = normalizeSettingListUpper(settings?.allowed_jnt_pouches ?? null);
    const unique = Array.from(new Set(raw));
    return unique.filter(
      (value): value is JntPouch => value === "SMALL" || value === "MEDIUM"
    );
  }, [settings?.allowed_jnt_pouches]);
  const adminItemJntPouches = React.useMemo(() => {
    const lists = selectedLines
      .map((line) => normalizeSettingListUpper(line.variant.allowed_jnt_pouches ?? null))
      .filter((list) => list.length > 0);
    if (!lists.length) return [];
    const intersection = intersectLists(lists);
    return intersection.filter(
      (value): value is JntPouch => value === "SMALL" || value === "MEDIUM"
    );
  }, [selectedLines]);
  const adminItemJntSet = React.useMemo(
    () => new Set(adminItemJntPouches),
    [adminItemJntPouches]
  );
  const adminJntRestrictionsActive =
    adminAllowedJntPouches.length > 0 || adminItemJntPouches.length > 0;
  const adminEffectiveJntPouches = React.useMemo(() => {
    if (!adminJntRestrictionsActive) return [];
    const base = adminAllowedJntPouches.length
      ? adminAllowedJntPouches
      : (["SMALL", "MEDIUM"] as JntPouch[]);
    if (!adminItemJntPouches.length) return base;
    return base.filter((pouch) => adminItemJntSet.has(pouch));
  }, [
    adminAllowedJntPouches,
    adminItemJntPouches.length,
    adminItemJntSet,
    adminJntRestrictionsActive,
  ]);
  const adminAvailableJntPouches = React.useMemo(() => {
    const base = adminJntRestrictionsActive
      ? adminEffectiveJntPouches
      : (["SMALL", "MEDIUM"] as JntPouch[]);
    return base.filter((pouch) => fitsCapacity(adminShipCounts, JNT_CAPACITY[pouch]));
  }, [adminEffectiveJntPouches, adminJntRestrictionsActive, adminShipCounts]);
  React.useEffect(() => {
    if (!adminAvailableShippingMethods.length) return;
    if (!adminAvailableShippingMethods.includes(fbShippingMethod)) {
      setFbShippingMethod(adminAvailableShippingMethods[0]);
    }
  }, [adminAvailableShippingMethods, fbShippingMethod]);
  React.useEffect(() => {
    if (fbShippingMethod !== "LBC") return;
    if (adminAvailableLbcPackages.length) {
      if (!adminAvailableLbcPackages.includes(fbLbcPackage as LbcPackage)) {
        setFbLbcPackage(adminAvailableLbcPackages[0]);
      }
      return;
    }
    if (adminLbcFallbackWarning && fbLbcPackage !== "MEDIUM_APPROVAL") {
      setFbLbcPackage("MEDIUM_APPROVAL");
    }
  }, [
    adminAvailableLbcPackages,
    adminLbcFallbackWarning,
    fbLbcPackage,
    fbShippingMethod,
  ]);
  React.useEffect(() => {
    if (fbShippingMethod !== "JNT") return;
    if (adminAvailableJntPouches.length && !adminAvailableJntPouches.includes(fbJntPouch)) {
      setFbJntPouch(adminAvailableJntPouches[0]);
    }
  }, [adminAvailableJntPouches, fbJntPouch, fbShippingMethod]);
  React.useEffect(() => {
    if (!adminAvailableShippingMethods.length) return;
    setFacebookCheckoutForm((prev) => {
      if (adminAvailableShippingMethods.includes(prev.shippingMethod)) {
        return prev;
      }
      return {
        ...prev,
        shippingMethod: adminAvailableShippingMethods[0],
      };
    });
  }, [adminAvailableShippingMethods]);
  React.useEffect(() => {
    setFacebookCheckoutForm((prev) => {
      if (prev.shippingMethod !== "LBC") return prev;
      if (adminAvailableLbcPackages.length) {
        const current = prev.lbcPackage;
        if (adminAvailableLbcPackages.includes(current as LbcPackage)) {
          return prev;
        }
        return {
          ...prev,
          lbcPackage: adminAvailableLbcPackages[0],
        };
      }
      if (adminLbcFallbackWarning && prev.lbcPackage !== "MEDIUM_APPROVAL") {
        return {
          ...prev,
          lbcPackage: "MEDIUM_APPROVAL",
        };
      }
      return prev;
    });
  }, [adminAvailableLbcPackages, adminLbcFallbackWarning]);
  React.useEffect(() => {
    setFacebookCheckoutForm((prev) => {
      if (prev.shippingMethod !== "JNT") return prev;
      if (
        adminAvailableJntPouches.length &&
        !adminAvailableJntPouches.includes(prev.jntPouch)
      ) {
        return {
          ...prev,
          jntPouch: adminAvailableJntPouches[0],
        };
      }
      return prev;
    });
  }, [adminAvailableJntPouches]);
  React.useEffect(() => {
    if (typeof window === "undefined" || isAdminMode) return;
    const raw = window.localStorage.getItem(FACEBOOK_CHECKOUT_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<FacebookCheckoutFormState>;
      setFacebookCheckoutForm((prev) => ({
        ...prev,
        customerName: String(parsed.customerName ?? prev.customerName).trim(),
        contactNumber: sanitizePhone(
          String(parsed.contactNumber ?? prev.contactNumber)
        ),
        shippingMethod: normalizeAdminShippingMethod(
          String(parsed.shippingMethod ?? prev.shippingMethod)
        ),
        shippingRegion: normalizeAdminRegion(
          String(parsed.shippingRegion ?? prev.shippingRegion)
        ),
        lbcBranchName: String(parsed.lbcBranchName ?? prev.lbcBranchName).trim(),
        lbcBranchCity: String(parsed.lbcBranchCity ?? prev.lbcBranchCity).trim(),
        lbcPackage: normalizeAdminLbcPackage(
          String(parsed.lbcPackage ?? prev.lbcPackage)
        ),
        jntPouch: normalizeAdminJntPouch(String(parsed.jntPouch ?? prev.jntPouch)),
        jntHouseStreetUnit: String(
          parsed.jntHouseStreetUnit ?? prev.jntHouseStreetUnit
        ).trim(),
        jntBarangay: String(parsed.jntBarangay ?? prev.jntBarangay).trim(),
        jntCity: String(parsed.jntCity ?? prev.jntCity).trim(),
        jntProvince: String(parsed.jntProvince ?? prev.jntProvince).trim(),
        jntPostalCode: String(parsed.jntPostalCode ?? prev.jntPostalCode).trim(),
        lalamoveAddress: String(
          parsed.lalamoveAddress ?? prev.lalamoveAddress
        ).trim(),
        pickupDay: String(parsed.pickupDay ?? prev.pickupDay).trim(),
        pickupSlot: String(parsed.pickupSlot ?? prev.pickupSlot).trim(),
        notes: String(parsed.notes ?? prev.notes).trim(),
      }));
    } catch {
      // ignore bad local state
    }
  }, [isAdminMode]);
  React.useEffect(() => {
    if (isAdminMode) return;
    setFacebookCheckoutForm((prev) => {
      const fallbackName = prev.customerName.trim() || profile?.full_name?.trim() || "";
      const fallbackContact =
        prev.contactNumber.trim() || sanitizePhone(profile?.contact_number ?? "");
      const next = {
        ...prev,
        customerName: fallbackName,
        contactNumber: fallbackContact,
        lbcBranchName:
          prev.lbcBranchName.trim() || profileShippingDefaults.lbc.branch || "",
        lbcBranchCity:
          prev.lbcBranchCity.trim() || profileShippingDefaults.lbc.city || "",
        jntHouseStreetUnit:
          prev.jntHouseStreetUnit.trim() ||
          profileShippingDefaults.jnt.house_street_unit ||
          "",
        jntBarangay:
          prev.jntBarangay.trim() || profileShippingDefaults.jnt.barangay || "",
        jntCity: prev.jntCity.trim() || profileShippingDefaults.jnt.city || "",
        jntProvince:
          prev.jntProvince.trim() || profileShippingDefaults.jnt.province || "",
        jntPostalCode:
          prev.jntPostalCode.trim() || profileShippingDefaults.jnt.postal_code || "",
        lalamoveAddress:
          prev.lalamoveAddress.trim() ||
          profileShippingDefaults.lalamove.dropoff_address ||
          "",
        notes: prev.notes.trim(),
      };
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, [
    isAdminMode,
    profile?.full_name,
    profile?.contact_number,
    profileShippingDefaults,
  ]);
  React.useEffect(() => {
    if (isAdminMode || typeof window === "undefined") return;
    window.localStorage.setItem(
      FACEBOOK_CHECKOUT_STORAGE_KEY,
      JSON.stringify(facebookCheckoutForm)
    );
  }, [facebookCheckoutForm, isAdminMode]);
  React.useEffect(() => {
    setFacebookCheckoutForm((prev) => {
      if (prev.shippingMethod !== "PICKUP") return prev;
      if (pickupUnavailable) {
        if (!prev.pickupDay && !prev.pickupSlot) return prev;
        return {
          ...prev,
          pickupDay: "",
          pickupSlot: "",
        };
      }
      const firstDay = pickupDayOptions[0]?.key ?? "";
      if (!firstDay) {
        if (!prev.pickupDay && !prev.pickupSlot) return prev;
        return {
          ...prev,
          pickupDay: "",
          pickupSlot: "",
        };
      }
      if (!prev.pickupDay || !(pickupSchedule[prev.pickupDay] ?? []).length) {
        return {
          ...prev,
          pickupDay: firstDay,
        };
      }
      return prev;
    });
  }, [pickupDayOptions, pickupSchedule, pickupUnavailable]);
  React.useEffect(() => {
    setFacebookCheckoutForm((prev) => {
      if (prev.shippingMethod !== "PICKUP") return prev;
      if (pickupUnavailable) return prev;
      const slots = prev.pickupDay ? (pickupSchedule[prev.pickupDay] ?? []) : [];
      if (!slots.length) {
        if (!prev.pickupSlot) return prev;
        return {
          ...prev,
          pickupSlot: "",
        };
      }
      if (!prev.pickupSlot || !slots.includes(prev.pickupSlot)) {
        return {
          ...prev,
          pickupSlot: slots[0],
        };
      }
      return prev;
    });
  }, [pickupSchedule, pickupUnavailable]);
  const adminDiscountBase = parseNumberInput(fbDiscountValue);
  const adminDiscountAmount = roundMoney(
    fbDiscountType === "PERCENT"
      ? Math.min(
          selectedSubtotal,
          Math.max(0, (selectedSubtotal * Math.min(100, adminDiscountBase)) / 100)
        )
      : Math.min(selectedSubtotal, Math.max(0, adminDiscountBase))
  );
  const adminShippingMeta = React.useMemo<AdminShippingMeta>(() => {
    if (!adminAvailableShippingMethods.length) {
      return {
        ok: false,
        shippingFee: 0,
        packagingCode: null,
        packagingLabel: null,
        error: "No courier is available for the selected cart items.",
      };
    }
    if (!adminAvailableShippingMethods.includes(fbShippingMethod)) {
      return {
        ok: false,
        shippingFee: 0,
        packagingCode: null,
        packagingLabel: null,
        error: "Selected courier is not allowed for the current cart.",
      };
    }
    if (fbShippingMethod === "PICKUP") {
      return {
        ok: true,
        shippingFee: 0,
        packagingCode: null,
        packagingLabel: null,
        note: "Store pickup does not add a shipping fee.",
      };
    }
    if (fbShippingMethod === "LALAMOVE") {
      return {
        ok: true,
        shippingFee: 0,
        packagingCode: null,
        packagingLabel: null,
        note: "Lalamove convenience fee is waived in admin checkout.",
      };
    }
    if (fbShippingMethod === "JNT") {
      const selectedPouch = adminAvailableJntPouches.includes(fbJntPouch)
        ? fbJntPouch
        : adminAvailableJntPouches[0];
      if (!selectedPouch) {
        const recommendation = recommendAllowedJntPouch(
          adminShipCounts,
          adminJntRestrictionsActive ? adminEffectiveJntPouches : adminAllowedJntPouches
        );
        return {
          ok: false,
          shippingFee: 0,
          packagingCode: null,
          packagingLabel: null,
          error: recommendation.ok
            ? "Cart is too large for J&T."
            : recommendation.reason,
        };
      }
      return {
        ok: true,
        shippingFee: jntFee(selectedPouch, fbShippingRegion),
        packagingCode: selectedPouch,
        packagingLabel: formatJntPouchLabel(selectedPouch),
        note: "Packaging is suggested from the shipping chart.",
      };
    }
    if (adminAvailableLbcPackages.length) {
      const selectedPack = adminAvailableLbcPackages.includes(fbLbcPackage as LbcPackage)
        ? (fbLbcPackage as LbcPackage)
        : adminAvailableLbcPackages[0];
      return {
        ok: true,
        shippingFee: lbcFee(selectedPack, fbShippingRegion),
        packagingCode: selectedPack,
        packagingLabel: formatLbcPackageLabel(selectedPack),
        note: "Packaging is suggested from the shipping chart.",
      };
    }
    if (adminLbcFallbackWarning) {
      return {
        ok: true,
        shippingFee: 0,
        packagingCode: "MEDIUM_APPROVAL",
        packagingLabel: formatLbcPackageLabel("MEDIUM_APPROVAL"),
        warning: `${adminLbcFallbackWarning} Shipping fee is not on the current chart, so edit the final price if needed.`,
      };
    }
    return {
      ok: false,
      shippingFee: 0,
      packagingCode: null,
      packagingLabel: null,
      error: "LBC package restrictions do not fit this cart.",
    };
  }, [
    adminAllowedJntPouches,
    adminAvailableJntPouches,
    adminAvailableLbcPackages,
    adminAvailableShippingMethods,
    adminEffectiveJntPouches,
    adminJntRestrictionsActive,
    adminLbcFallbackWarning,
    adminShipCounts,
    fbJntPouch,
    fbLbcPackage,
    fbShippingMethod,
    fbShippingRegion,
  ]);
  const adminShippingFee = adminShippingMeta.ok ? adminShippingMeta.shippingFee : 0;
  const adminSuggestedTotal = roundMoney(
    Math.max(0, selectedSubtotal + adminShippingFee - adminDiscountAmount)
  );
  React.useEffect(() => {
    if (!adminFinalPriceTouched) {
      setAdminFinalPriceInput(formatEditableMoneyInput(adminSuggestedTotal));
    }
  }, [adminFinalPriceTouched, adminSuggestedTotal]);
  const adminFinalPrice = roundMoney(
    parseNumberInput(
      adminFinalPriceInput.trim().length
        ? adminFinalPriceInput
        : formatEditableMoneyInput(adminSuggestedTotal)
    )
  );
  const adminManualAdjustment = roundMoney(adminFinalPrice - adminSuggestedTotal);
  const adminExtraDiscount = adminManualAdjustment < 0 ? Math.abs(adminManualAdjustment) : 0;
  const adminStoredDiscountAmount = roundMoney(adminDiscountAmount + adminExtraDiscount);
  const adminHasManualFinalPrice = Math.abs(adminManualAdjustment) >= 0.01;
  const selectedInvoiceItems = React.useMemo<CartInvoiceItem[]>(
    () =>
      selectedLines.map((line) => {
        const condition = formatConditionLabel(line.variant.condition, {
          upper: true,
          shipClass: line.variant.ship_class,
        });
        const notesRaw = String(
          line.variant.public_notes ?? line.variant.issue_notes ?? ""
        ).trim();
        const addOn = protectorUnitFee(
          line.variant.ship_class,
          Boolean(line.protector_selected)
        );
        const amount = (lineUnitPrice(line) + addOn) * line.qty;
        return {
          name: line.variant.product.title,
          qty: Math.max(1, Math.trunc(Number(line.qty ?? 0))),
          amount,
          condition: condition || null,
          notes: notesRaw || null,
          imageUrl: line.variant.product.image_urls?.[0] ?? null,
        };
      }),
    [selectedLines, lineUnitPrice]
  );
  const allSelected = lines.length > 0 && selectedIds.length === lines.length;
  const someSelected =
    selectedIds.length > 0 && selectedIds.length < lines.length;
  const checkoutHref = selectedIds.length
    ? `/checkout?selected=${encodeURIComponent(selectedIds.join(","))}`
    : "/checkout";
  const checkoutDisabled =
    selectedLines.length === 0 ||
    (!isAdminMode && hasNonSealedSelected && !unsealedAck) ||
    (!isAdminMode && !shopControls.allowCheckout);
  const facebookCheckoutDisabled = checkoutDisabled;
  const adminSoldDisabled =
    selectedLines.length === 0 ||
    !fbCustomerName.trim() ||
    !adminShippingMeta.ok ||
    sellingAsPos ||
    profileLoading;
  const freeShippingThreshold = Number(settings?.free_shipping_threshold ?? 0);
  const freeShippingGap =
    freeShippingThreshold > 0 ? freeShippingThreshold - selectedSubtotal : 0;
  const freeShippingCouriers = React.useMemo(
    () => normalizeList(settings?.free_shipping_couriers),
    [settings?.free_shipping_couriers]
  );
  const freeShippingShipClasses = React.useMemo(
    () => normalizeList(settings?.free_shipping_ship_classes),
    [settings?.free_shipping_ship_classes]
  );
  const selectedShipClasses = React.useMemo(
    () => normalizeShipClasses(selectedLines.map((line) => line.variant.ship_class)),
    [selectedLines]
  );
  const cartHasIneligibleItems =
    freeShippingShipClasses.length > 0 &&
    selectedShipClasses.some((value) => !freeShippingShipClasses.includes(value));
  const freeShippingCourierLabel = freeShippingCouriers.length
    ? freeShippingCouriers.map(formatCourierLabel).join(", ")
    : null;
  const freeShippingHasRestrictions =
    freeShippingCouriers.length > 0 || freeShippingShipClasses.length > 0;
  const freeShippingNote = React.useMemo(() => {
    if (!freeShippingHasRestrictions) return "";
    if (freeShippingCourierLabel && freeShippingShipClasses.length) {
      return `Free shipping applies to ${freeShippingCourierLabel} and eligible items only.`;
    }
    if (freeShippingCourierLabel) {
      return `Free shipping applies to ${freeShippingCourierLabel} only.`;
    }
    return "Free shipping applies to eligible items only.";
  }, [freeShippingHasRestrictions, freeShippingCourierLabel, freeShippingShipClasses.length]);
  const cartProductIds = React.useMemo(
    () => new Set(lines.map((line) => line.variant.product.id).filter(Boolean)),
    [lines],
  );
  const completeSet = React.useMemo(() => {
    if (!allProducts.length || cartProductIds.size === 0) return [];
    const candidates = allProducts.filter((p) => !cartProductIds.has(p.id));
    const picked: any[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const target = {
        id: line.variant.product.id,
        title: line.variant.product.title,
        brand: line.variant.product.brand,
        model: line.variant.product.model,
        min_price: lineUnitPrice(line),
      };
      const recs = recommendSimilar(candidates as any, target as any, 4);
      for (const rec of recs) {
        if (seen.has(rec.id)) continue;
        seen.add(rec.id);
        picked.push(rec);
      }
      if (picked.length >= 6) break;
    }
    return picked.slice(0, 6);
  }, [allProducts, cartProductIds, lines, lineUnitPrice]);

  const completeSetProducts = React.useMemo(() => {
    if (!completeSet.length || !shopProducts.length) return [];
    const map = new Map(shopProducts.map((p) => [p.key, p]));
    return completeSet
      .map((item) => map.get(item.id))
      .filter(Boolean) as ShopProduct[];
  }, [completeSet, shopProducts]);
  const facebookEffectiveLbcPackage = React.useMemo<AdminSelectableLbcPackage | null>(() => {
    if (adminAvailableLbcPackages.includes(facebookCheckoutForm.lbcPackage as LbcPackage)) {
      return facebookCheckoutForm.lbcPackage;
    }
    if (adminAvailableLbcPackages.length) {
      return adminAvailableLbcPackages[0];
    }
    if (adminLbcFallbackWarning) {
      return "MEDIUM_APPROVAL";
    }
    return null;
  }, [
    adminAvailableLbcPackages,
    adminLbcFallbackWarning,
    facebookCheckoutForm.lbcPackage,
  ]);
  const facebookEffectiveJntPouch = React.useMemo<JntPouch | null>(() => {
    if (adminAvailableJntPouches.includes(facebookCheckoutForm.jntPouch)) {
      return facebookCheckoutForm.jntPouch;
    }
    return adminAvailableJntPouches[0] ?? null;
  }, [adminAvailableJntPouches, facebookCheckoutForm.jntPouch]);
  const facebookLbcPackageHint = React.useMemo(() => {
    if (facebookCheckoutForm.shippingMethod !== "LBC") return undefined;
    if (adminAvailableLbcPackages.length) {
      return "Suggested from item capacity. Packages that cannot fit the selected cart are hidden.";
    }
    if (adminLbcFallbackWarning) {
      return `${adminLbcFallbackWarning} Medium box is shown as the fallback option.`;
    }
    return undefined;
  }, [
    adminAvailableLbcPackages.length,
    adminLbcFallbackWarning,
    facebookCheckoutForm.shippingMethod,
  ]);
  const facebookJntPouchHint = React.useMemo(() => {
    if (facebookCheckoutForm.shippingMethod !== "JNT") return undefined;
    if (!adminAvailableJntPouches.length) return undefined;
    return "Suggested from item capacity. Pouches that cannot fit the selected cart are hidden.";
  }, [adminAvailableJntPouches.length, facebookCheckoutForm.shippingMethod]);

  const facebookCheckoutErrors = React.useMemo(() => {
    const errors: string[] = [];
    if (!adminAvailableShippingMethods.length) {
      errors.push("No courier is available for the selected cart items.");
      return errors;
    }
    if (!adminAvailableShippingMethods.includes(facebookCheckoutForm.shippingMethod)) {
      errors.push("Selected courier is not available for the current cart.");
      return errors;
    }
    if (!facebookCheckoutForm.customerName.trim()) {
      errors.push("Customer name is required.");
    } else if (!hasAtLeastTwoWords(facebookCheckoutForm.customerName)) {
      errors.push("Customer name must include at least first and last name.");
    }
    if (!facebookCheckoutForm.contactNumber.trim()) {
      errors.push("Contact number is required.");
    }
    if (
      facebookCheckoutForm.shippingMethod === "LBC" &&
      !adminAvailableLbcPackages.length &&
      !adminLbcFallbackWarning
    ) {
      errors.push("No valid LBC package fits the selected cart items.");
    }
    if (
      facebookCheckoutForm.shippingMethod === "LBC" &&
      !facebookCheckoutForm.lbcBranchName.trim()
    ) {
      errors.push("LBC branch name is required.");
    }
    if (
      facebookCheckoutForm.shippingMethod === "LBC" &&
      !facebookCheckoutForm.lbcBranchCity.trim()
    ) {
      errors.push("LBC branch city is required.");
    }
    if (
      facebookCheckoutForm.shippingMethod === "JNT" &&
      !adminAvailableJntPouches.length
    ) {
      errors.push("No valid J&T pouch fits the selected cart items.");
    }
    if (
      facebookCheckoutForm.shippingMethod === "JNT" &&
      !facebookCheckoutForm.jntHouseStreetUnit.trim()
    ) {
      errors.push("J&T house / street / unit is required.");
    }
    if (
      facebookCheckoutForm.shippingMethod === "JNT" &&
      !facebookCheckoutForm.jntBarangay.trim()
    ) {
      errors.push("J&T barangay is required.");
    }
    if (
      facebookCheckoutForm.shippingMethod === "JNT" &&
      !facebookCheckoutForm.jntCity.trim()
    ) {
      errors.push("J&T city is required.");
    }
    if (
      facebookCheckoutForm.shippingMethod === "JNT" &&
      !facebookCheckoutForm.jntProvince.trim()
    ) {
      errors.push("J&T province is required.");
    }
    if (
      facebookCheckoutForm.shippingMethod === "LALAMOVE" &&
      !facebookCheckoutForm.lalamoveAddress.trim()
    ) {
      errors.push("Lalamove drop-off address is required.");
    }
    if (facebookCheckoutForm.shippingMethod === "PICKUP" && pickupUnavailable) {
      errors.push("Pickup is currently unavailable.");
    }
    if (
      facebookCheckoutForm.shippingMethod === "PICKUP" &&
      !pickupUnavailable &&
      !facebookCheckoutForm.pickupDay.trim()
    ) {
      errors.push("Pickup day is required.");
    }
    if (
      facebookCheckoutForm.shippingMethod === "PICKUP" &&
      !pickupUnavailable &&
      !facebookCheckoutForm.pickupSlot.trim()
    ) {
      errors.push("Pickup timeslot is required.");
    }
    return errors;
  }, [
    adminAvailableJntPouches.length,
    adminAvailableLbcPackages.length,
    adminAvailableShippingMethods,
    adminLbcFallbackWarning,
    facebookCheckoutForm,
    pickupUnavailable,
  ]);

  const facebookCheckoutSummary = React.useMemo(() => {
    const shippingMethodLabel = formatFacebookCheckoutMethodLabel(
      facebookCheckoutForm.shippingMethod
    );
    const shippingLines: string[] = [];

    if (facebookCheckoutForm.shippingMethod === "LBC") {
      shippingLines.push(`Recipient: ${facebookCheckoutForm.customerName.trim() || "-"}`);
      shippingLines.push(`Branch: ${facebookCheckoutForm.lbcBranchName.trim() || "-"}`);
      shippingLines.push(`Branch city: ${facebookCheckoutForm.lbcBranchCity.trim() || "-"}`);
      shippingLines.push(
        `Region: ${formatAdminRegionLabel(facebookCheckoutForm.shippingRegion)}`
      );
      shippingLines.push(
        `Package: ${formatLbcPackageLabel(
          facebookEffectiveLbcPackage ?? facebookCheckoutForm.lbcPackage
        )}`
      );
    } else if (facebookCheckoutForm.shippingMethod === "JNT") {
      shippingLines.push(
        `Address: ${facebookCheckoutForm.jntHouseStreetUnit.trim() || "-"}`
      );
      shippingLines.push(
        `Barangay: ${facebookCheckoutForm.jntBarangay.trim() || "-"}`
      );
      shippingLines.push(
        `City / Province: ${[
          facebookCheckoutForm.jntCity.trim(),
          facebookCheckoutForm.jntProvince.trim(),
        ]
          .filter(Boolean)
          .join(", ") || "-"}`
      );
      if (facebookCheckoutForm.jntPostalCode.trim()) {
        shippingLines.push(`Postal code: ${facebookCheckoutForm.jntPostalCode.trim()}`);
      }
      shippingLines.push(
        `Region: ${formatAdminRegionLabel(facebookCheckoutForm.shippingRegion)}`
      );
      shippingLines.push(
        `Package: ${formatJntPouchLabel(
          facebookEffectiveJntPouch ?? facebookCheckoutForm.jntPouch
        )}`
      );
    } else if (facebookCheckoutForm.shippingMethod === "LALAMOVE") {
      shippingLines.push(
        `Drop-off: ${facebookCheckoutForm.lalamoveAddress.trim() || "-"}`
      );
      shippingLines.push("Delivery fee is settled directly with Lalamove.");
    } else {
      shippingLines.push(`Location: ${PICKUP_LOCATION}`);
      shippingLines.push(`Directory: ${PICKUP_DIRECTORY}`);
      if (facebookCheckoutForm.pickupDay.trim()) {
        shippingLines.push(
          `Pickup day: ${formatPickupDayLabel(facebookCheckoutForm.pickupDay)}`
        );
      }
      if (facebookCheckoutForm.pickupSlot.trim()) {
        shippingLines.push(`Pickup slot: ${facebookCheckoutForm.pickupSlot.trim()}`);
      }
    }

    return {
      customerName: facebookCheckoutForm.customerName.trim(),
      contactNumber: facebookCheckoutForm.contactNumber.trim(),
      shippingMethodLabel,
      shippingLines,
      notes: facebookCheckoutForm.notes.trim(),
    };
  }, [facebookCheckoutForm, facebookEffectiveJntPouch, facebookEffectiveLbcPackage]);

  React.useEffect(() => {
    setSelectedIds((prev) => {
      if (!lines.length) return [];
      const lineIds = lines.map((line) => line.id);
      const prevSet = new Set(prev);
      const filtered = lineIds.filter((id) => prevSet.has(id));
      return filtered.length ? filtered : lineIds;
    });
  }, [lines]);

  React.useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  React.useEffect(() => {
    if (!previewLine) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewLine(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewLine]);

  React.useEffect(() => {
    if (!hasNonSealedSelected) setUnsealedAck(false);
  }, [hasNonSealedSelected]);

  React.useEffect(() => {
    if (!isAdminMode || typeof window === "undefined") return;
    const raw = window.localStorage.getItem("oddwheels:admin-fb-cart");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        customerName?: string;
        shippingMethod?: string;
        shippingRegion?: string;
        lbcPackage?: string;
        jntPouch?: string;
        shippingDetails?: string;
        discountType?: "AMOUNT" | "PERCENT";
        discountValue?: string;
        finalPriceInput?: string;
        finalPriceTouched?: boolean;
      };
      setFbCustomerName(String(parsed.customerName ?? "").trim());
      setFbShippingMethod(normalizeAdminShippingMethod(parsed.shippingMethod));
      setFbShippingRegion(normalizeAdminRegion(parsed.shippingRegion));
      setFbLbcPackage(normalizeAdminLbcPackage(parsed.lbcPackage));
      setFbJntPouch(normalizeAdminJntPouch(parsed.jntPouch));
      setFbShippingDetails(String(parsed.shippingDetails ?? "").trim());
      setFbDiscountType(parsed.discountType === "PERCENT" ? "PERCENT" : "AMOUNT");
      setFbDiscountValue(String(parsed.discountValue ?? "").trim());
      setAdminFinalPriceInput(String(parsed.finalPriceInput ?? "").trim());
      setAdminFinalPriceTouched(Boolean(parsed.finalPriceTouched));
    } catch {
      // ignore bad local state
    }
  }, [isAdminMode]);

  React.useEffect(() => {
    if (!isAdminMode || typeof window === "undefined") return;
    window.localStorage.setItem(
      "oddwheels:admin-fb-cart",
      JSON.stringify({
        customerName: fbCustomerName,
        shippingMethod: fbShippingMethod,
        shippingRegion: fbShippingRegion,
        lbcPackage: fbLbcPackage,
        jntPouch: fbJntPouch,
        shippingDetails: fbShippingDetails,
        discountType: fbDiscountType,
        discountValue: fbDiscountValue,
        finalPriceInput: adminFinalPriceInput,
        finalPriceTouched: adminFinalPriceTouched,
      })
    );
  }, [
    isAdminMode,
    fbCustomerName,
    fbShippingMethod,
    fbShippingRegion,
    fbLbcPackage,
    fbJntPouch,
    fbShippingDetails,
    fbDiscountType,
    fbDiscountValue,
    adminFinalPriceInput,
    adminFinalPriceTouched,
  ]);

  React.useEffect(() => {
    if (!isAdminMode) {
      setFbCustomerSuggestions([]);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const suggestions = await fetchSalesCustomerSuggestions(
          supabase,
          fbCustomerName,
          8
        );
        if (active) setFbCustomerSuggestions(suggestions);
      } catch (error) {
        console.error("Failed to load sales customer suggestions", error);
        if (active) setFbCustomerSuggestions([]);
      }
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [fbCustomerName, isAdminMode]);

  function openPreview(line: CartLine) {
    setPreviewLine(line);
    setActiveImage(line.variant.product.image_urls?.[0] ?? "");
  }

  function renderPortal(content: React.ReactNode) {
    if (typeof document === "undefined") return null;
    return createPortal(content, document.body);
  }

  async function onAddSuggestion(
    product: ShopProduct,
    option: ShopProduct["options"][number],
  ) {
    try {
      const result = await add(option.id, 1);
      const effectivePrice = resolveEffectivePrice({
        price: Number(option.price),
        sale_price: option.sale_price ?? null,
        discount_percent: option.discount_percent ?? null,
      }).effectivePrice;
      const baseToast = {
        title: product.title,
        image_url: product.image_url,
        variant: formatConditionLabel(option.condition, { upper: true }),
        price: effectivePrice,
        action: { label: "View cart", href: "/cart" },
      };
      toast(
        result.capped
          ? {
              ...baseToast,
              message: "Maximum qty available added to cart.",
              qty: result.nextQty,
            }
          : { ...baseToast, qty: 1 },
      );
    } catch (e: any) {
      toast({
        title: "Failed to add to cart",
        message: e?.message ?? "Failed to add to cart",
        intent: "error",
      });
    }
  }

  function closeFacebookCheckoutModal() {
    setFacebookCheckoutOpen(false);
    clearFacebookSnapshot();
  }

  const buildFacebookSnapshot = React.useCallback(async (
    options: { silent?: boolean } = {}
  ): Promise<FacebookSnapshotResult | null> => {
    const { silent = false } = options;
    if (facebookCheckoutDisabled) return null;
    if (facebookCheckoutErrors.length > 0) {
      if (!silent) {
        toast({
          intent: "error",
          title: "Missing information",
          message: facebookCheckoutErrors[0],
        });
      }
      return null;
    }

    const generationId = ++facebookSnapshotGenerationRef.current;
    setDownloadingFacebookSnapshot(true);
    try {
      const blob = await buildFacebookCheckoutSnapshotBlob({
        customerName: facebookCheckoutSummary.customerName,
        contactNumber: facebookCheckoutSummary.contactNumber,
        shippingMethodLabel: facebookCheckoutSummary.shippingMethodLabel,
        shippingLines: facebookCheckoutSummary.shippingLines,
        notes: facebookCheckoutSummary.notes,
        items: selectedInvoiceItems,
        totalQty: selectedLines.reduce(
          (sum, line) => sum + Math.max(1, Number(line.qty ?? 0)),
          0
        ),
        totalLines: selectedLines.length,
        subtotalAmount: selectedSubtotal,
        generatedAt: new Date(),
      });
      const fileName = getFacebookSnapshotFileName(
        facebookCheckoutSummary.customerName
      );

      if (generationId === facebookSnapshotGenerationRef.current) {
        setFacebookSnapshotPreviewUrl((previousUrl) => {
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl);
          }
          return URL.createObjectURL(blob);
        });
        setFacebookSnapshotFileName(fileName);
      }

      if (!silent) {
        toast({
          intent: "success",
          title: "Snapshot ready",
          message: "The preview is updated. Download it or attach it in Messenger.",
        });
      }
      return { blob, fileName };
    } catch (error: any) {
      console.error(error);
      if (!silent) {
        toast({
          intent: "error",
          title: "Snapshot failed",
          message: error?.message ?? "Unable to create the order snapshot image.",
        });
      }
      return null;
    } finally {
      if (generationId === facebookSnapshotGenerationRef.current) {
        setDownloadingFacebookSnapshot(false);
      }
    }
  }, [
    facebookCheckoutDisabled,
    facebookCheckoutErrors,
    facebookCheckoutSummary,
    selectedInvoiceItems,
    selectedLines,
    selectedSubtotal,
  ]);

  React.useEffect(() => {
    if (!facebookCheckoutOpen) return;
    if (facebookCheckoutDisabled || facebookCheckoutErrors.length > 0) {
      clearFacebookSnapshot();
      setDownloadingFacebookSnapshot(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void buildFacebookSnapshot({ silent: true });
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    buildFacebookSnapshot,
    clearFacebookSnapshot,
    facebookCheckoutDisabled,
    facebookCheckoutErrors,
    facebookCheckoutOpen,
  ]);

  async function onDownloadFacebookSnapshot() {
    if (facebookCheckoutDisabled) return;
    const snapshot = await buildFacebookSnapshot({ silent: true });
    if (!snapshot) return;
    downloadBlobAsFile(snapshot.blob, snapshot.fileName);
    toast({
      intent: "success",
      title: "Snapshot downloaded",
      message: "Your Facebook checkout snapshot has been saved.",
    });
  }

  async function onCreateFacebookOrder() {
    if (facebookCheckoutDisabled || creatingFacebookOrder) return;
    if (facebookCheckoutErrors.length > 0) {
      toast({
        intent: "error",
        title: "Missing information",
        message: facebookCheckoutErrors[0],
      });
      return;
    }

    setCreatingFacebookOrder(true);
    try {
      const snapshot = await buildFacebookSnapshot({ silent: true });
      const trimmedName = facebookCheckoutSummary.customerName.trim();
      const trimmedContact = facebookCheckoutSummary.contactNumber.trim();
      const trimmedNotes = facebookCheckoutSummary.notes.trim();
      const shippingMethod = facebookCheckoutForm.shippingMethod;
      let shippingDetails: Record<string, any>;

      if (shippingMethod === "JNT") {
        const houseStreetUnit = facebookCheckoutForm.jntHouseStreetUnit.trim();
        const barangay = facebookCheckoutForm.jntBarangay.trim();
        const city = facebookCheckoutForm.jntCity.trim();
        const province = facebookCheckoutForm.jntProvince.trim();
        const postalCode = facebookCheckoutForm.jntPostalCode.trim();
        const fullAddress = [
          houseStreetUnit,
          barangay ? `Brgy ${barangay}` : "",
          city,
          province,
          postalCode,
        ]
          .map((part) => part.trim())
          .filter(Boolean)
          .join(", ");

        shippingDetails = {
          source: "facebook_checkout",
          method: "JNT",
          receiver_name: trimmedName,
          receiver_phone: trimmedContact,
          phone: trimmedContact,
          contact: trimmedContact,
          house_street_unit: houseStreetUnit,
          barangay,
          city,
          province,
          postal_code: postalCode || null,
          brgy: barangay,
          address_line: [houseStreetUnit, barangay].filter(Boolean).join(", "),
          full_address: fullAddress || null,
          region: facebookCheckoutForm.shippingRegion,
          package: facebookEffectiveJntPouch ?? facebookCheckoutForm.jntPouch,
          notes: trimmedNotes || null,
          snapshot_file_name: snapshot?.fileName ?? null,
        };
      } else if (shippingMethod === "LBC") {
        shippingDetails = {
          source: "facebook_checkout",
          method: "LBC",
          receiver_name: trimmedName,
          receiver_phone: trimmedContact,
          phone: trimmedContact,
          contact: trimmedContact,
          branch_name: facebookCheckoutForm.lbcBranchName.trim(),
          branch_city: facebookCheckoutForm.lbcBranchCity.trim(),
          region: facebookCheckoutForm.shippingRegion,
          package: facebookEffectiveLbcPackage ?? facebookCheckoutForm.lbcPackage,
          notes: trimmedNotes || null,
          snapshot_file_name: snapshot?.fileName ?? null,
        };
      } else if (shippingMethod === "PICKUP") {
        shippingDetails = {
          source: "facebook_checkout",
          method: "PICKUP",
          receiver_name: trimmedName,
          receiver_phone: trimmedContact,
          phone: trimmedContact,
          contact: trimmedContact,
          pickup_location: PICKUP_LOCATION,
          pickup_directory: PICKUP_DIRECTORY,
          pickup_day: facebookCheckoutForm.pickupDay.trim(),
          pickup_slot: facebookCheckoutForm.pickupSlot.trim(),
          notes: trimmedNotes || null,
          snapshot_file_name: snapshot?.fileName ?? null,
        };
      } else {
        shippingDetails = {
          source: "facebook_checkout",
          method: "LALAMOVE",
          receiver_name: trimmedName,
          receiver_phone: trimmedContact,
          phone: trimmedContact,
          contact: trimmedContact,
          region: facebookCheckoutForm.shippingRegion,
          dropoff_address: facebookCheckoutForm.lalamoveAddress.trim(),
          notes: trimmedNotes || null,
          snapshot_file_name: snapshot?.fileName ?? null,
        };
      }

      const order = await createOrderFromCart(
        {
          payment_method: "GCASH",
          shipping_method: shippingMethod,
          shipping_region:
            shippingMethod === "PICKUP" ? null : facebookCheckoutForm.shippingRegion,
          shipping_details: shippingDetails,
          channel: "WEB",
          create_as_pending_approval: true,
          fees: {
            shipping_fee: 0,
            cop_fee: 0,
            lalamove_fee: 0,
            priority_fee: 0,
            insurance_fee: 0,
          },
          shipping_discount: 0,
          discount_total: 0,
          priority_requested: false,
          insurance_selected: false,
          insurance_fee_user: 0,
        },
        selectedLines,
        { guest: !isLoggedIn }
      );

      if (snapshot) {
        downloadBlobAsFile(snapshot.blob, snapshot.fileName);
      }

      toast({
        intent: "success",
        title: "Order submitted",
        message: "Your order is now pending admin approval.",
      });

      closeFacebookCheckoutModal();
      if (!isLoggedIn) {
        for (const line of selectedLines) {
          await remove(line.id);
        }
      }
      await reload();

      const orderId = resolveOrderId(order);
      const guestAccessToken = resolveGuestOrderAccessToken(order);
      if (!isLoggedIn && orderId && guestAccessToken) {
        saveGuestOrderAccess(orderId, guestAccessToken);
      }
      if (typeof window !== "undefined") {
        if (isLoggedIn) {
          window.location.assign(orderId ? `/orders/${orderId}` : "/orders");
        } else if (orderId && guestAccessToken) {
          window.location.assign(
            `/orders/${orderId}?access=${encodeURIComponent(guestAccessToken)}`
          );
        }
      }
    } catch (error: any) {
      console.error(error);
      toast({
        intent: "error",
        title: "Submit order failed",
        message: error?.message ?? "Unable to submit the order.",
      });
    } finally {
      setCreatingFacebookOrder(false);
    }
  }

  async function onOpenFacebookMessenger() {
    if (facebookCheckoutDisabled) return;
    if (facebookCheckoutErrors.length > 0) {
      toast({
        intent: "error",
        title: "Missing information",
        message: facebookCheckoutErrors[0],
      });
      return;
    }

    const messengerWindow = window.open("", "_blank");
    if (!messengerWindow) {
      toast({
        intent: "error",
        title: "Messenger popup blocked",
        message: "Please allow popups for this site, then try again.",
      });
      return;
    }

    messengerWindow.opener = null;
    messengerWindow.document.title = "Opening Messenger...";
    messengerWindow.document.body.innerHTML =
      '<div style="font-family: system-ui, sans-serif; padding: 24px; color: #111;">Opening Odd Wheels Messenger chat...</div>';

    if (!facebookSnapshotPreviewUrl) {
      const snapshot = await buildFacebookSnapshot({ silent: true });
      if (!snapshot) {
        messengerWindow.close();
        toast({
          intent: "error",
          title: "Snapshot unavailable",
          message: "Complete the details first so the order snapshot can be created.",
        });
        return;
      }
    }

    setOpeningFacebookMessenger(true);
    try {
      messengerWindow.location.href = FACEBOOK_CHECKOUT_URL;
      messengerWindow.focus();
      toast({
        intent: "success",
        title: "Continue in Messenger",
        message: "Attach the downloaded snapshot or preview image in Messenger and send it to Odd Wheels.",
      });
    } finally {
      setOpeningFacebookMessenger(false);
    }
  }

  async function onGenerateAdminInvoice() {
    if (!selectedLines.length) {
      alert("Select at least one cart item first.");
      return;
    }
    if (!fbCustomerName.trim()) {
      alert("Customer name is required.");
      return;
    }
    if (!adminShippingMeta.ok) {
      alert(adminShippingMeta.error);
      return;
    }

    setGeneratingInvoice(true);
    try {
      const payload: CartInvoicePayload = {
        customerName: fbCustomerName.trim(),
        shippingMethod: fbShippingMethod,
        shippingDetails: fbShippingDetails.trim(),
        shippingRegion:
          fbShippingMethod === "PICKUP" ? null : formatAdminRegionLabel(fbShippingRegion),
        packagingLabel: adminShippingMeta.packagingLabel,
        items: selectedInvoiceItems,
        totalQty: selectedLines.reduce((sum, line) => sum + Math.max(1, Number(line.qty ?? 0)), 0),
        totalLines: selectedLines.length,
        subtotalAmount: selectedSubtotal,
        shippingFeeAmount: adminShippingFee,
        discountAmount: adminDiscountAmount,
        manualAdjustmentAmount: adminManualAdjustment,
        suggestedTotalAmount: adminSuggestedTotal,
        totalAmount: adminFinalPrice,
      };
      await exportAdminCartInvoicePdf(payload, invoiceImageCacheRef.current);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to generate invoice PDF.");
    } finally {
      setGeneratingInvoice(false);
    }
  }

  async function onClearCart() {
    if (!lines.length || clearingCart) return;
    const confirmed = window.confirm(
      `Clear all ${lines.length} item(s) from your cart?`
    );
    if (!confirmed) return;

    setClearingCart(true);
    try {
      if (isLoggedIn && user?.id) {
        const lineIds = lines.map((line) => line.id).filter(Boolean);
        if (lineIds.length) {
          const { error } = await supabase
            .from("cart_items")
            .delete()
            .in("id", lineIds)
            .eq("user_id", user.id);
          if (error) throw error;
        }
        await reload();
      } else {
        for (const line of lines) {
          await remove(line.id);
        }
      }

      setSelectedIds([]);
      setUnsealedAck(false);
      setAdminFinalPriceTouched(false);
      setAdminFinalPriceInput("");
      toast({
        intent: "success",
        title: "Cart cleared",
        message: "All cart items have been removed.",
      });
    } catch (e: any) {
      console.error(e);
      toast({
        intent: "error",
        title: "Clear cart failed",
        message: e?.message ?? "Unable to clear cart.",
      });
    } finally {
      setClearingCart(false);
    }
  }

  async function onSoldAsPos() {
    if (adminSoldDisabled) return;
    if (!selectedLines.length) {
      alert("Select at least one cart item first.");
      return;
    }
    const customerName = fbCustomerName.trim();
    if (!customerName) {
      alert("Customer name is required.");
      return;
    }

    setSellingAsPos(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        throw new Error("Staff session not found. Please sign in again.");
      }

      const shippingMethod = fbShippingMethod;
      const shippingRegion = shippingMethod === "PICKUP" ? null : fbShippingRegion;
      const shippingText = fbShippingDetails.trim();
      const shippingDetails = {
        method: shippingMethod,
        text: shippingText || "FB checkout from admin cart",
        shipping_notes: shippingText || null,
        receiver_name: customerName,
        source: "admin_cart_checkout",
        admin_cart_checkout: true,
        region: shippingRegion,
        region_label: shippingRegion ? formatAdminRegionLabel(shippingRegion) : null,
        packaging: adminShippingMeta.packagingCode,
        packaging_label: adminShippingMeta.packagingLabel,
        courier_note: adminShippingMeta.ok ? adminShippingMeta.note ?? null : null,
        courier_warning: adminShippingMeta.ok ? adminShippingMeta.warning ?? null : null,
        discount:
          adminDiscountAmount > 0
            ? {
                type: fbDiscountType,
                value: adminDiscountBase,
                amount: adminDiscountAmount,
              }
            : null,
        pricing: {
          subtotal: selectedSubtotal,
          shipping_fee: adminShippingFee,
          discount_amount: adminDiscountAmount,
          suggested_total: adminSuggestedTotal,
          final_total: adminFinalPrice,
          manual_adjustment: adminManualAdjustment,
          lalamove_fee_waived: shippingMethod === "LALAMOVE",
        },
        final_price_override:
          adminHasManualFinalPrice
            ? {
                suggested_total: adminSuggestedTotal,
                final_total: adminFinalPrice,
                adjustment: adminManualAdjustment,
              }
            : null,
      };
      const items = selectedLines.map((line) => ({
        variant_id: line.variant_id,
        qty: Math.max(1, Math.trunc(Number(line.qty ?? 0))),
      }));

      const basePayload = {
        p_customer_name: customerName,
        p_customer_phone: null,
        p_shipping_method: shippingMethod,
        p_shipping_details: shippingDetails,
        p_payment_method: "CASH",
        p_save_customer: true,
        p_items: items,
      };

      const { data, error } = await supabase.rpc(
        "pos_create_order",
        basePayload as any
      );
      if (error) throw error;

      const orderId = resolveOrderId(data);
      if (!orderId) {
        throw new Error("POS order created, but order id is missing.");
      }

      const normalizedCourier = shippingMethod === "JNT" ? "JNT" : shippingMethod;
      const { error: pricingError } = await supabase
        .from("orders")
        .update({
          shipping_method: shippingMethod,
          shipping_region: shippingRegion,
          shipping_details: shippingDetails,
          carrier: normalizedCourier,
          courier: normalizedCourier,
          subtotal: selectedSubtotal,
          shipping_fee: adminShippingFee,
          cop_fee: 0,
          lalamove_fee: 0,
          shipping_discount: 0,
          priority_fee: 0,
          insurance_fee: 0,
          discount_total: adminStoredDiscountAmount,
          discount: adminStoredDiscountAmount,
          total: adminFinalPrice,
        })
        .eq("id", orderId);
      if (pricingError) throw pricingError;

      const shouldMarkToShip = shippingMethod.toUpperCase() !== "PICKUP";
      const res = await fetch("/api/pos/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId, markToShip: shouldMarkToShip }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "POS completion failed.");
      }

      const selectedLineIds = selectedLines.map((line) => line.id);
      if (isLoggedIn) {
        const { error: removeError } = await supabase
          .from("cart_items")
          .delete()
          .in("id", selectedLineIds);
        if (removeError) throw removeError;
        await reload();
      } else {
        for (const line of selectedLines) {
          await remove(line.id);
        }
      }
      setSelectedIds((prev) => prev.filter((id) => !selectedLineIds.includes(id)));
      setUnsealedAck(false);
      setAdminFinalPriceTouched(false);
      setAdminFinalPriceInput("");

      toast({
        intent: "success",
        title: "Marked sold",
        message: `${selectedLines.length} line(s) sold as POS${
          shouldMarkToShip ? " and added to To Ship." : "."
        }`,
      });
    } catch (e: any) {
      console.error(e);
      toast({
        intent: "error",
        title: "Sold failed",
        message: e?.message ?? "Unable to mark selected items as sold.",
      });
    } finally {
      setSellingAsPos(false);
    }
  }

  const previewImages = (previewLine?.variant.product.image_urls ?? []).filter(
    (img) => Boolean(img),
  );
  const previewPrice = previewLine
    ? formatPHP(
        resolveEffectivePrice({
          price: Number(previewLine.variant.price),
          sale_price: previewLine.variant.sale_price ?? null,
          discount_percent: previewLine.variant.discount_percent ?? null,
        }).effectivePrice
      )
    : "";
  const previewStrikePrice = previewLine
    ? resolveEffectivePrice({
        price: Number(previewLine.variant.price),
        sale_price: previewLine.variant.sale_price ?? null,
        discount_percent: previewLine.variant.discount_percent ?? null,
      }).hasSale
      ? formatPHP(Number(previewLine.variant.price))
      : null
    : null;
  const previewCondition = previewLine?.variant.condition ?? "";
  const previewUnifiedNotes = String(
    previewLine?.variant.public_notes ?? previewLine?.variant.issue_notes ?? ""
  ).trim();
  const isPreviewNearMint = isNearMintCondition(previewCondition);
  const isPreviewWithIssues = isIssueCondition(previewCondition);
  const previewIndicatorTone = isPreviewWithIssues
    ? "bg-red-400"
    : isPreviewNearMint
      ? "bg-amber-400"
      : "";
  const showPreviewIndicator = previewIndicatorTone.length > 0;
  const previewNoteTone = previewUnifiedNotes
    ? isPreviewWithIssues
      ? "text-red-200/80"
      : isPreviewNearMint
        ? "text-amber-200/80"
        : "text-white/70"
    : "text-white/70";
  const adminCourierOptions = adminAvailableShippingMethods.length
    ? adminAvailableShippingMethods
    : ADMIN_SHIPPING_METHODS;
  const adminLbcPackageOptions = adminAvailableLbcPackages.length
    ? adminAvailableLbcPackages
    : adminLbcFallbackWarning
      ? (["MEDIUM_APPROVAL"] as AdminSelectableLbcPackage[])
      : [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cart</h1>
          <div className="text-sm text-white/60">
            Review items before checkout.
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={() => void onClearCart()}
          disabled={loading || clearingCart || lines.length === 0}
        >
          {clearingCart ? "Clearing..." : "Clear cart"}
        </Button>
      </div>

      {isAdminMode ? (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">FB Odd Wheels Checkout</div>
            <div className="text-xs text-white/60">
              Admin mode: selected cart items will be sold directly as POS.
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Customer name"
                placeholder="Enter customer name"
                list={adminCustomerSuggestionListId}
                value={fbCustomerName}
                onChange={(e) => setFbCustomerName(e.target.value)}
                hint={
                  fbCustomerSuggestions.length
                    ? "Suggestions come from previous POS/admin-cart customers."
                    : undefined
                }
                required
              />
              {fbCustomerSuggestions.length ? (
                <datalist id={adminCustomerSuggestionListId}>
                  {fbCustomerSuggestions.map((suggestion) => (
                    <option
                      key={suggestion.id}
                      value={suggestion.name}
                    >{`${suggestion.phone ?? "No phone"} · ${suggestion.order_count} sale${suggestion.order_count === 1 ? "" : "s"}`}</option>
                  ))}
                </datalist>
              ) : null}
              <Select
                label="Shipping courier"
                value={fbShippingMethod}
                onChange={(e) =>
                  setFbShippingMethod(e.target.value as AdminShippingMethod)
                }
                hint={
                  adminHasLalamoveOnly
                    ? "Selected items require Lalamove handling."
                    : undefined
                }
              >
                {adminCourierOptions.map((method) => (
                  <option key={method} value={method}>
                    {method === "JNT"
                      ? "J&T"
                      : method === "PICKUP"
                        ? "Pickup"
                        : formatCourierLabel(method)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Select
                label="Shipping region"
                value={fbShippingRegion}
                onChange={(e) => setFbShippingRegion(e.target.value as Region)}
                disabled={fbShippingMethod === "PICKUP"}
                hint={
                  fbShippingMethod === "PICKUP"
                    ? "Region is not needed for pickup."
                    : "Choose NCR, Luzon, Visayas, or Mindanao for the shipping chart."
                }
              >
                <option value="METRO_MANILA">NCR / Metro Manila</option>
                <option value="LUZON">Luzon</option>
                <option value="VISAYAS">Visayas</option>
                <option value="MINDANAO">Mindanao</option>
              </Select>
              {fbShippingMethod === "LBC" ? (
                <Select
                  label="Packaging"
                  value={fbLbcPackage}
                  onChange={(e) =>
                    setFbLbcPackage(e.target.value as AdminSelectableLbcPackage)
                  }
                  disabled={!adminLbcPackageOptions.length}
                  hint="Suggested from the shipping chart. You can switch to another valid LBC package."
                >
                  {adminLbcPackageOptions.length ? (
                    adminLbcPackageOptions.map((pack) => (
                      <option key={pack} value={pack}>
                        {formatLbcPackageLabel(pack)}
                      </option>
                    ))
                  ) : (
                    <option value="">No valid LBC package</option>
                  )}
                </Select>
              ) : fbShippingMethod === "JNT" ? (
                <Select
                  label="Packaging"
                  value={fbJntPouch}
                  onChange={(e) => setFbJntPouch(e.target.value as JntPouch)}
                  disabled={!adminAvailableJntPouches.length}
                  hint="Suggested from the shipping chart. You can switch to another valid J&T pouch."
                >
                  {adminAvailableJntPouches.length ? (
                    adminAvailableJntPouches.map((pouch) => (
                      <option key={pouch} value={pouch}>
                        {formatJntPouchLabel(pouch)}
                      </option>
                    ))
                  ) : (
                    <option value="">No valid J&T pouch</option>
                  )}
                </Select>
              ) : (
                <Input
                  label="Packaging"
                  value={
                    fbShippingMethod === "LALAMOVE"
                      ? "Not required"
                      : "Not required for pickup"
                  }
                  disabled
                  hint={
                    fbShippingMethod === "LALAMOVE"
                      ? "Lalamove convenience fee is waived in admin checkout."
                      : undefined
                  }
                />
              )}
            </div>
            <div className="mt-3">
              <Input
                label="Shipping details (optional)"
                placeholder="Address, branch, booking ref, or notes"
                value={fbShippingDetails}
                onChange={(e) => setFbShippingDetails(e.target.value)}
              />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Select
                label="Discount type"
                value={fbDiscountType}
                onChange={(e) =>
                  setFbDiscountType(e.target.value as "AMOUNT" | "PERCENT")
                }
              >
                <option value="AMOUNT">Amount (PHP)</option>
                <option value="PERCENT">Percent (%)</option>
              </Select>
              <Input
                label={fbDiscountType === "PERCENT" ? "Discount (%)" : "Discount (PHP)"}
                placeholder="0"
                value={fbDiscountValue}
                onChange={(e) => setFbDiscountValue(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Input
                label="Final price (PHP)"
                value={adminFinalPriceInput}
                onChange={(e) => {
                  setAdminFinalPriceTouched(true);
                  setAdminFinalPriceInput(e.target.value);
                }}
                onBlur={() => {
                  if (!adminFinalPriceInput.trim()) {
                    setAdminFinalPriceTouched(false);
                    setAdminFinalPriceInput(formatEditableMoneyInput(adminSuggestedTotal));
                  }
                }}
                inputMode="decimal"
                hint="Auto-filled from subtotal + shipping fee - discount. Edit if needed."
              />
              <div className="rounded-xl border border-white/10 bg-bg-900/30 p-4">
                <div className="text-sm text-white/60">Shipping chart result</div>
                {adminShippingMeta.ok ? (
                  <div className="mt-1 space-y-1 text-sm text-white/75">
                    <div>
                      Region:{" "}
                      {fbShippingMethod === "PICKUP"
                        ? "Pickup"
                        : formatAdminRegionLabel(fbShippingRegion)}
                    </div>
                    <div>
                      Packaging: {adminShippingMeta.packagingLabel ?? "Not required"}
                    </div>
                    <div>Shipping fee: {formatPHP(adminShippingFee)}</div>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-red-300">{adminShippingMeta.error}</div>
                )}
              </div>
            </div>
            {adminShippingMeta.ok && adminShippingMeta.note ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-bg-900/30 p-3 text-sm text-white/65">
                {adminShippingMeta.note}
              </div>
            ) : null}
            {adminShippingMeta.ok && adminShippingMeta.warning ? (
              <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                {adminShippingMeta.warning}
              </div>
            ) : null}
            {!adminShippingMeta.ok ? (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {adminShippingMeta.error}
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {freeShippingThreshold > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-4 text-sm text-white/70">
          {freeShippingGap > 0 ? (
            <span>
              Add{" "}
              <span className="text-price">{formatPHP(freeShippingGap)}</span>{" "}
              more to unlock free shipping.
            </span>
          ) : cartHasIneligibleItems ? (
            <span className="text-white/70">
              Subtotal met, but some items aren't eligible for free shipping.
            </span>
          ) : (
            <span className="text-accent-700 dark:text-accent-200">
              You unlocked free shipping for this cart.
            </span>
          )}
          {freeShippingNote ? (
            <div className="mt-1 text-xs text-white/50">{freeShippingNote}</div>
          ) : null}
        </div>
      ) : null}

      {!isAdminMode && !shopControls.allowCheckout ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {SHOP_CHECKOUT_DISABLED_MESSAGE}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="font-semibold">Items</div>
          <div className="text-sm text-white/60">
            {selectedLines.length} selected / {lines.length} item(s)
          </div>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="text-white/60">Loading cart...</div>
          ) : lines.length === 0 ? (
            <div className="text-white/60">Your cart is empty.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-white/70">
                <label className="flex items-center gap-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="h-4 w-4"
                    checked={allSelected}
                    onChange={(e) =>
                      setSelectedIds(
                        e.target.checked ? lines.map((l) => l.id) : [],
                      )
                    }
                  />
                  Select all
                </label>
                <div>{selectedLines.length} selected</div>
              </div>
              {lines.map((l) => {
                const available = l.variant.qty;
                const protectorEligible = isProtectorEligibleShipClass(
                  l.variant.ship_class
                );
                const protectorKind = protectorKindFromShipClass(
                  l.variant.ship_class
                );
                const protectorSelected = Boolean(l.protector_selected);
                const protectorStockForLine = protectorKind
                  ? protectorStockByKind[protectorKind]
                  : 0;
                const protectorRemainingForLine = protectorKind
                  ? protectorRemainingByKind[protectorKind]
                  : 0;
                const canToggleProtector =
                  protectorEligible &&
                  (protectorSelected || protectorRemainingForLine >= l.qty);
                const pricing = resolveEffectivePrice({
                  price: Number(l.variant.price),
                  sale_price: l.variant.sale_price ?? null,
                  discount_percent: l.variant.discount_percent ?? null,
                });
                const displayPrice = formatPHP(pricing.effectivePrice);
                const strikePrice = pricing.hasSale
                  ? formatPHP(Number(l.variant.price))
                  : null;
                const invalid = available <= 0 || l.qty > available;
                const canDec = l.qty > 1;
                const canInc =
                  available > 0 &&
                  l.qty < available &&
                  (isAdminMode || shopControls.allowAddToCart);
                const checked = selectedIds.includes(l.id);
                const protectorFeeLabel = formatPHP(PROTECTOR_ADDON_FEE);

                const thumb = l.variant.product.image_urls?.[0] ?? "";
                return (
                  <div
                    key={l.id}
                    className="rounded-xl border border-white/10 bg-bg-900/30 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedIds((prev) =>
                              e.target.checked
                                ? [...prev, l.id]
                                : prev.filter((id) => id !== l.id),
                            )
                          }
                          aria-label={`Select ${l.variant.product.title}`}
                        />
                        <button
                          type="button"
                          onClick={() => openPreview(l)}
                          className="h-20 w-20 md:h-16 md:w-16 rounded-xl overflow-hidden border border-white/10 bg-bg-900/40 transition hover:border-white/30 shrink-0"
                          aria-label={`View ${l.variant.product.title}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              thumb
                                ? getOptimizedImageUrl(thumb, {
                                    width: 200,
                                    quality: 70,
                                    format: "webp",
                                  })
                                : ""
                            }
                            srcSet={
                              thumb
                                ? buildSrcSet(thumb, [120, 160, 200], {
                                    quality: 70,
                                    format: "webp",
                                  })
                                : undefined
                            }
                            sizes="80px"
                            alt=""
                            className="h-full w-full object-contain bg-neutral-50"
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (thumb && img.dataset.fallbackApplied !== "true") {
                                applyImageFallback(img, thumb);
                                return;
                              }
                              img.style.display = "none";
                            }}
                            loading="lazy"
                            decoding="async"
                          />
                        </button>
                        <div>
                          <button
                            type="button"
                            onClick={() => openPreview(l)}
                            className="text-left font-semibold transition hover:text-accent-700 dark:hover:text-accent-200"
                          >
                            {l.variant.product.title}
                          </button>
                          <div className="text-sm text-white/60">
                            {formatConditionLabel(l.variant.condition, {
                              upper: true,
                              shipClass: l.variant.ship_class,
                            })}{" "}
                            -{" "}
                            <span className="text-price">
                              {strikePrice ? (
                                <span className="flex items-baseline gap-2">
                                  <span>{displayPrice}</span>
                                  <span className="text-[11px] text-white/40 line-through">
                                    {strikePrice}
                                  </span>
                                </span>
                              ) : (
                                displayPrice
                              )}
                            </span>
                          </div>
                          {(() => {
                            const noteValue = String(
                              l.variant.public_notes ?? l.variant.issue_notes ?? ""
                            ).trim();
                            if (!noteValue) return null;
                            const noteTone =
                              isIssueCondition(l.variant.condition)
                                ? "text-red-200/80"
                                : isNearMintCondition(l.variant.condition)
                                  ? "text-amber-200/80"
                                  : "text-white/50";
                            const indicatorTone =
                              isIssueCondition(l.variant.condition)
                                ? "bg-red-400"
                                : isNearMintCondition(l.variant.condition)
                                  ? "bg-amber-400"
                                  : "";
                            const showIndicator = indicatorTone.length > 0;
                            return (
                              <div className={`text-[11px] ${noteTone} flex items-center gap-2`}>
                                {showIndicator ? (
                                  <span
                                    className={`h-2 w-2 rounded-full ${indicatorTone}`}
                                    aria-hidden="true"
                                  />
                                ) : null}
                                <span>Notes: {noteValue}</span>
                              </div>
                            );
                          })()}
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                            {protectorEligible ? (
                              <label className="inline-flex items-center gap-2 text-white/70">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={protectorSelected}
                                  disabled={!canToggleProtector}
                                  onChange={(e) => {
                                    if (
                                      e.target.checked &&
                                      !canToggleProtector
                                    ) {
                                      toast({
                                        title: "No protectors left",
                                        message: "Protector stock is sold out.",
                                      });
                                      return;
                                    }
                                    updateProtector(l.id, e.target.checked);
                                  }}
                                />
                                Protector add-on ({protectorFeeLabel})
                              </label>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openPreview(l)}
                              className={`text-left text-xs text-white/50 transition hover:text-white/80 ${
                                protectorEligible ? "ml-auto" : ""
                              }`}
                            >
                              View details
                            </button>
                          </div>
                          {protectorEligible && protectorSelected ? (
                            <div className="text-[11px] text-white/50">
                              Protector adds {protectorFeeLabel} per item.
                            </div>
                          ) : null}
                          {protectorEligible && protectorStockForLine > 0 ? (
                            <div className="text-[11px] text-white/40">
                              Protectors left: {protectorRemainingForLine}
                            </div>
                          ) : null}
                          {!isAdminMode && !shopControls.allowAddToCart ? (
                            <div className="text-[11px] text-amber-200/80">
                              {SHOP_ADD_TO_CART_DISABLED_MESSAGE}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!canDec}
                            onClick={() => updateQty(l.id, l.qty - 1)}
                            aria-label="Decrease quantity"
                          >
                            −
                          </Button>

                          <div className="w-20">
                            <Input
                              value={String(l.qty)}
                              inputMode="numeric"
                              onChange={(e) => {
                                const v = Number(
                                  e.target.value.replace(/[^0-9]/g, ""),
                                );
                                if (!Number.isFinite(v)) return;
                                updateQty(l.id, v);
                              }}
                            />
                          </div>

                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!canInc}
                            onClick={() => updateQty(l.id, l.qty + 1)}
                            aria-label="Increase quantity"
                          >
                            +
                          </Button>
                        </div>
                        <Button variant="ghost" onClick={() => remove(l.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>

                    {invalid ? (
                      <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200 space-y-2">
                        <div>
                          Item sold out, browse our page for similar items.
                        </div>
                        {(() => {
                          const target = {
                            id: l.variant.product.id,
                            title: l.variant.product.title,
                            brand: l.variant.product.brand,
                            model: l.variant.product.model,
                            min_price: resolveEffectivePrice({
                              price: Number(l.variant.price),
                              sale_price: l.variant.sale_price ?? null,
                              discount_percent: l.variant.discount_percent ?? null,
                            }).effectivePrice,
                          };
                          const recs = recommendSimilar(
                            allProducts as any,
                            target as any,
                            4,
                          );
                          return recs.length ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {recs.map((p: any) => (
                                <Link
                                  key={p.id}
                                  href={`/product/${p.id}`}
                                  className="group flex items-center gap-3 rounded-xl border border-white/10 bg-bg-900/40 p-2 text-white/80 transition hover:border-white/20 hover:bg-paper/10"
                                >
                                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-white/10 bg-bg-950/50">
                                    {Array.isArray(p.image_urls) &&
                                    p.image_urls[0] ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={getOptimizedImageUrl(
                                          p.image_urls[0],
                                          {
                                            width: 96,
                                            quality: 70,
                                            format: "webp",
                                          },
                                        )}
                                        srcSet={buildSrcSet(
                                          p.image_urls[0],
                                          [64, 96, 128],
                                          { quality: 70, format: "webp" },
                                        )}
                                        sizes="48px"
                                        alt={p.title ?? "Suggestion"}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                        decoding="async"
                                        onError={(e) =>
                                          applyImageFallback(
                                            e.currentTarget,
                                            p.image_urls[0],
                                          )
                                        }
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-[10px] text-white/40">
                                        No image
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium line-clamp-2">
                                      {p.title}
                                    </div>
                                    <div className="text-[11px] text-white/55">
                                      {p.brand ?? "-"}
                                      {p.model ? ` · ${p.model}` : ""}
                                    </div>
                                    <div className="mt-1 text-xs text-price">
                                      {formatPHP(
                                        Number.isFinite(p.min_price)
                                          ? p.min_price
                                          : Number(p.min_price ?? 0),
                                      )}
                                    </div>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-white/50">
                        In stock: {available}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {!isAdminMode && hasNonSealedInCart ? (
        <div className="rounded-xl border border-amber-300/50 bg-amber-50 p-4 text-xs text-amber-900/80 space-y-2 dark:border-white/10 dark:bg-bg-900/30 dark:text-white/70">
          <div className="text-sm text-amber-900 dark:text-white/80">
            Quick note: Unsealed items may show light signs of handling or
            display.
          </div>
          <label className="flex items-start gap-2 text-xs text-amber-900/80 dark:text-white/70">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={unsealedAck}
              onChange={(e) => setUnsealedAck(e.target.checked)}
              disabled={!hasNonSealedSelected}
            />
            <span>
              I understand that photos are for reference, and unsealed items may
              have minor imperfections.
            </span>
          </label>
          {hasNonSealedSelected && !unsealedAck ? (
            <div className="text-[11px] text-amber-900/60 dark:text-white/50">
              Please tick this box to continue.
            </div>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardBody className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          {isAdminMode ? (
            <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div>
                <div className="text-sm text-white/60">Selected subtotal</div>
                <div className="text-xl text-price">{formatPHP(selectedSubtotal)}</div>
              </div>
              <div>
                <div className="text-sm text-white/60">Shipping fee</div>
                <div className="text-xl text-price">{formatPHP(adminShippingFee)}</div>
              </div>
              <div>
                <div className="text-sm text-white/60">Discount</div>
                <div className="text-xl text-white">-{formatPHP(adminDiscountAmount)}</div>
              </div>
              <div>
                <div className="text-sm text-white/60">Suggested total</div>
                <div className="text-xl text-price">{formatPHP(adminSuggestedTotal)}</div>
              </div>
              <div>
                <div className="text-sm text-white/60">Final price</div>
                <div className="text-xl text-price">{formatPHP(adminFinalPrice)}</div>
                {adminHasManualFinalPrice ? (
                  <div className="text-xs text-white/50">
                    Adjustment {adminManualAdjustment > 0 ? "+" : ""}
                    {formatPHP(adminManualAdjustment)}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-sm text-white/60">Selected subtotal</div>
              <div className="text-xl text-price">
                {formatPHP(selectedSubtotal)}
              </div>
            </div>
          )}
          {isAdminMode ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => void onGenerateAdminInvoice()}
                disabled={
                  selectedLines.length === 0 ||
                  generatingInvoice ||
                  !fbCustomerName.trim() ||
                  !adminShippingMeta.ok
                }
              >
                {generatingInvoice ? "Generating..." : "Generate invoice PDF"}
              </Button>
              <Button
                onClick={() => void onSoldAsPos()}
                disabled={adminSoldDisabled}
              >
                {sellingAsPos ? "Selling..." : "Sold"}
              </Button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[320px]">
              <Button
                variant="secondary"
                onClick={() => setFacebookCheckoutOpen(true)}
                disabled={facebookCheckoutDisabled}
                className="w-full"
              >
                Checkout via Facebook
              </Button>
              {checkoutDisabled ? (
                <Button disabled className="w-full">
                  Proceed to checkout
                </Button>
              ) : (
                <Link href={checkoutHref} className="w-full">
                  <Button className="w-full">Proceed to checkout</Button>
                </Link>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {completeSetProducts.length ? (
        <Card>
          <CardHeader>
            <div className="font-semibold">Complete your set</div>
            <div className="text-sm text-white/60">
              Suggestions based on your cart items.
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {completeSetProducts.map((item) => (
                <ProductCard
                  key={item.key}
                  product={item}
                  showPrices={shopControls.showPrices}
                  canAddToCart={shopControls.allowAddToCart}
                  mobileVariant="diecast"
                  onAddToCart={(opt) => onAddSuggestion(item, opt)}
                  onRelatedAddToCart={(related, opt) =>
                    onAddSuggestion(related, opt)
                  }
                  relatedPool={shopProducts}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {previewLine
        ? renderPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
              <button
                type="button"
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setPreviewLine(null)}
                aria-label="Close preview"
              />
              <div
                role="dialog"
                aria-modal="true"
                className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-bg-900/95 p-5 shadow-soft"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-white/50">
                      {formatTitle("Item preview")}
                    </div>
                    <div className="text-lg font-semibold">
                      {previewLine.variant.product.title}
                    </div>
                    <div className="text-sm text-white/60">
                      {previewLine.variant.product.brand ?? "-"}
                      {previewLine.variant.product.model
                        ? ` - ${previewLine.variant.product.model}`
                        : ""}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewLine(null)}
                  >
                    Close
                  </Button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr]">
                  <div className="rounded-xl border border-white/10 bg-bg-950/50 p-3">
                    {activeImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getOptimizedImageUrl(activeImage, {
                          width: 1000,
                          quality: 75,
                          format: "webp",
                        })}
                        srcSet={buildSrcSet(activeImage, [480, 720, 1000], {
                          quality: 75,
                          format: "webp",
                        })}
                        sizes="(min-width: 1024px) 560px, 90vw"
                        alt=""
                        className="h-64 w-full rounded-lg object-contain"
                        loading="lazy"
                        decoding="async"
                        onError={(e) =>
                          applyImageFallback(e.currentTarget, activeImage)
                        }
                      />
                    ) : (
                      <div className="flex h-64 items-center justify-center text-sm text-white/50">
                        No image available.
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/10 bg-bg-950/40 p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/60">Condition</span>
                        <span className="text-white/90">
                          {formatConditionLabel(previewCondition, {
                            upper: true,
                            shipClass: previewLine.variant.ship_class,
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/60">Price</span>
                        <span className="text-price">
                          {previewStrikePrice ? (
                            <span className="flex items-baseline gap-2">
                              <span>{previewPrice}</span>
                              <span className="text-[11px] text-white/40 line-through">
                                {previewStrikePrice}
                              </span>
                            </span>
                          ) : (
                            previewPrice
                          )}
                        </span>
                      </div>
                      {(() => {
                        const previewProtectorEligible = isProtectorEligibleShipClass(
                          previewLine.variant.ship_class
                        );
                        const previewProtectorKind = protectorKindFromShipClass(
                          previewLine.variant.ship_class
                        );
                        const previewProtectorSelected = Boolean(
                          previewLine.protector_selected
                        );
                        const previewRemaining = previewProtectorKind
                          ? protectorRemainingByKind[previewProtectorKind]
                          : 0;
                        const previewCanToggle =
                          previewProtectorEligible &&
                          (previewProtectorSelected ||
                            previewRemaining >= previewLine.qty);
                        return previewProtectorEligible ? (
                          <label className="mt-2 inline-flex items-center gap-2 text-xs text-white/70">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={previewProtectorSelected}
                              disabled={!previewCanToggle}
                              onChange={(e) => {
                                if (e.target.checked && !previewCanToggle) {
                                  toast({
                                    title: "No protectors left",
                                    message: "Protector stock is sold out.",
                                  });
                                  return;
                                }
                                updateProtector(
                                  previewLine.id,
                                  e.target.checked
                                );
                              }}
                            />
                            Protector add-on ({formatPHP(PROTECTOR_ADDON_FEE)})
                          </label>
                        ) : null;
                      })()}
                      {previewUnifiedNotes ? (
                        <div className={`text-sm ${previewNoteTone} flex items-center gap-2`}>
                          {showPreviewIndicator ? (
                            <span
                              className={`h-2 w-2 rounded-full ${previewIndicatorTone}`}
                              aria-hidden="true"
                            />
                          ) : null}
                          <span>Notes: {previewUnifiedNotes}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
                      Photos are for reference only (may not be the exact
                      on-hand item). For more photos/details, please message our
                      Facebook page.
                    </div>

                    <div className="rounded-xl border border-white/10 bg-bg-950/40 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                        Photos
                      </div>
                      {previewImages.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {previewImages.map((img, index) => (
                            <button
                              key={`${img}-${index}`}
                              type="button"
                              onClick={() => setActiveImage(img)}
                              className={`h-16 w-16 overflow-hidden rounded-lg border transition ${
                                activeImage === img
                                  ? "border-accent-400/80"
                                  : "border-white/10"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={getOptimizedImageUrl(img, {
                                  width: 160,
                                  quality: 70,
                                  format: "webp",
                                })}
                                srcSet={buildSrcSet(img, [96, 120, 160], {
                                  quality: 70,
                                  format: "webp",
                                })}
                                sizes="64px"
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                                onError={(e) =>
                                  applyImageFallback(e.currentTarget, img)
                                }
                              />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-white/50">
                          No additional photos.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
          )
        : null}

      {!isAdminMode ? (
        <ModalShell
          open={facebookCheckoutOpen}
          onClose={closeFacebookCheckoutModal}
          title="Checkout via Facebook"
          description="Fill in your shipping details, then submit the order so it appears in admin for approval. You can still download the snapshot or continue in Messenger."
          width="lg"
          footer={
            <div className="grid gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-row">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={
                    facebookCheckoutDisabled ||
                    downloadingFacebookSnapshot ||
                    creatingFacebookOrder ||
                    openingFacebookMessenger ||
                    !facebookSnapshotPreviewUrl
                  }
                  className="min-w-0"
                  onClick={() => void onOpenFacebookMessenger()}
                  aria-label="Message Odd Wheels in Facebook Messenger"
                >
                  {openingFacebookMessenger ? (
                    "Opening..."
                  ) : (
                    <>
                      <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="sm:hidden">Messenger</span>
                      <span className="hidden sm:inline">Message Odd Wheels</span>
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void onDownloadFacebookSnapshot()}
                  disabled={
                    facebookCheckoutDisabled ||
                    downloadingFacebookSnapshot ||
                    creatingFacebookOrder ||
                    openingFacebookMessenger
                  }
                  className="min-w-0"
                  aria-label="Download checkout snapshot"
                >
                  {downloadingFacebookSnapshot
                    ? "Preparing..."
                    : (
                      <>
                        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="sm:hidden">Snapshot</span>
                        <span className="hidden sm:inline">Download snapshot</span>
                      </>
                    )}
                </Button>
              </div>
              <div className="grid gap-2 sm:flex sm:w-auto sm:flex-row">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeFacebookCheckoutModal}
                  disabled={creatingFacebookOrder}
                  className="hidden sm:inline-flex"
                >
                  Close
                </Button>
                <Button
                  onClick={() => void onCreateFacebookOrder()}
                  disabled={
                    facebookCheckoutDisabled ||
                    downloadingFacebookSnapshot ||
                    creatingFacebookOrder ||
                    openingFacebookMessenger
                  }
                  className="w-full sm:w-auto"
                >
                  {creatingFacebookOrder
                    ? "Submitting order..."
                    : "Submit Order"}
                </Button>
              </div>
            </div>
          }
        >
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Customer Name"
                  value={facebookCheckoutForm.customerName}
                  onChange={(event) =>
                    setFacebookCheckoutForm((prev) => ({
                      ...prev,
                      customerName: event.target.value,
                    }))
                  }
                  placeholder="Full name"
                />
                <Input
                  label="Contact Number"
                  value={facebookCheckoutForm.contactNumber}
                  onChange={(event) =>
                    setFacebookCheckoutForm((prev) => ({
                      ...prev,
                      contactNumber: sanitizePhone(event.target.value),
                    }))
                  }
                  placeholder="09xxxxxxxxx"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Shipping Courier"
                  value={facebookCheckoutForm.shippingMethod}
                  onChange={(event) =>
                    setFacebookCheckoutForm((prev) => ({
                      ...prev,
                      shippingMethod: normalizeAdminShippingMethod(event.target.value),
                    }))
                  }
                >
                  {adminCourierOptions.map((method) => (
                    <option key={method} value={method}>
                      {formatFacebookCheckoutMethodLabel(method)}
                    </option>
                  ))}
                </Select>

                {facebookCheckoutForm.shippingMethod === "LBC" ||
                facebookCheckoutForm.shippingMethod === "JNT" ? (
                  <Select
                    label="Shipping Region"
                    value={facebookCheckoutForm.shippingRegion}
                    onChange={(event) =>
                      setFacebookCheckoutForm((prev) => ({
                        ...prev,
                        shippingRegion: normalizeAdminRegion(event.target.value),
                      }))
                    }
                  >
                    <option value="METRO_MANILA">NCR / Metro Manila</option>
                    <option value="LUZON">Luzon</option>
                    <option value="VISAYAS">Visayas</option>
                    <option value="MINDANAO">Mindanao</option>
                  </Select>
                ) : (
                  <Input
                    label="Shipping Region"
                    value={
                      facebookCheckoutForm.shippingMethod === "PICKUP"
                        ? "Not required for pickup"
                        : "Not required"
                    }
                    disabled
                  />
                )}
              </div>

              {facebookCheckoutForm.shippingMethod === "LBC" ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="LBC Branch Name"
                      value={facebookCheckoutForm.lbcBranchName}
                      onChange={(event) =>
                        setFacebookCheckoutForm((prev) => ({
                          ...prev,
                          lbcBranchName: event.target.value,
                        }))
                      }
                    />
                    <Input
                      label="Branch City"
                      value={facebookCheckoutForm.lbcBranchCity}
                      onChange={(event) =>
                        setFacebookCheckoutForm((prev) => ({
                          ...prev,
                          lbcBranchCity: event.target.value,
                        }))
                      }
                      list={FACEBOOK_LBC_BRANCH_CITY_DATALIST_ID}
                      hint={
                        facebookLbcBranchCitySuggestions.length
                          ? `Suggested cities for ${formatAdminRegionLabel(
                              facebookCheckoutForm.shippingRegion
                            )} branch rates.`
                          : undefined
                      }
                    />
                    <datalist id={FACEBOOK_LBC_BRANCH_CITY_DATALIST_ID}>
                      {facebookLbcBranchCitySuggestions.map((city) => (
                        <option key={`${facebookCheckoutForm.shippingRegion}-${city}`} value={city} />
                      ))}
                    </datalist>
                  </div>
                  <Select
                    label="LBC Package"
                    value={facebookCheckoutForm.lbcPackage}
                    onChange={(event) =>
                      setFacebookCheckoutForm((prev) => ({
                        ...prev,
                        lbcPackage: normalizeAdminLbcPackage(event.target.value),
                      }))
                    }
                    disabled={!adminLbcPackageOptions.length}
                    hint={facebookLbcPackageHint}
                  >
                    {adminLbcPackageOptions.length ? (
                      adminLbcPackageOptions.map((pack) => (
                        <option key={pack} value={pack}>
                          {formatLbcPackageLabel(pack)}
                        </option>
                      ))
                    ) : (
                      <option value="">No valid LBC package</option>
                    )}
                  </Select>
                </div>
              ) : null}

              {facebookCheckoutForm.shippingMethod === "JNT" ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="House / Street / Unit"
                      value={facebookCheckoutForm.jntHouseStreetUnit}
                      onChange={(event) =>
                        setFacebookCheckoutForm((prev) => ({
                          ...prev,
                          jntHouseStreetUnit: event.target.value,
                        }))
                      }
                    />
                    <Input
                      label="Barangay"
                      value={facebookCheckoutForm.jntBarangay}
                      onChange={(event) =>
                        setFacebookCheckoutForm((prev) => ({
                          ...prev,
                          jntBarangay: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Input
                      label="City"
                      value={facebookCheckoutForm.jntCity}
                      onChange={(event) =>
                        setFacebookCheckoutForm((prev) => ({
                          ...prev,
                          jntCity: event.target.value,
                        }))
                      }
                    />
                    <Input
                      label="Province"
                      value={facebookCheckoutForm.jntProvince}
                      onChange={(event) =>
                        setFacebookCheckoutForm((prev) => ({
                          ...prev,
                          jntProvince: event.target.value,
                        }))
                      }
                    />
                    <Input
                      label="Postal Code"
                      value={facebookCheckoutForm.jntPostalCode}
                      onChange={(event) =>
                        setFacebookCheckoutForm((prev) => ({
                          ...prev,
                          jntPostalCode: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <Select
                    label="J&T Pouch"
                    value={facebookCheckoutForm.jntPouch}
                    onChange={(event) =>
                      setFacebookCheckoutForm((prev) => ({
                        ...prev,
                        jntPouch: normalizeAdminJntPouch(event.target.value),
                      }))
                    }
                    disabled={!adminAvailableJntPouches.length}
                    hint={facebookJntPouchHint}
                  >
                    {adminAvailableJntPouches.length ? (
                      adminAvailableJntPouches.map((pouch) => (
                        <option key={pouch} value={pouch}>
                          {formatJntPouchLabel(pouch)}
                        </option>
                      ))
                    ) : (
                      <option value="">No valid J&T pouch</option>
                    )}
                  </Select>
                </div>
              ) : null}

              {facebookCheckoutForm.shippingMethod === "LALAMOVE" ? (
                <Textarea
                  label="Lalamove Drop-off Address / Landmark"
                  value={facebookCheckoutForm.lalamoveAddress}
                  onChange={(event) =>
                    setFacebookCheckoutForm((prev) => ({
                      ...prev,
                      lalamoveAddress: event.target.value,
                    }))
                  }
                  placeholder="Complete address, landmark, and delivery notes"
                  hint="Lalamove delivery fee will be coordinated in Messenger."
                />
              ) : null}

              {facebookCheckoutForm.shippingMethod === "PICKUP" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-sm font-medium text-white">Pickup location</div>
                    <div className="mt-1 text-sm text-white/70">{PICKUP_LOCATION}</div>
                    <div className="mt-1 text-xs text-white/50">
                      Directory: {PICKUP_DIRECTORY}
                    </div>
                  </div>
                  {pickupUnavailable ? (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      Pickup is currently unavailable.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Select
                        label="Pickup Day"
                        value={facebookCheckoutForm.pickupDay}
                        onChange={(event) =>
                          setFacebookCheckoutForm((prev) => ({
                            ...prev,
                            pickupDay: event.target.value,
                          }))
                        }
                        disabled={!pickupDayOptions.length}
                      >
                        <option value="">Select a day</option>
                        {pickupDayOptions.map((day) => (
                          <option key={day.key} value={day.key}>
                            {day.label}
                          </option>
                        ))}
                      </Select>
                      <Select
                        label="Pickup Timeslot"
                        value={facebookCheckoutForm.pickupSlot}
                        onChange={(event) =>
                          setFacebookCheckoutForm((prev) => ({
                            ...prev,
                            pickupSlot: event.target.value,
                          }))
                        }
                        disabled={
                          !facebookCheckoutForm.pickupDay || !pickupSlotsForDay.length
                        }
                      >
                        <option value="">Select a timeslot</option>
                        {pickupSlotsForDay.map((slot) => (
                          <option key={slot} value={slot}>
                            {slot}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>
              ) : null}

              <Textarea
                label="Order Notes"
                value={facebookCheckoutForm.notes}
                onChange={(event) =>
                  setFacebookCheckoutForm((prev) => ({
                    ...prev,
                    notes: event.target.value,
                  }))
                }
                placeholder="Optional notes for your Facebook checkout"
              />

              {facebookCheckoutErrors.length ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {facebookCheckoutErrors[0]}
                </div>
              ) : (
                <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                  Fill in the required details and the preview will build automatically.
                  You can then download it or attach it in Messenger.
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                {facebookSnapshotPreviewUrl || downloadingFacebookSnapshot ? (
                  <>
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
                      Snapshot Preview
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {facebookCheckoutSummary.customerName || "Your order"}
                    </div>
                    <div className="mt-1 text-sm text-white/65">
                      {facebookCheckoutSummary.shippingMethodLabel}
                    </div>
                    <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/30">
                      {facebookSnapshotPreviewUrl ? (
                        <img
                          src={facebookSnapshotPreviewUrl}
                          alt="Facebook checkout snapshot preview"
                          className="block h-auto w-full"
                        />
                      ) : (
                        <div className="flex min-h-[18rem] items-center justify-center px-6 py-10 text-center text-sm text-white/50">
                          Preparing your checkout snapshot preview...
                        </div>
                      )}
                    </div>
                    {facebookSnapshotPreviewUrl ? (
                      <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
                        Download this snapshot or attach the preview image in Messenger.
                        {facebookSnapshotFileName ? ` File: ${facebookSnapshotFileName}` : ""}
                      </div>
                    ) : null}
                    <div className="mt-2 space-y-1 text-xs text-white/55">
                      {facebookCheckoutSummary.shippingLines.slice(0, 4).map((line, index) => (
                        <div key={`${line}-${index}`}>{line}</div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>

            </div>
          </div>
        </ModalShell>
      ) : null}
    </main>
  );
}

export default function CartPage() {
  return (
    <CartContent />
  );
}
