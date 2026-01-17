import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "payment-qr";

export async function POST(req: Request) {
  try {
    const authResult = await requireStaff(req);
    if ("error" in authResult) return authResult.error;

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const methodRaw = String(form.get("method") ?? "");
    const method = methodRaw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");

    if (!file) {
      return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
    }
    if (!method) {
      return NextResponse.json(
        { ok: false, error: "Missing payment method" },
        { status: 400 }
      );
    }

    const contentType = file.type || "image/png";
    const ext = guessExt(contentType, file.name);
    const filename = `${method}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const sb = authResult.sb;

    await ensureBucket(sb);

    const { error: uploadError } = await sb.storage
      .from(BUCKET)
      .upload(filename, buf, { contentType, upsert: false });

    if (uploadError) {
      return NextResponse.json({ ok: false, error: uploadError.message }, { status: 200 });
    }

    const { data } = sb.storage.from(BUCKET).getPublicUrl(filename);
    return NextResponse.json(
      { ok: true, path: `${BUCKET}/${filename}`, publicUrl: data.publicUrl },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Upload failed",
        hint:
          "Ensure SUPABASE_SERVICE_ROLE_KEY is set and bucket `payment-qr` exists."
      },
      { status: 200 }
    );
  }
}

async function requireStaff(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return {
      error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    return {
      error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    return {
      error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      error: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  const role = String(profile.role ?? "");
  if (role !== "admin" && role !== "cashier") {
    return {
      error: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  return { sb };
}

async function ensureBucket(sb: ReturnType<typeof supabaseAdmin>) {
  const { error } = await sb.storage.createBucket(BUCKET, { public: true });
  if (!error) return;
  const msg = String(error.message ?? "").toLowerCase();
  if (msg.includes("already exists")) return;
  throw error;
}

function guessExt(contentType: string, filename?: string): string {
  const lower = (filename ?? "").toLowerCase();
  if (lower.endsWith(".png") || contentType.includes("png")) return "png";
  if (lower.endsWith(".webp") || contentType.includes("webp")) return "webp";
  return "jpg";
}
