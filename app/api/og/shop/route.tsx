import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ProductPreview = {
  id: string;
  title: string;
  brand: string | null;
  image: string | null;
};

type VariantRow = {
  qty: number | null;
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

async function getPreviewItems(): Promise<ProductPreview[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anon) return [];

  const supabase = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("product_variants")
    .select("qty, product:products(id,title,brand,image_urls,is_active)")
    .gt("qty", 0)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error || !data) return [];

  const rows = data as unknown as VariantRow[];
  const unique = new Map<string, ProductPreview>();
  for (const row of rows) {
    const p = pickProduct(row.product);
    if (!p || p.is_active === false) continue;
    if (unique.has(p.id)) continue;

    const first = Array.isArray(p.image_urls) ? p.image_urls.find(Boolean) : null;
    unique.set(p.id, {
      id: p.id,
      title: p.title,
      brand: p.brand,
      image: normalizeImageUrl(first, url),
    });
    if (unique.size >= 3) break;
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

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(160deg, #070b12 0%, #111827 45%, #0b1220 100%)",
          color: "#f8fafc",
          padding: "40px 44px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 62, fontWeight: 800, letterSpacing: -1 }}>
            Odd Wheels PH
          </div>
          <div style={{ fontSize: 28, color: "#94a3b8" }}>
            New and trending items in the shop
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, marginTop: 28, flex: 1 }}>
          {(items.length ? items : [{ id: "empty", title: "Shop now", brand: "odd-wheels.com", image: null }]).map(
            (item) => (
              <div
                key={item.id}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: 20,
                  overflow: "hidden",
                  background: "rgba(15, 23, 42, 0.92)",
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                }}
              >
                <div
                  style={{
                    height: 300,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(2, 6, 23, 0.8)",
                  }}
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      width={360}
                      height={300}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{ fontSize: 26, color: "#64748b" }}>Odd Wheels</div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", padding: "16px 18px" }}>
                  <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
                    {truncate(item.title, 42)}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 20, color: "#93c5fd" }}>
                    {item.brand || "Featured"}
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "#94a3b8",
            marginTop: 20,
          }}
        >
          <div>odd-wheels.com</div>
          <div>View Shop</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
