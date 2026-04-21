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
const AUTH_RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeStorageGet(
  storage: Storage | undefined,
  key: string
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(
  storage: Storage | undefined,
  key: string,
  value: string
) {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage failures in restrictive browsers.
  }
}

function safeStorageRemove(storage: Storage | undefined, key: string) {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage failures in restrictive browsers.
  }
}

async function resilientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  const fetchImpl =
    typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;
  if (!fetchImpl) {
    throw new Error("Fetch is unavailable in this environment.");
  }

  const urlText = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
  const isAuthRequest = urlText.includes("/auth/v1/");
  const maxAttempts = isAuthRequest ? 3 : 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(input, init);
      if (
        isAuthRequest &&
        AUTH_RETRYABLE_STATUS.has(response.status) &&
        attempt < maxAttempts
      ) {
        await sleep(250 * attempt);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (!isAuthRequest || attempt >= maxAttempts) {
        throw error;
      }
      await sleep(250 * attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Request failed.");
}

function getActiveStorage() {
  if (typeof window === "undefined") return undefined;
  const remember = safeStorageGet(window.localStorage, REMEMBER_ME_KEY) === "true";
  if (remember) return window.localStorage;
  try {
    return window.sessionStorage;
  } catch {
    return window.localStorage;
  }
}

const authStorage = {
  getItem: (key: string) => {
    const store = getActiveStorage();
    return safeStorageGet(store, key);
  },
  setItem: (key: string, value: string) => {
    const store = getActiveStorage();
    safeStorageSet(store, key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === "undefined") return;
    safeStorageRemove(window.localStorage, key);
    safeStorageRemove(window.sessionStorage, key);
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
  global: {
    fetch: resilientFetch,
  },
});
