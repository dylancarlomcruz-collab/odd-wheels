import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  sendAdminOrderEventNotification,
  sendOrderEventNotification,
} from "@/lib/push/server";

function normalizeShippingDetails(raw: unknown) {
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { text: trimmed };
    }
    return { text: trimmed };
  }

  return {};
}

export async function POST(req: Request) {
  try {
    const authResult = await requireStaff(req);
    if ("error" in authResult) return authResult.error;

    const payload = await req.json().catch(() => null);
    const orderId: string | undefined = payload?.orderId ?? payload?.order_id;
    const forceToShip = payload?.markToShip === true;
    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    }

    const sb = authResult.sb;
    let { data: order, error: orderError } = await sb
      .from("orders")
      .select(
        "id,user_id,payment_status,inventory_deducted,customer_name,shipping_method,shipping_details,channel"
      )
      .eq("id", orderId)
      .maybeSingle();

    const needsFallback =
      orderError && String(orderError.message ?? "").includes("inventory_deducted");
    if (needsFallback) {
      const fallback = await sb
        .from("orders")
        .select("id,payment_status,customer_name,shipping_method,shipping_details,channel")
        .eq("id", orderId)
        .maybeSingle();
      order = fallback.data
        ? {
            ...fallback.data,
            inventory_deducted: false,
            user_id: null,
          }
        : null;
      orderError = fallback.error;
    }

    if (orderError || !order) {
      return NextResponse.json(
        { ok: false, error: orderError?.message ?? "Order not found" },
        { status: 404 }
      );
    }

    const paymentStatus = String(order.payment_status ?? "").toUpperCase();
    const inventoryDeducted = Boolean(order.inventory_deducted);
    const hasUserId = Boolean(order.user_id);
    const shippingDetails = normalizeShippingDetails(order.shipping_details);
    const shippingText = String(shippingDetails?.text ?? "").toLowerCase();
    const shippingSource = String(shippingDetails?.source ?? "").toLowerCase();
    const customerName = String(order.customer_name ?? "").toLowerCase();
    const shippingMethod = String(order.shipping_method ?? "").toUpperCase();
    const channel = String(order.channel ?? "").toUpperCase();
    const isPosOrder = channel === "POS";
    const isAdminCartCheckout =
      shippingDetails?.admin_cart_checkout === true ||
      shippingSource === "admin_cart_checkout" ||
      shippingText.includes("fb checkout from admin cart");
    const autoOddWheelsToShip =
      customerName.includes("odd wheels") ||
      shippingText.includes("auto-sold from inventory editor") ||
      (shippingMethod === "PICKUP" && channel === "POS" && customerName.includes("odd"));
    const markToShip = forceToShip || autoOddWheelsToShip;

    if (paymentStatus !== "PAID") {
      if (isPosOrder || isAdminCartCheckout || inventoryDeducted || !hasUserId) {
        const { error: updateError } = await sb
          .from("orders")
          .update({
            payment_status: "PAID",
            status: "PAID",
            paid_at: new Date().toISOString(),
          })
          .eq("id", orderId);

        if (updateError) {
          return NextResponse.json({ ok: false, error: updateError.message }, { status: 200 });
        }
      } else {
        const { error: rpcError } = await sb.rpc("fn_process_paid_order", {
          p_order_id: orderId,
        });

        if (rpcError) {
          return NextResponse.json({ ok: false, error: rpcError.message }, { status: 200 });
        }
      }
    }

    const { error: completeError } = await sb
      .from("orders")
      .update(
        markToShip
          ? {
              shipping_status: "PREPARING TO SHIP",
              shipped_at: null,
              completed_at: null,
              tracking_number: null,
              courier: null,
            }
          : {
              shipping_status: "COMPLETED",
              completed_at: new Date().toISOString(),
            }
      )
      .eq("id", orderId);

    if (completeError) {
      return NextResponse.json({ ok: false, error: completeError.message }, { status: 200 });
    }

    await sendOrderEventNotification(
      orderId,
      markToShip ? "status_updated" : "completed"
    ).catch(() => undefined);
    if (paymentStatus !== "PAID") {
      await sendAdminOrderEventNotification(orderId, "purchase_paid").catch(
        () => undefined
      );
    }

    return NextResponse.json({ ok: true, orderId }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "POS completion failed" },
      { status: 200 }
    );
  }
}

async function requireStaff(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return {
      error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    return {
      error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    return {
      error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      error: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  const role = String(profile.role ?? "");
  if (role !== "admin" && role !== "cashier") {
    return {
      error: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  return { sb };
}
