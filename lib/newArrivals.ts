export const NEW_ARRIVAL_WINDOW_DAYS = 5;
export const NEW_ARRIVAL_WINDOW_MS =
  NEW_ARRIVAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function parseArrivalTime(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : null;
}

export function isNewArrivalCreatedAt(
  value: string | null | undefined,
  nowTs = Date.now()
) {
  const addedTs = parseArrivalTime(value);
  if (!addedTs) return false;
  return nowTs - addedTs <= NEW_ARRIVAL_WINDOW_MS;
}
