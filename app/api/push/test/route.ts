import { NextResponse } from "next/server";
import { requireUserRequest } from "@/lib/api/auth";
import { isWebPushConfigured, sendPushToUser } from "@/lib/push/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Push notifications are not configured on the server." },
      { status: 500 }
    );
  }

  const authResult = await requireUserRequest(req);
  if ("error" in authResult) return authResult.error;

  const { sb, userId } = authResult;
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const isAdmin = String(profile?.role ?? "").trim().toLowerCase() === "admin";

  const result = await sendPushToUser(userId, {
    title: isAdmin ? "Odd Wheels admin alerts are on" : "Odd Wheels notifications are on",
    body: isAdmin
      ? "You will now receive cart, order, and purchase alerts on this device."
      : "You will now receive order updates on this device.",
    url: isAdmin ? "/admin/orders" : "/orders",
    tag: `push-test-${userId}`,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ...result,
        ok: false,
        error: result.error ?? "No active subscription found for this account.",
      },
      { status: 200 }
    );
  }

  return NextResponse.json(result, { status: 200 });
}
