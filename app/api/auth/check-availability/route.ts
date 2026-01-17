import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sanitizePhone } from "@/lib/phone";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const rawUsername: string | undefined = body?.username;
  const rawContact: string | undefined = body?.contact_number;
  const rawEmail: string | undefined = body?.email;

  const username = (rawUsername ?? "").trim();
  const contactRaw = (rawContact ?? "").trim();
  const email = (rawEmail ?? "").trim().toLowerCase();

  if (!username || !contactRaw || !email) {
    return NextResponse.json(
      { ok: false, error: "Username, phone, and email are required." },
      { status: 400 }
    );
  }

  try {
    const sb = supabaseAdmin();
    const normalizedPhone = sanitizePhone(contactRaw);

    const { data, error } = await sb
      .from("profiles")
      .select("username, contact_number, email")
      .or(
        `username.ilike.${escapeValue(username)},contact_number.eq.${escapeValue(
          normalizedPhone
        )},contact_number.eq.${escapeValue(contactRaw)},email.ilike.${escapeValue(email)}`
      )
      .limit(5);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    const rows = (data as { username: string | null; contact_number: string | null; email: string | null }[]) ?? [];
    const usernameLower = username.toLowerCase();
    const emailLower = email.toLowerCase();

    const usernameTaken = rows.some(
      (row) => (row.username ?? "").toLowerCase() === usernameLower
    );
    const phoneTaken = rows.some(
      (row) =>
        row.contact_number === normalizedPhone ||
        row.contact_number === contactRaw
    );
    const emailTaken = rows.some(
      (row) => (row.email ?? "").toLowerCase() === emailLower
    );

    return NextResponse.json(
      { ok: true, usernameTaken, phoneTaken, emailTaken },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to check availability.",
        hint: "Set SUPABASE_SERVICE_ROLE_KEY in .env.local to enable checks."
      },
      { status: 200 }
    );
  }
}

function escapeValue(v: string) {
  const safe = v.replace(/"/g, "");
  return `"${safe}"`;
}
