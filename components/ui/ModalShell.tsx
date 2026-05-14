"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

type ModalWidth = "md" | "lg" | "xl" | "2xl";

const widthClass: Record<ModalWidth, string> = {
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
  "2xl": "max-w-6xl",
};

export type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  width?: ModalWidth;
  bodyClassName?: string;
  contentClassName?: string;
};

export function ModalShell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  headerActions,
  width = "lg",
  bodyClassName,
  contentClassName,
}: ModalShellProps) {
  React.useEffect(() => {
    if (!open) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-black/72 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8"
      onClick={onClose}
    >
      <div
        className={cn(
          "mx-auto flex min-h-[calc(100vh-2rem)] items-center justify-center sm:min-h-[calc(100vh-4rem)]",
          widthClass[width]
        )}
      >
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(17,17,20,0.96),rgba(11,11,14,0.99))] shadow-[0_30px_80px_rgba(0,0,0,0.42)]",
            "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(217,106,43,0.08),transparent_26%)] before:content-['']",
            contentClassName
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="relative flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0">
              <div className="text-lg font-semibold tracking-[-0.02em] text-white sm:text-[1.35rem]">
                {title}
              </div>
              {description ? (
                <div className="mt-1 max-w-3xl text-sm text-white/60">{description}</div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {headerActions}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-10 w-10 rounded-full p-0"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className={cn("relative max-h-[calc(100vh-11rem)] overflow-y-auto px-5 py-4 sm:px-6 sm:py-5", bodyClassName)}>
            {children}
          </div>

          {footer ? (
            <div className="relative border-t border-white/10 px-5 py-4 sm:px-6">{footer}</div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
