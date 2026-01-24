import { NextResponse } from "next/server";
import {
  inferFieldsFromTitle,
  normalizeBrandAlias,
  normalizeLookupTitle,
} from "@/lib/titleInference";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const barcode = searchParams.get("barcode")?.trim();

  if (!barcode) {
    return NextResponse.json({ ok: false, error: "Missing barcode" }, { status: 400 });
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  const endpoint = process.env.RAPIDAPI_BARCODE_ENDPOINT;
  const apiHost = process.env.RAPIDAPI_HOST;

  // If not configured, return a helpful stub response.
  if (!apiKey || !endpoint || !apiHost) {
    return NextResponse.json({
      ok: false,
      error:
        "Barcode API not configured. Add RAPIDAPI_KEY, RAPIDAPI_HOST, and RAPIDAPI_BARCODE_ENDPOINT to .env.local",
      barcode,
      hint: {
        expected:
          "RAPIDAPI_BARCODE_ENDPOINT should be a full URL. Example: https://barcodes-lookup.p.rapidapi.com/"
      }
    }, { status: 200 });
  }

  // Replace token in endpoint if present.
  const baseUrl = endpoint.includes("{BARCODE}")
    ? endpoint.replace("{BARCODE}", encodeURIComponent(barcode))
    : `${endpoint}${endpoint.includes("?") ? "&" : "?"}query=${encodeURIComponent(barcode)}`;
  const url = baseUrl;

  try {
    const r = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": apiHost,
      },
      // Avoid caching stale metadata
      cache: "no-store",
    });

    if (!r.ok) {
      const text = await r.text();
      const message =
        r.status === 404 ? "No barcode match." : `Barcode API error: ${r.status}`;
      return NextResponse.json(
        {
          ok: false,
          error: message,
          details: text,
        },
        { status: 200 }
      );
    }

    const data = await r.json();

    // NOTE:
    // Different barcode APIs return different shapes.
    // Map the response into our internal normalized format.
    // Adjust this mapping once you choose a specific endpoint.
    const normalized = normalizeBarcodeResponse(data);

    return NextResponse.json({ ok: true, barcode, data: normalized }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 200 });
  }
}

function normalizeBarcodeResponse(raw: any) {
  // Best-effort normalization. Customize after choosing your barcode API endpoint.
  const product =
    raw?.products?.[0] ??
    raw?.product ??
    raw?.items?.[0] ??
    raw?.data?.[0] ??
    raw;
  const rawTitle =
    product?.title ??
    product?.product_name ??
    raw?.title ??
    raw?.product_name ??
    "";
  let title = String(rawTitle ?? "").trim();
  if (/\btomica\b/i.test(title) && /\btakara\s+tomy\b/i.test(title)) {
    title = title.replace(/\btakara\s+tomy\b/gi, "").replace(/\s{2,}/g, " ").trim();
  } else if (/\btakara\s+tomy\b/i.test(title)) {
    title = title.replace(/\btakara\s+tomy\b/gi, "Takara").replace(/\s{2,}/g, " ").trim();
  }
  const brand =
    product?.brand ??
    product?.manufacturer ??
    raw?.brand ??
    raw?.manufacturer ??
    "";
  const model = product?.model ?? raw?.model ?? "";
  const colorStyle =
    product?.color ??
    product?.style ??
    raw?.color ??
    raw?.style ??
    "";
  const images: string[] =
    product?.images ??
    raw?.images ??
    product?.image_urls ??
    raw?.image_urls ??
    (product?.image ? [product.image] : raw?.image ? [raw.image] : []);

  const inferred = inferFieldsFromTitle(title);
  let normalizedBrand = normalizeBrandAlias(brand);
  if (/\btakara\s+tomy\b/i.test(String(brand ?? ""))) {
    normalizedBrand = "Takara";
  }
  if (inferred.brand === "Tomica") {
    normalizedBrand = "Tomica";
  }
  if (!normalizedBrand) {
    normalizedBrand = inferred.brand ?? brand;
  }
  const normalizedTitle = normalizeLookupTitle(
    title,
    normalizedBrand ?? inferred.brand ?? null
  );

  return {
    title: normalizedTitle || title,
    brand: normalizedBrand || brand,
    model,
    color_style: colorStyle,
    images: images.filter(Boolean),
    raw
  };
}
