import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const GUEST_ORDER_ACCESS_TOKEN_KEY = "guest_access_token";
const GUEST_ORDER_ACCESS_CREATED_AT_KEY = "guest_access_created_at";

function sanitizeShippingDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const details = { ...(value as Record<string, unknown>) };
  delete details[GUEST_ORDER_ACCESS_TOKEN_KEY];
  delete details[GUEST_ORDER_ACCESS_CREATED_AT_KEY];
  return details;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const orderId = String(id ?? "").trim();
    const accessToken = String(
      new URL(req.url).searchParams.get("access") ?? ""
    ).trim();

    if (!orderId || !accessToken) {
      return NextResponse.json(
        { ok: false, error: "Order access token required." },
        { status: 400 }
      );
    }

    const sb = supabaseAdmin();
    const { data: order, error: orderError } = await sb
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) {
      return NextResponse.json(
        { ok: false, error: "Order not found." },
        { status: 404 }
      );
    }

    const shippingDetails =
      order.shipping_details &&
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
      order.user_id ||
      orderSource !== "facebook_checkout" ||
      !storedAccessToken ||
      storedAccessToken !== accessToken
    ) {
      return NextResponse.json(
        { ok: false, error: "Order not found." },
        { status: 404 }
      );
    }

    const { data: items, error: itemsError } = await sb
      .from("order_items")
      .select(
        "*, product_variant:product_variants(id,barcode,condition,issue_notes,price,qty,product:products(id,title,brand,model,variation,image_urls))"
      )
      .eq("order_id", orderId)
      .order("id", { ascending: true });

    if (itemsError) throw itemsError;

    return NextResponse.json({
      ok: true,
      order: {
        ...order,
        shipping_details: sanitizeShippingDetails(order.shipping_details),
      },
      items: (items as any[]) ?? [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Unable to load order." },
      { status: 500 }
    );
  }
}
