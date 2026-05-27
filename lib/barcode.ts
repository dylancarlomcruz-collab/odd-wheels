export function normalizeBarcode(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/[\u0000-\u001F\u007F\s]+/g, "")
    .toUpperCase();
}
