import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sanitizePhone } from "@/lib/phone";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const identifierRaw: string | undefined = body?.identifier;
  const identifier = (identifierRaw ?? "").trim();

  if (!identifier) {
    return NextResponse.json({ ok: false, error: "Missing identifier" }, { status: 400 });
  }

  // If it's already an email, just return it.
  if (identifier.includes("@")) {
    return NextResponse.json({ ok: true, email: identifier.toLowerCase() }, { status: 200 });
  }

  try {
    const sb = supabaseAdmin();
    const normalizedPhone = sanitizePhone(identifier);

    // Look up email by username OR contact number
    const { data, error } = await sb
      .from("profiles")
      .select("email")
      .or(
        `username.ilike.${escapeValue(identifier)},contact_number.eq.${escapeValue(
          identifier
        )},contact_number.eq.${escapeValue(normalizedPhone)}`
      )
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    const email = (data as any)?.email as string | undefined;
    if (!email) {
      return NextResponse.json({ ok: false, error: "No account found for that username/phone." }, { status: 200 });
    }

    return NextResponse.json({ ok: true, email }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to resolve email.",
        hint: "Set SUPABASE_SERVICE_ROLE_KEY in .env.local to enable username/phone login."
      },
      { status: 200 }
    );
  }
}

function escapeValue(v: string) {
  // PostgREST filters are URL-ish strings; keep it conservative.
  // We'll wrap in quotes when needed.
  const safe = v.replace(/"/g, "");
  return `"${safe}"`;
}
