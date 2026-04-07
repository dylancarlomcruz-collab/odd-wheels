import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

type AuthSuccess = {
  sb: ReturnType<typeof supabaseAdmin>;
  user: User;
  userId: string;
};

type AuthFailure = {
  error: NextResponse;
};

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice("Bearer ".length).trim();
}

export async function requireUserRequest(
  req: Request
): Promise<AuthSuccess | AuthFailure> {
  const token = getBearerToken(req);
  if (!token) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  return {
    sb,
    user: data.user,
    userId: data.user.id,
  };
}

export async function requireStaffRequest(
  req: Request
): Promise<(AuthSuccess & { role: string }) | AuthFailure> {
  const authResult = await requireUserRequest(req);
  if ("error" in authResult) return authResult;

  const { sb, userId } = authResult;
  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  const role = String(profile.role ?? "");
  if (role !== "admin" && role !== "cashier") {
    return {
      error: NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  return {
    ...authResult,
    role,
  };
}
