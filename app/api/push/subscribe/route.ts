import { NextResponse } from "next/server";
import { requireUserRequest } from "@/lib/api/auth";
import { isWebPushConfigured } from "@/lib/push/server";

export const runtime = "nodejs";

type PushSubscriptionInput = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

function normalizePushSubscriptionError(error: { code?: string | null; message?: string | null }) {
  const code = String(error?.code ?? "").trim();
  const message = String(error?.message ?? "").trim();
  const raw = `${code} ${message}`.toLowerCase();

  if (code === "PGRST205" || raw.includes("push_subscriptions")) {
    return {
      setupRequired: true,
      error:
        "Push notifications need one database setup step first. Apply the push_subscriptions SQL in Supabase.",
    };
  }

  return {
    setupRequired: false,
    error: message || "Unable to save push subscription.",
  };
}

function normalizePlatform(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "unknown";
  return raw.slice(0, 40);
}

function parseSubscription(input: unknown) {
  const subscription = (input ?? {}) as PushSubscriptionInput;
  const endpoint = String(subscription.endpoint ?? "").trim();
  const p256dh = String(subscription.keys?.p256dh ?? "").trim();
  const auth = String(subscription.keys?.auth ?? "").trim();

  if (!endpoint || !p256dh || !auth) {
    return null;
  }

  return { endpoint, p256dh, auth };
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
  const parsed = parseSubscription(payload?.subscription);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: "Invalid push subscription." },
      { status: 400 }
    );
  }

  const { sb, userId } = authResult;
  const now = new Date().toISOString();
  const { error } = await sb.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: parsed.endpoint,
      p256dh: parsed.p256dh,
      auth: parsed.auth,
      platform: normalizePlatform(payload?.platform),
      user_agent: String(payload?.userAgent ?? "").trim() || null,
      updated_at: now,
      disabled_at: null,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    const normalized = normalizePushSubscriptionError(error);
    return NextResponse.json(
      { ok: false, ...normalized },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function GET(req: Request) {
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Push notifications are not configured on the server." },
      { status: 500 }
    );
  }

  const authResult = await requireUserRequest(req);
  if ("error" in authResult) return authResult.error;

  const endpoint = String(new URL(req.url).searchParams.get("endpoint") ?? "").trim();
  if (!endpoint) {
    return NextResponse.json(
      { ok: false, error: "Missing subscription endpoint." },
      { status: 400 }
    );
  }

  const { sb, userId } = authResult;
  const { data, error } = await sb
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .is("disabled_at", null)
    .maybeSingle();

  if (error) {
    const normalized = normalizePushSubscriptionError(error);
    return NextResponse.json(
      { ok: false, subscribed: false, ...normalized },
      { status: 200 }
    );
  }

  return NextResponse.json(
    { ok: true, subscribed: Boolean(data) },
    { status: 200 }
  );
}

export async function DELETE(req: Request) {
  const authResult = await requireUserRequest(req);
  if ("error" in authResult) return authResult.error;

  const payload = await req.json().catch(() => null);
  const endpoint = String(payload?.endpoint ?? "").trim();
  if (!endpoint) {
    return NextResponse.json(
      { ok: false, error: "Missing subscription endpoint." },
      { status: 400 }
    );
  }

  const { sb, userId } = authResult;
  const { error } = await sb
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);

  if (error) {
    const normalized = normalizePushSubscriptionError(error);
    return NextResponse.json(
      { ok: false, ...normalized },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
