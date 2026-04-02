"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useCart, type CartLine } from "@/hooks/useCart";
import ProductCard, { type ShopProduct } from "@/components/ProductCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatPHP } from "@/lib/money";
import { useBuyerProducts } from "@/hooks/useBuyerProducts";
import { useBuyerShopProducts } from "@/hooks/useBuyerShopProducts";
import { recommendSimilar } from "@/lib/recommendations";
import { formatConditionLabel } from "@/lib/conditions";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "@/components/ui/toast";
import { resolveEffectivePrice } from "@/lib/pricing";
import { formatTitle } from "@/lib/text";
import { applyImageFallback, buildSrcSet, getOptimizedImageUrl } from "@/lib/imageUrl";
import {
  PROTECTOR_ADDON_FEE,
  isProtectorEligibleShipClass,
  protectorKindFromShipClass,
  protectorUnitFee,
} from "@/lib/addons";
import { supabase } from "@/lib/supabase/browser";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/components/auth/AuthProvider";

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
  items: CartInvoiceItem[];
  totalQty: number;
  totalLines: number;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
};

type InvoicePdfRenderOptions = {
  includeImages: boolean;
  imageQuality: number;
  maxImageDimension: number;
  photoSize: number;
};

const MAX_PDF_DOWNLOAD_BYTES = 24 * 1024 * 1024;
const CART_INVOICE_RENDER_STAGES: InvoicePdfRenderOptions[] = [
  { includeImages: true, imageQuality: 0.68, maxImageDimension: 900, photoSize: 42 },
  { includeImages: true, imageQuality: 0.55, maxImageDimension: 720, photoSize: 40 },
  { includeImages: true, imageQuality: 0.42, maxImageDimension: 560, photoSize: 38 },
  { includeImages: true, imageQuality: 0.32, maxImageDimension: 420, photoSize: 36 },
  { includeImages: false, imageQuality: 0.28, maxImageDimension: 360, photoSize: 34 },
];

function sanitizeFileName(value: string) {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").trim();
  return cleaned || "customer";
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
    const scale =
      Math.max(srcW, srcH) > options.maxImageDimension
        ? options.maxImageDimension / Math.max(srcW, srcH)
        : 1;
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return await blobToDataUrl(blob);
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);
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

async function buildAdminCartInvoicePdfBlob(
  payload: CartInvoicePayload,
  imageCache: Map<string, string | null>,
  now: Date,
  options: InvoicePdfRenderOptions
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const generatedAt = now.toLocaleString("en-PH");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 42;
  const marginTop = 42;
  const marginBottom = 48;

  const photoLeft = marginX;
  const photoSize = options.photoSize;
  const nameLeft = photoLeft + photoSize + 12;
  const qtyCenter = pageWidth - 120;
  const amountRight = pageWidth - marginX;
  const nameMaxWidth = qtyCenter - 24 - nameLeft;

  const drawMeta = (continued: boolean) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(20, 20, 20);
    doc.text("ODD WHEELS", marginX, marginTop);

    doc.setFontSize(12);
    doc.text(
      continued ? "FB Cart Invoice (Continued)" : "FB Cart Invoice",
      marginX,
      marginTop + 20
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    doc.text(`Generated: ${generatedAt}`, pageWidth - marginX, marginTop, {
      align: "right",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    const nameLines = doc.splitTextToSize(
      `Customer: ${payload.customerName}`,
      pageWidth - marginX * 2
    );
    doc.text(nameLines, marginX, marginTop + 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    doc.text(`Courier: ${formatCourierLabel(payload.shippingMethod)}`, marginX, marginTop + 66);
    if (payload.shippingDetails) {
      const detailsLines = doc.splitTextToSize(
        `Shipping details: ${payload.shippingDetails}`,
        pageWidth - marginX * 2
      );
      doc.text(detailsLines, marginX, marginTop + 79);
    }
    doc.text("Source: Admin > Cart (FB checkout)", marginX, marginTop + 92);
  };

  const drawTableHeader = (topY: number) => {
    doc.setDrawColor(220, 220, 220);
    doc.line(marginX, topY, pageWidth - marginX, topY);

    const textY = topY + 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(35, 35, 35);
    doc.text("Photo", photoLeft, textY);
    doc.text("Product", nameLeft, textY);
    doc.text("Qty", qtyCenter, textY, { align: "center" });
    doc.text("Amount", amountRight, textY, { align: "right" });
    doc.line(marginX, textY + 6, pageWidth - marginX, textY + 6);
    return textY + 6;
  };

  drawMeta(false);
  let y = drawTableHeader(148) + 8;

  if (payload.items.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(70, 70, 70);
    doc.text("No selected cart items.", marginX, y + 18);
    y += 36;
  } else {
    for (const item of payload.items) {
      const productName = item.name?.trim() || "Item";
      const nameLines = doc.splitTextToSize(productName, nameMaxWidth);
      const details: string[] = [];
      if (item.condition) details.push(`Condition: ${item.condition}`);
      if (item.notes) details.push(`Notes: ${item.notes}`);
      const detailLines = details.flatMap((line) =>
        doc.splitTextToSize(line, nameMaxWidth)
      );
      const nameHeight =
        nameLines.length * 11 + (detailLines.length ? detailLines.length * 10 + 4 : 0);
      const rowHeight = Math.max(photoSize + 10, nameHeight + 12);

      if (y + rowHeight + 90 > pageHeight - marginBottom) {
        doc.addPage();
        drawMeta(true);
        y = drawTableHeader(148) + 8;
      }

      doc.setDrawColor(235, 235, 235);
      doc.line(marginX, y + rowHeight, pageWidth - marginX, y + rowHeight);

      if (options.includeImages && item.imageUrl) {
        const dataUrl = await loadImageDataUrl(item.imageUrl, imageCache, options);
        if (dataUrl) {
          doc.addImage(
            dataUrl,
            imageFormatForDataUrl(dataUrl),
            photoLeft,
            y + 4,
            photoSize,
            photoSize,
            undefined,
            "FAST"
          );
        } else {
          doc.setDrawColor(215, 215, 215);
          doc.rect(photoLeft, y + 4, photoSize, photoSize);
        }
      } else {
        doc.setDrawColor(215, 215, 215);
        doc.rect(photoLeft, y + 4, photoSize, photoSize);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 15, 15);
      doc.text(nameLines, nameLeft, y + 14);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(90, 90, 90);
      doc.text(detailLines, nameLeft, y + 14 + nameLines.length * 11 + 1);

      const numbersY = y + rowHeight / 2 + 3;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
      doc.text(String(item.qty), qtyCenter, numbersY, { align: "center" });
      doc.text(pdfMoney(item.amount), amountRight, numbersY, { align: "right" });

      y += rowHeight;
    }
  }

  if (y + 104 > pageHeight - marginBottom) {
    doc.addPage();
    drawMeta(true);
    y = 158;
  }

  doc.setDrawColor(220, 220, 220);
  doc.line(marginX, y + 10, pageWidth - marginX, y + 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text("Totals", marginX, y + 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Total qty: ${payload.totalQty}`, marginX, y + 48);
  doc.text(`Total lines: ${payload.totalLines}`, marginX, y + 64);
  doc.text(`Subtotal: ${pdfMoney(payload.subtotalAmount)}`, pageWidth - marginX, y + 30, {
    align: "right",
  });
  if (payload.discountAmount > 0) {
    doc.text(`Discount: -${pdfMoney(payload.discountAmount)}`, pageWidth - marginX, y + 46, {
      align: "right",
    });
  }
  doc.setFont("helvetica", "bold");
  doc.text(
    `Total amount: ${pdfMoney(payload.totalAmount)}`,
    pageWidth - marginX,
    y + (payload.discountAmount > 0 ? 64 : 48),
    {
      align: "right",
    }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "Generated from current selected cart items in Admin mode.",
    marginX,
    pageHeight - 26
  );

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

function CartContent() {
  const { lines, loading, updateQty, updateProtector, remove, add, reload, isLoggedIn } =
    useCart();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const isAdminUser = profile?.role === "admin";
  const isAdminMode = isAdminUser;
  const { settings } = useSettings();
  const selectAllRef = React.useRef<HTMLInputElement>(null);
  const invoiceImageCacheRef = React.useRef(new Map<string, string | null>());

  const { products: allProducts } = useBuyerProducts({ brand: "all" });
  const { products: shopProducts } = useBuyerShopProducts({ brand: "all" });

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [previewLine, setPreviewLine] = React.useState<CartLine | null>(null);
  const [activeImage, setActiveImage] = React.useState("");
  const [unsealedAck, setUnsealedAck] = React.useState(false);
  const [fbCustomerName, setFbCustomerName] = React.useState("");
  const [fbShippingMethod, setFbShippingMethod] = React.useState("LBC");
  const [fbShippingDetails, setFbShippingDetails] = React.useState("");
  const [fbDiscountType, setFbDiscountType] = React.useState<"AMOUNT" | "PERCENT">(
    "AMOUNT"
  );
  const [fbDiscountValue, setFbDiscountValue] = React.useState("");
  const [sellingAsPos, setSellingAsPos] = React.useState(false);
  const [generatingInvoice, setGeneratingInvoice] = React.useState(false);
  const [clearingCart, setClearingCart] = React.useState(false);

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
      return normalized === "sealed" || normalized === "sealed_blister";
    };
    return lines.some((line) => !isSealed(line.variant.condition));
  }, [lines]);
  const hasNonSealedSelected = React.useMemo(() => {
    const isSealed = (value: string | null | undefined) => {
      const normalized = String(value ?? "").toLowerCase().trim();
      return normalized === "sealed" || normalized === "sealed_blister";
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
  const selectedSubtotal = selectedLines.reduce((acc, l) => {
    const addOn = protectorUnitFee(
      l.variant.ship_class,
      Boolean(l.protector_selected)
    );
    return acc + (lineUnitPrice(l) + addOn) * l.qty;
  }, 0);
  const adminDiscountBase = parseNumberInput(fbDiscountValue);
  const adminDiscountAmount =
    fbDiscountType === "PERCENT"
      ? Math.min(
          selectedSubtotal,
          Math.max(0, (selectedSubtotal * Math.min(100, adminDiscountBase)) / 100)
        )
      : Math.min(selectedSubtotal, Math.max(0, adminDiscountBase));
  const adminTotalAfterDiscount = Math.max(0, selectedSubtotal - adminDiscountAmount);
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
    selectedLines.length === 0 || (!isAdminMode && hasNonSealedSelected && !unsealedAck);
  const adminSoldDisabled =
    selectedLines.length === 0 ||
    !fbCustomerName.trim() ||
    !fbShippingMethod.trim() ||
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
        shippingDetails?: string;
        discountType?: "AMOUNT" | "PERCENT";
        discountValue?: string;
      };
      setFbCustomerName(String(parsed.customerName ?? "").trim());
      setFbShippingMethod(String(parsed.shippingMethod ?? "LBC").trim() || "LBC");
      setFbShippingDetails(String(parsed.shippingDetails ?? "").trim());
      setFbDiscountType(parsed.discountType === "PERCENT" ? "PERCENT" : "AMOUNT");
      setFbDiscountValue(String(parsed.discountValue ?? "").trim());
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
        shippingDetails: fbShippingDetails,
        discountType: fbDiscountType,
        discountValue: fbDiscountValue,
      })
    );
  }, [isAdminMode, fbCustomerName, fbShippingMethod, fbShippingDetails, fbDiscountType, fbDiscountValue]);

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

  async function onGenerateAdminInvoice() {
    if (!selectedLines.length) {
      alert("Select at least one cart item first.");
      return;
    }
    if (!fbCustomerName.trim()) {
      alert("Customer name is required.");
      return;
    }

    setGeneratingInvoice(true);
    try {
      const payload: CartInvoicePayload = {
        customerName: fbCustomerName.trim(),
        shippingMethod: fbShippingMethod.trim() || "LBC",
        shippingDetails: fbShippingDetails.trim(),
        items: selectedInvoiceItems,
        totalQty: selectedLines.reduce((sum, line) => sum + Math.max(1, Number(line.qty ?? 0)), 0),
        totalLines: selectedLines.length,
        subtotalAmount: selectedSubtotal,
        discountAmount: adminDiscountAmount,
        totalAmount: adminTotalAfterDiscount,
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

      const shippingMethod = fbShippingMethod.trim() || "LBC";
      const shippingText = fbShippingDetails.trim();
      const shippingDetails = {
        method: shippingMethod,
        text: shippingText || "FB checkout from admin cart",
        shipping_notes: shippingText || null,
        source: "admin_cart_checkout",
        admin_cart_checkout: true,
        discount:
          adminDiscountAmount > 0
            ? {
                type: fbDiscountType,
                value: adminDiscountBase,
                amount: adminDiscountAmount,
              }
            : null,
      };
      const items = selectedLines.map((line) => ({
        variant_id: line.variant_id,
        qty: Math.max(1, Math.trunc(Number(line.qty ?? 0))),
      }));

      const basePayload = {
        p_customer_name: customerName,
        p_customer_phone: "N/A",
        p_shipping_method: shippingMethod,
        p_shipping_details: shippingDetails,
        p_payment_method: "CASH",
        p_save_customer: false,
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

      if (adminDiscountAmount > 0) {
        const { error: discountError } = await supabase
          .from("orders")
          .update({
            discount_total: adminDiscountAmount,
            discount: adminDiscountAmount,
            total: adminTotalAfterDiscount,
          })
          .eq("id", orderId);
        if (discountError) throw discountError;
      }

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
  const isPreviewNearMint = previewCondition === "near_mint";
  const isPreviewWithIssues = previewCondition === "with_issues";
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
                value={fbCustomerName}
                onChange={(e) => setFbCustomerName(e.target.value)}
                required
              />
              <Select
                label="Shipping courier"
                value={fbShippingMethod}
                onChange={(e) => setFbShippingMethod(e.target.value)}
                required
              >
                <option value="LBC">LBC</option>
                <option value="J&T">J&amp;T</option>
                <option value="LALAMOVE">Lalamove</option>
                <option value="PICKUP">Pickup</option>
              </Select>
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
                const canInc = available > 0 && l.qty < available;
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
                              l.variant.condition === "with_issues"
                                ? "text-red-200/80"
                                : l.variant.condition === "near_mint"
                                  ? "text-amber-200/80"
                                  : "text-white/50";
                            const indicatorTone =
                              l.variant.condition === "with_issues"
                                ? "bg-red-400"
                                : l.variant.condition === "near_mint"
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
        <CardBody className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {isAdminMode ? (
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <div>
                <div className="text-sm text-white/60">Selected subtotal</div>
                <div className="text-xl text-price">{formatPHP(selectedSubtotal)}</div>
              </div>
              <div>
                <div className="text-sm text-white/60">Discount</div>
                <div className="text-xl text-white">-{formatPHP(adminDiscountAmount)}</div>
              </div>
              <div>
                <div className="text-sm text-white/60">Total after discount</div>
                <div className="text-xl text-price">{formatPHP(adminTotalAfterDiscount)}</div>
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
                  !fbCustomerName.trim()
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
          ) : checkoutDisabled ? (
            <Button disabled>Proceed to checkout</Button>
          ) : (
            <Link href={checkoutHref}>
              <Button>Proceed to checkout</Button>
            </Link>
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
    </main>
  );
}

export default function CartPage() {
  return (
    <CartContent />
  );
}
