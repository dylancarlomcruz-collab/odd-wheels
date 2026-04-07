import webpush from "web-push";
import { envOrEmpty } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

type StoredPushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type OrderEventKind = "paid" | "shipped" | "completed" | "status_updated";

export type PushNotificationPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
};

let vapidConfigured = false;

function getPushSubject() {
  const explicit = envOrEmpty("WEB_PUSH_SUBJECT").trim();
  if (explicit) return explicit;

  const siteUrl = envOrEmpty("NEXT_PUBLIC_SITE_URL").trim();
  try {
    const site = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`);
    return `mailto:support@${site.hostname.replace(/^www\./, "")}`;
  } catch {
    return "mailto:support@odd-wheels.com";
  }
}

export function isWebPushConfigured() {
  return Boolean(
    envOrEmpty("NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY").trim() &&
      envOrEmpty("WEB_PUSH_PRIVATE_KEY").trim()
  );
}

function ensureWebPushConfigured() {
  if (vapidConfigured || !isWebPushConfigured()) return;
  webpush.setVapidDetails(
    getPushSubject(),
    envOrEmpty("NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY").trim(),
    envOrEmpty("WEB_PUSH_PRIVATE_KEY").trim()
  );
  vapidConfigured = true;
}

function toWebPushSubscription(row: StoredPushSubscriptionRow) {
  return {
    endpoint: row.endpoint,
    expirationTime: null,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

function serializeNotificationPayload(payload: PushNotificationPayload) {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    tag: payload.tag ?? undefined,
    requireInteraction: payload.requireInteraction === true,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  });
}

async function disableExpiredSubscriptions(ids: string[]) {
  if (!ids.length) return;
  const sb = supabaseAdmin();
  await sb
    .from("push_subscriptions")
    .update({
      disabled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
}

async function markUsedSubscriptions(ids: string[]) {
  if (!ids.length) return;
  const now = new Date().toISOString();
  const sb = supabaseAdmin();
  await sb
    .from("push_subscriptions")
    .update({
      last_used_at: now,
      updated_at: now,
      disabled_at: null,
    })
    .in("id", ids);
}

export async function sendPushToUser(
  userId: string,
  payload: PushNotificationPayload
) {
  if (!userId || !isWebPushConfigured()) {
    return { ok: false, sent: 0, failed: 0, expired: 0 };
  }

  ensureWebPushConfigured();

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", userId)
    .is("disabled_at", null);

  if (error || !data?.length) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      expired: 0,
      error: error?.message ?? "No active push subscriptions.",
    };
  }

  const message = serializeNotificationPayload(payload);
  const results = await Promise.all(
    data.map(async (row) => {
      try {
        await webpush.sendNotification(toWebPushSubscription(row), message, {
          TTL: 60 * 60,
        });
        return { id: row.id, sent: true, expired: false };
      } catch (error: any) {
        const statusCode = Number(error?.statusCode ?? 0);
        return {
          id: row.id,
          sent: false,
          expired: statusCode === 404 || statusCode === 410,
        };
      }
    })
  );

  const sentIds = results.filter((entry) => entry.sent).map((entry) => entry.id);
  const expiredIds = results
    .filter((entry) => entry.expired)
    .map((entry) => entry.id);

  await Promise.all([
    markUsedSubscriptions(sentIds),
    disableExpiredSubscriptions(expiredIds),
  ]);

  return {
    ok: sentIds.length > 0,
    sent: sentIds.length,
    failed: results.filter((entry) => !entry.sent && !entry.expired).length,
    expired: expiredIds.length,
  };
}

function compactOrderId(orderId: string) {
  return String(orderId ?? "").slice(0, 8).toUpperCase();
}

function buildOrderPayload(order: any, event: OrderEventKind): PushNotificationPayload {
  const orderId = String(order.id ?? "");
  const shortId = compactOrderId(orderId);
  const shippingStatus = String(order.shipping_status ?? "").trim().toUpperCase();
  const tracking = String(order.tracking_number ?? "").trim();
  const courier = String(order.courier ?? "").trim();

  if (event === "paid") {
    return {
      title: "Payment confirmed",
      body: `Order #${shortId} has been confirmed and is now being prepared.`,
      url: `/orders/${orderId}`,
      tag: `order-${orderId}-paid`,
    };
  }

  if (event === "shipped") {
    const trackingText =
      tracking && courier
        ? `${courier}: ${tracking}`
        : tracking
          ? `Tracking: ${tracking}`
          : courier
            ? `Courier: ${courier}`
            : "Check the latest delivery status in your orders.";
    return {
      title: "Order shipped",
      body: `Order #${shortId} is on the way. ${trackingText}`,
      url: `/orders/${orderId}`,
      tag: `order-${orderId}-shipped`,
      requireInteraction: Boolean(tracking),
    };
  }

  if (event === "completed") {
    return {
      title: "Order completed",
      body: `Order #${shortId} has been marked completed.`,
      url: `/orders/${orderId}`,
      tag: `order-${orderId}-completed`,
    };
  }

  return {
    title: "Order updated",
    body: `Order #${shortId} was updated to ${shippingStatus || "a new status"}.`,
    url: `/orders/${orderId}`,
    tag: `order-${orderId}-status`,
  };
}

export async function sendOrderEventNotification(
  orderId: string,
  event: OrderEventKind
) {
  if (!orderId || !isWebPushConfigured()) {
    return { ok: false, sent: 0, failed: 0, expired: 0 };
  }

  const sb = supabaseAdmin();
  const { data: order, error } = await sb
    .from("orders")
    .select("id,user_id,shipping_status,tracking_number,courier")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order?.user_id) {
    return {
      ok: false,
      sent: 0,
      failed: 0,
      expired: 0,
      error: error?.message ?? "Order has no user to notify.",
    };
  }

  return sendPushToUser(order.user_id, buildOrderPayload(order, event));
}
