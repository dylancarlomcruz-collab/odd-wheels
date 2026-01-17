"use client";

import * as React from "react";
import { useBrandTabs } from "@/hooks/useBrandTabs";
import { cn } from "@/lib/utils";

export function BrandTabs({
  value,
  onChange
}: {
  value: string;
  onChange: (brand: string) => void;
}) {
  const { brands } = useBrandTabs();
  const tabs = [{ id: "all", name: "All" }, ...brands.map((b) => ({ id: b.name, name: b.name }))];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "whitespace-nowrap rounded-full border px-4 py-2 text-sm transition",
              active
                ? "border-accent-500/40 bg-accent-500/15 text-accent-900 dark:text-accent-100"
                : "border-white/10 bg-paper/5 text-white/70 hover:bg-paper/10"
            )}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

