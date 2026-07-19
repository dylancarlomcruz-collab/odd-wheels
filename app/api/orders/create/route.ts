import { NextResponse } from "next/server";
import { requireUserRequest } from "@/lib/api/auth";
import { insertSingleRowWithSchemaFallback } from "@/lib/supabase/insertWithSchemaFallback";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveEffectivePrice } from "@/lib/pricing";
import { protectorUnitFee } from "@/lib/addons";
import { sendAdminOrderEventNotification } from "@/lib/push/server";
import {
  resolveShopControls,
  SHOP_CHECKOUT_DISABLED_MESSAGE,
} from "@/lib/shopControls";

const PAYMENT_WINDOW_MS = 12 * 60 * 60 * 1000;
const GUEST_ORDER_ACCESS_TOKEN_KEY = "guest_access_token";
const GUEST_ORDER_ACCESS_CREATED_AT_KEY = "guest_access_created_at";
const GUEST_VARIANT_SELECT =
  "id,condition,issue_notes,public_notes,price,sale_price,discount_percent,qty,ship_class,allowed_couriers,allowed_lbc_packages,allowed_jnt_pouches,product:products(id,title,brand,model,image_urls)";

type CreateOrderInput = {
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

type GuestOrderItemInput = {
  variant_id: string;
  qty: number;
  protector_selected?: boolean;
};

function pickStr(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice("Bearer ".length).trim();
}

function normalizeGuestItems(input: unknown): GuestOrderItemInput[] {
  if (!Array.isArray(input)) return [];

  const map = new Map<string, GuestOrderItemInput>();
  for (const item of input) {
    const variantId = String((item as any)?.variant_id ?? "").trim();
    const qty = Math.max(1, Math.trunc(Number((item as any)?.qty ?? 0) || 0));
    if (!variantId || qty <= 0) continue;

    const existing = map.get(variantId);
    if (existing) {
      existing.qty += qty;
      existing.protector_selected =
        Boolean(existing.protector_selected) ||
        Boolean((item as any)?.protector_selected);
      continue;
    }

    map.set(variantId, {
      variant_id: variantId,
      qty,
      protector_selected: Boolean((item as any)?.protector_selected),
    });
  }

  return Array.from(map.values());
}

async function buildGuestSelectedLines(
  sb: ReturnType<typeof supabaseAdmin>,
  items: GuestOrderItemInput[]
) {
  const variantIds = Array.from(
    new Set(items.map((item) => item.variant_id).filter(Boolean))
  );
  if (!variantIds.length) return [];

  const { data, error } = await sb
    .from("product_variants")
    .select(GUEST_VARIANT_SELECT)
    .in("id", variantIds);

  if (error) throw error;

  const variantMap = new Map<string, any>();
  for (const row of (data as any[]) ?? []) {
    if (!row?.id || !row?.product?.id) continue;
    variantMap.set(String(row.id), row);
  }

  return items
    .map((item) => {
      const variant = variantMap.get(item.variant_id);
      if (!variant) return null;

      return {
        id: item.variant_id,
        user_id: "guest",
        variant_id: item.variant_id,
        qty: item.qty,
        protector_selected: Boolean(item.protector_selected),
        variant,
      };
    })
    .filter((line): line is any => Boolean(line?.variant?.id && line?.variant?.product?.id));
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

  const house = pickStr(sd?.house_street_unit);
  const barangay = pickStr(sd?.barangay);
  const city = pickStr(sd?.city);
  const province = pickStr(sd?.province);
  const postal = pickStr(sd?.postal_code);
  if (house || barangay || city || province || postal) {
    const parts = [
      house,
      barangay ? `Brgy ${barangay}` : null,
      city,
      province,
      postal,
    ].filter(Boolean);
    return parts.join(", ");
  }

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
  if (m === "INTERNATIONAL") return "INTERNATIONAL";
  return "OTHER";
}

async function restoreReservedInventory(
  sb: any,
  reservations: Array<{ variantId: string; qty: number }>
) {
  for (const reservation of reservations) {
    try {
      const { data, error } = await sb
        .from("product_variants")
        .select("id,qty")
        .eq("id", reservation.variantId)
        .maybeSingle();
      if (error || !data?.id) continue;

      const currentQty = Number((data as any).qty ?? 0);
      await sb
        .from("product_variants")
        .update({ qty: currentQty + reservation.qty })
        .eq("id", reservation.variantId);
    } catch {
      // Best-effort rollback only.
    }
  }
}

async function reserveInventoryForOrder(
  sb: any,
  selectedLines: any[]
) {
  const reservations: Array<{ variantId: string; qty: number }> = [];
  const soldOutVariantIds: string[] = [];

  try {
    for (const line of selectedLines) {
      const variantId = String(line?.variant?.id ?? "").trim();
      const title = String(line?.variant?.product?.title ?? "An item");
      const desiredQty = Number(line?.qty ?? 0);
      if (!variantId || !Number.isFinite(desiredQty) || desiredQty <= 0) {
        throw new Error(`${title} is no longer available in the requested quantity.`);
      }

      const { data: freshVariant, error: freshError } = await sb
        .from("product_variants")
        .select("id,qty")
        .eq("id", variantId)
        .maybeSingle();
      if (freshError) throw freshError;

      const currentQty = Number((freshVariant as any)?.qty ?? 0);
      if (!freshVariant?.id || currentQty < desiredQty) {
        throw new Error(`${title} is no longer available in the requested quantity.`);
      }

      const nextQty = currentQty - desiredQty;
      const { data: updatedVariant, error: updateError } = await sb
        .from("product_variants")
        .update({ qty: nextQty })
        .eq("id", variantId)
        .eq("qty", currentQty)
        .select("id,qty")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updatedVariant?.id) {
        throw new Error(`${title} is no longer available in the requested quantity.`);
      }

      reservations.push({ variantId, qty: desiredQty });
      if (nextQty <= 0) {
        soldOutVariantIds.push(variantId);
      }
    }
  } catch (error) {
    await restoreReservedInventory(sb, reservations);
    throw error;
  }

  if (soldOutVariantIds.length) {
    const { error } = await sb.rpc("fn_cleanup_sold_out_variants", {
      p_variant_ids: soldOutVariantIds,
    });
    if (error) {
      await restoreReservedInventory(sb, reservations);
      throw error;
    }
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    let sb = supabaseAdmin();
    let userId: string | null = null;

    if (token) {
      const authResult = await requireUserRequest(req);
      if ("error" in authResult) return authResult.error;
      sb = authResult.sb;
      userId = authResult.userId;
    }

    const body = await req.json().catch(() => null);
    const input = (body?.input ?? null) as CreateOrderInput | null;
    const lineIds = Array.isArray(body?.lineIds)
      ? Array.from(
          new Set(
            body.lineIds
              .map((value: unknown) => String(value ?? "").trim())
              .filter(Boolean)
          )
        )
      : [];
    const guestItems = normalizeGuestItems(body?.guestItems);
    const isGuestCheckout = !userId;
    const guestCheckoutSource = String(
      (input?.shipping_details as any)?.source ?? ""
    )
      .trim()
      .toLowerCase();
    const guestCheckoutAllowed =
      isGuestCheckout &&
      guestCheckoutSource === "facebook_checkout" &&
      Boolean(input?.create_as_pending_approval);

    if (!input || (!lineIds.length && !guestItems.length)) {
      return NextResponse.json(
        { ok: false, error: "Cart lines and checkout details are required." },
        { status: 400 }
      );
    }

    if (isGuestCheckout && !guestCheckoutAllowed) {
      return NextResponse.json(
        { ok: false, error: "Please sign in to place this order." },
        { status: 401 }
      );
    }

    const { data: settingsRow, error: settingsError } = await sb
      .from("settings")
      .select("show_prices,allow_add_to_cart,allow_checkout")
      .eq("id", 1)
      .maybeSingle();
    if (settingsError) throw settingsError;

    const shopControls = resolveShopControls((settingsRow as any) ?? null);
    if (!shopControls.allowCheckout) {
      return NextResponse.json(
        { ok: false, error: SHOP_CHECKOUT_DISABLED_MESSAGE },
        { status: 403 }
      );
    }

    let selectedLines: any[] = [];
    if (isGuestCheckout) {
      selectedLines = await buildGuestSelectedLines(sb, guestItems);
    } else {
      const { data: cartRows, error: cartError } = await sb
        .from("cart_items")
        .select(
          "id,user_id,variant_id,qty,protector_selected,variant:product_variants(id,condition,issue_notes,public_notes,price,sale_price,discount_percent,qty,ship_class,allowed_couriers,allowed_lbc_packages,allowed_jnt_pouches,product:products(id,title,brand,model,image_urls))"
        )
        .eq("user_id", userId)
        .in("id", lineIds);

      if (cartError) throw cartError;

      selectedLines = ((cartRows as any[]) ?? []).filter(
        (row) => row?.variant?.id && row?.variant?.product?.id
      );
    }

    if (!selectedLines.length) {
      return NextResponse.json(
        {
          ok: false,
          error: isGuestCheckout
            ? "Selected guest cart items were not found."
            : "Selected cart items were not found.",
        },
        { status: 404 }
      );
    }
    if (!isGuestCheckout && selectedLines.length !== lineIds.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Some selected cart items changed. Please reload your cart and try again.",
        },
        { status: 409 }
      );
    }

    for (const line of selectedLines) {
      const available = Number(line?.variant?.qty ?? 0);
      const desired = Number(line?.qty ?? 0);
      if (available <= 0 || desired > available) {
        return NextResponse.json(
          {
            ok: false,
            error: `${line?.variant?.product?.title ?? "An item"} is no longer available in the requested quantity.`,
          },
          { status: 409 }
        );
      }
    }

    const lineUnitPrice = (line: any) => {
      const basePrice = resolveEffectivePrice({
        price: Number(line.variant.price),
        sale_price: line.variant.sale_price ?? null,
        discount_percent: line.variant.discount_percent ?? null,
      }).effectivePrice;
      const addOn = protectorUnitFee(
        line.variant.ship_class,
        Boolean(line.protector_selected)
      );
      return basePrice + addOn;
    };

    const subtotal = selectedLines.reduce(
      (acc, line) => acc + lineUnitPrice(line) * Number(line.qty ?? 0),
      0
    );

    const shippingDiscount = Math.max(
      0,
      Number(input.shipping_discount ?? 0)
    );
    const discountTotal =
      Math.max(0, Number(input.discount_total ?? shippingDiscount)) || 0;

    const total =
      subtotal +
      Number(input.fees.shipping_fee ?? 0) +
      Number(input.fees.cop_fee ?? 0) +
      Number(input.fees.lalamove_fee ?? 0) +
      Number(input.fees.priority_fee ?? 0) +
      Number(input.fees.insurance_fee ?? 0) -
      shippingDiscount;

    const sd = input.shipping_details ?? {};
    const createAsPendingApproval = Boolean(input.create_as_pending_approval);
    const paymentDeadline = createAsPendingApproval
      ? null
      : new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString();
    const shippingDetails =
      isGuestCheckout && sd && typeof sd === "object"
        ? {
            ...sd,
            guest_checkout: true,
            ...(guestCheckoutAllowed
              ? {
                  [GUEST_ORDER_ACCESS_TOKEN_KEY]: crypto.randomUUID(),
                  [GUEST_ORDER_ACCESS_CREATED_AT_KEY]: new Date().toISOString(),
                }
              : {}),
          }
        : sd;
    const insertRow: any = {
      user_id: userId,
      customer_id: null,
      customer_name: normalizeCustomerName(sd),
      contact: normalizeContact(sd),
      customer_phone: normalizeContact(sd),
      address: normalizeAddress(sd),
      shipping_method: input.shipping_method,
      shipping_region: input.shipping_region,
      shipping_details: shippingDetails,
      payment_method: input.payment_method,
      payment_status: "UNPAID",
      status: createAsPendingApproval ? "PENDING_APPROVAL" : "AWAITING_PAYMENT",
      order_status: createAsPendingApproval
        ? "PENDING_APPROVAL"
        : "AWAITING_PAYMENT",
      fulfillment_status: "PENDING",
      carrier: carrierFromShippingMethod(input.shipping_method),
      tracking_number: null,
      channel: String(input.channel ?? "WEB").trim() || "WEB",
      subtotal,
      shipping_fee: Number(input.fees.shipping_fee ?? 0),
      discount: 0,
      voucher_id: input.voucher_id ?? null,
      shipping_discount: shippingDiscount,
      discount_total: discountTotal,
      total,
      cop_fee: Number(input.fees.cop_fee ?? 0),
      lalamove_fee: Number(input.fees.lalamove_fee ?? 0),
      priority_fee: Number(input.fees.priority_fee ?? 0),
      priority_approved: false,
      insurance_selected: Boolean(input.insurance_selected),
      insurance_fee: Number(input.fees.insurance_fee ?? 0),
      payment_hold: false,
      inventory_deducted: !createAsPendingApproval,
      reserved_expires_at: paymentDeadline,
      payment_deadline: paymentDeadline,
      expires_at: paymentDeadline,
    };

    const {
      data: order,
      error: orderError,
      removedColumns,
    } = await insertSingleRowWithSchemaFallback(sb, "orders", insertRow, "*");
    if (orderError) throw orderError;
    if (removedColumns.length) {
      console.warn(
        "Inserted checkout order after dropping unknown columns:",
        removedColumns
      );
    }

    const itemsV2 = selectedLines.map((line) => {
      const unitPrice = lineUnitPrice(line);
      const imageUrl =
        Array.isArray(line.variant.product.image_urls) &&
        line.variant.product.image_urls.length
          ? String(line.variant.product.image_urls[0])
          : null;
      return {
        order_id: (order as any).id,
        item_id: line.variant.id,
        item_name: line.variant.product.title,
        image_url: imageUrl,
        variant_id: line.variant.id,
        price_each: unitPrice,
        qty: line.qty,
        line_total: unitPrice * line.qty,
        condition: line.variant.condition,
        issue_notes: line.variant.issue_notes,
      };
    });

    const itemsV1 = selectedLines.map((line) => {
      const unitPrice = lineUnitPrice(line);
      return {
        order_id: (order as any).id,
        variant_id: line.variant.id,
        unit_price: unitPrice,
        qty: line.qty,
        line_total: unitPrice * line.qty,
        condition: line.variant.condition,
        issue_notes: line.variant.issue_notes,
      };
    });

    const itemsLegacy = selectedLines.map((line) => {
      const unitPrice = lineUnitPrice(line);
      return {
        order_id: (order as any).id,
        product_id: line.variant.product.id,
        product_title: line.variant.product.title,
        variant_id: line.variant.id,
        unit_price: unitPrice,
        qty: line.qty,
        line_total: unitPrice * line.qty,
        condition: line.variant.condition,
        issue_notes: line.variant.issue_notes,
      };
    });

    let itemsError: any = null;
    {
      const result = await sb.from("order_items").insert(itemsV2);
      itemsError = result.error;
    }
    if (itemsError) {
      const result = await sb.from("order_items").insert(itemsV1);
      itemsError = result.error;
    }
    if (itemsError) {
      const result = await sb.from("order_items").insert(itemsLegacy);
      if (result.error) throw result.error;
    }

    if (!createAsPendingApproval) {
      try {
        await reserveInventoryForOrder(sb, selectedLines);
      } catch (error) {
        await sb.from("orders").delete().eq("id", String((order as any).id));
        throw error;
      }
    }

    if (!isGuestCheckout && userId) {
      const { error: clearError } = await sb
        .from("cart_items")
        .delete()
        .eq("user_id", userId)
        .in("id", lineIds);
      if (clearError) throw clearError;
    }

    try {
      await sendAdminOrderEventNotification(String((order as any).id), "order_created");
    } catch (err) {
      console.error("Admin push notification failed:", err);
    }

    const guestAccessToken =
      guestCheckoutAllowed &&
      shippingDetails &&
      typeof shippingDetails === "object"
        ? String((shippingDetails as Record<string, unknown>)[GUEST_ORDER_ACCESS_TOKEN_KEY] ?? "")
        : "";

    return NextResponse.json(
      {
        ok: true,
        order: guestAccessToken
          ? { ...(order as any), guest_access_token: guestAccessToken }
          : order,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to place order." },
      { status: 500 }
    );
  }
}
