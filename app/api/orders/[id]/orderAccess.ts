import { NextResponse } from "next/server";
import { requireUserRequest } from "@/lib/api/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const GUEST_ORDER_ACCESS_TOKEN_KEY = "guest_access_token";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice("Bearer ".length).trim();
}

export type AuthorizedOrderAccess = {
  sb: ReturnType<typeof supabaseAdmin>;
  order: any;
  userId: string | null;
  guestAccessToken: string | null;
  isGuest: boolean;
};

export async function authorizeOrderAccess(
  req: Request,
  orderId: string
): Promise<AuthorizedOrderAccess | { error: NextResponse }> {
  const id = String(orderId ?? "").trim();
  if (!id) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Order id required." },
        { status: 400 }
      ),
    };
  }

  const sb = supabaseAdmin();
  const bearerToken = getBearerToken(req);

  if (bearerToken) {
    const authResult = await requireUserRequest(req);
    if ("error" in authResult) return authResult;

    const { data: order, error: orderError } = await sb
      .from("orders")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (orderError) {
      return {
        error: NextResponse.json(
          { ok: false, error: orderError.message },
          { status: 500 }
        ),
      };
    }

    if (!order || String(order.user_id ?? "") !== authResult.userId) {
      return {
        error: NextResponse.json(
          { ok: false, error: "Order not found." },
          { status: 404 }
        ),
      };
    }

    return {
      sb,
      order,
      userId: authResult.userId,
      guestAccessToken: null,
      isGuest: false,
    };
  }

  const accessToken = String(
    new URL(req.url).searchParams.get("access") ?? ""
  ).trim();

  if (!accessToken) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  const { data: order, error: orderError } = await sb
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (orderError) {
    return {
      error: NextResponse.json(
        { ok: false, error: orderError.message },
        { status: 500 }
      ),
    };
  }

  const shippingDetails =
    order?.shipping_details &&
    typeof order.shipping_details === "object" &&
    !Array.isArray(order.shipping_details)
      ? (order.shipping_details as Record<string, unknown>)
      : null;
  const orderSource = String(shippingDetails?.source ?? "")
    .trim()
    .toLowerCase();
  const storedAccessToken = String(
    shippingDetails?.[GUEST_ORDER_ACCESS_TOKEN_KEY] ?? ""
  ).trim();

  if (
    !order ||
    order.user_id ||
    orderSource !== "facebook_checkout" ||
    !storedAccessToken ||
    storedAccessToken !== accessToken
  ) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Order not found." },
        { status: 404 }
      ),
    };
  }

  return {
    sb,
    order,
    userId: null,
    guestAccessToken: accessToken,
    isGuest: true,
  };
}
