"use client";

import * as React from "react";

type Toast = { id: string; message: string };

const ToastCtx = React.createContext<{
  push: (message: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const push = React.useCallback((message: string) => {
    const id = crypto.randomUUID();
    setToasts((p) => [...p, { id, message }]);
    window.setTimeout(() => {
      setToasts((p) => p.filter((t) => t.id !== id));
    }, 1600);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}

      {/* toasts */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-white/10 bg-black/70 px-4 py-2 text-sm text-white shadow-lg backdrop-blur"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
