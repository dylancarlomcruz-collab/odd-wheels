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

function escapeCsv(value: string | number) {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
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

    const batch = (data as SheetRow[]) ?? [];
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
      const batch = (data as SheetRow[]) ?? [];
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
