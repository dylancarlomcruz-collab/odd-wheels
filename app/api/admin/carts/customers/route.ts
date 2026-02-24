import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type CustomerDetail = {
  id: string;
  name: string;
  username: string;
  email: string;
  contact: string;
};

export async function POST(req: Request) {
  try {
    const authResult = await requireStaff(req);
    if ("error" in authResult) return authResult.error;

    const body = await req.json().catch(() => null);
    const rawIds = Array.isArray(body?.userIds) ? body.userIds : [];
    const userIds: string[] = rawIds
      .map((value: unknown) => String(value ?? "").trim())
      .filter((value: string) => value.length > 0);

    if (!userIds.length) {
      return NextResponse.json({ ok: true, rows: [] as CustomerDetail[] }, { status: 200 });
    }

    const limitedIds: string[] = Array.from(new Set<string>(userIds)).slice(0, 5000);
    const sb = authResult.sb;

    const [profilesRes, customersRes] = await Promise.all([
      sb
        .from("profiles")
        .select("id,full_name,username,email,contact_number")
        .in("id", limitedIds),
      sb.from("customers").select("id,name,username,contact").in("id", limitedIds),
    ]);

    if (profilesRes.error) {
      return NextResponse.json(
        { ok: false, error: profilesRes.error.message },
        { status: 200 }
      );
    }
    if (customersRes.error) {
      return NextResponse.json(
        { ok: false, error: customersRes.error.message },
        { status: 200 }
      );
    }

    const profileRows = (profilesRes.data ?? []) as Array<{
      id: string;
      full_name: string | null;
      username: string | null;
      email: string | null;
      contact_number: string | null;
    }>;
    const customerRows = (customersRes.data ?? []) as Array<{
      id: string;
      name: string | null;
      username: string | null;
      contact: string | null;
    }>;

    const customerMap = new Map<string, (typeof customerRows)[number]>();
    customerRows.forEach((row) => {
      if (!row?.id) return;
      customerMap.set(String(row.id), row);
    });

    const rows: CustomerDetail[] = limitedIds.map((id) => {
      const profile = profileRows.find((row) => String(row.id) === id);
      const customer = customerMap.get(id);
      const name = String(customer?.name ?? profile?.full_name ?? "").trim();
      const username = String(customer?.username ?? profile?.username ?? "").trim();
      const email = String(profile?.email ?? "").trim().toLowerCase();
      const contact = String(customer?.contact ?? profile?.contact_number ?? "").trim();

      return { id, name, username, email, contact };
    });

    return NextResponse.json({ ok: true, rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load customer details." },
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
