import { NextResponse } from "next/server";
import { requireUserRequest } from "@/lib/api/auth";
import { insertSingleRowWithSchemaFallback } from "@/lib/supabase/insertWithSchemaFallback";
import { resolveEffectivePrice } from "@/lib/pricing";
import { protectorUnitFee } from "@/lib/addons";
import { sendAdminOrderEventNotification } from "@/lib/push/server";

const PAYMENT_WINDOW_MS = 12 * 60 * 60 * 1000;

type CreateOrderInput = {
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

function pickStr(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
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
    const authResult = await requireUserRequest(req);
    if ("error" in authResult) return authResult.error;

    const { sb, userId } = authResult;
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

    if (!input || !lineIds.length) {
      return NextResponse.json(
        { ok: false, error: "Cart lines and checkout details are required." },
        { status: 400 }
      );
    }

    const { data: cartRows, error: cartError } = await sb
      .from("cart_items")
      .select(
        "id,user_id,variant_id,qty,protector_selected,variant:product_variants(id,condition,issue_notes,public_notes,price,sale_price,discount_percent,qty,ship_class,allowed_couriers,allowed_lbc_packages,allowed_jnt_pouches,product:products(id,title,brand,model,image_urls))"
      )
      .eq("user_id", userId)
      .in("id", lineIds);

    if (cartError) throw cartError;

    const selectedLines = ((cartRows as any[]) ?? []).filter(
      (row) => row?.variant?.id && row?.variant?.product?.id
    );
    if (!selectedLines.length) {
      return NextResponse.json(
        { ok: false, error: "Selected cart items were not found." },
        { status: 404 }
      );
    }
    if (selectedLines.length !== lineIds.length) {
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
    const paymentDeadline = new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString();
    const insertRow: any = {
      user_id: userId,
      customer_id: null,
      customer_name: normalizeCustomerName(sd),
      contact: normalizeContact(sd),
      customer_phone: normalizeContact(sd),
      address: normalizeAddress(sd),
      shipping_method: input.shipping_method,
      shipping_region: input.shipping_region,
      shipping_details: sd,
      payment_method: input.payment_method,
      payment_status: "UNPAID",
      status: "AWAITING_PAYMENT",
      order_status: "AWAITING_PAYMENT",
      fulfillment_status: "PENDING",
      carrier: carrierFromShippingMethod(input.shipping_method),
      tracking_number: null,
      channel: "WEB",
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
      inventory_deducted: true,
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

    try {
      await reserveInventoryForOrder(sb, selectedLines);
    } catch (error) {
      await sb.from("orders").delete().eq("id", String((order as any).id));
      throw error;
    }

    const { error: clearError } = await sb
      .from("cart_items")
      .delete()
      .eq("user_id", userId)
      .in("id", lineIds);
    if (clearError) throw clearError;

    try {
      await sendAdminOrderEventNotification(String((order as any).id), "order_created");
    } catch (err) {
      console.error("Admin push notification failed:", err);
    }

    return NextResponse.json({ ok: true, order }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to place order." },
      { status: 500 }
    );
  }
}
