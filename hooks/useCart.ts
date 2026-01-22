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
    sale_price?: number | null;
    discount_percent?: number | null;
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
const GUEST_CART_KEY = "oddwheels:guest-cart";

type GuestCartItem = {
  variant_id: string;
  qty: number;
  added_at?: string;
};

let mergePromise: Promise<void> | null = null;

function emitCartUpdated(source?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { source } }));
}

function normalizeGuestCart(items: GuestCartItem[]) {
  const map = new Map<string, GuestCartItem>();
  for (const item of items) {
    const id = String(item?.variant_id ?? "").trim();
    if (!id) continue;
    const qty = Number(item?.qty ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const existing = map.get(id);
    if (existing) {
      existing.qty += qty;
      existing.added_at = existing.added_at ?? item.added_at;
    } else {
      map.set(id, {
        variant_id: id,
        qty,
        added_at: item.added_at ?? new Date().toISOString(),
      });
    }
  }
  return Array.from(map.values());
}

function readGuestCart(): GuestCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeGuestCart(parsed as GuestCartItem[]);
  } catch {
    return [];
  }
}

function writeGuestCart(items: GuestCartItem[]) {
  if (typeof window === "undefined") return;
  const normalized = normalizeGuestCart(items);
  window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(normalized));
}

export function useCart() {
  const { user } = useAuth();
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [loading, setLoading] = React.useState(true);
  const instanceId = React.useRef(`cart-${Math.random().toString(36).slice(2)}`);

  const reload = React.useCallback(async () => {
    setLoading(true);
    if (!user) {
      const guestItems = readGuestCart();
      if (!guestItems.length) {
        setLines([]);
        setLoading(false);
        return;
      }
      const variantIds = guestItems
        .map((item) => item.variant_id)
        .filter(Boolean);
      if (!variantIds.length) {
        setLines([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("product_variants")
        .select(
          "id,condition,issue_notes,public_notes,price,sale_price,discount_percent,qty,ship_class, product:products(id,title,brand,model,image_urls)"
        )
        .in("id", variantIds);

      if (error) {
        console.error("Failed to load guest cart:", error);
        setLines([]);
        setLoading(false);
        return;
      }

      const variantMap = new Map(
        ((data as any[]) ?? []).map((row) => [String(row.id), row])
      );
      const nextLines: CartLine[] = [];
      const cleanedItems: GuestCartItem[] = [];
      let changed = false;
      for (const item of guestItems) {
        const variant = variantMap.get(String(item.variant_id));
        if (!variant) {
          changed = true;
          continue;
        }
        const available = Number(variant.qty ?? 0);
        const desired = Number(item.qty ?? 0);
        const nextQty = Math.max(1, Math.min(desired, available || desired));
        if (nextQty !== desired) changed = true;
        nextLines.push({
          id: String(item.variant_id),
          user_id: "guest",
          variant_id: String(item.variant_id),
          qty: nextQty,
          variant: variant as any,
        });
        cleanedItems.push({ ...item, qty: nextQty });
      }
      if (changed) {
        writeGuestCart(cleanedItems);
      }
      setLines(nextLines);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("cart_items")
      .select(
        "id,user_id,variant_id,qty, variant:product_variants(id,condition,issue_notes,public_notes,price,sale_price,discount_percent,qty,ship_class, product:products(id,title,brand,model,image_urls))"
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

  const mergeGuestCartToUser = React.useCallback(async () => {
    if (!user) return;
    if (mergePromise) return mergePromise;
    const run = (async () => {
      const guestItems = readGuestCart();
      if (!guestItems.length) return;
      const variantIds = guestItems.map((item) => item.variant_id).filter(Boolean);
      if (!variantIds.length) return;

      const [existingRes, inventoryRes] = await Promise.all([
        supabase
          .from("cart_items")
          .select("id,variant_id,qty")
          .eq("user_id", user.id)
          .in("variant_id", variantIds),
        supabase
          .from("product_variants")
          .select("id,qty")
          .in("id", variantIds),
      ]);

      const existingMap = new Map<string, { id: string; qty: number }>();
      (existingRes.data as any[] | null)?.forEach((row) => {
        if (!row?.variant_id) return;
        existingMap.set(String(row.variant_id), {
          id: String(row.id),
          qty: Number(row.qty ?? 0),
        });
      });

      const inventoryMap = new Map<string, number>();
      (inventoryRes.data as any[] | null)?.forEach((row) => {
        if (!row?.id) return;
        inventoryMap.set(String(row.id), Number(row.qty ?? 0));
      });

      for (const item of guestItems) {
        const variantId = String(item.variant_id ?? "").trim();
        if (!variantId) continue;
        const guestQty = Number(item.qty ?? 0);
        if (!Number.isFinite(guestQty) || guestQty <= 0) continue;
        const available = inventoryMap.get(variantId);
        if (typeof available === "number" && available <= 0) continue;
        const existing = existingMap.get(variantId);
        const prevQty = existing?.qty ?? 0;
        const desired = prevQty + guestQty;
        const availableQty = typeof available === "number" ? available : undefined;
        const nextQty = typeof availableQty === "number"
          ? Math.max(1, Math.min(desired, availableQty))
          : Math.max(1, desired);
        if (existing?.id) {
          if (nextQty !== prevQty) {
            await supabase
              .from("cart_items")
              .update({ qty: nextQty })
              .eq("id", existing.id);
          }
        } else {
          await supabase
            .from("cart_items")
            .insert({ user_id: user.id, variant_id: variantId, qty: nextQty });
        }
      }

      writeGuestCart([]);
    })();
    mergePromise = run;
    try {
      await run;
    } finally {
      mergePromise = null;
    }
  }, [user?.id]);

  React.useEffect(() => {
    if (!user) return;
    mergeGuestCartToUser()
      .then(() => reload())
      .catch((err) => console.error("Failed to merge guest cart:", err));
  }, [user?.id, mergeGuestCartToUser, reload]);

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
      // Always clamp based on current inventory qty
      const { data: vRow, error: vErr } = await supabase
        .from("product_variants")
        .select("qty, product_id")
        .eq("id", variantId)
        .maybeSingle();
      if (vErr) throw vErr;
      const available = Number((vRow as any)?.qty ?? 0);
      const productId = (vRow as any)?.product_id as string | undefined;
      if (available <= 0) throw new Error("Item sold out");

      if (!user) {
        const guestItems = readGuestCart();
        const existing = guestItems.find(
          (item) => item.variant_id === variantId
        );
        const prevQty = Number(existing?.qty ?? 0);
        const desired = prevQty + Number(qty);
        let desiredQty = desired;
        let nextQty = Math.max(1, Math.min(desired, available));
        let capped = desired > available;
        if (existing) {
          if (nextQty !== prevQty) {
            existing.qty = nextQty;
          }
        } else {
          desiredQty = Number(qty) || 1;
          nextQty = Math.max(1, Math.min(desiredQty, available));
          capped = desiredQty > available;
          guestItems.unshift({
            variant_id: variantId,
            qty: nextQty,
            added_at: new Date().toISOString(),
          });
        }
        writeGuestCart(guestItems);
        await reload();
        if (productId) {
          supabase
            .rpc("increment_product_add_to_cart", { p_product_id: productId })
            .then(
              () => undefined,
              (err) => console.error("Failed to log add-to-cart", err)
            );
        }
        emitCartUpdated(instanceId.current);
        return { available, desiredQty, nextQty, prevQty, capped };
      }

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
      if (productId) {
        supabase
          .rpc("increment_product_add_to_cart", { p_product_id: productId })
          .then(
            () => undefined,
            (err) => console.error("Failed to log add-to-cart", err)
          );
      }
      emitCartUpdated(instanceId.current);
      return { available, desiredQty, nextQty, prevQty, capped };
    },
    [user?.id, reload]
  );

  const updateQty = React.useCallback(
    async (lineId: string, qty: number) => {
      const isGuest = !user;
      const variantId = isGuest ? lineId : undefined;
      let resolvedVariantId = variantId;
      if (!isGuest) {
        // Fetch variantId for this cart line
        const { data: row, error: rowErr } = await supabase
          .from("cart_items")
          .select("id,variant_id")
          .eq("id", lineId)
          .maybeSingle();
        if (rowErr) throw rowErr;
        resolvedVariantId = (row as any)?.variant_id as string | undefined;
      }

      // Clamp to inventory
      let available = Infinity;
      if (resolvedVariantId) {
        const { data: vRow, error: vErr } = await supabase
          .from("product_variants")
          .select("qty")
          .eq("id", resolvedVariantId)
          .maybeSingle();
        if (vErr) throw vErr;
        available = Number((vRow as any)?.qty ?? 0);
      }

      const desired = Number(qty);
      const nextQty = Math.max(1, Math.min(Number.isFinite(desired) ? desired : 1, available));
      if (isGuest && resolvedVariantId) {
        const guestItems = readGuestCart();
        const existing = guestItems.find(
          (item) => item.variant_id === resolvedVariantId
        );
        if (!existing) return;
        existing.qty = nextQty;
        writeGuestCart(guestItems);
        await reload();
        emitCartUpdated(instanceId.current);
        return;
      }
      await supabase.from("cart_items").update({ qty: nextQty }).eq("id", lineId);
      await reload();
      emitCartUpdated(instanceId.current);
    },
    [reload, user?.id]
  );

  const remove = React.useCallback(
    async (lineId: string) => {
      if (!user) {
        const guestItems = readGuestCart().filter(
          (item) => item.variant_id !== lineId
        );
        writeGuestCart(guestItems);
        await reload();
        emitCartUpdated(instanceId.current);
        return;
      }
      await supabase.from("cart_items").delete().eq("id", lineId);
      await reload();
      emitCartUpdated(instanceId.current);
    },
    [reload, user?.id]
  );

  return { lines, loading, reload, add, updateQty, remove, isLoggedIn: !!user };
}
