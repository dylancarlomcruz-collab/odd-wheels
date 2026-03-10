import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type CustomerDetail = {
  id: string;
  name: string;
  username: string;
  email: string;
  contact: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeString(value: unknown) {
  return String(value ?? "").trim();
}

function coalesceName(
  customer: { name?: string | null; username?: string | null; contact?: string | null } | null,
  profile: {
    full_name?: string | null;
    username?: string | null;
    email?: string | null;
    contact_number?: string | null;
  } | null
) {
  return {
    name: safeString(customer?.name ?? profile?.full_name ?? ""),
    username: safeString(customer?.username ?? profile?.username ?? ""),
    email: safeString(profile?.email ?? "").toLowerCase(),
    contact: safeString(customer?.contact ?? profile?.contact_number ?? ""),
  };
}

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
    const uuidIds = limitedIds.filter((id) => UUID_RE.test(id));

    const [profilesRes, customersRes] = await Promise.all([
      uuidIds.length
        ? sb
            .from("profiles")
            .select("id,full_name,username,email,contact_number")
            .in("id", uuidIds)
        : Promise.resolve({ data: [], error: null }),
      uuidIds.length
        ? sb.from("customers").select("id,name,username,contact").in("id", uuidIds)
        : Promise.resolve({ data: [], error: null }),
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

    const profileMap = new Map<string, (typeof profileRows)[number]>();
    profileRows.forEach((row) => {
      const id = safeString(row?.id);
      if (!id) return;
      profileMap.set(id, row);
    });

    const rows: CustomerDetail[] = limitedIds.map((id) => {
      const profile = profileMap.get(id) ?? null;
      const customer = customerMap.get(id) ?? null;
      const normalized = coalesceName(customer, profile);
      return { id, ...normalized };
    });

    const unresolved = rows.filter((row) => !row.name && !row.username && UUID_RE.test(row.id));
    if (unresolved.length) {
      await Promise.all(
        unresolved.map(async (row) => {
          const { data, error } = await sb.auth.admin.getUserById(row.id);
          if (error || !data?.user) return;
          const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
          const fullName = safeString(
            meta.full_name ?? meta.display_name ?? meta.name ?? meta.username
          );
          const username = safeString(meta.username);
          const email = safeString(data.user.email ?? "").toLowerCase();
          const contact = safeString(meta.contact_number);

          if (!row.name && fullName) row.name = fullName;
          if (!row.username && username) row.username = username;
          if (!row.email && email) row.email = email;
          if (!row.contact && contact) row.contact = contact;
        })
      );
    }

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
