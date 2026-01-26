const GUEST_SESSION_KEY = "oddwheels:guest-session";

function fallbackUuid() {
  const hex = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256)
  );
  hex[6] = (hex[6] & 0x0f) | 0x40; // version 4
  hex[8] = (hex[8] & 0x3f) | 0x80; // variant 10
  const b = hex.map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${b.slice(0, 8)}-${b.slice(8, 12)}-${b.slice(12, 16)}-${b.slice(
    16,
    20
  )}-${b.slice(20)}`;
}

export function getOrCreateGuestSessionId(): string | null {
  if (typeof window === "undefined") return null;
  let existing = window.localStorage.getItem(GUEST_SESSION_KEY);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : fallbackUuid();
  window.localStorage.setItem(GUEST_SESSION_KEY, next);
  return next;
}
