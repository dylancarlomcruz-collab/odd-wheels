export function formatPHP(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
}

export function clampNumber(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
