import { NextResponse } from "next/server";
import { requireUserRequest } from "@/lib/api/auth";
import {
  isWebPushConfigured,
  sendAdminCartActivityNotification,
  sendAdminOrderEventNotification,
} from "@/lib/push/server";

export const runtime = "nodejs";

type SupportedAdminEvent = "cart_activity" | "order_created";

const SUPPORTED_EVENTS = new Set<SupportedAdminEvent>([
  "cart_activity",
  "order_created",
]);

function normalizeRole(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(req: Request) {
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Push notifications are not configured on the server." },
      { status: 500 }
    );
  }

  const authResult = await requireUserRequest(req);
  if ("error" in authResult) return authResult.error;

  const payload = await req.json().catch(() => null);
  const event = String(payload?.event ?? "").trim().toLowerCase();
  if (!SUPPORTED_EVENTS.has(event as SupportedAdminEvent)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid admin notification event." },
      { status: 400 }
    );
  }

  const { sb, user, userId } = authResult;
  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = normalizeRole(profile?.role);
  if (role === "admin" || role === "cashier") {
    return NextResponse.json(
      { ok: true, skipped: true, reason: "Staff activity does not trigger admin alerts." },
      { status: 200 }
    );
  }

  if (event === "cart_activity") {
    const variantId = String(payload?.variantId ?? payload?.variant_id ?? "").trim();
    const qty = Math.max(1, Math.trunc(Number(payload?.qty ?? 1) || 1));
    if (!variantId) {
      return NextResponse.json(
        { ok: false, error: "Missing variant id for cart activity." },
        { status: 400 }
      );
    }

    const result = await sendAdminCartActivityNotification({
      userId,
      userEmail: user.email ?? null,
      variantId,
      qty,
    });

    return NextResponse.json(result, { status: 200 });
  }

  const orderId = String(payload?.orderId ?? payload?.order_id ?? "").trim();
  if (!orderId) {
    return NextResponse.json(
      { ok: false, error: "Missing order id for admin order notification." },
      { status: 400 }
    );
  }

  const result = await sendAdminOrderEventNotification(orderId, "order_created");
  return NextResponse.json(result, { status: 200 });
}
