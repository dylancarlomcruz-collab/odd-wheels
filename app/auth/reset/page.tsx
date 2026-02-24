"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { isSupabaseConfigured } from "@/lib/env";

function detectRecoveryFromUrl() {
  if (typeof window === "undefined") return false;
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);
  return hashParams.get("type") === "recovery" || queryParams.get("type") === "recovery";
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = React.useState<"request" | "update">(() =>
    detectRecoveryFromUrl() ? "update" : "request"
  );
  const [email, setEmail] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    const nextEmail = searchParams.get("email") ?? "";
    if (!nextEmail) return;
    setEmail((prev) => prev || nextEmail);
  }, [searchParams]);

  React.useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("update");
        setError(null);
        setNotice("Recovery link accepted. Set your new password.");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSendReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured. Fill .env.local first.");
      return;
    }

    if (!supabase) {
      setError("Supabase client not initialized. Check .env.local and restart dev server.");
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }

    const redirectTo =
      typeof window === "undefined"
        ? "https://www.odd-wheels.com/auth/reset"
        : `${window.location.origin}/auth/reset`;

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo,
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setNotice(
      "Password reset email sent. Check your inbox, then your spam/junk folder if it is not visible."
    );
  }

  async function onUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured. Fill .env.local first.");
      return;
    }

    if (!supabase) {
      setError("Supabase client not initialized. Check .env.local and restart dev server.");
      return;
    }

    const nextPassword = newPassword.trim();
    if (nextPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (nextPassword !== confirmPassword.trim()) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: nextPassword,
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await supabase.auth.signOut();
    setNewPassword("");
    setConfirmPassword("");
    setNotice("Password updated. Redirecting to login...");
    window.setTimeout(() => {
      router.replace("/auth/login");
    }, 900);
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Reset password</div>
          <div className="text-sm text-white/60">
            {mode === "request"
              ? "Send a reset link to your email."
              : "Enter your new password to finish recovery."}
          </div>
        </CardHeader>
        <CardBody>
          {mode === "request" ? (
            <form onSubmit={onSendReset} className="space-y-4">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              {error ? <div className="text-sm text-red-400">{error}</div> : null}
              {notice ? <div className="text-sm text-emerald-400">{notice}</div> : null}

              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </Button>

              <div className="text-sm text-white/60">
                Opened your reset email already?{" "}
                <button
                  type="button"
                  className="text-accent-700 hover:underline dark:text-accent-200"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setMode("update");
                  }}
                >
                  Set new password
                </button>
              </div>
              <div className="text-sm text-white/60">
                Back to{" "}
                <Link
                  href="/auth/login"
                  className="text-accent-700 hover:underline dark:text-accent-200"
                >
                  Login
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={onUpdatePassword} className="space-y-4">
              <Input
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                hint="Use at least 8 characters."
              />
              <Input
                label="Confirm new password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />

              {error ? <div className="text-sm text-red-400">{error}</div> : null}
              {notice ? <div className="text-sm text-emerald-400">{notice}</div> : null}

              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Updating..." : "Update password"}
              </Button>

              <div className="text-sm text-white/60">
                Need a new email link?{" "}
                <button
                  type="button"
                  className="text-accent-700 hover:underline dark:text-accent-200"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setMode("request");
                  }}
                >
                  Send another link
                </button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense
      fallback={
        <main className="mx-auto max-w-md px-4 py-10 text-white/60">
          Loading...
        </main>
      }
    >
      <ResetPasswordContent />
    </React.Suspense>
  );
}
