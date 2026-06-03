import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import type { ShopProduct } from "@/components/ProductCard";
import { formatConditionLabel } from "@/lib/conditions";
import { collapseVariants, type VariantRow as ShopVariantRow } from "@/lib/shopProducts";

export const runtime = "edge";
export const dynamic = "force-dynamic";
const STATIC_OG_SCREENSHOT_PATH = "/og/shop-screenshot.png";

type RawVariantRow = {
  id: string;
  condition: string | null;
  issue_notes: string | null;
  issue_photo_urls: string[] | null;
  public_notes: string | null;
  ship_class: string | null;
  price: number | null;
  sale_price: number | null;
  discount_percent: number | null;
  qty: number | null;
  product:
    | {
        id: string;
        title: string;
        brand: string | null;
        model: string | null;
        variation: string | null;
        image_urls: string[] | null;
        is_active: boolean | null;
        created_at: string | null;
      }
    | Array<{
        id: string;
        title: string;
        brand: string | null;
        model: string | null;
        variation: string | null;
        image_urls: string[] | null;
        is_active: boolean | null;
        created_at: string | null;
      }>
    | null;
};

type OgCard = {
  key: string;
  title: string;
  image: string | null;
  priceLabel: string;
  conditionLabel: string;
  conditionTags: string[];
  lowStock: boolean;
  inCarts: number;
};

type ShopSnapshot = {
  cards: OgCard[];
  totalCount: number;
  brandTabs: string[];
};

const CANONICAL_BRAND_LABELS: Record<string, string> = {
  minigt: "Mini GT",
  kaidohouse: "Kaido House",
  kaido: "Kaido House",
  poprace: "Pop Race",
  tarmac: "Tarmac",
  tarmacworks: "Tarmac",
};

const PREFERRED_BRAND_KEYS: Array<{ label: string; keys: string[] }> = [
  { label: "Mini GT", keys: ["minigt"] },
  { label: "Kaido House", keys: ["kaidohouse", "kaido"] },
  { label: "Pop Race", keys: ["poprace"] },
  { label: "Tarmac", keys: ["tarmac", "tarmacworks"] },
  { label: "Tomica", keys: ["tomica"] },
  { label: "Inno64", keys: ["inno64"] },
];
const MAX_OG_IMAGE_BYTES = 1_900_000;

function pickProduct(value: RawVariantRow["product"]) {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function normalizeBrandKey(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeImageUrl(raw: string | null | undefined, baseUrl: string) {
  const toPublicObjectUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.pathname.includes("/storage/v1/render/image/public/")) {
        parsed.pathname = parsed.pathname.replace(
          "/storage/v1/render/image/public/",
          "/storage/v1/object/public/"
        );
      }
      parsed.search = "";
      return parsed.toString();
    } catch {
      return url;
    }
  };

  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (value.startsWith("data:")) return value;
  if (/^https?:\/\//i.test(value)) return toPublicObjectUrl(value);

  const base = baseUrl.replace(/\/$/, "");
  if (!base) return null;

  if (value.startsWith("/storage/") || value.startsWith("storage/")) {
    const path = value.startsWith("/") ? value : `/${value}`;
    return toPublicObjectUrl(`${base}${path}`);
  }

  if (value.startsWith("/")) return toPublicObjectUrl(`${base}${value}`);
  return null;
}

function formatPeso(value: number) {
  return `PHP ${Math.round(value).toLocaleString("en-PH")}`;
}

function truncate(text: string, max = 60) {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}...`;
}

async function toDataUrl(url: string) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_OG_IMAGE_BYTES) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_OG_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

async function tryServeScreenshot(request: Request) {
  const configuredUrl = String(process.env.SHOP_OG_SCREENSHOT_URL ?? "").trim();
  const { origin } = new URL(request.url);
  const candidates = [configuredUrl, `${origin}${STATIC_OG_SCREENSHOT_PATH}`].filter(Boolean);

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok || !res.body) continue;
      const headers = new Headers();
      headers.set("content-type", res.headers.get("content-type") || "image/png");
      headers.set("cache-control", "public, max-age=0, s-maxage=3600");
      return new Response(res.body, { status: 200, headers });
    } catch {
      continue;
    }
  }

  return null;
}

function toCollapseRows(rows: RawVariantRow[]): ShopVariantRow[] {
  const out: ShopVariantRow[] = [];

  for (const row of rows) {
    const product = pickProduct(row.product);
    if (!product) continue;

    out.push({
      id: row.id,
      condition: row.condition,
      issue_notes: row.issue_notes,
      issue_photo_urls: row.issue_photo_urls,
      public_notes: row.public_notes,
      ship_class: row.ship_class,
      price: row.price,
      sale_price: row.sale_price,
      discount_percent: row.discount_percent,
      qty: row.qty,
      product: {
        id: product.id,
        title: product.title,
        brand: product.brand,
        model: product.model,
        variation: product.variation,
        image_urls: product.image_urls,
        is_active: product.is_active,
        created_at: product.created_at,
      },
    });
  }

  return out;
}

function buildBrandTabs(products: ShopProduct[]) {
  const map = new Map<string, { label: string; count: number }>();

  for (const product of products) {
    const raw = String(product.brand ?? "").trim();
    if (!raw) continue;
    const key = normalizeBrandKey(raw);
    if (!key) continue;
    const label = CANONICAL_BRAND_LABELS[key] ?? raw;
    const prev = map.get(key);
    map.set(key, {
      label: prev?.label ?? label,
      count: (prev?.count ?? 0) + 1,
    });
  }

  const byCount = Array.from(map.entries())
    .map(([key, value]) => ({ key, label: value.label, count: value.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const picked: string[] = [];
  for (const preferred of PREFERRED_BRAND_KEYS) {
    const hasAny = preferred.keys.some((key) => byCount.some((entry) => entry.key === key));
    if (hasAny) picked.push(preferred.label);
  }
  for (const entry of byCount) {
    if (picked.length >= 6) break;
    if (!picked.includes(entry.label)) picked.push(entry.label);
  }

  return ["All", ...picked];
}

async function loadSnapshot(): Promise<ShopSnapshot | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anon) return null;

  const supabase = createClient(url, anon, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "id,condition,issue_notes,issue_photo_urls,public_notes,ship_class,price,sale_price,discount_percent,qty,product:products(id,title,brand,model,variation,image_urls,is_active,created_at)"
    )
    .gt("qty", 0)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error || !data) return null;

  const products = collapseVariants(toCollapseRows(data as unknown as RawVariantRow[]));
  if (!products.length) return null;

  const productIds = products.map((item) => item.key).filter(Boolean);
  const [clicksRes, addsRes, cartRes] = await Promise.all([
    supabase.from("product_clicks").select("product_id,clicks").in("product_id", productIds),
    supabase.from("product_add_to_cart").select("product_id,adds").in("product_id", productIds),
    supabase.rpc("get_cart_counts", { p_product_ids: productIds }),
  ]);

  const clickMap: Record<string, number> = {};
  const addMap: Record<string, number> = {};
  const cartMap: Record<string, number> = {};

  (clicksRes.data as Array<{ product_id: string; clicks: number }> | null)?.forEach((row) => {
    if (row?.product_id) clickMap[row.product_id] = Number(row.clicks ?? 0);
  });
  (addsRes.data as Array<{ product_id: string; adds: number }> | null)?.forEach((row) => {
    if (row?.product_id) addMap[row.product_id] = Number(row.adds ?? 0);
  });
  (cartRes.data as Array<{ product_id: string; cart_count: number }> | null)?.forEach((row) => {
    if (row?.product_id) cartMap[row.product_id] = Number(row.cart_count ?? 0);
  });

  const nowTs = Date.now();
  const getCreatedTime = (product: ShopProduct) =>
    product.created_at ? new Date(product.created_at).getTime() : 0;
  const getRecencyBoost = (product: ShopProduct) => {
    const created = getCreatedTime(product);
    if (!created) return 0;
    const ageDays = (nowTs - created) / (1000 * 60 * 60 * 24);
    if (!Number.isFinite(ageDays)) return 0;
    return Math.max(0, 30 - ageDays) / 30;
  };
  const getBasePopularity = (product: ShopProduct) =>
    (clickMap[product.key] ?? 0) + (addMap[product.key] ?? 0) * 3 + (cartMap[product.key] ?? 0) * 5;

  const sortedProducts = products
    .map((product, index) => {
      const isNew =
        product.created_at &&
        nowTs - new Date(product.created_at).getTime() < 1000 * 60 * 60 * 24 * 14;
      const lowStock = (product.minQty ?? 0) > 0 && (product.minQty ?? 0) <= 2;
      const score = getBasePopularity(product) * 0.6 + (isNew ? 2 : 0) + (lowStock ? 1 : 0);
      return { product, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.product);

  const relevantProducts = sortedProducts.slice().sort((a, b) => {
    const aScore = getRecencyBoost(a) * 2 + getBasePopularity(a) * 0.1;
    const bScore = getRecencyBoost(b) * 2 + getBasePopularity(b) * 0.1;
    if (bScore !== aScore) return bScore - aScore;
    return getCreatedTime(b) - getCreatedTime(a);
  });

  const cards = relevantProducts.slice(0, 4).map((product) => {
    const image = normalizeImageUrl(product.image_url || product.image_urls?.[0], url);
    const minPrice = product.minEffectivePrice ?? product.minPrice;
    const maxPrice = product.maxEffectivePrice ?? product.maxPrice;
    const priceLabel =
      minPrice === maxPrice ? formatPeso(minPrice) : `${formatPeso(minPrice)} - ${formatPeso(maxPrice)}`;
    const conditionTags = Array.from(
      new Set(
        (product.options ?? [])
          .slice(0, 3)
          .map((opt) => formatConditionLabel(opt.condition_raw ?? opt.condition, { upper: true }))
          .filter(Boolean)
      )
    );
    const selected = product.options?.[0];

    return {
      key: product.key,
      title: product.title,
      image,
      priceLabel,
      conditionLabel: formatConditionLabel(selected?.condition_raw ?? selected?.condition, {
        upper: true,
      }),
      conditionTags: conditionTags.slice(0, 2),
      lowStock: (product.minQty ?? 0) <= 1,
      inCarts: cartMap[product.key] ?? 0,
    } satisfies OgCard;
  });

  const cardsWithImages = await Promise.all(
    cards.map(async (card) => ({
      ...card,
      image: card.image ? (await toDataUrl(card.image)) ?? card.image : null,
    }))
  );

  return {
    cards: cardsWithImages,
    totalCount: relevantProducts.length,
    brandTabs: buildBrandTabs(products),
  };
}

export async function GET(request: Request) {
  const screenshot = await tryServeScreenshot(request);
  if (screenshot) return screenshot;

  const snapshot = await loadSnapshot();

  const cards: OgCard[] =
    snapshot?.cards.length
      ? snapshot.cards
      : [
          {
            key: "fallback",
            title: "Nissan GT-R NISMO #23 Winner Suzuka Super GT Series",
            image: null,
            priceLabel: "PHP 1,199",
            conditionLabel: "SEALED",
            conditionTags: ["SEALED"],
            lowStock: true,
            inCarts: 0,
          },
          {
            key: "fallback-2",
            title: "Mini GT Nissan GT-R (R35) Nismo GT3 FIA GT World Cup Macau 2023",
            image: null,
            priceLabel: "PHP 849",
            conditionLabel: "UNSEALED",
            conditionTags: ["UNSEALED"],
            lowStock: true,
            inCarts: 0,
          },
          {
            key: "fallback-3",
            title: "Kaido House Nissan Skyline GT R Works Shinjuku V1 (R34)",
            image: null,
            priceLabel: "PHP 799 - PHP 1,099",
            conditionLabel: "SEALED",
            conditionTags: ["SEALED", "UNSEALED"],
            lowStock: true,
            inCarts: 0,
          },
          {
            key: "fallback-4",
            title: "Mini GT Nissan LB-ER34 Super Silhouette LBWK Skyline Red/Black",
            image: null,
            priceLabel: "PHP 749 - PHP 849",
            conditionLabel: "SEALED",
            conditionTags: ["SEALED", "UNSEALED"],
            lowStock: false,
            inCarts: 1,
          },
        ];

  const brandTabs =
    snapshot?.brandTabs.length && snapshot.brandTabs.length > 1
      ? snapshot.brandTabs
      : ["All", "Mini GT", "Kaido House", "Pop Race", "Tarmac", "Tomica", "Inno64"];

  const totalCount = snapshot?.totalCount ?? 676;
  const shownCount = Math.min(48, totalCount);
  const visibleCards = cards.slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          background: "#0b0d12",
          color: "#f3f4f6",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            height: 66,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "linear-gradient(180deg, #12131a 0%, #0f1118 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "radial-gradient(circle at 32% 28%, #ffb25f, #a52f10 78%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff1d6",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              OW
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 700 }}>ODD WHEELS</div>
              <div style={{ fontSize: 15, lineHeight: 1.2, color: "rgba(255,255,255,0.68)" }}>Shop</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 418,
                height: 44,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                padding: "0 18px",
                color: "rgba(255,255,255,0.42)",
                fontSize: 15,
              }}
            >
              Search brand, model, keyword...
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.78)",
              }}
            >
              S
            </div>
            <div
              style={{
                height: 44,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.15)",
                padding: "0 14px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 30,
                color: "rgba(255,255,255,0.9)",
                fontWeight: 700,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 99,
                  background: "rgba(255,255,255,0.95)",
                }}
              />
              <div style={{ fontSize: 30, lineHeight: 1 }}>Dark</div>
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                fontSize: 30,
                color: "rgba(255,255,255,0.9)",
                fontWeight: 700,
              }}
            >
              C
              <div
                style={{
                  position: "absolute",
                  top: -6,
                  right: -4,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 99,
                  background: "#e2812a",
                  color: "#ffffff",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 5px",
                }}
              >
                1
              </div>
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.85)",
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              =
            </div>
          </div>
        </div>

        <div
          style={{
            height: 58,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "#10131a",
          }}
        >
          {[
            { label: "RELEVANCE", active: true },
            { label: "NEWEST", active: false },
            { label: "RARITY", active: false },
            { label: "PRICE UP DOWN", active: false },
          ].map((tab) => (
            <div
              key={tab.label}
              style={{
                flex: 1,
                height: 42,
                borderRadius: 11,
                border: tab.active
                  ? "1px solid rgba(230,162,56,0.9)"
                  : "1px solid rgba(255,255,255,0.14)",
                background: tab.active ? "rgba(123,83,18,0.55)" : "rgba(8,11,17,0.95)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                color: tab.active ? "#f5dfb0" : "rgba(255,255,255,0.78)",
                letterSpacing: 0.5,
              }}
            >
              {tab.label}
            </div>
          ))}
        </div>

        <div
          style={{
            height: 60,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 16px",
            borderBottom: "1px solid rgba(45,138,181,0.5)",
            background: "#0d1218",
          }}
        >
          {brandTabs.slice(0, 7).map((label, index) => (
            <div
              key={label}
              style={{
                height: 36,
                minWidth: index === 0 ? 92 : 104,
                borderRadius: 10,
                border:
                  index === 0
                    ? "1px solid rgba(60,187,255,0.85)"
                    : "1px solid rgba(255,255,255,0.14)",
                background:
                  index === 0
                    ? "rgba(17,103,146,0.55)"
                    : "rgba(8,12,18,0.95)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 12px",
                fontSize: 11,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              {label}
            </div>
          ))}
          <div
            style={{
              height: 36,
              minWidth: 102,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(8,12,18,0.95)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Show more
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.72)",
                fontSize: 22,
              }}
            >
              II
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.72)",
                fontSize: 22,
              }}
            >
              []
            </div>
          </div>
        </div>

        <div
          style={{
            height: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 18px",
          }}
        >
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>ALL ITEMS</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.38)" }}>
            {`Showing ${shownCount} of ${totalCount}`}
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, padding: "0 18px 16px", flex: 1 }}>
          {visibleCards.map((card) => (
            <div
              key={card.key}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                borderRadius: 18,
                overflow: "hidden",
                background: "rgba(27,30,36,0.98)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <div
                style={{
                  height: 184,
                  background: "#e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {card.image ? (
                  <img
                    src={card.image}
                    alt={card.title}
                    width={350}
                    height={184}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ fontSize: 22, color: "#8a909b" }}>ODD WHEELS</div>
                )}
              </div>

              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  padding: "12px 16px 14px",
                  background: "rgba(27,30,36,0.98)",
                }}
              >
                <div style={{ fontSize: 15, lineHeight: 1.25, fontWeight: 700, minHeight: 56 }}>
                  {truncate(card.title, 52)}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ fontSize: 19, fontWeight: 700, color: "#f3bf82", lineHeight: 1.15 }}>
                    {card.priceLabel}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.68)" }}>
                    {card.conditionLabel}
                  </div>
                </div>

                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  {card.lowStock ? (
                    <div
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(243,105,105,0.72)",
                        color: "#fecaca",
                        padding: "3px 8px",
                        fontSize: 11,
                      }}
                    >
                      ONLY 1 LEFT
                    </div>
                  ) : null}
                  {card.inCarts > 0 ? (
                    <div
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.2)",
                        color: "rgba(255,255,255,0.72)",
                        padding: "3px 8px",
                        fontSize: 11,
                      }}
                    >
                      {`${card.inCarts} in carts`}
                    </div>
                  ) : null}
                </div>

                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  {card.conditionTags.map((tag) => (
                    <div
                      key={`${card.key}-${tag}`}
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(56,189,248,0.45)",
                        background: "rgba(8,70,102,0.45)",
                        color: "#d8f2ff",
                        padding: "3px 8px",
                        fontSize: 11,
                      }}
                    >
                      {tag}
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: "auto",
                    height: 40,
                    borderRadius: 12,
                    background: "#e18400",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#180f02",
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  Add
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

