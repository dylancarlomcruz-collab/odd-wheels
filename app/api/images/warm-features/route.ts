import { NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const CLIP_MODEL = "Xenova/clip-vit-base-patch32";
const DEFAULT_MAX_IMAGES = 6;
const DEFAULT_MAX_PRODUCTS = 20;
const MAX_MAX_IMAGES = 30;
const MAX_MAX_PRODUCTS = 500;
const FEATURE_TIMEOUT_MS = 20000;
const DEFAULT_TIME_BUDGET_MS = 60000;
const MAX_TIME_BUDGET_MS = 60000;

type ProductRow = {
  id: string;
  image_urls: string[] | null;
};

type FeatureRow = {
  product_id: string;
  image_url: string;
  clip_embedding: number[] | null;
  color_hist: number[] | null;
  ocr_text: string | null;
  ocr_tokens: string[] | null;
};

type PreparedImage = {
  center: Buffer;
};

let transformersModulePromise: Promise<any> | null = null;
let clipExtractorPromise: Promise<any> | null = null;
let ocrWorkerPromise: Promise<any> | null = null;
let ocrQueue: Promise<any> = Promise.resolve();

export async function POST(req: Request) {
  let stage = "auth";
  try {
    const authResult = await requireStaff(req);
    if ("error" in authResult) return authResult.error;

    const body = await req.json().catch(() => ({}));
    const from = clampNumber(body?.from, 0, Number.MAX_SAFE_INTEGER, 0);
    const maxImages = clampNumber(
      body?.maxImages,
      1,
      MAX_MAX_IMAGES,
      DEFAULT_MAX_IMAGES
    );
    const maxProducts = clampNumber(
      body?.maxProducts,
      1,
      MAX_MAX_PRODUCTS,
      DEFAULT_MAX_PRODUCTS
    );
    const includeOcr = Boolean(body?.includeOcr);
    const timeBudgetMs = clampNumber(
      body?.timeBudgetMs,
      3000,
      MAX_TIME_BUDGET_MS,
      DEFAULT_TIME_BUDGET_MS
    );

    const sb = authResult.sb;
    stage = "load-products";
    const startedAt = Date.now();

    const { data: products, error } = await sb
      .from("products")
      .select("id,image_urls")
      .order("created_at", { ascending: false })
      .range(from, from + maxProducts - 1);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message ?? "Failed to load products." },
        { status: 500 }
      );
    }

    const rows = (products as ProductRow[]) ?? [];
    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        processedProducts: 0,
        processedImages: 0,
        updatedImages: 0,
        skippedImages: 0,
        failedImages: 0,
        nextFrom: from,
        stoppedEarly: false,
        includeOcr
      });
    }

    stage = "load-existing";
    const productIds = rows.map((row) => row.id).filter(Boolean);
    const { data: existingData, error: existingError } = await sb
      .from("product_image_features")
      .select("product_id,image_url,clip_embedding,color_hist,ocr_text,ocr_tokens")
      .in("product_id", productIds);

    if (existingError) {
      return NextResponse.json(
        { ok: false, error: existingError.message ?? "Failed to load features." },
        { status: 500 }
      );
    }

    const existingMap = new Map<string, FeatureRow>();
    ((existingData as FeatureRow[]) ?? []).forEach((row) => {
      existingMap.set(`${row.product_id}::${row.image_url}`, row);
    });

    let processedImages = 0;
    let updatedImages = 0;
    let skippedImages = 0;
    let failedImages = 0;
    let stoppedEarly = false;
    let resumeFrom = from + rows.length;

    stage = "process";
    outer: for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (Date.now() - startedAt > timeBudgetMs) {
        stoppedEarly = true;
        resumeFrom = from + i;
        break outer;
      }
      const urls = Array.isArray(row.image_urls) ? row.image_urls : [];
      for (const url of urls) {
        if (!url || typeof url !== "string") {
          skippedImages += 1;
          continue;
        }
        if (!url.startsWith("http")) {
          skippedImages += 1;
          continue;
        }

        processedImages += 1;
        const key = `${row.id}::${url}`;
        const existing = existingMap.get(key);
        const existingClip = Array.isArray(existing?.clip_embedding)
          ? existing?.clip_embedding
          : null;
        const existingColor = Array.isArray(existing?.color_hist)
          ? existing?.color_hist
          : null;
        const existingOcr = existing?.ocr_text ?? null;

        const needsClip = !existingClip?.length;
        const needsColor = !existingColor?.length;
        const needsOcr = includeOcr && !existingOcr;

        if (!needsClip && !needsColor && !needsOcr) {
          skippedImages += 1;
          continue;
        }

        if (updatedImages >= maxImages) {
          stoppedEarly = true;
          resumeFrom = from + i;
          break outer;
        }

        try {
          const buf = await fetchImageBuffer(url);
          const prepared = needsClip || needsColor ? await prepareImage(buf) : null;

          const [clipEmbedding, colorHist, ocrText] = await Promise.all([
            needsClip && prepared
              ? safeFeature("clip", () => computeClipEmbedding(prepared.center))
              : Promise.resolve(existingClip),
            needsColor && prepared
              ? safeFeature("color", () => computeColorHistogram(prepared.center))
              : Promise.resolve(existingColor),
            needsOcr
              ? safeFeature("ocr", () => computeOcrText(buf))
              : Promise.resolve(existingOcr)
          ]);
          const ocrTokens = ocrText
            ? uniqTokens(tokenizeText(ocrText))
            : existing?.ocr_tokens ?? null;

          if (!clipEmbedding && !colorHist && !ocrText) {
            failedImages += 1;
            continue;
          }

          const payload: FeatureRow = {
            product_id: row.id,
            image_url: url,
            clip_embedding: normalizeFloatArray(clipEmbedding),
            color_hist: normalizeFloatArray(colorHist),
            ocr_text: ocrText ?? null,
            ocr_tokens: ocrTokens ?? null
          };

          await sb.from("product_image_features").upsert(
            {
              ...payload,
              updated_at: new Date().toISOString()
            },
            { onConflict: "product_id,image_url" }
          );

          existingMap.set(key, payload);
          updatedImages += 1;
        } catch {
          failedImages += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      processedProducts: rows.length,
      processedImages,
      updatedImages,
      skippedImages,
      failedImages,
      nextFrom: resumeFrom,
      stoppedEarly,
      includeOcr,
      timeBudgetMs
    });
  } catch (e: any) {
    console.error("Warm features failed", { stage, error: e });
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Warm up failed",
        stage
      },
      { status: 500 }
    );
  }
}

function clampNumber(raw: any, min: number, max: number, fallback: number) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    throw new Error(`Failed to fetch image (${r.status})`);
  }
  return Buffer.from(await r.arrayBuffer());
}

async function prepareImage(buf: Buffer): Promise<PreparedImage> {
  let base = sharp(buf).rotate();
  try {
    base = base.trim({ threshold: 10 });
  } catch {
    // ignore trim failures
  }

  const meta = await base.metadata();
  let center = base;
  if (meta.width && meta.height) {
    const width = Math.max(1, Math.round(meta.width * 0.7));
    const height = Math.max(1, Math.round(meta.height * 0.7));
    const left = Math.max(0, Math.round((meta.width - width) / 2));
    const top = Math.max(0, Math.round((meta.height - height) / 2));
    center = base.clone().extract({ left, top, width, height });
  }

  const centerBuf = await center.toBuffer();
  return { center: centerBuf };
}

async function computeClipEmbedding(buf: Buffer): Promise<number[] | null> {
  try {
    const extractor = await getClipExtractor();
    const module = await loadTransformers();
    let imageInput: any = buf;
    try {
      const RawImage = module?.RawImage;
      if (RawImage?.fromBuffer) {
        imageInput = await RawImage.fromBuffer(buf);
      } else if (RawImage?.read) {
        imageInput = await RawImage.read(buf);
      } else if (RawImage?.fromBytes) {
        imageInput = await RawImage.fromBytes(buf);
      }
    } catch {
      imageInput = buf;
    }
    const output = await extractor(imageInput, { pooling: "mean", normalize: true });
    return extractEmbedding(output);
  } catch {
    return null;
  }
}

async function computeColorHistogram(buf: Buffer): Promise<number[] | null> {
  try {
    const size = 64;
    const bins = 8;
    const pixels = await sharp(buf)
      .resize(size, size, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();

    const hist = new Array(bins * 3).fill(0);
    for (let i = 0; i < pixels.length; i += 3) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const rBin = Math.min(bins - 1, Math.floor((r / 256) * bins));
      const gBin = Math.min(bins - 1, Math.floor((g / 256) * bins));
      const bBin = Math.min(bins - 1, Math.floor((b / 256) * bins));
      hist[rBin] += 1;
      hist[bins + gBin] += 1;
      hist[bins * 2 + bBin] += 1;
    }

    const total = pixels.length / 3;
    if (!total) return null;
    return hist.map((count) => count / total);
  } catch {
    return null;
  }
}

async function computeOcrText(buf: Buffer): Promise<string | null> {
  try {
    const worker = await getOcrWorker();
    const run = async () => {
      const result = await worker.recognize(buf);
      return result?.data?.text ?? "";
    };
    const next = ocrQueue.then(run, run);
    ocrQueue = next.catch(() => {});
    const text = await next;
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

function extractEmbedding(output: any): number[] | null {
  if (!output) return null;
  const raw = output?.data ?? output?.[0]?.data ?? output?.[0] ?? output;
  if (!raw) return null;
  if (ArrayBuffer.isView(raw)) {
    return Array.from(raw as unknown as ArrayLike<number>);
  }
  if (Array.isArray(raw)) return raw.map((value) => Number(value));
  return null;
}

function tokenizeText(input: string | null | undefined): string[] {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function uniqTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens.filter(Boolean)));
}

function normalizeFloatArray(values: number[] | null | undefined): number[] | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const cleaned = values.map((value) => Number(value)).filter(Number.isFinite);
  return cleaned.length ? cleaned : null;
}

async function safeFeature<T>(
  label: string,
  fn: () => Promise<T>,
  timeoutMs = FEATURE_TIMEOUT_MS
): Promise<T | null> {
  try {
    const result = await withTimeout(fn(), timeoutMs, label);
    if (result === null || result === undefined) return null;
    return result;
  } catch {
    return null;
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadTransformers() {
  if (!transformersModulePromise) {
    transformersModulePromise = import("@xenova/transformers");
  }
  return transformersModulePromise;
}

async function getClipExtractor() {
  if (!clipExtractorPromise) {
    clipExtractorPromise = (async () => {
      const { pipeline, env } = await loadTransformers();
      if (env?.allowLocalModels !== undefined) {
        env.allowLocalModels = false;
      }
      if (env?.useBrowserCache !== undefined) {
        env.useBrowserCache = false;
      }
      if (env?.backends?.onnx?.wasm?.numThreads !== undefined) {
        env.backends.onnx.wasm.numThreads = 1;
      }
      return pipeline("image-feature-extraction", CLIP_MODEL, {
        quantized: true
      });
    })();
  }
  return clipExtractorPromise;
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      return worker;
    })();
  }
  return ocrWorkerPromise;
}

async function requireStaff(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return {
      error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    };
  }

  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    return {
      error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    };
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    return {
      error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    };
  }

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      error: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
    };
  }

  const role = String(profile.role ?? "");
  if (role !== "admin" && role !== "cashier") {
    return {
      error: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
    };
  }

  return { sb, userId: data.user.id };
}
