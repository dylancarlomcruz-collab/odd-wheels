import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShopCard = {
  key: string;
  title: string;
  brand: string | null;
  image: string | null;
  price: number;
  condition: string | null;
  qty: number;
};

type VariantRow = {
  id: string;
  price: number | null;
  sale_price: number | null;
  qty: number | null;
  condition: string | null;
  product:
    | {
        id: string;
        title: string;
        brand: string | null;
        image_urls: string[] | null;
        is_active: boolean | null;
      }
    | Array<{
        id: string;
        title: string;
        brand: string | null;
        image_urls: string[] | null;
        is_active: boolean | null;
      }>
    | null;
};

type ProductRow = {
  id: string;
  title: string;
  brand: string | null;
  image_urls: string[] | null;
  is_active: boolean | null;
};

function pickProduct(value: VariantRow["product"]): ProductRow | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function getConditionLabel(value: string | null | undefined) {
  const key = String(value ?? "").trim().toLowerCase();
  if (key === "sealed") return "SEALED";
  if (key === "unsealed") return "UNSEALED";
  if (key === "resealed") return "RESEALED";
  if (key === "near_mint") return "NEAR MINT";
  if (key === "with_issues") return "WITH ISSUES";
  if (key === "sealed_blister") return "SEALED BLISTER";
  if (key === "unsealed_blister") return "UNSEALED BLISTER";
  if (key === "blistered") return "BLISTERED";
  return "CONDITION";
}

function formatPeso(value: number) {
  return `PHP ${Math.round(value).toLocaleString("en-PH")}`;
}

function toEffectivePrice(price: number | null, salePrice: number | null) {
  const base = Number(price ?? 0);
  const sale = Number(salePrice ?? 0);
  if (sale > 0 && sale < base) return sale;
  return base;
}

async function getPreviewItems(): Promise<ShopCard[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anon) return [];

  const supabase = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, price, sale_price, qty, condition, product:products(id,title,brand,image_urls,is_active)")
    .gt("qty", 0)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error || !data) return [];

  const rows = data as unknown as VariantRow[];
  const unique = new Map<string, ShopCard>();
  for (const row of rows) {
    const p = pickProduct(row.product);
    if (!p || p.is_active === false) continue;

    const variantId = String(row.id ?? "");
    if (!variantId || unique.has(variantId)) continue;

    const first = Array.isArray(p.image_urls) ? p.image_urls.find(Boolean) : null;
    const price = toEffectivePrice(row.price, row.sale_price);
    if (!Number.isFinite(price) || price <= 0) continue;

    unique.set(variantId, {
      key: variantId,
      title: p.title,
      brand: p.brand,
      image: normalizeImageUrl(first, url),
      price,
      condition: row.condition,
      qty: Math.max(0, Number(row.qty ?? 0)),
    });
    if (unique.size >= 6) break;
  }

  const items = Array.from(unique.values());
  const withImage = await Promise.all(
    items.map(async (item) => ({
      ...item,
      image: item.image ? await toDataUrl(item.image) : null,
    }))
  );
  return withImage;
}

function normalizeImageUrl(raw: string | null | undefined, baseUrl: string) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/storage/") || value.startsWith("storage/")) {
    const path = value.startsWith("/") ? value : `/${value}`;
    return `${baseUrl.replace(/\/$/, "")}${path}`;
  }
  return null;
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

function truncate(text: string, max = 44) {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}...`;
}


export async function GET() {
  const items = await getPreviewItems();
  const cards = (items.length
    ? items.slice(0, 4)
    : [
        {
          key: "fallback",
          title: "Mini GT Nissan GT-R Nismo GT3",
          brand: "Mini GT",
          image: null,
          price: 849,
          condition: "sealed",
          qty: 1,
        },
        {
          key: "fallback-2",
          title: "Kaido House Skyline GT-R",
          brand: "Kaido House",
          image: null,
          price: 1099,
          condition: "unsealed",
          qty: 2,
        },
        {
          key: "fallback-3",
          title: "Mini GT LBWK Skyline Red/Black",
          brand: "Mini GT",
          image: null,
          price: 749,
          condition: "sealed",
          qty: 4,
        },
        {
          key: "fallback-4",
          title: "Pop Race Collectible Series",
          brand: "Pop Race",
          image: null,
          price: 999,
          condition: "sealed",
          qty: 3,
        },
      ]) as ShopCard[];

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(180deg, #05070c 0%, #090c13 100%)",
          color: "#f8fafc",
          padding: "0",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(7,10,16,0.92)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background:
                  "radial-gradient(circle at 35% 35%, #ff6c37, #a52006 75%)",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 0.3 }}>
                ODD WHEELS
              </div>
              <div style={{ fontSize: 18, color: "rgba(255,255,255,0.58)" }}>
                Shop
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 280,
                height: 38,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.18)",
                color: "rgba(255,255,255,0.5)",
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                paddingLeft: 14,
              }}
            >
              Search brand, model, keyword...
            </div>
            <div
              style={{
                height: 38,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.18)",
                padding: "0 12px",
                display: "flex",
                alignItems: "center",
                fontSize: 18,
              }}
            >
              Dark
            </div>
          </div>
        </div>

        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 20px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(4,8,16,0.92)",
          }}
        >
          {[
            { label: "RELEVANCE", active: true },
            { label: "NEWEST", active: false },
            { label: "MOST POPULAR", active: false },
            { label: "PRICE", active: false },
          ].map((tab) => (
            <div
              key={tab.label}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 8,
                border: tab.active
                  ? "1px solid rgba(236,179,68,0.8)"
                  : "1px solid rgba(255,255,255,0.16)",
                background: tab.active
                  ? "rgba(165,112,12,0.35)"
                  : "rgba(8,12,20,0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: tab.active ? "#f4dea8" : "rgba(255,255,255,0.78)",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 0.4,
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
            padding: "0 20px",
            borderBottom: "1px solid rgba(66,177,220,0.35)",
            background: "rgba(6,9,15,0.96)",
          }}
        >
          {["All", "Mini GT", "Kaido House", "Pop Race", "Tarmac"].map(
            (brand, index) => (
              <div
                key={brand}
                style={{
                  minWidth: index === 0 ? 86 : 104,
                  height: 30,
                  borderRadius: 9,
                  border:
                    index === 0
                      ? "1px solid rgba(56,189,248,0.8)"
                      : "1px solid rgba(255,255,255,0.16)",
                  background:
                    index === 0
                      ? "rgba(35,121,170,0.55)"
                      : "rgba(4,8,14,0.85)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.86)",
                }}
              >
                {brand}
              </div>
            )
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 20px 8px",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1.2 }}>
            ALL ITEMS
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)" }}>
            Showing {cards.length} items
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, padding: "0 12px 12px", flex: 1 }}>
          {cards.map((item) => (
              <div
                key={item.key}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "rgba(24,26,34,0.97)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                <div
                  style={{
                    height: 216,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#f4f5f7",
                  }}
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      width={280}
                      height={216}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{ fontSize: 22, color: "#6b7280" }}>{item.brand ?? "Odd Wheels"}</div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "12px 12px 10px",
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      fontSize: 18,
                      lineHeight: 1.22,
                      fontWeight: 700,
                      minHeight: 44,
                    }}
                  >
                    {truncate(item.title, 54)}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 8,
                    }}
                  >
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#ffcc7d" }}>
                      {formatPeso(item.price)}
                    </div>
                    <div style={{ fontSize: 15, color: "rgba(255,255,255,0.72)" }}>
                      {getConditionLabel(item.condition)}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    {item.qty <= 1 ? (
                      <div
                        style={{
                          borderRadius: 999,
                          border: "1px solid rgba(248,113,113,0.55)",
                          padding: "3px 8px",
                          fontSize: 11,
                          color: "#fecaca",
                        }}
                      >
                        ONLY 1 LEFT
                      </div>
                    ) : null}
                    <div
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(56,189,248,0.5)",
                        background: "rgba(8,77,111,0.45)",
                        padding: "3px 8px",
                        fontSize: 11,
                        color: "#d8f2ff",
                      }}
                    >
                      {getConditionLabel(item.condition)}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "auto",
                      height: 34,
                      borderRadius: 10,
                      background: "#dd7a00",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#130b00",
                      fontSize: 22,
                      fontWeight: 700,
                    }}
                  >
                    Add
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
