"use client";

import type { CartLine } from "@/hooks/useCart";
import { fetchAuthedJson } from "@/lib/api/client";

export type CreateOrderInput = {
  userId: string;
  payment_method: string;
  shipping_method: "LBC" | "JNT" | "LALAMOVE" | "PICKUP" | "INTERNATIONAL";
  shipping_region: string | null;
  shipping_details: any;
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

export async function createOrderFromCart(
  input: CreateOrderInput,
  cartLines: CartLine[]
) {
  const lineIds = cartLines.map((line) => String(line.id ?? "")).filter(Boolean);
  if (!lineIds.length) {
    throw new Error("No cart items selected.");
  }

  const payload = await fetchAuthedJson<{ ok: true; order: any }>(
    "/api/orders/create",
    {
      method: "POST",
      body: JSON.stringify({ input, lineIds }),
    }
  );

  return payload.order as any;
}
