import type { ShopProduct } from "@/components/ProductCard";
import { isBlisterCondition } from "@/lib/conditions";
import { buildProductSearchText } from "@/lib/search";

export const SHOP_CATEGORY_OPTIONS = [
  { key: "boxed-truescales", label: "Boxed truescales" },
  { key: "tomicas", label: "Tomicas" },
  { key: "hot-wheels", label: "Hot Wheels" },
  { key: "trucks", label: "Trucks" },
  { key: "dioramas", label: "Figures & Dioramas" },
  { key: "truescales", label: "Truescales" },
  { key: "blistered", label: "Blistered" },
] as const;

const BOXED_TRUESCALES_BRANDS = new Set([
  "minigt",
  "kaidohouse",
  "kaido",
  "bmc",
  "bmcreations",
  "poprace",
]);
const TOMICA_BRANDS = new Set([
  "tomica",
  "tlvn",
  "tlv",
  "tomicalimitedvintage",
  "tomicalimitedvintageneo",
]);
const HOT_WHEELS_BRANDS = ["hotwheels", "hotwheel"];
const TRUCK_KEYWORDS = [
  "truck",
  "trucks",
  "pickup",
  "hauler",
  "semi",
  "tractor",
  "rig",
  "lorry",
];

function normalizeBrandKey(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function matchesKeyword(text: string, keyword: string) {
  const padded = ` ${text} `;
  return padded.includes(` ${keyword} `);
}

function matchesAnyKeyword(text: string, keywords: readonly string[]) {
  for (const keyword of keywords) {
    if (matchesKeyword(text, keyword)) return true;
  }
  return false;
}

export function matchesShopCategory(product: ShopProduct, category: string) {
  const brandKey = normalizeBrandKey(product.brand);
  const text = buildProductSearchText(product);

  switch (category) {
    case "boxed-truescales":
      return BOXED_TRUESCALES_BRANDS.has(brandKey);
    case "tomicas":
      return TOMICA_BRANDS.has(brandKey);
    case "hot-wheels":
      return HOT_WHEELS_BRANDS.some((key) => brandKey.includes(key));
    case "trucks":
      return matchesAnyKeyword(text, TRUCK_KEYWORDS);
    case "dioramas":
      return (
        matchesKeyword(text, "diorama") ||
        (product.options ?? []).some((opt) => {
          const shipClass = String(opt.ship_class ?? "").toUpperCase();
          return shipClass === "FIGURES_DIORAMA" || shipClass === "DIORAMA";
        })
      );
    case "truescales":
      if (brandKey.includes("inno64")) {
        return false;
      }
      return (product.options ?? []).some((opt) => {
        const shipClass = String(opt.ship_class ?? "").toUpperCase();
        return shipClass === "ACRYLIC_TRUE_SCALE";
      });
    case "blistered":
      return (product.options ?? []).some((opt) =>
        isBlisterCondition(opt.condition_raw)
      );
    default:
      return true;
  }
}
