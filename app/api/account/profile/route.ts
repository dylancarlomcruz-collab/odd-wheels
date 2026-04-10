import { NextResponse } from "next/server";
import { requireUserRequest } from "@/lib/api/auth";

export async function GET(req: Request) {
  try {
    const authResult = await requireUserRequest(req);
    if ("error" in authResult) return authResult.error;

    const { sb, userId } = authResult;
    const { data, error } = await sb
      .from("profiles")
      .select(
        "id,role,full_name,username,contact_number,email,shipping_defaults,created_at"
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Failed to load profile." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, profile: (data as any) ?? null },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load profile." },
      { status: 500 }
    );
  }
}
