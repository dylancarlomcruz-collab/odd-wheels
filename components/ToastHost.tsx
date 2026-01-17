"use client";

import * as React from "react";

type ToastItem = { id: string; message: string };

export function ToastHost() {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    const onToast = (e: any) => {
      const message = String(e?.detail?.message ?? "").trim();
      if (!message) return;

      const id = crypto.randomUUID();
      setItems((prev) => [...prev, { id, message }]);

      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id));
      }, 1600);
    };

    window.addEventListener("app-toast", onToast as any);
    return () => window.removeEventListener("app-toast", onToast as any);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-[9999] space-y-2">
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-none rounded-xl border border-white/10 bg-black/70 px-4 py-2 text-sm text-white shadow"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
