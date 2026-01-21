import { NextResponse } from "next/server";
import {
  inferFieldsFromTitle,
  normalizeBrandAlias,
  normalizeLookupTitle,
} from "@/lib/titleInference";

type LookupResult = {
  title: string | null;
  brand: string | null;
  model: string | null;
  variation: string | null;
  images: string[];
  source_url: string;
};

const MAX_IMAGES = 9;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawUrl = String(searchParams.get("url") ?? "").trim();

  if (!rawUrl) {
    return NextResponse.json({ ok: false, error: "Missing URL." }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(rawUrl)) {
    return NextResponse.json(
      { ok: false, error: "URL must start with http:// or https://." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(rawUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch (${res.status}).` },
        { status: 200 }
      );
    }

    const html = await res.text();
    const data = extractFromHtml(html, rawUrl);
    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Lookup failed." },
      { status: 200 }
    );
  }
}

function extractFromHtml(html: string, baseUrl: string): LookupResult {
  const ogTitle = firstMeta(html, "property", "og:title");
  const twitterTitle = firstMeta(html, "name", "twitter:title");
  const itemName = firstMeta(html, "itemprop", "name");
  const titleTag = matchTag(html, "title");

  const title =
    cleanText(ogTitle) ||
    cleanText(twitterTitle) ||
    cleanText(itemName) ||
    cleanText(titleTag) ||
    null;

  const brandMeta = firstMeta(html, "name", "brand");
  const brandItemprop = firstMeta(html, "itemprop", "brand");

  const jsonLdProduct = pickProductFromJsonLd(html);
  const brandFromJson = readBrand(jsonLdProduct);

  const brand =
    cleanText(brandFromJson) ||
    cleanText(brandItemprop) ||
    cleanText(brandMeta) ||
    null;

  const ogImages = allMeta(html, "property", "og:image");
  const twitterImage = firstMeta(html, "name", "twitter:image");
  const itemImage = firstMeta(html, "itemprop", "image");

  const images = uniq(
    [
      ...ogImages,
      twitterImage,
      itemImage,
      ...readImagesFromJsonLd(jsonLdProduct),
    ]
      .filter(Boolean)
      .map((u) => absolutize(u, baseUrl))
      .filter(Boolean)
  ).slice(0, MAX_IMAGES);

  const inferred = inferFieldsFromTitle(title ?? "");
  const normalizedBrand = normalizeBrandAlias(brand) ?? inferred.brand ?? brand;
  const normalizedTitle =
    normalizeLookupTitle(title ?? "", normalizedBrand ?? inferred.brand ?? null) ||
    title ||
    null;

  return {
    title: normalizedTitle,
    brand: normalizedBrand ?? brand,
    model: null,
    variation: null,
    images,
    source_url: baseUrl,
  };
}

function matchTag(html: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  return m ? m[1] : "";
}

function firstMeta(html: string, attr: string, name: string) {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${escapeRegExp(name)}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m ? m[1] : "";
}

function allMeta(html: string, attr: string, name: string) {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${escapeRegExp(name)}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "gi"
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push(m[1]);
  }
  return out;
}

function pickProductFromJsonLd(html: string): any | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw) continue;
    const parsed = safeJsonParse(raw);
    const product = findProduct(parsed);
    if (product) return product;
  }
  return null;
}

function findProduct(node: any): any | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProduct(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;

  const type = node["@type"];
  if (typeof type === "string" && type.toLowerCase() === "product") return node;
  if (Array.isArray(type) && type.some((t) => String(t).toLowerCase() === "product"))
    return node;

  for (const key of Object.keys(node)) {
    const found = findProduct(node[key]);
    if (found) return found;
  }
  return null;
}

function readBrand(product: any): string | null {
  if (!product) return null;
  const brand = product.brand;
  if (!brand) return null;
  if (typeof brand === "string") return brand;
  if (typeof brand === "object") {
    return typeof brand.name === "string" ? brand.name : null;
  }
  return null;
}

function readImagesFromJsonLd(product: any): string[] {
  if (!product) return [];
  const image = product.image;
  if (!image) return [];
  if (typeof image === "string") return [image];
  if (Array.isArray(image)) return image.filter((v) => typeof v === "string");
  return [];
}

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cleanText(value: string | null | undefined) {
  const trimmed = String(value ?? "").replace(/\s+/g, " ").trim();
  return trimmed ? decodeHtml(trimmed) : "";
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function absolutize(raw: string, baseUrl: string) {
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
}

function uniq(items: string[]) {
  return Array.from(new Set(items));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
