import { buildSupabaseAuthEmailConfig } from "./lib/supabase-auth-email-config.mjs";

process.stdout.write(`${JSON.stringify(buildSupabaseAuthEmailConfig(), null, 2)}\n`);
