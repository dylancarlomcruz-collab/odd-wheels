import { NextResponse } from "next/server";
import { requireUserRequest } from "@/lib/api/auth";

export async function GET(req: Request) {
  try {
    const authResult = await requireUserRequest(req);
    if ("error" in authResult) return authResult.error;

    const { sb, userId } = authResult;
    const { count, error } = await sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("status", "in", "(CANCELLED,VOIDED)");

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Failed to count orders." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, count: Number(count ?? 0) },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to count orders." },
      { status: 500 }
    );
  }
}
