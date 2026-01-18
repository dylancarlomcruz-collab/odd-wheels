"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { useAuth } from "@/components/auth/AuthProvider";

export type CartLine = {
  id: string;
  user_id: string;
  variant_id: string;
  qty: number;

  // joined
  variant: {
    id: string;
    condition: string;
    issue_notes: string | null;
    public_notes: string | null;
    price: number;
    qty: number;
    ship_class: string | null;
    product: {
      id: string;
      title: string;
      brand: string | null;
      model: string | null;
      image_urls: string[] | null;
    };
  };
};

export type AddResult = {
  available: number;
  desiredQty: number;
  nextQty: number;
  prevQty: number;
  capped: boolean;
};

const CART_EVENT = "oddwheels:cart-updated";

function emitCartUpdated(source?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { source } }));
}

export function useCart() {
  const { user } = useAuth();
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [loading, setLoading] = React.useState(true);
  const instanceId = React.useRef(`cart-${Math.random().toString(36).slice(2)}`);

  const reload = React.useCallback(async () => {
    if (!user) {
      setLines([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data, error } = await supabase
      .from("cart_items")
      .select(
        "id,user_id,variant_id,qty, variant:product_variants(id,condition,issue_notes,public_notes,price,qty,ship_class, product:products(id,title,brand,model,image_urls))"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) console.error("Failed to load cart:", error);
    setLines((data as any) ?? []);
    setLoading(false);
  }, [user?.id]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string }>).detail;
      if (detail?.source === instanceId.current) return;
      reload();
    };
    window.addEventListener(CART_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(CART_EVENT, handler as EventListener);
    };
  }, [reload]);

// Optional: realtime stock updates (requires Supabase Realtime enabled for product_variants).
React.useEffect(() => {
  if (!user) return;
  if (lines.length === 0) return;

  const variantIds = lines.map((l) => l.variant_id).filter(Boolean);
  const filter = variantIds.length ? `id=in.(${variantIds.join(",")})` : undefined;

  const channel = supabase
    .channel("cart-stock-updates")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "product_variants", filter },
      () => {
        // Re-validate cart when any cart variant stock changes
        reload();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [user?.id, JSON.stringify(lines.map((l) => l.variant_id))]);

  const add = React.useCallback(
    async (variantId: string, qty = 1): Promise<AddResult> => {
      if (!user) throw new Error("Not logged in");

      // Always clamp based on current inventory qty
      const { data: vRow, error: vErr } = await supabase
        .from("product_variants")
        .select("qty")
        .eq("id", variantId)
        .maybeSingle();
      if (vErr) throw vErr;
      const available = Number((vRow as any)?.qty ?? 0);
      if (available <= 0) throw new Error("Item sold out");

      // Upsert: if exists, increment
      const { data: existing } = await supabase
        .from("cart_items")
        .select("id,qty")
        .eq("user_id", user.id)
        .eq("variant_id", variantId)
        .maybeSingle();

      const prevQty = Number(existing?.qty ?? 0);
      const desired = prevQty + Number(qty);
      let desiredQty = desired;
      let nextQty = Math.max(1, Math.min(desired, available));
      let capped = desired > available;

      if (existing?.id) {
        if (nextQty !== prevQty) {
          await supabase
            .from("cart_items")
            .update({ qty: nextQty })
            .eq("id", existing.id);
        }
      } else {
        desiredQty = Number(qty) || 1;
        nextQty = Math.max(1, Math.min(desiredQty, available));
        capped = desiredQty > available;
        await supabase
          .from("cart_items")
          .insert({ user_id: user.id, variant_id: variantId, qty: nextQty });
      }
      await reload();
      emitCartUpdated(instanceId.current);
      return { available, desiredQty, nextQty, prevQty, capped };
    },
    [user?.id, reload]
  );

  const updateQty = React.useCallback(
    async (lineId: string, qty: number) => {
      // Fetch variantId for this cart line
      const { data: row, error: rowErr } = await supabase
        .from("cart_items")
        .select("id,variant_id")
        .eq("id", lineId)
        .maybeSingle();
      if (rowErr) throw rowErr;
      const variantId = (row as any)?.variant_id as string | undefined;

      // Clamp to inventory
      let available = Infinity;
      if (variantId) {
        const { data: vRow, error: vErr } = await supabase
          .from("product_variants")
          .select("qty")
          .eq("id", variantId)
          .maybeSingle();
        if (vErr) throw vErr;
        available = Number((vRow as any)?.qty ?? 0);
      }

      const desired = Number(qty);
      const nextQty = Math.max(1, Math.min(Number.isFinite(desired) ? desired : 1, available));
      await supabase.from("cart_items").update({ qty: nextQty }).eq("id", lineId);
      await reload();
      emitCartUpdated(instanceId.current);
    },
    [reload]
  );

  const remove = React.useCallback(
    async (lineId: string) => {
      await supabase.from("cart_items").delete().eq("id", lineId);
      await reload();
      emitCartUpdated(instanceId.current);
    },
    [reload]
  );

  return { lines, loading, reload, add, updateQty, remove, isLoggedIn: !!user };
}
