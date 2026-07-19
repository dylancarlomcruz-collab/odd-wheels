const GUEST_ORDER_ACCESS_KEY = "oddwheels:guest-order-access";
const GUEST_ORDER_ACCESS_EVENT = "oddwheels:guest-order-access-updated";

export type GuestOrderAccess = {
  orderId: string;
  accessToken: string;
  savedAt: number;
};

function normalizeGuestOrderAccess(
  value: Partial<GuestOrderAccess> | null | undefined
): GuestOrderAccess | null {
  const orderId = String(value?.orderId ?? "").trim();
  const accessToken = String(value?.accessToken ?? "").trim();
  const savedAt = Number(value?.savedAt ?? Date.now());
  if (!orderId || !accessToken) return null;
  return {
    orderId,
    accessToken,
    savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
  };
}

function emitGuestOrderAccessUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GUEST_ORDER_ACCESS_EVENT));
}

export function saveGuestOrderAccess(orderId: string, accessToken: string) {
  if (typeof window === "undefined") return;
  const next = normalizeGuestOrderAccess({
    orderId,
    accessToken,
    savedAt: Date.now(),
  });
  if (!next) return;
  try {
    window.localStorage.setItem(GUEST_ORDER_ACCESS_KEY, JSON.stringify(next));
    emitGuestOrderAccessUpdated();
  } catch {
    // ignore
  }
}

export function readGuestOrderAccess(): GuestOrderAccess | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GUEST_ORDER_ACCESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestOrderAccess>;
    return normalizeGuestOrderAccess(parsed);
  } catch {
    return null;
  }
}

export function clearGuestOrderAccess() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_ORDER_ACCESS_KEY);
    emitGuestOrderAccessUpdated();
  } catch {
    // ignore
  }
}

export function guestOrderHref(value: GuestOrderAccess | null | undefined) {
  const normalized = normalizeGuestOrderAccess(value);
  if (!normalized) return null;
  return `/orders/${encodeURIComponent(
    normalized.orderId
  )}?access=${encodeURIComponent(normalized.accessToken)}`;
}

export { GUEST_ORDER_ACCESS_EVENT };
