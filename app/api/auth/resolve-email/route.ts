import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { arePhonesEquivalent, buildPhoneLookupVariants } from "@/lib/phone";

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
    const phoneVariants = buildPhoneLookupVariants(identifier);
    const filters = [
      `username.ilike.${escapeValue(identifier)}`,
      ...phoneVariants.map((value) => `contact_number.eq.${escapeValue(value)}`),
    ].join(",");

    const { data, error } = await sb
      .from("profiles")
      .select("email, username, contact_number")
      .or(filters)
      .limit(Math.max(5, phoneVariants.length + 1));

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    const rows =
      (data as
        | { email: string | null; username: string | null; contact_number: string | null }[]
        | null) ?? [];
    const identifierLower = identifier.toLowerCase();
    const match = rows.find(
      (row) =>
        (row.username ?? "").toLowerCase() === identifierLower ||
        arePhonesEquivalent(row.contact_number ?? "", identifier)
    );
    const email = match?.email ?? undefined;
    if (!email) {
      return NextResponse.json({ ok: false, error: "No account found for that identifier." }, { status: 200 });
    }

    return NextResponse.json({ ok: true, email }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to resolve email.",
        hint: "Set SUPABASE_SERVICE_ROLE_KEY in .env.local to enable identifier lookup."
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
