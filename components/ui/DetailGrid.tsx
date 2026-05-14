import * as React from "react";
import { cn } from "@/lib/utils";

export type DetailGridItemData = {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  valueClassName?: string;
  className?: string;
};

function hasRenderableValue(value: React.ReactNode) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function DetailGrid({
  items,
  className,
}: {
  items: DetailGridItemData[];
  className?: string;
}) {
  const visibleItems = items.filter((item) => hasRenderableValue(item.value));
  if (!visibleItems.length) return null;

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {visibleItems.map((item, index) => (
        <div
          key={typeof item.label === "string" ? `${item.label}-${index}` : index}
          className={cn("surface-subtle p-3 sm:p-3.5", item.className)}
        >
          <div className="text-[0.7rem] font-medium uppercase tracking-[0.13em] text-white/45">
            {item.label}
          </div>
          <div className={cn("mt-1 text-sm leading-6 text-white/90 break-words", item.valueClassName)}>
            {item.value}
          </div>
          {item.hint ? <div className="mt-1 text-xs text-white/55">{item.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}
