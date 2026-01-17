"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";

type Slot = "8-12" | "12-3" | "3-6" | "6-9";

export function LalamoveSchedulePicker({
  value,
  onChange,
  days = 7,
}: {
  value: string[]; // multi-select
  onChange: (v: string[]) => void;
  days?: number;
}) {
  const slots: Slot[] = ["8-12", "12-3", "3-6", "6-9"];
  const selected = new Set(value);

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const rows = Array.from({ length: days }).map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const label = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const iso = d.toISOString().slice(0, 10);
    return { iso, label };
  });

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  return (
    <div className="mt-4">
      <div className="text-sm font-medium mb-2">When can you receive?</div>
      <div className="grid grid-cols-5 gap-2 text-xs text-white/60 mb-2">
        <div />
        {slots.map((s) => (
          <div key={s} className="text-center">
            {s}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.iso} className="grid grid-cols-5 gap-2 items-center">
            <div className="text-xs text-white/60">{r.label}</div>
            {slots.map((s) => {
              const id = `${r.iso}|${s}`;
              const isOn = selected.has(id);
              return (
                <Button
                  key={id}
                  type="button"
                  variant={isOn ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => toggle(id)}
                  className="h-8"
                >
                  {isOn ? "Selected" : "Select"}
                </Button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-2 text-xs text-white/50">
        You can select multiple time slots.
      </div>
    </div>
  );
}
