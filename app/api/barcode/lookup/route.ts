import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const barcode = searchParams.get("barcode")?.trim();

  if (!barcode) {
    return NextResponse.json({ ok: false, error: "Missing barcode" }, { status: 400 });
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  const endpoint = process.env.RAPIDAPI_BARCODE_ENDPOINT;

  // If not configured, return a helpful stub response.
  if (!apiKey || !endpoint) {
    return NextResponse.json({
      ok: false,
      error: "Barcode API not configured. Add RAPIDAPI_KEY and RAPIDAPI_BARCODE_ENDPOINT to .env.local",
      barcode,
      hint: {
        expected: "RAPIDAPI_BARCODE_ENDPOINT should be a full URL. Example: https://example-rapidapi.com/lookup?code={BARCODE}"
      }
    }, { status: 200 });
  }

  // Replace token in endpoint if present.
  const url = endpoint.includes("{BARCODE}")
    ? endpoint.replace("{BARCODE}", encodeURIComponent(barcode))
    : `${endpoint}${endpoint.includes("?") ? "&" : "?"}barcode=${encodeURIComponent(barcode)}`;

  try {
    const r = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": new URL(url).host
      },
      // Avoid caching stale metadata
      cache: "no-store",
    });

    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json({ ok: false, error: `Barcode API error: ${r.status}`, details: text }, { status: 200 });
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
  // Best-effort normalization. Customize after choosing your RapidAPI endpoint.
  const title = raw?.title ?? raw?.product?.title ?? raw?.product_name ?? "";
  const brand = raw?.brand ?? raw?.product?.brand ?? raw?.manufacturer ?? "";
  const model = raw?.model ?? raw?.product?.model ?? "";
  const colorStyle = raw?.color ?? raw?.style ?? raw?.product?.color ?? raw?.product?.style ?? "";
  const images: string[] =
    raw?.images ??
    raw?.product?.images ??
    raw?.image_urls ??
    (raw?.image ? [raw.image] : []);

  return {
    title,
    brand,
    model,
    color_style: colorStyle,
    images: images.filter(Boolean),
    raw
  };
}
