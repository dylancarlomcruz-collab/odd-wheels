export type VariantCondition =
  | "sealed"
  | "resealed"
  | "near_mint"
  | "unsealed"
  | "with_issues"
  | "sealed_blister"
  | "unsealed_blister"
  | "blistered";

const CONDITION_LABELS: Record<VariantCondition, string> = {
  sealed: "Sealed",
  resealed: "Resealed",
  near_mint: "Near Mint",
  unsealed: "Unsealed",
  with_issues: "With issues",
  sealed_blister: "Sealed blister",
  unsealed_blister: "Unsealed blister",
  blistered: "Blistered",
};

export function formatConditionLabel(
  value: string | null | undefined,
  options?: { upper?: boolean; shipClass?: string | null }
): string {
  const key = String(value ?? "").toLowerCase() as VariantCondition;
  const label = CONDITION_LABELS[key] ?? String(value ?? "-");
  const suffix =
    String(options?.shipClass ?? "").toUpperCase() === "DIORAMA"
      ? "Diorama"
      : null;
  const composed = suffix ? `${label} - ${suffix}` : label;
  return options?.upper ? composed.toUpperCase() : composed;
}

export function isBlisterCondition(value: string | null | undefined): boolean {
  return (
    value === "sealed_blister" ||
    value === "unsealed_blister" ||
    value === "blistered"
  );
}

export function conditionSortOrder(value: string | null | undefined): number {
  switch (value) {
    case "sealed":
      return 0;
    case "resealed":
      return 1;
    case "near_mint":
      return 2;
    case "sealed_blister":
      return 3;
    case "unsealed":
      return 4;
    case "unsealed_blister":
    case "blistered":
      return 5;
    case "with_issues":
      return 6;
    default:
      return 7;
  }
}
