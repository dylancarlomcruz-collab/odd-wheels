import { NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase/admin";

const HASH_ALGOS = ["dhash-64", "dhash-64-center", "ahash-64-center"] as const;
const DEFAULT_MAX_IMAGES = 8;
const DEFAULT_MAX_PRODUCTS = 20;
const MAX_MAX_IMAGES = 50;
const MAX_MAX_PRODUCTS = 500;
const DEFAULT_TIME_BUDGET_MS = 60000;
const MAX_TIME_BUDGET_MS = 60000;

type ProductRow = {
  id: string;
  image_urls: string[] | null;
};

type ExistingHash = {
  product_id: string;
  image_url: string;
  hash_algo: string;
};

type UploadHash = {
  hash_algo: string;
  image_hash: string;
};

export async function POST(req: Request) {
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
    const timeBudgetMs = clampNumber(
      body?.timeBudgetMs,
      3000,
      MAX_TIME_BUDGET_MS,
      DEFAULT_TIME_BUDGET_MS
    );

    const sb = authResult.sb;
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
        hashedImages: 0,
        skippedImages: 0,
        failedImages: 0,
        nextFrom: from,
        stoppedEarly: false
      });
    }

    const productIds = rows.map((row) => row.id).filter(Boolean);
    const { data: existingData, error: existingError } = await sb
      .from("product_image_hashes")
      .select("product_id,image_url,hash_algo")
      .in("product_id", productIds);

    if (existingError) {
      return NextResponse.json(
        { ok: false, error: existingError.message ?? "Failed to load hashes." },
        { status: 500 }
      );
    }

    const existing = new Set(
      ((existingData as ExistingHash[]) ?? []).map(
        (row) => `${row.product_id}::${row.image_url}::${row.hash_algo}`
      )
    );

    const toInsert: Array<{
      product_id: string;
      image_url: string;
      image_hash: string;
      hash_algo: string;
    }> = [];

    let hashedImages = 0;
    let skippedImages = 0;
    let failedImages = 0;
    let stoppedEarly = false;
    let resumeFrom = from + rows.length;

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

        const baseKey = `${row.id}::${url}`;
        let missing = false;
        for (const algo of HASH_ALGOS) {
          if (!existing.has(`${baseKey}::${algo}`)) {
            missing = true;
            break;
          }
        }
        if (!missing) {
          skippedImages += 1;
          continue;
        }

        if (hashedImages >= maxImages) {
          stoppedEarly = true;
          resumeFrom = from + i;
          break outer;
        }

        try {
          const buf = await fetchImageBuffer(url);
          const uploadHashes = await computeUploadHashes(buf);
          let insertedAny = false;
          uploadHashes.forEach((hash) => {
            const key = `${baseKey}::${hash.hash_algo}`;
            if (existing.has(key)) return;
            existing.add(key);
            toInsert.push({
              product_id: row.id,
              image_url: url,
              image_hash: hash.image_hash,
              hash_algo: hash.hash_algo
            });
            insertedAny = true;
          });
          if (insertedAny) {
            hashedImages += 1;
          } else {
            skippedImages += 1;
          }
        } catch {
          failedImages += 1;
        }
      }
    }

    if (toInsert.length > 0) {
      await sb
        .from("product_image_hashes")
        .upsert(toInsert, { onConflict: "product_id,image_url,hash_algo" });
    }

    return NextResponse.json({
      ok: true,
      processedProducts: rows.length,
      hashedImages,
      skippedImages,
      failedImages,
      nextFrom: resumeFrom,
      stoppedEarly,
      timeBudgetMs
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Warm up failed"
      },
      { status: 500 }
    );
  }
}

function clampNumber(
  raw: any,
  min: number,
  max: number,
  fallback: number
) {
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

async function computeUploadHashes(buf: Buffer): Promise<UploadHash[]> {
  const prepared = await prepareImage(buf);
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

async function prepareImage(buf: Buffer): Promise<{ full: Buffer; center: Buffer }> {
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
