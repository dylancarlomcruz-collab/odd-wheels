"use client";

import * as React from "react";
import Link from "next/link";
import { formatPHP } from "@/lib/money";
import type { ToastPayload } from "@/components/ui/toast";

type ToastItem = ToastPayload & { id: string };

const AUTO_DISMISS_MS = 2500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const timers = React.useRef(
    new Map<
      string,
      { timeoutId: number | null; startedAt: number; remaining: number }
    >()
  );

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer?.timeoutId) window.clearTimeout(timer.timeoutId);
    timers.current.delete(id);
  }, []);

  const scheduleRemove = React.useCallback(
    (id: string, duration = AUTO_DISMISS_MS) => {
      const startedAt = Date.now();
      const timeoutId = window.setTimeout(() => removeToast(id), duration);
      timers.current.set(id, { timeoutId, startedAt, remaining: duration });
    },
    [removeToast]
  );

  React.useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastPayload>).detail ?? {};
      const id = crypto.randomUUID();
      const toast: ToastItem = { id, ...detail };
      setToasts((prev) => [...prev, toast]);
      scheduleRemove(id, detail.duration ?? AUTO_DISMISS_MS);
    };

    window.addEventListener("app-toast", onToast as EventListener);
    return () => window.removeEventListener("app-toast", onToast as EventListener);
  }, [scheduleRemove]);

  function onPause(id: string) {
    const timer = timers.current.get(id);
    if (!timer) return;
    const elapsed = Date.now() - timer.startedAt;
    const remaining = Math.max(0, timer.remaining - elapsed);
    if (timer.timeoutId) window.clearTimeout(timer.timeoutId);
    timers.current.set(id, { timeoutId: null, startedAt: Date.now(), remaining });
  }

  function onResume(id: string) {
    const timer = timers.current.get(id);
    if (!timer || timer.remaining <= 0) return;
    const timeoutId = window.setTimeout(() => removeToast(id), timer.remaining);
    timers.current.set(id, {
      timeoutId,
      startedAt: Date.now(),
      remaining: timer.remaining,
    });
  }

  return (
    <>
      {children}

      {toasts.length ? (
        <div className="pointer-events-none fixed top-16 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-[440px] -translate-x-1/2 space-y-3">
          {toasts.map((t) => {
            const priceLabel =
              typeof t.price === "number" ? formatPHP(t.price) : null;
            const qtyLabel =
              typeof t.qty === "number" ? `Qty ${t.qty}` : null;
            const meta = [t.variant, qtyLabel, priceLabel]
              .filter(Boolean)
              .join(" • ");

            return (
              <div
                key={t.id}
                role="status"
                aria-live="polite"
                aria-atomic="true"
                onMouseEnter={() => onPause(t.id)}
                onMouseLeave={() => onResume(t.id)}
                className={[
                  "pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur transition",
                  "bg-neutral-950/90 text-neutral-100 border-neutral-500/40",
                  t.intent === "error"
                    ? "border-red-400/50 bg-red-950/60"
                    : "",
                ].join(" ")}
              >
                <div className="flex gap-3">
                  <div className="h-14 w-14 overflow-hidden rounded-xl border border-neutral-700/60 bg-bg-800/60 flex-shrink-0">
                    {t.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.image_url}
                        alt={t.title ?? "Added item"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-xs text-neutral-400">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-semibold truncate">
                      {t.title ?? t.message ?? "Updated"}
                    </div>
                    {t.title && t.message ? (
                      <div className="text-sm text-neutral-300">{t.message}</div>
                    ) : null}
                    {meta ? (
                      <div className="text-xs text-neutral-300">{meta}</div>
                    ) : null}

                    {t.action?.href ? (
                      <div className="pt-1">
                        <Link
                          href={t.action.href}
                          className="inline-flex items-center rounded-full bg-neutral-800/70 px-3 py-1 text-xs font-semibold text-neutral-100 hover:bg-neutral-700/80"
                          onClick={() => removeToast(t.id)}
                        >
                          {t.action.label}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
