import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full bg-paper/5 border border-white/10 px-3 py-1 text-xs text-white/80", className)}
      {...props}
    />
  );
}

