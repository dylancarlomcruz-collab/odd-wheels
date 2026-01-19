const RECENT_VIEWS_KEY = "oddwheels:recent_views";
const MAX_RECENT = 18;

type RecentEntry = { id: string; ts: number };

function parseEntries(raw: string | null): RecentEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<string | RecentEntry>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (typeof entry === "string") {
          return { id: entry, ts: Date.now() };
        }
        if (entry && typeof entry === "object") {
          const id = String((entry as RecentEntry).id ?? "").trim();
          const ts = Number((entry as RecentEntry).ts ?? Date.now());
          return id ? { id, ts } : null;
        }
        return null;
      })
      .filter(Boolean) as RecentEntry[];
  } catch {
    return [];
  }
}

export function recordRecentView(productId: string) {
  if (typeof window === "undefined") return;
  const id = String(productId || "").trim();
  if (!id) return;
  try {
    const list = parseEntries(window.localStorage.getItem(RECENT_VIEWS_KEY));
    const next: RecentEntry[] = [
      { id, ts: Date.now() },
      ...list.filter((item) => item.id !== id),
    ].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function readRecentViewEntries(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  return parseEntries(window.localStorage.getItem(RECENT_VIEWS_KEY));
}

export function readRecentViews() {
  return readRecentViewEntries().map((entry) => entry.id);
}
