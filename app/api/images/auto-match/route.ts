import { NextResponse } from "next/server";
import crypto from "crypto";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "product-uploads";
const HASH_ALGO = "dhash-64";
const HASH_BITS = 64;
const AUTO_MATCH_MIN_CONFIDENCE = 0.9;
const MAX_CANDIDATES = 6;

type ProductHashRow = {
  product_id: string;
  image_url: string;
  image_hash: string;
};

type ProductRow = {
  id: string;
  image_urls: string[] | null;
};

type ProductHash = {
  productId: string;
  imageUrl: string;
  imageHash: string;
};

type Candidate = {
  product_id: string;
  image_url: string;
  distance: number;
  confidence: number;
};

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

    const productHashes = await loadProductHashes(sb);

    const results = [] as any[];
    for (const file of files) {
      const result = await handleFile({
        sb,
        file,
        productHashes,
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
  productHashes,
  userId,
  minConfidence
}: {
  sb: ReturnType<typeof supabaseAdmin>;
  file: File;
  productHashes: ProductHash[];
  userId: string;
  minConfidence: number;
}) {
  try {
    const contentType = file.type || "image/jpeg";
    const ext = guessExt(contentType, file.name);
    const filename = `uploads/${userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const uploadHash = await computeDHash(buf);

    const { error: uploadError } = await sb.storage
      .from(BUCKET)
      .upload(filename, buf, { contentType, upsert: false });

    if (uploadError) {
      return { ok: false, file: file.name, error: uploadError.message };
    }

    const { data } = sb.storage.from(BUCKET).getPublicUrl(filename);
    const uploadUrl = data.publicUrl;

    const candidates = buildCandidates(uploadHash, productHashes).slice(0, MAX_CANDIDATES);

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
      const bestDistance = best.distance;
      const ties = candidates.filter((c) => c.distance === bestDistance);

      confidence = best.confidence;
      distance = best.distance;

      if (ties.length > 1) {
        status = "NEEDS_REVIEW";
        reviewReason = "TIE";
      } else if (best.confidence >= minConfidence) {
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
        await sb.from("product_image_hashes").upsert(
          {
            product_id: matchedProductId,
            image_url: uploadUrl,
            image_hash: uploadHash,
            hash_algo: HASH_ALGO
          },
          { onConflict: "product_id,image_url" }
        );
        productHashes.push({
          productId: matchedProductId,
          imageUrl: uploadUrl,
          imageHash: uploadHash
        });
        appliedAt = new Date().toISOString();
      } catch (e: any) {
        status = "ERROR";
        reviewReason = e?.message ?? "Failed to update product";
      }
    }

    await sb.from("product_upload_matches").insert({
      uploader_user_id: userId,
      upload_url: uploadUrl,
      upload_hash: uploadHash,
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

function buildCandidates(uploadHash: string, productHashes: ProductHash[]): Candidate[] {
  const perProduct = new Map<string, Candidate>();

  for (const row of productHashes) {
    const distance = hammingDistanceHex(uploadHash, row.imageHash);
    const confidence = 1 - distance / HASH_BITS;

    const existing = perProduct.get(row.productId);
    if (!existing || distance < existing.distance) {
      perProduct.set(row.productId, {
        product_id: row.productId,
        image_url: row.imageUrl,
        distance,
        confidence
      });
    }
  }

  return Array.from(perProduct.values()).sort((a, b) => {
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

async function loadProductHashes(sb: ReturnType<typeof supabaseAdmin>): Promise<ProductHash[]> {
  const existing = await fetchAll<ProductHashRow>(sb, "product_image_hashes", "product_id,image_url,image_hash");
  const results: ProductHash[] = existing.map((row) => ({
    productId: row.product_id,
    imageUrl: row.image_url,
    imageHash: row.image_hash
  }));

  const existingKeys = new Set(existing.map((row) => `${row.product_id}::${row.image_url}`));
  const toInsert: Array<ProductHashRow & { hash_algo: string }> = [];

  const products = await fetchAll<ProductRow>(sb, "products", "id,image_urls");

  for (const product of products) {
    const urls = Array.isArray(product.image_urls) ? product.image_urls : [];
    for (const url of urls) {
      if (!url || typeof url !== "string") continue;
      if (!url.startsWith("http")) continue;

      const key = `${product.id}::${url}`;
      if (existingKeys.has(key)) continue;

      try {
        const buf = await fetchImageBuffer(url);
        const hash = await computeDHash(buf);
        existingKeys.add(key);

        toInsert.push({
          product_id: product.id,
          image_url: url,
          image_hash: hash,
          hash_algo: HASH_ALGO
        });

        results.push({
          productId: product.id,
          imageUrl: url,
          imageHash: hash
        });
      } catch {
        continue;
      }
    }
  }

  if (toInsert.length > 0) {
    await sb.from("product_image_hashes").upsert(toInsert, { onConflict: "product_id,image_url" });
  }

  return results;
}

async function fetchAll<T>(
  sb: ReturnType<typeof supabaseAdmin>,
  table: string,
  select: string,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await sb.from(table).select(select).range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    throw new Error(`Failed to fetch image (${r.status})`);
  }
  return Buffer.from(await r.arrayBuffer());
}

async function computeDHash(buf: Buffer): Promise<string> {
  const pixels = await sharp(buf)
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
