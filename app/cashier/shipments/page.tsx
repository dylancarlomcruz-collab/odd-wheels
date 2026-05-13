"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import JsBarcode from "jsbarcode";
import {
  Bluetooth,
  BluetoothConnected,
  CheckCircle2,
  Circle,
  ClipboardCopy,
  Loader2,
  Printer,
  ScrollText,
} from "lucide-react";
import { useAllOrders } from "@/hooks/useAllOrders";
import { useNotices } from "@/hooks/useNotices";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/lib/supabase/browser";
import { insertSingleRowWithSchemaFallback } from "@/lib/supabase/insertWithSchemaFallback";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { BarcodeScannerModal } from "@/components/pos/BarcodeScannerModal";
import {
  formatConditionLabel,
  isIssueCondition,
  isNearMintCondition,
} from "@/lib/conditions";
import { toast } from "@/components/ui/toast";

const SHIPPING_TABS = [
  { key: "PREPARING TO SHIP", label: "Preparing to ship" },
  { key: "SHIPPED", label: "Shipped" },
  { key: "COMPLETED", label: "Completed" },
] as const;

const LBC_PACKAGE_OPTIONS = [
  { value: "MINIBOX", label: "Minibox" },
  { value: "N_SAKTO", label: "N-Sakto" },
  { value: "SLIM_BOX", label: "Slim Box" },
  { value: "SMALL_BOX", label: "Small Box" },
] as const;

const MANUAL_SHIPPING_METHOD_OPTIONS = [
  { value: "LBC", label: "LBC" },
  { value: "J&T", label: "J&T" },
  { value: "LALAMOVE", label: "Lalamove" },
  { value: "PICKUP", label: "Pickup" },
  { value: "JRS", label: "JRS" },
  { value: "NINJA VAN", label: "Ninja Van" },
  { value: "GRAB", label: "Grab" },
] as const;

type ShippingTabKey = (typeof SHIPPING_TABS)[number]["key"];
type ShippingStageKey = ShippingTabKey | "TO BOOK";
type ScanMode = "tracking" | "booking_reference";
type ShippingFeeDrafts = Record<string, string>;
type ShippingDraft = {
  courier: string;
  tracking: string;
  bookingReference: string;
};
type ManualOrderEditDraft = {
  customerName: string;
  shippingMethod: string;
  lbcPackage: string;
  bookingReference: string;
  shippingFee: string;
};
const EMPTY_SHIPPING_DRAFT: ShippingDraft = {
  courier: "",
  tracking: "",
  bookingReference: "",
};
const EMPTY_MANUAL_ORDER_EDIT_DRAFT: ManualOrderEditDraft = {
  customerName: "",
  shippingMethod: "LBC",
  lbcPackage: "MINIBOX",
  bookingReference: "",
  shippingFee: "",
};

function parseJsonMaybe(v: any) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return null;
}

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

function normalizePhoneToPlus10(raw: string | null | undefined) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0") && digits.length === 11) return `+${digits.slice(1)}`;
  if (digits.startsWith("63") && digits.length >= 12) return `+${digits.slice(2)}`;
  if (digits.length === 10) return `+${digits}`;
  return `+${digits.replace(/^0+/, "")}`;
}

function normalizeCourier(method: string) {
  const value = String(method ?? "").trim().toUpperCase();
  if (!value) return null;
  if (value === "J&T") return "JNT";
  return value;
}

function normalizeLbcPackage(raw: string | null | undefined) {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (!value) return "MINIBOX";
  if (value === "NSAKTO") return "N_SAKTO";
  if (value === "SLIMBOX") return "SLIM_BOX";
  if (value === "SMALLBOX") return "SMALL_BOX";
  return value;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function buildCopyPayload(o: any) {
  const details = parseJsonMaybe(o.shipping_details) ?? {};
  const method = String(details.method ?? o.shipping_method ?? "").toUpperCase();

  const phone = normalizePhoneToPlus10(
    details.receiver_phone ??
      o.customer_phone ??
      details.phone ??
      o.contact ??
      o.customer_phone
  );

  if (method === "LBC") {
    const first = String(details.first_name ?? "").trim();
    const last = String(details.last_name ?? "").trim();
    const branchName = String(details.branch_name ?? details.branch ?? "").trim();
    const branchCity = String(details.branch_city ?? "").trim();
    const branch = [branchName, branchCity].filter(Boolean).join(", ");
    return [first, last, phone, branch].filter(Boolean).join("\n");
  }

  const name = String(details.receiver_name ?? o.customer_name ?? "").trim();
  const addr =
    method === "LALAMOVE"
      ? String(details.dropoff_address ?? o.address ?? "").trim()
      : String(details.full_address ?? o.address ?? "").trim();

  return [name, phone, addr].filter(Boolean).join("\n");
}

function formatShippingContainer(method: string, details: any) {
  const raw = details?.package ?? details?.pack ?? details?.container ?? null;
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const normalized = value.toUpperCase();

  if (method === "JNT" || method === "J&T" || method === "J&T EXPRESS") {
    if (normalized === "SMALL") return "J&T Small pouch";
    if (normalized === "MEDIUM") return "J&T Medium pouch";
  }

  if (method === "LBC") {
    if (normalized === "N_SAKTO") return "LBC N-Sakto";
    if (normalized === "MINIBOX") return "LBC Minibox";
    if (normalized === "SLIM_BOX" || normalized === "SLIMBOX") return "LBC Slim Box";
    if (normalized === "SMALL_BOX") return "LBC Small Box";
    if (normalized === "MEDIUM_APPROVAL") return "LBC Medium Box (approval)";
  }

  return normalized.replace(/_/g, " ");
}

function getAddressOrBranch(method: string, details: any, order: any) {
  const normalized = String(method ?? "").toUpperCase();

  if (normalized === "LBC") {
    const branchName = String(details?.branch_name ?? details?.branch ?? "").trim();
    const branchCity = String(details?.branch_city ?? "").trim();
    const branch = [branchName, branchCity].filter(Boolean).join(", ");
    if (branch) return branch;
  }

  if (normalized === "LALAMOVE") {
    const dropoff = String(details?.dropoff_address ?? order?.address ?? "").trim();
    if (dropoff) return dropoff;
  }

  const addr = String(
    details?.full_address ?? details?.address ?? order?.address ?? ""
  ).trim();
  if (addr) return addr;

  const textDetails = String(details?.text ?? details?.notes ?? details?.note ?? "").trim();
  return textDetails;
}

function cleanAddress(raw: any) {
  if (!raw) return "";
  const parsed = parseJsonMaybe(raw);
  if (parsed && typeof parsed === "object") {
    const candidate =
      parsed.full_address ||
      parsed.address ||
      parsed.dropoff_address ||
      parsed.location ||
      parsed.branch ||
      "";
    return String(candidate ?? "").trim();
  }
  return String(raw).trim();
}

function getItemThumb(it: any): string | null {
  const urls = it?.product_variant?.product?.image_urls;
  if (Array.isArray(urls) && urls.length) return String(urls[0]);
  return null;
}

function getItemTitle(it: any): string {
  
  return (
    it?.item_name ||
    it?.product_title ||
    it?.product_variant?.product?.title ||
    "Item"
  );
}

function getItemPrice(it: any): number {
  const v = it?.price_each ?? it?.unit_price ?? it?.product_variant?.price;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeShippingStatus(raw: string | null | undefined) {
  const statusRaw = String(raw ?? "").trim().toUpperCase();
  const normalized = statusRaw.replace(/[-\s]+/g, "_");
  if (!normalized || normalized === "NONE") return "PREPARING TO SHIP";
  if (normalized === "PREPARING" || normalized === "PREPARING_TO_SHIP") {
    return "PREPARING TO SHIP";
  }
  if (normalized === "TO_SHIP" || normalized === "PENDING_SHIPMENT") {
    return "PREPARING TO SHIP";
  }
  if (normalized === "DELIVERED") return "COMPLETED";
  if (normalized === "SHIPPED") return "SHIPPED";
  if (normalized === "COMPLETED") return "COMPLETED";
  return statusRaw;
}

function getOrderShippingMethod(order: any, details?: Record<string, any>) {
  const data = details ?? (parseJsonMaybe(order?.shipping_details) ?? {});
  return String(data?.method ?? order?.shipping_method ?? "").trim().toUpperCase();
}

function isLbcOrder(order: any, details?: Record<string, any>) {
  return getOrderShippingMethod(order, details) === "LBC";
}

function getLbcBookingReference(order: any, details?: Record<string, any>) {
  const data = details ?? (parseJsonMaybe(order?.shipping_details) ?? {});
  const candidates = [
    data?.lbc_booking_reference,
    data?.booking_reference,
    data?.bookingReference,
    data?.reference_number,
    data?.referenceNo,
  ];
  for (const value of candidates) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function resolveShippingStage(order: any, details?: Record<string, any>): ShippingStageKey {
  const status = normalizeShippingStatus(order?.shipping_status);
  if (status === "SHIPPED" || status === "COMPLETED") return status;

  if (
    status === "PREPARING TO SHIP" &&
    isLbcOrder(order, details) &&
    !getLbcBookingReference(order, details)
  ) {
    return "TO BOOK";
  }

  return "PREPARING TO SHIP";
}

function isOddWheelsInternalOrder(order: any) {
  const customer = String(order?.customer_name ?? "").trim().toLowerCase();
  const shippingMethod = String(order?.shipping_method ?? "").trim().toUpperCase();
  const details = parseJsonMaybe(order?.shipping_details) ?? {};
  const detailsText = String(details?.text ?? "").trim().toLowerCase();
  const channel = String(order?.channel ?? "").trim().toUpperCase();
  return (
    customer.includes("odd wheels") ||
    detailsText.includes("auto-sold from inventory editor") ||
    (shippingMethod === "PICKUP" && channel === "POS" && customer.includes("odd"))
  );
}

function isManualShipmentOrder(order: any, details?: Record<string, any>) {
  const data = details ?? (parseJsonMaybe(order?.shipping_details) ?? {});
  return String(data?.source ?? "").trim().toLowerCase() === "shipments_manual_create";
}

function shippingStatusBadge(status: string) {
  switch (status) {
    case "TO BOOK":
      return "border-fuchsia-500/30 text-fuchsia-200";
    case "SHIPPED":
      return "border-sky-500/30 text-sky-200";
    case "COMPLETED":
      return "border-emerald-500/30 text-emerald-200";
    default:
      return "border-yellow-500/30 text-yellow-200";
  }
}

function parseFeeDraft(raw: string | number | null | undefined) {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function formatFeeDraft(amount: number | null | undefined) {
  const normalized = Number.isFinite(amount) ? Math.max(0, Number(amount)) : 0;
  if (normalized === 0) return "";
  return Number.isInteger(normalized) ? String(normalized) : String(normalized);
}

function normalizeMethodKey(method: string | null | undefined) {
  return String(method ?? "").trim().toUpperCase() || "LBC";
}

async function notifyOrderEvent(
  orderId: string,
  event: "shipped" | "completed" | "status_updated"
) {
  try {
    const sessionResult = await supabase.auth.getSession();
    const accessToken = String(
      sessionResult.data.session?.access_token ?? ""
    ).trim();
    if (!accessToken) return;

    await fetch("/api/push/order-event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ orderId, event }),
    }).catch(() => undefined);
  } catch {
    // Shipping should still succeed even if push fails.
  }
}

function shippingStageLabel(status: ShippingStageKey) {
  switch (status) {
    case "TO BOOK":
      return "To book";
    case "SHIPPED":
      return "Shipped";
    case "COMPLETED":
      return "Completed";
    default:
      return "Preparing";
  }
}

function buildCourierOptions(method: string | null | undefined) {
  const base = [
    "LBC",
    "Lalamove",
    "J&T Express",
    "JRS",
    "Ninja Van",
    "Grab",
    "Other",
  ];
  const cleaned = String(method ?? "").trim();
  const combined = cleaned ? [cleaned, ...base] : base;
  const seen = new Set<string>();
  return combined.filter((opt) => {
    const key = opt.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildShippingSummary(o: any, details: Record<string, any>) {
  const receiverName =
    details.receiver_name ||
    [details.first_name, details.last_name].filter(Boolean).join(" ") ||
    o.customer_name;
  const receiverPhone =
    details.receiver_phone || details.phone || o.customer_phone || o.contact;
  const address = cleanAddress(
    details.full_address || details.dropoff_address || o.address || details.address
  );
  const branch =
    [details.branch_name || details.branch, details.branch_city]
      .filter(Boolean)
      .join(", ") || null;
  const notes = details.notes || details.note || details.text || null;
  const pack = details.package || details.package_size || null;
  const bookingReference = getLbcBookingReference(o, details) || null;

  return [
    { label: "Method", value: o.shipping_method },
    { label: "Region", value: o.shipping_region || null },
    { label: "Receiver", value: receiverName || null },
    { label: "Phone", value: receiverPhone || null },
    { label: "Address", value: address || null },
    { label: "Branch", value: branch },
    { label: "Package", value: pack },
    { label: "LBC Booking Ref", value: bookingReference },
    { label: "Notes", value: notes },
  ].filter((row) => row.value);
}

function getCustomerName(o: any, details: Record<string, any>) {
  return (
    details.receiver_name ||
    [details.first_name, details.last_name].filter(Boolean).join(" ") ||
    o.customer_name ||
    "Guest"
  );
}

function buildManualOrderEditDraft(order: any): ManualOrderEditDraft {
  const details = parseJsonMaybe(order?.shipping_details) ?? {};
  return {
    customerName: getCustomerName(order, details),
    shippingMethod: getOrderShippingMethod(order, details) || "LBC",
    lbcPackage: normalizeLbcPackage(details?.package ?? details?.package_size),
    bookingReference: getLbcBookingReference(order, details),
    shippingFee: formatFeeDraft(Number(order?.shipping_fee ?? 0)),
  };
}

function pickShippingDays(notices: { title: string; body: string }[]) {
  // Best-effort parse of shipping days from Notice Board entries.
  const candidate = notices.find(
    (n) => /ship/i.test(n.title ?? "") || /ship/i.test(n.body ?? "")
  );
  if (!candidate) return null;

  const text = `${candidate.title ?? ""}\n${candidate.body ?? ""}`.trim();
  const match = text.match(
    /ship(?:s|ping)?\s+(?:in|within|on or before)\s+([^\n.]+)/i
  );
  if (match?.[1]) return match[1].trim();

  const fallback = String(candidate.body ?? candidate.title ?? "").trim();
  if (!fallback) return null;
  return fallback.split("\n")[0].trim();
}

const B1_LABEL_WIDTH_MM = 50;
const B1_LABEL_HEIGHT_MM = 30;
const B1_LABEL_DP_MM = 8;

type ShippingLabelData = {
  customerName: string;
  packaging: string;
  barcodeValue: string;
};

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  const pushLine = (value: string) => {
    if (!value) return;
    if (lines.length >= maxLines) return;
    lines.push(value);
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      pushLine(current);
      current = "";
      if (lines.length >= maxLines) break;
    }

    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      continue;
    }

    let chunk = "";
    for (const char of word) {
      const next = chunk + char;
      if (ctx.measureText(next).width <= maxWidth) {
        chunk = next;
        continue;
      }
      pushLine(chunk);
      if (lines.length >= maxLines) break;
      chunk = char;
    }
    if (lines.length >= maxLines) break;
    current = chunk;
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  return lines;
}

function createShippingLabelCanvas(data: ShippingLabelData) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(B1_LABEL_WIDTH_MM * B1_LABEL_DP_MM);
  canvas.height = Math.round(B1_LABEL_HEIGHT_MM * B1_LABEL_DP_MM);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to render label canvas.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  const paddingX = 36;
  const maxWidth = canvas.width - paddingX * 2;
  const barcodeValue = String(data.barcodeValue ?? "").trim();
  let y = 16;

  const drawSingleLineField = (label: string, value: string) => {
    ctx.font = "bold 24px Arial";
    const lines = wrapCanvasText(ctx, `${label}: ${String(value || "-").trim()}`, maxWidth, 1);
    ctx.fillText(lines[0] ?? `${label}: -`, paddingX, y);
    y += 32;
  };

  drawSingleLineField("Name", data.customerName);
  drawSingleLineField("Packaging", data.packaging);

  const barcodeCanvas = document.createElement("canvas");
  const fallbackBarcode = String(data.barcodeValue || "").replace(/[^0-9A-Z\-. $/+%]/gi, "").trim();

  try {
    JsBarcode(barcodeCanvas, barcodeValue || fallbackBarcode || "000000000000", {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
      width: 2,
      height: 68,
    });
  } catch {
    JsBarcode(barcodeCanvas, fallbackBarcode || "000000000000", {
      format: "CODE39",
      displayValue: false,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
      width: 2,
      height: 68,
    });
  }

  const targetHeight = 68;
  ctx.drawImage(barcodeCanvas, paddingX, y, maxWidth, targetHeight);
  y += targetHeight + 2;

  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(barcodeValue || fallbackBarcode || "000000000000", canvas.width / 2, y);
  ctx.textAlign = "left";

  return canvas;
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function supportsDirectNiimbotPrinting() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (!window.isSecureContext) return false;

  const bluetooth = (navigator as Navigator & {
    bluetooth?: { requestDevice?: unknown };
  }).bluetooth;

  return Boolean(bluetooth && typeof bluetooth.requestDevice === "function");
}

function getNiimbotSupportMessage() {
  if (typeof window === "undefined") {
    return "Direct Bluetooth label printing is only available in supported browsers.";
  }
  if (!window.isSecureContext) {
    return "Niimbot requires HTTPS (secure context).";
  }
  if (!supportsDirectNiimbotPrinting()) {
    return "Direct Bluetooth label printing is not supported here. Use Print label to open a printable preview instead.";
  }
  return null;
}

function openShippingLabelPrintPreview(canvas: HTMLCanvasElement, title: string) {
  if (typeof window === "undefined") {
    throw new Error("Print preview is only available in the browser.");
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Unable to open the printable label preview. Allow pop-ups and try again.");
  }

  const labelDataUrl = canvas.toDataURL("image/png");
  const safeTitle = escapeHtml(title);
  const width = `${B1_LABEL_WIDTH_MM}mm`;
  const height = `${B1_LABEL_HEIGHT_MM}mm`;

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      @page {
        size: ${width} ${height};
        margin: 0;
      }

      :root {
        color-scheme: light;
      }

      html, body {
        margin: 0;
        padding: 0;
        width: ${width};
        min-height: ${height};
        background: #ffffff;
        color: #111111;
        font-family: Arial, sans-serif;
      }

      body {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      img {
        display: block;
        width: ${width};
        height: ${height};
        object-fit: contain;
        image-rendering: pixelated;
      }

      button {
        border: 0;
        border-radius: 999px;
        padding: 10px 16px;
        background: #111111;
        color: #ffffff;
        font: inherit;
      }

      p {
        margin: 0 12px 12px;
        text-align: center;
        font-size: 12px;
        line-height: 1.4;
      }

      @media print {
        button,
        p {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <img id="shipping-label" src="${labelDataUrl}" alt="Shipping label" />
    <button type="button" onclick="window.print()">Print</button>
    <p>If the print dialog does not open automatically, tap Print.</p>
    <script>
      (function () {
        var label = document.getElementById("shipping-label");
        var printed = false;

        function triggerPrint() {
          if (printed) return;
          printed = true;
          setTimeout(function () {
            try {
              window.focus();
              window.print();
            } catch (error) {}
          }, 180);
        }

        if (label && label.complete) {
          triggerPrint();
        } else if (label) {
          label.addEventListener("load", triggerPrint, { once: true });
        }
      })();
    </script>
  </body>
</html>`);
  printWindow.document.close();
}

type OrderDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
};

function OrderDetailsModal({ open, onClose, title, children }: OrderDetailsModalProps) {
  React.useEffect(() => {
    if (!open) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-black/70 p-4"
      onClick={onClose}
    >
      <div className="mx-auto w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="text-lg font-semibold">{title}</div>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </CardHeader>
          <CardBody className="max-h-[75vh] overflow-y-auto">{children}</CardBody>
        </Card>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

export default function CashierShipmentsPage() {
  const pathname = usePathname();
  const { profile } = useProfile();
  const { orders, itemsByOrderId, loading, reload } = useAllOrders();
  const { notices } = useNotices(10);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [detailOrderId, setDetailOrderId] = React.useState<string | null>(null);
  const [selectedItem, setSelectedItem] = React.useState<any | null>(null);
  const [activeTab, setActiveTab] =
    React.useState<ShippingTabKey>("PREPARING TO SHIP");
  const [drafts, setDrafts] = React.useState<Record<string, ShippingDraft>>({});
  const [busyById, setBusyById] = React.useState<Record<string, boolean>>({});
  const [errorById, setErrorById] = React.useState<Record<string, string>>({});
  const [bulkShipBusy, setBulkShipBusy] = React.useState<null | "manual" | "bulk">(
    null
  );
  const [activeCourier, setActiveCourier] = React.useState<string>("ALL");
  const [scanOrderId, setScanOrderId] = React.useState<string | null>(null);
  const [scanCourier, setScanCourier] = React.useState<string>("");
  const [scanMode, setScanMode] = React.useState<ScanMode>("tracking");
  const [manualCustomerName, setManualCustomerName] = React.useState<string>("");
  const [manualShippingMethod, setManualShippingMethod] =
    React.useState<string>("LBC");
  const [manualLbcPackage, setManualLbcPackage] =
    React.useState<string>("MINIBOX");
  const [manualBookingReference, setManualBookingReference] =
    React.useState<string>("");
  const [manualShippingFeeDrafts, setManualShippingFeeDrafts] =
    React.useState<ShippingFeeDrafts>({});
  const [editingManualOrderId, setEditingManualOrderId] = React.useState<string | null>(null);
  const [manualOrderEditDraft, setManualOrderEditDraft] = React.useState<ManualOrderEditDraft>(
    EMPTY_MANUAL_ORDER_EDIT_DRAFT
  );
  const [creatingManualOrder, setCreatingManualOrder] =
    React.useState<boolean>(false);
  const [oddWheelsView, setOddWheelsView] = React.useState<
    "UNSHIPPED" | "SHIPPED" | "ALL"
  >("UNSHIPPED");
  const [niimbotState, setNiimbotState] = React.useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [niimbotPrinterName, setNiimbotPrinterName] = React.useState<string>("");
  const [printingOrderId, setPrintingOrderId] = React.useState<string | null>(null);
  const niimbotLibRef = React.useRef<any>(null);
  const niimbotClientRef = React.useRef<any>(null);
  const isAdmin = profile?.role === "admin";
  const [labelPrintMode, setLabelPrintMode] = React.useState<"bluetooth" | "browser">(
    "browser"
  );
  const manualShippingMethodKey = normalizeMethodKey(manualShippingMethod);
  const manualShippingFeeInput =
    manualShippingMethodKey === "PICKUP"
      ? "0"
      : manualShippingFeeDrafts[manualShippingMethodKey] ?? "";
  const manualShippingFeeValue =
    manualShippingMethodKey === "PICKUP"
      ? 0
      : parseFeeDraft(manualShippingFeeDrafts[manualShippingMethodKey] ?? "");
  const manualOrderTotal = manualShippingFeeValue;
  const manualMethodFeePreview = React.useMemo(
    () =>
      MANUAL_SHIPPING_METHOD_OPTIONS.map((option) => {
        const methodKey = normalizeMethodKey(option.value);
        const amount =
          methodKey === "PICKUP"
            ? 0
            : parseFeeDraft(manualShippingFeeDrafts[methodKey] ?? "");
        return {
          ...option,
          methodKey,
          amount,
        };
      }),
    [manualShippingFeeDrafts]
  );

  const shippingDays = React.useMemo(
    () => pickShippingDays(notices),
    [notices]
  );
  const shippingDaysLabel = shippingDays || "the posted shipping days";

  React.useEffect(() => {
    setLabelPrintMode(supportsDirectNiimbotPrinting() ? "bluetooth" : "browser");
  }, []);

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

  const connectNiimbot = React.useCallback(async () => {
    if (niimbotState === "connecting" || niimbotState === "connected") return;
    const supportMessage = getNiimbotSupportMessage();
    if (supportMessage) {
      toast({
        intent: "error",
        message: supportMessage,
      });
      return;
    }

    setNiimbotState("connecting");
    try {
      const { client } = await ensureNiimbotClient();
      await client.connect();
      if (typeof client.fetchPrinterInfo === "function") {
        await client.fetchPrinterInfo();
      }
      if (typeof client.startHeartbeat === "function") {
        client.startHeartbeat();
      }
      toast({ intent: "success", message: "Niimbot connected." });
    } catch (error: any) {
      setNiimbotState("disconnected");
      const message = String(error?.message ?? error ?? "Unable to connect Niimbot.");
      toast({ intent: "error", message });
    }
  }, [ensureNiimbotClient, niimbotState]);

  const disconnectNiimbot = React.useCallback(() => {
    try {
      niimbotClientRef.current?.disconnect?.();
    } catch {
      // Ignore disconnect failures.
    } finally {
      setNiimbotState("disconnected");
      setNiimbotPrinterName("");
    }
  }, []);

  React.useEffect(() => {
    if (!orders.length) return;
    setDrafts((cur) => {
      const next = { ...cur };
      for (const o of orders) {
        const details = parseJsonMaybe(o.shipping_details) ?? {};
        const existing = next[o.id];
        next[o.id] = {
          courier: existing?.courier ?? String(o.courier ?? o.shipping_method ?? ""),
          tracking: existing?.tracking ?? String(o.tracking_number ?? ""),
          bookingReference: existing?.bookingReference ?? getLbcBookingReference(o, details),
        };
      }
      return next;
    });
  }, [orders]);

  React.useEffect(() => {
    return () => {
      try {
        niimbotClientRef.current?.disconnect?.();
      } catch {
        // Ignore cleanup disconnect failures.
      }
    };
  }, []);

  const getDraft = React.useCallback(
    (orderId: string): ShippingDraft => drafts[orderId] ?? EMPTY_SHIPPING_DRAFT,
    [drafts]
  );


  const paidOrders = React.useMemo(
    () =>
      orders.filter((o) => {
        const payment = String(o.payment_status ?? "").toUpperCase();
        const status = String(o.status ?? "").toUpperCase();
        const channel = String(o.channel ?? "").toUpperCase();
        const details = parseJsonMaybe(o.shipping_details) ?? {};
        const shippingText = String(details?.text ?? "").toLowerCase();
        const shippingStageHint = normalizeShippingStatus(o.shipping_status);
        const isAdminCartCheckout =
          channel === "POS" &&
          (details?.admin_cart_checkout === true ||
            String(details?.source ?? "").toLowerCase() === "admin_cart_checkout" ||
            shippingText.includes("fb checkout from admin cart"));
        const isLegacyPosToShip =
          channel === "POS" &&
          status === "TO_SHIP" &&
          shippingStageHint === "PREPARING TO SHIP";
        const allowUnpaid = isAdminCartCheckout || isLegacyPosToShip;
        if (payment !== "PAID" && !allowUnpaid) return false;
        if (status === "CANCELLED" || status === "VOIDED") return false;
        const shipping = shippingStageHint;
        return (
          shipping === "PREPARING TO SHIP" ||
          shipping === "SHIPPED" ||
          shipping === "COMPLETED"
        );
      }),
    [orders]
  );

  const oddWheelsSourceOrders = React.useMemo(
    () =>
      orders.filter((o) => {
        const status = String(o.status ?? "").toUpperCase();
        if (status === "CANCELLED" || status === "VOIDED") return false;
        return isOddWheelsInternalOrder(o);
      }),
    [orders]
  );

  const tabCounts = React.useMemo(() => {
    return paidOrders.reduce(
      (acc, o) => {
        const status = resolveShippingStage(o);
        if (status === "TO BOOK") {
          acc["PREPARING TO SHIP"] += 1;
          return acc;
        }
        if (acc[status] !== undefined) acc[status] += 1;
        return acc;
      },
      {
        "PREPARING TO SHIP": 0,
        SHIPPED: 0,
        COMPLETED: 0,
      } as Record<string, number>
    );
  }, [paidOrders]);

  const manualShipmentOrders = React.useMemo(
    () => paidOrders.filter((o) => isManualShipmentOrder(o)),
    [paidOrders]
  );

  const standardPaidOrders = React.useMemo(
    () => paidOrders.filter((o) => !isManualShipmentOrder(o)),
    [paidOrders]
  );

  const filtered = React.useMemo(
    () => standardPaidOrders.filter((o) => resolveShippingStage(o) === activeTab),
    [standardPaidOrders, activeTab]
  );

  const oddWheelsOrders = oddWheelsSourceOrders;

  const oddWheelsItems = React.useMemo(() => {
    const rows: Array<{ order: any; item: any; key: string }> = [];
    for (const order of oddWheelsOrders) {
      const items = itemsByOrderId[order.id] ?? [];
      if (!items.length) {
        rows.push({
          order,
          item: {
            item_name: "Sold item",
            qty: 1,
            condition: null,
            line_total: Number(order.total ?? 0),
          },
          key: `${order.id}-fallback`,
        });
        continue;
      }
      items.forEach((item: any, idx: number) => {
        rows.push({ order, item, key: `${order.id}-${idx}` });
      });
    }
    return rows;
  }, [oddWheelsOrders, itemsByOrderId]);

  const selectedOrder = React.useMemo(() => {
    if (!detailOrderId) return null;
    return paidOrders.find((o) => String(o.id) === detailOrderId) ?? null;
  }, [detailOrderId, paidOrders]);

  const preparingOrders = React.useMemo(
    () =>
      standardPaidOrders.filter(
        (o) => resolveShippingStage(o) === "PREPARING TO SHIP"
      ),
    [standardPaidOrders]
  );

  const toBookOrders = React.useMemo(
    () =>
      standardPaidOrders.filter((o) => resolveShippingStage(o) === "TO BOOK"),
    [standardPaidOrders]
  );

  const manualPanelOrders = React.useMemo(
    () =>
      manualShipmentOrders.filter((o) => {
        const stage = resolveShippingStage(o);
        if (activeTab === "PREPARING TO SHIP") {
          return stage === "PREPARING TO SHIP" || stage === "TO BOOK";
        }
        return stage === activeTab;
      }),
    [manualShipmentOrders, activeTab]
  );

  const manualPanelCounts = React.useMemo(
    () =>
      manualPanelOrders.reduce(
        (acc, o) => {
          const stage = resolveShippingStage(o);
          if (stage === "TO BOOK") acc.toBook += 1;
          else if (stage === "PREPARING TO SHIP") acc.preparing += 1;
          else if (stage === "SHIPPED") acc.shipped += 1;
          else if (stage === "COMPLETED") acc.completed += 1;
          return acc;
        },
        {
          toBook: 0,
          preparing: 0,
          shipped: 0,
          completed: 0,
        }
      ),
    [manualPanelOrders]
  );

  const courierGroups = React.useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const o of preparingOrders) {
      const draft = getDraft(o.id);
      const key = String(draft.courier || o.shipping_method || "Other").trim() || "Other";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(o);
    }
    return grouped;
  }, [preparingOrders, getDraft]);

  const courierTabs = React.useMemo(
    () => ["ALL", ...Object.keys(courierGroups).sort()],
    [courierGroups]
  );

  const bulkOrders =
    activeTab === "PREPARING TO SHIP"
      ? activeCourier === "ALL"
        ? preparingOrders
        : courierGroups[activeCourier] ?? []
      : [];

  const hasActiveTabPanels =
    manualPanelOrders.length > 0 ||
    (activeTab === "PREPARING TO SHIP" &&
      (toBookOrders.length > 0 || bulkOrders.length > 0));

  const oddWheelsCounts = React.useMemo(() => {
    let shipped = 0;
    let unshipped = 0;
    for (const row of oddWheelsItems) {
      const status = normalizeShippingStatus(row.order?.shipping_status);
      const done = status === "SHIPPED" || status === "COMPLETED";
      if (done) shipped += 1;
      else unshipped += 1;
    }
    return { shipped, unshipped };
  }, [oddWheelsItems]);

  const oddWheelsVisibleItems = React.useMemo(() => {
    return oddWheelsItems.filter((row) => {
      const status = normalizeShippingStatus(row.order?.shipping_status);
      const isShipped = status === "SHIPPED" || status === "COMPLETED";
      if (oddWheelsView === "SHIPPED") return isShipped;
      if (oddWheelsView === "UNSHIPPED") return !isShipped;
      return true;
    });
  }, [oddWheelsItems, oddWheelsView]);

  React.useEffect(() => {
    if (activeTab !== "PREPARING TO SHIP") return;
    if (activeCourier !== "ALL" && !courierGroups[activeCourier]) {
      setActiveCourier("ALL");
    }
  }, [activeTab, activeCourier, courierGroups]);

  async function runRpc(
    orderId: string,
    fn: string,
    params: Record<string, any>
  ) {
    setBusyById((cur) => ({ ...cur, [orderId]: true }));
    setErrorById((cur) => ({ ...cur, [orderId]: "" }));
    try {
      const { error } = await supabase.rpc(fn, params);
      if (error) throw error;
      await reload();
    } catch (err: any) {
      setErrorById((cur) => ({
        ...cur,
        [orderId]: err?.message ?? "Action failed.",
      }));
    } finally {
      setBusyById((cur) => ({ ...cur, [orderId]: false }));
    }
  }

  function needsPaidFallback(message: string) {
    const value = String(message ?? "").toLowerCase();
    return (
      value.includes("not paid") ||
      (value.includes("payment") && value.includes("paid"))
    );
  }

  async function markShippedDirect(
    orderId: string,
    courierRaw: string,
    trackingRaw: string
  ) {
    const courier = String(courierRaw ?? "").trim();
    const tracking = String(trackingRaw ?? "").trim();
    const { error } = await supabase
      .from("orders")
      .update({
        shipping_status: "SHIPPED",
        courier: courier || null,
        tracking_number: tracking || null,
        shipped_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    return error;
  }

  async function markShippedAndComplete(
    orderId: string,
    courierRaw: string,
    trackingRaw: string,
    options?: {
      suppressSuccessToast?: boolean;
      suppressErrorToast?: boolean;
      skipReload?: boolean;
    }
  ) {
    const tracking = String(trackingRaw ?? "").trim();
    setBusyById((cur) => ({ ...cur, [orderId]: true }));
    setErrorById((cur) => ({ ...cur, [orderId]: "" }));
    try {
      const courier = String(courierRaw ?? "").trim();
      let shipError: any = null;

      if (tracking) {
        const shipRes = await supabase.rpc("fn_mark_shipped", {
          p_order_id: orderId,
          p_courier: courier,
          p_tracking_number: tracking,
        });
        shipError = shipRes.error;

        if (shipError && needsPaidFallback(shipError.message ?? "")) {
          const { error: payError } = await supabase
            .from("orders")
            .update({
              payment_status: "PAID",
              status: "PAID",
              paid_at: new Date().toISOString(),
            })
            .eq("id", orderId);
          if (payError) throw payError;

          const retry = await supabase.rpc("fn_mark_shipped", {
            p_order_id: orderId,
            p_courier: courier,
            p_tracking_number: tracking,
          });
          shipError = retry.error;
        }

        if (
          shipError &&
          String(shipError.message ?? "").toLowerCase().includes("tracking number is required")
        ) {
          shipError = await markShippedDirect(orderId, courier, tracking);
        }
      } else {
        shipError = await markShippedDirect(orderId, courier, tracking);
      }
      if (shipError) throw shipError;

      let { error: completeError } = await supabase.rpc("fn_mark_completed_staff", {
        p_order_id: orderId,
      });
      if (completeError && needsPaidFallback(completeError.message ?? "")) {
        const { error: payError } = await supabase
          .from("orders")
          .update({
            payment_status: "PAID",
            status: "PAID",
            paid_at: new Date().toISOString(),
          })
          .eq("id", orderId);
        if (payError) throw payError;

        const retry = await supabase.rpc("fn_mark_completed_staff", {
          p_order_id: orderId,
        });
        completeError = retry.error;
      }
      if (completeError) throw completeError;

      await notifyOrderEvent(orderId, "shipped");

      if (!options?.suppressSuccessToast) {
        toast({ intent: "success", message: "Order marked shipped and completed." });
      }
      if (!options?.skipReload) {
        await reload();
      }
      return true;
    } catch (err: any) {
      const message = err?.message ?? "Unable to mark order as shipped.";
      setErrorById((cur) => ({ ...cur, [orderId]: message }));
      if (!options?.suppressErrorToast) {
        toast({ intent: "error", message });
      }
      return false;
    } finally {
      setBusyById((cur) => ({ ...cur, [orderId]: false }));
    }
  }

  async function markAllReadyShipped(rows: any[], source: "manual" | "bulk") {
    const readyOrders = rows.filter(
      (order) => resolveShippingStage(order) === "PREPARING TO SHIP"
    );
    if (!readyOrders.length) return;

    const confirmed = window.confirm(
      `Mark ${readyOrders.length} order${readyOrders.length === 1 ? "" : "s"} as shipped and completed? Tracking numbers are optional.`
    );
    if (!confirmed) return;

    setBulkShipBusy(source);
    let success = 0;
    let failed = 0;

    try {
      for (const order of readyOrders) {
        const details = parseJsonMaybe(order.shipping_details) ?? {};
        const draft = getDraft(order.id);
        const courier = String(
          draft.courier || order.shipping_method || details.method || "LBC"
        ).trim();
        const ok = await markShippedAndComplete(
          String(order.id),
          courier,
          draft.tracking,
          {
            suppressSuccessToast: true,
            suppressErrorToast: true,
            skipReload: true,
          }
        );
        if (ok) success += 1;
        else failed += 1;
      }

      await reload();

      if (success > 0 && failed === 0) {
        toast({
          intent: "success",
          message: `${success} order${success === 1 ? "" : "s"} marked shipped and completed.`,
        });
      } else if (success > 0) {
        toast({
          intent: "success",
          message: `${success} order${success === 1 ? "" : "s"} marked shipped. ${failed} failed.`,
        });
      } else {
        toast({
          intent: "error",
          message: "Unable to mark the selected orders as shipped.",
        });
      }
    } finally {
      setBulkShipBusy(null);
    }
  }

  async function undoShipped(orderId: string) {
    setBusyById((cur) => ({ ...cur, [orderId]: true }));
    setErrorById((cur) => ({ ...cur, [orderId]: "" }));
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          shipping_status: "PREPARING TO SHIP",
          tracking_number: null,
          courier: null,
          shipped_at: null,
        })
        .eq("id", orderId);
      if (error) throw error;
      await reload();
    } catch (err: any) {
      setErrorById((cur) => ({
        ...cur,
        [orderId]: err?.message ?? "Action failed.",
      }));
    } finally {
      setBusyById((cur) => ({ ...cur, [orderId]: false }));
    }
  }

  async function setOddWheelsShipment(orderId: string, markShipped: boolean) {
    setBusyById((cur) => ({ ...cur, [orderId]: true }));
    setErrorById((cur) => ({ ...cur, [orderId]: "" }));
    try {
      const payload = markShipped
        ? {
            shipping_status: "SHIPPED",
            shipped_at: new Date().toISOString(),
            completed_at: null,
            courier: "PICKUP",
          }
        : {
            shipping_status: "PREPARING TO SHIP",
            shipped_at: null,
            completed_at: null,
            tracking_number: null,
            courier: null,
          };
      const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
      if (error) throw error;
      await reload();
    } catch (err: any) {
      setErrorById((cur) => ({
        ...cur,
        [orderId]: err?.message ?? "Update failed.",
      }));
      toast({
        intent: "error",
        message: err?.message ?? "Unable to update Odd Wheels shipment.",
      });
    } finally {
      setBusyById((cur) => ({ ...cur, [orderId]: false }));
    }
  }

  async function onCopy(o: any) {
    const payload = buildCopyPayload(o);
    const ok = await copyText(payload);
    if (!ok) return alert("Copy failed. Your browser blocked clipboard access.");

    setCopiedId(o.id);
    window.setTimeout(() => setCopiedId((cur) => (cur === o.id ? null : cur)), 1200);
  }

  async function onCopyPhone(phone: string) {
    const value = String(phone ?? "").trim();
    if (!value) return;

    const ok = await copyText(value);
    if (!ok) {
      toast({ intent: "error", message: "Copy failed. Your browser blocked clipboard access." });
      return;
    }

    toast({ intent: "success", message: "Phone copied." });
  }

  function onDraftChange(
    orderId: string,
    key: keyof ShippingDraft,
    value: string
  ) {
    setDrafts((cur) => ({
      ...cur,
      [orderId]: { ...(cur[orderId] ?? EMPTY_SHIPPING_DRAFT), [key]: value },
    }));
  }

  async function saveShippingMethod(orderId: string, methodRaw: string) {
    const method = String(methodRaw ?? "").trim();
    if (!method) return;

    setBusyById((cur) => ({ ...cur, [orderId]: true }));
    setErrorById((cur) => ({ ...cur, [orderId]: "" }));
    try {
      const order = orders.find((entry) => String(entry.id) === String(orderId));
      if (!order) throw new Error("Order not found.");

      const details = parseJsonMaybe(order.shipping_details) ?? {};
      const nextDetails = {
        ...details,
        method,
      };

      const { error } = await supabase
        .from("orders")
        .update({
          shipping_method: method,
          shipping_details: nextDetails,
          shipping_status: "PREPARING TO SHIP",
          shipped_at: null,
          completed_at: null,
        })
        .eq("id", orderId);
      if (error) throw error;

      setDrafts((cur) => ({
        ...cur,
        [orderId]: {
          ...(cur[orderId] ?? EMPTY_SHIPPING_DRAFT),
          courier: method,
        },
      }));
      toast({ intent: "success", message: `Shipping method updated to ${method}.` });
      await reload();
    } catch (err: any) {
      const message = err?.message ?? "Unable to update shipping method.";
      setErrorById((cur) => ({ ...cur, [orderId]: message }));
      toast({ intent: "error", message });
    } finally {
      setBusyById((cur) => ({ ...cur, [orderId]: false }));
    }
  }

  async function createManualShipmentOrder() {
    const customerName = manualCustomerName.trim();
    if (!customerName) {
      toast({ intent: "error", message: "Customer name is required." });
      return;
    }

    const shippingMethod = String(manualShippingMethod ?? "").trim().toUpperCase();
    if (!shippingMethod) {
      toast({ intent: "error", message: "Shipping method is required." });
      return;
    }

    setCreatingManualOrder(true);
    try {
      const sessionResult = await supabase.auth.getSession();
      const userId = String(sessionResult.data.session?.user?.id ?? "").trim();
      if (!userId) throw new Error("Staff session not found. Please sign in again.");

      const bookingReference = manualBookingReference.trim();
      const lbcPackage = normalizeLbcPackage(manualLbcPackage);
      const courier = normalizeCourier(shippingMethod);
      const shippingFee =
        shippingMethod === "PICKUP"
          ? 0
          : parseFeeDraft(manualShippingFeeDrafts[normalizeMethodKey(shippingMethod)] ?? "");
      const total = shippingFee;

      const shippingDetails: Record<string, any> = {
        method: shippingMethod,
        source: "shipments_manual_create",
        receiver_name: customerName,
        shipping_fee: shippingFee,
        total,
      };
      if (shippingMethod === "LBC") {
        shippingDetails.package = lbcPackage;
        shippingDetails.package_size = lbcPackage;
        if (bookingReference) {
          shippingDetails.lbc_booking_reference = bookingReference;
          shippingDetails.booking_reference = bookingReference;
        }
      }

      const insertPayload = {
        user_id: userId,
        customer_id: null,
        customer_name: customerName,
        contact: null,
        customer_phone: null,
        address: null,
        status: "PAID",
        order_status: "PAID",
        fulfillment_status: "PENDING",
        payment_method: "MANUAL",
        payment_status: "PAID",
        subtotal: 0,
        shipping_fee: shippingFee,
        discount: 0,
        voucher_id: null,
        shipping_discount: 0,
        discount_total: 0,
        total,
        shipping_method: shippingMethod,
        shipping_region: null,
        shipping_details: shippingDetails,
        shipping_status: "PREPARING TO SHIP",
        carrier: courier,
        courier,
        tracking_number: null,
        cop_fee: 0,
        lalamove_fee: 0,
        rush_fee: 0,
        priority_requested: false,
        priority_fee: 0,
        priority_approved: false,
        insurance_selected: false,
        insurance_fee: 0,
        payment_hold: false,
        inventory_deducted: false,
        paid_at: new Date().toISOString(),
        channel: "POS",
      };

      const { data, error, removedColumns } =
        await insertSingleRowWithSchemaFallback<{ id: string }>(
          supabase,
          "orders",
          insertPayload as any,
          "id"
        );
      if (error) throw error;
      if (removedColumns.length) {
        console.warn(
          "Inserted shipment order after dropping unknown columns:",
          removedColumns
        );
      }

      setManualCustomerName("");
      setManualBookingReference("");
      setManualLbcPackage("MINIBOX");

      const createdId = String(data?.id ?? "").slice(0, 8);
      const movedToUnbooked = shippingMethod === "LBC" && !bookingReference;
      toast({
        intent: "success",
        message: movedToUnbooked
          ? `Order #${createdId} created and added to Unbooked LBC.`
          : `Order #${createdId} created and added to To Ship.`,
      });

      setActiveTab("PREPARING TO SHIP");
      await reload();
    } catch (err: any) {
      toast({
        intent: "error",
        message: err?.message ?? "Unable to create shipment order.",
      });
    } finally {
      setCreatingManualOrder(false);
    }
  }

  function startEditingManualOrder(order: any) {
    setEditingManualOrderId(String(order?.id ?? ""));
    setManualOrderEditDraft(buildManualOrderEditDraft(order));
    setErrorById((cur) => ({ ...cur, [String(order?.id ?? "")]: "" }));
  }

  function cancelEditingManualOrder() {
    setEditingManualOrderId(null);
    setManualOrderEditDraft(EMPTY_MANUAL_ORDER_EDIT_DRAFT);
  }

  function onManualOrderEditDraftChange<K extends keyof ManualOrderEditDraft>(
    key: K,
    value: ManualOrderEditDraft[K]
  ) {
    setManualOrderEditDraft((cur) => ({ ...cur, [key]: value }));
  }

  function onManualShippingFeeDraftChange(value: string) {
    setManualShippingFeeDrafts((cur) => ({
      ...cur,
      [manualShippingMethodKey]: value,
    }));
  }

  async function saveManualOrderEdits(orderId: string) {
    const customerName = String(manualOrderEditDraft.customerName ?? "").trim();
    if (!customerName) {
      const message = "Customer name is required.";
      setErrorById((cur) => ({ ...cur, [orderId]: message }));
      toast({ intent: "error", message });
      return;
    }

    const shippingMethod =
      String(manualOrderEditDraft.shippingMethod ?? "").trim().toUpperCase() || "LBC";
    const bookingReference = String(manualOrderEditDraft.bookingReference ?? "").trim();
    const lbcPackage = normalizeLbcPackage(manualOrderEditDraft.lbcPackage);
    const shippingFee =
      shippingMethod === "PICKUP" ? 0 : parseFeeDraft(manualOrderEditDraft.shippingFee);

    setBusyById((cur) => ({ ...cur, [orderId]: true }));
    setErrorById((cur) => ({ ...cur, [orderId]: "" }));
    try {
      const order = orders.find((entry) => String(entry.id) === String(orderId));
      if (!order) throw new Error("Order not found.");
      const nextTotal = Math.max(0, Number(order.subtotal ?? 0) + shippingFee);

      const details = parseJsonMaybe(order.shipping_details) ?? {};
      const nextDetails: Record<string, any> = {
        ...details,
        source: "shipments_manual_create",
        method: shippingMethod,
        receiver_name: customerName,
        shipping_fee: shippingFee,
        total: nextTotal,
      };

      if (shippingMethod === "LBC") {
        nextDetails.package = lbcPackage;
        nextDetails.package_size = lbcPackage;
        if (bookingReference) {
          nextDetails.lbc_booking_reference = bookingReference;
          nextDetails.booking_reference = bookingReference;
        } else {
          delete nextDetails.lbc_booking_reference;
          delete nextDetails.booking_reference;
        }
      } else {
        delete nextDetails.package;
        delete nextDetails.package_size;
        delete nextDetails.lbc_booking_reference;
        delete nextDetails.booking_reference;
      }

      const courier = normalizeCourier(shippingMethod);
      const { error } = await supabase
        .from("orders")
        .update({
          customer_name: customerName,
          shipping_method: shippingMethod,
          shipping_details: nextDetails,
          carrier: courier,
          courier,
          shipping_fee: shippingFee,
          total: nextTotal,
        })
        .eq("id", orderId);
      if (error) throw error;

      setDrafts((cur) => ({
        ...cur,
        [orderId]: {
          ...(cur[orderId] ?? EMPTY_SHIPPING_DRAFT),
          courier: shippingMethod,
          bookingReference,
        },
      }));
      cancelEditingManualOrder();
      toast({ intent: "success", message: "Manual order updated." });
      await reload();
    } catch (err: any) {
      const message = err?.message ?? "Unable to update manual order.";
      setErrorById((cur) => ({ ...cur, [orderId]: message }));
      toast({ intent: "error", message });
    } finally {
      setBusyById((cur) => ({ ...cur, [orderId]: false }));
    }
  }

  async function deleteManualOrder(orderId: string) {
    const order = orders.find((entry) => String(entry.id) === String(orderId));
    const label = String(order?.customer_name ?? "").trim() || `#${String(orderId).slice(0, 8)}`;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Delete manual order ${label}?`);
      if (!confirmed) return;
    }

    setBusyById((cur) => ({ ...cur, [orderId]: true }));
    setErrorById((cur) => ({ ...cur, [orderId]: "" }));
    try {
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) throw error;

      if (editingManualOrderId === orderId) {
        cancelEditingManualOrder();
      }
      if (detailOrderId === orderId) {
        setDetailOrderId(null);
      }
      toast({ intent: "success", message: "Manual order deleted." });
      await reload();
    } catch (err: any) {
      const message = err?.message ?? "Unable to delete manual order.";
      setErrorById((cur) => ({ ...cur, [orderId]: message }));
      toast({ intent: "error", message });
    } finally {
      setBusyById((cur) => ({ ...cur, [orderId]: false }));
    }
  }

  async function saveBookingReference(orderId: string, referenceRaw: string) {
    const reference = String(referenceRaw ?? "").trim();
    if (!reference) {
      setErrorById((cur) => ({ ...cur, [orderId]: "Booking reference is required." }));
      return;
    }

    setBusyById((cur) => ({ ...cur, [orderId]: true }));
    setErrorById((cur) => ({ ...cur, [orderId]: "" }));
    try {
      const order = orders.find((entry) => String(entry.id) === String(orderId));
      if (!order) throw new Error("Order not found.");

      const details = parseJsonMaybe(order.shipping_details) ?? {};
      const nextDetails = {
        ...details,
        lbc_booking_reference: reference,
        booking_reference: reference,
      };

      const { error } = await supabase
        .from("orders")
        .update({
          shipping_status: "PREPARING TO SHIP",
          shipping_details: nextDetails,
        })
        .eq("id", orderId);
      if (error) throw error;

      setDrafts((cur) => ({
        ...cur,
        [orderId]: { ...(cur[orderId] ?? EMPTY_SHIPPING_DRAFT), bookingReference: reference },
      }));
      toast({
        intent: "success",
        message: "Booking reference saved. Order moved to To Ship.",
      });
      await reload();
    } catch (err: any) {
      setErrorById((cur) => ({
        ...cur,
        [orderId]: err?.message ?? "Unable to save booking reference.",
      }));
      toast({
        intent: "error",
        message: err?.message ?? "Unable to save booking reference.",
      });
    } finally {
      setBusyById((cur) => ({ ...cur, [orderId]: false }));
    }
  }

  const printShippingLabel = React.useCallback(
    async (order: any) => {
      const orderId = String(order?.id ?? "");
      if (!orderId) return;

      setPrintingOrderId(orderId);
      let client: any = null;
      try {
        const details = parseJsonMaybe(order.shipping_details) ?? {};
        const shippingMethod = String(details.method ?? order.shipping_method ?? "").trim();
        const shippingContainer = formatShippingContainer(shippingMethod, details);
        const draft = getDraft(orderId);
        const barcodeValue = String(
          draft.tracking ||
            order.tracking_number ||
            draft.bookingReference ||
            getLbcBookingReference(order, details) ||
            orderId.slice(0, 12)
        ).trim();

        const payload: ShippingLabelData = {
          customerName: getCustomerName(order, details),
          packaging: shippingContainer || shippingMethod || "Not set",
          barcodeValue,
        };
        const canvas = createShippingLabelCanvas(payload);

        if (labelPrintMode === "browser") {
          openShippingLabelPrintPreview(
            canvas,
            `Shipping label ${orderId.slice(0, 8)}`
          );
          toast({
            intent: "success",
            message: `Opened printable label for #${orderId.slice(0, 8)}.`,
          });
          return;
        }

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
          (typeof client.getPrintTaskType === "function" && client.getPrintTaskType()) || "B1";
        const printTask = client.abstraction.newPrintTask(printTaskName, {
          totalPages: 1,
          density: 3,
          speed: 1,
          labelType: lib.LabelType.WithGaps,
          statusPollIntervalMs: 100,
          statusTimeoutMs: 8000,
        });
        const encoded = lib.ImageEncoder.encodeCanvas(canvas, "top");

        await printTask.printInit();
        await printTask.printPage(encoded, 1);
        await printTask.waitForFinished();
        await printTask.printEnd();

        toast({
          intent: "success",
          message: `Printed shipping label for #${orderId.slice(0, 8)}.`,
        });
      } catch (error: any) {
        const message = String(error?.message ?? error ?? "Unable to print shipping label.");
        toast({ intent: "error", message });
      } finally {
        try {
          if (client && typeof client.startHeartbeat === "function") {
            client.startHeartbeat();
          }
        } catch {
          // Ignore heartbeat restart failures.
        }
        setPrintingOrderId((cur) => (cur === orderId ? null : cur));
      }
    },
    [ensureNiimbotClient, getDraft, labelPrintMode, niimbotState]
  );

  const renderShippingDetails = (o: any) => {
      const details = parseJsonMaybe(o.shipping_details) ?? {};
      const method = String(details.method ?? o.shipping_method ?? "");
      const isCop = String(method).toUpperCase() === "LBC" && Boolean(details.cop);
      const items = itemsByOrderId[o.id] ?? [];
      const shippingStage = resolveShippingStage(o, details);
      const rawStatus = String(o.shipping_status ?? "").trim().toUpperCase();
      const needsPreparing = !rawStatus || rawStatus === "NONE";
      const rushFee = Number(o.rush_fee ?? 0);
      const priorityFee = Number(o.priority_fee ?? 0);
      const draft = getDraft(o.id);
      const bookingReference = String(
        draft.bookingReference || getLbcBookingReference(o, details) || ""
      ).trim();
      const canSaveBookingReference = bookingReference.length > 0;
      const canMarkShipped = true;
      const busy = Boolean(busyById[o.id]);
      const error = errorById[o.id];
      const shippingSummary = buildShippingSummary(o, details);
      const createdAt = new Date(o.created_at).toLocaleString("en-PH");
      const customerName = getCustomerName(o, details);
      const customerPhone =
        details.receiver_phone ||
        details.phone ||
        o.customer_phone ||
        o.contact ||
        "";
      const customerAddress = cleanAddress(
        details.full_address || details.dropoff_address || o.address || details.address
      );
      const orderTotal = peso(Number(o.total ?? 0));

      return (
        <div className="rounded-2xl border border-white/10 bg-bg-900/30 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold">#{String(o.id).slice(0, 8)}</div>
              <div className="text-xs text-white/60">{createdAt}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/50">Total</div>
              <div className="text-base font-semibold">{orderTotal}</div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge className={shippingStatusBadge(shippingStage)}>
              {shippingStage}
            </Badge>
            <Badge>Channel: {o.channel}</Badge>
            <Badge>Status: {o.status}</Badge>
            <Badge>Payment: {o.payment_status}</Badge>
            <Badge>Shipping: {o.shipping_method}</Badge>
            {isCop ? (
              <Badge className="border-yellow-500/40 text-yellow-200">COP</Badge>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
              <div className="text-[11px] uppercase tracking-wide text-white/50">Customer</div>
              <div className="mt-1 font-medium">{customerName}</div>
              {customerPhone ? (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm text-white/70">{customerPhone}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 px-0"
                    title="Copy phone number"
                    aria-label="Copy phone number"
                    onClick={() => onCopyPhone(customerPhone)}
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
              {customerAddress ? (
                <div className="mt-1 text-xs text-white/60">{customerAddress}</div>
              ) : null}
            </div>
            <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
              <div className="text-[11px] uppercase tracking-wide text-white/50">Totals</div>
              <div className="mt-1 text-sm text-white/80">
                Subtotal: <span className="text-white">{peso(Number(o.subtotal ?? 0))}</span>
              </div>
              <div className="text-sm text-white/80">
                Shipping: <span className="text-white">{peso(Number(o.shipping_fee ?? 0))}</span>
              </div>
              <div className="text-sm text-white/80">
                Rush fee: <span className="text-white">{peso(rushFee)}</span>
              </div>
              {priorityFee > 0 ? (
                <div className="text-sm text-white/80">
                  Priority fee: <span className="text-white">{peso(priorityFee)}</span>
                </div>
              ) : null}
              <div className="mt-1 font-semibold">Total: {peso(Number(o.total ?? 0))}</div>
            </div>
          </div>

          {shippingStage === "TO BOOK" ? (
            <div className="mt-3 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-3 text-xs text-white/80">
              This LBC order is waiting for an LBC booking reference. Add the reference to move this order to To Ship.
            </div>
          ) : null}

          {shippingStage === "PREPARING TO SHIP" ? (
            <div className="mt-3 rounded-xl border border-accent-500/30 bg-accent-500/10 p-3 text-xs text-white/80">
              Ships on or before {shippingDaysLabel}. Add +P50 rush fee if requested.
            </div>
          ) : null}

          {shippingStage === "SHIPPED" ? (
            <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-white/80">
              Shipment is on the way. Track in the {o.shipping_method} app.
              <div className="mt-2 text-xs text-white/70">
                Courier: <span className="text-white/90">{o.courier ?? o.shipping_method ?? "-"}</span> | Tracking: <span className="text-white/90">{o.tracking_number ?? "-"}</span>
              </div>
            </div>
          ) : null}

          {shippingStage === "COMPLETED" ? (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-white/80">
              Completed{ o.completed_at ? ` on ${new Date(o.completed_at).toLocaleString("en-PH")}` : "."}
            </div>
          ) : null}

          {shippingStage === "TO BOOK" ? (
            <div className="mt-3 grid gap-2 md:grid-cols-[1.2fr_auto_auto]">
              <Input
                label="LBC booking reference"
                value={draft.bookingReference}
                placeholder="Enter or scan LBC reference"
                onChange={(e) => onDraftChange(o.id, "bookingReference", e.target.value)}
                className="h-9 text-sm"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="self-end"
                onClick={() => {
                  setScanMode("booking_reference");
                  setScanOrderId(o.id);
                  setScanCourier("");
                }}
                disabled={busy}
              >
                Scan reference
              </Button>
              <Button
                type="button"
                size="sm"
                className="self-end"
                onClick={() => saveBookingReference(o.id, draft.bookingReference)}
                disabled={busy || !canSaveBookingReference}
              >
                Save + move to To Ship
              </Button>
            </div>
          ) : null}

          {shippingStage === "PREPARING TO SHIP" ? (
            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1.2fr]">
              {isAdmin ? (
                <Select
                  label="Courier"
                  value={draft.courier || o.shipping_method || "LBC"}
                  onChange={(e) => {
                    const nextMethod = e.target.value;
                    onDraftChange(o.id, "courier", nextMethod);
                    void saveShippingMethod(o.id, nextMethod);
                  }}
                  className="h-9 text-sm"
                >
                  {buildCourierOptions(o.shipping_method).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  label="Courier"
                  value={draft.courier || o.shipping_method || ""}
                  disabled
                  className="h-9 text-sm"
                />
              )}
              <Input
                label="Tracking number (optional)"
                value={draft.tracking}
                placeholder="Enter tracking number"
                onChange={(e) => onDraftChange(o.id, "tracking", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            <details className="rounded-xl border border-white/10 bg-paper/5 p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Items ({items.length})
              </summary>
              {items.length === 0 ? (
                <div className="text-sm text-white/60 mt-2">
                  No items found for this order.
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {items.map((it: any, idx: number) => {
                    const thumb = getItemThumb(it);
                    const title = getItemTitle(it);
                    const condition = formatConditionLabel(
                      it?.condition ?? it?.product_variant?.condition,
                      { upper: true }
                    );
                    const itemCondition = String(
                      it?.condition ?? it?.product_variant?.condition ?? ""
                    ).toLowerCase();
                    const isNearMint = isNearMintCondition(itemCondition);
                    const isWithIssues = isIssueCondition(itemCondition);
                              const notes = String(
                                it?.public_notes ??
                                  it?.product_variant?.public_notes ??
                                  it?.issue_notes ??
                                  it?.product_variant?.issue_notes ??
                                  ""
                              ).trim();
                    const price = getItemPrice(it);
                    const qty = Number(it?.qty ?? 1);
                    const line = Number(it?.line_total ?? price * qty);

                              return (
                                <button
                                  key={`${o.id}-${idx}`}
                                  type="button"
                                  className="w-full rounded-xl border border-white/10 bg-bg-900/30 p-2 flex gap-3 text-left transition hover:border-white/20 hover:bg-bg-900/50"
                                  onClick={() => setSelectedItem(it)}
                                  aria-label={`View details for ${title}`}
                                >
                                  <div className="h-12 w-12 rounded-lg bg-bg-800 border border-white/10 overflow-hidden flex-shrink-0">
                                    {thumb ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={thumb}
                                        alt={title}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : null}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium truncate">{title}</div>
                                    <div className="text-xs text-white/60">
                                      {condition ? `${condition} | ` : ""}
                                      {qty} x {peso(price)} | Line: {peso(line)}
                                    </div>
                                    {notes ? (
                                      <div
                                        className={`mt-1 text-xs flex items-center gap-2 ${
                                          isWithIssues
                                            ? "text-red-200/80"
                                            : isNearMint
                                              ? "text-amber-200/80"
                                              : "text-white/60"
                                        }`}
                                      >
                                        {isWithIssues || isNearMint ? (
                                          <span
                                            className={`h-2 w-2 rounded-full ${
                                              isWithIssues ? "bg-red-400" : "bg-amber-400"
                                            }`}
                                            aria-hidden="true"
                                          />
                                        ) : null}
                                        <span>Notes: {notes}</span>
                                      </div>
                                    ) : null}
                                  </div>
                                </button>
                              );
                            })}
                </div>
              )}
            </details>

            <details className="group rounded-xl border border-white/10 bg-paper/5 p-3">
              <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold">
                <span>Shipping details</span>
                <span className="text-xs text-white/50 group-open:hidden">
                  View
                </span>
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {shippingSummary.length ? (
                  shippingSummary.map((row) => (
                    <div
                      key={row.label}
                      className="rounded-lg border border-white/10 bg-bg-900/40 p-3"
                    >
                      <div className="text-[11px] uppercase tracking-wide text-white/50">
                        {row.label}
                      </div>
                      <div className="mt-1 text-sm text-white/90 break-words">
                        {row.value}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-white/60">
                    No shipping details available.
                  </div>
                )}
              </div>
            </details>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => onCopy(o)}>
              {copiedId === o.id ? "Copied!" : "Copy details"}
            </Button>
            {shippingStage === "TO BOOK" ? (
              <Button
                size="sm"
                onClick={() => saveBookingReference(o.id, draft.bookingReference)}
                disabled={busy || !canSaveBookingReference}
              >
                Save booking ref + move to To Ship
              </Button>
            ) : null}
            {shippingStage === "PREPARING TO SHIP" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => printShippingLabel(o)}
                disabled={printingOrderId === o.id}
                className="gap-1.5"
              >
                {printingOrderId === o.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Printer className="h-3.5 w-3.5" />
                )}
                {printingOrderId === o.id ? "Printing..." : "Print label"}
              </Button>
            ) : null}

            {shippingStage === "PREPARING TO SHIP" ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    runRpc(o.id, "fn_add_rush_fee", {
                      p_order_id: o.id,
                      p_amount: 50,
                    })
                  }
                  disabled={busy || rushFee > 0}
                >
                  {rushFee > 0 ? "Rush fee added" : "Add Rush Fee (+?50)"}
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    markShippedAndComplete(
                      o.id,
                      draft.courier || o.shipping_method || "",
                      draft.tracking
                    )
                  }
                  disabled={busy || !canMarkShipped}
                >
                  Mark as shipped
                </Button>
                {needsPreparing ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      runRpc(o.id, "fn_set_shipping_preparing", {
                        p_order_id: o.id,
                      })
                    }
                    disabled={busy}
                  >
                    Set to preparing
                  </Button>
                ) : null}
              </>
            ) : null}

            {shippingStage === "SHIPPED" ? (
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    runRpc(o.id, "fn_mark_completed_staff", {
                      p_order_id: o.id,
                    })
                  }
                  disabled={busy}
                >
                  Mark as completed
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => undoShipped(o.id)}
                  disabled={busy}
                >
                  Undo shipped
                </Button>
              </>
            ) : null}
          </div>

          {error ? <div className="mt-2 text-sm text-red-200">{error}</div> : null}
        </div>
      );
  };

  const renderItemDetails = (it: any) => {
    const title = getItemTitle(it);
    const thumb = getItemThumb(it);
    const condition = formatConditionLabel(
      it?.condition ?? it?.product_variant?.condition,
      { upper: true }
    );
    const unitPrice = getItemPrice(it);
    const qty = Number(it?.qty ?? 1);
    const lineTotal = Number(it?.line_total ?? unitPrice * qty);
    const variantId = String(it?.variant_id ?? it?.product_variant?.id ?? "").trim();
    const barcode = String(it?.barcode ?? it?.product_variant?.barcode ?? "").trim();
    const issueNotes = String(
      it?.issue_notes ?? it?.product_variant?.issue_notes ?? ""
    ).trim();
    const publicNotes = String(
      it?.public_notes ?? it?.product_variant?.public_notes ?? ""
    ).trim();
    const notesCombined = [publicNotes, issueNotes].filter(Boolean).join(" | ");

    return (
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white p-4">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt={title}
              className="h-[300px] w-full rounded-xl object-contain"
            />
          ) : (
            <div className="h-[300px] w-full rounded-xl bg-bg-800" />
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-4">
            <div className="flex items-center justify-between text-sm text-white/70">
              <span>Selected condition</span>
              <span className="text-white">{condition || "-"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-white/70">
              <span>Price</span>
              <span className="text-white font-semibold">{peso(unitPrice)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-white/70">
              <span>Qty</span>
              <span className="text-white">{qty}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-4">
            <div className="text-xs uppercase tracking-wide text-white/50">
              Conditions
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-white/80">
              <span>{condition || "-"}</span>
              <span>
                {peso(unitPrice)} - {qty} pcs
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-4">
            <div className="text-xs uppercase tracking-wide text-white/50">Notes</div>
            <div className="mt-2 text-sm text-white/80">
              {notesCombined || "No notes."}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            Photos are for reference only. For more photos/details, please message our Facebook page.
          </div>

          <div className="rounded-2xl border border-white/10 bg-bg-900/40 p-3 text-xs text-white/60">
            Variant ID: {variantId || "-"} | Barcode: {barcode || "-"} | Line total: {peso(lineTotal)}
          </div>
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Shipping Status</div>
            <div className="text-sm text-white/60">
              Paid orders ready for shipping updates and tracking.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge>{paidOrders.length}</Badge>
            <Link
              href={
                pathname.startsWith("/admin")
                  ? "/admin/shipments/logs"
                  : "/cashier/shipments/logs"
              }
              className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 px-3 text-sm text-white hover:bg-paper/5"
              aria-label={`Shipping logs (${paidOrders.length})`}
            >
              <ScrollText className="h-4 w-4" />
              <span className="ml-1 text-xs text-white/70">{paidOrders.length}</span>
            </Link>
          </div>
        </CardHeader>

        <CardBody className="space-y-4">
          {activeTab === "PREPARING TO SHIP" && oddWheelsItems.length ? (
            <details className="rounded-2xl border border-white/10 bg-bg-900/20 p-3" open>
              <summary className="flex cursor-pointer items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Odd Wheels</div>
                  <div className="text-xs text-white/60">
                    Sold items from Inventory quick sell. Toggle check to mark shipped or unshipped.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{oddWheelsItems.length} item{oddWheelsItems.length > 1 ? "s" : ""}</Badge>
                  <Badge className="border-emerald-500/30 text-emerald-200">
                    {oddWheelsCounts.shipped} shipped
                  </Badge>
                  <Badge className="border-yellow-500/30 text-yellow-200">
                    {oddWheelsCounts.unshipped} unshipped
                  </Badge>
                </div>
              </summary>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={oddWheelsView === "UNSHIPPED" ? "primary" : "ghost"}
                  onClick={() => setOddWheelsView("UNSHIPPED")}
                >
                  Unshipped ({oddWheelsCounts.unshipped})
                </Button>
                <Button
                  size="sm"
                  variant={oddWheelsView === "SHIPPED" ? "primary" : "ghost"}
                  onClick={() => setOddWheelsView("SHIPPED")}
                >
                  Shipped ({oddWheelsCounts.shipped})
                </Button>
                <Button
                  size="sm"
                  variant={oddWheelsView === "ALL" ? "primary" : "ghost"}
                  onClick={() => setOddWheelsView("ALL")}
                >
                  All ({oddWheelsItems.length})
                </Button>
              </div>
              <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {!oddWheelsVisibleItems.length ? (
                  <div className="rounded-xl border border-white/10 bg-paper/5 p-3 text-sm text-white/60">
                    No items in this view.
                  </div>
                ) : null}
                {oddWheelsVisibleItems.map((row) => {
                  const order = row.order;
                  const item = row.item;
                  const shippingStatus = normalizeShippingStatus(order?.shipping_status);
                  const isShipped = shippingStatus === "SHIPPED" || shippingStatus === "COMPLETED";
                  const busy = Boolean(busyById[order.id]);
                  const title = getItemTitle(item);
                  const condition = formatConditionLabel(
                    item?.condition ?? item?.product_variant?.condition,
                    { upper: true }
                  );
                  const qty = Number(item?.qty ?? 1);
                  return (
                    <div
                      key={row.key}
                      className="rounded-xl border border-white/10 bg-paper/5 p-2.5 flex items-center gap-2.5"
                    >
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 p-0"
                        aria-label={isShipped ? "Mark unshipped" : "Mark shipped"}
                        title={isShipped ? "Mark unshipped" : "Mark shipped"}
                        disabled={busy}
                        onClick={() => setOddWheelsShipment(order.id, !isShipped)}
                      >
                        {isShipped ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                        ) : (
                          <Circle className="h-5 w-5 text-white/50" />
                        )}
                      </Button>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{title}</div>
                        <div className="text-xs text-white/60">
                          #{String(order.id).slice(0, 8)}
                          {condition ? ` - ${condition}` : ""}
                          {qty ? ` - Qty ${qty}` : ""}
                        </div>
                        {errorById[order.id] ? (
                          <div className="mt-1 text-xs text-red-200">{errorById[order.id]}</div>
                        ) : null}
                      </div>
                      <Badge className={isShipped ? "border-emerald-500/30 text-emerald-200" : "border-yellow-500/30 text-yellow-200"}>
                        {isShipped ? "Shipped" : "Unshipped"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}

          {activeTab === "PREPARING TO SHIP" ? (
            <div className="rounded-2xl border border-white/10 bg-bg-900/20 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Create shipment order</div>
                  <div className="text-xs text-white/60">
                    LBC without booking reference goes to Unbooked first. Other couriers go directly to To Ship.
                  </div>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  label="Customer name"
                  value={manualCustomerName}
                  onChange={(e) => setManualCustomerName(e.target.value)}
                  placeholder="Enter customer name"
                  className="h-9 text-sm"
                />
                {manualShippingMethod.toUpperCase() === "LBC" ? (
                  <Input
                    label="LBC booking ref (optional)"
                    value={manualBookingReference}
                    onChange={(e) => setManualBookingReference(e.target.value)}
                    placeholder="Leave blank to send to Unbooked"
                    className="h-9 text-sm"
                  />
                ) : (
                  <Input
                    label="LBC booking ref"
                    value=""
                    disabled
                    placeholder="Only for LBC"
                    className="h-9 text-sm opacity-60"
                  />
                )}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Select
                  label="Shipping method"
                  value={manualShippingMethod}
                  onChange={(e) => setManualShippingMethod(e.target.value)}
                  className="h-9 text-sm"
                >
                  {MANUAL_SHIPPING_METHOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                {manualShippingMethod.toUpperCase() === "LBC" ? (
                  <Select
                    label="LBC packaging"
                    value={manualLbcPackage}
                    onChange={(e) => setManualLbcPackage(e.target.value)}
                    className="h-9 text-sm"
                  >
                    {LBC_PACKAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Select
                    label="LBC packaging"
                    value="MINIBOX"
                    disabled
                    className="h-9 text-sm opacity-60"
                  >
                    <option value="MINIBOX">Only for LBC</option>
                  </Select>
                )}
              </div>
              <div className="grid gap-2 md:grid-cols-[1fr_280px]">
                <Input
                  label="Shipping fee (PHP)"
                  value={manualShippingFeeInput}
                  onChange={(e) => onManualShippingFeeDraftChange(e.target.value)}
                  placeholder={manualShippingMethodKey === "PICKUP" ? "0" : "Enter shipping fee"}
                  className="h-9 text-sm"
                  inputMode="decimal"
                  disabled={manualShippingMethodKey === "PICKUP"}
                  hint={
                    manualShippingMethodKey === "PICKUP"
                      ? "Pickup keeps the shipping fee at PHP 0."
                      : "Each shipping method keeps its own fee while you switch couriers."
                  }
                />
                <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-white/50">
                    Current total
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    Method: <span className="text-white">{manualShippingMethod}</span>
                  </div>
                  <div className="text-sm text-white/70">
                    Shipping fee: <span className="text-white">{peso(manualShippingFeeValue)}</span>
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    Total: {peso(manualOrderTotal)}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                <div className="text-[11px] uppercase tracking-wide text-white/50">
                  Saved method totals
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {manualMethodFeePreview.map((option) => (
                    <Badge
                      key={option.value}
                      className={
                        option.methodKey === manualShippingMethodKey
                          ? "border-orange-500/40 text-orange-200"
                          : "border-white/10 text-white/65"
                      }
                    >
                      {option.label}: {peso(option.amount)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void createManualShipmentOrder()}
                  disabled={creatingManualOrder}
                >
                  {creatingManualOrder ? "Creating..." : "Create order"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {SHIPPING_TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <Button
                  key={tab.key}
                  size="sm"
                  variant={active ? "primary" : "ghost"}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label} ({tabCounts[tab.key] ?? 0})
                </Button>
              );
            })}
          </div>

          {manualPanelOrders.length > 0 ? (
            <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Manual orders</div>
                  <div className="text-xs text-white/60">
                    Shipment orders created from this page for label printing.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-orange-500/30 text-orange-200">
                    {manualPanelOrders.length}{" "}
                    {manualPanelOrders.length === 1 ? "order" : "orders"}
                  </Badge>
                  {activeTab === "PREPARING TO SHIP" && manualPanelCounts.toBook > 0 ? (
                    <Badge className={shippingStatusBadge("TO BOOK")}>
                      {manualPanelCounts.toBook} to book
                    </Badge>
                  ) : null}
                  {activeTab === "PREPARING TO SHIP" && manualPanelCounts.preparing > 0 ? (
                    <Badge className={shippingStatusBadge("PREPARING TO SHIP")}>
                      {manualPanelCounts.preparing} ready
                    </Badge>
                  ) : null}
                  {activeTab === "PREPARING TO SHIP" && manualPanelCounts.preparing > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void markAllReadyShipped(manualPanelOrders, "manual")}
                      disabled={bulkShipBusy !== null}
                    >
                      {bulkShipBusy === "manual"
                        ? "Marking all..."
                        : "Mark all ready shipped"}
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2">
                {manualPanelOrders.map((o: any) => {
                  const details = parseJsonMaybe(o.shipping_details) ?? {};
                  const method = String(details.method ?? o.shipping_method ?? "").trim();
                  const stage = resolveShippingStage(o, details);
                  const customerName = getCustomerName(o, details);
                  const customerPhone = String(
                    details.receiver_phone ||
                      details.phone ||
                      o.customer_phone ||
                      o.contact ||
                      ""
                  ).trim();
                  const addressOrBranch = getAddressOrBranch(method, details, o);
                  const shippingContainer = formatShippingContainer(method, details);
                  const courierSummary =
                    shippingContainer || String(o.shipping_method ?? method ?? "").trim();
                  const orderTotalValue = Number(o.total ?? 0);
                  const orderTotal = orderTotalValue > 0 ? peso(orderTotalValue) : "";
                  const lbcReference = getLbcBookingReference(o, details);
                  const draft = getDraft(o.id);
                  const courierValue =
                    String(draft.courier || o.shipping_method || method || "LBC").trim() ||
                    "LBC";
                  const canSaveBooking = draft.bookingReference.trim().length > 0;
                  const busy = Boolean(busyById[o.id]);
                  const isEditing = editingManualOrderId === String(o.id);
                  const editShippingMethod =
                    String(manualOrderEditDraft.shippingMethod ?? "").trim().toUpperCase() ||
                    "LBC";
                  const editIsLbc = editShippingMethod === "LBC";
                  const editShippingFeeValue =
                    editShippingMethod === "PICKUP"
                      ? 0
                      : parseFeeDraft(manualOrderEditDraft.shippingFee);
                  const editTotalPreview = Math.max(
                    0,
                    Number(o.subtotal ?? 0) + editShippingFeeValue
                  );

                  return (
                    <div key={o.id} className="rounded-xl border border-white/10 bg-paper/5 p-3">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-medium truncate">{customerName}</div>
                            <Badge className="border-orange-500/30 text-orange-200">
                              Manual
                            </Badge>
                            <Badge className={shippingStatusBadge(stage)}>
                              {shippingStageLabel(stage)}
                            </Badge>
                            {shippingContainer ? <Badge>{shippingContainer}</Badge> : null}
                          </div>
                          <div className="mt-1 text-xs text-white/50">
                            #{String(o.id).slice(0, 8)}
                            {customerPhone ? ` - ${customerPhone}` : ""}
                            {orderTotal ? ` - ${orderTotal}` : ""}
                          </div>
                          <div className="mt-1 text-xs text-white/70">
                            {courierSummary || "-"}
                            {addressOrBranch ? ` - ${addressOrBranch}` : ""}
                          </div>
                          {lbcReference ? (
                            <div className="mt-1 text-xs text-white/60">
                              Booking ref: {lbcReference}
                            </div>
                          ) : null}
                          {errorById[o.id] ? (
                            <div className="mt-1 text-xs text-red-200">{errorById[o.id]}</div>
                          ) : null}
                        </div>
                        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                          {isEditing ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => saveManualOrderEdits(o.id)}
                                disabled={busy}
                              >
                                Save
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={cancelEditingManualOrder}
                                disabled={busy}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteManualOrder(o.id)}
                                disabled={busy}
                              >
                                Delete
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => onCopy(o)}
                                className="gap-1.5"
                              >
                                <ClipboardCopy className="h-3.5 w-3.5" />
                                Copy
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setDetailOrderId(String(o.id))}
                                className="gap-1.5"
                              >
                                <ScrollText className="h-3.5 w-3.5" />
                                Details
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => printShippingLabel(o)}
                                disabled={busy || printingOrderId === o.id}
                                className="gap-1.5"
                              >
                                {printingOrderId === o.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Printer className="h-3.5 w-3.5" />
                                )}
                                {printingOrderId === o.id ? "Printing..." : "Print label"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditingManualOrder(o)}
                                disabled={busy}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteManualOrder(o.id)}
                                disabled={busy}
                              >
                                Delete
                              </Button>
                              {stage === "SHIPPED" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() =>
                                    runRpc(o.id, "fn_mark_completed_staff", {
                                      p_order_id: o.id,
                                    })
                                  }
                                  disabled={busy}
                                >
                                  Mark completed
                                </Button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="mt-3 space-y-2">
                          <div className="grid gap-2 md:grid-cols-2">
                            <Input
                              label="Customer name"
                              value={manualOrderEditDraft.customerName}
                              onChange={(e) =>
                                onManualOrderEditDraftChange("customerName", e.target.value)
                              }
                              placeholder="Customer name"
                              className="h-8 text-xs"
                            />
                            {editIsLbc ? (
                              <Input
                                label="LBC booking ref (optional)"
                                value={manualOrderEditDraft.bookingReference}
                                onChange={(e) =>
                                  onManualOrderEditDraftChange("bookingReference", e.target.value)
                                }
                                placeholder="Leave blank to send to Unbooked"
                                className="h-8 text-xs"
                              />
                            ) : (
                              <Input
                                label="LBC booking ref"
                                value=""
                                disabled
                                placeholder="Only for LBC"
                                className="h-8 text-xs opacity-60"
                              />
                            )}
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <Select
                              label="Shipping method"
                              value={manualOrderEditDraft.shippingMethod}
                              onChange={(e) =>
                                onManualOrderEditDraftChange("shippingMethod", e.target.value)
                              }
                              className="h-8 text-xs"
                            >
                              {MANUAL_SHIPPING_METHOD_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                            {editIsLbc ? (
                              <Select
                                label="LBC packaging"
                                value={manualOrderEditDraft.lbcPackage}
                                onChange={(e) =>
                                  onManualOrderEditDraftChange(
                                    "lbcPackage",
                                    normalizeLbcPackage(e.target.value)
                                  )
                                }
                                className="h-8 text-xs"
                              >
                                {LBC_PACKAGE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                            ) : (
                              <Select
                                label="LBC packaging"
                                value="MINIBOX"
                                disabled
                                className="h-8 text-xs opacity-60"
                              >
                                <option value="MINIBOX">Only for LBC</option>
                              </Select>
                            )}
                          </div>
                          <div className="grid gap-2 md:grid-cols-[1fr_220px]">
                            <Input
                              label="Shipping fee (PHP)"
                              value={editShippingMethod === "PICKUP" ? "0" : manualOrderEditDraft.shippingFee}
                              onChange={(e) =>
                                onManualOrderEditDraftChange("shippingFee", e.target.value)
                              }
                              placeholder={editShippingMethod === "PICKUP" ? "0" : "Shipping fee"}
                              className="h-8 text-xs"
                              inputMode="decimal"
                              disabled={editShippingMethod === "PICKUP"}
                              hint={
                                editShippingMethod === "PICKUP"
                                  ? "Pickup keeps the shipping fee at PHP 0."
                                  : undefined
                              }
                            />
                            <div className="rounded-xl border border-white/10 bg-paper/5 p-3">
                              <div className="text-[11px] uppercase tracking-wide text-white/50">
                                Total
                              </div>
                              <div className="mt-1 text-xs text-white/70">
                                Shipping fee:{" "}
                                <span className="text-white">{peso(editShippingFeeValue)}</span>
                              </div>
                              <div className="mt-1 text-sm font-semibold">
                                {peso(editTotalPreview)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : stage === "TO BOOK" ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Select
                            value={courierValue}
                            onChange={(e) => {
                              const nextMethod = e.target.value;
                              onDraftChange(o.id, "courier", nextMethod);
                              void saveShippingMethod(o.id, nextMethod);
                            }}
                            className="h-8 w-full px-2 text-xs sm:w-40"
                            disabled={busy}
                          >
                            {buildCourierOptions(o.shipping_method).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </Select>
                          <Input
                            value={draft.bookingReference}
                            placeholder="LBC booking reference"
                            onChange={(e) =>
                              onDraftChange(o.id, "bookingReference", e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && canSaveBooking && !busy) {
                                saveBookingReference(o.id, draft.bookingReference);
                              }
                            }}
                            className="h-8 w-full px-3 text-xs sm:w-56"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setScanMode("booking_reference");
                              setScanOrderId(o.id);
                              setScanCourier("");
                            }}
                            disabled={busy}
                          >
                            Scan
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => saveBookingReference(o.id, draft.bookingReference)}
                            disabled={busy || !canSaveBooking}
                          >
                            Save booking ref
                          </Button>
                        </div>
                      ) : null}

                      {isEditing ? null : stage === "PREPARING TO SHIP" ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Select
                            value={courierValue}
                            onChange={(e) => {
                              const nextMethod = e.target.value;
                              onDraftChange(o.id, "courier", nextMethod);
                              void saveShippingMethod(o.id, nextMethod);
                            }}
                            className="h-8 w-full px-2 text-xs sm:w-36"
                            disabled={busy}
                          >
                            {buildCourierOptions(o.shipping_method).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </Select>
                          <Input
                            value={draft.tracking}
                            placeholder="Waybill / tracking (optional)"
                            onChange={(e) => onDraftChange(o.id, "tracking", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !busy) {
                                const scanned = String(
                                  (e.currentTarget as HTMLInputElement).value ?? ""
                                ).trim();
                                e.preventDefault();
                                onDraftChange(o.id, "tracking", scanned);
                                void markShippedAndComplete(o.id, courierValue, scanned);
                              }
                            }}
                            className="h-8 w-full px-3 text-xs sm:w-56"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setScanMode("tracking");
                              setScanCourier(courierValue);
                              setScanOrderId(o.id);
                            }}
                            disabled={busy}
                          >
                            Scan
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              markShippedAndComplete(o.id, courierValue, draft.tracking)
                            }
                            disabled={busy}
                          >
                            Mark shipped
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {activeTab === "PREPARING TO SHIP" ? (
            <div className="space-y-3">
              {toBookOrders.length > 0 ? (
                <div className="rounded-2xl border border-white/10 bg-bg-900/20 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Unbooked LBC orders</div>
                      <div className="text-xs text-white/60">
                        Add LBC booking reference first, then the order moves into tracking entry below.
                      </div>
                    </div>
                    <Badge>{toBookOrders.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {toBookOrders.map((o: any) => {
                      const details = parseJsonMaybe(o.shipping_details) ?? {};
                      const customerName = getCustomerName(o, details);
                      const contact = String(
                        details.receiver_phone || details.phone || o.customer_phone || o.contact || ""
                      ).trim();
                      const addressOrBranch = getAddressOrBranch("LBC", details, o);
                      const draft = getDraft(o.id);
                      const canSave = draft.bookingReference.trim().length > 0;
                      const busy = Boolean(busyById[o.id]);

                      return (
                        <div key={o.id} className="rounded-xl border border-white/10 bg-paper/5 p-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{customerName}</div>
                              <div className="text-xs text-white/50">
                                #{String(o.id).slice(0, 8)} - LBC
                                {contact ? ` - ${contact}` : ""}
                              </div>
                              {addressOrBranch ? (
                                <div className="mt-0.5 text-xs text-white/60 truncate">
                                  {addressOrBranch}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                              <Select
                                value={draft.courier || o.shipping_method || "LBC"}
                                onChange={(e) => {
                                  const nextMethod = e.target.value;
                                  onDraftChange(o.id, "courier", nextMethod);
                                  void saveShippingMethod(o.id, nextMethod);
                                }}
                                className="h-8 w-full px-2 text-xs sm:w-40"
                                disabled={busy}
                              >
                                {buildCourierOptions(o.shipping_method).map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </Select>
                              <Input
                                value={draft.bookingReference}
                                placeholder="LBC booking reference"
                                onChange={(e) =>
                                  onDraftChange(o.id, "bookingReference", e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && canSave && !busy) {
                                    saveBookingReference(o.id, draft.bookingReference);
                                  }
                                }}
                                className="h-8 w-full px-3 text-xs sm:w-56"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setScanMode("booking_reference");
                                  setScanOrderId(o.id);
                                  setScanCourier("");
                                }}
                                disabled={busy}
                              >
                                Scan
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => saveBookingReference(o.id, draft.bookingReference)}
                                disabled={busy || !canSave}
                              >
                                Save booking ref
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/10 bg-bg-900/20 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Bulk tracking entry</div>
                    <div className="text-xs text-white/60">
                      Type or scan a waybill number if you have one. Leave it blank to mark shipped without tracking.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{bulkOrders.length}</Badge>
                    {bulkOrders.length > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void markAllReadyShipped(bulkOrders, "bulk")}
                        disabled={bulkShipBusy !== null}
                      >
                        {bulkShipBusy === "bulk"
                          ? "Marking all..."
                          : "Mark all shown shipped"}
                      </Button>
                    ) : null}
                    {labelPrintMode === "bluetooth" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant={niimbotState === "connected" ? "secondary" : "ghost"}
                          onClick={connectNiimbot}
                          disabled={niimbotState === "connecting"}
                          className="gap-1.5"
                        >
                          {niimbotState === "connecting" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : niimbotState === "connected" ? (
                            <BluetoothConnected className="h-3.5 w-3.5" />
                          ) : (
                            <Bluetooth className="h-3.5 w-3.5" />
                          )}
                          {niimbotState === "connected"
                            ? `Niimbot ${niimbotPrinterName ? `(${niimbotPrinterName})` : "Connected"}`
                            : niimbotState === "connecting"
                              ? "Connecting Niimbot..."
                              : "Connect Niimbot B1"}
                        </Button>
                        {niimbotState === "connected" ? (
                          <Button type="button" size="sm" variant="ghost" onClick={disconnectNiimbot}>
                            Disconnect
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      <div className="max-w-[18rem] text-right text-xs text-white/60">
                        This browser uses printable label preview instead of direct Niimbot Bluetooth.
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {courierTabs.map((tab) => {
                    const active = activeCourier === tab;
                    return (
                      <Button
                        key={tab}
                        size="sm"
                        variant={active ? "primary" : "ghost"}
                        onClick={() => setActiveCourier(tab)}
                      >
                        {tab === "ALL" ? "All couriers" : tab}
                        {tab === "ALL"
                          ? ` (${preparingOrders.length})`
                          : ` (${courierGroups[tab]?.length ?? 0})`}
                      </Button>
                    );
                  })}
                </div>
                {bulkOrders.length === 0 ? (
                  <div className="text-sm text-white/60">No orders ready for tracking.</div>
                ) : (
                  <div className="space-y-2">
                    {bulkOrders.map((o: any) => {
                      const details = parseJsonMaybe(o.shipping_details) ?? {};
                      const customerName = getCustomerName(o, details);
                      const draft = getDraft(o.id);
                      const courierLabel = String(draft.courier || o.shipping_method || "").trim();
                      const canMarkShipped = true;
                      const busy = Boolean(busyById[o.id]);

                      return (
                        <div key={o.id} className="rounded-xl border border-white/10 bg-paper/5 p-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{customerName}</div>
                              <div className="text-xs text-white/50">
                                #{String(o.id).slice(0, 8)}
                                {courierLabel ? ` - ${courierLabel}` : ""}
                              </div>
                            </div>
                            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                              <Select
                                value={draft.courier || o.shipping_method || "LBC"}
                                onChange={(e) => {
                                  const nextMethod = e.target.value;
                                  onDraftChange(o.id, "courier", nextMethod);
                                  void saveShippingMethod(o.id, nextMethod);
                                }}
                                className="h-8 w-full px-2 text-xs sm:w-36"
                                disabled={busy}
                              >
                                {buildCourierOptions(o.shipping_method).map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </Select>
                              <Input
                                value={draft.tracking}
                                placeholder="Waybill / tracking (optional)"
                                onChange={(e) => onDraftChange(o.id, "tracking", e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !busy) {
                                    const scanned = String(
                                      (e.currentTarget as HTMLInputElement).value ?? ""
                                    ).trim();
                                    e.preventDefault();
                                    onDraftChange(o.id, "tracking", scanned);
                                    void markShippedAndComplete(
                                      o.id,
                                      draft.courier || o.shipping_method || "",
                                      scanned
                                    );
                                  }
                                }}
                                className="h-8 w-full px-3 text-xs sm:w-56"
                              />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setScanMode("tracking");
                                    setScanCourier(draft.courier || o.shipping_method || "");
                                    setScanOrderId(o.id);
                                  }}
                                  disabled={busy}
                                >
                                Scan
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => printShippingLabel(o)}
                                disabled={busy || printingOrderId === o.id}
                                className="gap-1.5"
                              >
                                {printingOrderId === o.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Printer className="h-3.5 w-3.5" />
                                )}
                                {printingOrderId === o.id ? "Printing..." : "Print label"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() =>
                                  markShippedAndComplete(
                                    o.id,
                                    draft.courier || o.shipping_method || "",
                                    draft.tracking
                                  )
                                }
                                disabled={busy || !canMarkShipped}
                              >
                                Mark shipped
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="text-white/60">Loading...</div>
          ) : filtered.length === 0 && !hasActiveTabPanels ? (
            <div className="text-white/60">No orders in this stage.</div>
          ) : (
            <div className="space-y-3">
            {filtered.map((o: any) => {
              const details = parseJsonMaybe(o.shipping_details) ?? {};
              const method = String(details.method ?? o.shipping_method ?? "");
              const shippingStage = resolveShippingStage(o, details);
              const customerName = getCustomerName(o, details);
              const customerPhone =
                details.receiver_phone ||
                details.phone ||
                o.customer_phone ||
                o.contact ||
                "";
              const busy = Boolean(busyById[o.id]);
              const addressOrBranch = getAddressOrBranch(method, details, o);
              const orderTotal = peso(Number(o.total ?? 0));
              const shippingContainer = formatShippingContainer(method, details);
              const courierSummary =
                shippingContainer || String(o.shipping_method ?? method ?? "").trim();

              return (
                <div key={o.id} className="rounded-2xl bg-bg-900/30 p-4">
                  <div className="rounded-xl border border-white/10 bg-paper/5 p-2 sm:p-3">
                    <div className="grid gap-1 text-[10px] sm:text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-[11px] font-medium sm:text-sm">
                          {customerName || "-"}
                        </div>
                        <div className="text-[11px] font-semibold sm:text-sm">
                          {orderTotal}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-white/70">
                          {customerPhone || "-"}
                        </div>
                        <div className="min-w-0 truncate text-right text-white/80">
                          {courierSummary || "-"}
                        </div>
                      </div>
                      <div className="min-w-0 truncate text-white/70">
                        {addressOrBranch || "-"}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-nowrap items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-10 w-10 p-0 text-white"
                        title={copiedId === o.id ? "Copied" : "Copy"}
                        aria-label={copiedId === o.id ? "Copied" : "Copy"}
                        onClick={() => onCopy(o)}
                      >
                        <ClipboardCopy className="h-6 w-6 text-white" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-10 w-10 p-0 text-white"
                        title="Show details"
                        aria-label="Show details"
                        onClick={() => setDetailOrderId(String(o.id))}
                      >
                        <ScrollText className="h-6 w-6 text-white" />
                      </Button>
                      {shippingStage === "PREPARING TO SHIP" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-10 px-3 text-xs gap-1.5"
                          onClick={() => printShippingLabel(o)}
                          disabled={busy || printingOrderId === o.id}
                        >
                          {printingOrderId === o.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Printer className="h-3.5 w-3.5" />
                          )}
                          {printingOrderId === o.id ? "Printing..." : "Print label"}
                        </Button>
                      ) : null}
                      {shippingStage === "SHIPPED" ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            runRpc(o.id, "fn_mark_completed_staff", {
                              p_order_id: o.id,
                            })
                          }
                          disabled={busy}
                          className="h-10 px-3 text-xs"
                        >
                          Mark completed
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}

          <OrderDetailsModal
            open={Boolean(detailOrderId)}
            onClose={() => setDetailOrderId(null)}
            title={
              selectedOrder
                ? `Order #${String(selectedOrder.id).slice(0, 8)}`
                : "Order details"
            }
          >
            {selectedOrder ? renderShippingDetails(selectedOrder) : null}
          </OrderDetailsModal>

      <OrderDetailsModal
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={
              selectedItem ? (
                <div>
                  <div className="text-xs uppercase tracking-wide text-white/50">
                    Item Preview
                  </div>
                  <div className="text-lg font-semibold">
                    {getItemTitle(selectedItem)}
                  </div>
                </div>
              ) : (
                "Item details"
              )
            }
          >
            {selectedItem ? renderItemDetails(selectedItem) : null}
          </OrderDetailsModal>
        </CardBody>
      </Card>
      <BarcodeScannerModal
        open={Boolean(scanOrderId)}
        onClose={() => {
          setScanOrderId(null);
          setScanCourier("");
          setScanMode("tracking");
        }}
        title={
          scanMode === "booking_reference"
            ? "Scan LBC booking reference"
            : "Scan tracking number"
        }
        description={
          scanMode === "booking_reference"
            ? "Point the camera at the LBC reference barcode. The code will fill in automatically."
            : "Point the camera at the waybill barcode. The code will fill in automatically."
        }
        onScan={async (value) => {
          const orderId = scanOrderId;
          const scannedValue = String(value ?? "").trim();
          if (!orderId || !scannedValue) return;
          if (scanMode === "booking_reference") {
            onDraftChange(orderId, "bookingReference", scannedValue);
            await saveBookingReference(orderId, scannedValue);
          } else {
            onDraftChange(orderId, "tracking", scannedValue);
            await markShippedAndComplete(orderId, scanCourier, scannedValue);
          }
          setScanOrderId(null);
          setScanCourier("");
          setScanMode("tracking");
        }}
      />
    </div>
  );
}

