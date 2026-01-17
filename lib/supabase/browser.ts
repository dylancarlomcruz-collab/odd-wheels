"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// IMPORTANT:
// In Next.js, client-side env vars must be referenced statically
// (process.env.NEXT_PUBLIC_...) or they won't be inlined into the bundle.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseReady = Boolean(url && anon);

export const SUPABASE_AUTH_STORAGE_KEY = "oddwheels-auth";
export const REMEMBER_ME_KEY = "oddwheels-remember";

// Keep a safe fallback so the app doesn't crash during hydration,
// but now it will correctly use real env vars when set.
const safeUrl = url || "http://localhost:54321";
const safeAnon = anon || "public-anon-key-placeholder";

function getActiveStorage() {
  if (typeof window === "undefined") return undefined;
  const remember = window.localStorage.getItem(REMEMBER_ME_KEY) === "true";
  return remember ? window.localStorage : window.sessionStorage;
}

const authStorage = {
  getItem: (key: string) => {
    const store = getActiveStorage();
    return store ? store.getItem(key) : null;
  },
  setItem: (key: string, value: string) => {
    const store = getActiveStorage();
    if (store) store.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }
};

export const supabase: SupabaseClient = createClient(safeUrl, safeAnon, {
  auth: {
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
