"use client";

export type ToastPayload = {
  title?: string;
  message?: string;
  image_url?: string | null;
  variant?: string | null;
  price?: number;
  qty?: number;
  duration?: number;
  intent?: "success" | "error";
  action?: {
    label: string;
    href: string;
  };
};

export function toast(input: string | ToastPayload) {
  if (typeof window === "undefined") return;
  const payload: ToastPayload =
    typeof input === "string" ? { message: input } : input;

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(20);
  }

  window.dispatchEvent(new CustomEvent("app-toast", { detail: payload }));
}
