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

  const result = await sendPushToUser(authResult.userId, {
    title: "Odd Wheels notifications are on",
    body: "You will now receive order updates on this device.",
    url: "/orders",
    tag: `push-test-${authResult.userId}`,
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
