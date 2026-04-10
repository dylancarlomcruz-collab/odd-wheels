import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("product_variants")
      .select(
        "id,created_at,condition,barcode,issue_notes,issue_photo_urls,public_notes,ship_class,price,sale_price,discount_percent,qty, product:products(*)"
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
      return qty > 0 && row?.product?.is_active !== false;
    });

    return NextResponse.json(
      { ok: true, rows },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
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
