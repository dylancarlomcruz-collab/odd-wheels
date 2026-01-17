"use client";

import * as React from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
    const id = identifier.trim();
    let email = id;
    if (!id.includes("@")) {
      const r = await fetch("/api/auth/resolve-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: id })
      });
      const j = await r.json();
      if (!j.ok || !j.email) {
        setLoading(false);
        setError(j.error ?? "Unable to find account for that username/phone.");
        return;
      }
      email = j.email;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.replace("/");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Login</div>
          <div className="text-sm text-white/60">Login to add to cart and checkout.</div>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              label="Email / Username / Phone"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

            {error ? <div className="text-sm text-red-400">{error}</div> : null}

            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </Button>

            <div className="text-sm text-white/60">
              No account?{" "}
              <Link
                href="/auth/register"
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
