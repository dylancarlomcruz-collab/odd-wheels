type ImageFormat = "webp" | "avif" | "jpeg" | "png";

type ImageTransformOptions = {
  width?: number;
  height?: number;
  quality?: number;
  format?: ImageFormat;
  resize?: "cover" | "contain";
};

const SUPABASE_OBJECT_PATH = "/storage/v1/object/public/";
const SUPABASE_RENDER_PATH = "/storage/v1/render/image/public/";
const transformFailureCache = new Set<string>();

function stripHash(url: string) {
  const index = url.indexOf("#");
  return index >= 0 ? url.slice(0, index) : url;
}

function isSupabasePublicUrl(url: string) {
  return (
    url.includes(SUPABASE_OBJECT_PATH) || url.includes(SUPABASE_RENDER_PATH)
  );
}

function normalizeSupabaseObjectUrl(rawUrl: string) {
  if (!rawUrl) return null;
  if (rawUrl.startsWith("data:")) return null;
  const base = stripHash(rawUrl);
  if (!isSupabasePublicUrl(base)) return null;
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    return null;
  }
  if (parsed.pathname.includes(SUPABASE_RENDER_PATH)) {
    parsed.pathname = parsed.pathname.replace(
      SUPABASE_RENDER_PATH,
      SUPABASE_OBJECT_PATH,
    );
  }
  parsed.search = "";
  return parsed.toString();
}

export function getOptimizedImageUrl(
  rawUrl: string,
  options: ImageTransformOptions = {},
) {
  if (!rawUrl) return rawUrl;
  if (rawUrl.startsWith("data:")) return rawUrl;
  const base = stripHash(rawUrl);
  const objectUrl = normalizeSupabaseObjectUrl(base);
  if (!objectUrl) return base;
  if (transformFailureCache.has(objectUrl)) return objectUrl;
  let parsed: URL;
  try {
    parsed = new URL(objectUrl);
  } catch {
    return objectUrl;
  }

  parsed.pathname = parsed.pathname.replace(
    SUPABASE_OBJECT_PATH,
    SUPABASE_RENDER_PATH,
  );

  const params = parsed.searchParams;
  if (options.width) params.set("width", String(options.width));
  if (options.height) params.set("height", String(options.height));
  if (options.quality) params.set("quality", String(options.quality));
  const shouldContain =
    !options.resize &&
    ((options.width && !options.height) || (options.height && !options.width));
  const resizeMode = options.resize ?? (shouldContain ? "contain" : undefined);
  if (resizeMode) params.set("resize", resizeMode);

  return parsed.toString();
}

export function buildSrcSet(
  rawUrl: string,
  widths: number[],
  options: Omit<ImageTransformOptions, "width"> = {},
) {
  if (!rawUrl) return "";
  const base = stripHash(rawUrl);
  const objectUrl = normalizeSupabaseObjectUrl(base);
  if (!objectUrl) return "";
  if (transformFailureCache.has(objectUrl)) return "";
  return widths
    .map((width) => {
      const src = getOptimizedImageUrl(objectUrl, { ...options, width });
      return `${src} ${width}w`;
    })
    .join(", ");
}

export function applyImageFallback(
  img: HTMLImageElement,
  fallbackUrl: string,
) {
  if (!fallbackUrl) return;
  if (img.dataset.fallbackApplied === fallbackUrl) return;
  img.dataset.fallbackApplied = fallbackUrl;
  const currentSrc = img.currentSrc || img.src;
  if (currentSrc && currentSrc.includes(SUPABASE_RENDER_PATH)) {
    const objectUrl =
      normalizeSupabaseObjectUrl(fallbackUrl) ??
      normalizeSupabaseObjectUrl(currentSrc);
    if (objectUrl) transformFailureCache.add(objectUrl);
  }
  img.srcset = "";
  img.src = fallbackUrl;
}
