export type SaleInput = {
  price: number;
  sale_price?: number | null;
  discount_percent?: number | null;
};

export type SaleResolution = {
  effectivePrice: number;
  hasSale: boolean;
};

export function resolveEffectivePrice(input: SaleInput): SaleResolution {
  const base = Number.isFinite(input.price) ? input.price : 0;
  const rawSale = Number(input.sale_price);
  if (Number.isFinite(rawSale) && rawSale > 0 && rawSale < base) {
    return { effectivePrice: rawSale, hasSale: true };
  }
  const rawDiscount = Number(input.discount_percent);
  if (Number.isFinite(rawDiscount) && rawDiscount > 0) {
    const pct = Math.min(rawDiscount, 100);
    const discounted = Math.max(0, Math.round(base * (1 - pct / 100)));
    return { effectivePrice: discounted, hasSale: discounted < base };
  }
  return { effectivePrice: base, hasSale: false };
}

export function getOptionPricing(option: {
  price: number;
  sale_price?: number | null;
  discount_percent?: number | null;
}) {
  return resolveEffectivePrice({
    price: Number(option.price ?? 0),
    sale_price: option.sale_price ?? null,
    discount_percent: option.discount_percent ?? null,
  });
}

export function hasSaleOption(option: {
  price: number;
  sale_price?: number | null;
  discount_percent?: number | null;
}) {
  return getOptionPricing(option).hasSale;
}

export function getProductEffectiveRange(product: {
  options: Array<{ price: number; sale_price?: number | null; discount_percent?: number | null }>;
}) {
  if (!product.options?.length) return { min: 0, max: 0, hasSale: false };
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let hasSale = false;
  for (const option of product.options) {
    const { effectivePrice, hasSale: optionSale } = getOptionPricing(option);
    min = Math.min(min, effectivePrice);
    max = Math.max(max, effectivePrice);
    if (optionSale) hasSale = true;
  }
  if (!Number.isFinite(min)) min = 0;
  return { min, max, hasSale };
}
