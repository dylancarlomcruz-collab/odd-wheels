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
      <label className="block">
        {label ? (
          <div className="mb-1 text-sm text-white/80">{label}</div>
        ) : null}
        <input
          ref={ref}
          className={cn(
            "w-full rounded-xl bg-bg-800 border border-white/10 px-4 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-accent-500/60",
            error ? "border-red-500/60 focus:ring-red-500/40" : "",
            className
          )}
          {...props}
        />
        {error ? (
          <div className="mt-1 text-sm text-red-400">{error}</div>
        ) : hint ? (
          <div className="mt-1 text-sm text-white/50">{hint}</div>
        ) : null}
      </label>
    );
  }
);

Input.displayName = "Input";
