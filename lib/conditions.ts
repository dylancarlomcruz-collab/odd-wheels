export type VariantCondition =
  | "sealed"
  | "unsealed"
  | "with_issues"
  | "diorama"
  | "sealed_blister"
  | "unsealed_blister"
  | "blistered";

const CONDITION_LABELS: Record<VariantCondition, string> = {
  sealed: "Sealed",
  unsealed: "Unsealed",
  with_issues: "With issues",
  diorama: "Diorama",
  sealed_blister: "Sealed blister",
  unsealed_blister: "Unsealed blister",
  blistered: "Blistered",
};

export function formatConditionLabel(
  value: string | null | undefined,
  options?: { upper?: boolean }
): string {
  const key = String(value ?? "").toLowerCase() as VariantCondition;
  const label = CONDITION_LABELS[key] ?? String(value ?? "-");
  return options?.upper ? label.toUpperCase() : label;
}

export function isBlisterCondition(value: string | null | undefined): boolean {
  return (
    value === "sealed_blister" ||
    value === "unsealed_blister" ||
    value === "blistered"
  );
}

export function isDioramaCondition(value: string | null | undefined): boolean {
  return value === "diorama";
}

export function conditionSortOrder(value: string | null | undefined): number {
  switch (value) {
    case "sealed":
      return 0;
    case "sealed_blister":
      return 1;
    case "unsealed":
      return 2;
    case "unsealed_blister":
    case "blistered":
      return 3;
    case "diorama":
      return 4;
    case "with_issues":
      return 5;
    default:
      return 6;
  }
}
