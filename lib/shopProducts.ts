import { conditionSortOrder } from "@/lib/conditions";
import { normalizeProductSpecialTags } from "@/lib/productTags";
import { resolveEffectivePrice } from "@/lib/pricing";
import type { ShopProduct } from "@/components/ProductCard";

export type VariantRow = {
  id: string;
  created_at?: string | null;
  condition: string | null;
  barcode?: string | null;
  issue_notes: string | null;
  issue_photo_urls: string[] | null;
  public_notes: string | null;
  ship_class: string | null;
  price: number | null;
  sale_price?: number | null;
  discount_percent?: number | null;
  qty: number | null;
  product: {
    id: string;
    title: string;
    brand: string | null;
    model: string | null;
    variation?: string | null;
    special_tags?: string[] | null;
    image_urls: string[] | null;
    is_active: boolean | null;
    created_at: string | null;
  } | null;
};

export type ProductRow = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  variation?: string | null;
  special_tags?: string[] | null;
  image_urls: string[] | null;
  is_active: boolean | null;
  created_at: string | null;
  product_variants: Array<{
    id: string;
    created_at?: string | null;
    condition: string | null;
    barcode?: string | null;
    issue_notes: string | null;
    issue_photo_urls: string[] | null;
    public_notes: string | null;
    ship_class: string | null;
    price: number | null;
    sale_price?: number | null;
    discount_percent?: number | null;
    qty: number | null;
  }>;
};

function pickNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function resolveLatestCreatedAt(
  ...values: Array<string | null | undefined>
): string | null {
  let latestValue: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    const time = Date.parse(raw);
    if (!Number.isFinite(time)) continue;
    if (time > latestTime) {
      latestTime = time;
      latestValue = raw;
    }
  }

  return latestValue;
}

export function collapseVariants(rows: VariantRow[]): ShopProduct[] {
  const map = new Map<string, ShopProduct>();

  for (const v of rows) {
    const p = v.product;
    if (!p) continue;
    if (p.is_active === false) continue;

    const key = p.id;
    const conditionRaw = String(v.condition ?? "sealed").toLowerCase();
    const condition = conditionRaw;
    const price = pickNumber(v.price, 0);
    const sale_price =
      Number.isFinite(Number((v as any)?.sale_price)) &&
      Number((v as any)?.sale_price) > 0
        ? Number((v as any)?.sale_price)
        : null;
    const discount_percent = Number.isFinite(Number((v as any)?.discount_percent))
      ? Number((v as any)?.discount_percent)
      : null;
    const pricing = resolveEffectivePrice({
      price,
      sale_price,
      discount_percent,
    });
    const qty = pickNumber(v.qty, 0);

    if (qty <= 0) continue;

    const image_urls = Array.isArray(p.image_urls)
      ? p.image_urls.filter(Boolean)
      : [];
    const image_url = (image_urls[0] as string | undefined) ?? null;

    const option = {
      id: v.id,
      condition,
      barcode: v.barcode ?? null,
      price,
      sale_price,
      discount_percent,
      qty,
      issue_notes: v.issue_notes ?? null,
      issue_photo_urls: Array.isArray(v.issue_photo_urls)
        ? v.issue_photo_urls
        : null,
      public_notes: v.public_notes ?? null,
      ship_class: v.ship_class ?? null,
      condition_raw: conditionRaw,
    };

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        title: p.title,
        brand: p.brand,
        model: p.model,
        variation: p.variation ?? null,
        special_tags: normalizeProductSpecialTags(p.special_tags),
        image_url,
        image_urls: image_urls.length ? image_urls : image_url ? [image_url] : [],
        minPrice: price,
        maxPrice: price,
        minEffectivePrice: pricing.effectivePrice,
        maxEffectivePrice: pricing.effectivePrice,
        hasSale: pricing.hasSale,
        options: [option],
        created_at: p.created_at ?? null,
        inventory_created_at: v.created_at ?? p.created_at ?? null,
        totalQty: qty,
        minQty: qty,
      });
    } else {
      existing.minPrice = Math.min(existing.minPrice, price);
      existing.maxPrice = Math.max(existing.maxPrice, price);
      existing.minEffectivePrice = Math.min(
        existing.minEffectivePrice ?? pricing.effectivePrice,
        pricing.effectivePrice
      );
      existing.maxEffectivePrice = Math.max(
        existing.maxEffectivePrice ?? pricing.effectivePrice,
        pricing.effectivePrice
      );
      existing.hasSale = Boolean(existing.hasSale || pricing.hasSale);
      existing.image_url = existing.image_url || image_url || null;
      if (image_urls.length) {
        const merged = new Set([...(existing.image_urls ?? []), ...image_urls]);
        existing.image_urls = Array.from(merged);
      }
      existing.totalQty = pickNumber(existing.totalQty, 0) + qty;
      existing.minQty = Math.min(pickNumber(existing.minQty, qty), qty);
      existing.options.push(option);
      existing.created_at = resolveLatestCreatedAt(existing.created_at, p.created_at);
      existing.inventory_created_at = resolveLatestCreatedAt(
        existing.inventory_created_at,
        v.created_at,
        p.created_at
      );
    }
  }

  return Array.from(map.values()).map((p) => ({
    ...p,
    options: p.options
      .slice()
      .sort(
        (a, b) =>
          conditionSortOrder(a.condition_raw) -
            conditionSortOrder(b.condition_raw) ||
          a.price - b.price
      ),
  }));
}

export function mapProductsToShopProducts(rows: ProductRow[]): ShopProduct[] {
  const products: ShopProduct[] = [];
  for (const p of rows) {
    if (!p || p.is_active === false) continue;
    const variants = Array.isArray(p.product_variants)
      ? p.product_variants
      : [];
    const options = variants
      .map((v) => {
        const qty = pickNumber(v.qty, 0);
        if (qty <= 0) return null;
        const conditionRaw = String(v.condition ?? "sealed").toLowerCase();
        const price = pickNumber(v.price, 0);
        const sale_price =
          Number.isFinite(Number((v as any)?.sale_price)) &&
          Number((v as any)?.sale_price) > 0
            ? Number((v as any)?.sale_price)
            : null;
        const discount_percent = Number.isFinite(
          Number((v as any)?.discount_percent)
        )
          ? Number((v as any)?.discount_percent)
          : null;
        return {
          id: v.id,
          condition: conditionRaw,
          barcode: v.barcode ?? null,
          price,
          sale_price,
          discount_percent,
          qty,
          issue_notes: v.issue_notes ?? null,
          issue_photo_urls: Array.isArray(v.issue_photo_urls)
            ? v.issue_photo_urls
            : null,
          public_notes: v.public_notes ?? null,
          ship_class: v.ship_class ?? null,
          condition_raw: conditionRaw,
        };
      })
      .filter(Boolean) as ShopProduct["options"];

    if (!options.length) continue;

    const image_urls = Array.isArray(p.image_urls)
      ? p.image_urls.filter(Boolean)
      : [];
    const image_url = (image_urls[0] as string | undefined) ?? null;
    const prices = options.map((o) => o.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const effectivePrices = options.map(
      (o) =>
        resolveEffectivePrice({
          price: o.price,
          sale_price: (o as any).sale_price ?? null,
          discount_percent: (o as any).discount_percent ?? null,
        }).effectivePrice
    );
    const minEffectivePrice = Math.min(...effectivePrices);
    const maxEffectivePrice = Math.max(...effectivePrices);
    const hasSale = options.some((o) =>
      resolveEffectivePrice({
        price: o.price,
        sale_price: (o as any).sale_price ?? null,
        discount_percent: (o as any).discount_percent ?? null,
      }).hasSale
    );
    const totalQty = options.reduce((sum, o) => sum + o.qty, 0);
    const minQty = options.reduce(
      (min, o) => Math.min(min, o.qty),
      options[0]?.qty ?? 0
    );
    const latestCreatedAt = resolveLatestCreatedAt(
      p.created_at,
      ...variants.map((variant) => variant.created_at)
    );
    const latestInventoryCreatedAt =
      resolveLatestCreatedAt(...variants.map((variant) => variant.created_at)) ??
      p.created_at;

    products.push({
      key: p.id,
      title: p.title,
      brand: p.brand,
      model: p.model,
      variation: p.variation ?? null,
      special_tags: normalizeProductSpecialTags(p.special_tags),
      image_url,
      image_urls: image_urls.length ? image_urls : image_url ? [image_url] : [],
      minPrice,
      maxPrice,
      minEffectivePrice,
      maxEffectivePrice,
      hasSale,
      options: options
        .slice()
        .sort(
          (a, b) =>
            conditionSortOrder(a.condition_raw) -
              conditionSortOrder(b.condition_raw) ||
            a.price - b.price
        ),
      created_at: p.created_at ?? latestCreatedAt,
      inventory_created_at: latestInventoryCreatedAt,
      totalQty,
      minQty,
    });
  }

  return products;
}
