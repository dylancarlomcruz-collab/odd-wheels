import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import type { ShopProduct } from "@/components/ProductCard";
import { formatConditionLabel } from "@/lib/conditions";
import { collapseVariants, type VariantRow as ShopVariantRow } from "@/lib/shopProducts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (value.startsWith("data:")) return value;
  if (/^https?:\/\//i.test(value)) return value;

  const base = baseUrl.replace(/\/$/, "");
  if (!base) return null;

  if (value.startsWith("/storage/") || value.startsWith("storage/")) {
    const path = value.startsWith("/") ? value : `/${value}`;
    return `${base}${path}`;
  }

  if (value.startsWith("/")) return `${base}${value}`;
  return null;
}

function formatPeso(value: number) {
  return `₱${Math.round(value).toLocaleString("en-PH")}`;
}

function truncate(text: string, max = 60) {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}...`;
}

async function toDataUrl(url: string) {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
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
      image: card.image ? await toDataUrl(card.image) : null,
    }))
  );

  return {
    cards: cardsWithImages,
    totalCount: relevantProducts.length,
    brandTabs: buildBrandTabs(products),
  };
}

export async function GET() {
  const snapshot = await loadSnapshot();

  const cards: OgCard[] =
    snapshot?.cards.length
      ? snapshot.cards
      : [
          {
            key: "fallback",
            title: "Nissan GT-R NISMO #23 Winner Suzuka Super GT Series",
            image: null,
            priceLabel: "₱1,199",
            conditionLabel: "SEALED",
            conditionTags: ["SEALED"],
            lowStock: true,
            inCarts: 0,
          },
          {
            key: "fallback-2",
            title: "Mini GT Nissan GT-R (R35) Nismo GT3 FIA GT World Cup Macau 2023",
            image: null,
            priceLabel: "₱849",
            conditionLabel: "UNSEALED",
            conditionTags: ["UNSEALED"],
            lowStock: true,
            inCarts: 0,
          },
          {
            key: "fallback-3",
            title: "Kaido House Nissan Skyline GT R Works Shinjuku V1 (R34)",
            image: null,
            priceLabel: "₱799 - ₱1,099",
            conditionLabel: "SEALED",
            conditionTags: ["SEALED", "UNSEALED"],
            lowStock: true,
            inCarts: 0,
          },
          {
            key: "fallback-4",
            title: "Mini GT Nissan LB-ER34 Super Silhouette LBWK Skyline Red/Black",
            image: null,
            priceLabel: "₱749 - ₱849",
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

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(180deg, #080c14 0%, #0a0f19 100%)",
          color: "#f8fafc",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            height: 58,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 18px",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(8,11,18,0.96)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                background: "radial-gradient(circle at 35% 30%, #ff8f49, #a52708 75%)",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 30, lineHeight: 1, fontWeight: 700 }}>ODD WHEELS</div>
              <div style={{ fontSize: 16, lineHeight: 1.2, color: "rgba(255,255,255,0.66)" }}>Shop</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 290,
                height: 38,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.16)",
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                color: "rgba(255,255,255,0.46)",
                fontSize: 14,
              }}
            >
              Search brand, model, keyword...
            </div>
            <div
              style={{
                height: 38,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.16)",
                padding: "0 14px",
                fontSize: 22,
                display: "flex",
                alignItems: "center",
                color: "rgba(255,255,255,0.86)",
              }}
            >
              Dark
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
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(6,10,18,0.98)",
          }}
        >
          {[
            { label: "RELEVANCE", active: true },
            { label: "NEWEST", active: false },
            { label: "MOST POPULAR", active: false },
            { label: "PRICE ⇅", active: false },
          ].map((tab) => (
            <div
              key={tab.label}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 8,
                border: tab.active
                  ? "1px solid rgba(245,180,72,0.78)"
                  : "1px solid rgba(255,255,255,0.16)",
                background: tab.active ? "rgba(151,97,0,0.42)" : "rgba(8,13,22,0.9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
                color: tab.active ? "#f7dfa4" : "rgba(255,255,255,0.78)",
                letterSpacing: 0.3,
              }}
            >
              {tab.label}
            </div>
          ))}
        </div>

        <div
          style={{
            height: 52,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 16px",
            borderBottom: "1px solid rgba(56,189,248,0.35)",
            background: "rgba(5,9,16,0.97)",
          }}
        >
          {brandTabs.slice(0, 7).map((label, index) => (
            <div
              key={label}
              style={{
                height: 30,
                minWidth: index === 0 ? 88 : 100,
                borderRadius: 9,
                border:
                  index === 0
                    ? "1px solid rgba(66,190,255,0.9)"
                    : "1px solid rgba(255,255,255,0.16)",
                background:
                  index === 0
                    ? "rgba(23,118,166,0.54)"
                    : "rgba(8,12,18,0.86)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 10px",
                fontSize: 12,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              {label}
            </div>
          ))}
          <div
            style={{
              height: 30,
              minWidth: 90,
              borderRadius: 9,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(8,12,18,0.86)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Show more
          </div>
        </div>

        <div
          style={{
            height: 54,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 0.6 }}>ALL ITEMS</div>
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.45)" }}>
            Showing {shownCount} of {totalCount}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, padding: "0 12px 12px", flex: 1 }}>
          {cards.map((card) => (
            <div
              key={card.key}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                borderRadius: 14,
                overflow: "hidden",
                background: "rgba(23,25,32,0.98)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              <div
                style={{
                  height: 214,
                  background: "#eef0f3",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {card.image ? (
                  <img
                    src={card.image}
                    alt={card.title}
                    width={287}
                    height={214}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ fontSize: 24, color: "#8a909b" }}>ODD WHEELS</div>
                )}
              </div>

              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  padding: "12px 14px 10px",
                }}
              >
                <div style={{ fontSize: 18, lineHeight: 1.25, fontWeight: 700, minHeight: 52 }}>
                  {truncate(card.title, 58)}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ fontSize: 34, fontWeight: 800, color: "#f5bf7f" }}>
                    {card.priceLabel}
                  </div>
                  <div style={{ fontSize: 15, color: "rgba(255,255,255,0.68)" }}>
                    {card.conditionLabel}
                  </div>
                </div>

                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  {card.lowStock ? (
                    <div
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(248,113,113,0.62)",
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
                        border: "1px solid rgba(255,255,255,0.24)",
                        color: "rgba(255,255,255,0.78)",
                        padding: "3px 8px",
                        fontSize: 11,
                      }}
                    >
                      {card.inCarts} in carts
                    </div>
                  ) : null}
                </div>

                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  {card.conditionTags.map((tag) => (
                    <div
                      key={`${card.key}-${tag}`}
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(56,189,248,0.5)",
                        background: "rgba(8,77,111,0.4)",
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
                    height: 38,
                    borderRadius: 11,
                    background: "#dd7a00",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#180f02",
                    fontSize: 18,
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

