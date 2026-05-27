import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logServerPayloadDiagnostics } from "@/lib/egressDiagnostics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("product_variants")
      .select(
        "id,created_at,release_at,condition,barcode,issue_notes,issue_photo_urls,public_notes,ship_class,price,sale_price,discount_percent,qty,product:products(id,title,brand,model,variation,special_tags,image_urls,is_active,created_at)"
      )
      .gt("qty", 0)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Failed to load shop products." },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }

    const rows = ((data as any[]) ?? []).filter((row) => {
      const qty = Number(row?.qty ?? 0);
      const releaseAt = String(row?.release_at ?? "").trim();
      const releaseTs = releaseAt ? Date.parse(releaseAt) : Number.NaN;
      const isReleased =
        !releaseAt || (Number.isFinite(releaseTs) && releaseTs <= Date.now());
      return qty > 0 && isReleased && row?.product?.is_active !== false;
    });

    const imageUrls = rows.flatMap((row) =>
      Array.isArray(row?.product?.image_urls) ? row.product.image_urls : []
    );
    logServerPayloadDiagnostics(
      "/api/shop/products",
      { ok: true, rows },
      {
        rowCount: rows.length,
        uniqueProducts: new Set(
          rows.map((row) => String(row?.product?.id ?? "")).filter(Boolean)
        ).size,
        imageUrlCount: imageUrls.length,
      }
    );

    return NextResponse.json(
      { ok: true, rows },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to load shop products.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
}
