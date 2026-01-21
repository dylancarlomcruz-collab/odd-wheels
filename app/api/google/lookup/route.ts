import { NextResponse } from "next/server";
import {
  inferFieldsFromTitle,
  normalizeBrandAlias,
  normalizeLookupTitle,
} from "@/lib/titleInference";

export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

function checkRateLimit(ip: string) {
  // In-memory rate limiting: fine for dev, resets on server restarts.
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || entry.resetAt <= now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return { ok: false };
  return { ok: true };
}

function clean(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ ok: false, error: "Missing q" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;

  if (!apiKey || !cseId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Google Search API not configured. Add GOOGLE_API_KEY and GOOGLE_CSE_ID to .env.local",
      },
      { status: 200 }
    );
  }

  const ip = getClientIp(req);
  const limit = checkRateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Rate limit exceeded. Try again later." },
      { status: 429 }
    );
  }

  const imageUrl = new URL("https://www.googleapis.com/customsearch/v1");
  imageUrl.searchParams.set("key", apiKey);
  imageUrl.searchParams.set("cx", cseId);
  imageUrl.searchParams.set("q", q);
  imageUrl.searchParams.set("searchType", "image");
  imageUrl.searchParams.set("num", "10");

  const webUrl = new URL("https://www.googleapis.com/customsearch/v1");
  webUrl.searchParams.set("key", apiKey);
  webUrl.searchParams.set("cx", cseId);
  webUrl.searchParams.set("q", q);
  webUrl.searchParams.set("num", "5");

  try {
    const [imageRes, webRes] = await Promise.all([
      fetch(imageUrl.toString(), { cache: "no-store" }),
      fetch(webUrl.toString(), { cache: "no-store" }),
    ]);

    if (!imageRes.ok || !webRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Google API error (${imageRes.status}/${webRes.status})` },
        { status: 200 }
      );
    }

    const imageJson = await imageRes.json();
    const webJson = await webRes.json();

    const apiError = imageJson?.error?.message ?? webJson?.error?.message;
    if (apiError) {
      return NextResponse.json({ ok: false, error: apiError }, { status: 200 });
    }

    const images = (imageJson?.items ?? [])
      .map((item: any) => item?.link)
      .filter(Boolean);

    const webItems = Array.isArray(webJson?.items) ? webJson.items : [];
    const title = clean(webItems?.[0]?.title) ?? clean(q);

    const candidates: string[] = [];
    for (const item of webItems) {
      if (item?.title) candidates.push(String(item.title));
      if (item?.snippet) candidates.push(String(item.snippet));
    }
    candidates.push(q);

    let brand: string | null = null;
    let model: string | null = null;
    let variation: string | null = null;

    for (const text of candidates) {
      const inferred = inferFieldsFromTitle(text);
      if (!brand && inferred.brand) brand = inferred.brand;
      if (!model && inferred.model) model = inferred.model;
      if (!variation && inferred.color_style) variation = inferred.color_style;
      if (brand && model && variation) break;
    }

    const normalizedBrand = normalizeBrandAlias(brand) ?? brand;
    const normalizedTitle =
      normalizeLookupTitle(title ?? "", normalizedBrand ?? brand ?? null) ||
      title ||
      clean(q);

    return NextResponse.json(
      {
        ok: true,
        data: {
          title: normalizedTitle,
          brand: clean(normalizedBrand ?? brand),
          model: clean(model),
          variation: clean(variation),
          images,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Lookup failed." },
      { status: 200 }
    );
  }
}
