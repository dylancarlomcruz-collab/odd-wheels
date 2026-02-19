"use client";

import * as React from "react";

export type AdminViewMode = "admin" | "customer";

const STORAGE_KEY = "oddwheels:admin-view-mode";
const MODE_EVENT = "oddwheels:admin-view-mode";

function normalizeMode(value: unknown): AdminViewMode {
  return value === "customer" ? "customer" : "admin";
}

export function useAdminViewMode(isAdminUser: boolean) {
  const [mode, setModeState] = React.useState<AdminViewMode>(
    isAdminUser ? "admin" : "customer"
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isAdminUser) {
      setModeState("customer");
      return;
    }

    const stored = normalizeMode(window.localStorage.getItem(STORAGE_KEY));
    setModeState(stored);
  }, [isAdminUser]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      if (!isAdminUser) return;
      setModeState(normalizeMode(event.newValue));
    };

    const onModeEvent = (event: Event) => {
      if (!isAdminUser) return;
      const detail = (event as CustomEvent<AdminViewMode>).detail;
      setModeState(normalizeMode(detail));
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(MODE_EVENT, onModeEvent);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MODE_EVENT, onModeEvent);
    };
  }, [isAdminUser]);

  const setMode = React.useCallback(
    (next: AdminViewMode) => {
      if (typeof window === "undefined" || !isAdminUser) return;
      const normalized = normalizeMode(next);
      window.localStorage.setItem(STORAGE_KEY, normalized);
      setModeState(normalized);
      window.dispatchEvent(
        new CustomEvent<AdminViewMode>(MODE_EVENT, { detail: normalized })
      );
    },
    [isAdminUser]
  );

  const effectiveMode: AdminViewMode = isAdminUser ? mode : "customer";
  const isAdminMode = isAdminUser && effectiveMode === "admin";

  return { mode: effectiveMode, setMode, isAdminMode };
}

