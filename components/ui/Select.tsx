"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Select({ className, label, hint, error, children, ...props }: SelectProps) {
  return (
    <label className="block">
      {label && <div className="mb-1 text-sm text-white/80">{label}</div>}
      <select
        className={cn(
          "w-full rounded-xl bg-bg-800 border border-white/10 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent-500/60",
          error ? "border-red-500/60 focus:ring-red-500/40" : "",
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error ? <div className="mt-1 text-sm text-red-400">{error}</div> : hint ? <div className="mt-1 text-sm text-white/50">{hint}</div> : null}
    </label>
  );
}
