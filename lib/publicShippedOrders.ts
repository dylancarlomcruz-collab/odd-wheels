export type PublicShipmentSourceRow = {
  id: string;
  created_at?: string | null;
  customer_name?: string | null;
  shipping_method?: string | null;
  shipping_details?: unknown;
  shipping_status?: string | null;
  courier?: string | null;
  tracking_number?: string | null;
  shipped_at?: string | null;
  completed_at?: string | null;
  shipping_region?: string | null;
  address?: string | null;
  cop_fee?: number | null;
};

export type PublicShipmentAdminDraft = {
  customerName: string;
  locationLabel: string;
  shippingMethod: "LBC" | "JNT";
  packageCode: string;
  shippingStatus: "PENDING_SHIPPING" | "SHIPPED";
  trackingNumber: string;
  shippedAt: string;
  cop: boolean;
};

export type PublicShipmentStatus = "PENDING_SHIPPING" | "SHIPPED";

export type PublicShipmentView = {
  id: string;
  summary: string;
  maskedName: string;
  locationLabel: string;
  shippingMethod: "LBC" | "JNT";
  shippingMethodLabel: string;
  packageCode: string;
  packageLabel: string;
  shippingStatus: PublicShipmentStatus;
  trackingPreview: string | null;
  cop: boolean;
  referenceDate: string;
  shippedAt: string | null;
  completedAt: string | null;
  isOlderThanMonth: boolean;
  admin: PublicShipmentAdminDraft;
};

export const PUBLIC_LBC_PACKAGE_OPTIONS = [
  { value: "N_SAKTO", label: "LBC N-Sakto" },
  { value: "MINIBOX", label: "LBC Minibox" },
  { value: "SLIM_BOX", label: "LBC Slim Box" },
  { value: "SMALL_BOX", label: "LBC Small Box" },
  { value: "MEDIUM_APPROVAL", label: "LBC Medium Box (approval)" },
] as const;

export const PUBLIC_JNT_PACKAGE_OPTIONS = [
  { value: "SMALL", label: "J&T Small pouch" },
  { value: "MEDIUM", label: "J&T Medium pouch" },
] as const;

export function parseShipmentJson(raw: unknown) {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function normalizePublicShipmentMethod(
  method: string | null | undefined,
): "LBC" | "JNT" | null {
  const value = String(method ?? "").trim().toUpperCase();
  if (!value) return null;
  if (
    value === "JNT" ||
    value === "J&T" ||
    value === "J&T EXPRESS" ||
    value === "J&TEXPRESS" ||
    value === "JT"
  ) {
    return "JNT";
  }
  if (value === "LBC") return "LBC";
  return null;
}

export function normalizePublicShipmentStatus(
  status: string | null | undefined,
): PublicShipmentStatus | null {
  const value = String(status ?? "").trim().toUpperCase().replace(/_/g, " ");
  if (
    value === "PREPARING" ||
    value === "PREPARING TO SHIP" ||
    value === "TO SHIP" ||
    value === "PENDING SHIPMENT" ||
    value === "PENDING SHIPPING"
  ) {
    return "PENDING_SHIPPING";
  }
  if (value === "SHIPPED") return "SHIPPED";
  if (value === "COMPLETED" || value === "DELIVERED") return "SHIPPED";
  return null;
}

export function formatPublicShipmentStatusLabel(
  status: PublicShipmentStatus | null | undefined,
) {
  return status === "PENDING_SHIPPING" ? "Pending shipping" : "Shipped";
}

export function isPublicShipmentEligible(row: PublicShipmentSourceRow) {
  const details = parseShipmentJson(row.shipping_details);
  if (
    details.public_board_hidden === true ||
    String(details.public_board_deleted_at ?? "").trim()
  ) {
    return false;
  }
  const method =
    normalizePublicShipmentMethod(
      String(details.method ?? row.shipping_method ?? row.courier ?? ""),
    ) ?? normalizePublicShipmentMethod(row.courier);
  const status = normalizePublicShipmentStatus(row.shipping_status);
  return Boolean(method && status);
}

export function resolvePublicShipmentDate(row: PublicShipmentSourceRow) {
  const value =
    String(row.shipped_at ?? "").trim() ||
    String(row.completed_at ?? "").trim() ||
    String(row.created_at ?? "").trim();
  return value || new Date(0).toISOString();
}

export function isOlderThanDays(
  isoValue: string,
  days: number,
  now = new Date(),
) {
  const time = new Date(isoValue).getTime();
  if (!Number.isFinite(time)) return true;
  return time < now.getTime() - days * 24 * 60 * 60 * 1000;
}

function titleCaseWord(word: string) {
  if (!word) return word;
  if (word.length <= 3) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function titleCaseLocation(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(" ");
}

function simplifyLocation(value: string) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  const commaParts = cleaned
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (commaParts.length) {
    let candidate = commaParts[commaParts.length - 1];
    if (/^\d{4,5}$/.test(candidate) && commaParts.length > 1) {
      candidate = commaParts[commaParts.length - 2];
    }
    return titleCaseLocation(candidate);
  }

  const dashParts = cleaned
    .split(/\s*-\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (dashParts.length > 1) {
    return titleCaseLocation(dashParts[dashParts.length - 1]);
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length >= 2 && words[words.length - 1].toLowerCase() === "city") {
    return titleCaseLocation(words.slice(-2).join(" "));
  }
  return titleCaseLocation(words[words.length - 1]);
}

export function extractPublicLocationLabel(row: PublicShipmentSourceRow) {
  const details = parseShipmentJson(row.shipping_details);
  const candidates = [
    details.public_city_label,
    details.public_location,
    details.location_label,
    details.branch_city,
    details.city,
    details.province,
    row.shipping_region,
    details.full_address,
    details.address,
    details.dropoff_address,
    row.address,
    details.branch_name,
    details.branch,
  ];
  for (const candidate of candidates) {
    const simplified = simplifyLocation(String(candidate ?? ""));
    if (simplified) return simplified;
  }
  return "Unknown";
}

export function resolvePublicCustomerName(row: PublicShipmentSourceRow) {
  const details = parseShipmentJson(row.shipping_details);
  return String(
    details.receiver_name ?? details.name ?? row.customer_name ?? "",
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePublicCustomerName(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function maskToken(token: string) {
  const chars = token.split("");
  const letterIndices = chars
    .map((char, index) => (/[\p{L}\p{N}]/u.test(char) ? index : -1))
    .filter((index) => index >= 0);

  if (letterIndices.length <= 1) return token;

  const visible = new Set<number>();
  visible.add(letterIndices[0]);
  visible.add(letterIndices[letterIndices.length - 1]);
  if (letterIndices.length >= 5) {
    visible.add(letterIndices[Math.floor(letterIndices.length / 2)]);
  }

  return chars
    .map((char, index) => {
      if (!/[\p{L}\p{N}]/u.test(char)) return char;
      return visible.has(index) ? char : "*";
    })
    .join("");
}

export function maskCustomerName(value: string | null | undefined) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Unknown customer";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map(maskToken)
    .join(" ");
}

export function formatPublicPackageCode(
  method: "LBC" | "JNT",
  code: string | null | undefined,
) {
  const value = String(code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (method === "LBC") {
    if (value === "NSAKTO") return "N_SAKTO";
    if (value === "SLIMBOX") return "SLIM_BOX";
    if (value === "SMALLBOX") return "SMALL_BOX";
    return value || "MINIBOX";
  }
  return value || "SMALL";
}

export function formatPublicPackageLabel(
  method: "LBC" | "JNT",
  code: string | null | undefined,
) {
  const normalized = formatPublicPackageCode(method, code);
  if (method === "LBC") {
    return (
      PUBLIC_LBC_PACKAGE_OPTIONS.find((option) => option.value === normalized)?.label ??
      "LBC"
    );
  }
  return (
    PUBLIC_JNT_PACKAGE_OPTIONS.find((option) => option.value === normalized)?.label ??
    "J&T"
  );
}

export function getPublicTrackingPreview(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim();
  if (cleaned.length < 4) return cleaned || null;
  return `****${cleaned.slice(-4)}`;
}

function formatDateTimeLocalValue(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function buildPublicShipmentView(
  row: PublicShipmentSourceRow,
  now = new Date(),
): PublicShipmentView | null {
  const details = parseShipmentJson(row.shipping_details);
  const shippingMethod = normalizePublicShipmentMethod(
    String(details.method ?? row.shipping_method ?? row.courier ?? ""),
  );
  const shippingStatus = normalizePublicShipmentStatus(row.shipping_status);
  if (!shippingMethod || !shippingStatus) return null;

  const customerName = resolvePublicCustomerName(row);
  const locationLabel = extractPublicLocationLabel(row);
  const packageCode = formatPublicPackageCode(
    shippingMethod,
    String(details.package ?? details.package_size ?? details.pack ?? ""),
  );
  const packageLabel = formatPublicPackageLabel(shippingMethod, packageCode);
  const cop = shippingMethod === "LBC" && (
    Boolean(details.cop) || Number(row.cop_fee ?? 0) > 0
  );
  const maskedName = maskCustomerName(customerName);
  const referenceDate = resolvePublicShipmentDate(row);
  const summaryParts = [maskedName, locationLabel, packageLabel];
  if (cop) summaryParts.push("COP");

  return {
    id: row.id,
    summary: summaryParts.join(" - "),
    maskedName,
    locationLabel,
    shippingMethod,
    shippingMethodLabel: shippingMethod === "JNT" ? "J&T" : "LBC",
    packageCode,
    packageLabel,
    shippingStatus,
    trackingPreview: getPublicTrackingPreview(row.tracking_number),
    cop,
    referenceDate,
    shippedAt: row.shipped_at ?? null,
    completedAt: row.completed_at ?? null,
    isOlderThanMonth: isOlderThanDays(referenceDate, 30, now),
    admin: {
      customerName,
      locationLabel,
      shippingMethod,
      packageCode,
      shippingStatus,
      trackingNumber: String(row.tracking_number ?? "").trim(),
      shippedAt: formatDateTimeLocalValue(row.shipped_at ?? row.completed_at ?? row.created_at),
      cop,
    },
  };
}
