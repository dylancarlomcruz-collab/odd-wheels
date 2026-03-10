"use client";

import * as React from "react";
import {
  BarChart3,
  Boxes,
  ChevronDown,
  ChevronUp,
  ClipboardPlus,
  FileDown,
  Layers,
  MousePointerClick,
  RefreshCw,
  ShoppingCart,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatConditionLabel } from "@/lib/conditions";
import {
  createPosHandoffId,
  makePosHandoffStorageKey,
  type PosHandoffPayload,
} from "@/lib/posHandoff";

type CartInsightRow = {
  key: string;
  name: string;
  condition: string;
  price: number;
  stock: number;
  qty: number;
  customers: number;
  latestAdded: string | null;
  imageUrl: string | null;
};

type CartInsightStat = {
  lines: number;
  customers: number;
  qty: number;
  variants: number;
};

type ProductClickRow = {
  product_id: string;
  clicks: number;
  last_clicked_at: string | null;
  product: {
    id: string;
    title: string;
    brand: string | null;
    model: string | null;
    variation: string | null;
    image_urls: string[] | null;
  } | null;
};

type VisitorItem = {
  variantId: string | null;
  name: string;
  qty: number;
  price: number;
  cogs: number;
  profit: number;
  imageUrl: string | null;
  condition: string | null;
  notes: string | null;
};

type VisitorRow = {
  id: string;
  kind: "ACCOUNT" | "GUEST";
  label: string;
  customerName: string;
  customerUsername: string;
  customerEmail: string;
  customerPhone: string;
  clicks: number;
  cartLines: number;
  cartQty: number;
  price: number;
  cogs: number;
  expectedProfit: number;
  items: VisitorItem[];
  lastActivity: string | null;
};

type AdminCustomerDetail = {
  id: string;
  name: string;
  username: string;
  email: string;
  contact: string;
};

function peso(n: number) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `PHP ${Math.round(n)}`;
  }
}

function pdfMoney(n: number) {
  const value = Number.isFinite(n) ? Math.round(n) : 0;
  try {
    return `PHP ${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(value)}`;
  } catch {
    return `PHP ${value}`;
  }
}

function buildItemLabel(product: any) {
  if (!product) return "Item";
  const title = String(product.title ?? "").trim();
  const brand = String(product.brand ?? "").trim();
  const model = String(product.model ?? "").trim();
  const variation = String(product.variation ?? "").trim();
  const base = title || [brand, model].filter(Boolean).join(" ");
  const label = [base, variation].filter(Boolean).join(" - ");
  return label || "Item";
}

function pickImage(product: any) {
  const urls = product?.image_urls;
  if (Array.isArray(urls) && urls.length) return String(urls[0]);
  return null;
}

function formatDateShort(value: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("en-PH");
  } catch {
    return "";
  }
}

function formatLogDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("en-PH");
}

function shortId(value: string) {
  if (!value) return "";
  return value.slice(0, 8);
}

function maxDate(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

async function loadAdminCustomerDetails(userIds: string[]) {
  if (!userIds.length) return new Map<string, AdminCustomerDetail>();

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? "";
  if (!token) {
    throw new Error("Not authenticated.");
  }

  const response = await fetch("/api/admin/carts/customers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userIds }),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    throw new Error(json?.error ?? "Failed to load customer details.");
  }

  const rows = Array.isArray(json?.rows) ? (json.rows as AdminCustomerDetail[]) : [];
  const map = new Map<string, AdminCustomerDetail>();
  rows.forEach((row) => {
    const id = String(row?.id ?? "").trim();
    if (!id) return;
    map.set(id, {
      id,
      name: String(row?.name ?? "").trim(),
      username: String(row?.username ?? "").trim(),
      email: String(row?.email ?? "").trim().toLowerCase(),
      contact: String(row?.contact ?? "").trim(),
    });
  });
  return map;
}

function sortVisitorRowsByRecentActivity(a: VisitorRow, b: VisitorRow) {
  if (!a.lastActivity && !b.lastActivity) {
    return b.clicks - a.clicks || b.cartQty - a.cartQty;
  }
  if (!a.lastActivity) return 1;
  if (!b.lastActivity) return -1;
  return b.lastActivity.localeCompare(a.lastActivity) || b.clicks - a.clicks || b.cartQty - a.cartQty;
}

function sanitizeFileName(value: string) {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").trim();
  return cleaned || "customer";
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image data."));
    reader.readAsDataURL(blob);
  });
}

type InvoicePdfRenderOptions = {
  includeImages: boolean;
  imageQuality: number;
  maxImageDimension: number;
  photoSize: number;
};

const MAX_PDF_DOWNLOAD_BYTES = 24 * 1024 * 1024;
const INVOICE_PDF_RENDER_STAGES: InvoicePdfRenderOptions[] = [
  { includeImages: true, imageQuality: 0.68, maxImageDimension: 900, photoSize: 42 },
  { includeImages: true, imageQuality: 0.55, maxImageDimension: 720, photoSize: 40 },
  { includeImages: true, imageQuality: 0.42, maxImageDimension: 560, photoSize: 38 },
  { includeImages: true, imageQuality: 0.32, maxImageDimension: 420, photoSize: 36 },
  { includeImages: false, imageQuality: 0.28, maxImageDimension: 360, photoSize: 34 },
];

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

async function buildCustomerInvoicePdfBlob(
  row: VisitorRow,
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

  const customerIdShort = shortId(row.id);
  const customerName = row.label?.trim() || `User ${customerIdShort}`;

  const drawMeta = (continued: boolean) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(20, 20, 20);
    doc.text("ODD WHEELS", marginX, marginTop);

    doc.setFontSize(12);
    doc.text(
      continued ? "Customer Cart Invoice (Continued)" : "Customer Cart Invoice",
      marginX,
      marginTop + 20
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    doc.text(`Generated: ${generatedAt}`, pageWidth - marginX, marginTop, {
      align: "right",
    });
    doc.text(`Customer ID: ${customerIdShort}`, pageWidth - marginX, marginTop + 14, {
      align: "right",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    const nameLines = doc.splitTextToSize(
      `Customer: ${customerName}`,
      pageWidth - marginX * 2
    );
    doc.text(nameLines, marginX, marginTop + 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    const activityLabel = row.lastActivity ? formatLogDate(row.lastActivity) : "N/A";
    doc.text(`Last activity: ${activityLabel}`, marginX, marginTop + 66);
    doc.text("Source: Admin Cart Insights current snapshot", marginX, marginTop + 79);
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
  let y = drawTableHeader(136) + 8;

  if (row.items.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(70, 70, 70);
    doc.text("No cart items found for this customer.", marginX, y + 18);
    y += 36;
  } else {
    for (const item of row.items) {
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
        y = drawTableHeader(136) + 8;
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
      doc.text(pdfMoney(item.price), amountRight, numbersY, { align: "right" });

      y += rowHeight;
    }
  }

  if (y + 88 > pageHeight - marginBottom) {
    doc.addPage();
    drawMeta(true);
    y = 146;
  }

  doc.setDrawColor(220, 220, 220);
  doc.line(marginX, y + 10, pageWidth - marginX, y + 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text("Totals", marginX, y + 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Total qty: ${row.cartQty}`, marginX, y + 48);
  doc.text(`Total lines: ${row.cartLines}`, marginX, y + 64);
  doc.text(`Total amount: ${pdfMoney(row.price)}`, pageWidth - marginX, y + 30, {
    align: "right",
  });

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "Generated from current cart data in Admin > Cart Insights.",
    marginX,
    pageHeight - 26
  );

  return doc.output("blob") as Blob;
}

async function exportCustomerInvoicePdf(
  row: VisitorRow,
  imageCache: Map<string, string | null>
) {
  const now = new Date();
  const customerIdShort = shortId(row.id);
  const customerName = row.label?.trim() || `User ${customerIdShort}`;
  const fileDate = now.toISOString().slice(0, 10);
  const fileName = `invoice-${sanitizeFileName(customerName)}-${customerIdShort}-${fileDate}.pdf`;

  let lastBlob: Blob | null = null;
  for (const stage of INVOICE_PDF_RENDER_STAGES) {
    const blob = await buildCustomerInvoicePdfBlob(row, imageCache, now, stage);
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

export default function AdminCartInsightsPage() {
  const [days, setDays] = React.useState("30");
  const [limit, setLimit] = React.useState("20");
  const [sortBy, setSortBy] = React.useState<"qty" | "customers">("qty");
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<CartInsightRow[]>([]);
  const [stats, setStats] = React.useState<CartInsightStat>({
    lines: 0,
    customers: 0,
    qty: 0,
    variants: 0,
  });
  const [topClicks, setTopClicks] = React.useState<ProductClickRow[]>([]);
  const [topClicksLoading, setTopClicksLoading] = React.useState(false);
  const [topClicksError, setTopClicksError] = React.useState<string | null>(null);
  const [customerRows, setCustomerRows] = React.useState<VisitorRow[]>([]);
  const [visitorRows, setVisitorRows] = React.useState<VisitorRow[]>([]);
  const [visitorLoading, setVisitorLoading] = React.useState(false);
  const [visitorError, setVisitorError] = React.useState<string | null>(null);
  const [showCustomerCarts, setShowCustomerCarts] = React.useState(false);
  const [expandedCustomerPanel, setExpandedCustomerPanel] = React.useState<string | null>(null);
  const [downloadingInvoicePanel, setDownloadingInvoicePanel] = React.useState<string | null>(null);
  const [sendingPosPanel, setSendingPosPanel] = React.useState<string | null>(null);
  const customerSectionRef = React.useRef<HTMLDivElement | null>(null);
  const invoiceImageCacheRef = React.useRef<Map<string, string | null>>(new Map());

  async function load() {
    setLoading(true);
    try {
      const daysNum = Math.max(0, Number.parseInt(days, 10) || 0);
      const rowLimit = 10000;

      let query = supabase
        .from("cart_items")
        .select(
          "id,user_id,variant_id,qty,created_at, variant:product_variants(id,condition,price,qty, product:products(id,title,brand,model,variation,image_urls))"
        )
        .order("created_at", { ascending: false })
        .limit(rowLimit);

      if (daysNum > 0) {
        const since = new Date();
        since.setDate(since.getDate() - daysNum);
        query = query.gte("created_at", since.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      const lines = (data as any[]) ?? [];
      const customerSet = new Set<string>();
      const map = new Map<string, CartInsightRow & { customersSet: Set<string> }>();
      let totalQty = 0;

      for (const line of lines) {
        const variant = line?.variant ?? null;
        const product = variant?.product ?? null;
        const qty = Number(line?.qty ?? 0);
        const userId = String(line?.user_id ?? "");
        const key = String(line?.variant_id ?? line?.id ?? "");
        if (!key) continue;

        totalQty += qty;
        if (userId) customerSet.add(userId);

        const current =
          map.get(key) ??
          ({
            key,
            name: buildItemLabel(product),
            condition: String(variant?.condition ?? ""),
            price: Number(variant?.price ?? 0),
            stock: Number(variant?.qty ?? 0),
            qty: 0,
            customers: 0,
            latestAdded: null,
            imageUrl: pickImage(product),
            customersSet: new Set<string>(),
          } as CartInsightRow & { customersSet: Set<string> });

        current.qty += qty;
        if (userId) current.customersSet.add(userId);

        const createdAt = line?.created_at ? String(line.created_at) : null;
        if (createdAt && (!current.latestAdded || createdAt > current.latestAdded)) {
          current.latestAdded = createdAt;
        }

        if (!current.name || current.name === "Item") {
          current.name = buildItemLabel(product);
        }
        if (!current.imageUrl) current.imageUrl = pickImage(product);

        map.set(key, current);
      }

      const aggregated = Array.from(map.values()).map((entry) => ({
        key: entry.key,
        name: entry.name,
        condition: entry.condition,
        price: entry.price,
        stock: entry.stock,
        qty: entry.qty,
        customers: entry.customersSet.size,
        latestAdded: entry.latestAdded,
        imageUrl: entry.imageUrl,
      }));

      setRows(aggregated);
      setStats({
        lines: lines.length,
        customers: customerSet.size,
        qty: totalQty,
        variants: aggregated.length,
      });
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to load cart insights");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!showCustomerCarts) return;
    customerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showCustomerCarts]);

  React.useEffect(() => {
    if (showCustomerCarts) return;
    setExpandedCustomerPanel(null);
  }, [showCustomerCarts]);

  const visibleRows = React.useMemo(() => {
    const ordered = [...rows].sort((a, b) => {
      if (sortBy === "customers") return b.customers - a.customers || b.qty - a.qty;
      return b.qty - a.qty || b.customers - a.customers;
    });
    const limitNum = Math.max(0, Number.parseInt(limit, 10) || 0);
    return limitNum > 0 ? ordered.slice(0, limitNum) : ordered;
  }, [rows, sortBy, limit]);

  async function loadTopClicks() {
    setTopClicksLoading(true);
    setTopClicksError(null);

    const { data, error } = await supabase
      .from("product_clicks")
      .select(
        "product_id,clicks,last_clicked_at,product:products(id,title,brand,model,variation,image_urls)"
      )
      .order("clicks", { ascending: false })
      .limit(10);

    if (error) {
      setTopClicksError(error.message || "Failed to load top clicks.");
      setTopClicks([]);
    } else {
      const normalized = (data as any[] | null)?.map((row) => ({
        ...row,
        product: Array.isArray(row.product)
          ? row.product[0] ?? null
          : row.product ?? null,
      }));
      setTopClicks((normalized as ProductClickRow[]) ?? []);
    }

    setTopClicksLoading(false);
  }

  async function loadVisitors() {
    setVisitorLoading(true);
    setVisitorError(null);

    try {
      const [cartRes, guestCartRes, userClickRes, guestClickRes] = await Promise.all([
        supabase
          .from("cart_items")
          .select(
            "id,user_id,variant_id,qty,created_at, variant:product_variants(id,condition,public_notes,cost,price,qty, product:products(id,title,brand,model,variation,image_urls))"
          )
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("guest_cart_items")
          .select(
            "session_id,variant_id,qty,updated_at, variant:product_variants(id,condition,public_notes,cost,price,qty, product:products(id,title,brand,model,variation,image_urls))"
          )
          .order("updated_at", { ascending: false })
          .limit(5000),
        supabase
          .from("user_product_clicks")
          .select("user_id,clicks,last_clicked_at")
          .order("last_clicked_at", { ascending: false })
          .limit(5000),
        supabase
          .from("guest_product_clicks")
          .select("session_id,clicks,last_clicked_at")
          .order("last_clicked_at", { ascending: false })
          .limit(5000),
      ]);

      if (cartRes.error) throw cartRes.error;
      if (guestCartRes.error) throw guestCartRes.error;
      if (userClickRes.error) throw userClickRes.error;
      if (guestClickRes.error) throw guestClickRes.error;

      const cartLines = (cartRes.data as any[]) ?? [];
      const guestCartLines = (guestCartRes.data as any[]) ?? [];
      const userClicks = (userClickRes.data as any[]) ?? [];
      const guestClicks = (guestClickRes.data as any[]) ?? [];

      const userIds = new Set<string>();
      cartLines.forEach((line) => {
        const id = String(line?.user_id ?? "").trim();
        if (id) userIds.add(id);
      });
      userClicks.forEach((row) => {
        const id = String(row?.user_id ?? "").trim();
        if (id) userIds.add(id);
      });

      const sessionIds = new Set<string>();
      guestCartLines.forEach((line) => {
        const id = String(line?.session_id ?? "").trim();
        if (id) sessionIds.add(id);
      });
      guestClicks.forEach((row) => {
        const id = String(row?.session_id ?? "").trim();
        if (id) sessionIds.add(id);
      });

      const accountIds = Array.from(userIds);
      const [customerDetailsMap, guestSessionsRes] = await Promise.all([
        accountIds.length
          ? loadAdminCustomerDetails(accountIds).catch((error) => {
              console.warn("Failed to load admin customer details for cart insights.", error);
              return new Map<string, AdminCustomerDetail>();
            })
          : Promise.resolve(new Map<string, AdminCustomerDetail>()),
        sessionIds.size
          ? supabase
              .from("guest_sessions")
              .select("id,last_seen_at,created_at")
              .in("id", Array.from(sessionIds))
          : Promise.resolve({ data: [] }),
      ]);

      const guestSessions = (guestSessionsRes as any)?.data ?? [];

      const guestSessionMap = new Map<string, { last_seen_at?: string | null }>();
      guestSessions.forEach((row: any) => {
        if (!row?.id) return;
        guestSessionMap.set(String(row.id), {
          last_seen_at: row.last_seen_at ?? null,
        });
      });

      const userClickMap = new Map<string, { clicks: number; last: string | null }>();
      userClicks.forEach((row) => {
        const userId = String(row?.user_id ?? "").trim();
        if (!userId) return;
        const clicks = Number(row?.clicks ?? 0);
        const last = row?.last_clicked_at ? String(row.last_clicked_at) : null;
        const current = userClickMap.get(userId) ?? { clicks: 0, last: null };
        current.clicks += clicks;
        current.last = maxDate(current.last, last);
        userClickMap.set(userId, current);
      });

      const guestClickMap = new Map<string, { clicks: number; last: string | null }>();
      guestClicks.forEach((row) => {
        const sessionId = String(row?.session_id ?? "").trim();
        if (!sessionId) return;
        const clicks = Number(row?.clicks ?? 0);
        const last = row?.last_clicked_at ? String(row.last_clicked_at) : null;
        const current = guestClickMap.get(sessionId) ?? { clicks: 0, last: null };
        current.clicks += clicks;
        current.last = maxDate(current.last, last);
        guestClickMap.set(sessionId, current);
      });

      const authMap = new Map<
        string,
        VisitorRow & { itemMap: Map<string, VisitorItem> }
      >();
      for (const line of cartLines) {
        const userId = String(line?.user_id ?? "").trim();
        if (!userId) continue;
        const qty = Number(line?.qty ?? 0);
        const variant = line?.variant ?? null;
        const product = variant?.product ?? null;
        const itemName = buildItemLabel(product);
        const itemVariantId = variant?.id ? String(variant.id) : null;
        const itemImage = pickImage(product);
        const itemConditionRaw = String(variant?.condition ?? "").trim();
        const itemCondition = itemConditionRaw ? formatConditionLabel(itemConditionRaw) : null;
        const itemNotesRaw = String(variant?.public_notes ?? "").trim();
        const itemNotes = itemNotesRaw || null;
        const itemPrice = Number(variant?.price ?? 0) * qty;
        const itemCogs = Number(variant?.cost ?? 0) * qty;
        const itemProfit = itemPrice - itemCogs;
        const current =
          authMap.get(userId) ??
          ({
            id: userId,
            kind: "ACCOUNT",
            label: "",
            customerName: "",
            customerUsername: "",
            customerEmail: "",
            customerPhone: "",
            clicks: 0,
            cartLines: 0,
            cartQty: 0,
            price: 0,
            cogs: 0,
            expectedProfit: 0,
            items: [],
            lastActivity: null,
            itemMap: new Map<string, VisitorItem>(),
          } as VisitorRow & { itemMap: Map<string, VisitorItem> });

        current.cartLines += 1;
        current.cartQty += qty;
        current.price += itemPrice;
        current.cogs += itemCogs;
        current.expectedProfit += itemProfit;
        const itemKey =
          itemVariantId ?? `${itemName}::${itemCondition ?? ""}::${itemNotes ?? ""}`;
        const item =
          current.itemMap.get(itemKey) ??
          ({
            variantId: itemVariantId,
            name: itemName,
            qty: 0,
            price: 0,
            cogs: 0,
            profit: 0,
            imageUrl: itemImage,
            condition: itemCondition,
            notes: itemNotes,
          } as VisitorItem);
        item.qty += qty;
        item.price += itemPrice;
        item.cogs += itemCogs;
        item.profit += itemProfit;
        if (!item.imageUrl && itemImage) item.imageUrl = itemImage;
        if (!item.condition && itemCondition) item.condition = itemCondition;
        if (!item.notes && itemNotes) item.notes = itemNotes;
        current.itemMap.set(itemKey, item);
        current.lastActivity = maxDate(
          current.lastActivity,
          line?.created_at ? String(line.created_at) : null
        );
        authMap.set(userId, current);
      }

      const authRows: VisitorRow[] = [];
      const authIds = new Set<string>([...authMap.keys(), ...userClickMap.keys()]);
      authIds.forEach((userId) => {
        const base = authMap.get(userId) ?? ({
          id: userId,
          kind: "ACCOUNT",
          label: "",
          customerName: "",
          customerUsername: "",
          customerEmail: "",
          customerPhone: "",
          clicks: 0,
          cartLines: 0,
          cartQty: 0,
          price: 0,
          cogs: 0,
          expectedProfit: 0,
          items: [],
          lastActivity: null,
          itemMap: new Map<string, VisitorItem>(),
        } as VisitorRow & { itemMap: Map<string, VisitorItem> });
        const customerDetails = customerDetailsMap.get(userId);
        const customerName = customerDetails?.name?.trim() ?? "";
        const customerUsername = customerDetails?.username?.trim() ?? "";
        const customerEmail = customerDetails?.email?.trim() ?? "";
        const emailAlias =
          customerEmail && customerEmail.includes("@")
            ? customerEmail.split("@")[0]?.trim() ?? ""
            : "";
        const displayName =
          customerName ||
          customerUsername ||
          emailAlias ||
          `User ${shortId(userId)}`;
        const clickInfo = userClickMap.get(userId);
        base.label = displayName;
        base.customerName = customerName || displayName;
        base.customerUsername = customerUsername;
        base.customerEmail = customerEmail;
        base.customerPhone = customerDetails?.contact?.trim() ?? "";
        base.clicks = clickInfo?.clicks ?? 0;
        base.lastActivity = maxDate(base.lastActivity, clickInfo?.last ?? null);
        base.items = Array.from(base.itemMap.values()).sort(
          (a, b) => b.qty - a.qty || b.price - a.price || a.name.localeCompare(b.name)
        );
        authRows.push(base);
      });

      const guestMap = new Map<
        string,
        VisitorRow & { itemMap: Map<string, VisitorItem> }
      >();
      for (const line of guestCartLines) {
        const sessionId = String(line?.session_id ?? "").trim();
        if (!sessionId) continue;
        const qty = Number(line?.qty ?? 0);
        const variant = line?.variant ?? null;
        const product = variant?.product ?? null;
        const itemName = buildItemLabel(product);
        const itemVariantId = variant?.id ? String(variant.id) : null;
        const itemImage = pickImage(product);
        const itemConditionRaw = String(variant?.condition ?? "").trim();
        const itemCondition = itemConditionRaw ? formatConditionLabel(itemConditionRaw) : null;
        const itemNotesRaw = String(variant?.public_notes ?? "").trim();
        const itemNotes = itemNotesRaw || null;
        const itemPrice = Number(variant?.price ?? 0) * qty;
        const itemCogs = Number(variant?.cost ?? 0) * qty;
        const itemProfit = itemPrice - itemCogs;
        const current =
          guestMap.get(sessionId) ??
          ({
            id: sessionId,
            kind: "GUEST",
            label: "",
            customerName: "",
            customerUsername: "",
            customerEmail: "",
            customerPhone: "",
            clicks: 0,
            cartLines: 0,
            cartQty: 0,
            price: 0,
            cogs: 0,
            expectedProfit: 0,
            items: [],
            lastActivity: null,
            itemMap: new Map<string, VisitorItem>(),
          } as VisitorRow & { itemMap: Map<string, VisitorItem> });

        current.cartLines += 1;
        current.cartQty += qty;
        current.price += itemPrice;
        current.cogs += itemCogs;
        current.expectedProfit += itemProfit;
        const itemKey =
          itemVariantId ?? `${itemName}::${itemCondition ?? ""}::${itemNotes ?? ""}`;
        const item =
          current.itemMap.get(itemKey) ??
          ({
            variantId: itemVariantId,
            name: itemName,
            qty: 0,
            price: 0,
            cogs: 0,
            profit: 0,
            imageUrl: itemImage,
            condition: itemCondition,
            notes: itemNotes,
          } as VisitorItem);
        item.qty += qty;
        item.price += itemPrice;
        item.cogs += itemCogs;
        item.profit += itemProfit;
        if (!item.imageUrl && itemImage) item.imageUrl = itemImage;
        if (!item.condition && itemCondition) item.condition = itemCondition;
        if (!item.notes && itemNotes) item.notes = itemNotes;
        current.itemMap.set(itemKey, item);
        current.lastActivity = maxDate(
          current.lastActivity,
          line?.updated_at ? String(line.updated_at) : null
        );
        guestMap.set(sessionId, current);
      }

      const guestRows: VisitorRow[] = [];
      const guestIds = new Set<string>([
        ...guestMap.keys(),
        ...guestClickMap.keys(),
      ]);
      guestIds.forEach((sessionId) => {
        const base = guestMap.get(sessionId) ?? ({
          id: sessionId,
          kind: "GUEST",
          label: "",
          customerName: "",
          customerUsername: "",
          customerEmail: "",
          customerPhone: "",
          clicks: 0,
          cartLines: 0,
          cartQty: 0,
          price: 0,
          cogs: 0,
          expectedProfit: 0,
          items: [],
          lastActivity: null,
          itemMap: new Map<string, VisitorItem>(),
        } as VisitorRow & { itemMap: Map<string, VisitorItem> });
        const clickInfo = guestClickMap.get(sessionId);
        const sessionInfo = guestSessionMap.get(sessionId);
        base.label = `Guest ${shortId(sessionId)}`;
        base.customerName = "";
        base.customerUsername = "";
        base.customerEmail = "";
        base.customerPhone = "";
        base.clicks = clickInfo?.clicks ?? 0;
        base.lastActivity = maxDate(base.lastActivity, clickInfo?.last ?? null);
        base.lastActivity = maxDate(
          base.lastActivity,
          sessionInfo?.last_seen_at ?? null
        );
        base.items = Array.from(base.itemMap.values()).sort(
          (a, b) => b.qty - a.qty || b.price - a.price || a.name.localeCompare(b.name)
        );
        guestRows.push(base);
      });

      const accountOnly = authRows
        .filter((row) => row.cartLines > 0)
        .sort(sortVisitorRowsByRecentActivity);
      const guestOnly = guestRows.sort(sortVisitorRowsByRecentActivity);

      setCustomerRows(accountOnly);
      setVisitorRows(guestOnly);
    } catch (e: any) {
      console.error(e);
      setVisitorError(e?.message ?? "Failed to load visitor carts.");
      setCustomerRows([]);
      setVisitorRows([]);
    } finally {
      setVisitorLoading(false);
    }
  }

  async function handleDownloadCustomerInvoice(row: VisitorRow) {
    const panelKey = `${row.kind}-${row.id}`;
    setDownloadingInvoicePanel(panelKey);
    try {
      await exportCustomerInvoicePdf(row, invoiceImageCacheRef.current);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to generate invoice PDF.");
    } finally {
      setDownloadingInvoicePanel((current) => (current === panelKey ? null : current));
    }
  }

  function handleSendToPos(row: VisitorRow) {
    const panelKey = `${row.kind}-${row.id}`;
    setSendingPosPanel(panelKey);
    try {
      const items = row.items
        .map((item) => {
          const qty = Math.max(1, Math.round(Number(item.qty ?? 0)));
          const linePrice = Number(item.price ?? 0);
          const unitPrice = qty > 0 ? linePrice / qty : linePrice;
          return {
            variant_id: item.variantId,
            qty,
            title: item.name,
            image_url: item.imageUrl ?? null,
            condition: item.condition ?? null,
            unit_price: Number.isFinite(unitPrice) ? Math.max(0, unitPrice) : 0,
          };
        })
        .filter(
          (
            item
          ): item is {
            variant_id: string;
            qty: number;
            title: string;
            image_url: string | null;
            condition: string | null;
            unit_price: number;
          } =>
            Boolean(item.variant_id) && item.qty > 0
        );

      if (!items.length) {
        alert("No valid variant items found to send to POS.");
        return;
      }

      const handoffId = createPosHandoffId("admin-carts");
      const payload: PosHandoffPayload = {
        source: "admin-carts",
        created_at: new Date().toISOString(),
        customer: {
          id: row.kind === "ACCOUNT" ? row.id : null,
          name: row.customerName || row.label,
          phone: row.customerPhone || "",
        },
        items,
      };

      window.sessionStorage.setItem(
        makePosHandoffStorageKey(handoffId),
        JSON.stringify(payload)
      );
      window.location.assign(`/cashier/pos?handoff=${encodeURIComponent(handoffId)}`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to send cart to POS.");
    } finally {
      setSendingPosPanel((current) => (current === panelKey ? null : current));
    }
  }

  function refreshAll() {
    void load();
    void loadTopClicks();
    void loadVisitors();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xl font-semibold">
              <ShoppingCart className="h-5 w-5 text-amber-300" />
              Cart + Click Insights
            </div>
            <div className="text-sm text-white/60">
              See which items are most often left in carts and most clicked in the shop.
            </div>
          </div>
          <Badge className="border-amber-500/30 text-amber-200">{rows.length} items</Badge>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 sm:p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Cart lines</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
                  <ShoppingCart className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-amber-200">{stats.lines}</div>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomerCarts((prev) => !prev)}
              className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3 text-left transition hover:border-sky-400/50 hover:bg-sky-500/10 sm:p-4"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Customers</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-200">
                  <Users className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-sky-200">{stats.customers}</div>
              <div className="mt-1 text-xs text-sky-100/70">
                {showCustomerCarts ? "Hide customer carts" : "View customer carts"}
              </div>
            </button>
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3 sm:p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Total qty</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-200">
                  <Layers className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-violet-200">{stats.qty}</div>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 sm:p-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                <span>Variants</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                  <Boxes className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-emerald-200">{stats.variants}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
            <div className="flex items-center gap-2 font-semibold">
              <SlidersHorizontal className="h-4 w-4 text-sky-200" />
              Filters
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Input
                label="Lookback days"
                type="number"
                min={0}
                max={3650}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                hint="0 = all time"
                className="w-full sm:w-[160px]"
              />
              <Input
                label="Max items"
                type="number"
                min={0}
                max={200}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                hint="0 = show all"
                className="w-full sm:w-[160px]"
              />
              <Select
                label="Sort by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "qty" | "customers")}
                className="w-full sm:w-[200px]"
              >
                <option value="qty">Most qty in carts</option>
                <option value="customers">Most customers</option>
              </Select>
              <Button
                variant="secondary"
                onClick={refreshAll}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
            <div className="flex items-center gap-2 font-semibold">
              <BarChart3 className="h-4 w-4 text-amber-200" />
              Most in carts
            </div>
            <div className="mt-3 space-y-2">
              {loading ? (
                <div className="text-sm text-white/60">Loading cart insights...</div>
              ) : visibleRows.length === 0 ? (
                <div className="text-sm text-white/60">No cart items found.</div>
              ) : (
                visibleRows.map((row) => {
                  const condition = formatConditionLabel(row.condition, { upper: true });
                  const stockLow = row.stock > 0 && row.stock <= row.qty;
                  return (
                    <div
                      key={row.key}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-paper/5 px-3 py-2 sm:py-3"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3 sm:min-w-[240px]">
                        <div className="h-14 w-14 rounded-lg border border-white/10 bg-bg-800 overflow-hidden flex-shrink-0">
                          {row.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.imageUrl} alt={row.name} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{row.name}</div>
                          <div className="text-xs text-white/60">
                            {condition ? `${condition} | ` : ""}
                            Price: {peso(row.price)} | Stock:{" "}
                            <span className={stockLow ? "text-yellow-200" : ""}>{row.stock}</span>
                          </div>
                          {row.latestAdded ? (
                            <div className="text-xs text-white/50">Last added: {formatDateShort(row.latestAdded)}</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1 text-xs text-white/60">
                            <ShoppingCart className="h-3 w-3" />
                            In carts
                          </div>
                          <div className="text-lg font-semibold">{row.qty}</div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1 text-xs text-white/60">
                            <Users className="h-3 w-3" />
                            Customers
                          </div>
                          <div className="text-lg font-semibold">{row.customers}</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold">
                <MousePointerClick className="h-4 w-4 text-sky-200" />
                Most clicked items
              </div>
              <Button
                variant="ghost"
                onClick={loadTopClicks}
                disabled={topClicksLoading}
              >
                {topClicksLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
            <div className="mt-1 text-xs text-white/60">Based on shop product clicks.</div>
            <div className="mt-3 space-y-2">
              {topClicksError ? (
                <div className="text-sm text-red-200">{topClicksError}</div>
              ) : null}
              {topClicksLoading && topClicks.length === 0 ? (
                <div className="text-sm text-white/60">Loading click stats...</div>
              ) : null}
              {topClicks.length === 0 && !topClicksLoading ? (
                <div className="text-sm text-white/60">No click data yet.</div>
              ) : null}
              {topClicks.length ? (
                topClicks.map((row) => {
                  const product = row.product;
                  const image = product?.image_urls?.[0] ?? null;
                  return (
                    <div
                      key={row.product_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-paper/5 px-3 py-2 sm:py-3"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3 sm:min-w-[240px]">
                        <div className="h-12 w-12 rounded-lg border border-white/10 bg-bg-800 overflow-hidden flex-shrink-0">
                          {image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={image} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {product?.title ?? "Unknown item"}
                          </div>
                          <div className="text-xs text-white/60">
                            {product?.brand ?? "-"}
                            {product?.model ? ` | ${product.model}` : ""}
                          </div>
                          {row.last_clicked_at ? (
                            <div className="text-xs text-white/50">
                              Last click: {formatLogDate(row.last_clicked_at)}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1 text-xs text-white/60">
                          <MousePointerClick className="h-3 w-3" />
                          Clicks
                        </div>
                        <div className="text-lg font-semibold">{row.clicks}</div>
                      </div>
                    </div>
                  );
                })
              ) : null}
            </div>
          </div>

          {showCustomerCarts ? (
            <div
              ref={customerSectionRef}
              className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-semibold">
                  <Users className="h-4 w-4 text-sky-200" />
                  Customer carts
                </div>
                <Button
                  variant="ghost"
                  onClick={loadVisitors}
                  disabled={visitorLoading}
                >
                  {visitorLoading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
              <div className="mt-1 text-xs text-white/60">
                Shows account customers and everything currently in their carts.
              </div>
              <div className="mt-3 space-y-2">
                {visitorError ? (
                  <div className="text-sm text-red-200">{visitorError}</div>
                ) : null}
                {visitorLoading && customerRows.length === 0 ? (
                  <div className="text-sm text-white/60">Loading customer carts...</div>
                ) : null}
                {!visitorLoading && customerRows.length === 0 ? (
                  <div className="text-sm text-white/60">No customer carts found.</div>
                ) : null}
                {customerRows.map((row) => {
                  const panelKey = `${row.kind}-${row.id}`;
                  const expanded = expandedCustomerPanel === panelKey;
                  return (
                    <div
                      key={panelKey}
                      className="rounded-xl border border-white/10 bg-paper/5"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCustomerPanel((prev) =>
                            prev === panelKey ? null : panelKey
                          )
                        }
                        className="flex w-full flex-wrap items-start justify-between gap-3 px-3 py-2 text-left sm:py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium truncate">{row.label}</div>
                            <Badge className="border-sky-500/30 text-sky-200">Account</Badge>
                            {row.lastActivity ? (
                              <span className="text-xs text-white/50">
                                Last activity: {formatLogDate(row.lastActivity)}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-white/60">
                            {row.cartLines} line(s) | {row.cartQty} total qty
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1 text-xs text-sky-200">
                            {expanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                            {expanded ? "Hide cart items" : `Show cart items (${row.items.length})`}
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-right">
                          <div>
                            <div className="text-xs text-white/60">Price</div>
                            <div className="text-lg font-semibold text-amber-200">{peso(row.price)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-white/60">COGS</div>
                            <div className="text-lg font-semibold text-orange-200">{peso(row.cogs)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-white/60">Expected profit</div>
                            <div
                              className={`text-lg font-semibold ${
                                row.expectedProfit >= 0 ? "text-emerald-200" : "text-red-200"
                              }`}
                            >
                              {peso(row.expectedProfit)}
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-end gap-1 text-xs text-white/60">
                              <MousePointerClick className="h-3 w-3" />
                              Clicks
                            </div>
                            <div className="text-lg font-semibold">{row.clicks}</div>
                          </div>
                        </div>
                      </button>

                      {expanded ? (
                        <div className="border-t border-white/10 px-3 py-2 sm:px-4 sm:py-3">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/10 px-2 py-2">
                            <div className="text-xs text-white/60">
                              Send this cart to POS with customer details pre-filled (editable).
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleSendToPos(row)}
                                disabled={
                                  row.items.length === 0 || sendingPosPanel === panelKey
                                }
                              >
                                <ClipboardPlus className="mr-1 h-4 w-4" />
                                {sendingPosPanel === panelKey ? "Sending..." : "Send to POS"}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void handleDownloadCustomerInvoice(row)}
                                disabled={
                                  row.items.length === 0 || downloadingInvoicePanel === panelKey
                                }
                              >
                                <FileDown className="mr-1 h-4 w-4" />
                                {downloadingInvoicePanel === panelKey
                                  ? "Generating..."
                                  : "Download Invoice PDF"}
                              </Button>
                            </div>
                          </div>
                          {row.items.length ? (
                            <div className="space-y-2">
                              {row.items.map((item) => (
                                <div
                                  key={`${row.id}-${item.variantId ?? item.name}-${item.condition ?? ""}-${item.notes ?? ""}`}
                                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/10 px-2 py-2"
                                >
                                  <div className="h-10 w-10 overflow-hidden rounded-md border border-white/10 bg-bg-800">
                                    {item.imageUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={item.imageUrl}
                                        alt={item.name}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : null}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs text-white/70">
                                      {item.qty}x {item.name}
                                    </div>
                                    <div className="text-[11px] text-white/40">
                                      Price {peso(item.price)} | COGS {peso(item.cogs)} | Profit{" "}
                                      <span
                                        className={
                                          item.profit >= 0 ? "text-emerald-300" : "text-red-300"
                                        }
                                      >
                                        {peso(item.profit)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-white/50">No items in this cart.</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold">
                <Users className="h-4 w-4 text-emerald-200" />
                Guest carts
              </div>
              <Button
                variant="ghost"
                onClick={loadVisitors}
                disabled={visitorLoading}
              >
                {visitorLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
            <div className="mt-1 text-xs text-white/60">
              Shows guest sessions only, with total clicks and current cart contents.
            </div>
            <div className="mt-3 space-y-2">
              {visitorError ? (
                <div className="text-sm text-red-200">{visitorError}</div>
              ) : null}
              {visitorLoading && visitorRows.length === 0 ? (
                <div className="text-sm text-white/60">Loading visitor carts...</div>
              ) : null}
              {!visitorLoading && visitorRows.length === 0 ? (
                <div className="text-sm text-white/60">No visitor carts found.</div>
              ) : null}
              {visitorRows.map((row) => {
                const itemsPreview = row.items.slice(0, 3);
                const remaining = row.items.length - itemsPreview.length;
                const itemSummary = itemsPreview
                  .map((item) => `${item.qty}x ${item.name}`)
                  .join(" | ");
                return (
                  <div
                    key={`${row.kind}-${row.id}`}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-paper/5 px-3 py-2 sm:py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium truncate">{row.label}</div>
                        <Badge
                          className={
                            row.kind === "GUEST"
                              ? "border-amber-500/30 text-amber-200"
                              : "border-sky-500/30 text-sky-200"
                          }
                        >
                          {row.kind === "GUEST" ? "Guest" : "Account"}
                        </Badge>
                        {row.lastActivity ? (
                          <span className="text-xs text-white/50">
                            Last activity: {formatLogDate(row.lastActivity)}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-white/60">
                        {row.cartLines > 0
                          ? `${row.cartLines} line(s) | ${row.cartQty} total qty`
                          : "Cart empty"}
                      </div>
                      <div className="text-xs text-white/60">
                        Price {peso(row.price)} | COGS {peso(row.cogs)} | Expected profit{" "}
                        <span
                          className={
                            row.expectedProfit >= 0 ? "text-emerald-300" : "text-red-300"
                          }
                        >
                          {peso(row.expectedProfit)}
                        </span>
                      </div>
                      {itemSummary ? (
                        <div className="text-xs text-white/50">
                          {itemSummary}
                          {remaining > 0 ? ` | +${remaining} more` : ""}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <div className="text-xs text-white/60">Price</div>
                        <div className="text-lg font-semibold text-amber-200">{peso(row.price)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-white/60">COGS</div>
                        <div className="text-lg font-semibold text-orange-200">{peso(row.cogs)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-white/60">Expected profit</div>
                        <div
                          className={`text-lg font-semibold ${
                            row.expectedProfit >= 0 ? "text-emerald-200" : "text-red-200"
                          }`}
                        >
                          {peso(row.expectedProfit)}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-end gap-1 text-xs text-white/60">
                          <MousePointerClick className="h-3 w-3" />
                          Clicks
                        </div>
                        <div className="text-lg font-semibold">{row.clicks}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

