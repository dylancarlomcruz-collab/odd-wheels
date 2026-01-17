import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const imageUrl: string | undefined = body?.imageUrl;
  const productId: string | undefined = body?.productId;

  if (!imageUrl || !productId) {
    return NextResponse.json({ ok: false, error: "Missing imageUrl or productId" }, { status: 400 });
  }

  try {
    const supabase = supabaseAdmin();

    const r = await fetch(imageUrl, { cache: "no-store" });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: `Failed to fetch image (${r.status})` }, { status: 200 });
    }

    const contentType = r.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());
    const ext = guessExt(contentType);
    const filename = `${productId}/${crypto.randomBytes(8).toString("hex")}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(filename, buf, { contentType, upsert: false });

    if (uploadError) {
      return NextResponse.json({ ok: false, error: uploadError.message }, { status: 200 });
    }

    const { data } = supabase.storage.from("product-images").getPublicUrl(filename);

    return NextResponse.json({ ok: true, path: filename, publicUrl: data.publicUrl }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message ?? "Unknown error",
      hint: "Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, and bucket `product-images` exists."
    }, { status: 200 });
  }
}

function guessExt(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}
