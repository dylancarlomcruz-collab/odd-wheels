export const POS_HANDOFF_STORAGE_PREFIX = "pos-handoff:";

export type PosHandoffItem = {
  variant_id: string;
  qty: number;
  title?: string;
  image_url?: string | null;
  condition?: string | null;
  unit_price?: number | null;
  product_id?: string | null;
  barcode?: string | null;
};

export type PosHandoffCustomer = {
  id: string | null;
  name: string;
  phone: string;
};

export type PosHandoffPayload = {
  source: "admin-carts";
  created_at: string;
  customer: PosHandoffCustomer;
  items: PosHandoffItem[];
};

export function createPosHandoffId(prefix = "handoff") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`;
}

export function makePosHandoffStorageKey(handoffId: string) {
  return `${POS_HANDOFF_STORAGE_PREFIX}${handoffId}`;
}

export function parsePosHandoffPayload(raw: string | null): PosHandoffPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PosHandoffPayload> | null;
    if (!parsed || typeof parsed !== "object") return null;

    const source = parsed.source === "admin-carts" ? "admin-carts" : null;
    if (!source) return null;

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems
      .map((item: any) => ({
        variant_id: String(item?.variant_id ?? "").trim(),
        qty: Math.max(1, Math.round(Number(item?.qty ?? 0))),
        title:
          typeof item?.title === "string" && item.title.trim().length
            ? item.title.trim()
            : undefined,
        image_url:
          typeof item?.image_url === "string" && item.image_url.trim().length
            ? item.image_url.trim()
            : null,
        condition:
          typeof item?.condition === "string" && item.condition.trim().length
            ? item.condition.trim()
            : null,
        unit_price: Number.isFinite(Number(item?.unit_price))
          ? Math.max(0, Number(item.unit_price))
          : null,
        product_id:
          typeof item?.product_id === "string" && item.product_id.trim().length
            ? item.product_id.trim()
            : null,
        barcode:
          typeof item?.barcode === "string" && item.barcode.trim().length
            ? item.barcode.trim()
            : null,
      }))
      .filter((item) => item.variant_id.length > 0 && Number.isFinite(item.qty));
    if (!items.length) return null;

    const customerRaw = parsed.customer as Partial<PosHandoffCustomer> | undefined;
    const customer: PosHandoffCustomer = {
      id: typeof customerRaw?.id === "string" && customerRaw.id.trim() ? customerRaw.id : null,
      name: typeof customerRaw?.name === "string" ? customerRaw.name.trim() : "",
      phone: typeof customerRaw?.phone === "string" ? customerRaw.phone.trim() : "",
    };

    const created_at =
      typeof parsed.created_at === "string" && parsed.created_at.trim()
        ? parsed.created_at
        : new Date().toISOString();

    return { source, created_at, customer, items };
  } catch {
    return null;
  }
}
