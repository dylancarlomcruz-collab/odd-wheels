export function normalizeBarcode(value: string) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}
