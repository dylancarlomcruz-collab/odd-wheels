"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// IMPORTANT:
// In Next.js, client-side env vars must be referenced statically
// (process.env.NEXT_PUBLIC_...) or they won't be inlined into the bundle.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseReady = Boolean(url && anon);

// Keep a safe fallback so the app doesn't crash during hydration,
// but now it will correctly use real env vars when set.
const safeUrl = url || "http://localhost:54321";
const safeAnon = anon || "public-anon-key-placeholder";

export const supabase: SupabaseClient = createClient(safeUrl, safeAnon);
