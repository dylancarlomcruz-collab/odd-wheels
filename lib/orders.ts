"use client";

import type { CartLine } from "@/hooks/useCart";
import { fetchAuthedJson, fetchJson } from "@/lib/api/client";

export type CreateOrderInput = {
  payment_method: string;
  shipping_method: "LBC" | "JNT" | "LALAMOVE" | "PICKUP" | "INTERNATIONAL";
  shipping_region: string | null;
  shipping_details: any;
  channel?: string;
  create_as_pending_approval?: boolean;
  voucher_id?: string | null;
  shipping_discount?: number;
  discount_total?: number;
  fees: {
    shipping_fee: number;
    cop_fee: number;
    lalamove_fee: number;
    priority_fee: number;
    insurance_fee: number;
  };
  priority_requested: boolean;
  insurance_selected: boolean;
  insurance_fee_user: number;
};

type CreateOrderOptions = {
  guest?: boolean;
};

type OrderLinkOptions = {
  accessToken?: string | null;
};

function withAccessToken(path: string, options: OrderLinkOptions = {}) {
  const token = String(options.accessToken ?? "").trim();
  if (!token) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}access=${encodeURIComponent(token)}`;
}

export function buildOrderDetailHref(
  orderId: string,
  options: OrderLinkOptions = {}
) {
  return withAccessToken(
    `/orders/${encodeURIComponent(String(orderId ?? "").trim())}`,
    options
  );
}

export function buildOrderPaymentHref(
  orderId: string,
  options: OrderLinkOptions = {}
) {
  return withAccessToken(
    `/orders/${encodeURIComponent(String(orderId ?? "").trim())}/payment`,
    options
  );
}

export async function createOrderFromCart(
  input: CreateOrderInput,
  cartLines: CartLine[],
  options: CreateOrderOptions = {}
) {
  const lineIds = cartLines.map((line) => String(line.id ?? "")).filter(Boolean);
  const guestItems = cartLines
    .map((line) => ({
      variant_id: String(line.variant_id ?? line.variant?.id ?? "").trim(),
      qty: Math.max(1, Number(line.qty ?? 0) || 0),
      protector_selected: Boolean(line.protector_selected),
    }))
    .filter((item) => item.variant_id && item.qty > 0);
  if (!lineIds.length) {
    throw new Error("No cart items selected.");
  }

  const requestInit = {
    method: "POST",
    body: JSON.stringify({ input, lineIds, guestItems }),
  };

  const payload = options.guest
    ? await fetchJson<{ ok: true; order: any }>("/api/orders/create", {
        ...requestInit,
        headers: { "Content-Type": "application/json" },
      })
    : await fetchAuthedJson<{ ok: true; order: any }>(
        "/api/orders/create",
        requestInit
      );

  return payload.order as any;
}
