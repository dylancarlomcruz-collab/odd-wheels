import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://psgc.gitlab.io/api";

async function fetchNames(endpoint) {
  const res = await fetch(`${BASE_URL}/${endpoint}/`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${res.status}`);
  }
  const data = await res.json();
  return (Array.isArray(data) ? data : [])
    .map((row) => String(row?.name ?? "").trim())
    .filter(Boolean);
}

function uniqueSorted(items) {
  return Array.from(new Set(items)).sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" })
  );
}

async function run() {
  const [provinces, cities, barangays] = await Promise.all([
    fetchNames("provinces"),
    fetchNames("cities-municipalities"),
    fetchNames("barangays"),
  ]);

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
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
