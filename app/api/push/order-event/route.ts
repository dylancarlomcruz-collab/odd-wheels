import { NextResponse } from "next/server";
import { requireStaffRequest } from "@/lib/api/auth";
import {
  isWebPushConfigured,
  sendOrderEventNotification,
} from "@/lib/push/server";

export const runtime = "nodejs";

const ALLOWED_EVENTS = new Set([
  "paid",
  "shipped",
  "completed",
  "status_updated",
] as const);

export async function POST(req: Request) {
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Push notifications are not configured on the server." },
      { status: 500 }
    );
  }

  const authResult = await requireStaffRequest(req);
  if ("error" in authResult) return authResult.error;

  const payload = await req.json().catch(() => null);
  const orderId = String(payload?.orderId ?? payload?.order_id ?? "").trim();
  const event = String(payload?.event ?? "").trim().toLowerCase();

  if (!orderId || !ALLOWED_EVENTS.has(event as any)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid order notification event." },
      { status: 400 }
    );
  }

  const result = await sendOrderEventNotification(
    orderId,
    event as "paid" | "shipped" | "completed" | "status_updated"
  );

  return NextResponse.json(result, { status: 200 });
}
