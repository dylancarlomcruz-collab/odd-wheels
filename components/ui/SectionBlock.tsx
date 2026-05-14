import * as React from "react";
import { cn } from "@/lib/utils";

type SectionBlockProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function SectionBlock({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: SectionBlockProps) {
  return (
    <section className={cn("surface-panel relative overflow-hidden p-4 sm:p-5", className)}>
      {title || description || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? (
              <div className="text-sm font-semibold tracking-[-0.01em] text-white sm:text-base">
                {title}
              </div>
            ) : null}
            {description ? (
              <div className="mt-1 text-sm text-white/58">{description}</div>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
