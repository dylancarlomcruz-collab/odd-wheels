import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://psgc.gitlab.io/api";

async function fetchEndpoint(endpoint) {
  const res = await fetch(`${BASE_URL}/${endpoint}/`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function uniqueSorted(items) {
  return Array.from(new Set(items)).sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" })
  );
}

function asCode(value) {
  return typeof value === "string" ? value : "";
}

function normalizeBarangayName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "";
  if (/^brgy\b/i.test(trimmed)) {
    return `Brgy ${trimmed.replace(/^brgy\s*/i, "").trim()}`;
  }
  if (/^barangay\b/i.test(trimmed)) {
    return `Brgy ${trimmed.replace(/^barangay\s*/i, "").trim()}`;
  }
  return trimmed;
}

function indexByCode(items) {
  const map = new Map();
  for (const row of items) {
    const code = asCode(row?.code);
    const name = String(row?.name ?? "").trim();
    if (code && name) {
      map.set(code, name);
    }
  }
  return map;
}

function buildLocationLabel(barangay, middle, province) {
  return [barangay, middle, province].map((part) => part.trim()).filter(Boolean).join(" - ");
}

async function run() {
  const [regionsRaw, provincesRaw, citiesRaw, subMunicipalitiesRaw, barangaysRaw] =
    await Promise.all([
      fetchEndpoint("regions"),
      fetchEndpoint("provinces"),
      fetchEndpoint("cities-municipalities"),
      fetchEndpoint("sub-municipalities"),
      fetchEndpoint("barangays"),
    ]);

  const regionByCode = indexByCode(regionsRaw);
  const provinceByCode = indexByCode(provincesRaw);
  const cityByCode = indexByCode(citiesRaw);
  const subMunicipalityByCode = indexByCode(subMunicipalitiesRaw);

  const locationsMap = new Map();
  for (const row of barangaysRaw) {
    const barangay = normalizeBarangayName(row?.name);
    const cityCode = asCode(row?.cityCode) || asCode(row?.municipalityCode);
    const city = cityByCode.get(cityCode) ?? "";
    const districtCode = asCode(row?.subMunicipalityCode);
    const district = districtCode ? subMunicipalityByCode.get(districtCode) ?? "" : "";
    const provinceCode = asCode(row?.provinceCode);
    const regionCode = asCode(row?.regionCode);

    let province = provinceByCode.get(provinceCode) ?? "";
    if (!province) {
      if (regionCode === "130000000") {
        province = "Metro Manila";
      } else {
        province = regionByCode.get(regionCode) ?? "";
      }
    }

    if (!barangay || !city || !province) continue;

    const label = buildLocationLabel(barangay, district || city, province);
    if (!label) continue;

    if (!locationsMap.has(label)) {
      locationsMap.set(label, {
        label,
        barangay,
        city,
        province,
        district: district || null,
      });
    }
  }

  const locations = Array.from(locationsMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "en", { sensitivity: "base" })
  );

  const provinces = uniqueSorted(
    provincesRaw.map((row) => String(row?.name ?? "").trim()).filter(Boolean)
  );
  const cities = uniqueSorted(
    citiesRaw.map((row) => String(row?.name ?? "").trim()).filter(Boolean)
  );
  const barangays = uniqueSorted(
    barangaysRaw.map((row) => String(row?.name ?? "").trim()).filter(Boolean)
  );

  const outDir = path.join(process.cwd(), "public", "data");
  await mkdir(outDir, { recursive: true });

  await writeFile(
    path.join(outDir, "ph-provinces.json"),
    JSON.stringify(uniqueSorted(provinces), null, 2),
    "utf8"
  );
  await writeFile(
    path.join(outDir, "ph-cities.json"),
    JSON.stringify(uniqueSorted(cities), null, 2),
    "utf8"
  );
  await writeFile(
    path.join(outDir, "ph-barangays.json"),
    JSON.stringify(uniqueSorted(barangays), null, 2),
    "utf8"
  );
  await writeFile(
    path.join(outDir, "ph-barangay-locations.json"),
    JSON.stringify(locations, null, 2),
    "utf8"
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
