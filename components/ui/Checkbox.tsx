"use client";

import { cn } from "@/lib/utils";

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  className
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("inline-flex items-center gap-2 select-none", disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer", className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-accent-500"
      />
      {label ? <span className="text-sm text-white/80">{label}</span> : null}
    </label>
  );
}
