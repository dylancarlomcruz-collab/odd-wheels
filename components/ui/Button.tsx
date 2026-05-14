"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    "border border-accent-300/20 bg-[linear-gradient(180deg,rgba(229,120,51,0.96),rgba(195,91,31,0.98))] text-white shadow-[0_14px_34px_rgba(217,106,43,0.22)] hover:brightness-[1.05]",
  secondary:
    "border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] text-white shadow-[0_10px_24px_rgba(0,0,0,0.14)] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05))]",
  ghost:
    "border border-white/10 bg-transparent text-white/86 hover:bg-white/[0.05] hover:text-white",
  danger:
    "border border-red-400/20 bg-[linear-gradient(180deg,rgba(220,38,38,0.95),rgba(185,28,28,0.98))] text-white shadow-[0_14px_30px_rgba(127,29,29,0.2)] hover:brightness-[1.04]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[0.95rem]",
};

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-medium tracking-[-0.01em] transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-950 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

