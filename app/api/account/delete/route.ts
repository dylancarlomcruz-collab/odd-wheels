import { NextResponse } from "next/server";
import { requireUserRequest } from "@/lib/api/auth";

export async function POST(req: Request) {
  const authResult = await requireUserRequest(req);
  if ("error" in authResult) return authResult.error;

  const { sb, userId } = authResult;

  const { count: orderCount, error: orderError } = await sb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (orderError) {
    return NextResponse.json(
      { ok: false, error: orderError.message || "Failed to check order history." },
      { status: 500 }
    );
  }

  if ((orderCount ?? 0) > 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Accounts with order history cannot be deleted automatically yet. Contact Odd Wheels if you need this account removed.",
      },
      { status: 409 }
    );
  }

  const { error } = await sb.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to delete account." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
