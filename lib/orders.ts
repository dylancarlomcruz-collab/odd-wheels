"use client";

import { supabase } from "@/lib/supabase/browser";
import type { CartLine } from "@/hooks/useCart";

export type CreateOrderInput = {
  userId: string;
  payment_method: string;
  shipping_method: "LBC" | "JNT" | "LALAMOVE" | "PICKUP";
  shipping_region: string | null;
  shipping_details: any;
  fees: {
    shipping_fee: number;
    cop_fee: number;
    lalamove_fee: number;
    priority_fee: number;
    insurance_fee: number;
  };
  priority_requested: boolean; // UI only
  insurance_selected: boolean;
  insurance_fee_user: number;
};

function pickStr(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function normalizeCustomerName(sd: any) {
  const receiver = pickStr(sd?.receiver_name);
  if (receiver) return receiver;

  const first = pickStr(sd?.first_name);
  const last = pickStr(sd?.last_name);
  const full = [first, last].filter(Boolean).join(" ").trim();
  return full || "WEB CUSTOMER";
}

function normalizeContact(sd: any) {
  return pickStr(
    sd?.receiver_phone ?? sd?.phone ?? sd?.contact ?? sd?.customer_phone
  );
}

function normalizeAddress(sd: any) {
  const full = pickStr(sd?.full_address);
  if (full) return full;

  const brgy = pickStr(sd?.brgy);
  const line = pickStr(sd?.address_line);
  if (line && brgy) return `${line}, Brgy ${brgy}`;
  if (line) return line;

  const drop = pickStr(sd?.dropoff_address);
  if (drop) return drop;

  const pickup = pickStr(sd?.pickup_location);
  if (pickup) return pickup;

  try {
    const txt = JSON.stringify(sd ?? {});
    return txt.length ? txt : null;
  } catch {
    return null;
  }
}

function carrierFromShippingMethod(m: CreateOrderInput["shipping_method"]) {
  if (m === "JNT") return "JNT";
  if (m === "LBC") return "LBC";
  if (m === "LALAMOVE") return "LALAMOVE";
  if (m === "PICKUP") return "PICKUP";
  return "OTHER";
}

export async function createOrderFromCart(
  input: CreateOrderInput,
  cartLines: CartLine[]
) {
  const subtotal = cartLines.reduce(
    (acc, l) => acc + Number(l.variant.price) * l.qty,
    0
  );

  const total =
    subtotal +
    Number(input.fees.shipping_fee ?? 0) +
    Number(input.fees.cop_fee ?? 0) +
    Number(input.fees.lalamove_fee ?? 0) +
    Number(input.fees.priority_fee ?? 0) +
    Number(input.fees.insurance_fee ?? 0);

  const sd = input.shipping_details ?? {};

  const insertRow: any = {
    user_id: input.userId,
    customer_id: null,

    customer_name: normalizeCustomerName(sd),
    contact: normalizeContact(sd),
    customer_phone: normalizeContact(sd),
    address: normalizeAddress(sd),

    shipping_method: input.shipping_method,
    shipping_region: input.shipping_region,
    shipping_details: sd,

    payment_method: input.payment_method,
    payment_status: "UNPAID",

    status: "PENDING_APPROVAL",
    order_status: "PENDING_STAFF_APPROVAL",
    fulfillment_status: "PENDING",

    carrier: carrierFromShippingMethod(input.shipping_method),
    tracking_number: null,

    channel: "WEB",

    subtotal,
    shipping_fee: Number(input.fees.shipping_fee ?? 0),
    discount: 0,
    total,

    cop_fee: Number(input.fees.cop_fee ?? 0),
    lalamove_fee: Number(input.fees.lalamove_fee ?? 0),
    priority_fee: Number(input.fees.priority_fee ?? 0),
    priority_approved: false,

    insurance_selected: Boolean(input.insurance_selected),
    insurance_fee: Number(input.fees.insurance_fee ?? 0),

    payment_hold: false,
    inventory_deducted: false,
  };

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert(insertRow)
    .select("*")
    .single();

  if (orderError) throw orderError;

  // ✅ Insert order items with schema fallbacks
  const itemsV2 = cartLines.map((l) => ({
    order_id: order.id,
    item_id: l.variant.id,
    item_name: l.variant.product.title,
    variant_id: l.variant.id,
    price_each: Number(l.variant.price),
    qty: l.qty,
    line_total: Number(l.variant.price) * l.qty,
    condition: l.variant.condition,
    issue_notes: l.variant.issue_notes,
  }));

  const itemsV1 = cartLines.map((l) => ({
    order_id: order.id,
    variant_id: l.variant.id,
    unit_price: Number(l.variant.price),
    qty: l.qty,
    line_total: Number(l.variant.price) * l.qty,
    condition: l.variant.condition,
    issue_notes: l.variant.issue_notes,
  }));

  const itemsLegacy = cartLines.map((l) => ({
    order_id: order.id,
    product_id: l.variant.product.id,
    product_title: l.variant.product.title,
    variant_id: l.variant.id,
    unit_price: Number(l.variant.price),
    qty: l.qty,
    line_total: Number(l.variant.price) * l.qty,
    condition: l.variant.condition,
    issue_notes: l.variant.issue_notes,
  }));

  let itemsError: any = null;
  {
    const r = await supabase.from("order_items").insert(itemsV2);
    itemsError = r.error;
  }
  if (itemsError) {
    const r = await supabase.from("order_items").insert(itemsV1);
    itemsError = r.error;
  }
  if (itemsError) {
    const r = await supabase.from("order_items").insert(itemsLegacy);
    if (r.error) throw r.error;
  }
  const lineIds = cartLines.map((line) => line.id).filter(Boolean);
  if (lineIds.length) {
    const { error: clearError } = await supabase
      .from("cart_items")
      .delete()
      .eq("user_id", input.userId)
      .in("id", lineIds);

    if (clearError) throw clearError;
  }

  return order as any;
}
