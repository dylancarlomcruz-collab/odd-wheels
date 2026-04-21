export type VariantCondition =
  | "sealed"
  | "resealed"
  | "near_mint"
  | "sealed_near_mint_box"
  | "sealed_near_mint_blister"
  | "sealed_not_mint_box"
  | "sealed_not_mint_blister"
  | "unsealed"
  | "unsealed_no_box"
  | "unsealed_no_acrylic"
  | "unsealed_near_mint_box"
  | "unsealed_near_mint_blister"
  | "wheelswapped"
  | "customized"
  | "with_issues"
  | "sealed_blister"
  | "unsealed_blister"
  | "blistered";

export const ALL_VARIANT_CONDITIONS: VariantCondition[] = [
  "sealed",
  "resealed",
  "near_mint",
  "sealed_near_mint_box",
  "sealed_not_mint_box",
  "sealed_blister",
  "sealed_near_mint_blister",
  "sealed_not_mint_blister",
  "unsealed",
  "unsealed_no_box",
  "unsealed_no_acrylic",
  "unsealed_near_mint_box",
  "unsealed_blister",
  "unsealed_near_mint_blister",
  "blistered",
  "wheelswapped",
  "customized",
  "with_issues",
];

const CONDITION_LABELS: Record<VariantCondition, string> = {
  sealed: "Sealed",
  resealed: "Resealed",
  near_mint: "Near Mint",
  sealed_near_mint_box: "Sealed - Near Mint Box",
  sealed_near_mint_blister: "Sealed - Near Mint Blister",
  sealed_not_mint_box: "Sealed - Not Mint Box",
  sealed_not_mint_blister: "Sealed - Not Mint Blister",
  unsealed: "Unsealed",
  unsealed_no_box: "Unsealed - No Box",
  unsealed_no_acrylic: "Unsealed - No Acrylic",
  unsealed_near_mint_box: "Unsealed - Near Mint Box",
  unsealed_near_mint_blister: "Unsealed - Near Mint Blister",
  wheelswapped: "Wheelswapped",
  customized: "Customized",
  with_issues: "With Issues",
  sealed_blister: "Sealed Blister",
  unsealed_blister: "Unsealed Blister",
  blistered: "Blistered",
};

export function formatConditionLabel(
  value: string | null | undefined,
  options?: { upper?: boolean; shipClass?: string | null }
): string {
  const key = String(value ?? "").toLowerCase() as VariantCondition;
  const label = CONDITION_LABELS[key] ?? String(value ?? "-");
  return options?.upper ? label.toUpperCase() : label;
}

export function isBlisterCondition(value: string | null | undefined): boolean {
  return (
    value === "sealed_blister" ||
    value === "sealed_near_mint_blister" ||
    value === "sealed_not_mint_blister" ||
    value === "unsealed_near_mint_blister" ||
    value === "unsealed_blister" ||
    value === "blistered"
  );
}

export function isNearMintCondition(value: string | null | undefined): boolean {
  return (
    value === "near_mint" ||
    value === "sealed_near_mint_box" ||
    value === "sealed_near_mint_blister" ||
    value === "unsealed_near_mint_box" ||
    value === "unsealed_near_mint_blister"
  );
}

export function isLoosePackagingCondition(
  value: string | null | undefined
): boolean {
  return value === "unsealed_no_box" || value === "unsealed_no_acrylic";
}

export function isNotMintCondition(value: string | null | undefined): boolean {
  return (
    value === "sealed_not_mint_box" || value === "sealed_not_mint_blister"
  );
}

export function isIssueCondition(value: string | null | undefined): boolean {
  return value === "with_issues" || isNotMintCondition(value);
}

export function supportsIssueDetailCondition(
  value: string | null | undefined
): boolean {
  return isIssueCondition(value) || isNearMintCondition(value);
}

export function conditionSortOrder(value: string | null | undefined): number {
  switch (value) {
    case "sealed":
      return 0;
    case "resealed":
      return 1;
    case "near_mint":
      return 2;
    case "sealed_near_mint_box":
      return 3;
    case "sealed_not_mint_box":
      return 4;
    case "sealed_blister":
      return 5;
    case "sealed_near_mint_blister":
      return 6;
    case "sealed_not_mint_blister":
      return 7;
    case "unsealed":
      return 8;
    case "unsealed_no_box":
      return 9;
    case "unsealed_no_acrylic":
      return 10;
    case "unsealed_near_mint_box":
      return 11;
    case "unsealed_blister":
      return 12;
    case "unsealed_near_mint_blister":
      return 13;
    case "blistered":
      return 14;
    case "wheelswapped":
      return 15;
    case "customized":
      return 16;
    case "with_issues":
      return 17;
    default:
      return 18;
  }
}
