"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPHP } from "@/lib/money";
import {
  inferFieldsFromTitle,
  normalizeBrandAlias,
  normalizeTitleBrandAliases,
} from "@/lib/titleInference";
import { formatConditionLabel } from "@/lib/conditions";

type SheetRow = {
  id: string;
  condition: string | null;
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

const PAGE_SIZE = 200;
const EXPORT_PAGE_SIZE = 1000;
const CARD_EXPORT_SIZE = 1080;
let cachedNoisePattern: CanvasPattern | null = null;
let cachedNoiseContext: CanvasRenderingContext2D | null = null;

function formatBrand(row: SheetRow) {
  const rawBrand = row.product?.brand ?? "";
  const normalized = normalizeBrandAlias(rawBrand);
  if (normalized) return normalized;
  const inferred = inferFieldsFromTitle(row.product?.title ?? "");
  return inferred.brand ?? "Unknown";
}

function formatName(row: SheetRow) {
  const title = row.product?.title ?? "";
  return normalizeTitleBrandAliases(title).trim() || "Untitled";
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

function formatModel(row: SheetRow) {
  const raw = row.product?.model ?? "";
  const brand = formatBrand(row);
  if (raw.trim()) return cleanupModel(raw, brand);
  const inferred = inferFieldsFromTitle(row.product?.title ?? "");
  return cleanupModel(inferred.model ?? "", brand);
}

function modelSortKey(value: string) {
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
  resealed: "RESEAL",
  near_mint: "NM",
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

function escapeCsv(value: string | number) {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
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

  const imagePadding = 26;
  const imgX = panelX + imagePadding;
  const imgY = panelY + imagePadding;
  const imgW = panelWidth - imagePadding * 2;
  const imgH = panelHeight - imagePadding * 2;

  if (image) {
    drawContainImage(ctx, image, imgX, imgY, imgW, imgH);
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

export default function InventorySheetPage() {
  const [rows, setRows] = React.useState<SheetRow[]>([]);
  const [page, setPage] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [exportingZip, setExportingZip] = React.useState(false);
  const [exportingSheet, setExportingSheet] = React.useState(false);
  const [exportingCards, setExportingCards] = React.useState(false);
  const [exportMsg, setExportMsg] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  const totalQty = React.useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.qty ?? 0), 0),
    [rows]
  );

  const groupedRows = React.useMemo(() => groupRows(rows), [rows]);

  async function loadPage(nextPage: number, replace = false) {
    if (loading) return;
    setLoading(true);
    setError(null);

    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error: qErr } = await supabase
      .from("product_variants")
      .select(
        "id,condition,qty,price, product:products(id,title,brand,model,variation,image_urls)"
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
      const brand = formatBrand(row);
      const list = map.get(brand) ?? [];
      list.push(row);
      map.set(brand, list);
    }
    const entries = Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    return entries.map(([brand, list]) => ({
      brand,
      rows: list.sort((a, b) => {
        const aKey = modelSortKey(formatModel(a));
        const bKey = modelSortKey(formatModel(b));
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
          "id,condition,qty,price, product:products(id,title,brand,model,variation,image_urls)"
        )
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

  async function downloadCsv() {
    if (exporting) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const allRows = await fetchAllRows();
      const headers = ["Name", "Car Model", "Condition", "Qty", "Price", "Photo URL"];
      const lines = [headers.join(",")];
      for (const row of allRows) {
        const photoUrl = row.product?.image_urls?.[0] ?? "";
        const values = [
          formatName(row),
          formatModel(row),
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

  function fileSafe(value: string) {
    return value
      .replace(/[^a-z0-9\-_ ]/gi, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 80);
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
        "Car Model",
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
              const base = fileSafe(formatName(row)) || "item";
              const ext = extractExtension(photoUrl);
              photoFile = `${base}_${row.id.slice(0, 8)}${ext}`;
              zip.file(`photos/${photoFile}`, blob);
              addedPhotos += 1;
            } else {
              skippedPhotos += 1;
            }
          } catch {
            skippedPhotos += 1;
          }
        }

        const values = [
          formatName(row),
          formatModel(row),
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

  async function downloadCardsZip() {
    if (exportingCards) return;
    setExportingCards(true);
    setExportMsg(null);
    setError(null);

    try {
      const allRows = await fetchAllRows();
      const grouped = groupRows(allRows);
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
      const total = allRows.length;
      setExportMsg(`Rendering 0 of ${total} cards...`);

      for (const group of grouped) {
        const brandFolder =
          zip.folder(fileSafe(group.brand) || "Unknown") ?? zip;

        for (const row of group.rows) {
          const imageUrl = row.product?.image_urls?.[0] ?? "";
          const image = imageUrl ? await loadImageBitmap(imageUrl) : null;
          if (!imageUrl || !image) missingImage += 1;

          renderCardCanvas(ctx, row, image);
          const blob = await canvasToBlob(canvas, "image/png");
          const safeName = fileSafe(formatName(row)) || "item";
          const condition = fileSafe(formatCompactCondition(row.condition));
          const name = `${safeName}_${condition}_${row.id.slice(0, 8)}.png`;
          brandFolder.file(name, blob);

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

      const summary = [`${generated} cards`];
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

  async function fetchPhotoMap(rows: SheetRow[], limit = 5) {
    const urls = rows
      .map((row) => row.product?.image_urls?.[0])
      .filter(Boolean) as string[];
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
                  <td class="muted">${escapeCsv(formatModel(row))}</td>
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
              <th>Car Model</th>
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

  React.useEffect(() => {
    loadPage(0, true);
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
          <Badge>{rows.length} rows</Badge>
          <Badge>{totalQty} qty</Badge>
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
            onClick={downloadCardsZip}
            disabled={exportingCards}
          >
            {exportingCards ? "Preparing..." : "Download Cards ZIP"}
          </Button>
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
                <th className="px-4 py-3">Car Model</th>
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
                              src={row.product.image_urls[0]}
                              alt=""
                              className="h-full w-full object-cover bg-neutral-50"
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
                        {formatModel(row)}
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
              {!rows.length && !loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-white/50"
                  >
                    No items yet.
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
