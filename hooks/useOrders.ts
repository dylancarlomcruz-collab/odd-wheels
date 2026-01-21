"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { useAuth } from "@/components/auth/AuthProvider";

export type Order = {
  id: string;
  created_at: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  subtotal: number;
  total: number;
  shipping_method: string;
  shipping_region?: string | null;
  shipping_status?: string | null;
  shipped_at?: string | null;
  tracking_number?: string | null;
  courier?: string | null;
  cancelled_reason?: string | null;

  priority_fee: number;
  priority_approved: boolean;

  // computed for UI (no DB column)
  priority_requested: boolean;
};

export type OrderItemPreview = {
  order_id: string;
  item_id?: string | null;
  item_name?: string | null;
  product_title?: string | null;
  name_snapshot?: string | null;
  condition?: string | null;
  price_each?: number | null;
  price?: number | null;
  unit_price?: number | null;
  qty?: number | null;
  line_total?: number | null;
  variant_id?: string | null;
  product_id?: string | null;
  product?: {
    title?: string | null;
    image_urls?: string[] | null;
  } | null;
  product_variant?: {
    condition?: string | null;
    product?: {
      title?: string | null;
      image_urls?: string[] | null;
    } | null;
  } | null;
};

export function useOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [itemsByOrderId, setItemsByOrderId] = React.useState<
    Record<string, OrderItemPreview[]>
  >({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    async function run() {
      if (!user) {
        setOrders([]);
        setItemsByOrderId({});
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        await supabase.rpc("fn_expire_unpaid_orders");
      } catch {
        // ignore if not installed
      }

      const select =
        "id,created_at,status,payment_status,payment_method,subtotal,total,shipping_method,shipping_region,shipping_status,shipped_at,tracking_number,courier,cancelled_reason,priority_fee,priority_approved";

      const { data, error } = await supabase
        .from("orders")
        .select(select)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (error) console.error("Failed to load orders:", error);

      const mapped: Order[] = (data ?? []).map((o: any) => {
        const priority_fee = Number(o.priority_fee ?? 0);
        return {
          id: o.id,
          created_at: o.created_at,
          status: o.status,
          payment_status: o.payment_status,
          payment_method: o.payment_method ?? null,
          subtotal: Number(o.subtotal ?? 0),
          total: Number(o.total ?? 0),
          shipping_method: o.shipping_method,
          shipping_region: o.shipping_region ?? null,
          shipping_status: o.shipping_status ?? null,
          shipped_at: o.shipped_at ?? null,
          tracking_number: o.tracking_number ?? null,
          courier: o.courier ?? null,
          cancelled_reason: o.cancelled_reason ?? null,
          priority_fee,
          priority_approved: Boolean(o.priority_approved ?? false),
          priority_requested: priority_fee > 0,
        };
      });

      setOrders(mapped);

      const ids = mapped.map((o) => o.id);
      if (!ids.length) {
        setItemsByOrderId({});
        setLoading(false);
        return;
      }

      const itemSelect =
        "*,product_variant:product_variants(condition,product:products(title,image_urls))";
      const { data: items, error: iErr } = await supabase
        .from("order_items")
        .select(itemSelect)
        .in("order_id", ids)
        .order("order_id", { ascending: false });

      if (!mounted) return;

      let resolvedItems = (items as OrderItemPreview[]) ?? [];
      if (iErr) {
        console.error("Failed to load order items with images:", iErr);
        const fallbackSelect = "*";
        const { data: fallbackItems, error: fallbackErr } = await supabase
          .from("order_items")
          .select(fallbackSelect)
          .in("order_id", ids)
          .order("order_id", { ascending: false });
        if (!mounted) return;
        if (fallbackErr) {
          console.error("Failed to load order items:", fallbackErr);
        }
        resolvedItems = (fallbackItems as OrderItemPreview[]) ?? [];
      }

      const by: Record<string, OrderItemPreview[]> = {};
      for (const it of resolvedItems ?? []) {
        const oid = String(it.order_id);
        if (!by[oid]) by[oid] = [];
        by[oid].push(it);
      }

      setItemsByOrderId(by);
      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  return { orders, itemsByOrderId, loading };
}

export function useOrder(orderId: string) {
  const { user } = useAuth();
  const [order, setOrder] = React.useState<any>(null);
  const [items, setItems] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    async function run() {
      if (!user) {
        setOrder(null);
        setItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data: o, error: oErr } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();

      const { data: it, error: iErr } = await supabase
        .from("order_items")
        .select(
          "*, product_variant:product_variants(id,barcode,condition,issue_notes,price,qty,product:products(id,title,brand,model,variation,image_urls))"
        )
        .eq("order_id", orderId)
        .order("id", { ascending: true });

      if (!mounted) return;

      if (oErr) console.error(oErr);
      if (iErr) console.error(iErr);

      setOrder(o ?? null);
      setItems((it as any) ?? []);
      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, [user?.id, orderId]);

  return { order, items, loading };
}
