export type PublicShipmentSourceRow = {
  id: string;
  created_at?: string | null;
  customer_name?: string | null;
  status?: string | null;
  order_status?: string | null;
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
  scheduledShipAt: string;
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
  trackingNumber: string | null;
  trackingPreview: string | null;
  estimatedDeliveryLabel: string | null;
  shipmentDateLabel: string;
  scheduledShipAt: string | null;
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

const MANILA_TIME_ZONE = "Asia/Manila";

export function isPublicShipmentEligible(row: PublicShipmentSourceRow) {
  const details = parseShipmentJson(row.shipping_details);
  const orderLifecycleStatus = String(row.status ?? "")
    .trim()
    .toUpperCase();
  const orderStatus = String(row.order_status ?? "")
    .trim()
    .toUpperCase();
  if (
    details.public_board_hidden === true ||
    String(details.public_board_deleted_at ?? "").trim() ||
    orderLifecycleStatus === "CANCELLED" ||
    orderLifecycleStatus === "VOIDED" ||
    orderStatus === "CANCELLED" ||
    orderStatus === "VOIDED"
  ) {
    return false;
  }
  const method =
    normalizePublicShipmentMethod(
      String(details.method ?? row.shipping_method ?? row.courier ?? ""),
    ) ?? normalizePublicShipmentMethod(row.courier);
  const shipmentStatus = normalizePublicShipmentStatus(row.shipping_status);
  return Boolean(method && shipmentStatus);
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
  return token
    .split("")
    .map((char) => (/[\p{L}\p{N}]/u.test(char) ? "*" : char))
    .join("");
}

export function maskCustomerName(value: string | null | undefined) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Unknown customer";
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? cleaned;
  return [parts[0], ...parts.slice(1).map(maskToken)].join(" ");
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

type PublicShipmentZone =
  | "NCR"
  | "LUZON"
  | "VISAYAS"
  | "MINDANAO"
  | "PUERTO_PRINCESA"
  | "BATANES"
  | "CORON"
  | "BICOL"
  | "ISLAND";

function normalizePublicLocationSearchValue(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function publicLocationIncludes(
  normalizedValue: string,
  terms: readonly string[],
) {
  return terms.some((term) => normalizedValue.includes(term));
}

export function resolvePublicShipmentZone(
  locationLabel: string | null | undefined,
): PublicShipmentZone | null {
  const normalizedValue = normalizePublicLocationSearchValue(locationLabel);
  if (!normalizedValue) return null;

  if (
    publicLocationIncludes(normalizedValue, [
      "puerto princesa",
      "palawan",
    ])
  ) {
    return "PUERTO_PRINCESA";
  }

  if (publicLocationIncludes(normalizedValue, ["batanes", "basco"])) {
    return "BATANES";
  }

  if (publicLocationIncludes(normalizedValue, ["coron"])) {
    return "CORON";
  }

  if (
    publicLocationIncludes(normalizedValue, [
      "ncr",
      "metro manila",
      "manila",
      "quezon city",
      "makati",
      "pasay",
      "pasig",
      "taguig",
      "paranaque",
      "muntinlupa",
      "las pinas",
      "marikina",
      "mandaluyong",
      "caloocan",
      "malabon",
      "navotas",
      "valenzuela",
      "san juan",
      "pateros",
    ])
  ) {
    return "NCR";
  }

  if (
    publicLocationIncludes(normalizedValue, [
      "albay",
      "camarines norte",
      "camarines sur",
      "catanduanes",
      "masbate",
      "sorsogon",
      "naga",
      "legazpi",
      "bicol",
    ])
  ) {
    return "BICOL";
  }

  if (
    publicLocationIncludes(normalizedValue, [
      "cebu",
      "iloilo",
      "bacolod",
      "negros",
      "bohol",
      "leyte",
      "samar",
      "ormoc",
      "tacloban",
      "dumaguete",
      "siquijor",
      "aklan",
      "capiz",
      "antique",
      "guimaras",
      "biliran",
      "visayas",
    ])
  ) {
    return "VISAYAS";
  }

  if (
    publicLocationIncludes(normalizedValue, [
      "davao",
      "cagayan de oro",
      "general santos",
      "gensan",
      "zamboanga",
      "butuan",
      "bukidnon",
      "cotabato",
      "surigao",
      "agusan",
      "dipolog",
      "pagadian",
      "tagum",
      "valencia",
      "iligan",
      "ozamiz",
      "malaybalay",
      "mindanao",
    ])
  ) {
    return "MINDANAO";
  }

  return "LUZON";
}

const PUBLIC_LBC_NCR_ETA: Record<
  Exclude<PublicShipmentZone, "ISLAND">,
  readonly [number, number]
> = {
  NCR: [1, 3],
  LUZON: [2, 4],
  VISAYAS: [4, 7],
  MINDANAO: [6, 9],
  PUERTO_PRINCESA: [6, 8],
  BATANES: [30, 30],
  CORON: [7, 11],
  BICOL: [4, 6],
};

const PUBLIC_JNT_MNL_ETA: Record<PublicShipmentZone, readonly [number, number]> = {
  NCR: [1, 2],
  LUZON: [1, 2],
  VISAYAS: [3, 4],
  MINDANAO: [3, 4],
  PUERTO_PRINCESA: [5, 6],
  BATANES: [5, 6],
  CORON: [5, 6],
  BICOL: [1, 2],
  ISLAND: [5, 6],
};

function getManilaDateParts(value: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  return { year, month, day };
}

function toManilaCalendarDate(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const { year, month, day } = getManilaDateParts(date);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addCalendarDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getManilaWeekday(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIME_ZONE,
    weekday: "short",
  }).format(value);
}

function addTransitDays(
  shippedDate: Date,
  days: number,
  options?: { skipSunday?: boolean },
) {
  if (days <= 0) return shippedDate;
  let cursor = new Date(shippedDate);
  let remaining = days;
  while (remaining > 0) {
    cursor = addCalendarDays(cursor, 1);
    if (options?.skipSunday && getManilaWeekday(cursor) === "Sun") {
      continue;
    }
    remaining -= 1;
  }
  return cursor;
}

function formatManilaMonthDay(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA_TIME_ZONE,
    month: "short",
    day: "numeric",
  }).format(value);
}

function formatManilaMonthDayYear(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatManilaDateTime(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDeliveryDateRange(start: Date, end: Date) {
  const startParts = getManilaDateParts(start);
  const endParts = getManilaDateParts(end);
  if (
    startParts.year === endParts.year &&
    startParts.month === endParts.month &&
    startParts.day === endParts.day
  ) {
    return `Expect to receive by ${formatManilaMonthDayYear(end)}`;
  }
  if (
    startParts.year === endParts.year &&
    startParts.month === endParts.month
  ) {
    return `Expect to receive by ${
      new Intl.DateTimeFormat("en-PH", {
        timeZone: MANILA_TIME_ZONE,
        month: "short",
        day: "numeric",
      }).format(start)
    }-${endParts.day}`;
  }
  return `Expect to receive by ${formatManilaMonthDay(start)}-${formatManilaMonthDayYear(end)}`;
}

function resolvePublicEtaRange(
  shippingMethod: "LBC" | "JNT",
  locationLabel: string | null | undefined,
) {
  const zone = resolvePublicShipmentZone(locationLabel);
  if (!zone) return null;
  return shippingMethod === "LBC"
    ? PUBLIC_LBC_NCR_ETA[zone === "ISLAND" ? "LUZON" : zone]
    : PUBLIC_JNT_MNL_ETA[
        zone === "PUERTO_PRINCESA" ||
        zone === "BATANES" ||
        zone === "CORON"
          ? "ISLAND"
          : zone
      ];
}

export function getPublicEstimatedDeliveryLabel(
  shippingMethod: "LBC" | "JNT",
  locationLabel: string | null | undefined,
  shippedAt: string | null | undefined,
) {
  const eta = resolvePublicEtaRange(shippingMethod, locationLabel);
  const shippedDate = toManilaCalendarDate(shippedAt);
  if (!eta || !shippedDate) return null;
  const skipSunday = shippingMethod === "LBC";
  const startDate = addTransitDays(shippedDate, eta[0], { skipSunday });
  const endDate = addTransitDays(shippedDate, eta[1], { skipSunday });
  return formatDeliveryDateRange(startDate, endDate);
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

function formatDateLocalValue(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveScheduledShipAt(details: Record<string, unknown>) {
  return (
    String(
      details.public_scheduled_ship_at ??
        details.scheduled_ship_at ??
        details.ship_on ??
        "",
    ).trim() || null
  );
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
  const summaryParts = [maskedName, shippingMethod === "JNT" ? "J&T" : "LBC"];
  const shippedAt = row.shipped_at ?? null;
  const scheduledShipAt = resolveScheduledShipAt(details);
  const shippedReferenceDate = row.shipped_at ?? row.completed_at ?? row.created_at ?? null;
  const estimatedDeliveryLabel =
    shippingStatus === "SHIPPED"
      ? getPublicEstimatedDeliveryLabel(
          shippingMethod,
          locationLabel,
          shippedReferenceDate,
        )
      : null;
  const shipmentDateLabel =
    shippingStatus === "SHIPPED"
      ? `Shipped on ${formatManilaDateTime(shippedReferenceDate ?? referenceDate)}`
      : `Pending since ${formatManilaDateTime(referenceDate)}`;

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
    trackingNumber: String(row.tracking_number ?? "").trim() || null,
    trackingPreview: getPublicTrackingPreview(row.tracking_number),
    estimatedDeliveryLabel,
    shipmentDateLabel,
    scheduledShipAt,
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
      scheduledShipAt: formatDateLocalValue(scheduledShipAt),
      cop,
    },
  };
}
