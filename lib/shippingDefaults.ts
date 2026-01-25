import { sanitizePhone } from "@/lib/phone";

export type JntDefaults = {
  recipient_name: string;
  contact_number: string;
  house_street_unit: string;
  barangay: string;
  city: string;
  province: string;
  postal_code: string;
  notes: string;
  name?: string;
  phone?: string;
  address?: string;
  address_line?: string;
  brgy?: string;
  [key: string]: unknown;
};

export type LbcDefaults = {
  first_name: string;
  last_name: string;
  contact_number: string;
  branch: string;
  city: string;
  notes: string;
  name?: string;
  phone?: string;
  branch_city?: string;
  branch_address?: string;
  [key: string]: unknown;
};

type LalamoveSlotInput = {
  date?: string | null;
  window?: string | null;
  window_key?: string | null;
  window_label?: string | null;
};

export type LalamoveDefaults = {
  recipient_name: string;
  recipient_phone: string;
  dropoff_address: string;
  notes: string;
  map_screenshot_url: string;
  map_url?: string | null;
  map_lat?: number | null;
  map_lng?: number | null;
  name?: string;
  phone?: string;
  map_image_url?: string;
  lalamove?: { date?: string | null; window_key?: string | null; window_label?: string | null };
  lalamove_slots?: LalamoveSlotInput[];
  availability?: { date: string; slot: string }[];
  [key: string]: unknown;
};

export type ShippingDefaults = {
  jnt: JntDefaults;
  lbc: LbcDefaults;
  lalamove: LalamoveDefaults;
  jt?: Record<string, unknown>;
  [key: string]: unknown;
};

const EMPTY_JNT: JntDefaults = {
  recipient_name: "",
  contact_number: "",
  house_street_unit: "",
  barangay: "",
  city: "",
  province: "",
  postal_code: "",
  notes: "",
};

const EMPTY_LBC: LbcDefaults = {
  first_name: "",
  last_name: "",
  contact_number: "",
  branch: "",
  city: "",
  notes: "",
};

const EMPTY_LALAMOVE: LalamoveDefaults = {
  recipient_name: "",
  recipient_phone: "",
  dropoff_address: "",
  notes: "",
  map_screenshot_url: "",
};

export const EMPTY_SHIPPING_DEFAULTS: ShippingDefaults = {
  jnt: { ...EMPTY_JNT },
  lbc: { ...EMPTY_LBC },
  lalamove: { ...EMPTY_LALAMOVE },
};

const LEGACY_JNT_KEYS = [
  "name",
  "phone",
  "address",
  "address_line",
  "brgy",
  "barangay",
];

const LEGACY_LBC_KEYS = ["name", "phone", "branch_city", "branch_address"];

const LEGACY_LALAMOVE_KEYS = ["name", "phone", "map_image_url"];

const JNT_KEYS = [
  "recipient_name",
  "contact_number",
  "house_street_unit",
  "barangay",
  "city",
  "province",
  "postal_code",
  "notes",
];

const LBC_KEYS = [
  "first_name",
  "last_name",
  "contact_number",
  "branch",
  "city",
  "notes",
];

const LALAMOVE_KEYS = [
  "recipient_name",
  "recipient_phone",
  "dropoff_address",
  "notes",
  "map_screenshot_url",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function stripKeys(
  source: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  const out = { ...source };
  keys.forEach((key) => {
    delete out[key];
  });
  return out;
}

function splitLbcName(
  fullName: string
): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace <= 0) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, lastSpace).trim(),
    lastName: trimmed.slice(lastSpace + 1).trim(),
  };
}

// Best-effort parse for legacy combined J&T addresses into separate fields.
function parseLegacyJntAddress(address: string): Partial<JntDefaults> {
  const trimmed = address.trim();
  if (!trimmed) return {};
  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return { house_street_unit: trimmed };

  const house_street_unit = parts[0];
  let barangay = "";
  let postal_code = "";
  const remainder: string[] = [];

  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i];
    if (!barangay && /^(brgy\.?|barangay)\b/i.test(part)) {
      barangay = part.replace(/^(brgy\.?|barangay)\s*/i, "").trim();
      continue;
    }
    const postalMatch = part.match(/\b\d{4}\b/);
    if (!postal_code && postalMatch) {
      postal_code = postalMatch[0];
      const cleaned = part.replace(postalMatch[0], "").trim();
      if (cleaned) remainder.push(cleaned);
      continue;
    }
    remainder.push(part);
  }

  let city = "";
  let province = "";
  if (remainder.length >= 2) {
    province = remainder[remainder.length - 1];
    city = remainder[remainder.length - 2];
  } else if (remainder.length === 1) {
    city = remainder[0];
  }

  return { house_street_unit, barangay, city, province, postal_code };
}

export function formatJntAddressLine(jnt: JntDefaults): string {
  return [jnt.house_street_unit, jnt.city, jnt.province, jnt.postal_code]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function normalizeShippingDefaults(raw: unknown): ShippingDefaults {
  const source = isRecord(raw) ? raw : {};
  const jntSource = isRecord(source.jnt) ? source.jnt : {};
  const jtSource = isRecord(source.jt) ? source.jt : {};

  const legacyAddress = normalizeString(
    (jntSource.house_street_unit as string | undefined) ??
      (jntSource.address_line as string | undefined) ??
      (jntSource.address as string | undefined) ??
      (jtSource.house_street_unit as string | undefined) ??
      (jtSource.address_line as string | undefined) ??
      (jtSource.address as string | undefined) ??
      ""
  );
  const parsedAddress = parseLegacyJntAddress(legacyAddress);

  const jntExtras = stripKeys(jntSource, [...JNT_KEYS, ...LEGACY_JNT_KEYS]);
  const jnt: JntDefaults = {
    ...jntExtras,
    recipient_name: normalizeString(
      (jntSource.recipient_name as string | undefined) ??
        (jntSource.name as string | undefined) ??
        (jtSource.recipient_name as string | undefined) ??
        (jtSource.name as string | undefined) ??
        ""
    ),
    contact_number: sanitizePhone(
      normalizeString(
        (jntSource.contact_number as string | undefined) ??
          (jntSource.phone as string | undefined) ??
          (jtSource.contact_number as string | undefined) ??
          (jtSource.phone as string | undefined) ??
          ""
      )
    ),
    house_street_unit: normalizeString(
      (jntSource.house_street_unit as string | undefined) ??
        (jtSource.house_street_unit as string | undefined) ??
        parsedAddress.house_street_unit ??
        ""
    ),
    barangay: normalizeString(
      (jntSource.barangay as string | undefined) ??
        (jntSource.brgy as string | undefined) ??
        (jtSource.barangay as string | undefined) ??
        (jtSource.brgy as string | undefined) ??
        parsedAddress.barangay ??
        ""
    ),
    city: normalizeString(
      (jntSource.city as string | undefined) ??
        (jtSource.city as string | undefined) ??
        parsedAddress.city ??
        ""
    ),
    province: normalizeString(
      (jntSource.province as string | undefined) ??
        (jtSource.province as string | undefined) ??
        parsedAddress.province ??
        ""
    ),
    postal_code: normalizeString(
      (jntSource.postal_code as string | undefined) ??
        (jtSource.postal_code as string | undefined) ??
        parsedAddress.postal_code ??
        ""
    ),
    notes: normalizeString(
      (jntSource.notes as string | undefined) ??
        (jtSource.notes as string | undefined) ??
        ""
    ),
  };

  const lbcSource = isRecord(source.lbc) ? source.lbc : {};
  const lbcExtras = stripKeys(lbcSource, [...LBC_KEYS, ...LEGACY_LBC_KEYS]);
  const rawLbcFirst = normalizeString(lbcSource.first_name);
  const rawLbcLast = normalizeString(lbcSource.last_name);
  const rawLbcName = normalizeString(lbcSource.name);
  const splitName =
    !rawLbcFirst && !rawLbcLast && rawLbcName
      ? splitLbcName(rawLbcName)
      : {
          firstName: rawLbcFirst,
          lastName: rawLbcLast,
        };

  const lbc: LbcDefaults = {
    ...lbcExtras,
    first_name: splitName.firstName,
    last_name: splitName.lastName,
    contact_number: sanitizePhone(
      normalizeString(
        (lbcSource.contact_number as string | undefined) ??
          (lbcSource.phone as string | undefined) ??
          ""
      )
    ),
    branch: normalizeString(lbcSource.branch),
    city: normalizeString(
      (lbcSource.city as string | undefined) ??
        (lbcSource.branch_city as string | undefined) ??
        (lbcSource.branch_address as string | undefined) ??
        ""
    ),
    notes: normalizeString(lbcSource.notes),
  };

  const lalamoveSource = isRecord(source.lalamove) ? source.lalamove : {};
  const lalamoveExtras = stripKeys(
    lalamoveSource,
    [...LALAMOVE_KEYS, ...LEGACY_LALAMOVE_KEYS]
  );
  const lalamove: LalamoveDefaults = {
    ...lalamoveExtras,
    recipient_name: normalizeString(
      (lalamoveSource.recipient_name as string | undefined) ??
        (lalamoveSource.name as string | undefined) ??
        ""
    ),
    recipient_phone: sanitizePhone(
      normalizeString(
        (lalamoveSource.recipient_phone as string | undefined) ??
          (lalamoveSource.phone as string | undefined) ??
          ""
      )
    ),
    dropoff_address: normalizeString(lalamoveSource.dropoff_address),
    notes: normalizeString(lalamoveSource.notes),
    map_screenshot_url: normalizeString(
      (lalamoveSource.map_screenshot_url as string | undefined) ??
        (lalamoveSource.map_image_url as string | undefined) ??
        ""
    ),
  };

  const rest = { ...source };
  delete rest.jnt;
  delete rest.jt;
  delete rest.lbc;
  delete rest.lalamove;

  return { ...rest, jnt, lbc, lalamove };
}

export function mergeShippingDefaults(
  raw: unknown,
  updates: ShippingDefaults
): ShippingDefaults {
  const base = isRecord(raw) ? raw : {};
  const normalizedUpdates = normalizeShippingDefaults(updates);

  const rest = { ...base };
  delete rest.jnt;
  delete rest.jt;
  delete rest.lbc;
  delete rest.lalamove;

  const jntBase = isRecord(base.jnt) ? base.jnt : {};
  const lbcBase = isRecord(base.lbc) ? base.lbc : {};
  const lalamoveBase = isRecord(base.lalamove) ? base.lalamove : {};

  const jntExtras = stripKeys(jntBase, [...JNT_KEYS, ...LEGACY_JNT_KEYS]);
  const lbcExtras = stripKeys(lbcBase, [...LBC_KEYS, ...LEGACY_LBC_KEYS]);
  const lalamoveExtras = stripKeys(
    lalamoveBase,
    [...LALAMOVE_KEYS, ...LEGACY_LALAMOVE_KEYS]
  );

  return {
    ...rest,
    jnt: { ...jntExtras, ...normalizedUpdates.jnt },
    lbc: { ...lbcExtras, ...normalizedUpdates.lbc },
    lalamove: { ...lalamoveExtras, ...normalizedUpdates.lalamove },
  };
}
