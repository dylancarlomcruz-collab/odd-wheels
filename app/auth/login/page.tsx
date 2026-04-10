"use client";

import * as React from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useRouter, useSearchParams } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { Checkbox } from "@/components/ui/Checkbox";
import { REMEMBER_ME_KEY, SUPABASE_AUTH_STORAGE_KEY } from "@/lib/supabase/browser";

function formatLoginError(message: string) {
  const lower = message.toLowerCase();
  if (
    lower.includes("email not confirmed") ||
    lower.includes("email not verified") ||
    lower.includes("email_not_confirmed")
  ) {
    return "Your email is not verified yet. Please verify your email before logging in, and check your spam/junk folder if you cannot find the verification email in your inbox.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("fetch failed") ||
    lower.includes("authretryablefetcherror")
  ) {
    return "Login could not reach Supabase right now. Please try again in a few seconds. If it keeps happening, hard refresh the page and try once more.";
  }
  return message;
}

function LoginContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const redirectParam = sp.get("redirect");
  const redirectTo =
    redirectParam && redirectParam.startsWith("/") ? redirectParam : "/";
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(REMEMBER_ME_KEY);
    if (stored === "true") setRememberMe(true);
    if (stored === "false") setRememberMe(false);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured. Fill .env.local first.");
      return;
    }

    if (!supabase) {
      setError("Supabase client not initialized. Check .env.local and restart dev server.");
      return;
    }

    setLoading(true);
    const emailValue = email.trim();

    if (typeof window !== "undefined") {
      window.localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? "true" : "false");
      if (rememberMe) {
        window.sessionStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
      } else {
        window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
      }
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailValue,
        password,
      });
      setLoading(false);

      if (error) {
        setError(formatLoginError(error.message));
        return;
      }

      router.replace(redirectTo);
    } catch (error: any) {
      setLoading(false);
      setError(formatLoginError(String(error?.message ?? "Failed to fetch")));
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Login</div>
          <div className="text-sm text-white/60">Login to checkout.</div>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
            />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

            <div className="flex items-center justify-between">
              <Checkbox
                checked={rememberMe}
                onChange={setRememberMe}
                label="Remember me"
              />
              <Link
                href={`/auth/reset?email=${encodeURIComponent(email.trim())}`}
                className="text-sm text-accent-700 hover:underline dark:text-accent-200"
              >
                Forgot password?
              </Link>
            </div>

            {error ? <div className="text-sm text-red-400">{error}</div> : null}

            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </Button>

            <div className="text-sm text-white/60">
              No account?{" "}
              <Link
                href={`/auth/register?redirect=${encodeURIComponent(
                  redirectTo
                )}`}
                className="text-accent-700 hover:underline dark:text-accent-200"
              >
                Create one
              </Link>
            </div>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <main className="mx-auto max-w-md px-4 py-10 text-white/60">
          Loading...
        </main>
      }
    >
      <LoginContent />
    </React.Suspense>
  );
}
