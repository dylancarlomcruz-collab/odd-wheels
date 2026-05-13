import { NextResponse } from "next/server";
import { requireUserRequest } from "@/lib/api/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  resolveShopControls,
  SHOP_ADD_TO_CART_DISABLED_MESSAGE,
} from "@/lib/shopControls";

const CART_SELECT =
  "id,user_id,variant_id,qty,protector_selected,variant:product_variants(id,condition,issue_notes,public_notes,price,sale_price,discount_percent,qty,ship_class,allowed_couriers,allowed_lbc_packages,allowed_jnt_pouches,product:products(id,title,brand,model,image_urls))";

const VARIANT_DETAIL_SELECT =
  "id,product_id,condition,issue_notes,public_notes,price,sale_price,discount_percent,qty,ship_class,allowed_couriers,allowed_lbc_packages,allowed_jnt_pouches,product:products(id,title,brand,model,image_urls)";

type GuestCartItem = {
  variant_id: string;
  qty: number;
  added_at?: string;
  protector_selected?: boolean;
};

function normalizeGuestItems(input: unknown): GuestCartItem[] {
  if (!Array.isArray(input)) return [];
  const map = new Map<string, GuestCartItem>();

  for (const item of input) {
    const variantId = String((item as any)?.variant_id ?? "").trim();
    if (!variantId) continue;

    const qty = Number((item as any)?.qty ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const existing = map.get(variantId);
    if (existing) {
      existing.qty += qty;
      existing.added_at = existing.added_at ?? (item as any)?.added_at;
      existing.protector_selected =
        Boolean(existing.protector_selected) ||
        Boolean((item as any)?.protector_selected);
      continue;
    }

    map.set(variantId, {
      variant_id: variantId,
      qty,
      added_at: String((item as any)?.added_at ?? new Date().toISOString()),
      protector_selected: Boolean((item as any)?.protector_selected),
    });
  }

  return Array.from(map.values());
}

async function fetchUserCartRows(
  sb: ReturnType<typeof supabaseAdmin>,
  userId: string
) {
  const { data, error } = await sb
    .from("cart_items")
    .select(CART_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data as any[]) ?? []).filter(
    (row) => row?.variant?.id && row?.variant?.product?.id
  );
}

async function buildGuestPreview(
  sb: ReturnType<typeof supabaseAdmin>,
  items: GuestCartItem[]
) {
  const variantIds = Array.from(
    new Set(items.map((item) => item.variant_id).filter(Boolean))
  );

  if (!variantIds.length) {
    return { lines: [] as any[], items: [] as GuestCartItem[] };
  }

  const { data, error } = await sb
    .from("product_variants")
    .select(VARIANT_DETAIL_SELECT)
    .in("id", variantIds);

  if (error) throw error;

  const variantMap = new Map<string, any>();
  for (const row of (data as any[]) ?? []) {
    if (!row?.id || !row?.product?.id) continue;
    variantMap.set(String(row.id), row);
  }

  const lines: any[] = [];
  const cleanedItems: GuestCartItem[] = [];

  for (const item of items) {
    const variant = variantMap.get(item.variant_id);
    if (!variant) continue;

    const available = Number(variant.qty ?? 0);
    const desired = Number(item.qty ?? 0);
    const nextQty =
      available > 0
        ? Math.max(1, Math.min(desired, available))
        : Math.max(1, desired);

    lines.push({
      id: String(item.variant_id),
      user_id: "guest",
      variant_id: String(item.variant_id),
      qty: nextQty,
      protector_selected: Boolean(item.protector_selected),
      variant,
    });
    cleanedItems.push({ ...item, qty: nextQty });
  }

  return { lines, items: cleanedItems };
}

async function fetchVariantSummary(
  sb: ReturnType<typeof supabaseAdmin>,
  variantId: string
) {
  const { data, error } = await sb
    .from("product_variants")
    .select("id,qty,product_id")
    .eq("id", variantId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error("Variant not found.");
  }

  return {
    id: String(data.id),
    available: Number((data as any).qty ?? 0),
    productId: String((data as any).product_id ?? ""),
  };
}

async function fetchShopControls(sb: ReturnType<typeof supabaseAdmin>) {
  const { data, error } = await sb
    .from("settings")
    .select("show_prices,allow_add_to_cart,allow_checkout")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  return resolveShopControls((data as any) ?? null);
}

export async function GET(req: Request) {
  try {
    const authResult = await requireUserRequest(req);
    if ("error" in authResult) return authResult.error;

    const rows = await fetchUserCartRows(authResult.sb, authResult.userId);
    return NextResponse.json({ ok: true, rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load cart." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const action = String(body?.action ?? "").trim();
    const sb = supabaseAdmin();

    if (action === "guestPreview") {
      const items = normalizeGuestItems(body?.items);
      const result = await buildGuestPreview(sb, items);
      return NextResponse.json({ ok: true, ...result }, { status: 200 });
    }

    if (action === "variantSummary") {
      const variantId = String(body?.variantId ?? "").trim();
      if (!variantId) {
        return NextResponse.json(
          { ok: false, error: "Variant id is required." },
          { status: 400 }
        );
      }

      const controls = await fetchShopControls(sb);
      const summary = await fetchVariantSummary(sb, variantId);
      return NextResponse.json(
        { ok: true, ...summary, allowAddToCart: controls.allowAddToCart },
        { status: 200 }
      );
    }

    const authResult = await requireUserRequest(req);
    if ("error" in authResult) return authResult.error;

    const authedSb = authResult.sb;
    const userId = authResult.userId;

    if (action === "mergeGuest") {
      const items = normalizeGuestItems(body?.items);
      if (!items.length) {
        const rows = await fetchUserCartRows(authedSb, userId);
        return NextResponse.json({ ok: true, rows }, { status: 200 });
      }

      const variantIds = Array.from(
        new Set(items.map((item) => item.variant_id).filter(Boolean))
      );
      const [existingRes, inventoryRes] = await Promise.all([
        authedSb
          .from("cart_items")
          .select("id,variant_id,qty,protector_selected")
          .eq("user_id", userId)
          .in("variant_id", variantIds),
        authedSb
          .from("product_variants")
          .select("id,qty")
          .in("id", variantIds),
      ]);

      if (existingRes.error) throw existingRes.error;
      if (inventoryRes.error) throw inventoryRes.error;

      const existingMap = new Map<
        string,
        { id: string; qty: number; protector_selected: boolean }
      >();
      for (const row of (existingRes.data as any[]) ?? []) {
        if (!row?.variant_id) continue;
        existingMap.set(String(row.variant_id), {
          id: String(row.id),
          qty: Number(row.qty ?? 0),
          protector_selected: Boolean(row.protector_selected),
        });
      }

      const inventoryMap = new Map<string, number>();
      for (const row of (inventoryRes.data as any[]) ?? []) {
        if (!row?.id) continue;
        inventoryMap.set(String(row.id), Number(row.qty ?? 0));
      }

      for (const item of items) {
        const variantId = String(item.variant_id ?? "").trim();
        if (!variantId) continue;

        const guestQty = Number(item.qty ?? 0);
        if (!Number.isFinite(guestQty) || guestQty <= 0) continue;

        const available = inventoryMap.get(variantId);
        if (typeof available === "number" && available <= 0) continue;

        const existing = existingMap.get(variantId);
        const prevQty = existing?.qty ?? 0;
        const desired = prevQty + guestQty;
        const nextQty =
          typeof available === "number"
            ? Math.max(1, Math.min(desired, available))
            : Math.max(1, desired);
        const nextProtectorSelected =
          Boolean(existing?.protector_selected) ||
          Boolean(item.protector_selected);

        if (existing?.id) {
          if (
            nextQty !== prevQty ||
            nextProtectorSelected !== existing.protector_selected
          ) {
            const { error } = await authedSb
              .from("cart_items")
              .update({
                qty: nextQty,
                protector_selected: nextProtectorSelected,
              })
              .eq("id", existing.id)
              .eq("user_id", userId);
            if (error) throw error;
          }
          continue;
        }

        const { error } = await authedSb.from("cart_items").insert({
          user_id: userId,
          variant_id: variantId,
          qty: nextQty,
          protector_selected: Boolean(item.protector_selected),
        });
        if (error) throw error;
      }

      const rows = await fetchUserCartRows(authedSb, userId);
      return NextResponse.json({ ok: true, rows }, { status: 200 });
    }

    if (action === "add") {
      const controls = await fetchShopControls(authedSb);
      if (!controls.allowAddToCart) {
        return NextResponse.json(
          { ok: false, error: SHOP_ADD_TO_CART_DISABLED_MESSAGE },
          { status: 403 }
        );
      }

      const variantId = String(body?.variantId ?? "").trim();
      const qty = Math.max(1, Math.trunc(Number(body?.qty ?? 1) || 1));
      const protectorSelected = Boolean(body?.protectorSelected);
      if (!variantId) {
        return NextResponse.json(
          { ok: false, error: "Variant id is required." },
          { status: 400 }
        );
      }

      const summary = await fetchVariantSummary(authedSb, variantId);
      if (summary.available <= 0) {
        return NextResponse.json(
          { ok: false, error: "Item sold out." },
          { status: 409 }
        );
      }

      const { data: existing, error: existingError } = await authedSb
        .from("cart_items")
        .select("id,qty,protector_selected")
        .eq("user_id", userId)
        .eq("variant_id", variantId)
        .maybeSingle();
      if (existingError) throw existingError;

      const prevQty = Number((existing as any)?.qty ?? 0);
      const desiredQty = prevQty + qty;
      const nextQty = Math.max(1, Math.min(desiredQty, summary.available));
      const capped = desiredQty > summary.available;
      const nextProtectorSelected =
        Boolean((existing as any)?.protector_selected) || protectorSelected;

      if ((existing as any)?.id) {
        if (
          nextQty !== prevQty ||
          nextProtectorSelected !== Boolean((existing as any)?.protector_selected)
        ) {
          const { error } = await authedSb
            .from("cart_items")
            .update({
              qty: nextQty,
              protector_selected: nextProtectorSelected,
            })
            .eq("id", (existing as any).id)
            .eq("user_id", userId);
          if (error) throw error;
        }
      } else {
        const { error } = await authedSb.from("cart_items").insert({
          user_id: userId,
          variant_id: variantId,
          qty: nextQty,
          protector_selected: protectorSelected,
        });
        if (error) throw error;
      }

      return NextResponse.json(
        {
          ok: true,
          available: summary.available,
          desiredQty,
          nextQty,
          prevQty,
          capped,
          productId: summary.productId,
        },
        { status: 200 }
      );
    }

    if (action === "updateQty") {
      const lineId = String(body?.lineId ?? "").trim();
      const desired = Number(body?.qty ?? 1);
      if (!lineId) {
        return NextResponse.json(
          { ok: false, error: "Cart line id is required." },
          { status: 400 }
        );
      }

      const { data: row, error: rowError } = await authedSb
        .from("cart_items")
        .select("id,variant_id,qty")
        .eq("id", lineId)
        .eq("user_id", userId)
        .maybeSingle();
      if (rowError) throw rowError;
      if (!row?.variant_id) {
        return NextResponse.json(
          { ok: false, error: "Cart line not found." },
          { status: 404 }
        );
      }

      const controls = await fetchShopControls(authedSb);
      const currentQty = Number((row as any)?.qty ?? 0);
      if (!controls.allowAddToCart && desired > currentQty) {
        return NextResponse.json(
          { ok: false, error: SHOP_ADD_TO_CART_DISABLED_MESSAGE },
          { status: 403 }
        );
      }

      const summary = await fetchVariantSummary(authedSb, String(row.variant_id));
      const nextQty = Math.max(
        1,
        Math.min(Number.isFinite(desired) ? desired : 1, summary.available)
      );

      const { error } = await authedSb
        .from("cart_items")
        .update({ qty: nextQty })
        .eq("id", lineId)
        .eq("user_id", userId);
      if (error) throw error;

      return NextResponse.json(
        { ok: true, nextQty, available: summary.available },
        { status: 200 }
      );
    }

    if (action === "remove") {
      const lineId = String(body?.lineId ?? "").trim();
      if (!lineId) {
        return NextResponse.json(
          { ok: false, error: "Cart line id is required." },
          { status: 400 }
        );
      }

      const { error } = await authedSb
        .from("cart_items")
        .delete()
        .eq("id", lineId)
        .eq("user_id", userId);
      if (error) throw error;

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (action === "updateProtector") {
      const lineId = String(body?.lineId ?? "").trim();
      const selected = Boolean(body?.selected);
      if (!lineId) {
        return NextResponse.json(
          { ok: false, error: "Cart line id is required." },
          { status: 400 }
        );
      }

      const { error } = await authedSb
        .from("cart_items")
        .update({ protector_selected: selected })
        .eq("id", lineId)
        .eq("user_id", userId);
      if (error) throw error;

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json(
      { ok: false, error: "Unsupported cart action." },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Cart request failed." },
      { status: 500 }
    );
  }
}
