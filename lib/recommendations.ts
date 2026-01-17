export type ProductLite = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  min_price: number;
};

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function recommendSimilar(products: ProductLite[], target: ProductLite, limit = 6): ProductLite[] {
  const tTokens = new Set(tokenize(`${target.title} ${target.brand ?? ""} ${target.model ?? ""}`));
  const scored = products
    .filter((p) => p.id !== target.id)
    .map((p) => {
      const tokens = tokenize(`${p.title} ${p.brand ?? ""} ${p.model ?? ""}`);
      const overlap = tokens.reduce((acc, tok) => acc + (tTokens.has(tok) ? 1 : 0), 0);
      const brandBoost = target.brand && p.brand && target.brand.toLowerCase() === p.brand.toLowerCase() ? 2 : 0;
      const priceDiff = Math.abs((p.min_price ?? 0) - (target.min_price ?? 0));
      const priceScore = priceDiff <= (target.min_price * 0.2) ? 1 : 0; // within ~20%
      return { p, score: overlap + brandBoost + priceScore };
    })
    .sort((a, b) => b.score - a.score);

  return scored.filter((x) => x.score > 0).slice(0, limit).map((x) => x.p);
}
