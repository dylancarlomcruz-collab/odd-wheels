"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";

export type OrderRow = {
  id: string;
  created_at: string;
  user_id: string | null;

  status: string;
  payment_status: string;
  payment_method: string | null;
  fulfillment_status?: string | null;

  subtotal: number;
  shipping_fee: number;
  total: number;
  shipping_method: string;
  shipping_region?: string | null;
  shipping_details?: any;
  shipping_status?: string | null;
  tracking_number?: string | null;
  courier?: string | null;
  shipped_at?: string | null;
  completed_at?: string | null;
  rush_fee: number;

  customer_name?: string | null;
  customer_phone?: string | null;
  contact?: string | null;
  address?: string | null;

  priority_fee: number;
  priority_approved: boolean;
  priority_requested: boolean;

  channel: string;
  reserved_expires_at: string | null;
  payment_deadline?: string | null;
  payment_hold: boolean;
};

export type OrderItemRow = {
  order_id: string;
  variant_id: string | null;
  item_id?: string | null;
  item_name?: string | null;
  product_id?: string | null;
  product_title?: string | null;
  price_each?: number | null;
  unit_price?: number | null;
  qty: number;
  line_total: number;
  condition?: string | null;
  issue_notes?: string | null;
  // joined
  product_variant?: any;
};

export function useAllOrders() {
  const [orders, setOrders] = React.useState<OrderRow[]>([]);
  const [itemsByOrderId, setItemsByOrderId] = React.useState<
    Record<string, OrderItemRow[]>
  >({});
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);

    try {
      await supabase.rpc("fn_expire_unpaid_orders");
    } catch {
      // ignore if not installed
    }

    const select =
      "id,created_at,user_id,status,payment_status,payment_method,fulfillment_status,subtotal,shipping_fee,total,shipping_method,shipping_region,shipping_details,shipping_status,tracking_number,courier,shipped_at,completed_at,rush_fee,customer_name,customer_phone,contact,address,priority_fee,priority_approved,channel,reserved_expires_at,payment_deadline,payment_hold";

    const { data, error } = await supabase
      .from("orders")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) console.error(error);

    const mapped: OrderRow[] = (data ?? []).map((o: any) => {
      const priority_fee = Number(o.priority_fee ?? 0);
      return {
        id: o.id,
        created_at: o.created_at,
        user_id: o.user_id ?? null,

        status: o.status,
        payment_status: o.payment_status,
        payment_method: o.payment_method ?? null,
        fulfillment_status: o.fulfillment_status ?? null,

        subtotal: Number(o.subtotal ?? 0),
        shipping_fee: Number(o.shipping_fee ?? 0),
        total: Number(o.total ?? 0),
        shipping_method: o.shipping_method,
        shipping_region: o.shipping_region ?? null,
        shipping_details: o.shipping_details ?? null,
        shipping_status: o.shipping_status ?? null,
        tracking_number: o.tracking_number ?? null,
        courier: o.courier ?? null,
        shipped_at: o.shipped_at ?? null,
        completed_at: o.completed_at ?? null,
        rush_fee: Number(o.rush_fee ?? 0),

        customer_name: o.customer_name ?? null,
        customer_phone: o.customer_phone ?? null,
        contact: o.contact ?? null,
        address: o.address ?? null,

        priority_fee,
        priority_approved: Boolean(o.priority_approved ?? false),
        priority_requested: priority_fee > 0,

        channel: String(o.channel ?? "WEB"),
        reserved_expires_at: o.reserved_expires_at ?? null,
        payment_deadline: o.payment_deadline ?? null,
        payment_hold: Boolean(o.payment_hold ?? false),
      };
    });

    setOrders(mapped);

    const ids = mapped.map((o) => o.id);
    if (!ids.length) {
      setItemsByOrderId({});
      setLoading(false);
      return;
    }

    // Pull order_items with best-effort joins to variants/products for photos.
    const itemSelect =
      "order_id,variant_id,item_id,item_name,price_each,unit_price,qty,line_total,condition,issue_notes,product_variant:product_variants(id,barcode,condition,issue_notes,price,qty,product:products(id,title,brand,model,variation,image_urls))";

    const { data: items, error: iErr } = await supabase
      .from("order_items")
      .select(itemSelect)
      .in("order_id", ids)
      .order("order_id", { ascending: false });

    if (iErr) console.error(iErr);

    const by: Record<string, OrderItemRow[]> = {};
    for (const it of (items as any[]) ?? []) {
      const oid = String(it.order_id);
      if (!by[oid]) by[oid] = [];
      by[oid].push(it as any);
    }

    setItemsByOrderId(by);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return { orders, itemsByOrderId, loading, reload: load };
}
