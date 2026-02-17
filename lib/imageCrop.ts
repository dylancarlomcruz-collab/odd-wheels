export type ImageCrop = {
  zoom: number;
  x: number;
  y: number;
  rotate?: number;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 2.5;
const MIN_OFFSET = -50;
const MAX_OFFSET = 50;

const DEFAULT_CROP: ImageCrop = { zoom: 1, x: 0, y: 0, rotate: 0 };
const ROTATE_STEP = 90;

function normalizeRotate(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  const snapped = Math.round(Number(value) / ROTATE_STEP) * ROTATE_STEP;
  let normalized = snapped % 360;
  if (normalized < 0) normalized += 360;
  if (normalized === 360) normalized = 0;
  return normalized;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeCrop(input: ImageCrop): ImageCrop {
  return {
    zoom: clamp(input.zoom, MIN_ZOOM, MAX_ZOOM),
    x: clamp(input.x, MIN_OFFSET, MAX_OFFSET),
    y: clamp(input.y, MIN_OFFSET, MAX_OFFSET),
    rotate: normalizeRotate(input.rotate),
  };
}

export function isDefaultCrop(crop: ImageCrop) {
  return (
    Math.abs(crop.zoom - DEFAULT_CROP.zoom) < 0.001 &&
    Math.abs(crop.x - DEFAULT_CROP.x) < 0.001 &&
    Math.abs(crop.y - DEFAULT_CROP.y) < 0.001 &&
    Math.abs((crop.rotate ?? 0) - (DEFAULT_CROP.rotate ?? 0)) < 0.001
  );
}

export function parseImageCrop(url: string): { src: string; crop: ImageCrop | null } {
  const [base, hash = ""] = url.split("#");
  if (!hash) return { src: url, crop: null };
  const params = new URLSearchParams(hash);
  const raw = params.get("crop");
  if (!raw) return { src: base, crop: null };
  const [zRaw, xRaw, yRaw, rRaw] = raw.split(",");
  const zoom = Number(zRaw);
  const x = Number(xRaw);
  const y = Number(yRaw);
  const rotate = Number(rRaw);
  if (!Number.isFinite(zoom) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { src: base, crop: null };
  }
  return { src: base, crop: normalizeCrop({ zoom, x, y, rotate }) };
}

export function applyImageCrop(url: string, crop: ImageCrop) {
  const [base] = url.split("#");
  if (isDefaultCrop(crop)) return base;
  const normalized = normalizeCrop(crop);
  const zoom = normalized.zoom.toFixed(2);
  const x = Math.round(normalized.x);
  const y = Math.round(normalized.y);
  const rotate = normalizeRotate(normalized.rotate);
  const rotatePart = rotate ? `,${rotate}` : "";
  return `${base}#crop=${zoom},${x},${y}${rotatePart}`;
}

export function cropStyle(crop?: ImageCrop | null) {
  if (!crop) return undefined;
  const rotate = normalizeRotate(crop.rotate);
  return {
    transform: `translate(${crop.x}%, ${crop.y}%) scale(${crop.zoom}) rotate(${rotate}deg)`,
    transformOrigin: "center",
  } as const;
}
