import { NextResponse } from "next/server";

export const runtime = "nodejs";

const STATIC_MAP_BASE = "https://staticmap.openstreetmap.de/staticmap.php";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const DEFAULT_ZOOM = 16;
const MIN_ZOOM = 5;
const MAX_ZOOM = 19;

type GeoResult = {
  lat: number;
  lng: number;
  address: string | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clampZoom(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value)));
}

function buildStaticMapUrl(lat: number, lng: number, zoom: number) {
  const url = new URL(STATIC_MAP_BASE);
  url.searchParams.set("center", `${lat},${lng}`);
  url.searchParams.set("zoom", String(clampZoom(zoom)));
  url.searchParams.set("size", "640x360");
  url.searchParams.set("markers", `${lat},${lng},red-pushpin`);
  return url.toString();
}

function buildMapLink(lat: number, lng: number) {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

async function geocodeAddress(address: string): Promise<GeoResult | null> {
  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", address);

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "odd-wheels-pos/1.0",
      "Accept-Language": "en",
    },
    cache: "no-store",
  });

  if (!res.ok) return null;
  const data = (await res.json()) as Array<Record<string, string>>;
  const row = data?.[0];
  if (!row) return null;

  const lat = toNumber(row.lat);
  const lng = toNumber(row.lon);
  if (lat === null || lng === null) return null;
  return { lat, lng, address: row.display_name ?? null };
}

async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  const url = new URL(`${NOMINATIM_BASE}/reverse`);
  url.searchParams.set("format", "json");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "odd-wheels-pos/1.0",
      "Accept-Language": "en",
    },
    cache: "no-store",
  });

  if (!res.ok) return { lat, lng, address: null };
  const data = (await res.json()) as Record<string, unknown>;
  const address =
    typeof data?.display_name === "string" ? data.display_name : null;
  return { lat, lng, address };
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  const latValue = toNumber(body.lat);
  const lngValue = toNumber(body.lng);
  const zoom = clampZoom(toNumber(body.zoom ?? DEFAULT_ZOOM) ?? DEFAULT_ZOOM);

  let result: GeoResult | null = null;

  if (address && (latValue === null || lngValue === null)) {
    result = await geocodeAddress(address);
    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Address not found." },
        { status: 200 }
      );
    }
  } else if (latValue !== null && lngValue !== null) {
    result = await reverseGeocode(latValue, lngValue);
  } else {
    return NextResponse.json(
      { ok: false, error: "Provide address or coordinates." },
      { status: 400 }
    );
  }

  if (!result) {
    return NextResponse.json(
      { ok: false, error: "Unable to resolve location." },
      { status: 200 }
    );
  }

  const mapImageUrl = buildStaticMapUrl(result.lat, result.lng, zoom);
  const mapUrl = buildMapLink(result.lat, result.lng);

  return NextResponse.json(
    {
      ok: true,
      data: {
        lat: result.lat,
        lng: result.lng,
        address: result.address,
        map_image_url: mapImageUrl,
        map_url: mapUrl,
      },
    },
    { status: 200 }
  );
}
