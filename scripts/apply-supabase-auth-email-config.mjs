import { buildSupabaseAuthEmailConfig } from "./lib/supabase-auth-email-config.mjs";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveProjectRef() {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicit) return explicit;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "Missing SUPABASE_PROJECT_REF and NEXT_PUBLIC_SUPABASE_URL. Set one of them first."
    );
  }

  const host = new URL(url).hostname;
  const ref = host.split(".")[0]?.trim();
  if (!ref) {
    throw new Error("Could not derive project ref from NEXT_PUBLIC_SUPABASE_URL.");
  }
  return ref;
}

async function main() {
  const accessToken = requireEnv("SUPABASE_ACCESS_TOKEN");
  const projectRef = resolveProjectRef();
  const payload = buildSupabaseAuthEmailConfig();

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase API request failed (${response.status}): ${text}`);
  }

  process.stdout.write(`Updated auth email templates for project ${projectRef}.\n`);
  if (text) {
    process.stdout.write(`${text}\n`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
