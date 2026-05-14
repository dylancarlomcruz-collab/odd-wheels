export type ReleaseState = "live" | "scheduled" | "released" | "draft";

type ReleaseVariantLike = {
  qty?: number | null;
  release_at?: string | null;
};

type ReleaseProductLike = {
  is_active?: boolean | null;
  product_variants?: ReleaseVariantLike[] | null;
};

export function isScheduledRelease(releaseAt?: string | null, nowTs = Date.now()) {
  if (!releaseAt) return false;
  const ts = Date.parse(releaseAt);
  return Number.isFinite(ts) && ts > nowTs;
}

export function isReleased(releaseAt?: string | null, nowTs = Date.now()) {
  if (!releaseAt) return true;
  const ts = Date.parse(releaseAt);
  return Number.isFinite(ts) && ts <= nowTs;
}

export function formatReleaseDateTime(releaseAt?: string | null) {
  if (!releaseAt) return "";
  const date = new Date(releaseAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function toDatetimeLocalValue(releaseAt?: string | null) {
  if (!releaseAt) return "";
  const date = new Date(releaseAt);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function datetimeLocalToIso(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function getReleaseBadgeClass(state: ReleaseState) {
  switch (state) {
    case "live":
      return "bg-emerald-500/18 border-emerald-400/45 text-emerald-100";
    case "scheduled":
      return "bg-amber-500/18 border-amber-400/45 text-amber-100";
    case "released":
      return "bg-sky-500/18 border-sky-400/45 text-sky-100";
    default:
      return "bg-white/5 border-white/10 text-white/72";
  }
}

export function getVariantReleaseState(
  variant: ReleaseVariantLike,
  nowTs = Date.now()
): ReleaseState {
  const qty = Number(variant.qty ?? 0);
  const hasQty = qty > 0;
  if (isScheduledRelease(variant.release_at, nowTs) && hasQty) return "scheduled";
  if (variant.release_at && isReleased(variant.release_at, nowTs) && hasQty) {
    return "released";
  }
  if (hasQty) return "live";
  return "draft";
}

export function getVariantReleaseLabel(
  variant: ReleaseVariantLike,
  nowTs = Date.now()
) {
  const state = getVariantReleaseState(variant, nowTs);
  if (state === "scheduled") {
    return `Scheduled for ${formatReleaseDateTime(variant.release_at)}`;
  }
  if (state === "released") {
    return `Released ${formatReleaseDateTime(variant.release_at)}`;
  }
  if (state === "live") return "Live";
  return "Draft";
}

export function getProductReleaseSummary(
  product: ReleaseProductLike,
  nowTs = Date.now()
) {
  const variants = Array.isArray(product.product_variants)
    ? product.product_variants
    : [];
  const inStockVariants = variants.filter((variant) => Number(variant.qty ?? 0) > 0);
  const liveVariants = inStockVariants.filter((variant) =>
    isReleased(variant.release_at, nowTs)
  );
  const scheduledVariants = inStockVariants.filter((variant) =>
    isScheduledRelease(variant.release_at, nowTs)
  );
  const releasedVariants = inStockVariants.filter(
    (variant) => variant.release_at && isReleased(variant.release_at, nowTs)
  );

  const nextScheduledAt = scheduledVariants
    .map((variant) => variant.release_at)
    .filter(Boolean)
    .sort()[0] ?? null;
  const latestReleasedAt = releasedVariants
    .map((variant) => variant.release_at)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] ?? null;

  if (liveVariants.length > 0 && product.is_active !== false) {
    return {
      state: "live" as const,
      label: "Live",
      releaseAt: latestReleasedAt,
    };
  }

  if (scheduledVariants.length > 0) {
    return {
      state: "scheduled" as const,
      label: nextScheduledAt
        ? `Scheduled for ${formatReleaseDateTime(nextScheduledAt)}`
        : "Scheduled",
      releaseAt: nextScheduledAt,
    };
  }

  if (latestReleasedAt) {
    return {
      state: "released" as const,
      label: `Released ${formatReleaseDateTime(latestReleasedAt)}`,
      releaseAt: latestReleasedAt,
    };
  }

  return {
    state: "draft" as const,
    label: "Draft",
    releaseAt: null,
  };
}
