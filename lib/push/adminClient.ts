"use client";

import { supabase } from "@/lib/supabase/browser";

type AdminPushClientEvent =
  | {
      event: "cart_activity";
      variantId: string;
      qty: number;
    }
  | {
      event: "order_created";
      orderId: string;
    };

export async function notifyAdminPushEvent(event: AdminPushClientEvent) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  if (!token) {
    return { ok: false, skipped: true, error: "No authenticated session." };
  }

  const response = await fetch("/api/push/admin-event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(event),
  });

  return response.json().catch(() => ({
    ok: response.ok,
    error: "Unable to parse admin push response.",
  }));
}
