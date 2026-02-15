import { NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = "product-uploads";
const PRIMARY_HASH_ALGO = "dhash-64";
const HASH_BITS = 64;
const AUTO_MATCH_MIN_CONFIDENCE = 0.9;
const MIN_CONFIDENCE_GAP = 0.03;
const MAX_CANDIDATES = 6;
const PRESELECT_CANDIDATES = 20;
const CLIP_MODEL = "Xenova/clip-vit-base-patch32";
const SCORE_WEIGHTS = {
  hash: 0.55,
  clip: 0.3,
  ocr: 0.1,
  color: 0.05
};
const MIN_OCR_TOKENS = 2;
const FEATURE_TIMEOUT_MS = 15000;
const PREFIX_HEX_LEN = 2;
const PREFIX_BITS = PREFIX_HEX_LEN * 4;
const PREFIX_RADIUS = 2;
const PREFIX_RADIUS_FALLBACK = 3;
const MIN_HASH_ROWS = 200;
const MAX_HASH_CANDIDATES_PER_ALGO = 3000;

type ProductHashRow = {
  product_id: string;
  image_url: string;
  image_hash: string;
  hash_algo: string;
};

type UploadHash = {
  hash_algo: string;
  image_hash: string;
};

type PreparedImage = {
  full: Buffer;
  center: Buffer;
};

type UploadFeatures = {
  clipEmbedding?: number[] | null;
  colorHist?: number[] | null;
  ocrText?: string | null;
  ocrTokens?: string[] | null;
};

type ProductFeatureRow = {
  product_id: string;
  image_url: string;
  clip_embedding: number[] | null;
  color_hist: number[] | null;
  ocr_text: string | null;
  ocr_tokens: string[] | null;
};

type ProductMetaRow = {
  id: string;
  title: string | null;
  brand: string | null;
  model: string | null;
  variation: string | null;
};

type ProductHash = {
  productId: string;
  imageUrl: string;
  imageHash: string;
  hashAlgo: string;
};

type Candidate = {
  product_id: string;
  image_url: string;
  distance: number;
  confidence: number;
  hash_confidence: number;
  clip_similarity?: number;
  ocr_score?: number;
  color_similarity?: number;
  combined_score?: number;
  algo_distances?: Record<string, number>;
};

let transformersModulePromise: Promise<any> | null = null;
let clipExtractorPromise: Promise<any> | null = null;
let ocrWorkerPromise: Promise<any> | null = null;
let ocrQueue: Promise<any> = Promise.resolve();

export async function POST(req: Request) {
  try {
    const authResult = await requireStaff(req);
    if ("error" in authResult) return authResult.error;

    const form = await req.formData();
    const files = collectFiles(form);

    if (files.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing file(s)" }, { status: 400 });
    }

    const minConfidence = parseConfidence(form.get("minConfidence"));

    const sb = authResult.sb;
    await ensureBucket(sb);

    const results = [] as any[];
    const recentHashes: ProductHash[] = [];
    for (const file of files) {
      const result = await handleFile({
        sb,
        file,
        recentHashes,
        userId: authResult.userId,
        minConfidence
      });
      results.push(result);
    }

    return NextResponse.json({ ok: true, results }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Auto match failed",
        hint: "Ensure SUPABASE_SERVICE_ROLE_KEY is set and bucket `product-uploads` exists."
      },
      { status: 200 }
    );
  }
}

async function handleFile({
  sb,
  file,
  recentHashes,
  userId,
  minConfidence
}: {
  sb: ReturnType<typeof supabaseAdmin>;
  file: File;
  recentHashes: ProductHash[];
  userId: string;
  minConfidence: number;
}) {
  try {
    const contentType = file.type || "image/jpeg";
    const ext = guessExt(contentType, file.name);
    const filename = `uploads/${userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const prepared = await prepareImage(buf);
    const uploadHashes = await computeUploadHashes(prepared);
    const uploadFeatures = await computeUploadFeatures(prepared, buf);
    const primaryHash =
      uploadHashes.find((h) => h.hash_algo === PRIMARY_HASH_ALGO)?.image_hash ??
      uploadHashes[0]?.image_hash ??
      "";
    if (!uploadHashes.length || !primaryHash) {
      return { ok: false, file: file.name, error: "Failed to compute image hash." };
    }

    const { error: uploadError } = await sb.storage
      .from(BUCKET)
      .upload(filename, buf, { contentType, upsert: false });

    if (uploadError) {
      return { ok: false, file: file.name, error: uploadError.message };
    }

    const { data } = sb.storage.from(BUCKET).getPublicUrl(filename);
    const uploadUrl = data.publicUrl;

    const candidateHashes = await loadCandidateHashes(sb, uploadHashes, recentHashes);
    const baseCandidates = buildCandidates(uploadHashes, candidateHashes);
    const preselected = baseCandidates.slice(0, PRESELECT_CANDIDATES);
    const enriched = await enrichCandidates({
      sb,
      candidates: preselected,
      uploadFeatures
    });
    const candidates = enriched
      .sort((a, b) => {
        if (a.confidence !== b.confidence) return b.confidence - a.confidence;
        return a.distance - b.distance;
      })
      .slice(0, MAX_CANDIDATES);

    let status: "APPLIED" | "NEEDS_REVIEW" | "NO_MATCH" | "ERROR" = "NEEDS_REVIEW";
    let reviewReason: string | null = null;
    let matchedProductId: string | null = null;
    let matchedImageUrl: string | null = null;
    let confidence: number | null = null;
    let distance: number | null = null;
    let appliedAt: string | null = null;

    if (candidates.length === 0) {
      status = "NO_MATCH";
      reviewReason = "NO_CANDIDATES";
    } else {
      const best = candidates[0];
      const bestConfidence = Number.isFinite(best.confidence) ? best.confidence : 0;
      const second = candidates[1];
      const confidenceGap =
        second && Number.isFinite(second.confidence)
          ? bestConfidence - second.confidence
          : 1;
      const ties = candidates.filter(
        (c) => Math.abs((c.confidence ?? 0) - bestConfidence) < 1e-6
      );

      confidence = bestConfidence;
      distance = best.distance;

      if (ties.length > 1) {
        status = "NEEDS_REVIEW";
        reviewReason = "TIE";
      } else if (second && confidenceGap < MIN_CONFIDENCE_GAP) {
        status = "NEEDS_REVIEW";
        reviewReason = "AMBIGUOUS";
      } else if (bestConfidence >= minConfidence) {
        status = "APPLIED";
        matchedProductId = best.product_id;
        matchedImageUrl = best.image_url;
      } else {
        status = "NEEDS_REVIEW";
        reviewReason = "LOW_CONFIDENCE";
      }
    }

    if (status === "APPLIED" && matchedProductId) {
      try {
        await updateProductThumbnail(sb, matchedProductId, uploadUrl);
        if (uploadHashes.length > 0) {
          await sb.from("product_image_hashes").upsert(
            uploadHashes.map((hash) => ({
              product_id: matchedProductId,
              image_url: uploadUrl,
              image_hash: hash.image_hash,
              hash_algo: hash.hash_algo
            })),
            { onConflict: "product_id,image_url,hash_algo" }
          );
          uploadHashes.forEach((hash) => {
            recentHashes.push({
              productId: matchedProductId,
              imageUrl: uploadUrl,
              imageHash: hash.image_hash,
              hashAlgo: hash.hash_algo
            });
          });
        }
        appliedAt = new Date().toISOString();
      } catch (e: any) {
        status = "ERROR";
        reviewReason = e?.message ?? "Failed to update product";
      }
    }

    await sb.from("product_upload_matches").insert({
      uploader_user_id: userId,
      upload_url: uploadUrl,
      upload_hash: primaryHash,
      upload_hashes: uploadHashes,
      status,
      review_reason: reviewReason,
      matched_product_id: matchedProductId,
      matched_image_url: matchedImageUrl,
      confidence,
      distance,
      candidates,
      applied_at: appliedAt
    });

    return {
      ok: true,
      file: file.name,
      uploadUrl,
      status,
      reviewReason,
      matchedProductId,
      confidence,
      distance,
      candidates
    };
  } catch (e: any) {
    return {
      ok: false,
      file: file.name,
      error: e?.message ?? "Failed to process file"
    };
  }
}

function collectFiles(form: FormData): File[] {
  const files: File[] = [];
  const multiple = form.getAll("files");
  for (const item of multiple) {
    if (item instanceof File) files.push(item);
  }
  const single = form.get("file");
  if (single instanceof File) files.push(single);
  return files;
}

function parseConfidence(value: FormDataEntryValue | null): number {
  if (typeof value !== "string") return AUTO_MATCH_MIN_CONFIDENCE;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return AUTO_MATCH_MIN_CONFIDENCE;
  return Math.min(Math.max(parsed, 0), 1);
}

function buildCandidates(uploadHashes: UploadHash[], productHashes: ProductHash[]): Candidate[] {
  const perProduct = new Map<
    string,
    {
      product_id: string;
      image_url: string;
      bestDistance: number;
      distances: Record<string, number>;
    }
  >();
  const uploadMap = new Map(uploadHashes.map((h) => [h.hash_algo, h.image_hash]));

  for (const row of productHashes) {
    const uploadHash = uploadMap.get(row.hashAlgo);
    if (!uploadHash) continue;

    const distance = hammingDistanceHex(uploadHash, row.imageHash);
    const distanceNorm = distance / HASH_BITS;

    const existing = perProduct.get(row.productId) ?? {
      product_id: row.productId,
      image_url: row.imageUrl,
      bestDistance: Number.POSITIVE_INFINITY,
      distances: {}
    };

    const prev = existing.distances[row.hashAlgo];
    if (prev === undefined || distanceNorm < prev) {
      existing.distances[row.hashAlgo] = distanceNorm;
    }

    if (distanceNorm < existing.bestDistance) {
      existing.bestDistance = distanceNorm;
      existing.image_url = row.imageUrl;
    }

    perProduct.set(row.productId, existing);
  }

  const candidates: Candidate[] = [];
  perProduct.forEach((entry) => {
    const scores = Object.values(entry.distances);
    if (!scores.length) return;
    const avgDistance = scores.reduce((sum, v) => sum + v, 0) / scores.length;
    const confidence = 1 - avgDistance;
    candidates.push({
      product_id: entry.product_id,
      image_url: entry.image_url,
      distance: Math.round(avgDistance * HASH_BITS),
      confidence,
      hash_confidence: confidence,
      algo_distances: entry.distances
    });
  });

  return candidates.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return b.confidence - a.confidence;
  });
}

async function updateProductThumbnail(
  sb: ReturnType<typeof supabaseAdmin>,
  productId: string,
  uploadUrl: string
) {
  const { data: product, error } = await sb
    .from("products")
    .select("image_urls")
    .eq("id", productId)
    .maybeSingle();

  if (error || !product) {
    throw new Error("Product not found");
  }

  const current = Array.isArray(product.image_urls) ? product.image_urls : [];
  const filtered = current.filter((url) => url && url !== uploadUrl);
  const updated = [uploadUrl, ...filtered];

  const { error: updateError } = await sb
    .from("products")
    .update({ image_urls: updated })
    .eq("id", productId);

  if (updateError) {
    throw updateError;
  }
}

async function loadCandidateHashes(
  sb: ReturnType<typeof supabaseAdmin>,
  uploadHashes: UploadHash[],
  recent: ProductHash[]
): Promise<ProductHash[]> {
  if (!uploadHashes.length && !recent.length) return [];

  let dbRows = await fetchHashesByRadius(sb, uploadHashes, PREFIX_RADIUS);
  if (dbRows.length < MIN_HASH_ROWS && PREFIX_RADIUS_FALLBACK > PREFIX_RADIUS) {
    const extraRows = await fetchHashesByRadius(
      sb,
      uploadHashes,
      PREFIX_RADIUS_FALLBACK
    );
    dbRows = dbRows.concat(extraRows);
  }
  const combined: ProductHash[] = [];
  const seen = new Set<string>();

  for (const row of dbRows) {
    const key = `${row.product_id}::${row.image_url}::${row.hash_algo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push({
      productId: row.product_id,
      imageUrl: row.image_url,
      imageHash: row.image_hash,
      hashAlgo: row.hash_algo
    });
  }

  for (const row of recent) {
    const key = `${row.productId}::${row.imageUrl}::${row.hashAlgo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(row);
  }

  return combined;
}

async function fetchHashesByRadius(
  sb: ReturnType<typeof supabaseAdmin>,
  uploadHashes: UploadHash[],
  radius: number
): Promise<ProductHashRow[]> {
  if (!uploadHashes.length) return [];
  const queries = uploadHashes.map((hash) => {
    const prefix = normalizePrefix(hash.image_hash);
    const prefixes = expandPrefixes(prefix, PREFIX_BITS, radius);
    const orFilter = prefixes.map((p) => `image_hash.like.${p}%`).join(",");
    return sb
      .from("product_image_hashes")
      .select("product_id,image_url,image_hash,hash_algo")
      .eq("hash_algo", hash.hash_algo)
      .or(orFilter)
      .limit(MAX_HASH_CANDIDATES_PER_ALGO);
  });

  const results = await Promise.all(queries);
  results.forEach(({ error }) => {
    if (error) throw error;
  });

  return results.flatMap(({ data }) => (data as ProductHashRow[] | null) ?? []);
}

async function computeUploadHashes(prepared: PreparedImage): Promise<UploadHash[]> {
  const hashes: UploadHash[] = [];

  const fullDHash = await computeDHash(prepared.full);
  if (fullDHash) {
    hashes.push({ hash_algo: "dhash-64", image_hash: fullDHash });
  }

  const centerDHash = await computeDHash(prepared.center);
  if (centerDHash) {
    hashes.push({ hash_algo: "dhash-64-center", image_hash: centerDHash });
  }

  const centerAHash = await computeAHash(prepared.center);
  if (centerAHash) {
    hashes.push({ hash_algo: "ahash-64-center", image_hash: centerAHash });
  }

  return hashes;
}

async function computeUploadFeatures(
  prepared: PreparedImage,
  original: Buffer
): Promise<UploadFeatures> {
  const features: UploadFeatures = {};
  const clipEmbedding = await safeFeature("clip", () =>
    computeClipEmbedding(prepared.center)
  );
  if (clipEmbedding) {
    features.clipEmbedding = clipEmbedding;
  }

  const colorHist = await safeFeature("color", () =>
    computeColorHistogram(prepared.center)
  );
  if (colorHist) {
    features.colorHist = colorHist;
  }

  const ocrText = await safeFeature("ocr", () => computeOcrText(original));
  if (ocrText && ocrText.trim()) {
    features.ocrText = ocrText;
    const tokens = uniqTokens(tokenizeText(ocrText));
    if (tokens.length) {
      features.ocrTokens = tokens;
    }
  }

  return features;
}

async function enrichCandidates({
  sb,
  candidates,
  uploadFeatures
}: {
  sb: ReturnType<typeof supabaseAdmin>;
  candidates: Candidate[];
  uploadFeatures: UploadFeatures;
}): Promise<Candidate[]> {
  if (!candidates.length) return candidates;

  try {
    const productIds = uniqStrings(candidates.map((c) => c.product_id));
    const imageUrls = uniqStrings(candidates.map((c) => c.image_url));

    const uploadTokens = uploadFeatures.ocrTokens ?? [];
    const uploadEmbedding = uploadFeatures.clipEmbedding ?? null;
    const uploadHist = uploadFeatures.colorHist ?? null;
    const canUseOcr = uploadTokens.length >= MIN_OCR_TOKENS;
    const needsClip = Boolean(uploadEmbedding);
    const needsColor = Boolean(uploadHist);

    const productTokens = canUseOcr
      ? await loadProductTokens(sb, productIds)
      : new Map<string, string[]>();
    const featureMap =
      needsClip || needsColor
        ? await loadProductFeatures(sb, candidates, imageUrls, {
            needsClip,
            needsColor
          })
        : new Map<string, { clipEmbedding: number[] | null; colorHist: number[] | null }>();

    return candidates.map((candidate) => {
      const key = `${candidate.product_id}::${candidate.image_url}`;
      const features = featureMap.get(key);
      const clipScoreRaw =
        uploadEmbedding && features?.clipEmbedding
          ? cosineSimilarity(uploadEmbedding, features.clipEmbedding)
          : null;
      const clipScore =
        clipScoreRaw === null ? null : clamp01((clipScoreRaw + 1) / 2);
      const colorScore =
        uploadHist && features?.colorHist
          ? colorSimilarity(uploadHist, features.colorHist)
          : null;
      const ocrScore = canUseOcr
        ? tokenOverlap(uploadTokens, productTokens.get(candidate.product_id) ?? [])
        : null;

      const combined = combineScores({
        hash: candidate.hash_confidence,
        clip: clipScore,
        ocr: ocrScore,
        color: colorScore
      });

      return {
        ...candidate,
        confidence: combined,
        combined_score: combined,
        clip_similarity: clipScore ?? undefined,
        ocr_score: ocrScore ?? undefined,
        color_similarity: colorScore ?? undefined
      };
    });
  } catch {
    return candidates;
  }
}

async function loadProductTokens(
  sb: ReturnType<typeof supabaseAdmin>,
  productIds: string[]
) {
  const map = new Map<string, string[]>();
  if (!productIds.length) return map;

  const { data, error } = await sb
    .from("products")
    .select("id,title,brand,model,variation")
    .in("id", productIds);

  if (error) throw error;
  const rows = (data as ProductMetaRow[]) ?? [];
  rows.forEach((row) => {
    const combined = [
      row.brand,
      row.model,
      row.variation,
      row.title
    ]
      .filter(Boolean)
      .join(" ");
    map.set(row.id, uniqTokens(tokenizeText(combined)));
  });
  return map;
}

async function loadProductFeatures(
  sb: ReturnType<typeof supabaseAdmin>,
  candidates: Candidate[],
  imageUrls: string[],
  options: { needsClip: boolean; needsColor: boolean }
) {
  const map = new Map<
    string,
    { clipEmbedding: number[] | null; colorHist: number[] | null }
  >();
  if (!imageUrls.length) return map;
  if (!options.needsClip && !options.needsColor) return map;

  const productIds = uniqStrings(candidates.map((c) => c.product_id));
  const { data, error } = await sb
    .from("product_image_features")
    .select("product_id,image_url,clip_embedding,color_hist,ocr_text,ocr_tokens")
    .in("product_id", productIds)
    .in("image_url", imageUrls);

  if (error) throw error;
  const rows = (data as ProductFeatureRow[]) ?? [];
  rows.forEach((row) => {
    map.set(`${row.product_id}::${row.image_url}`, {
      clipEmbedding: Array.isArray(row.clip_embedding)
        ? row.clip_embedding
        : null,
      colorHist: Array.isArray(row.color_hist) ? row.color_hist : null
    });
  });

  const missing = candidates.filter((candidate) => {
    const key = `${candidate.product_id}::${candidate.image_url}`;
    return !map.has(key);
  });

  for (const candidate of missing) {
    try {
      const buf = await fetchImageBuffer(candidate.image_url);
      const prepared = await prepareImage(buf);
      const clipEmbedding = options.needsClip
        ? await safeFeature("clip", () => computeClipEmbedding(prepared.center))
        : null;
      const colorHist = options.needsColor
        ? await safeFeature("color", () => computeColorHistogram(prepared.center))
        : null;
      if (!clipEmbedding && !colorHist) {
        continue;
      }

      await sb.from("product_image_features").upsert(
        {
          product_id: candidate.product_id,
          image_url: candidate.image_url,
          clip_embedding: clipEmbedding ?? null,
          color_hist: colorHist ?? null,
          updated_at: new Date().toISOString()
        },
        { onConflict: "product_id,image_url" }
      );

      map.set(`${candidate.product_id}::${candidate.image_url}`, {
        clipEmbedding: clipEmbedding ?? null,
        colorHist: colorHist ?? null
      });
    } catch {
      // ignore feature failures for this candidate
    }
  }

  return map;
}

async function prepareImage(buf: Buffer): Promise<PreparedImage> {
  let base = sharp(buf).rotate();
  try {
    base = base.trim({ threshold: 10 });
  } catch {
    // ignore trim failures
  }

  const meta = await base.metadata();
  const full = await base.clone().toBuffer();

  let center = base;
  if (meta.width && meta.height) {
    const width = Math.max(1, Math.round(meta.width * 0.7));
    const height = Math.max(1, Math.round(meta.height * 0.7));
    const left = Math.max(0, Math.round((meta.width - width) / 2));
    const top = Math.max(0, Math.round((meta.height - height) / 2));
    center = base.clone().extract({ left, top, width, height });
  }

  const centerBuf = await center.toBuffer();
  return { full, center: centerBuf };
}

async function computeDHash(buf: Buffer): Promise<string> {
  const pixels = await sharp(buf)
    .normalize()
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = pixels[y * 9 + x];
      const right = pixels[y * 9 + x + 1];
      bits += left > right ? "1" : "0";
    }
  }

  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }

  return hex;
}

async function computeAHash(buf: Buffer): Promise<string> {
  const pixels = await sharp(buf)
    .normalize()
    .resize(8, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  let sum = 0;
  for (let i = 0; i < pixels.length; i += 1) {
    sum += pixels[i];
  }
  const avg = sum / pixels.length;

  let bits = "";
  for (let i = 0; i < pixels.length; i += 1) {
    bits += pixels[i] > avg ? "1" : "0";
  }

  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }

  return hex;
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
  const raw =
    output?.data ??
    output?.[0]?.data ??
    output?.[0] ??
    output;
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

function uniqStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function tokenOverlap(uploadTokens: string[], productTokens: string[]): number | null {
  if (!uploadTokens.length || !productTokens.length) return null;
  const set = new Set(productTokens);
  let hits = 0;
  uploadTokens.forEach((token) => {
    if (set.has(token)) hits += 1;
  });
  return clamp01(hits / uploadTokens.length);
}

function combineScores({
  hash,
  clip,
  ocr,
  color
}: {
  hash: number;
  clip: number | null;
  ocr: number | null;
  color: number | null;
}) {
  let totalWeight = 0;
  let sum = 0;

  if (Number.isFinite(hash)) {
    totalWeight += SCORE_WEIGHTS.hash;
    sum += clamp01(hash) * SCORE_WEIGHTS.hash;
  }
  if (Number.isFinite(clip ?? NaN)) {
    totalWeight += SCORE_WEIGHTS.clip;
    sum += clamp01(clip as number) * SCORE_WEIGHTS.clip;
  }
  if (Number.isFinite(ocr ?? NaN)) {
    totalWeight += SCORE_WEIGHTS.ocr;
    sum += clamp01(ocr as number) * SCORE_WEIGHTS.ocr;
  }
  if (Number.isFinite(color ?? NaN)) {
    totalWeight += SCORE_WEIGHTS.color;
    sum += clamp01(color as number) * SCORE_WEIGHTS.color;
  }

  if (!totalWeight) return clamp01(hash);
  return clamp01(sum / totalWeight);
}

function cosineSimilarity(a: number[], b: number[]): number | null {
  if (!a.length || !b.length) return null;
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return null;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function colorSimilarity(a: number[], b: number[]): number | null {
  if (!a.length || !b.length) return null;
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += Math.min(a[i], b[i]);
  }
  const denom = 3;
  return clamp01(sum / denom);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
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

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch image (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function hammingDistanceHex(a: string, b: string): number {
  const aHex = a.padStart(16, "0");
  const bHex = b.padStart(16, "0");
  let x = BigInt(`0x${aHex}`) ^ BigInt(`0x${bHex}`);
  let distance = 0;

  while (x > 0n) {
    distance += Number(x & 1n);
    x >>= 1n;
  }

  return distance;
}

function normalizePrefix(hash: string): string {
  const padded = String(hash ?? "").padStart(16, "0");
  return padded.slice(0, PREFIX_HEX_LEN).toLowerCase();
}

function expandPrefixes(prefix: string, bits: number, radius: number): string[] {
  const base = Number.parseInt(prefix, 16);
  if (!Number.isFinite(base)) return [prefix];

  const seen = new Set<number>();
  const values: number[] = [];
  const push = (val: number) => {
    const masked = val & ((1 << bits) - 1);
    if (seen.has(masked)) return;
    seen.add(masked);
    values.push(masked);
  };

  push(base);
  if (radius >= 1) {
    for (let i = 0; i < bits; i += 1) {
      push(base ^ (1 << i));
    }
  }
  if (radius >= 2) {
    for (let i = 0; i < bits; i += 1) {
      for (let j = i + 1; j < bits; j += 1) {
        push(base ^ (1 << i) ^ (1 << j));
      }
    }
  }
  if (radius >= 3) {
    for (let i = 0; i < bits; i += 1) {
      for (let j = i + 1; j < bits; j += 1) {
        for (let k = j + 1; k < bits; k += 1) {
          push(base ^ (1 << i) ^ (1 << j) ^ (1 << k));
        }
      }
    }
  }

  return values.map((val) => val.toString(16).padStart(PREFIX_HEX_LEN, "0"));
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

async function ensureBucket(sb: ReturnType<typeof supabaseAdmin>) {
  const { error } = await sb.storage.createBucket(BUCKET, { public: true });
  if (!error) return;
  const msg = String(error.message ?? "").toLowerCase();
  if (msg.includes("already exists")) return;
  throw error;
}

function guessExt(contentType: string, filename?: string): string {
  const lower = (filename ?? "").toLowerCase();
  if (lower.endsWith(".png") || contentType.includes("png")) return "png";
  if (lower.endsWith(".webp") || contentType.includes("webp")) return "webp";
  return "jpg";
}
