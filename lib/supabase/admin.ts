import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

// Server-only client for webhooks & privileged operations.
// Never expose this key to the browser.
export function supabaseAdmin() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRole, { auth: { persistSession: false } });
}
