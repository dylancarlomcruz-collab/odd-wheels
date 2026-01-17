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
  shipping_status?: string | null;
  cancelled_reason?: string | null;

  priority_fee: number;
  priority_approved: boolean;

  // computed for UI (no DB column)
  priority_requested: boolean;
};

export function useOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    async function run() {
      if (!user) {
        setOrders([]);
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
        "id,created_at,status,payment_status,payment_method,subtotal,total,shipping_method,shipping_status,cancelled_reason,priority_fee,priority_approved";

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
          shipping_status: o.shipping_status ?? null,
          cancelled_reason: o.cancelled_reason ?? null,
          priority_fee,
          priority_approved: Boolean(o.priority_approved ?? false),
          priority_requested: priority_fee > 0,
        };
      });

      setOrders(mapped);
      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  return { orders, loading };
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
        .select("*")
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
