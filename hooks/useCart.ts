"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/browser";
import { useAuth } from "@/components/auth/AuthProvider";
import { getOrCreateGuestSessionId } from "@/lib/guestSession";
import { notifyAdminPushEvent } from "@/lib/push/adminClient";
import { fetchAuthedJson, fetchJson } from "@/lib/api/client";

export type CartLine = {
  id: string;
  user_id: string;
  variant_id: string;
  qty: number;
  protector_selected: boolean;
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
    allowed_couriers?: string[] | null;
    allowed_lbc_packages?: string[] | null;
    allowed_jnt_pouches?: string[] | null;
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
const GUEST_CART_SYNC_KEY = "oddwheels:guest-cart-sync";

type GuestCartItem = {
  variant_id: string;
  qty: number;
  added_at?: string;
  protector_selected?: boolean;
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
      existing.protector_selected =
        Boolean(existing.protector_selected) ||
        Boolean(item.protector_selected);
    } else {
      map.set(id, {
        variant_id: id,
        qty,
        added_at: item.added_at ?? new Date().toISOString(),
        protector_selected: Boolean(item.protector_selected),
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

async function syncGuestCart(items: GuestCartItem[]) {
  const sessionId = getOrCreateGuestSessionId();
  if (!sessionId) return;
  const normalized = normalizeGuestCart(items);
  const payload = normalized.map((item) => ({
    variant_id: item.variant_id,
    qty: item.qty,
    protector_selected: Boolean(item.protector_selected),
  }));
  const signature = JSON.stringify(payload);
  if (typeof window !== "undefined") {
    const prev = window.localStorage.getItem(GUEST_CART_SYNC_KEY);
    if (prev === signature) return;
  }
  const { error } = await supabase.rpc("sync_guest_cart", {
    p_session_id: sessionId,
    p_items: payload,
  });
  if (error) {
    console.error("Failed to sync guest cart", error);
    return;
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(GUEST_CART_SYNC_KEY, signature);
  }
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

      try {
        const payload = await fetchJson<{
          ok: true;
          lines: CartLine[];
          items: GuestCartItem[];
        }>("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "guestPreview", items: guestItems }),
        });
        writeGuestCart(payload.items);
        void syncGuestCart(payload.items);
        setLines(payload.lines ?? []);
      } catch (error) {
        console.error("Failed to load guest cart:", error);
        setLines([]);
      }

      setLoading(false);
      return;
    }

    try {
      const payload = await fetchAuthedJson<{ ok: true; rows: CartLine[] }>(
        "/api/cart"
      );
      setLines(payload.rows ?? []);
    } catch (error) {
      console.error("Failed to load cart:", error);
      setLines([]);
    }

    setLoading(false);
  }, [user?.id]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const mergeGuestCartToUser = React.useCallback(async () => {
    if (!user) return;
    if (mergePromise) return mergePromise;

    const run = (async () => {
      const guestItems = readGuestCart();
      if (!guestItems.length) return;

      const payload = await fetchAuthedJson<{ ok: true; rows: CartLine[] }>(
        "/api/cart",
        {
          method: "POST",
          body: JSON.stringify({ action: "mergeGuest", items: guestItems }),
        }
      );

      writeGuestCart([]);
      void syncGuestCart([]);
      setLines(payload.rows ?? []);
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
      void reload();
    };
    window.addEventListener(CART_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(CART_EVENT, handler as EventListener);
    };
  }, [reload]);

  React.useEffect(() => {
    if (!user) return;
    if (lines.length === 0) return;

    const variantIds = lines.map((line) => line.variant_id).filter(Boolean);
    const filter = variantIds.length ? `id=in.(${variantIds.join(",")})` : undefined;

    const channel = supabase
      .channel("cart-stock-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "product_variants", filter },
        () => {
          void reload();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, reload, JSON.stringify(lines.map((line) => line.variant_id))]);

  const add = React.useCallback(
    async (
      variantId: string,
      qty = 1,
      options?: { protectorSelected?: boolean }
    ): Promise<AddResult> => {
      const summary = await fetchJson<{
        ok: true;
        available: number;
        productId: string;
      }>("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "variantSummary", variantId }),
      });

      const available = Number(summary.available ?? 0);
      const productId = summary.productId || undefined;
      if (available <= 0) throw new Error("Item sold out");

      const protectorSelected = Boolean(options?.protectorSelected);

      if (!user) {
        const guestItems = readGuestCart();
        const existing = guestItems.find((item) => item.variant_id === variantId);
        const prevQty = Number(existing?.qty ?? 0);
        const desired = prevQty + Number(qty);
        let desiredQty = desired;
        let nextQty = Math.max(1, Math.min(desired, available));
        let capped = desired > available;

        if (existing) {
          if (nextQty !== prevQty) {
            existing.qty = nextQty;
          }
          if (protectorSelected) {
            existing.protector_selected = true;
          }
        } else {
          desiredQty = Number(qty) || 1;
          nextQty = Math.max(1, Math.min(desiredQty, available));
          capped = desiredQty > available;
          guestItems.unshift({
            variant_id: variantId,
            qty: nextQty,
            added_at: new Date().toISOString(),
            protector_selected: protectorSelected,
          });
        }

        writeGuestCart(guestItems);
        void syncGuestCart(guestItems);
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

      const payload = await fetchAuthedJson<{
        ok: true;
        available: number;
        desiredQty: number;
        nextQty: number;
        prevQty: number;
        capped: boolean;
        productId?: string;
      }>("/api/cart", {
        method: "POST",
        body: JSON.stringify({
          action: "add",
          variantId,
          qty,
          protectorSelected,
        }),
      });

      await reload();

      if (payload.productId || productId) {
        supabase
          .rpc("increment_product_add_to_cart", {
            p_product_id: payload.productId || productId,
          })
          .then(
            () => undefined,
            (err) => console.error("Failed to log add-to-cart", err)
          );
      }

      if (payload.prevQty <= 0 && payload.nextQty > 0) {
        void notifyAdminPushEvent({
          event: "cart_activity",
          variantId,
          qty: payload.nextQty,
        }).catch((err) =>
          console.error("Admin cart push notification failed:", err)
        );
      }

      emitCartUpdated(instanceId.current);
      return {
        available: payload.available,
        desiredQty: payload.desiredQty,
        nextQty: payload.nextQty,
        prevQty: payload.prevQty,
        capped: payload.capped,
      };
    },
    [user?.id, reload]
  );

  const updateQty = React.useCallback(
    async (lineId: string, qty: number) => {
      if (!user) {
        const summary = await fetchJson<{ ok: true; available: number }>(
          "/api/cart",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "variantSummary", variantId: lineId }),
          }
        );

        const desired = Number(qty);
        const nextQty = Math.max(
          1,
          Math.min(Number.isFinite(desired) ? desired : 1, summary.available)
        );

        const guestItems = readGuestCart();
        const existing = guestItems.find((item) => item.variant_id === lineId);
        if (!existing) return;

        existing.qty = nextQty;
        writeGuestCart(guestItems);
        void syncGuestCart(guestItems);
        await reload();
        emitCartUpdated(instanceId.current);
        return;
      }

      await fetchAuthedJson<{ ok: true; nextQty: number; available: number }>(
        "/api/cart",
        {
          method: "POST",
          body: JSON.stringify({ action: "updateQty", lineId, qty }),
        }
      );
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
        void syncGuestCart(guestItems);
        await reload();
        emitCartUpdated(instanceId.current);
        return;
      }

      await fetchAuthedJson<{ ok: true }>("/api/cart", {
        method: "POST",
        body: JSON.stringify({ action: "remove", lineId }),
      });
      await reload();
      emitCartUpdated(instanceId.current);
    },
    [reload, user?.id]
  );

  const updateProtector = React.useCallback(
    async (lineId: string, selected: boolean) => {
      if (!user) {
        const guestItems = readGuestCart();
        const existing = guestItems.find((item) => item.variant_id === lineId);
        if (!existing) return;

        existing.protector_selected = selected;
        writeGuestCart(guestItems);
        void syncGuestCart(guestItems);
        await reload();
        emitCartUpdated(instanceId.current);
        return;
      }

      await fetchAuthedJson<{ ok: true }>("/api/cart", {
        method: "POST",
        body: JSON.stringify({ action: "updateProtector", lineId, selected }),
      });
      await reload();
      emitCartUpdated(instanceId.current);
    },
    [reload, user?.id]
  );

  return {
    lines,
    loading,
    reload,
    add,
    updateQty,
    updateProtector,
    remove,
    isLoggedIn: !!user,
  };
}
