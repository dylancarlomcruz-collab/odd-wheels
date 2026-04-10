"use client";

import { supabase } from "@/lib/supabase/browser";

const ACCESS_TOKEN_REFRESH_WINDOW_MS = 60_000;

async function getActiveSession() {
  const { data, error } = await supabase.auth.getSession();
  let session = data.session ?? null;

  const expiresSoon =
    typeof session?.expires_at === "number" &&
    session.expires_at * 1000 <= Date.now() + ACCESS_TOKEN_REFRESH_WINDOW_MS;

  if (error || !session || expiresSoon) {
    const { data: refreshed, error: refreshError } =
      await supabase.auth.refreshSession();
    if (refreshError) {
      throw refreshError;
    }
    session = refreshed.session ?? null;
  }

  return session;
}

export async function getAccessToken() {
  const session = await getActiveSession();
  return session?.access_token ?? "";
}

export async function fetchJson<T>(
  input: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(
      payload?.error ?? `Request failed with status ${response.status}.`
    );
  }

  return payload as T;
}

export async function fetchAuthedJson<T>(
  input: string,
  init: RequestInit = {},
  retryOnUnauthorized = true
): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Please sign in again.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    return await fetchJson<T>(input, {
      ...init,
      headers,
    });
  } catch (error: any) {
    if (
      retryOnUnauthorized &&
      String(error?.message ?? "").toLowerCase() === "unauthorized"
    ) {
      const { data: refreshed, error: refreshError } =
        await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session?.access_token) {
        throw error;
      }
      return fetchAuthedJson<T>(input, init, false);
    }

    throw error;
  }
}
