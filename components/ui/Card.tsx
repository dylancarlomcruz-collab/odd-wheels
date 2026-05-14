import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "card relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(17,17,20,0.92),rgba(12,12,15,0.98))] shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-sm",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-[1.6rem] before:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_30%)] before:content-['']",
        "after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-accent-500/40 after:to-transparent after:content-['']",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "card-header relative rounded-t-[1.6rem] border-b border-white/10 bg-bg-950/30 px-5 py-4 sm:px-6 sm:py-5 backdrop-blur-sm",
        className
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card-body px-5 py-4 sm:px-6 sm:py-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("card-footer border-t border-white/10 px-5 py-4 sm:px-6 sm:py-5", className)}
      {...props}
    />
  );
}
