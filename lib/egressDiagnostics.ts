const SUPABASE_OBJECT_PATH = "/storage/v1/object/public/";
const SUPABASE_RENDER_PATH = "/storage/v1/render/image/public/";

type ServerPayloadMeta = Record<string, unknown>;

type ClientGridMeta = {
  page: string;
  viewMode?: string;
  renderedCount: number;
  totalProducts?: number;
  imageUrls: Array<string | null | undefined>;
  extra?: Record<string, unknown>;
};

function isServerDebugEnabled() {
  return (
    process.env.DEBUG_EGRESS === "1" ||
    process.env.NEXT_PUBLIC_DEBUG_EGRESS === "1"
  );
}

function isClientDebugEnabled() {
  if (process.env.NEXT_PUBLIC_DEBUG_EGRESS === "1") return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("oddwheels:debug-egress") === "1";
  } catch {
    return false;
  }
}

export function isSupabaseStorageUrl(url: string | null | undefined) {
  if (!url) return false;
  return (
    url.includes(SUPABASE_OBJECT_PATH) || url.includes(SUPABASE_RENDER_PATH)
  );
}

export function estimateJsonBytes(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function summarizeImageUrls(imageUrls: Array<string | null | undefined>) {
  const normalized = imageUrls
    .map((url) => String(url ?? "").trim())
    .filter(Boolean);
  const unique = new Set(normalized);
  const supabase = normalized.filter((url) => isSupabaseStorageUrl(url));
  const uniqueSupabase = new Set(supabase);
  return {
    total: normalized.length,
    unique: unique.size,
    supabase: supabase.length,
    uniqueSupabase: uniqueSupabase.size,
    sample: Array.from(uniqueSupabase).slice(0, 8),
  };
}

export function logServerPayloadDiagnostics(
  route: string,
  payload: unknown,
  meta: ServerPayloadMeta = {},
) {
  if (!isServerDebugEnabled()) return;
  const bytes = estimateJsonBytes(payload);
  console.info("[egress][server]", {
    route,
    bytes,
    prettyBytes: formatBytes(bytes),
    ...meta,
  });
}

export function logClientGridDiagnostics(meta: ClientGridMeta) {
  if (!isClientDebugEnabled()) return;
  const imageSummary = summarizeImageUrls(meta.imageUrls);
  console.info("[egress][client-grid]", {
    page: meta.page,
    viewMode: meta.viewMode ?? "unknown",
    renderedCount: meta.renderedCount,
    totalProducts: meta.totalProducts ?? meta.renderedCount,
    imageCount: imageSummary.total,
    uniqueImages: imageSummary.unique,
    supabaseImages: imageSummary.supabase,
    uniqueSupabaseImages: imageSummary.uniqueSupabase,
    sampleSupabaseImages: imageSummary.sample,
    ...(meta.extra ?? {}),
  });
}

export function logClientPayloadDiagnostics(
  label: string,
  payload: unknown,
  meta: Record<string, unknown> = {},
) {
  if (!isClientDebugEnabled()) return;
  const bytes = estimateJsonBytes(payload);
  console.info("[egress][client-payload]", {
    label,
    bytes,
    prettyBytes: formatBytes(bytes),
    ...meta,
  });
}
