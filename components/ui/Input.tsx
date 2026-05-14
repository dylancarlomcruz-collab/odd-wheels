"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, ...props }, ref) => {
    return (
      <label className="block space-y-1.5">
        {label ? (
          <div className="text-[0.72rem] font-medium uppercase tracking-[0.12em] text-white/58">
            {label}
          </div>
        ) : null}
        <input
          ref={ref}
          className={cn(
            "w-full rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] px-4 py-2.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-accent-500/45",
            error ? "border-red-500/60 focus:ring-red-500/40" : "",
            className
          )}
          {...props}
        />
        {error ? (
          <div className="text-sm text-red-400">{error}</div>
        ) : hint ? (
          <div className="text-sm text-white/50">{hint}</div>
        ) : null}
      </label>
    );
  }
);

Input.displayName = "Input";
