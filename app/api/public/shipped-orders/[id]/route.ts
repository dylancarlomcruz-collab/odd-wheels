import { NextResponse } from "next/server";
import { requireStaffRequest } from "@/lib/api/auth";
import { FEES } from "@/lib/shipping/config";
import {
  formatPublicPackageCode,
  normalizePublicShipmentMethod,
  normalizePublicShipmentStatus,
  parseShipmentJson,
} from "@/lib/publicShippedOrders";

type UpdatePayload = {
  customerName?: string;
  locationLabel?: string;
  shippingMethod?: string;
  packageCode?: string;
  shippingStatus?: string;
  trackingNumber?: string;
  shippedAt?: string;
  scheduledShipAt?: string;
  cop?: boolean;
};

function toIsoOrNull(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const authResult = await requireStaffRequest(req);
  if ("error" in authResult) return authResult.error;
  if (authResult.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const orderId = String(params.id ?? "").trim();
    if (!orderId) {
      return NextResponse.json(
        { ok: false, error: "Missing order id." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => null)) as UpdatePayload | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid request body." },
        { status: 400 },
      );
    }

    const { sb } = authResult;
    const { data: order, error: orderError } = await sb
      .from("orders")
      .select(
        "id,customer_name,shipping_method,shipping_details,shipping_status,tracking_number,shipped_at,completed_at,cop_fee,total",
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { ok: false, error: orderError?.message ?? "Order not found." },
        { status: 404 },
      );
    }

    const shippingMethod = normalizePublicShipmentMethod(body.shippingMethod);
    if (!shippingMethod) {
      return NextResponse.json(
        { ok: false, error: "Only LBC and J&T shipped orders are supported." },
        { status: 400 },
      );
    }

    const shippingStatus = normalizePublicShipmentStatus(body.shippingStatus);
    if (!shippingStatus) {
      return NextResponse.json(
        { ok: false, error: "Shipping status must be Pending shipping or Shipped." },
        { status: 400 },
      );
    }

    const customerName = String(body.customerName ?? "").trim();
    if (!customerName) {
      return NextResponse.json(
        { ok: false, error: "Customer name is required." },
        { status: 400 },
      );
    }

    const locationLabel = String(body.locationLabel ?? "").trim() || "Unknown";
    const trackingNumber = String(body.trackingNumber ?? "").trim();
    const scheduledShipAtIso = toIsoOrNull(body.scheduledShipAt);
    const packageCode = formatPublicPackageCode(shippingMethod, body.packageCode);
    const cop = shippingMethod === "LBC" && Boolean(body.cop);
    const nextCopFee = cop ? FEES.LBC_COP_CONVENIENCE : 0;
    const oldCopFee = Number(order.cop_fee ?? 0);
    const currentTotal = Number(order.total ?? 0);
    const nextTotal =
      (Number.isFinite(currentTotal) ? currentTotal : 0) - oldCopFee + nextCopFee;

    const currentDetails = parseShipmentJson(order.shipping_details);
    const nextDetails: Record<string, unknown> = {
      ...currentDetails,
      method: shippingMethod,
      receiver_name: customerName,
      public_city_label: locationLabel,
      public_location: locationLabel,
      package: packageCode,
      package_size: packageCode,
      package_label: packageCode,
      public_scheduled_ship_at:
        shippingStatus === "PENDING_SHIPPING" ? scheduledShipAtIso : null,
      cop,
    };

    const currentRawStatus = String(order.shipping_status ?? "")
      .trim()
      .toUpperCase()
      .replace(/_/g, " ");
    const wasCompleted =
      currentRawStatus === "COMPLETED" || currentRawStatus === "DELIVERED";
    const shippedAtIso =
      toIsoOrNull(body.shippedAt) ??
      String(order.shipped_at ?? "").trim() ??
      new Date().toISOString();
    const nextShippedAt =
      shippingStatus === "PENDING_SHIPPING"
        ? null
        : shippedAtIso ||
          String(order.shipped_at ?? "").trim() ||
          new Date().toISOString();
    const nextShippingStatus =
      shippingStatus === "PENDING_SHIPPING"
        ? "PREPARING TO SHIP"
        : wasCompleted
          ? "COMPLETED"
          : "SHIPPED";
    const nextCompletedAt =
      shippingStatus === "SHIPPED" && wasCompleted
        ? String(order.completed_at ?? "").trim() || new Date().toISOString()
        : null;

    const { error } = await sb
      .from("orders")
      .update({
        customer_name: customerName,
        shipping_method: shippingMethod,
        shipping_details: nextDetails,
        shipping_status: nextShippingStatus,
        courier: shippingMethod,
        carrier: shippingMethod,
        tracking_number: trackingNumber || null,
        shipped_at: nextShippedAt,
        completed_at: nextCompletedAt,
        cop_fee: nextCopFee,
        total: nextTotal,
      })
      .eq("id", orderId);

    if (error) throw error;

    return NextResponse.json({ ok: true, id: orderId });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Unable to update shipped order." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const authResult = await requireStaffRequest(req);
  if ("error" in authResult) return authResult.error;
  if (authResult.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const orderId = String(params.id ?? "").trim();
    if (!orderId) {
      return NextResponse.json(
        { ok: false, error: "Missing order id." },
        { status: 400 },
      );
    }

    const { sb } = authResult;
    const { data: order, error: orderError } = await sb
      .from("orders")
      .select("id,shipping_details")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { ok: false, error: orderError?.message ?? "Order not found." },
        { status: 404 },
      );
    }

    const currentDetails = parseShipmentJson(order.shipping_details);
    const nextDetails: Record<string, unknown> = {
      ...currentDetails,
      public_board_hidden: true,
      public_board_deleted_at: new Date().toISOString(),
    };

    const { error } = await sb
      .from("orders")
      .update({ shipping_details: nextDetails })
      .eq("id", orderId);
    if (error) throw error;

    return NextResponse.json({ ok: true, id: orderId });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Unable to delete shipped order." },
      { status: 500 },
    );
  }
}
