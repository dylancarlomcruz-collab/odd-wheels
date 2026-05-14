import * as React from "react";
import { cn } from "@/lib/utils";

type StatCardProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ElementType;
  hint?: React.ReactNode;
  active?: boolean;
  valueClassName?: string;
};

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  active = false,
  valueClassName,
  className,
  type,
  ...props
}: StatCardProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "surface-panel w-full p-4 text-left transition hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/45",
        active ? "border-white/22 bg-white/[0.045]" : "",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.72rem] font-medium uppercase tracking-[0.13em] text-white/48">
            {label}
          </div>
          <div className={cn("mt-2 text-2xl font-semibold tracking-[-0.03em] text-white", valueClassName)}>
            {value}
          </div>
          {hint ? <div className="mt-1 text-sm text-white/56">{hint}</div> : null}
        </div>
        {Icon ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 text-white/72">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
    </button>
  );
}
