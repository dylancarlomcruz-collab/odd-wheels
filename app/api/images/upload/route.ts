import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const productId = String(form.get("productId") ?? "misc");

    if (!file) {
      return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
    }

    const contentType = file.type || "image/jpeg";
    const ext = guessExt(contentType, file.name);
    const filename = `${productId}/${crypto.randomBytes(8).toString("hex")}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const sb = supabaseAdmin();

    const { error: uploadError } = await sb.storage
      .from("product-images")
      .upload(filename, buf, { contentType, upsert: false });

    if (uploadError) {
      return NextResponse.json({ ok: false, error: uploadError.message }, { status: 200 });
    }

    const { data } = sb.storage.from("product-images").getPublicUrl(filename);
    return NextResponse.json({ ok: true, path: filename, publicUrl: data.publicUrl }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Upload failed",
        hint: "Ensure SUPABASE_SERVICE_ROLE_KEY is set and bucket `product-images` exists."
      },
      { status: 200 }
    );
  }
}

function guessExt(contentType: string, filename?: string): string {
  const lower = (filename ?? "").toLowerCase();
  if (lower.endsWith(".png") || contentType.includes("png")) return "png";
  if (lower.endsWith(".webp") || contentType.includes("webp")) return "webp";
  return "jpg";
}
